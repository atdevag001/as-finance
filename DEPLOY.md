# Deploying AS-Finance — Staging / Production Runbook

This is the authoritative runbook for promoting `main` to a staging or
production environment. It exists because the deep audit pass added
hard environment-validation gates that the previous deploy script did
not check, and added migrations + a one-time backfill that must run
in a specific order.

If anything in this document conflicts with `scripts/deploy.sh`, follow
**this** document — `deploy.sh` is the old fast-path that skips
validation gates.

---

## 0. First-time setup (fresh production DB only — skip otherwise)

If this is the very first deploy to a brand-new database (no users yet,
no migrations applied), you'll need a super_admin to log in with after
deploy. The Prisma seed refuses to run when `NODE_ENV=production` by
design (it'd silently overwrite `password_hash` for any matching
username). Use the dedicated CLI instead:

```bash
# On the server, after the very first `pnpm install --frozen-lockfile`
# and `cd apps/api && pnpm prisma migrate deploy`
cd apps/api && pnpm create-admin
```

The CLI prompts for username / full name / mobile / email / password
and refuses to run if any active super_admin already exists. The
password input is hidden (no echo).

After it succeeds, verify by logging in directly:

```bash
curl -X POST https://asfinance.skylomedia.com/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"<the username>","password":"<the password>"}'
```

You should receive a 200 with `accessToken` and `user` in the body.

If this is **not** a fresh DB (you already have at least one
super_admin), skip this section entirely — the CLI will refuse to run
anyway.

---

## 1. Pre-deploy gates (run on your laptop, before touching the server)

### 1.1 CI / tests green

Required state on `main`:

```bash
# From the repo root
git fetch origin && git status -uno   # tree is clean, on main, up-to-date
pnpm install --frozen-lockfile
pnpm --filter @as-finance/shared build
pnpm --filter @as-finance/api test:unit
```

Expected: all 1552 unit tests pass. If anything is red, stop — diagnose
on your laptop first.

### 1.2 Secret rotation

The audit's env validator (`apps/api/src/config/env.validation.ts`) blocks
startup in `NODE_ENV=production` when any of the following is true:

| Variable          | Production requirement                                        |
| ----------------- | ------------------------------------------------------------- |
| `JWT_SECRET`      | ≥ 64 chars, **not** in `LEAKED_JWT_SECRETS`                   |
| `ENCRYPTION_KEY`  | base64 of exactly 32 random bytes, **not** equal to JWT_SECRET |
| `S3_ACCESS_KEY`   | not `minioadmin`                                              |
| `S3_SECRET_KEY`   | not `minioadmin`                                              |
| `SKIP_TOKEN_ROTATION` | must be unset or `false`                                  |

If you haven't already rotated, generate fresh values now:

```bash
./scripts/generate-prod-secrets.sh > /tmp/new-secrets.env
chmod 600 /tmp/new-secrets.env
cat /tmp/new-secrets.env   # review, then transfer securely (scp / sealed secret / SSM)
```

The generator never writes to git-tracked locations. Keep
`/tmp/new-secrets.env` off the repo and delete after applying.

### 1.3 Database backup

Migrations from this branch are forward-compatible (additive enum
values + new indexes + new FK), but back up anyway — the backfill is
a write step.

```bash
# On the server, in a one-shot terminal
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-acl \
  --file="$HOME/asfinance-pre-deploy-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

Confirm size and write the path into your deploy diary.

---

## 2. Server-side env vars to set / verify

The runtime reads env vars via `ecosystem.config.cjs`, which loads
`.env.production` (gitignored) at PM2 start time. So the values must
sit in `.env.production` on the server.

Edit `/path/to/repo/.env.production` and ensure every block below is
present:

```dotenv
# --- Application ---
NODE_ENV=production
PORT=3001

# --- Database ---
DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<db>?schema=public&sslmode=require

# --- JWT (rotate from the leaked value!) ---
JWT_SECRET=<64+ random chars from generate-prod-secrets.sh>
JWT_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=7d

# --- PII encryption (32 bytes, base64) ---
ENCRYPTION_KEY=<base64 from generate-prod-secrets.sh>

# --- S3 / MinIO (rotate from minioadmin!) ---
S3_ENDPOINT=https://s3.<region>.amazonaws.com    # or your MinIO URL
S3_REGION=ap-south-1
S3_ACCESS_KEY=<rotated>
S3_SECRET_KEY=<rotated>
S3_BUCKET=as-finance-docs

# --- SMS (optional; SMS failure never blocks finance ops) ---
SMS_API_KEY=<your value>
SMS_API_URL=https://api.<provider>.com/send
SMS_SENDER_ID=ASFIN

# --- CORS (REQUIRED — staging-deploy.sh aborts if unset) ---
# Comma-separated list of allowed browser Origins. With this unset, every
# browser POST/PATCH/PUT/DELETE returns "Origin not allowed by CORS" 500s
# from the SPA, even though server-to-server still works.
CORS_ORIGINS=https://asfinance.skylomedia.com

# --- Hard never-set-in-prod ---
# SKIP_TOKEN_ROTATION=          (leave unset)
# SKIP_KYC_CHECK=               (leave unset)
# ALLOW_PROD_SEED=              (leave unset)
```

The frontend's API URL is **build-time** for Next.js. Set it in
`apps/web/.env.production` (also gitignored) — this is consumed by
`pnpm --filter @as-finance/web build`:

```dotenv
NEXT_PUBLIC_API_URL=https://api.your-domain.com
```

---

## 3. Deploy steps (on the server)

Run from the repo root **as the user that owns the PM2 processes**:

```bash
./scripts/staging-deploy.sh
```

The script enforces this order:

1. **Capture rollback SHA**: writes current `git rev-parse HEAD` to
   `/tmp/asfinance-rollback-sha.txt`. If anything fails, `rollback.sh`
   reads this.
2. **Git pull + install**: `git pull --ff-only origin main` and
   `pnpm install --frozen-lockfile`.
3. **Build shared package first**, then API, then web. The shared
   build must finish before API/web because both import from it.
4. **Prisma generate** so the new schema enums are in the client.
5. **Pre-deploy env validation**: spawns the API with `--dry-run-env`
   (a guarded code path that calls `validateEnv()` and exits). If
   validation fails, the script aborts before any restart.
6. **Apply migrations**: `pnpm prisma migrate deploy`. Migrations from
   this branch are all additive (no DROP, no ALTER TYPE without
   defaults), so the running old code stays compatible.
7. **PM2 restart with `--update-env`**: forces PM2 to re-read
   `.env.production` via `ecosystem.config.cjs`.
8. **Wait for `/health/ready`** to return 200 with a 30-second budget.
9. **Run smoke test**: `./scripts/smoke-test.sh`. Aborts the deploy
   green-light if any smoke check fails (but does NOT auto-rollback —
   operator decides).

---

## 4. Backfill (run **after** the new code is serving)

The audit introduced `collection_allocations.penalty_id` as a typed
FK. Historical rows have it NULL. Run the backfill once per
environment, and only after the new code is up (the new code is the
only consumer that writes this column going forward).

```bash
# Dry-run first — prints what would change, no writes
cd apps/api && pnpm exec tsx ../../scripts/backfill-penalty-id.ts --dry-run

# Inspect output, then real run
cd apps/api && pnpm exec tsx ../../scripts/backfill-penalty-id.ts
```

The script is idempotent: it filters `WHERE penalty_paise > 0 AND
penalty_id IS NULL`, so repeated runs only touch un-backfilled rows.

---

## 5. Post-deploy verification

`scripts/smoke-test.sh` checks:

- `/health/live` and `/health/ready` return 200
- `/auth/login` accepts a known test credential and sets the three
  cookies (`access_token`, `refresh_token`, `csrf_token`) with the
  correct `HttpOnly`/`Secure`/`SameSite` flags
- `/dashboard` returns 200 with the access_token
- `/reversals` rejects a request missing `idempotencyKey` with 400
  (verifies the audit's contract-mismatch fix is live)
- CORS preflight from one of the allowlisted origins returns the
  expected headers
- `/healthz/version` (if you wire it) matches the deployed git SHA

For a full end-to-end run, point Playwright at the staging URL:

```bash
cd apps/web/test
BASE_URL=https://staging.your-domain.com npx playwright test \
  --project=desktop-chrome --reporter=line
```

---

## 6. Rollback

If smoke fails OR you see real-traffic errors, run:

```bash
./scripts/rollback.sh
```

It will:

1. Read `/tmp/asfinance-rollback-sha.txt`
2. `git checkout <sha>` and rebuild shared / api / web
3. `pm2 restart --update-env`
4. Verify health

Migrations are **not** rolled back. They're all additive (new enum
values + new indexes + new nullable FK + new partial index), so the
old code happily ignores them. If you need to drop a specific
migration's artifacts, do it by hand under a separate change request
once you've decided not to re-deploy.

The backfill is also forward-compatible: rolling back code does not
require un-backfilling — the old code never read or wrote the
`penalty_id` column.

---

## 7. What is NOT in scope for this runbook

- **Cloud infra changes** (LB, security groups, DNS). Coordinate with
  whoever owns those.
- **Database scaling** (read replicas, connection pool size). The
  audit added new indexes that change the query plan; confirm via
  `EXPLAIN ANALYZE` if you see a regression.
- **Secret-store integration** (Vault / AWS SSM). If you have one,
  source the values into `.env.production` from there instead of
  pasting by hand. The generator script writes to stdout exactly so
  you can pipe it into your store.

---

## 8. One-page checklist

- [ ] CI green on the SHA you're deploying
- [ ] Fresh secrets generated and stored in `.env.production`
- [ ] DB dump taken and verified (size > 0)
- [ ] `staging-deploy.sh` ran clean (validation passed, migrations
      applied, smoke green)
- [ ] Backfill dry-run reviewed, real run completed
- [ ] Playwright run against staging URL green
- [ ] Rollback SHA recorded in deploy diary
- [ ] Old `.env.production` archived (encrypted) for forensics
