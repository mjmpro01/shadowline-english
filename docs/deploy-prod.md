# Deploying to production

The first production host is an Oracle Cloud Ampere VM (ARM64, 4 cores, 24 GB,
Ubuntu 24.04) that already runs other sites behind its own nginx. This is the
runbook for that shape of machine: one host, Docker Compose, the host's nginx
in front, Jenkins deploying `main`.

Everything Shadowline-specific runs from `server/docker-compose.yml` plus
`server/docker-compose.prod.yml`, which `.env` turns on. What the second file
changes is listed at its top: nothing published beyond 127.0.0.1, the API on
8090, audio on a volume served from the app's own origin instead of MinIO,
Keycloak in production mode, no Mailhog, and restarts with the host.

## 1. Before the server

| What | Where | Notes |
|---|---|---|
| DNS | your registrar | `A` records for `app.` and `auth.` (and `ci.` for Jenkins) → the VM's public IP |
| Ports 80/443 | Oracle Console → VCN → Security List (or NSG) | Ingress TCP 80 and 443 from 0.0.0.0/0. The host's own iptables already allows them |
| Google sign-in | console.cloud.google.com → Google Auth Platform | A Web client with redirect `https://app.<domain>/auth/google/callback`; Audience → **Publish app**, or only listed test users get in |
| Mail | Brevo, Mailgun, SES, … | SMTP host, port 587, user, password, and a verified sender address |
| Tutor | 9router dashboard | A key of Shadowline's own, so it can be revoked alone. Retire any key that has been pasted anywhere |
| Disk | Oracle Console → Boot volume → Edit | 100 GB is plenty to start; growing it is online (`growpart` + `resize2fs`) |

Docker Compose has to be 2.24 or later (`docker compose version`) for the
`!reset` and `!override` tags in the prod file.

## 2. The server

```bash
sudo mkdir -p /opt/shadowline && sudo chown "$USER:$USER" /opt/shadowline
git clone git@github.com:mjmpro01/shadowline-english.git /opt/shadowline
cd /opt/shadowline/server
cp .env.example .env
```

### `.env`

Start from `.env.example` and change at least these. Every secret is new —
the API refuses to start over https with any value this repository ships.

```bash
COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml

POSTGRES_PASSWORD=<openssl rand -hex 24>
DATABASE_URL=postgres://shadowline:<same>@postgres:5432/shadowline?sslmode=disable
SESSION_SECRET=<openssl rand -base64 32>

APP_ORIGIN=https://app.<domain>
OAUTH_REDIRECT_URL=https://app.<domain>/auth/google/callback
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
ADMIN_EMAILS=you@<domain>

KEYCLOAK_PUBLIC_URL=https://auth.<domain>
KEYCLOAK_REDIRECT_URL=https://app.<domain>/auth/keycloak/callback
KEYCLOAK_CLIENT_SECRET=<openssl rand -hex 24>
KEYCLOAK_ADMIN_PASSWORD=<openssl rand -hex 16>
REQUIRE_VERIFIED_EMAIL=1

SMTP_HOST=...
SMTP_PORT=587
SMTP_FROM=noreply@<domain>
SMTP_USER=...
SMTP_PASSWORD=...

# Audio lives on the volume (the prod file sets DISK_ROOT); leave S3 unset.
S3_ENDPOINT=
S3_SECRET_KEY=<anything random — not change-me>

TUTOR_API_URL=http://host.docker.internal:20128/v1
TUTOR_API_KEY=...
TUTOR_DAILY_TOTAL=2000
```

`VITE_API_URL` stays empty: the app and the API share `app.<domain>`.

The Keycloak values (client secret, redirect URLs, SMTP) are read once, when
the realm is first imported from `server/keycloak-prod/`. Changing them later
means changing them in Keycloak's admin console as well as here.

### The tutor, when 9router runs on the host

9router on `127.0.0.1:20128` cannot be reached from a container:
`host.docker.internal` is the Docker bridge's address, not the host's loopback.
Make 9router listen on all addresses (for a Next.js server, `HOSTNAME=0.0.0.0`
in its environment), then let Docker's networks — and only them — through:

```bash
sudo iptables -I INPUT 5 -s 172.16.0.0/12 -p tcp --dport 20128 -j ACCEPT
sudo netfilter-persistent save
```

The VCN does not open 20128, and the host's final `REJECT` stops everyone else.
Check from inside: `docker compose exec api wget -qO- http://host.docker.internal:20128/v1/models`.

### nginx and certificates

Add the `app.` and `auth.` server blocks from `ops/nginx/vhost.example.conf`
beside the host's existing sites (nothing in them is a `default_server`), with
the real names, then:

```bash
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d app.<domain> -d auth.<domain>
```

Once https works, uncomment the `Strict-Transport-Security` line.

### First start

```bash
cd /opt/shadowline/server
docker compose up -d --build        # the first build takes a while: Whisper is baked in
docker compose ps                   # every service Up or healthy; seed and blobs-init Exited (0)
docker compose logs -f api          # "listening", no "refusing to start"
curl -fsS https://app.<domain>/healthz
```

Keycloak's admin console is not on the public host. When you need it:
`ssh -L 8081:localhost:8081 <server>` and open http://localhost:8081/admin/.

## 3. Jenkins

`docs/ops-jenkins.md`. Jenkins publishes 8085 on loopback only and is reached
through `ci.<domain>`. Its Deploy stage runs `docker compose up -d --build` in
`/opt/shadowline/server`, which picks up `COMPOSE_FILE` from `.env` — nothing in
the Jenkinsfile changes for production. The first build pulls the CI images
and Python packages (about 2 GB); later builds reuse them.

## 4. After every first deploy: a smoke test

- `https://app.<domain>` loads over https, with no mixed-content warnings.
- Sign in with Google; register with an email, and the confirmation mail arrives.
- Practise a line: the take is scored, and both waves play.
- Tap a word; ask the tutor a question.
- Export a dub and play it.
- Console: upload a recording, watch it transcribe, publish a clip, see it in the library.
- Console → System: every part on the same version.
- The same on a phone.

## 5. Backups

```bash
sudo crontab -e
15 3 * * * /opt/shadowline/ops/backup/backup.sh >> /var/log/shadowline-backup.log 2>&1
```

Both databases and every file, into `/var/backups/shadowline`, fourteen days
kept. That survives a bad deploy; copy the directory off the machine (rclone to
object storage) for it to survive the machine.

Restore once before you need to — on a spare machine, or a second checkout
with its own project name — so the steps are known to work:

```bash
docker compose stop api scoring cutting dubbing transcribing glossing keycloak
docker compose exec -T postgres dropdb -U shadowline shadowline
docker compose exec -T postgres createdb -U shadowline shadowline
gunzip -c shadowline-<stamp>.sql.gz | docker compose exec -T postgres psql -q -U shadowline -d shadowline
# the same for keycloak-<stamp>.sql.gz into the keycloak database
docker compose run --rm --no-deps -T --entrypoint tar api -xzf - -C /data/blobs < blobs-<stamp>.tar.gz
docker compose up -d
```

## 6. Updating and rolling back

A merge to `main` deploys. Migrations run when the API starts and only go
forward, so:

- **Code only:** revert the commit on `main`; Jenkins deploys the revert.
- **With a migration:** run `ops/backup/backup.sh` before merging. To go back,
  revert, then restore the database dump taken before the deploy.

## 7. On a shared host

Docker's published ports bypass the host's iptables: a container published on
`0.0.0.0` is reachable from anywhere the VCN allows, whatever INPUT says.
Shadowline publishes nothing beyond 127.0.0.1. Other projects on the same
machine should do the same, and the VCN should open only 22, 80 and 443 —
a database such as MongoDB on `0.0.0.0:27017` is otherwise one rule away from
the internet.
