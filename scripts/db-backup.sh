#!/usr/bin/env bash
# AS Finance — daily encrypted DB backup
#
# Streams pg_dump from the running Postgres container, gzip-compresses, and
# encrypts with AES-256 (passphrase from BACKUP_PASSPHRASE env var). Stores
# the resulting file under BACKUP_DIR with a UTC-timestamped name, retains
# the last BACKUP_RETAIN_DAYS files, and removes older ones.
#
# Safety:
#   - Never writes plaintext SQL to disk — pg_dump streams straight into the
#     pipeline, encrypt-on-the-way-down.
#   - openssl + gzip pipefail catches mid-stream failure (would otherwise
#     produce a "successful" 0-byte file).
#   - Aborts if the previous backup never finished (stale .partial marker).
#
# Restore: ./scripts/db-restore.sh <backup-file>
# Verify : ./scripts/db-verify-backup.sh <backup-file>
#
# Cron: add a line like
#   0 2 * * * BACKUP_PASSPHRASE=... /home/ubuntu/Development/As_finance/scripts/db-backup.sh \
#     >> /var/log/asfinance-backup.log 2>&1

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/home/ubuntu/Development/As_finance/backups}"
BACKUP_RETAIN_DAYS="${BACKUP_RETAIN_DAYS:-14}"
PG_CONTAINER="${PG_CONTAINER:-asf-postgres}"
PG_USER="${PG_USER:-asfinance}"
PG_DB="${PG_DB:-asfinance_lms}"
PASSPHRASE="${BACKUP_PASSPHRASE:-}"

if [ -z "$PASSPHRASE" ]; then
  echo "FATAL: BACKUP_PASSPHRASE not set. Refusing to write a plaintext backup."
  echo "Set BACKUP_PASSPHRASE in /home/ubuntu/Development/As_finance/.env.production"
  echo "and source it before running this script (or set it in the cron line)."
  exit 2
fi

if ! docker ps --format '{{.Names}}' | grep -qx "$PG_CONTAINER"; then
  echo "FATAL: Postgres container '$PG_CONTAINER' is not running."
  exit 3
fi

mkdir -p "$BACKUP_DIR"

# Stale-partial guard — if a previous run died mid-stream, refuse to start
# another until ops investigates.
if compgen -G "$BACKUP_DIR/*.partial" > /dev/null; then
  echo "FATAL: Found stale .partial backup(s) — previous run did not finish cleanly:"
  ls -lh "$BACKUP_DIR"/*.partial
  echo "Investigate, then 'rm $BACKUP_DIR/*.partial' to allow a fresh run."
  exit 4
fi

TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/asfinance-${TS}.sql.gz.enc"
PARTIAL="$OUT.partial"

echo "[backup] starting at $TS"
echo "[backup] target: $OUT"

# pg_dump → gzip → openssl encrypt — pipefail catches mid-pipe failures.
docker exec "$PG_CONTAINER" pg_dump -U "$PG_USER" -d "$PG_DB" --no-owner --no-privileges \
  --serializable-deferrable --quote-all-identifiers \
  | gzip -9 \
  | openssl enc -aes-256-cbc -pbkdf2 -salt -pass "pass:$PASSPHRASE" \
  > "$PARTIAL"

# Atomic rename — only happens if the pipeline above succeeded (set -e).
mv "$PARTIAL" "$OUT"

SIZE_BYTES="$(stat -c%s "$OUT")"
SIZE_MB="$(awk -v b="$SIZE_BYTES" 'BEGIN { printf "%.2f", b/1024/1024 }')"

if [ "$SIZE_BYTES" -lt 1024 ]; then
  echo "FATAL: Backup is suspiciously small ($SIZE_BYTES bytes). Removing and aborting."
  rm -f "$OUT"
  exit 5
fi

echo "[backup] wrote $OUT ($SIZE_MB MB)"

# Rotation — keep the last N days.
PRE_COUNT="$(ls "$BACKUP_DIR"/asfinance-*.sql.gz.enc 2>/dev/null | wc -l)"
find "$BACKUP_DIR" -name 'asfinance-*.sql.gz.enc' -type f -mtime "+$BACKUP_RETAIN_DAYS" -delete
POST_COUNT="$(ls "$BACKUP_DIR"/asfinance-*.sql.gz.enc 2>/dev/null | wc -l)"
PRUNED="$((PRE_COUNT - POST_COUNT + 1))"  # +1 because we just added one

echo "[backup] retained $POST_COUNT file(s); rotation removed $((PRE_COUNT - POST_COUNT)) older than $BACKUP_RETAIN_DAYS days"
echo "[backup] OK"
