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
| Backups | Oracle Console → Storage → Buckets; your user → Customer secret keys | A private bucket for nightly backups (section 5). Always Free covers 20 GB |
| Image registry | Oracle Console → Developer Services → Container Registry | Note the **region key** (e.g. `sin`) and the tenancy **namespace** (shown on the registry page). Create an **Auth Token** under your user → Auth tokens: it is the registry password. Set a retention policy (keep the last ~10 tags) so old images do not pile up |

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

# Oracle Container Registry: <region-key>.ocir.io/<namespace>/<prefix>.
# Shadowline's three images are $REGISTRY/api, /workers and /web. IMAGE_TAG is
# written by Jenkins on every deploy; leave it out at first.
REGISTRY=sin.ocir.io/<namespace>/shadowline

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

Normally the first Jenkins deploy is the first start (section 3). To start by
hand before Jenkins exists, log in to the registry once and use the checkout's
commit as the tag:

```bash
cd /opt/shadowline/server
docker login sin.ocir.io -u '<namespace>/<user>'    # password: the Auth Token
export IMAGE_TAG=$(git rev-parse --short=7 HEAD)
docker compose build                # the first build takes a while: Whisper is baked in
docker compose push api scoring web
echo "IMAGE_TAG=$IMAGE_TAG" >> .env
docker compose up -d --no-build
docker compose ps                   # every service Up or healthy; seed and blobs-init Exited (0)
docker compose logs -f api          # "listening", no "refusing to start"
curl -fsS https://app.<domain>/healthz
```

Keycloak's admin console is not on the public host. When you need it:
`ssh -L 8081:localhost:8081 <server>` and open http://localhost:8081/admin/.

## 3. Jenkins

`docs/ops-jenkins.md`. Jenkins publishes 8085 on loopback only and is reached
through `ci.<domain>`. Give it the registry login: **Manage Jenkins →
Credentials → Add**, kind *Username with password*, ID `ocir`, username
`<namespace>/<user>`, password the Auth Token.

On `main`, its Deploy stage, in `/opt/shadowline/server`:

1. builds the three images (api, workers, web) tagged with the commit;
2. pushes them to `$REGISTRY` — a failed push stops the deploy, so whatever
   runs is in the registry;
3. writes `IMAGE_TAG=<commit>` into `.env`;
4. `docker compose pull`, then `up -d --no-build`.

The first build pulls the CI images and Python packages (about 2 GB); later
builds reuse them.

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

`ops/backup/backup.sh`, nightly from root's crontab, keeps:

| Where | What | How long |
|---|---|---|
| `/var/backups/shadowline` | both databases (plain-SQL dumps) | 14 days |
| `/var/backups/shadowline` | every file, as a tarball | the last 2 |
| object storage `db/` | both databases | 30 days |
| object storage `blobs/` | a mirror of every file — only new files upload each night | as long as the app has them |
| object storage `deleted/<night>/` | files the app deleted (a take, an account) | 7 days, then gone |

So a deleted account leaves the file backups within a week, and the database
dumps within a month. Two guards stop a mistake from destroying the copies: if
the volume is found with less than half the files the bucket has (a bad mount,
a fresh host), the mirror is refused and the night fails; and if tonight's
tarball is less than half of the last one, no older tarball is removed.

### Object storage (OCI, S3-compatible)

1. Oracle Console → **Storage → Buckets → Create bucket**, e.g.
   `shadowline-backups`, *Standard*, private (the default). Always Free covers
   20 GB.
2. Your user → **Customer secret keys → Generate secret key**. Note the access
   key and the secret — the secret is shown once.
3. On the server:

   ```bash
   sudo apt install rclone
   sudo mkdir -p /root/.config/rclone
   sudo tee /root/.config/rclone/rclone.conf > /dev/null <<'CONF'
   [oci]
   type = s3
   provider = Other
   access_key_id = <access key>
   secret_access_key = <secret>
   region = <region, e.g. ap-singapore-1>
   endpoint = https://<namespace>.compat.objectstorage.<region>.oraclecloud.com
   acl = private
   no_check_bucket = true
   CONF
   sudo chmod 600 /root/.config/rclone/rclone.conf
   sudo rclone lsd oci:                     # the bucket is listed

   echo 'RCLONE_REMOTE=oci:shadowline-backups' | sudo tee /etc/shadowline-backup.env
   # optional: a ping on success, so a failed night is noticed by its silence
   # echo 'HEALTHCHECK_URL=https://hc-ping.com/<uuid>' | sudo tee -a /etc/shadowline-backup.env
   sudo chmod 600 /etc/shadowline-backup.env
   ```

4. Run it once by hand and look:

   ```bash
   sudo /opt/shadowline/ops/backup/backup.sh
   sudo rclone ls oci:shadowline-backups/db
   sudo rclone size oci:shadowline-backups/blobs
   ```

5. Then nightly:

   ```bash
   sudo crontab -e
   15 3 * * * /opt/shadowline/ops/backup/backup.sh >> /var/log/shadowline-backup.log 2>&1
   ```

Every setting (`DB_KEEP_DAYS`, `BLOB_COPIES`, `REMOTE_DB_KEEP_DAYS`,
`DELETED_KEEP_DAYS`, …) has a default at the top of the script and can be
changed in `/etc/shadowline-backup.env`.

### Restoring

Restore once before you need to — on a spare machine, or a second checkout with
its own project name — so the steps are known to work.

```bash
cd /opt/shadowline/server
docker compose stop api scoring cutting dubbing transcribing glossing keycloak

# The databases: from /var/backups/shadowline, or fetched from the bucket.
sudo rclone copy oci:shadowline-backups/db/shadowline-<stamp>.sql.gz .
sudo rclone copy oci:shadowline-backups/db/keycloak-<stamp>.sql.gz .
for db in shadowline keycloak; do
  docker compose exec -T postgres dropdb -U shadowline "$db"
  docker compose exec -T postgres createdb -U shadowline "$db"
  gunzip -c "$db-<stamp>.sql.gz" | docker compose exec -T postgres psql -q -U shadowline -d "$db"
done

# The files: the local tarball…
docker compose run --rm --no-deps -T --entrypoint tar api -xzf - -C /data/blobs < /var/backups/shadowline/blobs-<stamp>.tar.gz
# …or the mirror, straight into the volume (start the stack once first so it exists).
blobs="$(docker inspect "$(docker compose ps -aq api)" \
  --format '{{range .Mounts}}{{if eq .Destination "/data/blobs"}}{{.Source}}{{end}}{{end}}')"
sudo rclone copy oci:shadowline-backups/blobs "$blobs"
sudo chown -R 10001:10001 "$blobs"

docker compose up -d --no-build
```

## 6. Updating and rolling back

A merge to `main` deploys. Migrations run when the API starts and only go
forward, so:

- **Fastest, code only:** run the previous images again. Every deploy's images
  stay in the registry under their commit, so:

  ```bash
  cd /opt/shadowline/server
  sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=<previous commit>/' .env
  docker compose up -d --no-build          # pulls that tag if it is not here
  ```

  Then revert the commit on `main`, or the next deploy brings it back.
- **With a migration:** run `ops/backup/backup.sh` before merging. Older code
  on a newer schema may not work, so going back is the previous tag *and* the
  database dump taken before the deploy.

## 7. On a shared host

Docker's published ports bypass the host's iptables: a container published on
`0.0.0.0` is reachable from anywhere the VCN allows, whatever INPUT says.
Shadowline publishes nothing beyond 127.0.0.1. Other projects on the same
machine should do the same, and the VCN should open only 22, 80 and 443 —
a database such as MongoDB on `0.0.0.0:27017` is otherwise one rule away from
the internet.
