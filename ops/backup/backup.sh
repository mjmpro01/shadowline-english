#!/usr/bin/env bash
# Nightly backup of a production Shadowline: both databases and every audio and
# video file, into dated files under BACKUP_DIR, keeping KEEP_DAYS of them.
#
#   sudo crontab -e
#   15 3 * * * /opt/shadowline/ops/backup/backup.sh >> /var/log/shadowline-backup.log 2>&1
#
# A backup on the same disk survives a bad deploy, not a lost server: copy
# BACKUP_DIR somewhere else too (rclone to object storage, or another machine).
# And restore one once, before it is needed — see docs/deploy-prod.md.
set -euo pipefail

COMPOSE_DIR="${COMPOSE_DIR:-/opt/shadowline/server}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/shadowline}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%F-%H%M)"

mkdir -p "$BACKUP_DIR"
cd "$COMPOSE_DIR"

# Plain-SQL dumps: restorable with psql into any Postgres 16, no special tools.
for db in shadowline keycloak; do
  docker compose exec -T postgres pg_dump -U shadowline --no-owner "$db" \
    | gzip > "$BACKUP_DIR/$db-$STAMP.sql.gz.part"
  mv "$BACKUP_DIR/$db-$STAMP.sql.gz.part" "$BACKUP_DIR/$db-$STAMP.sql.gz"
done

# The files, read through the API container, which has the volume mounted:
# no need to know what Docker named it.
docker compose exec -T api tar -czf - -C /data/blobs . > "$BACKUP_DIR/blobs-$STAMP.tar.gz.part"
mv "$BACKUP_DIR/blobs-$STAMP.tar.gz.part" "$BACKUP_DIR/blobs-$STAMP.tar.gz"

find "$BACKUP_DIR" -name '*.gz' -mtime +"$KEEP_DAYS" -delete
find "$BACKUP_DIR" -name '*.part' -delete

echo "$(date -Is) backup ok: $(du -sh "$BACKUP_DIR" | cut -f1) in $BACKUP_DIR"
