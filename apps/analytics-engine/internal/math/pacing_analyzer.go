package math

import pb "endurance-hub/analytics/internal/infra/pb"

type PacingAnalyzer struct{}

func NewPacingAnalyzer() *PacingAnalyzer { return &PacingAnalyzer{} }

func (PacingAnalyzer) Name() string { return "pacing" }

func (PacingAnalyzer) Analyze(_ *pb.InsightsRequest) (*pb.ActivityInsight, error) {
	return &pb.ActivityInsight{
		Type:          "PACING_PENALTY",
		Summary:       "Uneven pacing detected",
		SeverityScore: 0.62,
		Metadata: map[string]string{
			"time_lost_sec": "135",
		},
	}, nil
}
