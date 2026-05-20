package ai

import (
	"strings"

	pb "endurance-hub/analytics/internal/infra/pb"
)

// GenerateHolisticNarrative is the placeholder for the LLM-backed narrative
// synthesis layer. The real version will prompt a model with the structured
// insights and produce coaching prose; for now it just lists the insight
// types it received so callers can verify the pipeline result reached here.
func GenerateHolisticNarrative(insights []*pb.ActivityInsight) string {
	if len(insights) == 0 {
		return "Mocked AI story: no notable findings for this activity."
	}
	types := make([]string, 0, len(insights))
	for _, i := range insights {
		types = append(types, i.GetType())
	}
	return "Mocked AI story based on: " + strings.Join(types, ", ")
}
