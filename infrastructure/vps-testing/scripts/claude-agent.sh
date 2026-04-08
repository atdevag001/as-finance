#!/bin/bash
# ============================================================================
# CLAUDE CODE AGENT WRAPPER
# Interfaces with Claude Code for autonomous testing
#
# This script can be extended to:
# 1. Send test failures to Claude for analysis
# 2. Apply suggested fixes
# 3. Re-run tests and verify
# ============================================================================

set -e

WORKSPACE=${WORKSPACE:-/workspace}
STATE_FILE="$WORKSPACE/.claude/auto-test-system/state/test-state.json"
RESULTS_DIR="$WORKSPACE/test-results"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
  echo -e "${BLUE}[AGENT]${NC} $1"
}

# ============================================================================
# ANALYZE FAILURE
# ============================================================================
analyze_failure() {
  local test_name=$1
  local error_file=$2

  log "Analyzing failure: $test_name"

  # Read error details
  local error_content=$(cat "$error_file" 2>/dev/null || echo "No error file")

  # Create analysis prompt
  cat << EOF
Analyze this Playwright test failure and suggest a fix:

Test: $test_name

Error:
$error_content

Provide:
1. Root cause analysis
2. Suggested fix (code snippet)
3. Verification steps
EOF
}

# ============================================================================
# GENERATE TEST
# ============================================================================
generate_test() {
  local module=$1
  local page_path="$WORKSPACE/apps/web/src/app/(dashboard)/$module/page.tsx"

  if [ ! -f "$page_path" ]; then
    log "Page not found: $page_path"
    return 1
  fi

  log "Generating test for: $module"

  # Read page content
  local page_content=$(cat "$page_path")

  # Create generation prompt
  cat << EOF
Generate a comprehensive Playwright E2E test for this React component:

File: $page_path

Content:
$page_content

Requirements:
1. Use fixtures from './fixtures' (test, expect, managerPage, etc.)
2. Test access control (authorized and unauthorized roles)
3. Test all visible form fields and buttons
4. Test navigation links
5. Include accessibility check
6. Follow existing spec patterns in the codebase

Output only the TypeScript code for the test file.
EOF
}

# ============================================================================
# FIX SUGGESTION
# ============================================================================
suggest_fix() {
  local file_path=$1
  local issue=$2

  log "Suggesting fix for: $file_path"

  # Read file content
  local file_content=$(cat "$file_path" 2>/dev/null || echo "File not found")

  cat << EOF
Suggest a fix for this issue:

File: $file_path
Issue: $issue

Current Code:
$file_content

Provide:
1. The specific change needed
2. The fixed code snippet
3. Explanation of why this fixes the issue
EOF
}

# ============================================================================
# MAIN
# ============================================================================
case "${1:-help}" in
  analyze)
    analyze_failure "${2:-unknown}" "${3:-/dev/null}"
    ;;
  generate)
    generate_test "${2:-unknown}"
    ;;
  fix)
    suggest_fix "${2:-unknown}" "${3:-unknown issue}"
    ;;
  help|*)
    echo "Usage:"
    echo "  $0 analyze <test-name> <error-file>"
    echo "  $0 generate <module-name>"
    echo "  $0 fix <file-path> <issue-description>"
    ;;
esac
