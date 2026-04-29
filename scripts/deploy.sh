#!/bin/bash
set -e

# AS-Finance Deployment Script
# Usage: ./scripts/deploy.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

echo "=========================================="
echo "  AS-Finance Deployment"
echo "  $(date)"
echo "=========================================="

# Step 1: Pull latest code
echo ""
echo "[1/6] Pulling latest code..."
git pull origin main

# Step 2: Install dependencies
echo ""
echo "[2/6] Installing dependencies..."
pnpm install --frozen-lockfile

# Step 3: Build API
echo ""
echo "[3/6] Building API..."
pnpm --filter @as-finance/api build

# Step 4: Build Web
echo ""
echo "[4/6] Building Web..."
pnpm --filter @as-finance/web build

# Step 5: Restart PM2 processes
echo ""
echo "[5/6] Restarting PM2 processes..."
pm2 restart ecosystem.config.cjs --env production

# Step 6: Verify status
echo ""
echo "[6/6] Verifying deployment..."
sleep 3
pm2 list

echo ""
echo "=========================================="
echo "  Deployment Complete!"
echo "=========================================="
echo ""
echo "API: http://localhost:3001"
echo "Web: http://localhost:3000"
echo ""

# Show recent logs
pm2 logs --lines 5 --nostream
