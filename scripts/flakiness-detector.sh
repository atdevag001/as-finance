#!/bin/bash
# Flakiness Detector
# Runs tests multiple times to identify intermittent failures

set -e

RUNS=${1:-5}
TEST_FILE=${2:-""}
OUTPUT_DIR="test-results/flakiness"
THRESHOLD=80  # Tests must pass 80% of runs to be considered stable

mkdir -p "$OUTPUT_DIR"

echo "=========================================="
echo "  FLAKINESS DETECTOR"
echo "  Runs: $RUNS | Threshold: $THRESHOLD%"
echo "=========================================="

# Initialize results
declare -A PASS_COUNT
declare -A FAIL_COUNT
declare -A TOTAL_TESTS

# Run tests multiple times
for run in $(seq 1 $RUNS); do
  echo ""
  echo "=== Run $run of $RUNS ==="

  # Run playwright with JSON reporter
  if [ -n "$TEST_FILE" ]; then
    cd apps/web/test && npx playwright test "$TEST_FILE" --project=desktop-chrome --reporter=json 2>&1 > "$OUTPUT_DIR/run-$run.json" || true
  else
    cd apps/web/test && npx playwright test --project=desktop-chrome --reporter=json 2>&1 > "$OUTPUT_DIR/run-$run.json" || true
  fi
  cd ../../..

  # Parse results (simplified - in production use jq)
  while IFS= read -r line; do
    if [[ "$line" =~ \"title\":\"([^\"]+)\" ]]; then
      TEST_NAME="${BASH_REMATCH[1]}"
    fi
    if [[ "$line" =~ \"status\":\"passed\" ]] && [ -n "$TEST_NAME" ]; then
      PASS_COUNT[$TEST_NAME]=$((${PASS_COUNT[$TEST_NAME]:-0} + 1))
      TOTAL_TESTS[$TEST_NAME]=1
      TEST_NAME=""
    fi
    if [[ "$line" =~ \"status\":\"failed\" ]] && [ -n "$TEST_NAME" ]; then
      FAIL_COUNT[$TEST_NAME]=$((${FAIL_COUNT[$TEST_NAME]:-0} + 1))
      TOTAL_TESTS[$TEST_NAME]=1
      TEST_NAME=""
    fi
  done < "$OUTPUT_DIR/run-$run.json"

  echo "  Run $run complete"
done

# Analyze results
echo ""
echo "=========================================="
echo "  FLAKINESS REPORT"
echo "=========================================="
echo ""

FLAKY_TESTS=()
STABLE_TESTS=0
TOTAL_TEST_COUNT=${#TOTAL_TESTS[@]}

for test in "${!TOTAL_TESTS[@]}"; do
  passes=${PASS_COUNT[$test]:-0}
  fails=${FAIL_COUNT[$test]:-0}
  total=$((passes + fails))

  if [ $total -gt 0 ]; then
    pass_rate=$((passes * 100 / total))

    if [ $pass_rate -lt $THRESHOLD ] && [ $pass_rate -gt 0 ]; then
      echo "⚠️  FLAKY: $test"
      echo "    Pass rate: $pass_rate% ($passes/$total)"
      FLAKY_TESTS+=("$test")
    elif [ $pass_rate -eq 0 ]; then
      echo "❌ FAILING: $test"
      echo "    Pass rate: 0% (0/$total)"
    else
      ((STABLE_TESTS++))
    fi
  fi
done

echo ""
echo "=========================================="
echo "  SUMMARY"
echo "=========================================="
echo "Total tests analyzed: $TOTAL_TEST_COUNT"
echo "Stable tests: $STABLE_TESTS"
echo "Flaky tests: ${#FLAKY_TESTS[@]}"
echo ""

if [ ${#FLAKY_TESTS[@]} -gt 0 ]; then
  echo "Flaky tests need investigation:"
  printf '  - %s\n' "${FLAKY_TESTS[@]}"

  # Write flakiness report
  echo "${FLAKY_TESTS[@]}" > "$OUTPUT_DIR/flaky-tests.txt"
  echo ""
  echo "Report saved to: $OUTPUT_DIR/flaky-tests.txt"
fi

# Update state file
STATE_FILE=".claude/auto-test-system/state/test-state.json"
if [ -f "$STATE_FILE" ]; then
  # Update flakiness data in state (simplified)
  echo "Updating test state..."
fi

exit 0
