package math

import (
	"fmt"

	pb "endurance-hub/analytics/internal/infra/pb"
)

const (
	terrainWindowSec     = 30  // wall-clock seconds per scan window
	terrainMinHRDelta    = 3
	terrainMinAltRange   = 1.0  // metres
	terrainSeverityFullM = 15.0 // 15m gain in 30s saturates severity at 1.0
)

type TerrainAnalyzer struct{}

func NewTerrainAnalyzer() *TerrainAnalyzer { return &TerrainAnalyzer{} }

func (TerrainAnalyzer) Name() string { return "terrain" }

// Analyze finds the 30-second time-based window with the largest positive
// altitude gain AND a meaningful HR rise. Horizontal distance is integrated
// using actual per-sample dt so peak_grade_pct is correct on decimated data.
func (TerrainAnalyzer) Analyze(req *pb.InsightsRequest) (*pb.ActivityInsight, error) {
	n, ok := streamsAligned(req)
	if !ok || n < 2 {
		return nil, nil
	}
	tm := req.GetTimeStream()
	alt := req.GetAltitudeStream()
	hr := req.GetHrStream()
	vel := req.GetVelocityStream()

	if tm[n-1]-tm[0] < terrainWindowSec {
		return nil, nil
	}

	// Cheap "terrain is actually varied" guard.
	minA, maxA := alt[0], alt[0]
	for _, a := range alt {
		if a < minA {
			minA = a
		}
		if a > maxA {
			maxA = a
		}
	}
	if float64(maxA-minA) < terrainMinAltRange {
		return nil, nil
	}

	var (
		bestGain    float64 = 0
		bestStart   int
		bestPeakIdx int
		bestHRDelta int32
		bestDistM   float64
		found       bool
	)

	end := 0
	for start := 0; start < n; start++ {
		if end < start {
			end = start
		}
		for end < n && tm[end]-tm[start] < terrainWindowSec {
			end++
		}
		if end >= n {
			break
		}

		gain := float64(alt[end] - alt[start])
		if gain <= 0 {
			continue
		}
		hrDelta := hr[end] - hr[start]
		if hrDelta < terrainMinHRDelta {
			continue
		}

		// Find altitude apex inside the window and integrate dt-aware distance.
		peakIdx := start
		peakAlt := alt[start]
		var distM float64
		for i := start; i <= end; i++ {
			if alt[i] > peakAlt {
				peakAlt = alt[i]
				peakIdx = i
			}
			if i > start {
				dt := float64(tm[i] - tm[i-1])
				if dt > 0 {
					distM += float64(vel[i]) * dt
				}
			}
		}

		if gain > bestGain {
			bestGain = gain
			bestStart = start
			bestPeakIdx = peakIdx
			bestHRDelta = hrDelta
			bestDistM = distM
			found = true
		}
	}

	if !found {
		return nil, nil
	}

	severity := clamp01(bestGain / terrainSeverityFullM)
	gradePct := 0.0
	if bestDistM > 0 {
		gradePct = round2(bestGain / bestDistM * 100)
	}
	pointTime := tm[bestPeakIdx]

	return &pb.ActivityInsight{
		Type:             "TERRAIN",
		Summary:          fmt.Sprintf("Steepest climb peaking at %s (+%.1fm, HR +%d bpm).", formatMMSS(pointTime), bestGain, bestHRDelta),
		SeverityScore:    severity,
		PointTimeSeconds: pointTime,
		Metadata: map[string]string{
			"altitude_gain_m":     fmt.Sprintf("%.1f", bestGain),
			"hr_delta_bpm":        fmt.Sprintf("%d", bestHRDelta),
			"peak_grade_pct":      fmt.Sprintf("%.2f", gradePct),
			"window_duration_sec": fmt.Sprintf("%d", terrainWindowSec),
			"window_start_sec":    fmt.Sprintf("%d", tm[bestStart]),
		},
	}, nil
}
