# Jenkins CI/CD on a Shadowline VPS

Jenkins runs on the **same Docker host** as the app so you can watch builds,
retry failed stages, and trigger deploys from a UI. GitHub only hosts the repo
and fires a webhook — it is not the CD runner.

Setting up the production host itself — `.env`, nginx, certificates, backups —
is [`deploy-prod.md`](deploy-prod.md); this page is the Jenkins part of it.

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

Production is set up as in [`deploy-prod.md`](deploy-prod.md): `.env` with
`COMPOSE_FILE`, `REGISTRY` and the secrets, then either the first Jenkins
deploy or its "First start" by hand. With the prod file everything listens on
127.0.0.1 only (SPA :8088, API :8090), behind the host's nginx.

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

Jenkins listens on 127.0.0.1 only. Open it through a tunnel —
`ssh -L 8085:localhost:8085 <server>`, then http://localhost:8085 — or, once the
`ci.` nginx site and its certificate are in place (the same three steps as in
[`deploy-prod.md`](deploy-prod.md)), at `https://ci.<domain>`. Unlock with the
admin password from the logs, and create the admin user.

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
# UI on the VPS itself only (it holds the Docker socket): ssh -L 9002:localhost:9002 VPS,
# then http://localhost:9002 — view containers only; deploys stay in Jenkins.
```

## What the Pipeline does

1. **Test app** — `yarn lint`, `yarn test`, `yarn build` in Node 22, and the
   admin console's lint, typecheck, tests and build.
2. **Test server and workers** — starts a throwaway `postgres:16-alpine`
   container, then `go vet ./...` and `go test ./...` (the API and store tests
   included, against that Postgres), and the Python workers' `pytest` with
   ffmpeg installed. About two minutes; the container goes when the stage ends.
   Needs the Docker Pipeline plugin, which the `agent { docker }` stages already
   use. pip's downloads are kept in the `shadowline-ci-pip` Docker volume.
3. **Deploy** (only `main` / `master` / tags `v*`) — rsync workspace into
   `/opt/shadowline` (keeps `server/.env`); in `server/`, log in to Oracle's
   registry (`REGISTRY` in `.env`, credential `ocir`), build the api, workers
   and web images tagged with the commit, push them, write `IMAGE_TAG` into
   `.env`, then `docker compose pull` and `up -d --no-build`. See
   [`deploy-prod.md`](deploy-prod.md) for rolling back by tag.

Rebuild or replay from the Jenkins UI anytime (**Build Now** / failed stage retry).

## Credentials (Jenkins UI, never in git)

- GitHub deploy key or PAT for SCM checkout.
- `ocir` — *Username with password* for Oracle Container Registry: username
  `<namespace>/<user>`, password an OCI Auth Token (your user → Auth tokens).
  The Deploy stage pushes and pulls with it.

## Backup

```bash
# Jenkins config + job history
docker run --rm -v ops_jenkins_jenkins_home:/data -v "$PWD":/backup alpine \
  tar czf /backup/jenkins_home-$(date +%F).tgz -C /data .
# Volume name may differ — check: docker volume ls | grep jenkins
```

The app itself — both databases and every file, here and in object storage —
is backed up nightly by `ops/backup/backup.sh`: see
[`deploy-prod.md`](deploy-prod.md#5-backups).

## Security notes

- Mounting `/var/run/docker.sock` into Jenkins is root-equivalent on the host.
  Restrict who can log into Jenkins; put it on HTTPS.
- Port `50000` (inbound agents) and Portainer are published on `127.0.0.1`
  only. Docker's port publishing writes its own iptables rules and goes around
  ufw, so a port published on every address is on the internet whatever the
  firewall says.
- Production `.env` stays only under `/opt/shadowline/server/.env`, with every
  example secret replaced — the API refuses to start over https otherwise. See
  "Before a server is reachable" in [`server/README.md`](../server/README.md).

Observability (Grafana / Loki / Tempo / Prometheus) on the same host:
[`docs/ops-observability.md`](ops-observability.md).
