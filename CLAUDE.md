# AS-Finance - Claude Code Instructions

## Project Overview
AS-Finance is a microfinance loan management system with:
- **API**: NestJS backend (`apps/api/`)
- **Web**: Next.js frontend (`apps/web/`)
- **Packages**: Shared configs and testing utilities

## Bidirectional Update Rule

**ALWAYS maintain frontend-backend sync when implementing features:**

| When you update... | Also check/update... |
|-------------------|---------------------|
| Backend API endpoint | Frontend hooks, forms, and components that call it |
| Backend DTO fields | Frontend form fields, types, and validation |
| Backend response format | Frontend data handling and display |
| Frontend form fields | Backend DTO to accept the new fields |
| Frontend API calls | Backend endpoint exists and accepts the payload |

**Workflow:**
1. When adding a backend feature → implement corresponding frontend UI
2. When adding frontend UI → ensure backend API supports it
3. After any API change → update frontend hooks/types if affected
4. After any form change → verify backend accepts the new data

**Example:** Adding `firstEmiDate` to loan approval:
- Backend: Add field to `ApproveLoanDto`, update `LoanService.approve()`
- Frontend: Add date input to approval dialog, pass field in API call

## Autonomous Testing System

### Quick Start Commands

```bash
# Option 1: Run full autonomous test cycle (recommended)
./scripts/auto-test-runner.sh

# Option 2: Run individual components
./scripts/preflight-check.sh          # Pre-flight validation
./scripts/coverage-analyzer.sh        # Gap analysis
./scripts/flakiness-detector.sh 5     # Flakiness detection (5 runs)

# Option 3: Run E2E tests directly
cd apps/web/test && npx playwright test --project=desktop-chrome

# Refresh auth tokens (if tests fail with 401 or redirect to login)
rm -f apps/web/test/e2e/.auth/*.json && cd apps/web/test && npx playwright test --project=auth-setup
```

### State Persistence

The autonomous testing system maintains state across sessions:
```bash
# Check current state
cat .claude/auto-test-system/state/test-state.json

# Key fields:
# - currentPhase: INIT | ANALYSIS | TESTING | FIXING | COMPLETE
# - coverage.e2e.percentage: Current E2E coverage %
# - modules: Status of each module (PENDING | IN_PROGRESS | COMPLETE)
# - auth.lastRefresh: When tokens were last refreshed
```

### Autonomous Testing Cycle

When asked to "run autonomous testing" or "auto-test", execute this cycle:

#### Phase 0: Pre-flight Checks (CRITICAL)
```bash
./scripts/preflight-check.sh
```
This validates:
- Node.js and pnpm installed
- API server running at localhost:3001
- Web server running at localhost:3000
- Database connectivity
- Auth state files exist and are fresh (< 10 min old)
- Disk space available

**If pre-flight fails**, fix issues:
```bash
# Start API server
cd apps/api && DATABASE_URL="postgresql://asfinance:asfinance_dev@localhost:5432/asfinance_lms" JWT_SECRET="as_finance_development_secret_key_2024" pnpm dev

# Start Web server (in another terminal)
cd apps/web && pnpm dev

# Refresh auth tokens
rm -f apps/web/test/e2e/.auth/*.json && cd apps/web/test && npx playwright test --project=auth-setup
```

#### Phase 1: Analyze
```bash
./scripts/coverage-analyzer.sh
```
1. Run coverage analyzer to see pages vs specs
2. Read test-state.json to identify priority gaps
3. Categorize any failures:
   - **Auth Issues**: Token expired → refresh auth
   - **Selector Issues**: DOM changed → fix selectors
   - **App Bugs**: API errors → fix app code

#### Phase 2: Fix Failures
For each failing test:
1. Read the test file and error message
2. Check screenshot in `apps/web/test/test-results/`
3. Determine root cause (test bug vs app bug)
4. Fix the issue
5. Re-run specific test: `npx playwright test "test-name" --project=desktop-chrome`

#### Phase 3: Generate Missing Tests
For pages without E2E coverage:
```bash
# Use intelligent test generator for AST analysis
npx ts-node scripts/intelligent-test-generator.ts apps/web/src/app/(dashboard)/[MODULE]/page.tsx
```
1. Read the page component in `apps/web/src/app/(dashboard)/`
2. Generate Playwright spec following existing patterns
3. Use pre-authenticated fixtures (managerPage, adminPage, etc.)
4. Run the new test and fix any issues

#### Phase 4: Update State & Iterate
```bash
# Update test-state.json after each phase
# Continue until:
# - All tests pass
# - Coverage target met (default: 80%)
```

### Token Expiration Handling

JWT tokens expire in **15 minutes**. Auth setup creates tokens for 7 roles.

**Symptoms of expired tokens:**
- Tests redirect to login page
- "401 Unauthorized" errors
- Screenshot shows login form instead of expected page

**Detection:**
```bash
# Check token age (built into preflight-check.sh)
./scripts/preflight-check.sh | grep -A2 "token freshness"
```

**Resolution:**
```bash
rm -f apps/web/test/e2e/.auth/*.json
cd apps/web/test && npx playwright test --project=auth-setup
# Then immediately run tests (within 10 minutes)
```

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
