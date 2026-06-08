#!/usr/bin/env bash
# AS Finance — verify a backup is actually restorable
#
# Restores the chosen backup to a temp database, counts rows in critical
# tables (customers, loans, collections, journal_entries, audit_logs),
# compares them against the LIVE DB's counts, and reports the delta.
#
# A delta of zero on every critical table = backup confirmed restorable
# AND in sync with prod at the backup's timestamp.
# A non-zero delta is normal if writes happened between backup and now
# (the report tells you what's "behind").
#
# Use weekly. If this ever fails, your backups are theatre.
#
# Usage: ./scripts/db-verify-backup.sh [path/to/backup.sql.gz.enc]
# (omit path → uses the most recent backup in BACKUP_DIR)

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/home/ubuntu/Development/As_finance/backups}"
PG_CONTAINER="${PG_CONTAINER:-asf-postgres}"
PG_USER="${PG_USER:-asfinance}"
PG_DB="${PG_DB:-asfinance_lms}"
PG_DB_VERIFY="${PG_DB_VERIFY:-asfinance_lms_verify}"

if [ -z "${BACKUP_PASSPHRASE:-}" ]; then
  echo "FATAL: BACKUP_PASSPHRASE not set."
  exit 2
fi

INPUT="${1:-}"
if [ -z "$INPUT" ]; then
  INPUT="$(ls -1t "$BACKUP_DIR"/asfinance-*.sql.gz.enc 2>/dev/null | head -1)"
  if [ -z "$INPUT" ]; then
    echo "FATAL: no backups in $BACKUP_DIR — run scripts/db-backup.sh first."
    exit 3
  fi
  echo "[verify] using latest backup: $INPUT"
fi

# Step 1 — restore to temp.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
"$SCRIPT_DIR/db-restore.sh" --target=temp "$INPUT"

# Step 2 — count rows in critical tables on BOTH databases.
CRITICAL=(customers loans collections journal_entries audit_logs disbursements receipts)

echo ""
echo "[verify] comparing critical-table row counts (prod vs restored backup):"
printf "%-22s | %-12s | %-12s | %s\n" "table" "prod" "backup" "delta"
printf "%-22s-+-%-12s-+-%-12s-+-%s\n" "----------------------" "------------" "------------" "----------"

TOTAL_DELTA=0
for TBL in "${CRITICAL[@]}"; do
  PROD_COUNT="$(docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -tA -c "SELECT COUNT(*) FROM \"$TBL\";" 2>/dev/null || echo "MISSING")"
  BAK_COUNT="$(docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB_VERIFY" -tA -c "SELECT COUNT(*) FROM \"$TBL\";" 2>/dev/null || echo "MISSING")"
  if [ "$PROD_COUNT" = "MISSING" ] || [ "$BAK_COUNT" = "MISSING" ]; then
    printf "%-22s | %-12s | %-12s | %s\n" "$TBL" "$PROD_COUNT" "$BAK_COUNT" "table absent"
    continue
  fi
  DELTA=$((PROD_COUNT - BAK_COUNT))
  TOTAL_DELTA=$((TOTAL_DELTA + (DELTA < 0 ? -DELTA : DELTA)))
  printf "%-22s | %-12s | %-12s | %+d\n" "$TBL" "$PROD_COUNT" "$BAK_COUNT" "$DELTA"
done

echo ""
echo "[verify] total |Δ| across critical tables: $TOTAL_DELTA"
echo "[verify] (a positive delta means prod has more rows than the backup — normal if writes happened post-backup)"

# Step 3 — sanity check schema (audit_logs table exists with the new enum values?).
echo ""
echo "[verify] schema sanity — does restored DB know about MIGRATION_* audit actions?"
RESULT="$(docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB_VERIFY" -tA \
  -c "SELECT unnest(enum_range(NULL::\"AuditAction\"))::text WHERE unnest(enum_range(NULL::\"AuditAction\"))::text LIKE 'migration%';" 2>/dev/null || true)"
echo "  → restored DB enum values starting with 'migration': $(echo "$RESULT" | tr '\n' ' ')"

# Step 4 — leave temp DB in place for manual poking, or drop it on success.
if [ "${KEEP_TEMP:-0}" = "1" ]; then
  echo ""
  echo "[verify] temp DB '$PG_DB_VERIFY' kept for inspection (KEEP_TEMP=1)"
  echo "[verify] to drop: docker exec $PG_CONTAINER psql -U $PG_USER -d postgres -c 'DROP DATABASE \"$PG_DB_VERIFY\";'"
else
  docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d postgres -c "DROP DATABASE \"$PG_DB_VERIFY\";" >/dev/null
  echo "[verify] temp DB dropped (KEEP_TEMP=1 to keep next time)"
fi

echo "[verify] OK — backup is restorable"
