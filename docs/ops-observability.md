# Observability on a Shadowline VPS (Grafana LGTM)

Self-hosted **Grafana + Loki + Tempo + Prometheus + Alloy** on the same Docker
host as the app. Apps export OpenTelemetry (OTLP) to Alloy; Alloy also scrapes
`/metrics` and ships Docker stdout into Loki.

## What you get

| Piece | Path |
| --- | --- |
| Compose stack | [`ops/observability/`](../ops/observability/) |
| Go telemetry | [`server/internal/telemetry/`](../server/internal/telemetry/) |
| Worker telemetry | [`scoring/shadowline/telemetry.py`](../scoring/shadowline/telemetry.py) |
| TLS example | `monitor.example.com` in [`ops/nginx/vhost.example.conf`](../ops/nginx/vhost.example.conf) |

## RAM

| VPS | Guidance |
| --- | --- |
| 4 GB | Tight with Jenkins + full Shadowline — shorten retention, skip Portainer. |
| **≥8 GB** | Recommended for app + Jenkins + this stack. |

Retention defaults: Prometheus **15d**, Loki/Tempo **14d**.

## Boot order

```bash
# Once on the host
docker network create shadowline

# Observability first (or after app — network must exist)
cd /opt/shadowline/ops/observability
# Optional: export GRAFANA_ADMIN_PASSWORD='…strong…'
docker compose up -d

# App (creates/joins network name shadowline)
cd /opt/shadowline/server
# In .env:
#   OTEL_EXPORTER_OTLP_ENDPOINT=http://alloy:4318
docker compose up -d --build
```

Grafana UI: `http://VPS:3000` (default user/password `admin` / `admin` — change
immediately). Behind nginx: `https://monitor.YOUR_DOMAIN` (see vhost example).

Provisioned datasources: **Prometheus**, **Loki**, **Tempo** with trace↔log
links. Dashboard folder **Shadowline** → *Shadowline overview*.

## Correlate

1. Hit the API or process a take.
2. Grafana → **Explore** → Tempo: search by service `shadowline-api` or `shadowline-scoring`.
3. Open a span → **Logs for this span** (Loki) — JSON logs include `trace_id`.
4. Prometheus: `shadowline_jobs_processed_total`, HTTP histograms from OTel.

## Security

- Do not expose Prometheus (`9090`), Loki, or Tempo on the public internet —
  only Grafana (and prefer HTTPS + strong admin password).
- Alloy mounts the Docker socket read-only (same trust model as Jenkins).

## Backup volumes

```bash
docker volume ls | grep -E 'prometheus|loki|tempo|grafana|alloy'
# Example:
docker run --rm -v ops_observability_grafana_data:/data -v "$PWD":/backup alpine \
  tar czf /backup/grafana-$(date +%F).tgz -C /data .
```

## Local laptop

Leave `OTEL_EXPORTER_OTLP_ENDPOINT` empty — API and workers no-op exporters and
still log (JSON). Start `ops/observability` only when you want to exercise the
pipeline.
