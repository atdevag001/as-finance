# Backup & Restore Runbook

> Live system: `asfinance.skylomedia.com` (PostgreSQL in container `asf-postgres`).
> Backup story is daily encrypted dumps under `/home/ubuntu/Development/As_finance/backups/`, 14-day retention.

## TL;DR

| Want to… | Run |
|---|---|
| Take a backup right now | `BACKUP_PASSPHRASE='...' ./scripts/db-backup.sh` |
| Verify the latest backup is actually restorable | `BACKUP_PASSPHRASE='...' ./scripts/db-verify-backup.sh` |
| Restore a backup to a TEMP db (safe, for inspection) | `BACKUP_PASSPHRASE='...' ./scripts/db-restore.sh --target=temp backups/asfinance-...sql.gz.enc` |
| Restore a backup to LIVE prod (destructive) | `BACKUP_PASSPHRASE='...' ./scripts/db-restore.sh --target=prod backups/asfinance-...sql.gz.enc` |

## What gets backed up

`pg_dump` of the `asfinance_lms` database, including schema + data, but NOT roles/privileges (`--no-owner --no-privileges` — keeps the dump portable across environments). Output is streamed straight into:

```
pg_dump → gzip -9 → openssl AES-256-CBC (PBKDF2) → backups/asfinance-<UTC-timestamp>.sql.gz.enc
```

Plaintext SQL never touches disk. The encryption passphrase is read from `BACKUP_PASSPHRASE`, which must NOT be the same string as anything else in `.env.production` (otherwise compromise of one leaks both).

What's NOT in the backup:
- MinIO blob storage (KYC documents). Back those up separately with `mc mirror` to a second bucket.
- PM2 logs (rotate via logrotate, not here).
- `.env.production` (back THAT up via a separate, even-more-careful out-of-band channel — losing it is recoverable, leaking it is not).

## Setting up the daily cron

1. Pick a strong passphrase, append it to `.env.production`:
   ```
   BACKUP_PASSPHRASE=<at-least-32-random-chars-from-a-password-manager>
   ```
   **STORE THIS PASSPHRASE OUT OF BAND.** If you lose it AND the server dies, the backups are uselessly opaque. Put a copy in a password manager + a sealed envelope.

2. Add to crontab (`crontab -e`):
   ```
   0 2 * * * cd /home/ubuntu/Development/As_finance && set -a && . ./.env.production && set +a && ./scripts/db-backup.sh >> /var/log/asfinance-backup.log 2>&1
   ```
   This runs daily at 02:00 UTC (07:30 IST). `set -a` exports every var in `.env.production` so `BACKUP_PASSPHRASE` is visible to the script.

3. Create the log file with the right permissions:
   ```
   sudo touch /var/log/asfinance-backup.log
   sudo chown ubuntu:ubuntu /var/log/asfinance-backup.log
   ```

## Weekly restore drill (BLOCKER — do not skip)

A backup you never restored is not a backup. Schedule a recurring task — every Sunday at 09:00 IST is a fine slot — to run:

```bash
cd /home/ubuntu/Development/As_finance
set -a && . ./.env.production && set +a
./scripts/db-verify-backup.sh
```

The script:
1. Restores the most recent backup into a temporary DB `asfinance_lms_verify`.
2. Compares row counts in critical tables (customers, loans, collections, journal_entries, audit_logs, disbursements, receipts) against the LIVE DB.
3. Reports the per-table delta. Positive deltas are normal (rows written since backup). MISSING tables or schema mismatches mean the backup is broken — investigate immediately.
4. Drops the temp DB on success (pass `KEEP_TEMP=1` to keep it for inspection).

**If `db-verify-backup.sh` ever fails, treat it as a P0**: the daily backups have been silently broken, and depending on how long, recovery may not be possible. Run a fresh backup, verify it, and find the regression.

## Restoring after a real incident

If prod is corrupt / dropped table / ransomware:

1. **Stop traffic.** `pm2 stop ecosystem.config.cjs` — readers won't see the rebuild window.
2. **Take an emergency backup of the broken state.** This is forensically useful even if you don't plan to use it.
   ```
   ./scripts/db-backup.sh
   mv backups/asfinance-<latest>.sql.gz.enc backups/asfinance-BROKEN-<timestamp>.sql.gz.enc
   ```
3. **Pick the right backup.** Latest known-good — use `db-verify-backup.sh <file>` to confirm before restoring to prod.
4. **Restore to prod.**
   ```
   ./scripts/db-restore.sh --target=prod backups/asfinance-<chosen>.sql.gz.enc
   ```
   Script asks you to type `RESTORE PROD` to confirm.
5. **Apply any post-backup migrations.** If your schema has migrations newer than the backup, run them:
   ```
   cd apps/api && pnpm prisma migrate deploy
   ```
6. **Restart traffic.** `pm2 start ecosystem.config.cjs`.
7. **Verify.** `bash scripts/verify-prod.sh` + spot-check that today's recent collections are visible (they probably aren't — that's data loss; communicate it to operators).

## Rotation

`db-backup.sh` deletes any `asfinance-*.sql.gz.enc` older than `BACKUP_RETAIN_DAYS` (default 14). To keep a longer history:

- Mirror weekly: `cp backups/asfinance-<Sunday>.sql.gz.enc /mnt/long-term/`
- Or push to S3: `aws s3 cp backups/asfinance-<timestamp>.sql.gz.enc s3://asfinance-backups/`

S3 with object-lock = tamper-proof backups. Recommended for compliance.

## Restore-drill log template

Each verify run should produce a one-liner in `/var/log/asfinance-restore-drills.log`:

```
2026-06-15  OK  delta=4 (4 new collections since backup)
2026-06-22  OK  delta=11
2026-06-29  FAIL ─ audit_logs MISSING (schema drift!)
```

If you see a FAIL line, treat it as the page-on-call signal.

## Failure modes this guards against

| Failure | Mitigation |
|---|---|
| Disk dies | Latest daily backup |
| Schema migration deletes data | Latest pre-migration backup + verify drill |
| Operator runs DELETE without WHERE | Hourly Postgres WAL would be better; daily is the minimum |
| Ransomware encrypts /home | Off-box mirror (S3 with object-lock) |
| Backup passphrase forgotten | NOTHING — passphrase loss = total loss. Store it in 2 places. |
| Backup file never actually written | Stale `.partial` guard in `db-backup.sh` + cron log review |
| "We have backups" but never tested | `db-verify-backup.sh` weekly drill |
