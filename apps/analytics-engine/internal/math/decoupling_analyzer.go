package math

import pb "endurance-hub/analytics/internal/infra/pb"

type DecouplingAnalyzer struct{}

func NewDecouplingAnalyzer() *DecouplingAnalyzer { return &DecouplingAnalyzer{} }

func (DecouplingAnalyzer) Name() string { return "decoupling" }

func (DecouplingAnalyzer) Analyze(_ *pb.InsightsRequest) (*pb.ActivityInsight, error) {
	return &pb.ActivityInsight{
		Type:          "AEROBIC_DECOUPLING",
		Summary:       "Cardiac drift started at min 40",
		SeverityScore: 0.71,
		Metadata: map[string]string{
			"drift_start_sec": "2400",
		},
	}, nil
}
