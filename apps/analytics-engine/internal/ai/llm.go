package ai

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"sort"
	"strings"
	"sync"

	"google.golang.org/genai"

	pb "endurance-hub/analytics/internal/infra/pb"
)

const (
	defaultModel    = "gemini-2.5-flash"
	fallbackText    = "AI Analysis is currently unavailable."
	emptyInsightMsg = "No notable findings for this activity."
)

const promptTemplate = "You are an elite data-driven running coach. Analyze the following performance insights from a runner's recent workout: %s. Combine them into a single, cohesive 3-sentence narrative explaining the cause-and-effect relationship (e.g., how pushing too hard on hills caused cardiac drift later). Keep the tone encouraging, professional, and highly analytical. Do not use markdown."

var (
	clientOnce sync.Once
	client     *genai.Client
	clientErr  error
)

// GenerateHolisticNarrative renders the discrete pipeline insights into a
// cause-and-effect coaching narrative via Gemini. Any error — missing key,
// bad model name, network failure, empty response — returns the fallback
// string alongside the error so the caller can decide whether to surface it.
// Empty insight slices short-circuit before hitting the network.
func GenerateHolisticNarrative(ctx context.Context, insights []*pb.ActivityInsight) (string, error) {
	if len(insights) == 0 {
		return emptyInsightMsg, nil
	}

	c, err := getClient(ctx)
	if err != nil {
		log.Printf("[AI] narrative generation failed (client init): %v", err)
		return fallbackText, err
	}

	model := os.Getenv("GEMINI_MODEL")
	if model == "" {
		model = defaultModel
	}

	prompt := fmt.Sprintf(promptTemplate, formatInsights(insights))

	resp, err := c.Models.GenerateContent(ctx, model, genai.Text(prompt), nil)
	if err != nil {
		log.Printf("[AI] narrative generation failed (model=%s): %v", model, err)
		return fallbackText, err
	}

	text := strings.TrimSpace(resp.Text())
	if text == "" {
		err := errors.New("empty response from model")
		log.Printf("[AI] narrative generation failed (model=%s): %v", model, err)
		return fallbackText, err
	}

	return text, nil
}

func getClient(ctx context.Context) (*genai.Client, error) {
	clientOnce.Do(func() {
		// Passing nil ClientConfig lets the SDK pick up GEMINI_API_KEY from the env.
		client, clientErr = genai.NewClient(ctx, nil)
	})
	return client, clientErr
}

// formatInsights renders the insights as a deterministic bullet list so the
// prompt is stable across calls (Go map iteration order is randomized).
func formatInsights(insights []*pb.ActivityInsight) string {
	var b strings.Builder
	for _, in := range insights {
		fmt.Fprintf(&b, "- [%s] %s (severity %.2f)", in.GetType(), in.GetSummary(), in.GetSeverityScore())

		meta := in.GetMetadata()
		if len(meta) > 0 {
			keys := make([]string, 0, len(meta))
			for k := range meta {
				keys = append(keys, k)
			}
			sort.Strings(keys)
			b.WriteString(" |")
			for _, k := range keys {
				fmt.Fprintf(&b, " %s=%s", k, meta[k])
			}
		}
		b.WriteByte('\n')
	}
	return strings.TrimRight(b.String(), "\n")
}
