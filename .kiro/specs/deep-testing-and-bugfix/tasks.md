# Implementation Plan: Deep Testing & Bugfix

## Overview

This plan implements a comprehensive testing suite and bugfix workflow for the AS Finance LMS. Tests are organized in dependency order: infrastructure first, then pure functions, then services, then integration, then cross-cutting concerns, then E2E flows. All code is TypeScript using Vitest, fast-check, and Supertest. Every discovered bug is permanently fixed with a regression test.

## Tasks

- [x] 1. Phase 1 — Test Infrastructure (Factories, Arbitraries, Helpers)
  - [x] 1.1 Create entity factory functions in `packages/testing/src/factories/`
    - Implement `buildScheduleParams`, `buildInstallmentState`, `buildPenaltyState`, `buildJournalEntry`, `buildJournalLine`, `buildCollectionInput`, `buildReceiptData`, `buildDailySummaryInput`, `buildAuditLogEntry`, `buildIdempotencyRecord`, `buildUser`, `buildCustomer`, `buildLoan`, `buildLoanProduct`, `buildSmsTemplate`
    - Each factory returns a valid default entity, overridable via `Partial<T>` parameter
    - Export all factories from `packages/testing/src/factories/index.ts`
    - _Requirements: 56.4_

  - [x] 1.2 Create fast-check arbitraries in `packages/testing/src/arbitraries/`
    - Implement `money.arbitrary.ts` (paiseArb, bigPaiseArb, annualRateBpsArb, tenureMonthsArb)
    - Implement `schedule.arbitrary.ts` (scheduleParamsArb with all ScheduleParams fields)
    - Implement `allocation.arbitrary.ts` (installmentStateArb, allocationParamsArb)
    - Implement `journal.arbitrary.ts` (journalEntryArb, journalLineArb)
    - Implement `penalty.arbitrary.ts` (penaltyConfigArb, dueDateArb)
    - Implement `receipt.arbitrary.ts` (receiptDataArb)
    - Implement `cashbook.arbitrary.ts` (dailySummaryInputArb)
    - Implement `rbac.arbitrary.ts` (roleArb, permissionKeyArb)
    - Implement `idempotency.arbitrary.ts` (idempotencyKeyArb, operationTypeArb)
    - Implement `template.arbitrary.ts` (templateArb, variableMapArb)
    - Export all from `packages/testing/src/arbitraries/index.ts`
    - _Requirements: 56.2_

  - [x] 1.3 Create/update test helpers in `packages/testing/src/helpers/`
    - Implement shared test utilities: `expectBalanced()` for journal entries, `expectNonNegativePaise()` for money assertions, `expectMonotonicallyIncreasing()` for date sequences
    - Export from `packages/testing/src/helpers/index.ts`
    - _Requirements: 56.1, 56.6, 56.7_

  - [x] 1.4 Create Vitest configuration profiles
    - Create/update `apps/api/vitest.config.ts` for unit + PBT (includes `**/*.spec.ts`, `**/*.property.spec.ts`, excludes integration and e2e)
    - Create/update `apps/api/vitest.integration.ts` for integration tests (sequential, global DB setup)
    - Create/update `apps/api/vitest.e2e.ts` for E2E + contract + security + concurrency tests (sequential, global API setup)
    - Configure v8 coverage with per-file thresholds per design
    - _Requirements: 56.1, 56.5_

- [x] 2. Checkpoint — Verify test infrastructure compiles and factories produce valid defaults
  - Ensure all tests pass, ask the user if questions arise.


- [x] 3. Phase 2 — Pure Function Unit Tests
  - [x] 3.1 Write schedule generation unit tests in `apps/api/src/modules/schedule/__tests__/schedule.service.spec.ts`
    - Test `generateFlatSchedule()` for monthly, weekly, daily frequencies with known expected outputs
    - Test `generateReducingBalanceSchedule()` for monthly, weekly, daily frequencies with known expected outputs
    - Test `deriveInstallmentCount()` for each Frequency enum value
    - Test `derivePeriodicRate()` for each Frequency enum value
    - Test `generateDueDates()` for correct date spacing and holiday adjustment
    - Test `normalizeZero()` for negative zero → positive zero conversion
    - Test that principal + interest components sum to total payable within 1 paisa tolerance
    - Test edge cases: zero tenure, single installment, max tenure (360), min principal (100 paise), max principal (10B paise), zero rate, max rate (10000 bps)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8_

  - [x] 3.2 Write allocation engine unit tests in `apps/api/src/modules/collection/__tests__/allocation-engine.spec.ts`
    - Test default allocation order: penalty → interest → principal
    - Test penalties allocated oldest-first, interest oldest-first, principal oldest-first
    - Test partial payment covering only penalties, partial covering penalties + partial interest
    - Test exact full payment, overpayment with excess calculation, advance payment
    - Test zero amount (empty result), negative amount (throws error)
    - Test custom allocation order (interest → principal → penalty)
    - Test no pending penalties, no outstanding interest, mixed paid/unpaid installments
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13, 3.14, 3.15_

  - [x] 3.3 Write cashbook `computeDailySummary()` unit tests
    - Test pure function: opening + inflows - outflows = closing balance
    - Test `mapCategoryToAccountCode()` for each expense category
    - _Requirements: 25.5, 25.6_

  - [x] 3.4 Write document helper pure function unit tests
    - Test `detectMimeType()` for JPEG, PNG, PDF magic bytes and unrecognized buffers
    - Test `isFileSizeValid()` for 1 byte to 5MB acceptance, 0/negative/oversized rejection
    - Test `containsEmbeddedScripts()` for script tags, javascript: URIs, onclick=, <%, <?php detection and clean file pass-through
    - _Requirements: 57.1, 57.2, 57.3, 57.4, 57.5_

  - [x] 3.5 Write processing fee calculation unit tests
    - Test `calculateProcessingFee()` for fixed fee type, percentage fee type (bps), zero principal, zero feeValue, fractional paise rounding, unrecognized fee_type
    - _Requirements: 66.1, 66.2, 66.3, 66.4, 66.5, 66.6_

  - [x] 3.6 Write SMS template rendering unit tests
    - Test `renderTemplate()` for placeholder substitution, no-placeholder passthrough, missing keys, extra keys
    - Test template lookup by event_type and language with fallback
    - _Requirements: 67.1, 67.2, 67.3, 67.4, 67.5_

  - [x] 3.7 Write loan number generation unit tests
    - Test `generateLoanNumber()` format LN-{YYYY}-{NNNNN}, sequential increase, year prefix
    - _Requirements: 65.1, 65.2, 65.4_

  - [x] 3.8 Write loan state transition validation unit tests
    - Test `validateTransition()` for all valid transitions (draft→submitted, submitted→under_review, etc.)
    - Test all invalid transitions are rejected (draft→approved, closed→active, etc.)
    - Test terminal states (rejected, defaulted, foreclosed, closed) have no outgoing transitions
    - _Requirements: 15.1, 15.2, 15.8_

- [x] 4. Checkpoint — Verify all pure function unit tests pass
  - Ensure all tests pass, ask the user if questions arise.


- [x] 5. Phase 3 — Pure Function Property-Based Tests
  - [x] 5.1 Write schedule generation PBTs in `apps/api/src/modules/schedule/__tests__/schedule.property.spec.ts`
    - **Property 1: Schedule Reconciliation — sum of all installment principal components equals loan principal**
    - **Property 2: Interest Reconciliation — sum of all installment interest components equals total interest**
    - **Property 3: Total Reconciliation — sum of all installment totals equals total payable**
    - **Property 4: Rounding Absorption — rounding difference absorbed exclusively by last installment**
    - **Property 5: Determinism — same ScheduleParams always produce identical installment array**
    - **Property 6: Non-Negative Integers — all installment amounts are non-negative integers**
    - **Property 7: Monotonic Due Dates — due dates are strictly monotonically increasing**
    - **Property 8: Installment Count — number of installments matches deriveInstallmentCount()**
    - Minimum 1000 examples per property
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9**

  - [x] 5.2 Write schedule conformance PBTs in `apps/api/src/modules/schedule/__tests__/conformance.property.spec.ts`
    - Additional conformance properties for cross-frequency consistency
    - **Validates: Requirements 2.1, 2.3, 2.6**

  - [x] 5.3 Write allocation engine PBTs in `apps/api/src/modules/collection/__tests__/allocation.property.spec.ts`
    - **Property 9: Money Conservation — totalPenalty + totalInterest + totalPrincipal + excess = input amount**
    - **Property 10: No Over-Allocation — no allocation line exceeds outstanding for its component**
    - **Property 11: Non-Negative Allocations — all allocation amounts are non-negative integers**
    - **Property 12: Order Respect — allocation order respects configured allocationOrder parameter**
    - **Property 13: Non-Negative Outstanding — outstanding after allocation is non-negative per component**
    - Minimum 1000 examples per property
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6**

  - [x] 5.4 Write outstanding balance PBTs in `apps/api/src/modules/collection/__tests__/outstanding.property.spec.ts`
    - **Property 14: Outstanding Drift — cached_outstanding equals total_payable minus net allocated payments for any valid operation sequence**
    - **Property 15: Non-Negative Outstanding — outstanding never becomes negative after valid operations**
    - Minimum 1000 examples per property
    - **Validates: Requirements 75.3, 75.5, 75.6**

  - [x] 5.5 Write cashbook PBTs in `apps/api/src/modules/cashbook/__tests__/cashbook.property.spec.ts`
    - **Property 16: Cashbook Balance — opening + inflows - outflows = closing for any valid DailySummaryInput**
    - **Property 17: Non-Negative Amounts — all summary amounts are non-negative integers**
    - Minimum 100 examples per property
    - **Validates: Requirements 26.1, 26.2, 26.3**

  - [x] 5.6 Write receipt PBTs in `apps/api/src/modules/receipt/__tests__/receipt.property.spec.ts`
    - **Property 18: Receipt Reconciliation — penalty + interest + principal components = receipt amount**
    - **Property 19: Receipt Uniqueness — receipt numbers are unique and sequential**
    - Minimum 100 examples per property
    - **Validates: Requirements 24.1, 24.2, 24.3**

  - [x] 5.7 Write penalty PBTs in `apps/api/src/modules/penalty/__tests__/overdue.property.spec.ts`
    - **Property 20: Non-Negative DPD — DPD is always non-negative**
    - **Property 21: Monotonic Buckets — overdue bucket classification is monotonically non-decreasing with increasing DPD**
    - **Property 22: Positive Flat Penalty — flat penalty amount is always a positive integer**
    - **Property 23: Proportional Percentage Penalty — percentage penalty is proportional and non-negative integer**
    - Minimum 100 examples per property
    - **Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5**

  - [x] 5.8 Write accounting journal PBTs in `apps/api/src/modules/accounting/__tests__/journal.property.spec.ts`
    - **Property 24: Balanced Entries — total debit paise = total credit paise for any valid journal entry**
    - **Property 25: Trial Balance — trial balance total debits = total credits across all accounts**
    - **Property 26: Positive Amounts — all journal entry amounts are positive integers**
    - Minimum 1000 examples per property
    - **Validates: Requirements 22.1, 22.2, 22.3, 22.4**

  - [x] 5.9 Write shared package PBTs
    - **Property 27: Password Validation Round-Trip — all valid passwords pass, all invalid fail**
    - File: `packages/shared/src/validation/__tests__/password.property.spec.ts`
    - **Property 28: PII Masking Safety — masked output never contains full original value**
    - File: `packages/shared/src/utils/__tests__/masking.property.spec.ts`
    - **Property 29: Template Rendering Completeness — no unsubstituted placeholders remain**
    - Minimum 100 examples per property
    - **Validates: Requirements 47.4, 47.5, 67.6, 67.7**

- [x] 6. Checkpoint — Verify all PBTs pass with required example counts
  - Ensure all tests pass, ask the user if questions arise.


- [x] 7. Phase 4 — Service Unit Tests (All 21 Backend Services)
  - [x] 7.1 Write collection service unit tests in `apps/api/src/modules/collection/__tests__/collection.service.spec.ts`
    - Test `postCollection()`, `validateLoanStatus()`, `computeOutstanding()`, `buildJournalLines()`, `buildAllocationRecords()`, `updateInstallments()`, `computeDpdAndBucket()`
    - Test rejection for non-active/non-overdue loans, excess amount handling
    - Mock: repository, accounting service, receipt service, notification service, idempotency service
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9_

  - [x] 7.2 Write reversal service unit tests in `apps/api/src/modules/reversal/__tests__/reversal.service.spec.ts`
    - Test `reverseCollection()`, `getOriginalCollection()`, `getOriginalAllocations()`, `getOriginalJournalEntry()`, `restoreInstallments()`
    - Test rejection of already-reversed collection, mandatory reason/remarks, DPD recalculation
    - Mock: repository, collection service, accounting service, receipt service
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_

  - [x] 7.3 Write penalty service unit tests in `apps/api/src/modules/penalty/__tests__/penalty.service.spec.ts`
    - Test `calculateDpd()`, `classifyOverdueBucket()`, `calculatePenaltyAmount()`, `calculateAndPost()`, `waivePenalty()`, `handleStatusTransition()`, `getLoanDpdInfo()`
    - Test grace period skip, duplicate penalty rejection
    - Mock: repository, accounting service, loan service
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9_

  - [x] 7.4 Write foreclosure service unit tests in `apps/api/src/modules/foreclosure/__tests__/foreclosure.service.spec.ts`
    - Test `calculateForeclosureSettlement()`, `calculateFlatAccruedInterest()`, `calculateReducingBalanceAccruedInterest()`, `createQuote()`, `executeForeclosure()`, `computeOutstandingPrincipal()`, `buildSettlementJournalLines()`
    - Test expired/cancelled/settled quote rejection
    - Mock: repository, collection service, accounting service, schedule service
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 12.9_

  - [x] 7.5 Write disbursement service unit tests in `apps/api/src/modules/disbursement/__tests__/disbursement.service.spec.ts`
    - Test `disburse()` success, rejection for non-approved/no-schedule, idempotency, journal entries, status transitions, amount match
    - Mock: repository, accounting service, idempotency service, notification service
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7_

  - [x] 7.6 Write loan service unit tests in `apps/api/src/modules/loan/__tests__/loan.service.spec.ts`
    - Test loan creation, approval (role requirements, maker-checker), rejection (mandatory remarks), closure (prerequisites), immutability after approval
    - Mock: repository, schedule service, customer service
    - _Requirements: 15.3, 15.4, 15.5, 15.6, 15.7, 61.1, 61.2, 61.3, 61.4, 61.5, 61.7_

  - [x] 7.7 Write auth service unit tests in `apps/api/src/modules/auth/__tests__/auth.service.spec.ts`
    - Test `login()` success, invalid username, invalid password, lockout after 5 attempts, locked account, inactive user
    - Test `refreshToken()` success, revoked token, expired token
    - Test `logout()` token revocation, `changePassword()` success + session invalidation + wrong password rejection
    - Test audit log creation for every auth action
    - Mock: user repository, JWT service, audit service
    - _Requirements: 17.1–17.13_

  - [x] 7.8 Write user service unit tests in `apps/api/src/modules/user/__tests__/user.service.spec.ts`
    - Test creation with hashing, duplicate rejection, update with optimistic locking, role change authorization, area assignment, pagination, deactivation
    - Mock: repository, bcrypt
    - _Requirements: 18.1–18.7_

  - [x] 7.9 Write customer service unit tests
    - Test creation with valid KYC, invalid Aadhaar/PAN rejection, blacklisting, reinstatement, family member CRUD, guarantor CRUD, pagination with area scoping, blacklisted customer loan rejection
    - Mock: repository, document service
    - _Requirements: 19.1–19.8_

  - [x] 7.10 Write loan product service unit tests in `apps/api/src/modules/loan-product/__tests__/loan-product.service.spec.ts`
    - Test creation, version immutability, deactivation, version auto-increment, pagination, parameter validation
    - Mock: repository
    - _Requirements: 20.1–20.6_

  - [x] 7.11 Write accounting service unit tests in `apps/api/src/modules/accounting/__tests__/accounting.service.spec.ts`
    - Test `createJournalEntry()` balanced/unbalanced, `getTrialBalance()`, `getProfitAndLoss()`, `getBalanceSheet()`, `getDaybook()`, `getChartOfAccounts()`
    - Mock: repository
    - _Requirements: 21.1–21.7_

  - [x] 7.12 Write receipt service unit tests in `apps/api/src/modules/receipt/__tests__/receipt.service.spec.ts`
    - Test `generateReceipt()`, `getReceiptForPrint()`, `markAsReversed()`, immutability enforcement, pagination, reversal receipt flags
    - Mock: repository
    - _Requirements: 23.1–23.6_

  - [x] 7.13 Write cashbook service unit tests in `apps/api/src/modules/cashbook/__tests__/cashbook.service.spec.ts`
    - Test `createExpense()`, `createHandover()`, `verifyHandover()`, `getDailySummary()`
    - Mock: repository, accounting service
    - _Requirements: 25.1–25.4_

  - [x] 7.14 Write group service unit tests in `apps/api/src/modules/group/__tests__/group.service.spec.ts`
    - Test `createGroup()`, `addMember()`, `removeMember()`, `postGroupCollection()`, `getGroupSummary()`, dissolved group rejection
    - Mock: repository, collection service
    - _Requirements: 28.1–28.6_

  - [x] 7.15 Write notification service unit tests in `apps/api/src/modules/notification/__tests__/notification.service.spec.ts`
    - Test outbox creation, `fetchProcessableBatch()`, `markSent()`, `markFailed()` with exponential backoff and dead_letter, `resetForRetry()`, template lookup
    - Mock: SMS provider, repository
    - _Requirements: 30.1–30.7_

  - [x] 7.16 Write report service unit tests in `apps/api/src/modules/report/__tests__/report.service.spec.ts`
    - Test all report types: dailyCollection, overdue, disbursement, loanPortfolio, dpdAging, trialBalance, profitLoss, balanceSheet
    - Test `resolveScope()` per user role, `parseDateRange()` with defaults
    - Mock: repository, accounting service
    - _Requirements: 32.1–32.10_

  - [x] 7.17 Write audit service unit tests in `apps/api/src/modules/audit/__tests__/audit.service.spec.ts`
    - Test audit log creation with all required fields, querying with pagination/filtering, append-only enforcement (no update/delete methods), before_state/after_state capture
    - Mock: repository
    - _Requirements: 33.1–33.4_

  - [x] 7.18 Write idempotency service unit tests in `apps/api/src/modules/idempotency/__tests__/idempotency.service.spec.ts`
    - Test `find()` null/cached, `store()` with 24h expiry and concurrent duplicate handling, `cleanupExpired()`, transaction client usage
    - Mock: repository
    - _Requirements: 35.1–35.5_

  - [x] 7.19 Write document service unit tests
    - Test `upload()` success, rejection for invalid MIME/oversized/scripts/invalid prefix, `getSignedUrl()` for active/inactive docs, `softDelete()` sets is_active=false
    - Test `S3StorageService` methods with mocked S3Client
    - Mock: S3Client, repository
    - _Requirements: 57.6–57.10_

  - [x] 7.20 Write settings service unit tests
    - Test `findAll()`, `updateByKey()`, `getHolidays()` empty/stored, `setHolidays()` validation/dedup/sorting/persistence
    - Mock: repository
    - _Requirements: 58.1–58.8_

  - [x] 7.21 Write health check and Prisma service unit tests
    - Test liveness probe (200 + ok), readiness probe (200 + connected / 503 + disconnected), public access, skip throttle
    - Test PrismaService `onModuleInit()` calls `$connect()`, `onModuleDestroy()` calls `$disconnect()`
    - _Requirements: 59.1–59.5, 60.1–60.4_

- [x] 8. Checkpoint — Verify all 21 service unit test suites pass
  - Ensure all tests pass, ask the user if questions arise.


- [x] 9. Phase 5 — Service Property-Based Tests
  - [x] 9.1 Write reversal PBTs in `apps/api/src/modules/reversal/__tests__/reversal.property.spec.ts`
    - **Property 30: Mirror Journal — reversal journal entry is exact mirror (debits↔credits) of original**
    - **Property 31: Net Zero Ledger — net ledger effect of original + reversal = zero per account**
    - **Property 32: Installment Restoration — after reversal, paid amounts return to pre-collection values**
    - Minimum 1000 examples per property
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4**

  - [x] 9.2 Write audit PBTs in `apps/api/src/modules/audit/__tests__/audit.property.spec.ts`
    - **Property 33: Append-Only — audit log count never decreases after any operation**
    - **Property 34: Valid Action Types — every audit log entry has a valid AuditAction enum value**
    - Minimum 100 examples per property
    - **Validates: Requirements 34.1, 34.2, 34.3**

  - [x] 9.3 Write idempotency PBTs in `apps/api/src/modules/idempotency/__tests__/idempotency.property.spec.ts`
    - **Property 35: Idempotence — storing same key twice returns original cached result (f(x) = f(f(x)))**
    - **Property 36: Operation Independence — different operation types stored independently**
    - Minimum 100 examples per property
    - **Validates: Requirements 36.1, 36.2, 36.3**

  - [x] 9.4 Write RBAC PBTs in `apps/api/src/common/guards/__tests__/rbac.property.spec.ts`
    - **Property 37: No Orphaned Permissions — every permission has at least one role with access**
    - **Property 38: Super Admin Full Access — super_admin has access to every permission**
    - **Property 39: Viewer Read-Only — viewer_auditor has only read-level access**
    - **Property 40: No Duplicate Roles — no duplicate role entries per permission**
    - Minimum 100 examples per property
    - **Validates: Requirements 38.1, 38.2, 38.3, 38.4, 38.5**

  - [x] 9.5 Write group collection PBTs in `apps/api/src/modules/group/__tests__/group.property.spec.ts`
    - Property tests for group collection batch consistency
    - **Validates: Requirements 28.4, 29.1**

- [x] 10. Phase 6 — Common Module Tests
  - [x] 10.1 Write global exception filter tests in `apps/api/src/common/filters/__tests__/global-exception.filter.spec.ts`
    - Test BusinessRuleError→422, NotFoundError→404, AuthorizationError→401/403, ValidationError→400, ConflictError→409, unhandled→500 (safe message), requestId in all responses
    - Mock: ArgumentsHost
    - _Requirements: 48.1–48.7_

  - [x] 10.2 Write request ID middleware tests in `apps/api/src/common/middleware/__tests__/request-id.middleware.spec.ts`
    - Test UUID generation when none provided, use provided valid x-request-id, reject invalid x-request-id, availability to downstream handlers
    - Mock: Request, Response, NextFunction
    - _Requirements: 49.1–49.4_

  - [x] 10.3 Write RBAC guard unit tests in `apps/api/src/common/guards/__tests__/rbac.guard.spec.ts`
    - Test allow when role in allowed roles, deny with ForbiddenException, open endpoints without @RequirePermission, unknown permission denial, missing role denial
    - Mock: Reflector, ExecutionContext
    - _Requirements: 37.1–37.5_

  - [x] 10.4 Write JWT auth guard tests in `apps/api/src/common/guards/__tests__/jwt-auth.guard.spec.ts`
    - Test valid token acceptance, expired token rejection, tampered token rejection, missing token rejection
    - Mock: JwtService, ExecutionContext
    - _Requirements: 44.2, 44.3_

  - [x] 10.5 Write throttler guard tests
    - Test `getTracker()` returns user sub when
 JWT present, falls back to IP, returns 'unknown' when neither available
    - Test `throwThrottlingException()` throws ThrottlerException with correct message
    - Mock: ExecutionContext
    - _Requirements: 69.1–69.4_

  - [x] 10.6 Write audit interceptor tests
    - Test logging of requestId, actorId, actorRole, method, URL, IP, duration for success/failure
    - Test anonymous request logging (actorId='anonymous', actorRole='unknown')
    - Test pass-through behavior (no request/response modification)
    - Test interceptor logging error does not break request pipeline
    - Mock: ExecutionContext, CallHandler
    - _Requirements: 68.1–68.5_

  - [x] 10.7 Write environment validation tests in `apps/api/src/config/__tests__/env.validation.spec.ts`
    - Test missing DATABASE_URL, invalid DATABASE_URL, missing JWT_SECRET, short JWT_SECRET
    - Test optional fields (S3_ENDPOINT, SMS_API_KEY) don't cause failure
    - Test default values: JWT_EXPIRY='15m', REFRESH_TOKEN_EXPIRY='7d', S3_BUCKET='as-finance-docs', NODE_ENV='development', PORT=3001
    - Test NODE_ENV accepts only valid values, PORT coerced to positive integer
    - _Requirements: 70.1–70.8_

  - [x] 10.8 Write error class tests in `apps/api/src/common/errors/__tests__/errors.spec.ts`
    - Test all custom error classes: AppError, BusinessRuleError, NotFoundError, AuthorizationError, ValidationError, ConflictError
    - _Requirements: 48.1–48.6_

  - [x] 10.9 Write shared package unit tests
    - Test password validation (valid/invalid patterns)
    - Test PII masking (Aadhaar XXXX-XXXX-1234, PAN XXXXXX1234, mobile masking)
    - Test PERMISSIONS constant covers all expected module.action combinations
    - Test enum values match Prisma schema definitions
    - _Requirements: 47.1–47.3, 47.6, 47.7_

- [x] 11. Checkpoint — Verify all common module and shared package tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Phase 7 — Integration Tests
  - [x] 12.1 Write collection flow integration tests in `apps/api/src/modules/collection/__tests__/collection-allocation.integration.spec.ts`
    - Test full EMI payment: collection record, allocations, schedule update, journal balanced, receipt, outstanding update
    - Test partial payment with correct allocation
    - Test multiple sequential payments on same loan
    - Test atomicity: failed step → no partial state
    - Test idempotency: duplicate key returns cached result
    - Test payment on overdue loan with pending penalties
    - _Requirements: 6.1–6.6_

  - [x] 12.2 Write reversal flow integration tests in `apps/api/src/modules/reversal/__tests__/reversal-flow.integration.spec.ts`
    - Test full reversal: compensating collection, reverse allocations, installments restored, compensating journal, receipt reversed, compensating receipt, audit log
    - Test atomicity, double-reversal rejection, reversal-of-reversal rejection
    - _Requirements: 9.1–9.4_

  - [x] 12.3 Write loan lifecycle integration tests in `apps/api/src/modules/loan/__tests__/loan-lifecycle.integration.spec.ts`
    - Test happy path: draft → submit → review → approve → disburse → collect all → close
    - Test rejection path: create → submit → review → reject
    - Test overdue path: disburse → miss payment → verify overdue + DPD
    - Test schedule frozen at disbursement
    - Test optimistic locking: concurrent updates detect version conflicts
    - _Requirements: 16.1–16.5_

  - [x] 12.4 Write foreclosure flow integration tests in `apps/api/src/modules/foreclosure/__tests__/foreclosure-flow.integration.spec.ts`
    - Test full flow: create quote → approve → execute → loan closed, collection created, journal balanced, installments closed
    - Test atomicity, expired quote rejection, rebate with authorization
    - _Requirements: 13.1–13.4_

  - [x] 12.5 Write cashbook integration tests in `apps/api/src/modules/cashbook/__tests__/cashbook-expense.integration.spec.ts`
    - Test expense creation with journal entry, handover flow (create → verify → status update), daily summary accuracy
    - _Requirements: 27.1–27.3_

  - [x] 12.6 Write group collection integration tests in `apps/api/src/modules/group/__tests__/group-collection.integration.spec.ts`
    - Test group collection: individual collections per member, allocations, receipts, journal entries
    - Test atomicity: one member failure → entire batch rollback
    - Test mixed member statuses (active + overdue)
    - _Requirements: 29.1–29.3_

  - [x] 12.7 Write notification integration tests in `apps/api/src/modules/notification/__tests__/notification-outbox.integration.spec.ts`
    - Test collection succeeds + outbox message created even when SMS provider unavailable
    - Test notification enqueueing within same transaction as finance operation
    - Test finance operation succeeds even if notification service throws
    - _Requirements: 31.1–31.3_

  - [x] 12.8 Write cross-module data integrity integration tests
    - Test cached_outstanding_paise = total_payable - sum of valid allocations
    - Test journal entry totals match collection amount
    - Test receipt amount matches collection amount
    - Test audit log count matches state-changing operations
    - Test sum of allocation principal never exceeds loan principal
    - Test sum of allocation interest never exceeds total interest
    - Test collection + reversal net effect on outstanding = zero
    - _Requirements: 71.1–71.7_

  - [x] 12.9 Write maker-checker integration test
    - Test full flow: field_officer creates loan → submits → manager reviews → manager approves → audit log records both actor IDs
    - _Requirements: 61.6_

  - [x] 12.10 Write settings + schedule holiday integration test
    - Test due date falling on configured holiday is shifted to next business day
    - _Requirements: 58.9_

- [x] 13. Checkpoint — Verify all integration tests pass with database isolation
  - Ensure all tests pass, ask the user if questions arise.


- [x] 14. Phase 8 — API Contract Tests
  - [x] 14.1 Write auth contract tests in `apps/api/test/contract/auth.contract.spec.ts`
    - Test POST /auth/login, POST /auth/refresh, POST /auth/logout, POST /auth/change-password
    - Verify request/response shapes, validation errors (400), auth errors (401)
    - _Requirements: 40.1, 40.18, 40.19_

  - [x] 14.2 Write customer contract tests in `apps/api/test/contract/customer.contract.spec.ts`
    - Test GET /customers, POST /customers, GET /customers/:id, PATCH /customers/:id, POST /customers/:id/blacklist, POST /customers/:id/reinstate, POST /customers/:id/family-members, POST /customers/:id/guarantors
    - _Requirements: 40.3, 40.18, 40.19_

  - [x] 14.3 Write loan contract tests in `apps/api/test/contract/loan.contract.spec.ts`
    - Test GET /loans, POST /loans, GET /loans/:id, POST /loans/:id/submit, POST /loans/:id/approve, POST /loans/:id/reject, POST /loans/:id/close
    - _Requirements: 40.4, 40.18, 40.19_

  - [x] 14.4 Write collection contract tests in `apps/api/test/contract/collection.contract.spec.ts`
    - Test GET /collections, POST /collections
    - _Requirements: 40.5, 40.18, 40.19_

  - [x] 14.5 Write disbursement contract tests in `apps/api/test/contract/disbursement.contract.spec.ts`
    - Test POST /disbursements
    - _Requirements: 40.6, 40.18, 40.19_

  - [x] 14.6 Write reversal contract tests in `apps/api/test/contract/reversal.contract.spec.ts`
    - Test POST /reversals
    - _Requirements: 40.7, 40.18, 40.19_

  - [x] 14.7 Write penalty contract tests in `apps/api/test/contract/penalty.contract.spec.ts`
    - Test GET /penalties/loan/:loanId, POST /penalties/calculate, POST /penalties/:id/waive
    - _Requirements: 40.8, 40.18, 40.19_

  - [x] 14.8 Write foreclosure contract tests in `apps/api/test/contract/foreclosure.contract.spec.ts`
    - Test POST /foreclosures/quote, POST /foreclosures/:id/execute, GET /foreclosures/:id
    - _Requirements: 40.9, 40.18, 40.19_

  - [x] 14.9 Write receipt contract tests in `apps/api/test/contract/receipt.contract.spec.ts`
    - Test GET /receipts/:id, GET /receipts/:id/print, GET /receipts/loan/:loanId
    - _Requirements: 40.10, 40.18, 40.19_

  - [x] 14.10 Write accounting contract tests in `apps/api/test/contract/accounting.contract.spec.ts`
    - Test GET /accounting/chart-of-accounts, GET /accounting/daybook, GET /accounting/trial-balance, GET /accounting/profit-and-loss, GET /accounting/balance-sheet
    - _Requirements: 40.11, 40.18, 40.19_

  - [x] 14.11 Write cashbook contract tests in `apps/api/test/contract/cashbook.contract.spec.ts`
    - Test GET /cashbook/daily-summary, POST /cashbook/expenses, GET /cashbook/expenses, POST /cashbook/handovers, POST /cashbook/handovers/:id/verify
    - _Requirements: 40.12, 40.18, 40.19_

  - [x] 14.12 Write group contract tests in `apps/api/test/contract/group.contract.spec.ts`
    - Test GET /groups, POST /groups, GET /groups/:id, POST /groups/:id/members, DELETE /groups/:id/members/:memberId, POST /groups/:id/collect
    - _Requirements: 40.13, 40.18, 40.19_

  - [x] 14.13 Write report contract tests in `apps/api/test/contract/report.contract.spec.ts`
    - Test GET /reports, GET /reports/export
    - _Requirements: 40.14, 40.18, 40.19_

  - [x] 14.14 Write audit contract tests in `apps/api/test/contract/audit.contract.spec.ts`
    - Test GET /audit-logs
    - _Requirements: 40.15, 40.18, 40.19_

  - [x] 14.15 Write notification contract tests in `apps/api/test/contract/notification.contract.spec.ts`
    - Test GET /notifications, POST /notifications/:id/retry
    - _Requirements: 40.16, 40.18, 40.19_

  - [x] 14.16 Write settings contract tests in `apps/api/test/contract/settings.contract.spec.ts`
    - Test GET /settings, PATCH /settings
    - _Requirements: 40.17, 40.18, 40.19_

- [x] 15. Checkpoint — Verify all API contract tests pass
  - Ensure all tests pass, ask the user if questions arise.


- [x] 16. Phase 9 — RBAC Matrix Tests (7 Roles × All Endpoints)
  - [x] 16.1 Write RBAC matrix tests in `apps/api/test/rbac-matrix.spec.ts`
    - Test all 7 roles (super_admin, manager, field_officer, collection_officer, accountant, office_staff, viewer_auditor) against every protected endpoint
    - Verify correct HTTP status: 200/201 for allowed, 403 for denied
    - Test unauthenticated requests → 401
    - Test viewer_auditor cannot access: customer.create, loan.create, loan.approve, loan.disburse, collection.create, collection.reverse, penalty.calculate, penalty.waive, foreclosure.quote, foreclosure.execute, user.create, settings.update
    - Test collection_officer can access: collection.create, collection.read, handover.create, group.collect; cannot access: loan.approve, loan.disburse, collection.reverse, user.create
    - Test field_officer can access: customer.create, customer.read, customer.update, loan.create, loan.read, loan.submit, group.create, group.manage_members; cannot access: loan.approve, loan.disburse, collection.reverse, accounting.read
    - Test accountant can access: accounting.read, accounting.create_expense, accounting.manage_cashbook, report.read, report.export, handover.verify; cannot access: loan.approve, loan.disburse, customer.create, collection.create
    - _Requirements: 39.1–39.6_

- [x] 17. Phase 10 — Negative Tests
  - [x] 17.1 Write invalid input negative tests in `apps/api/test/negative.spec.ts`
    - Test invalid Aadhaar (non-12-digit, non-numeric, empty), invalid PAN, invalid mobile, invalid email, invalid password
    - Test invalid loan amounts (zero, negative, below/above product bounds), invalid tenure, invalid interest rates
    - Test invalid dates, invalid UUIDs, missing required fields, extra/unknown fields
    - _Requirements: 42.1–42.12_

  - [x] 17.2 Write state violation negative tests in `apps/api/test/negative.spec.ts`
    - Test disbursement of non-approved loan, collection on non-active loan, approval of non-under_review loan
    - Test closing loan with outstanding > 0, closing with unpaid penalties, reversing already-reversed collection
    - Test expired foreclosure quote, modifying loan terms after approval, adding members to dissolved group
    - Test loan for blacklisted customer, duplicate penalty posting
    - _Requirements: 43.1–43.11_

  - [x] 17.3 Write authorization violation negative tests in `apps/api/test/negative.spec.ts`
    - Test unauthenticated → 401, expired JWT → 401, tampered JWT → 401
    - Test IDOR: field_officer accessing other officer's customers, collection_officer posting for unassigned loans
    - Test viewer_auditor cannot perform write operations
    - _Requirements: 44.1–44.6_

- [x] 18. Phase 11 — Concurrency Tests
  - [x] 18.1 Write concurrency tests in `apps/api/test/concurrency.spec.ts`
    - Test double-click payment (idempotency key prevents duplicate)
    - Test concurrent collection posting on same loan (both succeed or one safely rejected)
    - Test concurrent disbursement (only one succeeds)
    - Test concurrent reversal (only one succeeds)
    - Test concurrent loan approval (optimistic locking)
    - Test concurrent receipt number generation (no duplicates)
    - Test concurrent penalty posting (unique constraint prevents duplicates)
    - Test same idempotency key concurrent requests return same result
    - _Requirements: 45.1–45.8_

- [x] 19. Phase 12 — Security Tests
  - [x] 19.1 Write security tests in `apps/api/test/security.spec.ts`
    - Test SQL injection via query params and request bodies neutralized by Prisma
    - Test auth endpoint rate limiting (10 req/min/IP)
    - Test API endpoint rate limiting (100 req/min/user)
    - Test error responses never expose stack traces, SQL, or internal paths
    - Test PII masking in log output (Aadhaar, PAN, mobile)
    - Test JWT secrets not exposed in any API response
    - Test file upload rejects invalid MIME types and oversized files
    - Test pagination max page size enforced (100 items)
    - _Requirements: 46.1–46.8_

- [x] 20. Checkpoint — Verify RBAC, negative, concurrency, and security tests pass
  - Ensure all tests pass, ask the user if questions arise.


- [x] 21. Phase 13 — E2E Business Flow Tests
  - [x] 21.1 Write onboarding E2E test
    - Create customer → upload documents → create loan → submit → approve → disburse → verify all database state
    - _Requirements: 50.1_

  - [x] 21.2 Write collection E2E test
    - Post collection → verify allocation → verify schedule update → verify receipt → verify journal entry → verify outstanding update
    - Test partial payment collection, collection on overdue loan with penalties
    - _Requirements: 50.2, 52.1, 52.3, 52.4_

  - [x] 21.3 Write reversal E2E test
    - Post collection → reverse → verify compensating entries → verify schedule restored → verify receipt reversed
    - _Requirements: 50.3_

  - [x] 21.4 Write overdue + penalty E2E test
    - Disburse loan → wait past due date → calculate penalty → post penalty → verify outstanding includes penalty → collect with penalty-first allocation
    - _Requirements: 50.4_

  - [x] 21.5 Write foreclosure E2E test
    - Create quote → approve → execute → verify loan closed → verify settlement collection → verify journal entries
    - _Requirements: 50.5_

  - [x] 21.6 Write group collection E2E test
    - Create group → add members → post group collection → verify individual collections for each member
    - _Requirements: 50.6_

  - [x] 21.7 Write full loan lifecycle E2E test
    - Create → submit → approve → disburse → collect all EMIs → close → verify final outstanding = 0
    - _Requirements: 50.7_

  - [x] 21.8 Write untested flow verification tests
    - Verify reversal, penalty, foreclosure, group collection, receipt generation, all report types, notification outbox, document upload (MinIO mock), idempotency key handling end-to-end
    - Fix any bugs discovered, create regression tests
    - _Requirements: 53.1–53.9_

- [x] 22. Phase 14 — Frontend-API Compatibility Tests + Bug Fixes
  - [x] 22.1 Write frontend-API field name compatibility tests
    - Test login page sends `username`/`password` matching LoginDto
    - Test customer creation form field names match CreateCustomerDto
    - Test loan creation form field names match CreateLoanDto
    - Test collection creation form field names match PostCollectionDto
    - Test all list pages correctly parse paginated responses (data array + total count)
    - Test loan detail page maps API response fields correctly
    - Test accounting page maps journal entry fields correctly
    - Test cashbook page uses correct API endpoint path
    - Test notifications page maps outbox message fields correctly
    - Test reports page maps report response fields correctly
    - Test receipts page maps receipt fields correctly
    - Fix any mismatches discovered, create regression tests
    - _Requirements: 41.1–41.12_

  - [x] 22.2 Write frontend snake_case compatibility verification tests
    - Test notifications, reports, receipts, audit logs, settings, groups pages render API fields correctly
    - Fix any "undefined" or missing data due to field name mismatch
    - _Requirements: 54.1–54.7_

  - [x] 22.3 Write frontend RBAC UI element tests
    - Test auditor does not see write buttons (e.g., "New Customer")
    - Fix any RBAC UI gaps discovered
    - _Requirements: 44.7, 51.4_

  - [x] 22.4 Fix all discovered bugs with regression tests
    - Fix pagination mismatch, field name mismatch, disbursement 500 error, cashbook wrong endpoint, loan detail missing schedule, Next.js params incompatibility
    - Each fix includes @regression tagged test with BUG-{number} comment block
    - _Requirements: 51.1–51.8_

- [x] 23. Checkpoint — Verify all E2E and frontend compatibility tests pass
  - Ensure all tests pass, ask the user if questions arise.


- [x] 24. Phase 15 — Edge Case Tests
  - [x] 24.1 Write boundary condition edge case tests
    - Test zero-amount collection (rejection or correct handling)
    - Test one-paisa collection, exact outstanding payoff
    - Test Number.MAX_SAFE_INTEGER paise in money fields
    - Test single installment loan (tenure=1, monthly)
    - Test maximum installments (360 months × daily = 10800 installments)
    - Test due date on holiday → shift to next business day
    - Test all installments overdue simultaneously
    - Test foreclosure on first day after disbursement and on last installment due date
    - Test penalty with zero grace days
    - Test group with single member
    - Test empty pagination (page beyond total count)
    - Test concurrent receipt number generation sequence integrity
    - _Requirements: 55.1–55.14_

  - [x] 24.2 Write BigInt/Number conversion safety tests
    - Test BigInt within MAX_SAFE_INTEGER converts without precision loss
    - Test BigInt serialization in JSON API responses
    - Test Decimal.js intermediate calculations produce correct integer paise after ROUND_HALF_UP
    - Test `calculateProcessingFee()` BigInt results for edge cases (0n, 100n, 10B paise)
    - Test BigInt arithmetic in allocation/reversal/outstanding matches Decimal.js
    - Test handling of values exceeding MAX_SAFE_INTEGER
    - _Requirements: 62.1–62.6_

  - [x] 24.3 Write timezone and date handling tests
    - Test business date derivation when UTC is 00:00–05:30 (previous day in IST)
    - Test due date generation across month boundaries (Jan 31 → Feb 28/29)
    - Test DPD uses date-only comparison (no off-by-one at midnight)
    - Test weekly/daily frequency date spacing regardless of timezone
    - Test penalty reference dates use IST consistently
    - Test holiday-shifted due date evaluated in IST context
    - _Requirements: 63.1–63.6_

  - [x] 24.4 Write optimistic locking tests
    - Test stale version on customer update → ConflictError
    - Test stale version on loan update → ConflictError
    - Test version auto-increment on successful update
    - Test concurrent update conflict detection (two simultaneous loan updates)
    - Test ConflictError includes entity type and ID
    - Test schedule installment version checks during collection posting
    - _Requirements: 64.1–64.6_

  - [x] 24.5 Write pagination edge case tests
    - Test skip > total count → empty data with correct total
    - Test take=0 → rejection or empty data
    - Test negative skip/take → validation error
    - Test take > 100 → clamped or rejected
    - Test filtered total count (not unfiltered table count)
    - Test skip + take near total count → correct partial page
    - _Requirements: 73.1–73.7_

  - [x] 24.6 Write loan product constraint validation tests
    - Test principal at min/max bounds → accepted
    - Test principal below min / above max → ValidationError
    - Test tenure at min/max bounds → accepted
    - Test tenure outside range → ValidationError
    - Test deactivated product → BusinessRuleError
    - _Requirements: 74.1–74.8_

  - [x] 24.7 Write loan number generation integration tests
    - Test concurrent loan creation produces no duplicate loan numbers (PostgreSQL sequence)
    - Test loan_number unique constraint rejects duplicates at DB level
    - _Requirements: 65.3, 65.5_

  - [x] 24.8 Write soft delete behavior tests
    - Test soft-deleted documents excluded from listing, accessible via direct ID for compliance
    - Test softDelete sets is_active=false, retains file in S3
    - Test no cascade deletion on finance records when related entities soft-deleted
    - Test upload creates records with is_active=true by default
    - _Requirements: 76.1–76.6_

  - [x] 24.9 Write migration safety tests
    - Test all migrations apply successfully in sequence
    - Test seed script executes without errors after migrations
    - Test NOT NULL column additions include default/backfill
    - Test migration_lock.toml specifies postgresql provider
    - _Requirements: 72.1–72.5_

  - [x] 24.10 Write processing fee journal entry integration test
    - Test disbursement with configured fee creates correct journal entry (Debit Cash/Bank, Credit Processing_Fee_Income)
    - _Requirements: 66.7_

- [x] 25. Checkpoint — Verify all edge case tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 26. Phase 16 — Coverage Verification + Regression Test Index
  - [x] 26.1 Write outstanding balance drift detection tests
    - Test cached_outstanding recomputable from total_payable minus valid allocations
    - Test after collections + reversals, cached matches independently computed outstanding
    - Test transactional update of cached_outstanding within same DB transaction
    - _Requirements: 75.1, 75.2, 75.4_

  - [x] 26.2 Write outstanding drift PBT
    - **Property 41: Outstanding Drift — for any valid sequence of collection/reversal operations, cached_outstanding = total_payable - net allocated payments**
    - Minimum 1000 examples
    - **Validates: Requirements 75.3, 75.6**

  - [x] 26.3 Configure coverage thresholds and verify targets met
    - Verify: schedule.service.ts ≥ 95%, allocation-engine.ts ≥ 95%, collection.service.ts ≥ 85%, reversal.service.ts ≥ 90%, rbac.guard.ts ≥ 90%, domain services ≥ 85%, controllers ≥ 80%, repositories ≥ 70%, overall ≥ 75%
    - _Requirements: 56.5_

  - [x] 26.4 Create regression test index
    - Create `apps/api/test/regression-index.md` documenting each bug: number, description, root cause, fix, regression test file path
    - Tag all regression tests with `@regression` marker
    - _Requirements: 51.8, 56.8_

- [x] 27. Final Checkpoint — Full test suite green, coverage targets met
  - Ensure all tests pass, ask the user if questions arise.

- [x] 28. Phase 17 — Existing Test Audit and Deduplication
  - [x] 28.1 Audit existing test files against new tasks to avoid duplication
    - Review existing E2E tests in `apps/api/test/e2e/` (auth, customer-onboarding, loan-lifecycle, collection, disbursement, reversal, foreclosure, group-loan, cashbook-expense, notification-outbox, report, settings-holiday, emi-schedule, loan-product, user-management, family-guarantor, health-check, request-id, env-validation, audit-log, accounting-ledger, business-flows, overdue-penalty, loan-closure)
    - Review existing PBT tests in `apps/api/test/pbt/` (schedule, allocation, advance-payment, journal-balance, rbac-matrix, receipt-sequentiality, reversal-neutrality)
    - Review existing unit tests in `apps/api/src/modules/*/__tests__/` (all service specs, property specs, integration specs)
    - Review existing shared package tests in `packages/shared/src/` (password, masking, schemas, money, permissions)
    - For each new task, check if an existing test already covers the requirement — if so, mark the task as already covered and note the existing file
    - For partially covered requirements, extend the existing test file rather than creating a new one
    - _Requirements: 56.7 (no shared mutable state between test files)_

  - [x] 28.2 Fix existing test files that reference wrong API field names or endpoints
    - Scan all existing E2E and PBT test files for camelCase field references that should be snake_case
    - Scan for wrong API endpoint paths (e.g., `/cashbook?date=` instead of `/cashbook/daily-summary?date=`)
    - Scan for `page`/`pageSize` query params that should be `skip`/`take`
    - Fix all mismatches found and verify tests pass
    - _Requirements: 41.12, 51.3_

  - [x] 28.3 Verify existing test infrastructure compatibility
    - Verify `apps/api/test/helpers/factories.ts` produces entities compatible with current Prisma schema
    - Verify `apps/api/test/helpers/auth-client.ts` generates valid JWT tokens for all 7 roles
    - Verify `apps/api/test/helpers/cleanup.ts` correctly tracks and cleans up all entity types
    - Verify `apps/api/test/helpers/db-utils.ts` correctly handles BigInt fields
    - Verify `apps/api/test/setup/global-setup.ts` and `global-teardown.ts` work with local PostgreSQL (no Docker dependency)
    - Fix any incompatibilities found
    - _Requirements: 56.4, 56.6_

- [x] 29. Phase 18 — Shared Package Validation Schema Tests
  - [x] 29.1 Write/extend Zod validation schema tests in `packages/shared/src/validation/__tests__/schemas.spec.ts`
    - Test `aadhaarSchema` accepts valid 12-digit strings, rejects non-12-digit, non-numeric, empty
    - Test `panSchema` accepts valid PAN format [A-Z]{5}[0-9]{4}[A-Z]{1}, rejects invalid formats
    - Test `mobileSchema` accepts valid 10-digit starting with 6-9, rejects invalid
    - Test `pincodeSchema` accepts valid 6-digit, rejects invalid
    - Test `paiseSchema` accepts positive integers, rejects zero/negative/float
    - Test `passwordSchema` accepts valid passwords, rejects too short/missing uppercase/lowercase/digit
    - _Requirements: 42.1, 42.2, 42.3, 47.1, 47.2_

  - [x] 29.2 Write/extend money utility tests in `packages/shared/src/utils/__tests__/money.spec.ts`
    - Test `paiseToDec()` for edge cases: 0, 1, MAX_SAFE_INTEGER, negative values
    - Test `decToPaise()` for edge cases: 0, fractional amounts, ROUND_HALF_UP behavior
    - Test `formatINR()` for Indian numbering system (lakhs, crores), zero, negative, large amounts
    - _Requirements: 62.3, 62.5_

- [x] 30. Phase 19 — User Contract Tests (Missing from Phase 8)
  - [x] 30.1 Write user contract tests in `apps/api/test/contract/user.contract.spec.ts`
    - Test GET /users, POST /users, GET /users/:id, PATCH /users/:id, POST /users/:id/area-assignments, DELETE /users/:id/area-assignments/:areaId
    - Verify request/response shapes, validation errors (400), auth errors (401/403)
    - _Requirements: 40.2, 40.18, 40.19_

  - [x] 30.2 Write document contract tests in `apps/api/test/contract/document.contract.spec.ts`
    - Test POST /documents/upload, GET /documents/:id/url, DELETE /documents/:id
    - Verify multipart upload handling, signed URL response, soft delete response
    - _Requirements: 40.18, 40.19, 57.6, 57.8, 57.9_

  - [x] 30.3 Write health contract tests in `apps/api/test/contract/health.contract.spec.ts`
    - Test GET /health/live, GET /health/ready
    - Verify response shapes, public access (no auth), skip throttle
    - _Requirements: 59.1, 59.2, 59.4, 59.5_

- [x] 31. Phase 20 — Loan Closure Specific Tests (Gap in Phase 4)
  - [x] 31.1 Write loan closure unit tests in `apps/api/src/modules/loan/__tests__/loan-closure.spec.ts`
    - Test closure prerequisites: outstanding = 0, no pending penalties, no pending reversals
    - Test closure with outstanding > 0 → BusinessRuleError
    - Test closure with unpaid penalties → BusinessRuleError
    - Test closure creates audit log entry
    - Test closure transitions loan to terminal state (no further transitions allowed)
    - _Requirements: 15.7, 43.4, 43.5_

  - [x] 31.2 Write concurrent loan operations tests
    - Test concurrent max_concurrent_loans enforcement (product version limit)
    - Test concurrent loan creation for same customer respects product limit
    - _Requirements: 45.5, 74.8_

- [x] 32. Phase 21 — Document Upload Integration Tests
  - [x] 32.1 Write document upload integration tests with S3 mock
    - Test full upload flow: validate MIME → validate size → scan scripts → upload to S3 → create metadata record
    - Test signed URL generation with 15-minute expiry
    - Test soft delete flow: set is_active=false, verify file retained in S3
    - Test upload with each valid prefix (kyc, loan-docs, receipts, expenses)
    - Mock S3StorageService for tests without MinIO
    - _Requirements: 53.8, 57.6, 57.7, 57.8, 57.9, 76.3_

- [x] 33. Phase 22 — Rate Limiting Integration Tests (Gap in Phase 12)
  - [x] 33.1 Write rate limiting integration tests
    - Test auth endpoint rate limit: send 11 requests to POST /auth/login within 1 minute, verify 11th returns 429
    - Test API endpoint rate limit: send 101 authenticated requests within 1 minute, verify 101st returns 429
    - Test rate limit headers present: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
    - Test rate limit reset after window expires
    - _Requirements: 46.2, 46.3, 69.5, 69.6_

- [x] 34. Checkpoint — Verify all gap-filling tasks pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 35. Final Comprehensive Checkpoint — All 76 requirements verified
  - Run full test suite across all tiers
  - Verify coverage thresholds met
  - Verify regression test index complete
  - Verify no remaining camelCase/snake_case mismatches in frontend
  - Verify all discovered bugs have permanent fixes with @regression tests
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each phase
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- All money values in tests use integer paise (never floats)
- Integration tests use transaction rollback for isolation
- E2E tests use tracked entity cleanup
- Every discovered bug gets a permanent regression test with @regression tag
- Phase 17 (task 28) MUST be executed before writing new tests to avoid duplicating existing coverage
- Existing test files in `apps/api/test/e2e/`, `apps/api/test/pbt/`, and `apps/api/src/modules/*/__tests__/` should be extended rather than replaced when they partially cover a requirement
- Phases 18-22 (tasks 29-33) fill gaps identified during QA review of the original 27 tasks
- Total: 35 top-level tasks, ~110 sub-tasks, 41 correctness properties, 10 checkpoints, covering all 76 requirements
