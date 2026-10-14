package telemetry

import (
	"context"
	"testing"
	"time"
)

// Setting the endpoint is how production turns telemetry on, and an Init that
// fails there stops the API. Nothing listens on this address: the exporters
// connect when they first send, not here.
func TestInitStartsWithAnEndpoint(t *testing.T) {
	t.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://127.0.0.1:1")
	t.Setenv("OTEL_SERVICE_NAME", "shadowline-api-test")

	shutdown, err := Init(context.Background())
	if err != nil {
		t.Fatalf("Init with an endpoint: %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	// Flushing to an address with nothing behind it fails; that is not the
	// point of this test.
	_ = shutdown(ctx)
}

func TestInitIsANoOpWithoutAnEndpoint(t *testing.T) {
	t.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "")
	shutdown, err := Init(context.Background())
	if err != nil {
		t.Fatalf("Init without an endpoint: %v", err)
	}
	if err := shutdown(context.Background()); err != nil {
		t.Fatalf("shutdown: %v", err)
	}
}
