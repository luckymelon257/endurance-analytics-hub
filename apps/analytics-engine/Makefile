.PHONY: gen-proto build run tidy

PROTO_SRC := ../../shared/proto
PROTO_OUT := internal/infra/pb
GOBIN     := $(shell go env GOPATH)/bin

# Prerequisites (one-time):
#   brew install protobuf
#   go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
#   go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest

gen-proto:
	@mkdir -p $(PROTO_OUT)
	@PATH="$(GOBIN):$$PATH" protoc \
		--proto_path=$(PROTO_SRC) \
		--go_out=$(PROTO_OUT) --go_opt=paths=source_relative \
		--go-grpc_out=$(PROTO_OUT) --go-grpc_opt=paths=source_relative \
		$(PROTO_SRC)/analytics.proto

tidy:
	go mod tidy

build:
	CGO_ENABLED=0 go build -o bin/server ./cmd/server

run:
	go run ./cmd/server
