# Implementation Plan: Comprehensive E2E Testing for AS Finance LMS

## Overview

This plan implements the full E2E test suite for AS Finance LMS: test infrastructure (Vitest E2E config, global setup/teardown, auth clients, DB utils, factories, fast-check arbitraries, cleanup utils, Playwright config), followed by 24 E2E API test files, 9 PBT test files, 3 cross-cutting test files (negative, concurrency, security), and 8 Playwright test files. Tasks are ordered by dependency — infrastructure first, then tests in execution order matching the design's test execution sequence.

## Tasks

- [x] 1. Set up E2E test infrastructure
  - [x] 1.1 Create Vitest E2E configuration (`apps/api/test/vitest.e2e.config.ts`)
    - Configure include patterns for `test/e2e/**/*.e2e.spec.ts`, `test/pbt/**/*.pbt.spec.ts`, `test/negative.e2e.spec.ts`, `test/concurrency.e2e.spec.ts`, `test/security.e2e.spec.ts`
    - Set globalSetup to `test/setup/global-setup.ts`
    - Configure testTimeout 30s, hookTimeout 60s, pool forks with maxForks 1, verbose reporter, bail 0
    - _Requirements: Design Section 1 (Vitest E2E Configuration)_

  - [x] 1.2 Create test environment config (`apps/api/test/setup/test-config.ts`)
    - Define `TestConfig` interface with database, api, frontend, minio, and pbt sections
    - Load config from environment variables with sensible defaults (DB URL, API base URL localhost:3001, frontend localhost:3000, MinIO localhost:9000)
    - Export default and finance PBT run counts (100 default, 1000 finance-critical)
    - _Requirements: Design Data Models (TestConfig)_

  - [x] 1.3 Create global setup (`apps/api/test/setup/global-setup.ts`)
    - Verify PostgreSQL connectivity via Prisma
    - Run pending migrations if needed
    - Verify API server health via GET /health/ready
    - Seed baseline data: users (one per role + second manager for maker-checker), loan products (flat monthly, reducing monthly, flat weekly, with processing fee), chart of accounts, holiday calendar, system settings
    - Generate and cache JWT tokens for each role
    - Export `SeedData` references for use in test suites
    - _Requirements: Design Section 2 (Global Setup/Teardown), Design Data Models (SeedData)_

  - [x] 1.4 Create global teardown (`apps/api/test/setup/global-teardown.ts`)
    - Clean up all test data created during the test run
    - Disconnect Prisma client
    - _Requirements: Design Section 2 (Global Setup/Teardown)_

  - [x] 1.5 Create authenticated HTTP clients (`apps/api/test/helpers/auth-client.ts`)
    - Implement `createAuthClients` function returning `AuthClients` interface
    - Create pre-configured Supertest agents for: superAdmin, manager, manager2, fieldOfficer, collectionOfficer, accountant, officeStaff, viewerAuditor, unauthenticated, expired (expired JWT), tampered (tampered JWT)
    - Each agent sets Authorization header with cached JWT token
    - _Requirements: Design Section 3 (Authenticated HTTP Clients)_

  - [x] 1.6 Create database utilities (`apps/api/test/helpers/db-utils.ts`)
    - Implement `DbUtils` interface with direct Prisma client for verification queries
    - Include entity finders: findCustomerById, findLoanById, findSchedulesByLoanId, findCollectionsByLoanId, findJournalEntryById, findJournalLinesByEntryId, findAuditLogsByTarget, findReceiptByCollectionId, findPenaltiesByLoanId, findOutboxMessagesBySource, findUserById, findRefreshTokensByUserId, findSettingByKey, findFamilyMembersByCustomerId, findGuarantorsByCustomerId
    - Include aggregate queries: sumAllocationsForCollection, getLoanOutstanding, getTrialBalanceTotals, getCashbookBalance, countReceiptsForLoan, getReceiptNumberRange
    - Include cleanupTestData method
    - _Requirements: Design Section 4 (Database Utilities)_

  - [x] 1.7 Create test factories (`apps/api/test/helpers/factories.ts`)
    - Implement `Factories` interface with API-based entity creation
    - Include: loginAs, createUser, assignArea, createCustomer, addFamilyMember, addGuarantor, createLoanProduct, createLoan (with optional advanceTo status), postCollection, createGroup, recordExpense, createHandover
    - Include utility helpers: advanceLoanToActive, createLoanWithPayments
    - Use factory defaults from design (CUSTOMER_DEFAULTS, LOAN_DEFAULTS, COLLECTION_DEFAULTS, USER_DEFAULTS, FAMILY_MEMBER_DEFAULTS, GUARANTOR_DEFAULTS)
    - _Requirements: Design Section 5 (Test Factories), Design Data Models (Factory Defaults)_

  - [x] 1.8 Create fast-check custom arbitraries (`apps/api/test/helpers/arbitraries.ts`)
    - Implement all domain-specific generators from design: arbAadhaarNumber, arbPanNumber, arbMobileNumber, arbPaiseAmount, arbPrincipalPaise, arbAnnualRateBps, arbTenureMonths, arbInterestType, arbFrequency, arbPaymentMode, arbLoanParams, arbPaymentSequence, arbLoanStatusPair, arbUserRole
    - Implement invalid input generators: arbInvalidAadhaar, arbInvalidPan, arbWhitespaceOnly
    - _Requirements: Design Section 6 (fast-check Custom Arbitraries)_

  - [x] 1.9 Create cleanup utilities (`apps/api/test/helpers/cleanup.ts`)
    - Implement `CleanupUtils` interface with cleanupAll, cleanupSuite, and track methods
    - Use naming convention (test data prefixed with `test_`) and cascading deletes
    - _Requirements: Design Section 7 (Cleanup Utilities)_

  - [x] 1.10 Create seed helper (`apps/api/test/helpers/seed.ts`)
    - Implement baseline seed data creation: users per role, loan products (flat/reducing/weekly/with-fee), chart of accounts entries, holiday calendar dates, system settings
    - Return typed `SeedData` object matching design schema
    - _Requirements: Design Data Models (SeedData, Seed Data Schema)_

- [x] 2. Checkpoint — Verify test infrastructure compiles and global setup runs
  - Ensure all infrastructure files compile with no TypeScript errors
  - Ensure global setup can connect to DB, seed data, and generate auth tokens
  - Ask the user if questions arise.

- [x] 3. Implement health check and foundational E2E tests
  - [x] 3.1 Implement health check E2E tests (`apps/api/test/e2e/health-check.e2e.spec.ts`)
    - Test GET /health/live returns 200 with `{ status: 'ok' }` without auth
    - Test GET /health/ready returns 200 when DB connected and migrations current
    - Test health endpoints do not require JWT authentication
    - Test health endpoints respond within 500ms
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5; Design GAP 7_

  - [x] 3.2 Implement env validation E2E tests (`apps/api/test/e2e/env-validation.e2e.spec.ts`)
    - Test valid environment passes Zod validation
    - Test missing DATABASE_URL, JWT_SECRET fail validation
    - Test JWT_SECRET shorter than 16 chars fails
    - Test invalid DATABASE_URL format fails
    - Test default values applied correctly (PORT=3001, JWT_EXPIRY=15m)
    - Test optional fields can be omitted
    - _Requirements: Design GAP 21_

  - [x] 3.3 Implement request ID E2E tests (`apps/api/test/e2e/request-id.e2e.spec.ts`)
    - Test request without x-request-id gets generated UUID in response
    - Test request with x-request-id echoes same value
    - Test error responses include requestId matching header
    - Test audit log entries contain same request_id
    - Test concurrent requests get isolated request IDs
    - _Requirements: Design GAP 22; Property 30_

- [x] 4. Implement auth and user management E2E tests
  - [x] 4.1 Implement auth E2E tests (`apps/api/test/e2e/auth.e2e.spec.ts`)
    - Test successful login returns access token, refresh token, and user profile
    - Test login with invalid credentials returns 401 INVALID_CREDENTIALS
    - Test login with inactive user returns 401
    - Test account lockout after 5 consecutive failed attempts (verify locked_until in DB)
    - Test locked account rejects login until lockout expires
    - Test refresh token rotation: old token revoked, new token issued
    - Test refresh with revoked/expired token returns 401
    - Test logout revokes all refresh tokens (verify in DB)
    - Test password change invalidates all sessions
    - Test password change with incorrect current password returns error
    - Test tampered JWT returns 401
    - Test expired JWT returns 401
    - _Requirements: Design GAP 1 (Auth E2E); Property 35_

  - [x] 4.2 Implement user management E2E tests (`apps/api/test/e2e/user-management.e2e.spec.ts`)
    - Test super admin creates user with role assignment, verify DB persistence
    - Test manager creates user, verify allowed role restrictions
    - Test user update with optimistic locking version field
    - Test role change creates audit log with before/after
    - Test area assignment for field officer, verify user_area_assignments
    - Test area assignment for collection officer, verify scope enforcement
    - Test deactivate user sets is_active=false, login rejected
    - Test unauthorized role (field_officer) creating user returns 403
    - _Requirements: Design GAP 2; Property 17_

- [x] 5. Implement customer and family/guarantor E2E tests
  - [x] 5.1 Implement customer onboarding E2E tests (`apps/api/test/e2e/customer-onboarding.e2e.spec.ts`)
    - Test valid customer creation via POST /customers with Field Officer JWT returns 201
    - Test invalid Aadhaar/PAN format returns 400 with validation error
    - Test duplicate Aadhaar/mobile flags potential duplicate requiring Manager review
    - Test KYC upload with invalid MIME type or >5MB returns 400
    - Test valid KYC upload stores file in MinIO and returns signed URL (15min expiry)
    - Test customer update records before_state/after_state in audit_logs
    - Test Manager blacklists customer, subsequent loan applications rejected
    - Test Aadhaar masking in API responses (XXXX-XXXX-1234 format)
    - _Requirements: 1.1–1.8; Properties 12, 13, 17_

  - [x] 5.2 Implement family member and guarantor E2E tests (`apps/api/test/e2e/family-guarantor.e2e.spec.ts`)
    - Test add family member with correct relationship, verify persistence
    - Test add multiple family members, verify all returned in customer detail
    - Test add guarantor with valid Aadhaar, verify persistence
    - Test add guarantor with invalid Aadhaar returns 400
    - Test add guarantor with photo upload, verify MinIO storage
    - Test list guarantors returns correct data
    - Test guarantor Aadhaar masked in API response
    - _Requirements: Design GAP 19; Property 13_

- [x] 6. Implement loan product and lifecycle E2E tests
  - [x] 6.1 Implement loan product E2E tests (`apps/api/test/e2e/loan-product.e2e.spec.ts`)
    - Test Manager creates loan product with valid config returns 201
    - Test product update creates new version, preserves previous version
    - Test processing fee configuration persisted correctly
    - Test deactivate product with active loans prevented
    - Test out-of-range product values (negative rate, zero principal, tenure min>max) return 400
    - _Requirements: 2.1–2.5; Property 12_

  - [x] 6.2 Implement loan lifecycle E2E tests (`apps/api/test/e2e/loan-lifecycle.e2e.spec.ts`)
    - Test loan creation in draft status with sequential loan number LN-YYYY-NNNNN
    - Test loan submission validates principal/tenure within product ranges, customer not blacklisted
    - Test complete status transition chain: draft→submitted→under_review→approved→disbursed→active→closed
    - Test maker-checker enforcement on approval (different user than creator)
    - Test invalid status transitions return INVALID_STATUS_TRANSITION
    - Test approved loan terms immutable via PATCH
    - Test concurrent loan creation produces unique loan numbers
    - _Requirements: 3.1–3.7; Properties 11, 19, 23_

- [x] 7. Implement EMI schedule and disbursement E2E tests
  - [x] 7.1 Implement EMI schedule E2E tests (`apps/api/test/e2e/emi-schedule.e2e.spec.ts`)
    - Test flat interest schedule: total interest = principal × rate × tenure / 12, equal installments
    - Test reducing balance schedule: standard amortization formula, interest on outstanding principal
    - Test schedule reconciliation: sum of principal components = loan principal, sum of interest = total interest
    - Test schedule determinism: identical inputs produce identical output
    - Test holiday adjustment: due dates shifted to next business day
    - Test rounding: Decimal.js ROUND_HALF_UP, difference absorbed by last installment
    - _Requirements: 4.1–4.6; Properties 1, 2, 3_

  - [x] 7.2 Implement disbursement E2E tests (`apps/api/test/e2e/disbursement.e2e.spec.ts`)
    - Test disbursement with valid idempotency key verifies all prerequisites and executes atomically
    - Test unmet prerequisites return typed error listing all failures
    - Test successful disbursement atomically updates loan status, creates disbursement record, journal entry, sets outstanding, creates audit log
    - Test failed disbursement rolls back entirely (no partial state)
    - Test duplicate idempotency key returns original result without duplicates
    - Test processing fee calculation: fixed paise and percentage with ROUND_HALF_UP
    - _Requirements: 5.1–5.6; Properties 8, 10, 18_

- [x] 8. Checkpoint — Verify core loan lifecycle E2E tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement collection, reversal, and overdue E2E tests
  - [x] 9.1 Implement collection E2E tests (`apps/api/test/e2e/collection.e2e.spec.ts`)
    - Test collection posting executes atomically: record, allocation, installment updates, journal entries, receipt, outstanding update, audit log
    - Test allocation order: penalty (oldest) → interest (current then oldest overdue) → principal (current then oldest overdue)
    - Test allocation preservation: sum of components equals collection amount
    - Test partial payment allocates available amount, installment status = partial
    - Test idempotency key returns original result without duplicates
    - Test unique sequential receipt number generation, receipts immutable
    - Test collection against overdue loan recalculates DPD and overdue_bucket
    - Test collection against closed/defaulted/foreclosed/rejected loan returns typed error
    - Test outstanding invariant: cached_outstanding = total_payable − sum_allocated
    - Test over-collection returns COLLECTION_EXCEEDS_OUTSTANDING
    - _Requirements: 6.1–6.10; Properties 4, 5, 6, 10, 20, 22, 25_

  - [x] 9.2 Implement reversal E2E tests (`apps/api/test/e2e/reversal.e2e.spec.ts`)
    - Test reversal executes atomically: compensating collection, reverse allocations, restore installment statuses, compensating journal entries, mark receipt reversed, issue compensating receipt, audit log
    - Test net ledger effect of original + reversal = zero
    - Test prevent reversal of already-reversed collection
    - Test prevent reversal of a reversal (no chained reversals)
    - Test reversal recalculates DPD and overdue_bucket
    - Test reversal recorded in audit_logs with actor, reason, timestamp
    - _Requirements: 7.1–7.6; Properties 7, 17_

  - [x] 9.3 Implement overdue and penalty E2E tests (`apps/api/test/e2e/overdue-penalty.e2e.spec.ts`)
    - Test installment marked overdue when due date passes without full payment
    - Test DPD = calendar days since earliest unpaid installment due date
    - Test overdue bucket classification: 1-30, 31-60, 61-90, 90+
    - Test penalty posting atomically creates penalty record, journal entry, updates outstanding, audit log
    - Test duplicate penalty prevention via unique constraint (loan_id, installment_id, penalty_period)
    - Test loan returns to active when all overdue installments paid and DPD=0
    - Test penalty waiver requires maker-checker approval
    - Test DPD calculation across timezone boundaries (IST business dates, UTC timestamps)
    - _Requirements: 8.1–8.7; Properties 14, 27_

- [x] 10. Implement foreclosure and loan closure E2E tests
  - [x] 10.1 Implement foreclosure E2E tests (`apps/api/test/e2e/foreclosure.e2e.spec.ts`)
    - Test foreclosure quote calculates: outstanding principal + accrued interest + pending penalties − rebate
    - Test quote has 24-hour validity, expired quote rejected
    - Test settlement payment atomically: final collection, close installments, journal entries, status=foreclosed, audit log
    - Test failed foreclosure transaction rolls back entirely
    - Test maker-checker enforcement on foreclosure approval
    - _Requirements: 9.1–9.5; Property 15_

  - [x] 10.2 Implement loan closure E2E tests (`apps/api/test/e2e/loan-closure.e2e.spec.ts`)
    - Test closure verifies prerequisites: all installments paid, penalties settled/waived, no pending reversals, outstanding=0 (within 1 paisa tolerance)
    - Test unmet prerequisites return CLOSURE_PREREQUISITES_NOT_MET with list
    - Test successful closure updates status to closed with audit log
    - Test prevent reopening closed loan (INVALID_STATUS_TRANSITION)
    - _Requirements: 10.1–10.4_

- [x] 11. Implement group loan and accounting E2E tests
  - [x] 11.1 Implement group loan E2E tests (`apps/api/test/e2e/group-loan.e2e.spec.ts`)
    - Test group creation with valid data persists group and members
    - Test group size constraints: min 5, max 15 members
    - Test group collection with member-wise breakdown validates sum equals total
    - Test mismatched member amounts rejected with discrepancy error
    - Test group collection generates individual receipts per member
    - Test prevent removing member with active loans
    - _Requirements: 11.1–11.6; Properties 16, 32_

  - [x] 11.2 Implement accounting and ledger E2E tests (`apps/api/test/e2e/accounting-ledger.e2e.spec.ts`)
    - Test all journal entries balanced: total debits = total credits per entry
    - Test disbursement journal: DR Loans_Receivable, CR Cash/Bank
    - Test collection journal: DR Cash/Bank, CR Loans_Receivable/Interest_Income/Penalty_Income
    - Test reversal journal: mirror entries of original
    - Test journal entries and receipts immutable (no UPDATE/DELETE via API)
    - Test trial balance: sum debit balances = sum credit balances
    - Test no orphaned journal entries (all have valid source reference)
    - _Requirements: 12.1–12.7; Properties 8, 9, 21, 22_

- [x] 12. Implement cashbook, notification, and report E2E tests
  - [x] 12.1 Implement cashbook and expense E2E tests (`apps/api/test/e2e/cashbook-expense.e2e.spec.ts`)
    - Test expense recording atomically creates expense, journal entry (DR Expense, CR Cash/Bank), audit log
    - Test cash handover creation with declared amount, verification by manager
    - Test cashbook balance: closing = opening + inflows − outflows
    - Test handover verification updates status and creates audit log
    - _Requirements: 13.1–13.4; Property 26_

  - [x] 12.2 Implement notification outbox E2E tests (`apps/api/test/e2e/notification-outbox.e2e.spec.ts`)
    - Test collection posting creates outbox message within same transaction
    - Test disbursement creates outbox message within same transaction
    - Test SMS provider failure does NOT roll back finance transaction (critical invariant)
    - Test failed message retries with exponential backoff (30s, 2min, 8min)
    - Test message moves to dead_letter after max retries
    - Test manual retry resets dead_letter to pending
    - Test outbox message contains correct template variables
    - Test batch processing with FOR UPDATE SKIP LOCKED prevents duplicate processing
    - _Requirements: Design GAP 3; Properties 29, 33_

  - [x] 12.3 Implement report E2E tests (`apps/api/test/e2e/report.e2e.spec.ts`)
    - Test all 20+ report types return 200 with valid data structure
    - Test RBAC scope filtering: field_officer sees only assigned area data
    - Test RBAC scope filtering: collection_officer sees only assigned route data
    - Test manager sees all data (no scope restriction)
    - Test viewer_auditor has read access to all reports
    - Test export endpoint returns format metadata for PDF, XLSX, CSV
    - Test rate limiting: 6th report request within 1 minute returns 429
    - Test unknown report type returns 404
    - Test date range filtering (startDate, endDate, asOfDate)
    - Test report data matches known seeded test data
    - _Requirements: Design GAP 4; Property 34_

- [x] 13. Implement settings, audit, and remaining E2E tests
  - [x] 13.1 Implement settings and holiday E2E tests (`apps/api/test/e2e/settings-holiday.e2e.spec.ts`)
    - Test super admin reads system settings, verify response structure
    - Test super admin updates setting, verify persistence and audit log
    - Test manager reads settings (allowed, 200)
    - Test field officer reads settings (denied, 403)
    - Test holiday calendar CRUD: add/remove holiday dates
    - Test holiday effect: loan due date shifts to next business day for newly added holiday
    - Test settings update with invalid value returns 400
    - _Requirements: Design GAP 5_

  - [x] 13.2 Implement audit log E2E tests (`apps/api/test/e2e/audit-log.e2e.spec.ts`)
    - Test query audit logs by target entity and ID
    - Test query by action type, actor, date range
    - Test pagination with correct page size and ordering
    - Test append-only: DELETE and UPDATE on audit_logs rejected via API
    - Test audit log entry structure: action_type, actor_id, actor_role, target_entity, target_id, timestamp, ip_address, request_id, before_state, after_state
    - Test viewer_auditor can read audit logs (200)
    - Test field_officer cannot read audit logs (403)
    - _Requirements: Design GAP 6; Property 28_

  - [x] 13.3 Implement business flows E2E tests (`apps/api/test/e2e/business-flows.e2e.spec.ts`)
    - Flow 1: Happy path full loan lifecycle (customer → loan → approve → disburse → pay all EMIs → outstanding=0 → close)
    - Flow 2: Partial payment → overdue → penalty → collection → status returns to active
    - Flow 3: Group lending (5 customers → group → individual loans → group collection → individual receipts)
    - Flow 4: Reversal + re-collection (post → verify → reverse → verify compensating → re-post → verify)
    - Flow 5: Foreclosure (3 EMIs paid → quote → approve → settle → status=foreclosed → verify ledger)
    - Flow 6: Customer blacklist → reinstatement (blacklist → loan rejected → reinstate → loan accepted → audit trail)
    - Flow 7: Advance payment (pay 3x EMI → verify first 3 installments paid → verify future allocation → verify outstanding)
    - _Requirements: Design GAP 9; Properties 4, 5, 6, 7, 15, 17, 24_

- [x] 14. Checkpoint — Verify all E2E API tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. Implement property-based tests (PBT)
  - [x] 15.1 Implement allocation PBT (`apps/api/test/pbt/allocation.pbt.spec.ts`)
    - **Property 4: Allocation Preservation** — For all valid collection amounts and loan states, sum(penalty + interest + principal + excess) == collection_amount_paise. No money created or lost.
    - **Property 5: Allocation Order Correctness** — Penalty (oldest first) → interest (oldest first) → principal (oldest first). No principal while interest unpaid on same/older installment.
    - **Validates: Requirements 6.2, 6.3**
    - Use arbPaiseAmount, arbPaymentSequence arbitraries
    - 1000 iterations (finance-critical)

  - [x] 15.2 Implement schedule PBT (`apps/api/test/pbt/schedule.pbt.spec.ts`)
    - **Property 1: Schedule Reconciliation** — sum(installment.principal_paise) == principal_paise AND sum(installment.interest_paise) == total_interest_paise
    - **Property 2: Schedule Determinism** — Identical inputs produce byte-identical schedules
    - **Property 3: Due Date Holiday Avoidance** — No due date falls on a holiday; shifted dates >= original
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**
    - Use arbLoanParams arbitrary
    - 1000 iterations for reconciliation, 100 for determinism and holidays

  - [x] 15.3 Implement journal balance PBT (`apps/api/test/pbt/journal-balance.pbt.spec.ts`)
    - **Property 8: Journal Entry Balance** — For all journal entries, sum(debit_paise) == sum(credit_paise)
    - **Property 9: Trial Balance Identity** — sum(all_debit_balances) == sum(all_credit_balances)
    - **Validates: Requirements 12.1, 12.6**
    - 100 iterations

  - [x] 15.4 Implement outstanding PBT (`apps/api/test/pbt/outstanding.pbt.spec.ts`)
    - **Property 6: Outstanding Balance Invariant** — cached_outstanding_paise == total_payable_paise − sum_of_all_valid_allocated_payments. Never negative.
    - **Validates: Requirements 6.9, 6.10**
    - Use arbPaymentSequence arbitrary
    - 1000 iterations (finance-critical)

  - [x] 15.5 Implement reversal neutrality PBT (`apps/api/test/pbt/reversal-neutrality.pbt.spec.ts`)
    - **Property 7: Reversal Ledger Neutrality** — Net ledger effect of original + reversal == zero for each account
    - **Validates: Requirements 7.2, 12.4**
    - 1000 iterations (finance-critical)

  - [x] 15.6 Implement advance payment PBT (`apps/api/test/pbt/advance-payment.pbt.spec.ts`)
    - **Property 24: Advance Payment Allocation to Future Installments** — Excess allocated to future installments in chronological order; paid amounts don't exceed due amounts; total allocated == collection amount
    - **Validates: Requirements 6.6 (advance payments)**
    - Use arbPaiseAmount arbitrary
    - 100 iterations

  - [x] 15.7 Implement receipt sequentiality PBT (`apps/api/test/pbt/receipt-sequentiality.pbt.spec.ts`)
    - **Property 25: Receipt Number Sequentiality** — For R1 created before R2, receipt_number(R1) < receipt_number(R2). No gaps in sequence within test run.
    - **Validates: Requirements 6.6 (receipt sequencing)**
    - 100 iterations

  - [x] 15.8 Implement cashbook reconciliation PBT (`apps/api/test/pbt/cashbook-reconciliation.pbt.spec.ts`)
    - **Property 26: Cashbook Reconciliation** — closing_balance == opening_balance + sum(inflows) − sum(outflows). Never silently drifts.
    - **Validates: Requirements 13.1, 13.2**
    - 100 iterations

  - [x] 15.9 Implement RBAC matrix PBT (`apps/api/test/pbt/rbac-matrix.pbt.spec.ts`)
    - **Property 31: RBAC Matrix Exhaustive Coverage** — For all (role, permission_key) from PERMISSIONS constant, allowed roles get 2xx, denied roles get 403
    - **Validates: Requirements (RBAC from security-compliance steering)**
    - Use arbUserRole arbitrary
    - 100 iterations

- [x] 16. Implement cross-cutting test files (negative, concurrency, security)
  - [x] 16.1 Implement negative E2E tests (`apps/api/test/negative.spec.ts`)
    - Boundary value testing: principalPaise, tenureMonths, annualRateBps at min-1, max+1, min, max
    - Empty/null/undefined field testing: empty fullName, null mobile, undefined purpose, amountPaise=0, negative amountPaise
    - Invalid Aadhaar/PAN/mobile format rejection
    - Duplicate identity submission (Aadhaar, mobile)
    - Disbursement before approval
    - Invalid state transitions
    - Invalid file upload (wrong MIME, oversized)
    - Stale version optimistic locking conflict (409 CONFLICT_OPTIMISTIC_LOCK)
    - Duplicate receipt attempt
    - Over-collection edge cases
    - XSS payload sanitization in customer name and other text fields
    - Unicode/special character handling (Hindi characters, emoji, special chars in address)
    - Maximum pagination size enforcement (take=500 returns ≤100)
    - Missing dependent record handling
    - _Requirements: 1.2, 2.5, 3.5, 6.8, 6.10; Properties 12, 20; Design GAP 12_

  - [x] 16.2 Implement concurrency E2E tests (`apps/api/test/concurrency.spec.ts`)
    - Double-click payment submit: 5 concurrent collections with same idempotency key → exactly 1 created
    - Concurrent collection on same loan: 3 different collections simultaneously → verify outstanding correct
    - Concurrent loan approval: 2 managers approve same loan → exactly 1 succeeds
    - Concurrent disbursement attempts → exactly 1 succeeds
    - Receipt number collision under load: 10 concurrent collections on different loans → all unique sequential receipt numbers
    - Stale version optimistic locking: read v1, update to v2, attempt update with v1 → 409
    - Concurrent reversal attempts on same collection → exactly 1 succeeds
    - Database-level locking verification (SELECT FOR UPDATE for critical finance ops)
    - _Requirements: 3.7, 5.5, 6.5; Properties 10, 19, 25; Design GAP 10_

  - [x] 16.3 Implement security E2E tests (`apps/api/test/security.spec.ts`)
    - RBAC matrix exhaustive testing: all 7 roles × all permission-protected endpoints → 2xx for allowed, 403 for denied
    - IDOR testing: collection officer cannot access loans outside assigned area
    - JWT security: tampered JWT (role escalation) → 401, expired JWT → 401, missing JWT → 401, malformed JWT → 401, non-existent user JWT → 401
    - SQL injection resistance: test SQL payloads against search endpoints → no 500, no data leak
    - Rate limiting: auth endpoint 10/min, report generation 5/min
    - Error response sanitization: no stack traces, no internal paths, requestId always present
    - Upload misuse: script injection in files, oversized files
    - _Requirements: Properties 31, 35; Design GAP 11_

- [x] 17. Checkpoint — Verify all API-side tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 18. Set up Playwright test infrastructure and implement UI E2E tests
  - [x] 18.1 Create Playwright configuration (`apps/web/test/playwright.config.ts`)
    - Configure testDir `./e2e`, sequential execution (fullyParallel: false), workers: 1
    - Set retries: 2 in CI, 0 locally
    - Configure artifacts: screenshots on failure, video retained on failure, trace on first retry
    - Define projects: desktop-chrome (Desktop Chrome), mobile-android (Pixel 5)
    - Configure webServer to auto-start Next.js dev server
    - _Requirements: Design Section 8 (Playwright Configuration)_

  - [x] 18.2 Implement login Playwright tests (`apps/web/test/e2e/login.playwright.spec.ts`)
    - Test successful login redirects to dashboard
    - Test invalid credentials shows error message
    - Test account lockout shows lockout message after 5 failed attempts
    - Test login form validates required fields before submission
    - _Requirements: Design GAP 8 (Login Flow)_

  - [x] 18.3 Implement customer onboarding Playwright tests (`apps/web/test/e2e/customer-onboarding.playwright.spec.ts`)
    - Test fill customer form with valid data → submit → verify success toast
    - Test Aadhaar validation error shown inline for invalid format
    - Test PAN validation error shown inline for invalid format
    - Test KYC document upload with valid file → verify upload success
    - Test KYC upload with invalid MIME type → verify error message
    - Test duplicate Aadhaar detection → verify warning dialog
    - _Requirements: 1.1–1.4; Design GAP 8 (Customer Onboarding)_

  - [x] 18.4 Implement loan application Playwright tests (`apps/web/test/e2e/loan-application.playwright.spec.ts`)
    - Test create loan application → verify draft status badge
    - Test submit loan → verify status changes to submitted
    - Test approve loan as manager → verify maker-checker enforcement
    - _Requirements: 3.1–3.4; Design GAP 8 (Loan Application)_

  - [x] 18.5 Implement collection posting Playwright tests (`apps/web/test/e2e/collection-posting.playwright.spec.ts`)
    - Test post collection via form → verify success and receipt display
    - Test confirmation dialog appears before finance action submission
    - Test receipt print view renders correctly with all components
    - _Requirements: 6.1, 6.6; Design GAP 8 (Collection Posting)_

  - [x] 18.6 Implement dashboard Playwright tests (`apps/web/test/e2e/dashboard.playwright.spec.ts`)
    - Test dashboard loads with KPI cards (total outstanding, collections today, overdue count)
    - Test KPI values match expected data from seeded test state
    - Test overdue loans highlighted with correct status badges
    - _Requirements: Design GAP 8 (Dashboard)_

  - [x] 18.7 Implement receipt print view Playwright tests (`apps/web/test/e2e/receipt-print.playwright.spec.ts`)
    - Test receipt page renders with customer name, loan number, amount, date, components
    - Test print layout correct (no navigation elements, proper formatting)
    - _Requirements: Design GAP 8 (Receipt Print View)_

  - [x] 18.8 Implement mobile responsive Playwright tests (`apps/web/test/e2e/mobile-responsive.playwright.spec.ts`)
    - Test collection form usable on mobile viewport (Pixel 5)
    - Test touch targets sufficiently large (min 44x44px)
    - Test navigation menu collapses to hamburger on mobile
    - _Requirements: Design GAP 8 (Mobile Responsive)_

  - [x] 18.9 Implement confirmation dialogs Playwright tests (`apps/web/test/e2e/confirmation-dialogs.playwright.spec.ts`)
    - Test disbursement action shows confirmation dialog
    - Test collection posting shows confirmation dialog
    - Test reversal action shows confirmation dialog with reason field
    - Test cancel on confirmation dialog does not submit the action
    - _Requirements: Design GAP 8 (Confirmation Dialogs)_

- [x] 19. Final checkpoint — Verify all tests pass
  - Ensure all E2E API tests, PBT tests, negative/concurrency/security tests, and Playwright tests pass
  - Verify test isolation: no shared mutable state between test files
  - Verify cleanup: test data cleaned up after each suite
  - Ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements and design properties for traceability
- Checkpoints ensure incremental validation at key milestones
- Property tests validate universal correctness properties from the design document (Properties 1–35)
- E2E tests validate specific flows and edge cases against real infrastructure
- Infrastructure tasks (1.x) must be completed before any test tasks
- Test execution order follows the design's recommended sequence: infrastructure → health → auth → customer → loan → collection → reversal → overdue → foreclosure → closure → group → accounting → cashbook → notification → report → settings → audit → business flows → PBT → negative → concurrency → security → Playwright
