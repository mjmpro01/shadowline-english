"""OpenTelemetry setup for Shadowline Python workers.

When OTEL_EXPORTER_OTLP_ENDPOINT is unset, setup is a no-op so local runs
without the observability stack stay quiet.
"""

from __future__ import annotations

import json
import logging
import os
import time
from contextlib import contextmanager
from typing import Any, Iterator

_configured = False
_tracer = None
_jobs_processed = None
_job_duration = None
_job_errors = None


class _JSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "time": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        trace_id = getattr(record, "trace_id", "") or ""
        span_id = getattr(record, "span_id", "") or ""
        if trace_id:
            payload["trace_id"] = trace_id
        if span_id:
            payload["span_id"] = span_id
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


class _TraceFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        try:
            from opentelemetry import trace

            span = trace.get_current_span()
            ctx = span.get_span_context()
            if ctx is not None and ctx.is_valid:
                record.trace_id = format(ctx.trace_id, "032x")
                record.span_id = format(ctx.span_id, "016x")
            else:
                record.trace_id = ""
                record.span_id = ""
        except Exception:
            record.trace_id = ""
            record.span_id = ""
        return True


def setup(default_service: str) -> None:
    """Install tracer/meter exporters and JSON logging once per process."""
    global _configured, _tracer, _jobs_processed, _job_duration, _job_errors
    if _configured:
        return
    _configured = True

    level = os.environ.get("LOG_LEVEL", "INFO").upper()
    root = logging.getLogger()
    root.handlers.clear()
    handler = logging.StreamHandler()
    handler.setFormatter(_JSONFormatter())
    handler.addFilter(_TraceFilter())
    root.addHandler(handler)
    root.setLevel(level)

    endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "").strip()
    if not endpoint:
        return

    service = os.environ.get("OTEL_SERVICE_NAME", "").strip() or default_service

    try:
        from opentelemetry import metrics, trace
        from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.sdk.metrics import MeterProvider
        from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
    except ImportError:
        logging.getLogger("shadowline.telemetry").warning(
            "opentelemetry packages missing — continuing without OTLP export"
        )
        return

    base = endpoint.rstrip("/")
    if "://" not in base:
        base = "http://" + base

    resource = Resource.create({"service.name": service})

    tp = TracerProvider(resource=resource)
    tp.add_span_processor(
        BatchSpanProcessor(OTLPSpanExporter(endpoint=f"{base}/v1/traces"))
    )
    trace.set_tracer_provider(tp)
    _tracer = trace.get_tracer("shadowline.worker")

    reader = PeriodicExportingMetricReader(
        OTLPMetricExporter(endpoint=f"{base}/v1/metrics"),
        export_interval_millis=30000,
    )
    mp = MeterProvider(resource=resource, metric_readers=[reader])
    metrics.set_meter_provider(mp)
    meter = metrics.get_meter("shadowline.worker")
    _jobs_processed = meter.create_counter(
        "shadowline_jobs_processed_total",
        description="Jobs completed by a Shadowline worker",
    )
    _job_errors = meter.create_counter(
        "shadowline_job_errors_total",
        description="Jobs that failed or were rejected as unprocessable",
    )
    _job_duration = meter.create_histogram(
        "shadowline_job_duration_seconds",
        description="Wall time to process one claimed job",
        unit="s",
    )


@contextmanager
def track_job(worker: str, attributes: dict[str, Any] | None = None) -> Iterator[dict[str, str]]:
    """Root span + metrics around one claimed job.

    Yields a mutable dict; set ``status`` to ``error`` / ``rejected`` when the
    job fails without raising out of the block.
    """
    attrs = {"worker": worker, **(attributes or {})}
    state: dict[str, str] = {"status": "ok"}
    started = time.monotonic()

    if _tracer is None:
        try:
            yield state
        finally:
            _record_metrics(worker, state["status"], time.monotonic() - started)
        return

    from opentelemetry.trace import Status, StatusCode

    with _tracer.start_as_current_span(
        "worker.process",
        attributes={k: str(v) for k, v in attrs.items()},
    ) as span:
        try:
            yield state
        except Exception as err:
            state["status"] = "error"
            span.record_exception(err)
            span.set_status(Status(StatusCode.ERROR, str(err)))
            raise
        finally:
            span.set_attribute("job.status", state["status"])
            if state["status"] != "ok":
                span.set_status(Status(StatusCode.ERROR, state["status"]))
            _record_metrics(worker, state["status"], time.monotonic() - started)


def _record_metrics(worker: str, status: str, elapsed: float) -> None:
    labels = {"worker": worker, "status": status}
    if _jobs_processed is not None:
        _jobs_processed.add(1, labels)
    if _job_duration is not None:
        _job_duration.record(elapsed, {"worker": worker})
    if status != "ok" and _job_errors is not None:
        _job_errors.add(1, {"worker": worker})
