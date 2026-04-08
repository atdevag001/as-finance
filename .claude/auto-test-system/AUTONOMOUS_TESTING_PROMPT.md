# Autonomous Testing System - Master Prompt

## Overview
This prompt drives a fully autonomous testing cycle that analyzes code, creates tests, runs them, identifies bugs, fixes them, and continues until complete coverage is achieved.

---

## MASTER EXECUTION PROMPT

Copy and paste this entire prompt to Claude Code to begin autonomous testing:

```
You are an autonomous testing agent for the as-finance microfinance application. Your mission is to achieve comprehensive test coverage by iterating through: ANALYZE → CREATE → TEST → FIX → VERIFY cycles.

## PHASE 1: ANALYSIS (Run First)

### 1.1 Generate Coverage Report
Run these commands to understand current state:

```bash
# API unit test coverage
cd apps/api && pnpm test:unit --coverage --reporter=json > /tmp/api-coverage.json 2>&1 || true

# List all pages needing E2E tests
find apps/web/src/app -name "page.tsx" | wc -l

# List existing E2E tests
ls -la apps/web/test/e2e/*.spec.ts apps/web/test/e2e/*.playwright.spec.ts 2>/dev/null | wc -l

# Check which pages have E2E coverage
for page in $(find apps/web/src/app -name "page.tsx" -exec dirname {} \; | sed 's|apps/web/src/app/||' | sort -u); do
  echo "Page: $page"
done
```

### 1.2 Identify Coverage Gaps
Create a gap analysis by comparing:
- All API modules in `apps/api/src/modules/` vs tests in `__tests__/`
- All pages in `apps/web/src/app/` vs E2E specs in `apps/web/test/e2e/`
- Critical business flows: loan lifecycle, collections, accounting entries

### 1.3 Priority Matrix
Rank untested areas by:
1. **CRITICAL**: Financial calculations (loans, interest, penalties, accounting)
2. **HIGH**: CRUD operations (customers, users, groups)
3. **MEDIUM**: UI interactions (forms, navigation, modals)
4. **LOW**: Edge cases, error states

---

## PHASE 2: TEST GENERATION

### 2.1 E2E Test Template
For each untested page, create a Playwright spec following this pattern:

```typescript
import { test, expect } from './fixtures';

test.describe('MODULE_NAME Module', () => {
  // Access control tests
  test('authorized role can access page', async ({ ROLE_Page }) => {
    await ROLE_Page.goto('/PATH');
    await expect(ROLE_Page.getByRole('heading', { name: /TITLE/i })).toBeVisible();
  });

  test('unauthorized role gets Access Denied', async ({ getPageForRole }) => {
    const page = await getPageForRole('UNAUTHORIZED_ROLE');
    await page.goto('/PATH');
    await expect(page.getByText(/access denied|forbidden/i)).toBeVisible();
  });

  // CRUD tests
  test('can create new ENTITY', async ({ ROLE_Page }) => {
    await ROLE_Page.goto('/PATH/new');
    // Fill form
    // Submit
    // Verify redirect/success
  });

  test('can view ENTITY list', async ({ ROLE_Page }) => {
    await ROLE_Page.goto('/PATH');
    await expect(ROLE_Page.locator('table')).toBeVisible();
  });

  test('can edit existing ENTITY', async ({ ROLE_Page }) => {
    await ROLE_Page.goto('/PATH/ID/edit');
    // Modify fields
    // Save
    // Verify changes
  });

  // Validation tests
  test('shows validation errors for invalid input', async ({ ROLE_Page }) => {
    await ROLE_Page.goto('/PATH/new');
    await ROLE_Page.getByRole('button', { name: /submit|save/i }).click();
    await expect(ROLE_Page.locator('.text-destructive')).toBeVisible();
  });
});
```

### 2.2 Unit Test Template
For untested services/modules:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ServiceName } from '../service-name.service';

describe('ServiceName', () => {
  let service: ServiceName;
  let mockDependency: MockType;

  beforeEach(() => {
    mockDependency = { method: vi.fn() };
    service = new ServiceName(mockDependency);
  });

  describe('methodName', () => {
    it('should handle valid input', async () => {
      const result = await service.methodName(validInput);
      expect(result).toMatchObject(expectedOutput);
    });

    it('should throw on invalid input', async () => {
      await expect(service.methodName(invalidInput)).rejects.toThrow();
    });

    it('should handle edge cases', async () => {
      // Test boundary conditions
    });
  });
});
```

---

## PHASE 3: TEST EXECUTION

### 3.1 Run Tests in Order
```bash
# 1. Unit tests first (fast feedback)
pnpm --filter @as-finance/api test:unit 2>&1 | tee /tmp/unit-results.txt

# 2. Integration tests
pnpm --filter @as-finance/api test:integration 2>&1 | tee /tmp/integration-results.txt

# 3. E2E tests (requires servers running)
cd apps/web/test && npx playwright test --project=desktop-chrome 2>&1 | tee /tmp/e2e-results.txt
```

### 3.2 Capture Failures
Parse test output for:
- Failed test names
- Error messages
- Stack traces
- Screenshots/traces (for E2E)

---

## PHASE 4: BUG ANALYSIS & FIX

### 4.1 Failure Categories
Classify each failure:
- **TEST_BUG**: Test code is wrong (selectors, assertions, timing)
- **APP_BUG**: Application code has defect
- **FLAKY**: Intermittent failure (race condition, timing)
- **ENV_BUG**: Environment/config issue

### 4.2 Fix Strategy
For each failure type:

**TEST_BUG**:
- Update selectors to match actual DOM
- Fix assertion logic
- Add proper waits/timeouts

**APP_BUG**:
- Identify root cause in source
- Fix the defect
- Add regression test

**FLAKY**:
- Add explicit waits
- Use retry logic
- Improve test isolation

### 4.3 Fix Template
```typescript
// Before fix - document what was wrong
// After fix - show the correction
// Verification - how to confirm fix works
```

---

## PHASE 5: CONTINUOUS LOOP

### 5.1 Iteration Protocol
```
WHILE (coverage < target OR failures > 0):
  1. Run all tests
  2. IF failures:
     - Analyze each failure
     - Apply fix
     - Re-run failed test only
     - IF still failing: escalate or skip
  3. IF coverage gaps:
     - Generate tests for highest priority gap
     - Run new tests
  4. Update progress metrics
  5. Continue loop
```

### 5.2 Progress Tracking
After each iteration, report:
- Tests passed / total
- Coverage percentage
- Bugs fixed
- New tests added
- Remaining gaps

---

## EXECUTION COMMANDS

### Start Full Autonomous Cycle:
```
Execute autonomous testing for as-finance:
1. Run coverage analysis
2. Identify top 5 coverage gaps
3. Generate tests for gap #1
4. Run all tests
5. Fix any failures
6. Repeat until all 5 gaps addressed
Report progress after each step.
```

### Quick Test Run:
```
Run all existing tests and report failures:
- pnpm test (unit tests)
- cd apps/web/test && npx playwright test --project=desktop-chrome (E2E)
For each failure, provide: test name, error, suggested fix.
```

### Generate Tests for Specific Module:
```
Generate comprehensive Playwright E2E tests for [MODULE_NAME]:
1. Read the page component at apps/web/src/app/(dashboard)/[MODULE]/page.tsx
2. Identify all user interactions
3. Create tests for: access control, CRUD, validation, navigation
4. Save to apps/web/test/e2e/[MODULE].playwright.spec.ts
5. Run the new tests
6. Fix any failures
```

---

## HOOKS CONFIGURATION

Add to `.claude/settings.json` for automation triggers:

```json
{
  "hooks": {
    "post-test-failure": {
      "command": "echo 'Test failed - analyzing...'",
      "enabled": true
    }
  }
}
```

---

## SUCCESS CRITERIA

The autonomous testing cycle is complete when:
1. All existing tests pass (0 failures)
2. Every page has at least one E2E test
3. All API modules have unit test coverage > 80%
4. Critical business flows have integration tests
5. No known bugs remain unfixed

---

## QUICK START

Paste this to begin:

```
Start autonomous testing cycle for as-finance. Begin with Phase 1 analysis, then proceed through all phases. After each phase, summarize progress and continue to next phase. Target: 100% E2E page coverage, 0 test failures.
```
```

---

## Module-Specific Test Generation Prompts

### Loans Module
```
Generate E2E tests for loans module covering:
- Loan application form submission
- Loan approval workflow (maker-checker)
- Loan disbursement
- EMI schedule display
- Loan status transitions
- Foreclosure flow
```

### Collections Module
```
Generate E2E tests for collections module covering:
- Collection posting form
- Receipt generation
- Payment allocation display
- Partial payment handling
- Overpayment handling
- Reversal flow
```

### Accounting Module
```
Generate E2E tests for accounting module covering:
- Chart of accounts navigation
- Daybook entries
- Trial balance report
- P&L statement
- Balance sheet
- Date range filtering
```

### Reports Module
```
Generate E2E tests for reports module covering:
- Report type selection
- Date range filters
- Export functionality (PDF, Excel)
- Report data accuracy
- Role-based report access
```
