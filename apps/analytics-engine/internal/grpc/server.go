package grpc

import (
	"context"
	"log"

	"endurance-hub/analytics/internal/ai"
	analyticspb "endurance-hub/analytics/internal/infra/pb"
	"endurance-hub/analytics/internal/math"
)

type AnalyticsServer struct {
	analyticspb.UnimplementedAnalyticsServiceServer
	engine *math.Engine
}

// New builds an AnalyticsServer with the default analyzer engine. The engine
// is constructed here so cmd/server only knows about the gRPC type, but it
// can also be swapped via NewWithEngine for tests or future custom wiring.
func New() *AnalyticsServer {
	return NewWithEngine(math.NewEngine(
		math.NewPacingAnalyzer(),
		math.NewDecouplingAnalyzer(),
		math.NewTerrainAnalyzer(),
	))
}

func NewWithEngine(engine *math.Engine) *AnalyticsServer {
	return &AnalyticsServer{engine: engine}
}

func (s *AnalyticsServer) Engine() *math.Engine { return s.engine }

func (s *AnalyticsServer) GetActivityInsights(
	_ context.Context,
	req *analyticspb.InsightsRequest,
) (*analyticspb.InsightsResponse, error) {
	log.Printf("[gRPC] GetActivityInsights activity_id=%s user_id=%s", req.GetActivityId(), req.GetUserId())

	insights := s.engine.RunAll(req)
	narrative := ai.GenerateHolisticNarrative(insights)

	return &analyticspb.InsightsResponse{
		ActivityId:           req.GetActivityId(),
		CombinedAiNarrative:  narrative,
		DiscreteInsights:     insights,
		PacingChartData:      mockPacingChart(),
	}, nil
}

// mockPacingChart fills the visual-graph field until a real chart producer
// is wired in (probably from the pacing analyzer once it loads streams).
func mockPacingChart() []*analyticspb.PacePoint {
	return []*analyticspb.PacePoint{
		{TimeSeconds: 0, RealPace: 5.10, PredictedPace: 5.05},
		{TimeSeconds: 600, RealPace: 5.25, PredictedPace: 5.12},
		{TimeSeconds: 1200, RealPace: 5.42, PredictedPace: 5.18},
	}
}
