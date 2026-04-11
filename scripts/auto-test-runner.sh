#!/bin/bash
# Autonomous Test Runner for as-finance
# This script orchestrates the test-analyze-fix cycle

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
MAX_ITERATIONS=10
COVERAGE_TARGET=80
RESULTS_DIR="test-results"
LOG_FILE="$RESULTS_DIR/auto-test.log"

# Create results directory
mkdir -p "$RESULTS_DIR"

log() {
  echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

warning() {
  echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
  echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
}

# Phase 1: Run Unit Tests
run_unit_tests() {
  log "Running API unit tests..."
  pnpm --filter @as-finance/api test:unit 2>&1 | tee "$RESULTS_DIR/unit-tests.txt" || true

  if grep -q "FAIL" "$RESULTS_DIR/unit-tests.txt"; then
    warning "Unit test failures detected"
    return 1
  fi
  success "Unit tests passed"
  return 0
}

# Phase 2: Run E2E Tests
run_e2e_tests() {
  log "Running Playwright E2E tests..."
  cd apps/web/test
  npx playwright test --project=desktop-chrome --reporter=list 2>&1 | tee "../../../$RESULTS_DIR/e2e-tests.txt" || true
  cd ../../..

  if grep -q "failed" "$RESULTS_DIR/e2e-tests.txt"; then
    warning "E2E test failures detected"
    return 1
  fi
  success "E2E tests passed"
  return 0
}

# Phase 3: Analyze Coverage
analyze_coverage() {
  log "Analyzing test coverage..."

  # Count pages
  TOTAL_PAGES=$(find apps/web/src/app -name "page.tsx" | wc -l)

  # Count E2E specs
  E2E_SPECS=$(ls apps/web/test/e2e/*.spec.ts apps/web/test/e2e/*.playwright.spec.ts 2>/dev/null | wc -l)

  # Calculate coverage
  COVERAGE=$((E2E_SPECS * 100 / TOTAL_PAGES))

  log "Pages: $TOTAL_PAGES | E2E Specs: $E2E_SPECS | Coverage: $COVERAGE%"

  if [ "$COVERAGE" -lt "$COVERAGE_TARGET" ]; then
    warning "Coverage below target ($COVERAGE% < $COVERAGE_TARGET%)"
    return 1
  fi
  success "Coverage target met: $COVERAGE%"
  return 0
}

# Phase 4: Extract Failures
extract_failures() {
  log "Extracting test failures..."

  # Extract failed tests from results
  grep -E "FAIL|failed|Error:" "$RESULTS_DIR/unit-tests.txt" "$RESULTS_DIR/e2e-tests.txt" 2>/dev/null > "$RESULTS_DIR/failures.txt" || true

  FAILURE_COUNT=$(wc -l < "$RESULTS_DIR/failures.txt")
  log "Found $FAILURE_COUNT failure(s)"

  return "$FAILURE_COUNT"
}

# Phase 5: Generate Report
generate_report() {
  log "Generating test report..."

  cat > "$RESULTS_DIR/report.md" << EOF
# Autonomous Test Report
Generated: $(date)

## Summary
- Unit Tests: $(grep -c "PASS\|FAIL" "$RESULTS_DIR/unit-tests.txt" 2>/dev/null || echo "N/A")
- E2E Tests: $(grep -c "passed\|failed" "$RESULTS_DIR/e2e-tests.txt" 2>/dev/null || echo "N/A")
- Coverage: $COVERAGE%

## Failures
$(cat "$RESULTS_DIR/failures.txt" 2>/dev/null || echo "None")

## Next Actions
$(if [ -s "$RESULTS_DIR/failures.txt" ]; then echo "- Fix failing tests"; else echo "- All tests passing"; fi)
$(if [ "$COVERAGE" -lt "$COVERAGE_TARGET" ]; then echo "- Generate more tests to reach $COVERAGE_TARGET% coverage"; fi)
EOF

  success "Report generated: $RESULTS_DIR/report.md"
}

# Phase 0: Check Auth Token Freshness
check_auth_freshness() {
  log "Checking auth token freshness..."
  AUTH_MAX_AGE_SEC=600  # 10 minutes
  STALE_COUNT=0

  for role in manager super_admin field_officer; do
    AUTH_FILE="apps/web/test/e2e/.auth/${role}.json"
    if [ -f "$AUTH_FILE" ]; then
      FILE_AGE=$(( $(date +%s) - $(stat -c %Y "$AUTH_FILE" 2>/dev/null || stat -f %m "$AUTH_FILE" 2>/dev/null) ))
      if [ "$FILE_AGE" -gt "$AUTH_MAX_AGE_SEC" ]; then
        STALE_COUNT=$((STALE_COUNT + 1))
      fi
    else
      STALE_COUNT=$((STALE_COUNT + 1))
    fi
  done

  if [ "$STALE_COUNT" -gt 0 ]; then
    warning "Auth tokens stale or missing. Refreshing..."
    rm -f apps/web/test/e2e/.auth/*.json
    cd apps/web/test && npx playwright test --project=auth-setup 2>&1 | tee "$RESULTS_DIR/auth-setup.txt" || true
    cd ../../..
    success "Auth tokens refreshed"
  else
    success "Auth tokens are fresh"
  fi
}

# Main Loop
main() {
  log "Starting Autonomous Test Cycle"
  log "Target Coverage: $COVERAGE_TARGET%"
  log "Max Iterations: $MAX_ITERATIONS"

  # Phase 0: Check and refresh auth
  check_auth_freshness

  for iteration in $(seq 1 $MAX_ITERATIONS); do
    log "=== ITERATION $iteration ==="

    # Run tests
    run_unit_tests
    UNIT_STATUS=$?

    run_e2e_tests
    E2E_STATUS=$?

    # Analyze
    analyze_coverage
    COVERAGE_STATUS=$?

    extract_failures
    FAILURE_COUNT=$?

    # Check completion
    if [ "$UNIT_STATUS" -eq 0 ] && [ "$E2E_STATUS" -eq 0 ] && [ "$COVERAGE_STATUS" -eq 0 ]; then
      success "All targets met! Cycle complete."
      break
    fi

    # Generate intermediate report
    generate_report

    log "Iteration $iteration complete. Failures: $FAILURE_COUNT"

    # If failures exist, they need manual/Claude intervention
    if [ "$FAILURE_COUNT" -gt 0 ]; then
      warning "Test failures require intervention. Run Claude Code with:"
      echo "  Analyze failures in test-results/failures.txt and fix them"
      break
    fi
  done

  generate_report
  log "Autonomous Test Cycle finished"
}

# Run
main "$@"
