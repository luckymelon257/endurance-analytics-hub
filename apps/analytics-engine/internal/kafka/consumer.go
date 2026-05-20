package kafka

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"

	kafkago "github.com/segmentio/kafka-go"
)

const ActivitySyncedTopic = "activity.synced"

type ActivitySyncedPayload struct {
	ActivityID string `json:"activityId"`
	UserID     string `json:"userId"`
}

type Consumer struct {
	reader *kafkago.Reader
}

func NewActivitySyncedConsumer(brokers []string, groupID string) *Consumer {
	r := kafkago.NewReader(kafkago.ReaderConfig{
		Brokers:     brokers,
		Topic:       ActivitySyncedTopic,
		GroupID:     groupID,
		MinBytes:    1,
		MaxBytes:    10 << 20,
		StartOffset: kafkago.FirstOffset,
	})
	return &Consumer{reader: r}
}

func (c *Consumer) Run(ctx context.Context) error {
	log.Printf("[Kafka Consumer] subscribed topic=%s", ActivitySyncedTopic)
	for {
		msg, err := c.reader.ReadMessage(ctx)
		if err != nil {
			if errors.Is(err, context.Canceled) || errors.Is(err, io.EOF) {
				return nil
			}
			log.Printf("[Kafka Consumer] read error: %v", err)
			continue
		}

		var payload ActivitySyncedPayload
		if err := json.Unmarshal(msg.Value, &payload); err != nil {
			// NestJS ClientKafka wraps the payload as {"value": <json-string>}; unwrap once and retry.
			var wrapper struct {
				Value json.RawMessage `json:"value"`
			}
			if jerr := json.Unmarshal(msg.Value, &wrapper); jerr == nil && len(wrapper.Value) > 0 {
				if jerr := json.Unmarshal(wrapper.Value, &payload); jerr != nil {
					log.Printf("[Kafka Consumer] malformed payload: %s err=%v", string(msg.Value), jerr)
					continue
				}
			} else {
				log.Printf("[Kafka Consumer] malformed payload: %s err=%v", string(msg.Value), err)
				continue
			}
		}

		log.Printf("[Kafka Consumer] Received activity sync event for ID: %s", payload.ActivityID)
	}
}

func (c *Consumer) Close() error {
	return c.reader.Close()
}
