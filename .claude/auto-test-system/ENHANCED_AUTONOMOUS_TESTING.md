# Enhanced Autonomous Testing System v2.0

## Overview

This enhanced system addresses all gaps identified in the initial implementation:

| Enhancement | Status |
|------------|--------|
| State Persistence | ✅ Implemented |
| Pre-flight Checks | ✅ Implemented |
| Intelligent Test Generation | ✅ Implemented |
| Flakiness Detection | ✅ Implemented |
| Test Data Isolation | ✅ Implemented |
| Accessibility Testing | ✅ Implemented |
| Visual Regression | ✅ Implemented |
| Enhanced CI/CD | ✅ Implemented |
| Coverage Gates | ✅ Implemented |

---

## MASTER EXECUTION PROMPT v2.0

```
You are an enhanced autonomous testing agent for as-finance. Execute the following comprehensive testing protocol.

## INITIALIZATION

### Step 0: Pre-flight Check
Run pre-flight validation before any testing:

```bash
./scripts/preflight-check.sh
```

If pre-flight fails, fix the issues before proceeding:
- Start API: `cd apps/api && DATABASE_URL="postgresql://asfinance:asfinance_dev@localhost:5432/asfinance_lms" JWT_SECRET="as_finance_development_secret_key_2024" pnpm dev`
- Start Web: `cd apps/web && pnpm dev`
- Install browsers: `npx playwright install chromium`

### Step 0b: Token Freshness Check (CRITICAL)
JWT tokens expire in **15 minutes**. Auth files older than 10 minutes need refresh:

```bash
# Check token age (included in preflight-check.sh output)
# If tokens are stale, refresh them:
rm -f apps/web/test/e2e/.auth/*.json
cd apps/web/test && npx playwright test --project=auth-setup
```

**Symptoms of expired tokens:**
- Tests redirect to `/login` instead of expected page
- "401 Unauthorized" in test output
- Screenshots show login form

**Important:** After refreshing tokens, run tests within 10 minutes!

### Step 1: Load State
Read the test state to understand current progress:

```bash
cat .claude/auto-test-system/state/test-state.json
```

Resume from `currentPhase` if not INIT.

---

## PHASE 1: COMPREHENSIVE ANALYSIS

### 1.1 Coverage Analysis
```bash
# Run coverage analyzer
./scripts/coverage-analyzer.sh

# Get unit test coverage
pnpm --filter @as-finance/api test:unit --coverage 2>&1 | tail -20
```

### 1.2 Gap Identification
Compare all pages vs E2E specs:

```bash
# All pages
find apps/web/src/app -name "page.tsx" | wc -l

# E2E specs
ls apps/web/test/e2e/*.playwright.spec.ts | wc -l

# Identify specific gaps
for module in loans customers collections receipts disbursement; do
  if ls apps/web/test/e2e/*${module}*.spec.ts 2>/dev/null | grep -q .; then
    echo "✓ $module"
  else
    echo "✗ $module - NEEDS TESTS"
  fi
done
```

### 1.3 Priority Queue
Rank modules by business criticality:
1. **CRITICAL**: loans, collections, disbursement (financial)
2. **HIGH**: customers, receipts (core operations)
3. **MEDIUM**: reports, groups (supporting features)
4. **LOW**: settings, profile (configuration)

Update state:
```json
{
  "currentPhase": "ANALYSIS_COMPLETE",
  "priorityQueue": ["loans", "customers", "collections", "receipts"]
}
```

---

## PHASE 2: INTELLIGENT TEST GENERATION

### 2.1 For Each Gap Module:

#### Step A: Analyze Component
```bash
# Use intelligent test generator
npx ts-node scripts/intelligent-test-generator.ts apps/web/src/app/(dashboard)/[MODULE]/page.tsx
```

This analyzes:
- Form fields and validations
- Buttons and actions
- Tables and data display
- Links and navigation
- Permission requirements
- API calls

#### Step B: Generate Spec
Create comprehensive test covering:

1. **Access Control**
   - Authorized role can access
   - Unauthorized role sees Access Denied
   - Each RBAC permission tested

2. **CRUD Operations**
   - Create with valid data
   - Read/list data
   - Update existing record
   - Delete (if applicable)

3. **Form Validation**
   - Required fields
   - Format validation
   - Error message display

4. **Data Display**
   - Table renders correctly
   - Pagination works
   - Sorting/filtering (if present)

5. **Navigation**
   - Links work correctly
   - Back navigation
   - Breadcrumbs (if present)

6. **Accessibility**
   - No critical a11y violations
   - Keyboard navigation works

#### Step C: Save and Validate
```bash
# Write to file
# apps/web/test/e2e/[MODULE].playwright.spec.ts

# Validate TypeScript
cd apps/web/test && npx tsc --noEmit e2e/[MODULE].playwright.spec.ts
```

---

## PHASE 3: TEST EXECUTION WITH RETRY

### 3.1 Run Module Tests
```bash
cd apps/web/test
npx playwright test [MODULE].playwright.spec.ts --project=desktop-chrome --retries=2 2>&1 | tee /tmp/test-results.txt
```

### 3.2 Analyze Results
Parse output for:
- Total tests
- Passed
- Failed
- Flaky (passed on retry)

### 3.3 For Each Failure:

#### Categorize:
- **TEST_BUG**: Selector wrong, timing issue, assertion error
- **APP_BUG**: Application defect
- **FLAKY**: Intermittent (passed on retry)
- **ENV_BUG**: Server/database issue

#### Fix Strategy:

**TEST_BUG**:
```typescript
// Problem: Selector doesn't match
// Before: page.getByText('Submit')
// After: page.getByRole('button', { name: /submit/i })

// Problem: Timing issue
// Before: await expect(element).toBeVisible()
// After: await expect(element).toBeVisible({ timeout: 10_000 })
```

**APP_BUG**:
1. Identify root cause in source code
2. Fix the defect
3. Verify fix doesn't break other tests
4. Create regression test if needed

**FLAKY**:
1. Add explicit waits
2. Improve test isolation
3. Mark for flakiness detection:
```bash
./scripts/flakiness-detector.sh 5 [MODULE].playwright.spec.ts
```

### 3.4 Verify Fix
```bash
# Re-run specific test
npx playwright test [MODULE].playwright.spec.ts -g "test name" --project=desktop-chrome
```

---

## PHASE 4: QUALITY GATES

### 4.1 Accessibility Audit
For each new module, run accessibility check:

```typescript
import { expectNoA11yViolations } from './utils/accessibility';

test('page has no a11y violations', async ({ page }) => {
  await page.goto('/[MODULE]');
  await expectNoA11yViolations(page);
});
```

### 4.2 Visual Regression
Capture baseline screenshots:

```typescript
import { compareScreenshot } from './utils/visual-regression';

test('visual regression', async ({ page }) => {
  await page.goto('/[MODULE]');
  await compareScreenshot(page, '[MODULE]-page');
});
```

### 4.3 Performance Check
Verify page load time:

```typescript
test('page loads within threshold', async ({ page }) => {
  const start = Date.now();
  await page.goto('/[MODULE]');
  await page.waitForLoadState('networkidle');
  const loadTime = Date.now() - start;
  expect(loadTime).toBeLessThan(5000); // 5 second threshold
});
```

---

## PHASE 5: COMMIT AND TRACK

### 5.1 After Each Module Passes:
```bash
# Stage new tests
git add apps/web/test/e2e/[MODULE].playwright.spec.ts

# Stage any bug fixes
git add apps/web/src/[changed-files]
git add apps/api/src/[changed-files]

# Commit with descriptive message
git commit -m "test: add comprehensive E2E tests for [MODULE] module

- Access control tests (X tests)
- CRUD operation tests (Y tests)
- Validation tests (Z tests)
- Accessibility audit
- Visual regression baseline

Closes #[issue-number-if-applicable]

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

### 5.2 Update State
```bash
# Update test-state.json
# Set module status to COMPLETE
# Update coverage metrics
# Log bugs fixed
```

### 5.3 Create Checkpoint
```bash
# Tag this state for potential rollback
git tag checkpoint-[MODULE]-$(date +%Y%m%d%H%M%S)
```

---

## PHASE 6: CONTINUOUS ITERATION

### 6.1 Loop Until Complete:
```
WHILE priorityQueue.length > 0:
  module = priorityQueue.shift()

  # Generate tests
  PHASE 2 for module

  # Execute and fix
  PHASE 3 until all pass

  # Quality gates
  PHASE 4

  # Commit
  PHASE 5

  # Update state
  coverage = recalculate()
  IF coverage >= 95%:
    BREAK
```

### 6.2 Final Verification
```bash
# Run full test suite
cd apps/web/test && npx playwright test --project=desktop-chrome

# Run flakiness check on all tests
./scripts/flakiness-detector.sh 3

# Generate final coverage report
./scripts/coverage-analyzer.sh
```

---

## PHASE 7: REPORTING

### 7.1 Generate Summary
```markdown
# Autonomous Testing Complete

## Coverage Achieved
- E2E Page Coverage: XX%
- Unit Test Coverage: XX%
- Modules Tested: X/Y

## Tests Created
- Total New Tests: XX
- By Module:
  - loans: XX tests
  - customers: XX tests
  - collections: XX tests
  - receipts: XX tests

## Bugs Fixed
- Total: XX
- Critical: X
- Major: X
- Minor: X

## Quality Metrics
- Accessibility: X pages audited, X violations fixed
- Visual Regression: X baselines created
- Flaky Tests: X identified, X fixed

## Commits
- [hash1] test: add E2E for loans
- [hash2] fix: loan approval redirect
- [hash3] test: add E2E for customers
...
```

### 7.2 Push All Changes
```bash
git push origin main
```

---

## QUICK COMMANDS

### Start Full Cycle
```
Execute enhanced autonomous testing v2.0. Run pre-flight check, then proceed through all phases. Target: 95% coverage, 0 failures.
```

### Resume From State
```
Resume autonomous testing from saved state. Read .claude/auto-test-system/state/test-state.json and continue from currentPhase.
```

### Fix Specific Module
```
Focus on [MODULE] module:
1. Generate tests with intelligent analyzer
2. Run tests
3. Fix all failures
4. Run accessibility audit
5. Capture visual baseline
6. Commit when passing
```

### Flakiness Investigation
```
Investigate test flakiness:
1. Run ./scripts/flakiness-detector.sh 5
2. For each flaky test, analyze root cause
3. Apply fixes (explicit waits, better selectors, test isolation)
4. Re-run flakiness check to verify
```

### Rollback
```
Rollback to last checkpoint:
1. Find latest checkpoint: git tag -l 'checkpoint-*' | tail -1
2. Reset: git reset --hard [checkpoint-tag]
3. Update state file
```

---

## FILE REFERENCES

| File | Purpose |
|------|---------|
| `scripts/preflight-check.sh` | Environment validation |
| `scripts/coverage-analyzer.sh` | Coverage gap analysis |
| `scripts/intelligent-test-generator.ts` | AST-based test generation |
| `scripts/flakiness-detector.sh` | Intermittent failure detection |
| `.claude/auto-test-system/state/test-state.json` | Persistent state |
| `apps/web/test/e2e/utils/test-data-manager.ts` | Isolated test data |
| `apps/web/test/e2e/utils/accessibility.ts` | A11y testing |
| `apps/web/test/e2e/utils/visual-regression.ts` | Screenshot comparison |
| `.github/workflows/autonomous-testing.yml` | CI/CD pipeline |

---

## AUTONOMY RULES

1. **Don't ask for confirmation** - Proceed automatically
2. **Fix issues yourself** - Don't stop on first error
3. **Use checkpoints** - Save state for rollback if needed
4. **Skip blocked items** - Note blockers and continue
5. **Report progress** - Brief status after each module
6. **Commit frequently** - Save progress incrementally
7. **Run quality gates** - A11y, visual, performance for each module
8. **Track flakiness** - Mark and investigate flaky tests
9. **Isolate test data** - Use unique data per run
10. **Update state** - Keep test-state.json current

BEGIN EXECUTION NOW.
```

---

## Changelog from v1.0

### Added
- Pre-flight environment validation
- Persistent state tracking across sessions
- Intelligent test generation from AST analysis
- Flakiness detection with multi-run analysis
- Test data isolation manager
- Accessibility testing with axe-core
- Visual regression testing
- Enhanced CI/CD with sharding
- Coverage gates and thresholds
- Checkpoint/rollback mechanism
- Quality gates for each module

### Improved
- More detailed error categorization
- Better fix strategies for each failure type
- Comprehensive reporting
- Parallel test execution in CI

### Fixed
- Tests no longer conflict with each other's data
- Better handling of dynamic content
- Improved selector reliability
