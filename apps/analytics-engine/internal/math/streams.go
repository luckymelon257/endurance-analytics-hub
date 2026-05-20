package math

import (
	"fmt"
	gomath "math"

	pb "endurance-hub/analytics/internal/infra/pb"
)

// streamsAligned validates that all four telemetry streams are present and
// of equal length. Returns the common length and ok=true, or (0,false) if
// any stream is empty or lengths differ.
func streamsAligned(req *pb.InsightsRequest) (int, bool) {
	t := len(req.GetTimeStream())
	v := len(req.GetVelocityStream())
	h := len(req.GetHrStream())
	a := len(req.GetAltitudeStream())
	if t == 0 || v == 0 || h == 0 || a == 0 {
		return 0, false
	}
	if t != v || t != h || t != a {
		return 0, false
	}
	return t, true
}

func clamp01(x float64) float64 {
	if gomath.IsNaN(x) || x < 0 {
		return 0
	}
	if x > 1 {
		return 1
	}
	return x
}

// round2 rounds to two decimal places for tidy metadata strings.
func round2(x float64) float64 {
	if gomath.IsNaN(x) || gomath.IsInf(x, 0) {
		return 0
	}
	return gomath.Round(x*100) / 100
}

// formatMMSS formats a second count as "m:ss" or "mm:ss".
func formatMMSS(secs int32) string {
	if secs < 0 {
		secs = 0
	}
	m := secs / 60
	s := secs % 60
	return fmt.Sprintf("%d:%02d", m, s)
}
