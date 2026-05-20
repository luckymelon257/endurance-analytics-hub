package main

import (
	"context"
	"errors"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"google.golang.org/grpc"

	analyticsgrpc "endurance-hub/analytics/internal/grpc"
	analyticspb "endurance-hub/analytics/internal/infra/pb"
	analyticskafka "endurance-hub/analytics/internal/kafka"

	"golang.org/x/sync/errgroup"
)

func main() {
	httpAddr := envOr("HTTP_ADDR", ":8080")
	grpcAddr := envOr("GRPC_ADDR", ":50051")
	brokers := splitCSV(envOr("KAFKA_BROKERS", "redpanda:9092"))
	consumerGroup := envOr("KAFKA_CONSUMER_GROUP", "analytics-engine")

	log.Println("Analytics Engine Started")

	rootCtx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	g, ctx := errgroup.WithContext(rootCtx)

	httpSrv := &http.Server{
		Addr:              httpAddr,
		Handler:           healthMux(),
		ReadHeaderTimeout: 5 * time.Second,
	}
	g.Go(func() error {
		log.Printf("HTTP listening on %s", httpAddr)
		if err := httpSrv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			return err
		}
		return nil
	})
	g.Go(func() error {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		return httpSrv.Shutdown(shutdownCtx)
	})

	grpcSrv := grpc.NewServer()
	analyticsServer := analyticsgrpc.New()
	analyticspb.RegisterAnalyticsServiceServer(grpcSrv, analyticsServer)
	log.Printf("Analyzer engine registered: %v", analyticsServer.Engine().Names())
	g.Go(func() error {
		lis, err := net.Listen("tcp", grpcAddr)
		if err != nil {
			return err
		}
		log.Printf("gRPC listening on %s", grpcAddr)
		return grpcSrv.Serve(lis)
	})
	g.Go(func() error {
		<-ctx.Done()
		grpcSrv.GracefulStop()
		return nil
	})

	consumer := analyticskafka.NewActivitySyncedConsumer(brokers, consumerGroup)
	g.Go(func() error {
		return consumer.Run(ctx)
	})
	g.Go(func() error {
		<-ctx.Done()
		return consumer.Close()
	})

	if err := g.Wait(); err != nil {
		log.Fatalf("server exited: %v", err)
	}
	log.Println("shutdown complete")
}

func healthMux() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	return mux
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func splitCSV(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if t := strings.TrimSpace(p); t != "" {
			out = append(out, t)
		}
	}
	return out
}
