#!/bin/bash
# Pre-flight Check for E2E Tests
# Validates environment before running tests

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ERRORS=0

echo "=========================================="
echo "  AS-FINANCE E2E PRE-FLIGHT CHECK"
echo "=========================================="
echo ""

# Check 1: Node.js version
echo -n "Checking Node.js... "
NODE_VERSION=$(node --version 2>/dev/null || echo "not found")
if [[ "$NODE_VERSION" == "not found" ]]; then
  echo -e "${RED}FAIL${NC} - Node.js not installed"
  ((ERRORS++))
elif [[ ! "$NODE_VERSION" =~ ^v(18|20|22) ]]; then
  echo -e "${YELLOW}WARN${NC} - Version $NODE_VERSION (recommend v20+)"
else
  echo -e "${GREEN}OK${NC} - $NODE_VERSION"
fi

# Check 2: pnpm
echo -n "Checking pnpm... "
PNPM_VERSION=$(pnpm --version 2>/dev/null || echo "not found")
if [[ "$PNPM_VERSION" == "not found" ]]; then
  echo -e "${RED}FAIL${NC} - pnpm not installed"
  ((ERRORS++))
else
  echo -e "${GREEN}OK${NC} - v$PNPM_VERSION"
fi

# Check 3: Dependencies installed
echo -n "Checking dependencies... "
if [ -d "node_modules" ] && [ -d "apps/api/node_modules" ] && [ -d "apps/web/node_modules" ]; then
  echo -e "${GREEN}OK${NC}"
else
  echo -e "${YELLOW}WARN${NC} - Run 'pnpm install'"
fi

# Check 4: Playwright browsers
echo -n "Checking Playwright browsers... "
if [ -d "$HOME/.cache/ms-playwright" ] || [ -d "node_modules/.cache/ms-playwright" ]; then
  echo -e "${GREEN}OK${NC}"
else
  echo -e "${YELLOW}WARN${NC} - Run 'npx playwright install chromium'"
fi

# Check 5: API server
echo -n "Checking API server (port 3001)... "
if curl -s http://localhost:3001/health/live > /dev/null 2>&1; then
  echo -e "${GREEN}OK${NC}"
else
  echo -e "${RED}FAIL${NC} - Not running"
  echo "       Start with: pnpm dev:api"
  ((ERRORS++))
fi

# Check 6: Web server
echo -n "Checking Web server (port 3000)... "
if curl -s http://localhost:3000 > /dev/null 2>&1; then
  echo -e "${GREEN}OK${NC}"
else
  echo -e "${RED}FAIL${NC} - Not running"
  echo "       Start with: pnpm dev:web"
  ((ERRORS++))
fi

# Check 7: Database connectivity (via API health)
echo -n "Checking Database connectivity... "
DB_STATUS=$(curl -s http://localhost:3001/health/ready 2>/dev/null | grep -o '"database":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
if [[ "$DB_STATUS" == "up" ]] || [[ "$DB_STATUS" == "ok" ]]; then
  echo -e "${GREEN}OK${NC}"
elif [[ "$DB_STATUS" == "unknown" ]]; then
  echo -e "${YELLOW}WARN${NC} - Cannot verify (API not responding)"
else
  echo -e "${RED}FAIL${NC} - Database: $DB_STATUS"
  ((ERRORS++))
fi

# Check 8: Auth state files
echo -n "Checking auth state files... "
AUTH_FILES=$(ls apps/web/test/e2e/.auth/*.json 2>/dev/null | wc -l)
if [ "$AUTH_FILES" -ge 7 ]; then
  echo -e "${GREEN}OK${NC} - $AUTH_FILES roles cached"
else
  echo -e "${YELLOW}WARN${NC} - Only $AUTH_FILES roles cached"
  echo "       Run: cd apps/web/test && npx playwright test --project=auth-setup"
fi

# Check 9: Environment variables
echo -n "Checking environment variables... "
MISSING_VARS=""
[ -z "$DATABASE_URL" ] && [ ! -f ".env" ] && MISSING_VARS="DATABASE_URL "
[ -z "$JWT_SECRET" ] && [ ! -f ".env" ] && MISSING_VARS="${MISSING_VARS}JWT_SECRET "
if [ -z "$MISSING_VARS" ]; then
  echo -e "${GREEN}OK${NC}"
else
  echo -e "${YELLOW}WARN${NC} - Check .env file"
fi

# Check 10: Disk space
echo -n "Checking disk space... "
AVAIL_KB=$(df . | tail -1 | awk '{print $4}')
AVAIL_GB=$((AVAIL_KB / 1024 / 1024))
if [ "$AVAIL_GB" -ge 1 ]; then
  echo -e "${GREEN}OK${NC} - ${AVAIL_GB}GB available"
else
  echo -e "${YELLOW}WARN${NC} - Low disk space: ${AVAIL_GB}GB"
fi

echo ""
echo "=========================================="
if [ "$ERRORS" -eq 0 ]; then
  echo -e "${GREEN}PRE-FLIGHT CHECK PASSED${NC}"
  echo "Ready to run E2E tests!"
  exit 0
else
  echo -e "${RED}PRE-FLIGHT CHECK FAILED${NC}"
  echo "$ERRORS critical issue(s) found"
  echo ""
  echo "Fix the issues above before running tests."
  exit 1
fi
