# AS-Finance - Claude Code Instructions

## Project Overview
AS-Finance is a microfinance loan management system with:
- **API**: NestJS backend (`apps/api/`)
- **Web**: Next.js frontend (`apps/web/`)
- **Packages**: Shared configs and testing utilities

## Autonomous Testing System

### Quick Start Commands

```bash
# Run full test suite
pnpm test

# Run E2E tests only
cd apps/web/test && npx playwright test

# Run with coverage
pnpm --filter @as-finance/api test:unit --coverage
```

### Autonomous Testing Cycle

When asked to "run autonomous testing" or "auto-test", execute this cycle:

#### Phase 1: Analyze
1. Run `pnpm test` to get current test status
2. Identify failing tests
3. Calculate coverage gaps (pages without E2E tests)

#### Phase 2: Fix Failures
For each failing test:
1. Read the test file and error message
2. Determine if it's a test bug or app bug
3. Fix the issue
4. Re-run the specific test to verify

#### Phase 3: Generate Missing Tests
For pages without E2E coverage:
1. Read the page component
2. Generate Playwright spec following the pattern in `apps/web/test/e2e/`
3. Run the new test
4. Fix any issues

#### Phase 4: Iterate
Repeat until:
- All tests pass
- All pages have E2E coverage

### Test File Locations

| Type | Location | Command |
|------|----------|---------|
| API Unit Tests | `apps/api/src/**/__tests__/*.spec.ts` | `pnpm --filter @as-finance/api test:unit` |
| API Integration | `apps/api/test/*.spec.ts` | `pnpm --filter @as-finance/api test:integration` |
| E2E Tests | `apps/web/test/e2e/*.playwright.spec.ts` | `cd apps/web/test && npx playwright test` |

### E2E Test Fixtures

Use pre-authenticated fixtures from `apps/web/test/e2e/fixtures/`:
- `managerPage` - Manager role
- `adminPage` - Super admin role
- `fieldOfficerPage` - Field officer role
- `accountantPage` - Accountant role
- `auditorPage` - Viewer/auditor role
- `getPageForRole(role)` - Dynamic role selection

### Key Business Modules

1. **Loans** (`/loans`) - Loan lifecycle, approvals, disbursement
2. **Collections** (`/collections`) - Payment collection, receipts
3. **Customers** (`/customers`) - Customer management
4. **Accounting** (`/accounting`) - Chart of accounts, reports
5. **Groups** (`/groups`) - Group lending
6. **Users** (`/users`) - User management, RBAC

### Testing Priorities

1. **Critical**: Loan calculations, payment allocation, accounting entries
2. **High**: Authentication, authorization (RBAC)
3. **Medium**: CRUD operations, form validations
4. **Low**: UI polish, responsive design

### Bug Fix Protocol

When fixing bugs:
1. Write a failing test first (if none exists)
2. Fix the bug
3. Verify test passes
4. Check for regressions

### Code Style

- TypeScript strict mode
- ESLint + Prettier
- Playwright for E2E
- Vitest for unit/integration
