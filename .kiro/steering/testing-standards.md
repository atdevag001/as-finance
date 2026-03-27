---
inclusion: always
---

# AS Finance LMS — Testing Standards Steering

## Testing Philosophy

Testing is first-class and release-blocking for all critical finance paths. The test suite is the primary evidence that the system conforms to its financial invariants and correctness properties.

## Test Categories

### Unit Tests
- Cover all pure business logic: EMI calculation, schedule generation, rounding, penalty calculation, allocation logic, overdue bucket logic, foreclosure calculation, receipt number generation, validation helpers, permission guards, due date logic
- No database or external service dependencies
- Fast execution, run on every commit
- Co-located with source files as `*.spec.ts`

### Property-Based Tests (PBT)
- Cover financial invariants that must hold for all valid inputs:
  - Schedule totals reconcile with loan payable amount
  - Outstanding stays correct after arbitrary valid payment sequences
  - Reversal exactly neutralizes original posting
  - Allocation preserves component totals
  - Principal + interest + penalty consistency across operations
- Use fast-check library with Vitest
- Co-located as `*.property.spec.ts`
- Minimum 100 examples per property, 1000 for critical finance properties

### Integration Tests
- Cover multi-layer flows with real database (test PostgreSQL instance):
  - Customer creation + document upload
  - Loan creation → approval → disbursement
  - Collection posting with allocation verification
  - Partial payment → overdue computation
  - Reversal flow with ledger verification
  - Foreclosure flow
  - Expense entry → cashbook update
  - Report correctness against known data
  - Notification enqueueing without breaking finance flow
- Use test database with migrations applied
- Seed data via test factories

### API Contract Tests
- Verify request/response shapes match OpenAPI spec
- Validate input validation behavior (reject invalid, accept valid)
- Verify auth behavior (401 for unauthenticated, 403 for unauthorized)
- Verify role restrictions per endpoint
- Verify error response structure consistency

### End-to-End Tests
- Cover critical business flows:
  - Onboarding → loan approval → disbursement → collection → receipt
  - Partial repayment → overdue → penalty → collection
  - Group creation → group collection → report
  - Unauthorized action denial
  - Duplicate payment submission prevention
  - Reversal with authorization
  - SMS failure does not break valid collection
- Use Playwright for UI flows, Supertest for API flows

### Negative Tests
- Invalid Aadhaar/PAN/mobile formats
- Duplicate identity submission
- Disbursement before approval
- Invalid loan terms (amount/tenure out of range)
- Invalid state transitions
- Invalid file upload (wrong MIME, oversized)
- Permission denial for unauthorized roles
- Stale version update (optimistic locking conflict)
- Duplicate receipt attempt
- Duplicate form submission
- Incorrect reversal request
- Over-collection edge cases
- Missing dependent record handling

### Concurrency Tests
- Double-click payment submit (idempotency verification)
- Concurrent collection posting on same loan
- Concurrent approval/disbursement attempts
- Concurrent reversal attempts
- Receipt numbering collision under concurrent requests
- Stale balance conflict detection

### Migration Tests
- Migration up/down safety verification
- Seed data validity after migration
- No data loss on migration rollback
- Schema consistency checks

### Security Tests
- Auth bypass attempts
- RBAC enforcement per endpoint per role
- IDOR checks (accessing other users' data)
- SQL injection resistance (Prisma parameterization)
- Upload misuse (script injection, oversized files)
- Rate limiting verification

## Finance Correctness Test Standards

Finance domain tests must verify:
1. **Determinism**: Same inputs always produce same schedule
2. **Reconciliation**: Schedule components sum to total payable
3. **Allocation correctness**: Payment allocated in correct order
4. **Outstanding accuracy**: Balance correct after every operation
5. **Reversal neutrality**: Original + reversal = net zero
6. **Idempotency**: Duplicate requests produce same result, not duplicate effects
7. **Atomicity**: Failed operations leave no partial state
8. **Audit completeness**: Every finance mutation has audit trail

## Fixture and Seed Strategy

- Test factories in `packages/testing/src/factories/` for every entity
- Factories produce valid default entities, overridable per test
- Seed script for development database with realistic sample data
- Test database reset between integration test suites (not between individual tests within a suite — use transactions)
- No shared mutable state between test files

## Code Coverage Expectations

| Area | Minimum Coverage |
|---|---|
| Finance calculation functions | 95% |
| Schedule generation | 95% |
| Collection allocation | 95% |
| Reversal logic | 90% |
| Permission guards | 90% |
| API controllers | 80% |
| Domain services | 85% |
| Repositories | 70% |
| UI components | 60% |
| Overall | 75% |

## Release-Blocking Criteria

A release is blocked if any of the following fail:
- Any finance domain unit test
- Any property-based test
- Any RBAC/security test
- Any API contract test
- Any critical e2e flow (onboarding → collection → receipt)
- TypeScript compilation
- Prisma migration validation
- Lint/format checks

## Regression Strategy

- Every production bug gets a permanent automated regression test
- Regression tests tagged and run as part of CI
- Critical finance regressions run on every PR
- Full regression suite runs nightly and before release
- No regression test may be deleted without explicit approval and documented reason
