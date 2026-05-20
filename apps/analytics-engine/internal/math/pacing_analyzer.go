package math

import (
	"fmt"

	pb "endurance-hub/analytics/internal/infra/pb"
)

const (
	pacingWindowSec      = 60   // wall-clock seconds per scan window
	pacingSurgeThreshold = 1.15 // surge must beat overall mean by at least 15%
	pacingSeverityFull   = 0.30 // 30% excess saturates severity at 1.0
)

type PacingAnalyzer struct{}

func NewPacingAnalyzer() *PacingAnalyzer { return &PacingAnalyzer{} }

func (PacingAnalyzer) Name() string { return "pacing" }

// Analyze finds the 60-second time-based window with the largest mean
// velocity. Emits only if the surge exceeds the activity-wide mean by at
// least 15%. Marker lands on the sample whose time is closest to the
// window's wall-clock midpoint.
func (PacingAnalyzer) Analyze(req *pb.InsightsRequest) (*pb.ActivityInsight, error) {
	n, ok := streamsAligned(req)
	if !ok || n < 2 {
		return nil, nil
	}
	tm := req.GetTimeStream()
	vel := req.GetVelocityStream()

	if tm[n-1]-tm[0] < pacingWindowSec {
		return nil, nil
	}

	// Overall mean over non-zero (running) samples.
	var totalSum float64
	var totalCount int
	for _, v := range vel {
		if v > 0 {
			totalSum += float64(v)
			totalCount++
		}
	}
	if totalCount == 0 {
		return nil, nil
	}
	overallMean := totalSum / float64(totalCount)
	if overallMean <= 0 {
		return nil, nil
	}

	var (
		bestMean             float64 = -1
		bestStart, bestEnd   int
		found                bool
	)

	end := 0
	for start := 0; start < n; start++ {
		if end < start {
			end = start
		}
		for end < n && tm[end]-tm[start] < pacingWindowSec {
			end++
		}
		if end >= n {
			break
		}

		var sum float64
		var count int
		for i := start; i <= end; i++ {
			if vel[i] > 0 {
				sum += float64(vel[i])
				count++
			}
		}
		if count == 0 {
			continue
		}
		mean := sum / float64(count)
		if mean > bestMean {
			bestMean = mean
			bestStart = start
			bestEnd = end
			found = true
		}
	}

	if !found || bestMean < overallMean*pacingSurgeThreshold {
		return nil, nil
	}

	// Marker = first sample at or after the wall-clock midpoint of the window.
	midTime := tm[bestStart] + (tm[bestEnd]-tm[bestStart])/2
	midIdx := bestStart
	for i := bestStart; i <= bestEnd; i++ {
		if tm[i] >= midTime {
			midIdx = i
			break
		}
	}
	pointTime := tm[midIdx]
	excessPct := round2((bestMean - overallMean) / overallMean * 100)
	severity := clamp01(((bestMean - overallMean) / overallMean) / pacingSeverityFull)

	return &pb.ActivityInsight{
		Type:             "PACING_PENALTY",
		Summary:          fmt.Sprintf("Hardest 60-second surge centered at %s (%.1f%% above average pace).", formatMMSS(pointTime), excessPct),
		SeverityScore:    severity,
		PointTimeSeconds: pointTime,
		Metadata: map[string]string{
			"surge_mean_velocity_ms":   fmt.Sprintf("%.2f", bestMean),
			"overall_mean_velocity_ms": fmt.Sprintf("%.2f", overallMean),
			"excess_pct":               fmt.Sprintf("%.2f", excessPct),
			"window_duration_sec":      fmt.Sprintf("%d", pacingWindowSec),
		},
	}, nil
}
