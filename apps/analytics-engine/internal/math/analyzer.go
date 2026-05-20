package math

import (
	"log"

	pb "endurance-hub/analytics/internal/infra/pb"
)

// Analyzer is the strategy contract. Each implementation looks at the
// request and returns either a single insight or nil ("nothing notable
// for this activity"). Returning an error logs and skips the analyzer
// without aborting the pipeline.
type Analyzer interface {
	Name() string
	Analyze(req *pb.InsightsRequest) (*pb.ActivityInsight, error)
}

// Engine holds the registered analyzers and runs them in order.
type Engine struct {
	analyzers []Analyzer
}

func NewEngine(analyzers ...Analyzer) *Engine {
	return &Engine{analyzers: analyzers}
}

// RunAll executes every analyzer in registration order, collecting
// non-nil insights. Individual analyzer errors are logged and skipped so
// one broken model can't blank the whole response.
func (e *Engine) RunAll(req *pb.InsightsRequest) []*pb.ActivityInsight {
	out := make([]*pb.ActivityInsight, 0, len(e.analyzers))
	for _, a := range e.analyzers {
		insight, err := a.Analyze(req)
		if err != nil {
			log.Printf("[Engine] analyzer=%s activity=%s err=%v", a.Name(), req.GetActivityId(), err)
			continue
		}
		if insight != nil {
			out = append(out, insight)
		}
	}
	return out
}

// Names is a convenience for boot logs.
func (e *Engine) Names() []string {
	out := make([]string, len(e.analyzers))
	for i, a := range e.analyzers {
		out[i] = a.Name()
	}
	return out
}
