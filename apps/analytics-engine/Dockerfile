# syntax=docker/dockerfile:1.7

FROM golang:1.25-alpine AS builder
WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY cmd ./cmd
COPY internal ./internal

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /out/server ./cmd/server


FROM gcr.io/distroless/static:nonroot
WORKDIR /
COPY --from=builder /out/server /server
EXPOSE 8080
EXPOSE 50051
USER nonroot:nonroot
ENTRYPOINT ["/server"]
