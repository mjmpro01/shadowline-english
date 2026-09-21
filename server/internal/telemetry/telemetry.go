// Package telemetry wires OpenTelemetry (traces + metrics) and a slog handler
// that injects trace_id / span_id into JSON logs for Loki ↔ Tempo correlation.
package telemetry

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetrichttp"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/exporters/prometheus"
	"go.opentelemetry.io/otel/propagation"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.24.0"
	"go.opentelemetry.io/otel/trace"
)

// Init installs global TracerProvider / MeterProvider when
// OTEL_EXPORTER_OTLP_ENDPOINT is set. An empty endpoint is a no-op so laptops
// without the observability stack keep working.
func Init(ctx context.Context) (shutdown func(context.Context) error, err error) {
	endpoint := strings.TrimSpace(os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT"))
	if endpoint == "" {
		return func(context.Context) error { return nil }, nil
	}

	service := os.Getenv("OTEL_SERVICE_NAME")
	if service == "" {
		service = "shadowline-api"
	}

	res, err := resource.Merge(
		resource.Default(),
		resource.NewWithAttributes(
			semconv.SchemaURL,
			semconv.ServiceName(service),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("otel resource: %w", err)
	}

	traceExp, err := otlptracehttp.New(ctx,
		otlptracehttp.WithEndpointURL(joinOTLP(endpoint, "/v1/traces")),
	)
	if err != nil {
		return nil, fmt.Errorf("otlp trace exporter: %w", err)
	}
	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(traceExp),
		sdktrace.WithResource(res),
		sdktrace.WithSampler(sdktrace.ParentBased(sdktrace.TraceIDRatioBased(1.0))),
	)
	otel.SetTracerProvider(tp)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	promExp, err := prometheus.New()
	if err != nil {
		_ = tp.Shutdown(ctx)
		return nil, fmt.Errorf("prometheus exporter: %w", err)
	}

	metricExp, err := otlpmetrichttp.New(ctx,
		otlpmetrichttp.WithEndpointURL(joinOTLP(endpoint, "/v1/metrics")),
	)
	if err != nil {
		_ = tp.Shutdown(ctx)
		return nil, fmt.Errorf("otlp metric exporter: %w", err)
	}

	mp := sdkmetric.NewMeterProvider(
		sdkmetric.WithResource(res),
		sdkmetric.WithReader(promExp),
		sdkmetric.WithReader(sdkmetric.NewPeriodicReader(metricExp, sdkmetric.WithInterval(30*time.Second))),
	)
	otel.SetMeterProvider(mp)

	shutdown = func(ctx context.Context) error {
		var first error
		if err := mp.Shutdown(ctx); err != nil && first == nil {
			first = err
		}
		if err := tp.Shutdown(ctx); err != nil && first == nil {
			first = err
		}
		return first
	}
	return shutdown, nil
}

// NewLogger returns a JSON slog logger that adds trace_id / span_id from the
// record context when a span is active.
func NewLogger() *slog.Logger {
	base := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})
	return slog.New(&traceHandler{next: base})
}

// MetricsHandler serves Prometheus scrape text for /metrics.
func MetricsHandler() http.Handler {
	return promhttp.Handler()
}

// WrapHTTP instruments an http.Handler with OpenTelemetry server spans and
// HTTP metrics. Safe when Init was a no-op (uses global noop providers).
func WrapHTTP(handler http.Handler, operation string) http.Handler {
	return otelhttp.NewHandler(handler, operation,
		otelhttp.WithFilter(func(r *http.Request) bool {
			p := r.URL.Path
			return p != "/metrics" && p != "/healthz"
		}),
		otelhttp.WithSpanNameFormatter(func(_ string, r *http.Request) string {
			return r.Method + " " + r.URL.Path
		}),
	)
}

func joinOTLP(endpoint, path string) string {
	endpoint = strings.TrimRight(endpoint, "/")
	// Accept host:port or full URL.
	if !strings.Contains(endpoint, "://") {
		endpoint = "http://" + endpoint
	}
	return endpoint + path
}

type traceHandler struct {
	next slog.Handler
}

func (h *traceHandler) Enabled(ctx context.Context, level slog.Level) bool {
	return h.next.Enabled(ctx, level)
}

func (h *traceHandler) Handle(ctx context.Context, r slog.Record) error {
	span := trace.SpanFromContext(ctx)
	if span.SpanContext().IsValid() {
		sc := span.SpanContext()
		r.AddAttrs(
			slog.String("trace_id", sc.TraceID().String()),
			slog.String("span_id", sc.SpanID().String()),
		)
	}
	return h.next.Handle(ctx, r)
}

func (h *traceHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return &traceHandler{next: h.next.WithAttrs(attrs)}
}

func (h *traceHandler) WithGroup(name string) slog.Handler {
	return &traceHandler{next: h.next.WithGroup(name)}
}
