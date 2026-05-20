package math

import (
	"fmt"

	pb "endurance-hub/analytics/internal/infra/pb"
)

const (
	decouplingWindowSec      = 60   // wall-clock seconds per scan window
	decouplingBaselineRatio  = 0.25 // baseline = first 25% of total elapsed time
	decouplingDropThreshold  = 0.95
	decouplingMinTotalSec    = 120  // need ~baseline + at least one full window
	decouplingMinWindowValid = 2    // need at least N valid samples in a window to trust the mean
)

type DecouplingAnalyzer struct{}

func NewDecouplingAnalyzer() *DecouplingAnalyzer { return &DecouplingAnalyzer{} }

func (DecouplingAnalyzer) Name() string { return "decoupling" }

// Analyze walks a 60-second time-based sliding window over EF = velocity/HR
// after deriving a baseline from the first 25% of elapsed time. Returns the
// first window whose mean EF drops more than 5% below baseline.
func (DecouplingAnalyzer) Analyze(req *pb.InsightsRequest) (*pb.ActivityInsight, error) {
	n, ok := streamsAligned(req)
	if !ok || n < 2 {
		return nil, nil
	}
	tm := req.GetTimeStream()
	vel := req.GetVelocityStream()
	hr := req.GetHrStream()

	totalElapsed := tm[n-1] - tm[0]
	if totalElapsed < decouplingMinTotalSec {
		return nil, nil
	}

	// EF per sample; treat zero HR or zero velocity as a missing sample.
	ef := make([]float64, n)
	valid := make([]bool, n)
	for i := 0; i < n; i++ {
		if hr[i] <= 0 || vel[i] <= 0 {
			continue
		}
		ef[i] = float64(vel[i]) / float64(hr[i])
		valid[i] = true
	}

	// Baseline: mean EF over samples whose time is within the first 25%
	// of the total elapsed time.
	baselineCutoff := tm[0] + int32(float64(totalElapsed)*decouplingBaselineRatio)
	baselineEndIdx := 0
	for baselineEndIdx < n && tm[baselineEndIdx] <= baselineCutoff {
		baselineEndIdx++
	}
	if baselineEndIdx < decouplingMinWindowValid {
		return nil, nil
	}

	var baseSum float64
	var baseN int
	for i := 0; i < baselineEndIdx; i++ {
		if valid[i] {
			baseSum += ef[i]
			baseN++
		}
	}
	if baseN < decouplingMinWindowValid {
		return nil, nil
	}
	baselineEF := baseSum / float64(baseN)
	threshold := baselineEF * decouplingDropThreshold

	// Two-pointer time-based scan: end is monotonically non-decreasing.
	end := baselineEndIdx
	for start := baselineEndIdx; start < n; start++ {
		if end < start {
			end = start
		}
		for end < n && tm[end]-tm[start] < decouplingWindowSec {
			end++
		}
		if end >= n {
			break // no further full window fits
		}

		var winSum float64
		var winN int
		for i := start; i <= end; i++ {
			if valid[i] {
				winSum += ef[i]
				winN++
			}
		}
		if winN < decouplingMinWindowValid {
			continue
		}
		windowEF := winSum / float64(winN)
		if windowEF >= threshold {
			continue
		}

		driftPct := round2((baselineEF - windowEF) / baselineEF * 100)
		severity := clamp01(((baselineEF - windowEF) / baselineEF) / 0.10)
		pointTime := tm[start]
		return &pb.ActivityInsight{
			Type:             "AEROBIC_DECOUPLING",
			Summary:          fmt.Sprintf("Cardiac drift detected at %s (%.2f%% drop in efficiency).", formatMMSS(pointTime), driftPct),
			SeverityScore:    severity,
			PointTimeSeconds: pointTime,
			Metadata: map[string]string{
				"drift_pct":           fmt.Sprintf("%.2f", driftPct),
				"baseline_ef":         fmt.Sprintf("%.4f", baselineEF),
				"window_ef":           fmt.Sprintf("%.4f", windowEF),
				"window_duration_sec": fmt.Sprintf("%d", decouplingWindowSec),
			},
		}, nil
	}
	return nil, nil
}
