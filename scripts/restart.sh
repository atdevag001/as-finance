#!/bin/bash
# Quick restart PM2 without rebuilding
# Usage: ./scripts/restart.sh

cd "$(dirname "${BASH_SOURCE[0]}")/.."

echo "Restarting PM2 processes..."
pm2 restart ecosystem.config.cjs --env production
pm2 list
