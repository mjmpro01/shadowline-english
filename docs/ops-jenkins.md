# Jenkins CI/CD on a Shadowline VPS

Jenkins runs on the **same Docker host** as the app so you can watch builds,
retry failed stages, and trigger deploys from a UI. GitHub only hosts the repo
and fires a webhook — it is not the CD runner.

## What you get

| Piece | Path |
| --- | --- |
| Jenkins Compose + image | [`ops/jenkins/`](../ops/jenkins/) |
| Pipeline | [`Jenkinsfile`](../Jenkinsfile) at repo root |
| SPA image (nginx) | [`app/Dockerfile`](../app/Dockerfile) + service `web` in [`server/docker-compose.yml`](docker-compose.yml) |
| TLS example | [`ops/nginx/vhost.example.conf`](../ops/nginx/vhost.example.conf) |

## RAM

| VPS | Guidance |
| --- | --- |
| 2 GB | Tight. Cap Jenkins with `JAVA_OPTS=-Xmx512m`, skip Portainer, consider stopping Mailhog in prod. |
| 4 GB+ | Comfortable for Jenkins + Postgres + Keycloak + workers + `web`. |

## One-time VPS setup

### 1. Clone the repo

```bash
sudo mkdir -p /opt/shadowline
sudo chown "$USER:$USER" /opt/shadowline
git clone git@github.com:YOUR_ORG/YOUR_REPO.git /opt/shadowline
cp /opt/shadowline/server/.env.example /opt/shadowline/server/.env
# Edit .env: SESSION_SECRET, Google OAuth, Keycloak, APP_ORIGIN=https://your.domain
```

### 2. Start Shadowline (+ web)

```bash
cd /opt/shadowline/server
docker compose up -d --build
# SPA: http://VPS:8088  API: http://VPS:8080
```

Point DNS at the VPS and install host nginx with
[`ops/nginx/vhost.example.conf`](../ops/nginx/vhost.example.conf) (rename
hostnames, then Certbot for TLS). Same-origin: leave `VITE_API_URL` empty and
let nginx proxy `/api` and `/auth` to `:8080`, static SPA to `:8088`.

### 3. Start Jenkins

```bash
cd /opt/shadowline/ops/jenkins
# Optional: export SHADOWLINE_ROOT=/opt/shadowline
docker compose -f docker-compose.jenkins.yml up -d --build
docker compose -f docker-compose.jenkins.yml logs jenkins 2>&1 | grep -i password
```

Open `http://VPS:8085`, unlock with the admin password, create the admin user.

### 4. Create the Pipeline job

1. **New Item** → name `shadowline` → **Pipeline**.
2. **Build Triggers** → enable **GitHub hook trigger for GITScm polling**.
3. **Pipeline** → *Pipeline script from SCM*:
   - SCM: Git
   - Repository URL: your GitHub HTTPS or SSH URL
   - Credentials: deploy key (read) or PAT with `repo` read
   - Branch: `*/main` (and `*/master` if needed)
   - Script Path: `Jenkinsfile`
4. Save → **Build Now** once to verify checkout/tests.

### 5. GitHub webhook

GitHub → **Settings → Webhooks → Add webhook**:

| Field | Value |
| --- | --- |
| Payload URL | `https://ci.YOUR_DOMAIN/github-webhook/` |
| Content type | `application/json` |
| Events | Just the push event (and Pull requests if you want PR builds) |

Jenkins must be reachable on that URL (nginx site `ci.example.com` in
[`ops/nginx/vhost.example.conf`](../ops/nginx/vhost.example.conf)). Until DNS/TLS
is ready you can use a tunnel, or rely on manual **Build Now**.

### 6. Optional Portainer

```bash
cd /opt/shadowline/ops/jenkins
docker compose -f docker-compose.jenkins.yml --profile portainer up -d
# UI http://VPS:9002 — view containers only; deploys stay in Jenkins.
```

## What the Pipeline does

1. **Test app** — `yarn lint`, `yarn test`, `yarn build` in Node 22.
2. **Test server** — focused `go test` packages that do not need Postgres.
3. **Deploy** (only `main` / `master` / tags `v*`) — rsync workspace into
   `/opt/shadowline` (keeps `server/.env`), then
   `docker compose up -d --build` in `server/`.

Rebuild or replay from the Jenkins UI anytime (**Build Now** / failed stage retry).

## Credentials (Jenkins UI, never in git)

- GitHub deploy key or PAT for SCM checkout.
- If private npm/Docker registries appear later, add them under
  **Manage Jenkins → Credentials**.

## Backup

```bash
# Jenkins config + job history
docker run --rm -v ops_jenkins_jenkins_home:/data -v "$PWD":/backup alpine \
  tar czf /backup/jenkins_home-$(date +%F).tgz -C /data .
# Volume name may differ — check: docker volume ls | grep jenkins

# App database (same as always)
docker compose -f /opt/shadowline/server/docker-compose.yml exec -T postgres \
  pg_dump -U shadowline shadowline | gzip > shadowline-$(date +%F).sql.gz
```

## Security notes

- Mounting `/var/run/docker.sock` into Jenkins is root-equivalent on the host.
  Restrict who can log into Jenkins; put it on HTTPS.
- Do not expose port `50000` on the public internet unless you use inbound agents
  and know the threat model.
- Production `.env` stays only under `/opt/shadowline/server/.env`.

Observability (Grafana / Loki / Tempo / Prometheus) on the same host:
[`docs/ops-observability.md`](ops-observability.md).
