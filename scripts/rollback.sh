#!/usr/bin/env bash
# Rollback the most recent staging-deploy.sh run.
#
# Reads the rollback SHA from /tmp/asfinance-rollback-sha.txt, checks
# it out, rebuilds, restarts PM2.
#
# Migrations are intentionally NOT rolled back — the audit's migrations
# are all additive (new enum values, new indexes, new nullable FK),
# safe for the old code to ignore. If you ever need to undo a specific
# migration, do it manually under a separate change request.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

_red()   { printf "\e[31m%s\e[0m\n" "$*"; }
_green() { printf "\e[32m%s\e[0m\n" "$*"; }
_blue()  { printf "\e[34m%s\e[0m\n" "$*"; }

SHA_FILE="/tmp/asfinance-rollback-sha.txt"

if [[ ! -f "$SHA_FILE" ]]; then
  _red "No rollback SHA found at $SHA_FILE."
  _red "If you know the target SHA, run:"
  _red "  echo <sha> > $SHA_FILE && $0"
  exit 1
fi

ROLLBACK_SHA="$(cat "$SHA_FILE")"
CURRENT_SHA="$(git rev-parse HEAD)"

if [[ "$ROLLBACK_SHA" == "$CURRENT_SHA" ]]; then
  _green "Already at $ROLLBACK_SHA — nothing to do."
  exit 0
fi

_blue "Rolling back $CURRENT_SHA → $ROLLBACK_SHA"
echo

# Safety: refuse to clobber uncommitted work
if ! git diff --quiet HEAD; then
  _red "Working tree has uncommitted changes — refusing to checkout."
  _red "Stash or commit them first, then re-run."
  git status -s
  exit 1
fi

git fetch origin
git checkout "$ROLLBACK_SHA" || { _red "git checkout failed"; exit 1; }

_blue "Re-installing deps"
pnpm install --frozen-lockfile

_blue "Re-building shared / api / web"
pnpm --filter @as-finance/shared build
pnpm --filter @as-finance/api build
pnpm --filter @as-finance/web build
(cd apps/api && pnpm prisma generate)

_blue "Restarting PM2 with --update-env"
pm2 restart ecosystem.config.cjs --update-env

sleep 3
_blue "Health check"
for i in $(seq 1 15); do
  if curl -fsS http://localhost:3001/health/ready >/dev/null 2>&1; then
    _green "Rollback complete — /health/ready 200 OK"
    pm2 list
    exit 0
  fi
  printf "."
  sleep 2
done

_red "Rolled back to $ROLLBACK_SHA but /health/ready never came up."
_red "Inspect: pm2 logs asfinance-api --lines 50"
exit 1
