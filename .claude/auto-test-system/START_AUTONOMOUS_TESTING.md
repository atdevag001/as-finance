# START AUTONOMOUS TESTING

Copy and paste this entire block into Claude Code to begin fully autonomous testing:

---

## AUTONOMOUS TESTING EXECUTION PROMPT

```
Execute autonomous testing cycle for as-finance with the following protocol:

## INITIALIZATION
1. Read CLAUDE.md for project context
2. Check current git status
3. Ensure no uncommitted changes that could interfere

## PHASE 1: BASELINE ANALYSIS (MANDATORY FIRST STEP)

### 1.1 Run All Existing Tests
Execute these commands and capture results:

```bash
# Unit tests
pnpm --filter @as-finance/api test:unit 2>&1 | head -100

# Check E2E test list
cd apps/web/test && npx playwright test --list 2>&1 | tail -50
```

### 1.2 Identify Coverage Gaps
Create a coverage matrix:

```bash
# All pages that need tests
echo "=== PAGES ===" && find apps/web/src/app -name "page.tsx" -exec dirname {} \; | sed 's|apps/web/src/app||' | sort -u

# Existing E2E tests
echo "=== E2E SPECS ===" && ls apps/web/test/e2e/*.playwright.spec.ts 2>/dev/null | xargs -I{} basename {} .playwright.spec.ts
```

### 1.3 Calculate Priority Queue
Rank untested modules:
1. Financial: loans, collections, accounting, disbursement
2. Security: login, rbac, users
3. Operations: customers, groups, receipts
4. Settings: settings, profile, reports

## PHASE 2: TEST GENERATION LOOP

For each untested module (in priority order):

### 2.1 Read Source Code
```
Read apps/web/src/app/(dashboard)/[MODULE]/page.tsx
Read apps/web/src/components/[MODULE]/*.tsx (if exists)
```

### 2.2 Generate Playwright Spec
Create comprehensive E2E test covering:
- Page access (authorized role can view)
- Access control (unauthorized role sees Access Denied)
- Key user interactions (buttons, forms, links)
- Data display (tables, lists, details)
- Form validation (required fields, formats)
- CRUD operations (create, read, update, delete)

### 2.3 Save and Validate
```bash
# Save to apps/web/test/e2e/[MODULE].playwright.spec.ts
# Run syntax check
npx tsc --noEmit apps/web/test/e2e/[MODULE].playwright.spec.ts
```

## PHASE 3: TEST EXECUTION & BUG FIX LOOP

### 3.1 Run New Tests
```bash
cd apps/web/test && npx playwright test [MODULE].playwright.spec.ts --project=desktop-chrome 2>&1
```

### 3.2 Analyze Failures
For each failure:
1. Read the error message and stack trace
2. Categorize: TEST_BUG | APP_BUG | FLAKY | ENV_BUG
3. Determine root cause

### 3.3 Apply Fix
- If TEST_BUG: Fix selector, assertion, or timing in test
- If APP_BUG: Fix the application code, then verify
- If FLAKY: Add waits, retries, or improve isolation
- If ENV_BUG: Skip or mark as manual intervention needed

### 3.4 Verify Fix
```bash
# Re-run the specific failing test
cd apps/web/test && npx playwright test [MODULE].playwright.spec.ts -g "test name" --project=desktop-chrome
```

### 3.5 Iterate
Repeat 3.1-3.4 until all tests in the module pass.

## PHASE 4: PROGRESS CHECKPOINT

After each module:

### 4.1 Report Status
```
Module: [NAME]
Tests Created: [N]
Tests Passing: [N]
Bugs Fixed: [N]
Coverage: [X]%
```

### 4.2 Commit Progress
```bash
git add apps/web/test/e2e/[MODULE].playwright.spec.ts
git add [any bug fixes]
git commit -m "test: add E2E tests for [MODULE] module"
```

### 4.3 Continue or Complete
- If more modules remain: Go to Phase 2 with next module
- If all modules tested: Proceed to Phase 5

## PHASE 5: FINAL VERIFICATION

### 5.1 Full Test Run
```bash
# All unit tests
pnpm --filter @as-finance/api test:unit

# All E2E tests
cd apps/web/test && npx playwright test --project=desktop-chrome
```

### 5.2 Coverage Report
```bash
# Final coverage calculation
PAGES=$(find apps/web/src/app -name "page.tsx" | wc -l)
SPECS=$(ls apps/web/test/e2e/*.playwright.spec.ts 2>/dev/null | wc -l)
echo "E2E Coverage: $SPECS / $PAGES pages"
```

### 5.3 Summary Report
Generate final report with:
- Total tests created
- Total bugs fixed
- Final coverage percentage
- Any remaining gaps or known issues

## COMPLETION CRITERIA

The cycle is complete when:
1. All E2E tests pass (0 failures)
2. Every page has at least one E2E spec
3. All discovered bugs are fixed or documented
4. All changes are committed

## AUTONOMY RULES

1. **Don't ask for confirmation** - proceed automatically
2. **Fix issues yourself** - don't stop on first error
3. **Skip blocked items** - if something can't be fixed, note it and continue
4. **Report progress** - brief status after each major step
5. **Commit frequently** - save progress after each module

BEGIN EXECUTION NOW. Start with Phase 1.
```

---

## QUICK COMMANDS

### Start Full Cycle
```
Run autonomous testing. Begin Phase 1 now.
```

### Resume from Module
```
Continue autonomous testing from [MODULE] module. Skip Phase 1.
```

### Fix Specific Failures
```
Analyze and fix all failing tests in apps/web/test/e2e/[MODULE].playwright.spec.ts
```

### Generate Single Module Tests
```
Generate comprehensive E2E tests for the [MODULE] module and run them.
```
