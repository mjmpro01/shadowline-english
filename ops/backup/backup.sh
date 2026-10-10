#!/usr/bin/env bash
# Nightly backup of a production Shadowline: both databases and every audio and
# video file, on this machine and — when RCLONE_REMOTE is set — off it, in
# object storage.
#
#   started nightly by shadowline-backup.timer (beside this file), or by hand:
#   sudo /opt/shadowline/ops/backup/backup.sh
#
# Settings come from the environment, or from /etc/shadowline-backup.env when
# it exists. The object storage keys are not there but in rclone's own config
# (/root/.config/rclone/rclone.conf). See docs/deploy-prod.md, "Backups".
#
# What is kept where:
#
#   here    the databases for DB_KEEP_DAYS, and the last BLOB_COPIES tarballs of
#           the files. Not one tarball a night for two weeks: the files are
#           every upload ever made, and fourteen copies of them would fill the
#           disk the app runs on.
#   remote  the databases for REMOTE_DB_KEEP_DAYS, under db/; and a mirror of
#           the files under blobs/. A file is never changed once written (every
#           key has a fresh uuid), so each night uploads only what is new. A
#           file the app deleted — a take, a whole account — leaves the mirror
#           too, into deleted/<night>/, kept DELETED_KEEP_DAYS and then gone: a
#           learner who deletes their account is out of the backups within a
#           week (and the database dumps age out), and a mistake has a week to
#           be noticed.
#
# Restore once before it is needed. A backup nobody has restored is a hope.
set -euo pipefail

if [ -f /etc/shadowline-backup.env ]; then
  # shellcheck disable=SC1091
  . /etc/shadowline-backup.env
fi

COMPOSE_DIR="${COMPOSE_DIR:-/opt/shadowline/server}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/shadowline}"
DB_KEEP_DAYS="${DB_KEEP_DAYS:-14}"
BLOB_COPIES="${BLOB_COPIES:-2}"
# e.g. oci:shadowline-backups — an rclone remote and a bucket. Empty: no
# off-machine copy, and the log says so every night.
RCLONE_REMOTE="${RCLONE_REMOTE:-}"
REMOTE_DB_KEEP_DAYS="${REMOTE_DB_KEEP_DAYS:-30}"
DELETED_KEEP_DAYS="${DELETED_KEEP_DAYS:-7}"
# Optional: a URL to GET when the backup succeeded (healthchecks.io and the
# like), so a night that failed is noticed by its silence.
HEALTHCHECK_URL="${HEALTHCHECK_URL:-}"

STAMP="$(date +%F-%H%M)"
log() { echo "$(date -Is) $*"; }

mkdir -p "$BACKUP_DIR"
cd "$COMPOSE_DIR"

# --- databases --------------------------------------------------------------
# Plain-SQL dumps: restorable with psql into any Postgres 16, no special tools.
for db in shadowline keycloak; do
  docker compose exec -T postgres pg_dump -U shadowline --no-owner "$db" \
    | gzip > "$BACKUP_DIR/$db-$STAMP.sql.gz.part"
  mv "$BACKUP_DIR/$db-$STAMP.sql.gz.part" "$BACKUP_DIR/$db-$STAMP.sql.gz"
done
find "$BACKUP_DIR" -name '*.sql.gz' -mtime +"$DB_KEEP_DAYS" -delete

# --- files, here ------------------------------------------------------------
# Read through the API container, which has the volume mounted: no need to know
# what Docker named it.
previous="$(find "$BACKUP_DIR" -maxdepth 1 -name 'blobs-*.tar.gz' -printf '%T@ %s\n' \
  | sort -rn | head -n 1 | cut -d' ' -f2)"
docker compose exec -T api tar -czf - -C /data/blobs . > "$BACKUP_DIR/blobs-$STAMP.tar.gz.part"
mv "$BACKUP_DIR/blobs-$STAMP.tar.gz.part" "$BACKUP_DIR/blobs-$STAMP.tar.gz"
size="$(stat -c %s "$BACKUP_DIR/blobs-$STAMP.tar.gz")"
# Newest first; everything after the first BLOB_COPIES goes — unless tonight's
# is less than half the last one. Files leave one take at a time, so that is a
# volume found empty or half-mounted, and the good copies are what is left.
if [ -n "$previous" ] && [ $((size * 2)) -lt "$previous" ]; then
  log "WARNING: tonight's files are $size bytes against $previous last time — keeping every copy"
else
  find "$BACKUP_DIR" -maxdepth 1 -name 'blobs-*.tar.gz' -printf '%T@ %p\n' \
    | sort -rn | tail -n +"$((BLOB_COPIES + 1))" | cut -d' ' -f2- | xargs -r rm -f
fi
find "$BACKUP_DIR" -name '*.part' -delete

log "local backup ok: $(du -sh "$BACKUP_DIR" | cut -f1) in $BACKUP_DIR"

# --- off this machine -------------------------------------------------------
if [ -z "$RCLONE_REMOTE" ]; then
  log "WARNING: RCLONE_REMOTE is not set — the only copy is on this machine"
else
  command -v rclone > /dev/null || { log "RCLONE_REMOTE is set but rclone is not installed"; exit 1; }

  # Tonight's dumps, then the ones past their time on the remote.
  rclone copy "$BACKUP_DIR" "$RCLONE_REMOTE/db" \
    --include "shadowline-$STAMP.sql.gz" --include "keycloak-$STAMP.sql.gz"
  rclone delete "$RCLONE_REMOTE/db" --min-age "${REMOTE_DB_KEEP_DAYS}d"

  # The files: a mirror of the volume, read where Docker keeps it.
  api="$(docker compose ps -q api)"
  blobs="$(docker inspect "$api" \
    --format '{{range .Mounts}}{{if eq .Destination "/data/blobs"}}{{.Source}}{{end}}{{end}}')"
  if [ -z "$blobs" ] || [ ! -d "$blobs" ]; then
    log "could not find the blobs volume on this host (got '$blobs')"
    exit 1
  fi
  # Were the volume ever found empty or nearly so — a wrong mount, a fresh
  # host — a mirror would empty the bucket to match. Files only disappear one
  # deleted take or account at a time, so half of them gone overnight is a
  # mistake, not a night's use: stop instead. FORCE_SYNC=1 overrides.
  here="$(find "$blobs" -type f | wc -l)"
  # Nothing there yet (the first night) is a count of 0, not a failure.
  there="$( (rclone size "$RCLONE_REMOTE/blobs" --json 2>/dev/null || true) \
    | sed -n 's/.*"count":\([0-9]*\).*/\1/p')"
  there="${there:-0}"
  if [ "$there" -gt 0 ] && [ $((here * 2)) -lt "$there" ] && [ "${FORCE_SYNC:-}" != 1 ]; then
    log "refusing to mirror: $here files here against $there in $RCLONE_REMOTE/blobs"
    exit 1
  fi
  rclone sync "$blobs" "$RCLONE_REMOTE/blobs" --backup-dir "$RCLONE_REMOTE/deleted/$STAMP" --fast-list

  # deleted/<night>/ goes once its night is DELETED_KEEP_DAYS old. By the name,
  # not the files' times: a moved file keeps the time it was first written.
  cutoff="$(date -d "-$DELETED_KEEP_DAYS days" +%F)"
  (rclone lsf --dirs-only "$RCLONE_REMOTE/deleted" 2>/dev/null || true) | while read -r night; do
    night="${night%/}"
    if [[ "$night" < "$cutoff" ]]; then
      rclone purge "$RCLONE_REMOTE/deleted/$night"
    fi
  done

  log "remote backup ok: $RCLONE_REMOTE (db/ and blobs/)"
fi

if [ -n "$HEALTHCHECK_URL" ]; then
  curl -fsS -m 10 --retry 3 "$HEALTHCHECK_URL" > /dev/null || log "healthcheck ping failed"
fi
