#!/usr/bin/env bash
# AS Finance — restore an encrypted backup
#
# Decrypts the chosen .sql.gz.enc file and replays it into a Postgres DB.
# BY DEFAULT, this targets the LIVE production DB — and asks for explicit
# confirmation before overwriting it. Use --target=temp to restore to a
# disposable database instead (for verification drills).
#
# Examples:
#   # Verify a backup is restorable (safe — restores to asfinance_lms_verify):
#   ./scripts/db-restore.sh --target=temp backups/asfinance-20260608T020000Z.sql.gz.enc
#
#   # Overwrite the production DB (DESTRUCTIVE):
#   ./scripts/db-restore.sh --target=prod backups/asfinance-...sql.gz.enc

set -euo pipefail

PG_CONTAINER="${PG_CONTAINER:-asf-postgres}"
PG_USER="${PG_USER:-asfinance}"
PG_DB="${PG_DB:-asfinance_lms}"
PG_DB_VERIFY="${PG_DB_VERIFY:-asfinance_lms_verify}"
PASSPHRASE="${BACKUP_PASSPHRASE:-}"
TARGET="prod"
INPUT=""

for arg in "$@"; do
  case "$arg" in
    --target=temp) TARGET="temp" ;;
    --target=prod) TARGET="prod" ;;
    --target=*)    echo "Unknown --target. Use temp or prod."; exit 2 ;;
    *)             INPUT="$arg" ;;
  esac
done

if [ -z "$INPUT" ]; then
  echo "Usage: $0 [--target=temp|prod] <backup-file.sql.gz.enc>"
  exit 2
fi

if [ ! -f "$INPUT" ]; then
  echo "FATAL: backup file '$INPUT' not found."
  exit 3
fi

if [ -z "$PASSPHRASE" ]; then
  echo "FATAL: BACKUP_PASSPHRASE not set."
  exit 2
fi

if ! docker ps --format '{{.Names}}' | grep -qx "$PG_CONTAINER"; then
  echo "FATAL: Postgres container '$PG_CONTAINER' is not running."
  exit 3
fi

DEST_DB="$PG_DB"
if [ "$TARGET" = "temp" ]; then
  DEST_DB="$PG_DB_VERIFY"
  echo "[restore] target: TEMP database '$DEST_DB' (safe to overwrite)"
else
  echo "[restore] target: PRODUCTION database '$DEST_DB' (DESTRUCTIVE)"
  echo ""
  echo "This will DROP and recreate '$DEST_DB' — all current data will be lost."
  echo "You probably want to stop the API + web first so reads don't see the empty window:"
  echo "  pm2 stop ecosystem.config.cjs"
  echo ""
  read -r -p "Type 'RESTORE PROD' to confirm: " CONFIRM
  if [ "$CONFIRM" != "RESTORE PROD" ]; then
    echo "Aborted."
    exit 1
  fi
fi

# Drop + recreate destination DB (clean slate; avoids partial-merge surprises).
echo "[restore] (re)creating '$DEST_DB'…"
docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d postgres -c "DROP DATABASE IF EXISTS \"$DEST_DB\";"
docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d postgres -c "CREATE DATABASE \"$DEST_DB\" OWNER \"$PG_USER\";"

echo "[restore] streaming decrypted dump into '$DEST_DB'…"
openssl enc -d -aes-256-cbc -pbkdf2 -salt -pass "pass:$PASSPHRASE" -in "$INPUT" \
  | gunzip -c \
  | docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$DEST_DB" --quiet --single-transaction

echo "[restore] done — '$DEST_DB' restored from $INPUT"

if [ "$TARGET" = "temp" ]; then
  echo ""
  echo "To inspect: docker exec -it $PG_CONTAINER psql -U $PG_USER -d $DEST_DB"
  echo "To drop:    docker exec $PG_CONTAINER psql -U $PG_USER -d postgres -c 'DROP DATABASE \"$DEST_DB\";'"
fi
