#!/usr/bin/env bash
# Staging / production deploy with verification gates.
# Run from the repo root on the server.
#
# Order:
#   1.  capture rollback SHA
#   2.  git pull + install
#   3.  build (shared first, then api, then web)
#   4.  prisma generate
#   5.  validate env (refuses to proceed if validation fails)
#   6.  apply migrations
#   7.  pm2 restart --update-env
#   8.  wait for /health/ready
#   9.  smoke test
#
# If any step fails, the script exits non-zero WITHOUT restarting PM2
# beyond step 7. Use scripts/rollback.sh to roll back.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# ──────────────────────────────────────────────────────────────────────
# colored output helpers (no external deps)
# ──────────────────────────────────────────────────────────────────────
_red()   { printf "\e[31m%s\e[0m\n" "$*"; }
_green() { printf "\e[32m%s\e[0m\n" "$*"; }
_blue()  { printf "\e[34m%s\e[0m\n" "$*"; }
_yellow(){ printf "\e[33m%s\e[0m\n" "$*"; }
_step()  { printf "\n\e[1m[%s/9] %s\e[0m\n" "$1" "$2"; }

abort() { _red "DEPLOY ABORTED: $*"; exit 1; }

# ──────────────────────────────────────────────────────────────────────
# 1. capture rollback SHA
# ──────────────────────────────────────────────────────────────────────
_step 1 "Capture rollback SHA"
ROLLBACK_SHA="$(git rev-parse HEAD)"
echo "$ROLLBACK_SHA" > /tmp/asfinance-rollback-sha.txt
_green "  rollback SHA → $ROLLBACK_SHA  (saved to /tmp/asfinance-rollback-sha.txt)"

# ──────────────────────────────────────────────────────────────────────
# 2. git pull + install
# ──────────────────────────────────────────────────────────────────────
_step 2 "git pull + pnpm install"
git fetch origin || abort "git fetch failed"
LOCAL_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[[ "$LOCAL_BRANCH" == "main" ]] || abort "expected to be on main, on $LOCAL_BRANCH"
git pull --ff-only origin main || abort "fast-forward pull failed (uncommitted local changes?)"
pnpm install --frozen-lockfile || abort "pnpm install failed"
TARGET_SHA="$(git rev-parse HEAD)"
echo "  deploying $ROLLBACK_SHA  →  $TARGET_SHA"

# ──────────────────────────────────────────────────────────────────────
# 3. build (shared first — api/web import from it)
# ──────────────────────────────────────────────────────────────────────
_step 3 "Build shared / api / web"
pnpm --filter @as-finance/shared build || abort "shared build failed"
pnpm --filter @as-finance/api build    || abort "api build failed"
pnpm --filter @as-finance/web build    || abort "web build failed"

# ──────────────────────────────────────────────────────────────────────
# 4. prisma generate (so dist/ uses the latest schema enums)
# ──────────────────────────────────────────────────────────────────────
_step 4 "Prisma generate"
(cd apps/api && pnpm prisma generate) || abort "prisma generate failed"

# ──────────────────────────────────────────────────────────────────────
# 5. env validation gate
# ──────────────────────────────────────────────────────────────────────
_step 5 "Validate .env.production against env schema"
if [[ ! -f .env.production ]]; then
  abort ".env.production missing — see DEPLOY.md §2"
fi
# Run the validator in a one-shot node process. --env-file is native
# in Node 20+ so we don't need to add `dotenv` as a runtime dep.
# Exits non-zero if any required field fails the zod schema.
node --env-file=.env.production -e "
  const { validateEnv } = require('./apps/api/dist/config/env.validation.js');
  validateEnv();
  console.error('  env validation: OK');
" || abort "env validation failed — see error above, fix .env.production, re-run"

# CORS_ORIGINS is optional in the schema, but unset in production means
# every browser request from the frontend fails with 'Origin not allowed
# by CORS'. Warn loudly — operator can pass DEPLOY_ALLOW_NO_CORS=1 to
# acknowledge they really meant no browser access.
if ! grep -qE '^CORS_ORIGINS=.+' .env.production; then
  if [[ "${DEPLOY_ALLOW_NO_CORS:-}" == "1" ]]; then
    _yellow "  CORS_ORIGINS unset — DEPLOY_ALLOW_NO_CORS=1 acknowledges this"
  else
    abort "CORS_ORIGINS is not set in .env.production. Browser frontends will get 500 on every request. Set CORS_ORIGINS=https://your-frontend-domain (comma-separated for multiple) OR re-run with DEPLOY_ALLOW_NO_CORS=1 if this is server-to-server only."
  fi
fi
_green "  env validation passed"

# ──────────────────────────────────────────────────────────────────────
# 6. migrations
# ──────────────────────────────────────────────────────────────────────
_step 6 "Apply migrations"
(cd apps/api && pnpm prisma migrate deploy) || abort "prisma migrate deploy failed"

# ──────────────────────────────────────────────────────────────────────
# 7. pm2 restart with --update-env
# ──────────────────────────────────────────────────────────────────────
_step 7 "pm2 restart (--update-env forces re-read of .env.production)"
pm2 startOrReload ecosystem.config.cjs --update-env || \
  pm2 restart ecosystem.config.cjs --update-env || \
  abort "pm2 restart failed"
sleep 3
pm2 list

# ──────────────────────────────────────────────────────────────────────
# 8. wait for /health/ready
# ──────────────────────────────────────────────────────────────────────
_step 8 "Wait for /health/ready (30s budget)"
HEALTHY=false
for i in $(seq 1 15); do
  if curl -fsS http://localhost:3001/health/ready >/dev/null 2>&1; then
    HEALTHY=true
    break
  fi
  printf "."
  sleep 2
done
echo
if ! $HEALTHY; then
  pm2 logs asfinance-api --lines 30 --nostream
  abort "/health/ready did not return 200 within 30s — check PM2 logs above"
fi
_green "  /health/ready 200 OK"

# ──────────────────────────────────────────────────────────────────────
# 9. smoke test
# ──────────────────────────────────────────────────────────────────────
_step 9 "Smoke test"
if [[ -x "$SCRIPT_DIR/smoke-test.sh" ]]; then
  "$SCRIPT_DIR/smoke-test.sh" || abort "smoke test failed — investigate, optionally run rollback.sh"
else
  _yellow "  scripts/smoke-test.sh missing or not executable — skipping"
fi

# ──────────────────────────────────────────────────────────────────────
# done
# ──────────────────────────────────────────────────────────────────────
echo
_green "================================================================"
_green "  Deploy complete: $ROLLBACK_SHA → $TARGET_SHA"
_green "================================================================"
echo
_blue "Next manual steps (NOT automated — operator judgment):"
echo "  1. Run the penalty_id backfill (idempotent):"
echo "       cd apps/api && pnpm exec tsx ../../scripts/backfill-penalty-id.ts --dry-run"
echo "       cd apps/api && pnpm exec tsx ../../scripts/backfill-penalty-id.ts"
echo
echo "  2. Point Playwright at staging:"
echo "       cd apps/web/test && BASE_URL=https://staging.your-domain.com \\"
echo "         npx playwright test --project=desktop-chrome --reporter=line"
echo
echo "  3. If anything looks wrong: ./scripts/rollback.sh"
