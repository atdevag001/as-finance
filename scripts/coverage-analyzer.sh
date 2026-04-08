#!/bin/bash
# Coverage Analyzer for as-finance
# Identifies gaps between pages and E2E tests

echo "=== AS-FINANCE TEST COVERAGE ANALYZER ==="
echo ""

# Get all pages
echo "📄 PAGES (apps/web/src/app):"
echo "----------------------------"
PAGES=$(find apps/web/src/app -name "page.tsx" -exec dirname {} \; | sed 's|apps/web/src/app/||' | sed 's|^/||' | sort -u)
PAGE_COUNT=0
while IFS= read -r page; do
  [ -z "$page" ] && page="(root)"
  echo "  $page"
  ((PAGE_COUNT++))
done <<< "$PAGES"
echo ""
echo "Total Pages: $PAGE_COUNT"
echo ""

# Get all E2E specs
echo "🧪 E2E SPECS (apps/web/test/e2e):"
echo "---------------------------------"
SPECS=$(ls apps/web/test/e2e/*.playwright.spec.ts apps/web/test/e2e/*.spec.ts 2>/dev/null | xargs -I{} basename {} | sort -u)
SPEC_COUNT=0
while IFS= read -r spec; do
  [ -z "$spec" ] && continue
  echo "  $spec"
  ((SPEC_COUNT++))
done <<< "$SPECS"
echo ""
echo "Total Specs: $SPEC_COUNT"
echo ""

# Coverage calculation
if [ "$PAGE_COUNT" -gt 0 ]; then
  COVERAGE=$((SPEC_COUNT * 100 / PAGE_COUNT))
else
  COVERAGE=0
fi

echo "📊 COVERAGE SUMMARY:"
echo "--------------------"
echo "  Pages:    $PAGE_COUNT"
echo "  Specs:    $SPEC_COUNT"
echo "  Coverage: $COVERAGE%"
echo ""

# Identify gaps
echo "⚠️  POTENTIAL GAPS (pages without obvious E2E coverage):"
echo "--------------------------------------------------------"

# Key modules to check
MODULES=("loans" "customers" "collections" "accounting" "groups" "users" "settings" "reports" "cashbook" "receipts" "audit" "profile")

for module in "${MODULES[@]}"; do
  if ls apps/web/test/e2e/*${module}*.spec.ts apps/web/test/e2e/*${module}*.playwright.spec.ts 2>/dev/null | grep -q .; then
    echo "  ✅ $module - has E2E tests"
  else
    echo "  ❌ $module - MISSING E2E tests"
  fi
done
echo ""

echo "=== END COVERAGE REPORT ==="
