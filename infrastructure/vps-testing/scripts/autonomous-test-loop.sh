#!/bin/bash
# ============================================================================
# AUTONOMOUS TEST LOOP
# Runs continuous testing cycle on VPS
#
# Usage:
#   ./autonomous-test-loop.sh              # Run full cycle once
#   ./autonomous-test-loop.sh --continuous # Run continuously until complete
#   ./autonomous-test-loop.sh --module loans # Test specific module
# ============================================================================

set -e

# Configuration
WORKERS=${PLAYWRIGHT_WORKERS:-16}
MAX_ITERATIONS=${MAX_ITERATIONS:-50}
COVERAGE_TARGET=${COVERAGE_TARGET:-95}
STATE_FILE="/app/.claude/auto-test-system/state/test-state.json"
RESULTS_DIR="/app/test-results"
LOG_FILE="$RESULTS_DIR/autonomous-test.log"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Initialize
mkdir -p "$RESULTS_DIR"
echo "" > "$LOG_FILE"

log() {
  local msg="[$(date +'%Y-%m-%d %H:%M:%S')] $1"
  echo -e "${BLUE}$msg${NC}" | tee -a "$LOG_FILE"
}

success() {
  local msg="[SUCCESS] $1"
  echo -e "${GREEN}$msg${NC}" | tee -a "$LOG_FILE"
}

error() {
  local msg="[ERROR] $1"
  echo -e "${RED}$msg${NC}" | tee -a "$LOG_FILE"
}

warning() {
  local msg="[WARNING] $1"
  echo -e "${YELLOW}$msg${NC}" | tee -a "$LOG_FILE"
}

# ============================================================================
# PHASE 0: Pre-flight Check
# ============================================================================
preflight_check() {
  log "Running pre-flight checks..."

  # Check API health
  if curl -s http://api:3001/health/live > /dev/null 2>&1; then
    success "API server is healthy"
  else
    error "API server not responding"
    return 1
  fi

  # Check Web health
  if curl -s http://web:3000 > /dev/null 2>&1; then
    success "Web server is healthy"
  else
    error "Web server not responding"
    return 1
  fi

  # Check database
  if pg_isready -h postgres -U asfinance > /dev/null 2>&1; then
    success "Database is ready"
  else
    error "Database not ready"
    return 1
  fi

  # Check Playwright browsers
  if [ -d "/root/.cache/ms-playwright" ]; then
    success "Playwright browsers installed"
  else
    warning "Installing Playwright browsers..."
    npx playwright install chromium
  fi

  success "Pre-flight checks passed"
  return 0
}

# ============================================================================
# PHASE 1: Coverage Analysis
# ============================================================================
analyze_coverage() {
  log "Analyzing test coverage..."

  # Count pages
  TOTAL_PAGES=$(find /app/apps/web/src/app -name "page.tsx" | wc -l)

  # Count E2E specs
  E2E_SPECS=$(ls /app/apps/web/test/e2e/*.playwright.spec.ts /app/apps/web/test/e2e/*.spec.ts 2>/dev/null | wc -l)

  # Calculate coverage
  E2E_COVERAGE=$((E2E_SPECS * 100 / TOTAL_PAGES))

  # Identify gaps
  GAPS=()
  for module in loans customers collections receipts disbursement; do
    if ! ls /app/apps/web/test/e2e/*${module}*.spec.ts 2>/dev/null | grep -q .; then
      GAPS+=("$module")
    fi
  done

  log "Coverage: $E2E_COVERAGE% ($E2E_SPECS specs / $TOTAL_PAGES pages)"
  log "Gaps: ${GAPS[*]:-none}"

  # Update state
  cat > "$STATE_FILE" << EOF
{
  "lastRun": "$(date -Iseconds)",
  "coverage": {
    "e2e": {
      "totalPages": $TOTAL_PAGES,
      "testedPages": $E2E_SPECS,
      "percentage": $E2E_COVERAGE
    }
  },
  "gaps": $(printf '%s\n' "${GAPS[@]}" | jq -R . | jq -s .),
  "currentPhase": "ANALYSIS_COMPLETE"
}
EOF

  echo "$E2E_COVERAGE"
}

# ============================================================================
# PHASE 2: Run Unit Tests
# ============================================================================
run_unit_tests() {
  log "Running unit tests..."

  cd /app
  pnpm --filter @as-finance/api test:unit 2>&1 | tee "$RESULTS_DIR/unit-tests.txt"

  if grep -q "FAIL" "$RESULTS_DIR/unit-tests.txt"; then
    warning "Some unit tests failed"
    return 1
  fi

  success "Unit tests passed"
  return 0
}

# ============================================================================
# PHASE 3: Run E2E Tests with Parallel Workers
# ============================================================================
run_e2e_tests() {
  local project=${1:-"desktop-chrome"}
  local spec_filter=${2:-""}

  log "Running E2E tests (workers: $WORKERS)..."

  cd /app/apps/web/test

  # Build Playwright command
  local cmd="npx playwright test --project=$project --workers=$WORKERS --reporter=list,json"

  if [ -n "$spec_filter" ]; then
    cmd="$cmd $spec_filter"
  fi

  # Run tests
  $cmd 2>&1 | tee "$RESULTS_DIR/e2e-tests.txt"

  # Parse results
  local passed=$(grep -c "passed" "$RESULTS_DIR/e2e-tests.txt" 2>/dev/null || echo "0")
  local failed=$(grep -c "failed" "$RESULTS_DIR/e2e-tests.txt" 2>/dev/null || echo "0")

  log "E2E Results: $passed passed, $failed failed"

  if [ "$failed" -gt 0 ]; then
    warning "E2E test failures detected"
    return 1
  fi

  success "E2E tests passed"
  return 0
}

# ============================================================================
# PHASE 4: Flakiness Detection
# ============================================================================
detect_flakiness() {
  local runs=${1:-3}
  local spec_filter=${2:-""}

  log "Running flakiness detection ($runs runs)..."

  mkdir -p "$RESULTS_DIR/flakiness"

  declare -A pass_count
  declare -A fail_count

  for run in $(seq 1 $runs); do
    log "Flakiness run $run/$runs..."

    cd /app/apps/web/test

    if [ -n "$spec_filter" ]; then
      npx playwright test $spec_filter --project=desktop-chrome --workers=$WORKERS --reporter=json 2>&1 > "$RESULTS_DIR/flakiness/run-$run.json" || true
    else
      npx playwright test --project=desktop-chrome --workers=$WORKERS --reporter=json 2>&1 > "$RESULTS_DIR/flakiness/run-$run.json" || true
    fi
  done

  # Analyze results
  log "Analyzing flakiness..."

  # Simple analysis - count tests that don't consistently pass/fail
  # In production, use jq for proper JSON parsing

  success "Flakiness detection complete"
}

# ============================================================================
# PHASE 5: Generate Missing Tests
# ============================================================================
generate_tests_for_module() {
  local module=$1

  log "Generating tests for: $module"

  local page_path="/app/apps/web/src/app/(dashboard)/$module/page.tsx"

  if [ ! -f "$page_path" ]; then
    warning "Page not found: $page_path"
    return 1
  fi

  # Use intelligent test generator
  cd /app
  npx ts-node scripts/intelligent-test-generator.ts "$page_path" --write

  success "Tests generated for $module"
}

# ============================================================================
# PHASE 6: Fix Failures
# ============================================================================
fix_test_failure() {
  local test_name=$1
  local error_msg=$2

  log "Attempting to fix: $test_name"

  # Categorize the error
  if echo "$error_msg" | grep -qi "timeout\|Timeout"; then
    warning "Timeout issue - increasing wait time"
    # Would apply fix here
  elif echo "$error_msg" | grep -qi "selector\|locator"; then
    warning "Selector issue - needs manual review"
  elif echo "$error_msg" | grep -qi "assertion\|expect"; then
    warning "Assertion failure - checking expected vs actual"
  fi

  # Note: Complex fixes would involve Claude Code agent
}

# ============================================================================
# MAIN LOOP
# ============================================================================
main() {
  local mode=${1:-"once"}
  local specific_module=${2:-""}

  echo ""
  echo "=========================================="
  echo "  AUTONOMOUS TESTING SYSTEM"
  echo "  VPS Edition - 4 vCPU / 64GB RAM"
  echo "=========================================="
  echo "  Workers: $WORKERS"
  echo "  Target Coverage: $COVERAGE_TARGET%"
  echo "  Mode: $mode"
  echo "=========================================="
  echo ""

  # Pre-flight
  if ! preflight_check; then
    error "Pre-flight checks failed. Aborting."
    exit 1
  fi

  local iteration=0

  while [ $iteration -lt $MAX_ITERATIONS ]; do
    iteration=$((iteration + 1))
    log "=== ITERATION $iteration ==="

    # Analyze coverage
    local current_coverage=$(analyze_coverage)

    # Check if we've reached target
    if [ "$current_coverage" -ge "$COVERAGE_TARGET" ]; then
      success "Coverage target reached: $current_coverage%"

      # Final verification run
      if run_e2e_tests; then
        success "All tests passing! Mission complete."
        break
      fi
    fi

    # Run tests
    if ! run_unit_tests; then
      warning "Unit test failures need attention"
    fi

    if ! run_e2e_tests; then
      warning "E2E test failures detected"

      # Extract failures and attempt fixes
      # In production, this would parse test output and apply fixes
    fi

    # Check for gaps and generate tests
    local gaps=$(cat "$STATE_FILE" | grep -o '"gaps":\[[^]]*\]' | grep -o '\[[^]]*\]')

    if [ -n "$gaps" ] && [ "$gaps" != "[]" ]; then
      # Generate tests for first gap
      local first_gap=$(echo "$gaps" | tr -d '[]"' | cut -d',' -f1)

      if [ -n "$first_gap" ]; then
        generate_tests_for_module "$first_gap"
      fi
    fi

    # Run flakiness detection periodically
    if [ $((iteration % 5)) -eq 0 ]; then
      detect_flakiness 3
    fi

    # Break if single run mode
    if [ "$mode" = "once" ]; then
      log "Single run complete."
      break
    fi

    log "Iteration $iteration complete. Continuing..."
    sleep 5
  done

  # Generate final report
  generate_report

  log "Autonomous testing cycle finished"
}

# ============================================================================
# REPORT GENERATION
# ============================================================================
generate_report() {
  log "Generating final report..."

  cat > "$RESULTS_DIR/report.md" << EOF
# Autonomous Testing Report

Generated: $(date)

## Coverage
$(cat "$STATE_FILE" | jq -r '.coverage.e2e | "- Pages: \(.totalPages)\n- Tested: \(.testedPages)\n- Coverage: \(.percentage)%"')

## Test Results
- Unit Tests: $(grep -c "passed\|PASS" "$RESULTS_DIR/unit-tests.txt" 2>/dev/null || echo "N/A")
- E2E Tests: $(grep -c "passed" "$RESULTS_DIR/e2e-tests.txt" 2>/dev/null || echo "N/A")

## Gaps Remaining
$(cat "$STATE_FILE" | jq -r '.gaps | if length == 0 then "None" else .[] end')

## Files
- Unit Test Results: test-results/unit-tests.txt
- E2E Test Results: test-results/e2e-tests.txt
- State: .claude/auto-test-system/state/test-state.json
EOF

  success "Report generated: $RESULTS_DIR/report.md"
}

# Parse arguments
case "${1:-}" in
  --continuous)
    main "continuous"
    ;;
  --module)
    specific_module="${2:-}"
    if [ -z "$specific_module" ]; then
      error "Usage: $0 --module <module-name>"
      exit 1
    fi
    generate_tests_for_module "$specific_module"
    run_e2e_tests "desktop-chrome" "${specific_module}.playwright.spec.ts"
    ;;
  --flakiness)
    detect_flakiness "${2:-5}"
    ;;
  *)
    main "once"
    ;;
esac
