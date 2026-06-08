#!/usr/bin/env bash
# Post-deploy verification against the actual production URL.
#
# Run this AFTER scripts/staging-deploy.sh + scripts/smoke-test.sh have
# already passed on the box. This one checks the public-facing surface:
# the same checks but against https://asfinance.skylomedia.com (or
# whatever VERIFY_BASE_URL points to) and through whatever proxy / CDN
# sits in front.
#
# Usage:
#   VERIFY_BASE_URL=https://asfinance.skylomedia.com \
#   VERIFY_USERNAME=admin VERIFY_PASSWORD=<the password> \
#     ./scripts/verify-prod.sh

set -uo pipefail

BASE_URL="${VERIFY_BASE_URL:-https://asfinance.skylomedia.com}"
API_PREFIX="${VERIFY_API_PREFIX:-/api}"
USERNAME="${VERIFY_USERNAME:-}"
PASSWORD="${VERIFY_PASSWORD:-}"

_red()   { printf "\e[31m%s\e[0m\n" "$*"; }
_green() { printf "\e[32m%s\e[0m\n" "$*"; }
_blue()  { printf "\e[34m%s\e[0m\n" "$*"; }
_yellow(){ printf "\e[33m%s\e[0m\n" "$*"; }

PASS=0
FAIL=0
WARN=0

check() {
  local name="$1"; shift
  printf "  %-65s " "$name"
  if "$@"; then
    _green "OK"
    PASS=$((PASS + 1))
  else
    _red   "FAIL"
    FAIL=$((FAIL + 1))
  fi
}

warn() {
  local name="$1"; shift
  printf "  %-65s " "$name"
  if "$@"; then
    _green "OK"
    PASS=$((PASS + 1))
  else
    _yellow "WARN"
    WARN=$((WARN + 1))
  fi
}

# ─── 1. Public surface reachable ──────────────────────────────────────
_blue "[1/7] Public surface"

check "GET ${BASE_URL}/ returns 2xx or 3xx" bash -c "
  status=\$(curl -sk -o /dev/null -w '%{http_code}' '$BASE_URL/')
  [[ \"\$status\" =~ ^[23] ]]
"

check "GET ${BASE_URL}/login returns 200" bash -c "
  curl -fsSk -o /dev/null '$BASE_URL/login'
"

check "GET ${BASE_URL}${API_PREFIX}/health/live returns 200" bash -c "
  curl -fsSk -o /dev/null '$BASE_URL$API_PREFIX/health/live'
"

check "GET ${BASE_URL}${API_PREFIX}/health/ready returns 200" bash -c "
  curl -fsSk -o /dev/null '$BASE_URL$API_PREFIX/health/ready'
"

# ─── 2. TLS / HSTS / security headers ─────────────────────────────────
_blue "[2/7] Security headers"

HEADERS="$(curl -sk -I "$BASE_URL/login" 2>/dev/null)"

check "Strict-Transport-Security present" bash -c "
  echo '$HEADERS' | grep -qi 'strict-transport-security'
"
check "X-Frame-Options present" bash -c "
  echo '$HEADERS' | grep -qi 'x-frame-options'
"
check "X-Content-Type-Options: nosniff" bash -c "
  echo '$HEADERS' | grep -qi 'x-content-type-options: nosniff'
"

# ─── 3. Auth flow via real domain ─────────────────────────────────────
_blue "[3/7] Auth flow"

if [[ -z "$USERNAME" || -z "$PASSWORD" ]]; then
  _yellow "  Skipped — VERIFY_USERNAME / VERIFY_PASSWORD not set"
else
  JAR="$(mktemp /tmp/verify-jar.XXXXXX)"
  trap 'rm -f "$JAR"' EXIT

  LOGIN_HEADERS="$(curl -sk -D - -o /dev/null -X POST "$BASE_URL$API_PREFIX/auth/login" \
    -H "Content-Type: application/json" \
    -H "Origin: $BASE_URL" \
    -c "$JAR" \
    -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}" 2>/dev/null)"

  check "POST /auth/login returns 200" bash -c "
    echo '$LOGIN_HEADERS' | head -1 | grep -q ' 200'
  "
  check "access_token cookie is HttpOnly" bash -c "
    echo '$LOGIN_HEADERS' | grep -i 'set-cookie:.*access_token=' | grep -qi 'HttpOnly'
  "
  check "access_token cookie is Secure (HTTPS prod)" bash -c "
    echo '$LOGIN_HEADERS' | grep -i 'set-cookie:.*access_token=' | grep -qi 'Secure'
  "
  check "refresh_token cookie is HttpOnly + Secure" bash -c "
    echo '$LOGIN_HEADERS' | grep -i 'set-cookie:.*refresh_token=' | grep -qi 'HttpOnly' && \
    echo '$LOGIN_HEADERS' | grep -i 'set-cookie:.*refresh_token=' | grep -qi 'Secure'
  "
  check "csrf_token cookie present (SameSite=Strict)" bash -c "
    echo '$LOGIN_HEADERS' | grep -i 'set-cookie:.*csrf_token=' | grep -qi 'SameSite=Strict'
  "
fi

# ─── 4. CORS preflight ────────────────────────────────────────────────
_blue "[4/7] CORS"

CORS_RESP="$(curl -sk -I -X OPTIONS "$BASE_URL$API_PREFIX/auth/login" \
  -H "Origin: $BASE_URL" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" 2>/dev/null)"

check "CORS preflight returns 2xx / 204" bash -c "
  status=\$(echo '$CORS_RESP' | head -1 | awk '{print \$2}')
  [[ \"\$status\" =~ ^2 ]]
"
check "Access-Control-Allow-Credentials: true" bash -c "
  echo '$CORS_RESP' | grep -qi 'access-control-allow-credentials: true'
"

# ─── 5. CSP / audit-fix verification ──────────────────────────────────
_blue "[5/7] Audit-fix contract"

# Reversal must require idempotencyKey in body (audit fix). Without auth,
# this 401s before reaching validation. We just check the route exists.
REV_STATUS="$(curl -sk -o /dev/null -w '%{http_code}' -X POST \
  "$BASE_URL$API_PREFIX/reversals" \
  -H "Content-Type: application/json" \
  -H "Origin: $BASE_URL" \
  -d '{"collectionId":"00000000-0000-0000-0000-000000000000","reason":"smoke"}' \
  2>/dev/null)"

check "POST /reversals reachable (4xx auth/csrf reject expected)" bash -c "
  [[ \"$REV_STATUS\" =~ ^4 ]]
"

# Health version (if you wire /health/version later, this will pass)
warn "GET /health/version present (optional)" bash -c "
  curl -fsSk -o /dev/null '$BASE_URL$API_PREFIX/health/version' 2>/dev/null
"

# ─── 6. DB connectivity (via ready probe) ─────────────────────────────
_blue "[6/7] DB connectivity"

READY_BODY="$(curl -sk "$BASE_URL$API_PREFIX/health/ready" 2>/dev/null)"
check "DB connection ok (ready probe body)" bash -c "
  echo '$READY_BODY' | grep -q '\"database\":\"connected\"'
"

# ─── 7. Frontend bundle present ───────────────────────────────────────
_blue "[7/7] Frontend bundle"

INDEX_HTML="$(curl -sk "$BASE_URL/login" 2>/dev/null)"
check "Login HTML contains 'AS Finance LMS'" bash -c "
  echo '$INDEX_HTML' | grep -q 'AS Finance LMS'
"
check "Login HTML references /_next/static (Next.js bundle live)" bash -c "
  echo '$INDEX_HTML' | grep -q '/_next/static'
"

# ─── Summary ──────────────────────────────────────────────────────────
echo
if [[ $FAIL -eq 0 ]]; then
  if [[ $WARN -eq 0 ]]; then
    _green "Production verification PASSED: $PASS/$PASS hard checks (0 warnings)"
  else
    _green "Production verification PASSED: $PASS/$PASS hard checks ($WARN soft warnings)"
  fi
  exit 0
else
  _red "Production verification FAILED: $FAIL of $((PASS + FAIL)) hard checks failed ($WARN warnings)"
  echo
  _yellow "Recommended next step: ./scripts/rollback.sh"
  exit 1
fi
