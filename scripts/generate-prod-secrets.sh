#!/usr/bin/env bash
# Generate fresh production-grade secrets for AS-Finance.
#
# Run on an operator laptop (offline, ideally). Output goes to stdout
# in dotenv form so you can:
#   ./scripts/generate-prod-secrets.sh > /tmp/new-secrets.env
#   chmod 600 /tmp/new-secrets.env
# then transfer to the server via scp / sealed secret / SSM.
#
# Never commit, paste into chat, or share these values.

set -euo pipefail

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl is required (apt install openssl or brew install openssl)" >&2
  exit 1
fi

# JWT_SECRET: 64 random bytes, base64-encoded → ~88 char string. The
# env validator requires ≥ 64 chars in production.
JWT_SECRET="$(openssl rand -base64 64 | tr -d '\n')"

# ENCRYPTION_KEY: exactly 32 random bytes, base64. The env validator
# rejects anything that does NOT decode to 32 bytes (AES-256-GCM key).
# Must be ≠ JWT_SECRET (env validator checks this too).
ENCRYPTION_KEY="$(openssl rand -base64 32 | tr -d '\n')"

# S3 access pair: long random strings. Format mirrors AWS access keys
# but values are random — rotate the matching IAM/MinIO credential
# server-side immediately after copying these out.
S3_ACCESS_KEY="AKIA$(openssl rand -hex 8 | tr 'a-f' 'A-F')"
S3_SECRET_KEY="$(openssl rand -base64 30 | tr -d '\n=' | head -c 40)"

cat <<EOF
# --- Generated $(date -u +%Y-%m-%dT%H:%M:%SZ) ---
# Paste into .env.production on the server. KEEP OFFLINE.
# JWT_SECRET length: ${#JWT_SECRET} chars (validator requires >=64)
# ENCRYPTION_KEY decoded length: 32 bytes (validator enforces)

JWT_SECRET=${JWT_SECRET}

ENCRYPTION_KEY=${ENCRYPTION_KEY}

# Provision these in MinIO/S3 admin THEN paste matching values here.
# The values below are random placeholders — using them as-is will
# break uploads/downloads until the bucket policy matches.
S3_ACCESS_KEY=${S3_ACCESS_KEY}
S3_SECRET_KEY=${S3_SECRET_KEY}
EOF
