package math

import pb "endurance-hub/analytics/internal/infra/pb"

type TerrainAnalyzer struct{}

func NewTerrainAnalyzer() *TerrainAnalyzer { return &TerrainAnalyzer{} }

func (TerrainAnalyzer) Name() string { return "terrain" }

func (TerrainAnalyzer) Analyze(_ *pb.InsightsRequest) (*pb.ActivityInsight, error) {
	return &pb.ActivityInsight{
		Type:          "TERRAIN",
		Summary:       "Pushed too hard on hills",
		SeverityScore: 0.34,
		Metadata: map[string]string{
			"hills_count": "3",
		},
	}, nil
}
