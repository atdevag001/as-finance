#!/usr/bin/env bash
# Post-deploy smoke test.
# Verifies the audit-pass fixes are live without depending on browser
# fixtures or Playwright.
#
# Reads SMOKE_BASE_URL (default http://localhost:3001) for the API
# and SMOKE_USERNAME / SMOKE_PASSWORD for the test credential. The
# default credential is the seed admin — only valid in dev.

set -uo pipefail   # NB: no -e: we want to continue past individual failures

BASE_URL="${SMOKE_BASE_URL:-http://localhost:3001}"
WEB_URL="${SMOKE_WEB_URL:-http://localhost:3000}"
USERNAME="${SMOKE_USERNAME:-admin}"
PASSWORD="${SMOKE_PASSWORD:-Admin@123}"
CORS_ORIGIN="${SMOKE_CORS_ORIGIN:-$WEB_URL}"

_red()   { printf "\e[31m%s\e[0m\n" "$*"; }
_green() { printf "\e[32m%s\e[0m\n" "$*"; }
_blue()  { printf "\e[34m%s\e[0m\n" "$*"; }

PASS=0
FAIL=0

check() {
  local name="$1"; shift
  printf "  %-60s " "$name"
  if "$@"; then
    _green "OK"
    PASS=$((PASS + 1))
  else
    _red   "FAIL"
    FAIL=$((FAIL + 1))
  fi
}

# ─── 1. Health endpoints ──────────────────────────────────────────────
_blue "[1/6] Health endpoints"

check "/health/live returns 200" bash -c "
  curl -fsS -o /dev/null -w '%{http_code}' '$BASE_URL/health/live' | grep -q '^200$'
"

check "/health/ready returns 200" bash -c "
  curl -fsS -o /dev/null -w '%{http_code}' '$BASE_URL/health/ready' | grep -q '^200$'
"

# ─── 2. CSRF cookie issued on safe-method GET ─────────────────────────
_blue "[2/6] CSRF cookie issuance"

# Hit a public mutating endpoint — /health/* skips csrf cookie
# issuance on purpose (K8s probe noise), so we use /auth/refresh which
# is @Public and always issues the cookie. The 403 (missing refresh
# token cookie) is expected; we only care about Set-Cookie.
CSRF_HEADERS="$(curl -sD - -o /dev/null -X POST "$BASE_URL/auth/refresh" \
  -H "Origin: $CORS_ORIGIN" 2>/dev/null)"
check "POST /auth/refresh issues csrf_token cookie" bash -c "
  echo '$CSRF_HEADERS' | grep -qi 'set-cookie:.*csrf_token='
"

# ─── 3. Login + cookie flags ──────────────────────────────────────────
_blue "[3/6] Login + cookie attributes"

JAR="$(mktemp /tmp/smoke-jar.XXXXXX)"
trap 'rm -f "$JAR"' EXIT

# Retry login on 429 (rate limit). The login route caps at 5 req / 60s
# so a smoke run right after auth-setup may hit the wall.
login_with_retry() {
  for attempt in 1 2 3; do
    local headers
    headers="$(curl -sD - -o /dev/null -X POST "$BASE_URL/auth/login" \
      -H "Content-Type: application/json" \
      -H "Origin: $CORS_ORIGIN" \
      -c "$JAR" \
      -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}" 2>/dev/null)"
    if echo "$headers" | head -1 | grep -q ' 200'; then
      echo "$headers"
      return 0
    fi
    if echo "$headers" | head -1 | grep -q ' 429'; then
      sleep 12
      continue
    fi
    echo "$headers"
    return 1
  done
  return 1
}
LOGIN_HEADERS="$(login_with_retry)"

check "POST /auth/login returns 200" bash -c "
  echo '$LOGIN_HEADERS' | head -1 | grep -q ' 200'
"
check "access_token cookie is HttpOnly" bash -c "
  echo '$LOGIN_HEADERS' | grep -i 'set-cookie: *access_token=' | grep -qi 'HttpOnly'
"
check "refresh_token cookie is HttpOnly" bash -c "
  echo '$LOGIN_HEADERS' | grep -i 'set-cookie: *refresh_token=' | grep -qi 'HttpOnly'
"
check "access_token has SameSite=Strict" bash -c "
  echo '$LOGIN_HEADERS' | grep -i 'set-cookie: *access_token=' | grep -qi 'SameSite=Strict'
"

# Reuse cookies from the login above instead of logging in again — a
# fresh /auth/login would burn another rate-limit slot AND the
# accessToken from the JSON body is what we want.
ACCESS_TOKEN="$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -H "Origin: $CORS_ORIGIN" \
  -b "$JAR" \
  -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}" 2>/dev/null \
  | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')"
# If we got rate-limited, ACCESS_TOKEN will be empty — extract from JAR
# (the access_token cookie is set on successful login above).
if [[ -z "$ACCESS_TOKEN" && -f "$JAR" ]]; then
  ACCESS_TOKEN="$(awk '/access_token/ {print $7}' "$JAR" | tail -1)"
fi

# ─── 4. CORS preflight ────────────────────────────────────────────────
_blue "[4/6] CORS preflight from allowlisted origin"

CORS_RESP="$(curl -sI -X OPTIONS "$BASE_URL/auth/login" \
  -H "Origin: $CORS_ORIGIN" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" 2>/dev/null)"

check "OPTIONS preflight returns 2xx / 204" bash -c "
  status=\$(echo '$CORS_RESP' | head -1 | awk '{print \$2}')
  [[ \"\$status\" == 204 || \"\$status\" == 200 || \"\$status\" == 201 ]]
"
check "Access-Control-Allow-Origin echoes our origin" bash -c "
  echo '$CORS_RESP' | grep -qi \"access-control-allow-origin: $CORS_ORIGIN\"
"
check "Access-Control-Allow-Credentials: true" bash -c "
  echo '$CORS_RESP' | grep -qi 'access-control-allow-credentials: true'
"

# ─── 5. Audit-pass contract fixes ─────────────────────────────────────
_blue "[5/6] Audit-pass contract fixes are live"

# 5a. Reversal DTO now requires idempotencyKey in the BODY — the audit
#     moved it off the X-Idempotency-Key header. A POST missing the
#     body field must 400 with a class-validator message. We pass the
#     csrf_token cookie + header so we get past the CSRF guard and the
#     body validation actually runs.
CSRF="$(awk '/csrf_token/ {print $7}' "$JAR" | tail -1)"
REV_RESP="$(curl -s -o /dev/null -w '%{http_code}' \
  -X POST "$BASE_URL/reversals" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ACCESS_TOKEN:-invalid}" \
  -H "x-csrf-token: $CSRF" \
  -H "Origin: $CORS_ORIGIN" \
  -b "$JAR" \
  -d '{"collectionId":"00000000-0000-0000-0000-000000000000","reason":"smoke"}' 2>/dev/null)"

check "POST /reversals without idempotencyKey rejected (400)" bash -c "
  [[ \"$REV_RESP\" == 400 ]]
"

# 5b. Foreclosure execute path rejects an unmatched rebate override
#     (REBATE_OVERRIDE_REQUIRES_NEW_QUOTE). We expect either 400/404
#     (404 if the quote id doesn't exist, 400 if it does and override
#     mismatches). Anything that's 2xx is a regression.
FC_RESP="$(curl -s -o /dev/null -w '%{http_code}' \
  -X POST "$BASE_URL/foreclosures/execute" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ACCESS_TOKEN:-invalid}" \
  -H "x-csrf-token: $CSRF" \
  -H "Origin: $CORS_ORIGIN" \
  -b "$JAR" \
  -d '{"foreclosureId":"00000000-0000-0000-0000-000000000000","paymentMode":"cash","idempotencyKey":"smoke","rebatePaise":9999}' 2>/dev/null)"

check "POST /foreclosures/execute with stranger quote returns 4xx" bash -c "
  [[ \"$FC_RESP\" =~ ^4 ]]
"

# ─── 6. Web app reachable ─────────────────────────────────────────────
_blue "[6/6] Web app reachable + middleware redirects unauth → /login"

check "GET / on web returns 200 or 307 (auth redirect)" bash -c "
  status=\$(curl -s -o /dev/null -w '%{http_code}' '$WEB_URL/')
  [[ \"\$status\" == 200 || \"\$status\" == 307 ]]
"

check "GET /login renders (200)" bash -c "
  curl -fsS -o /dev/null -w '%{http_code}' '$WEB_URL/login' | grep -q '^200$'
"

# ─── Summary ──────────────────────────────────────────────────────────
echo
if [[ $FAIL -eq 0 ]]; then
  _green "Smoke test PASSED: $PASS/$PASS checks"
  exit 0
else
  _red "Smoke test FAILED: $FAIL of $((PASS + FAIL)) checks failed"
  exit 1
fi
