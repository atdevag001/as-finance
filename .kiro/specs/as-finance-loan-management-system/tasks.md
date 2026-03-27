# Implementation Plan: AS Finance Loan Management System

## Overview

This plan implements the AS Finance LMS as a pnpm monorepo with a NestJS backend, Next.js frontend, Prisma ORM, and PostgreSQL. Tasks are ordered by dependency: monorepo scaffolding → shared packages → database schema → core backend modules → finance engine → accounting → collection system → group lending → notifications → frontend → reports → testing → final integration. Each finance-critical module includes property-based test sub-tasks mapped to the 35 correctness properties from the design document.

## Tasks

- [ ] 1. Monorepo scaffolding, Docker, and shared configuration
  - [ ] 1.1 Initialize pnpm monorepo with workspace configuration
    - Create root `package.json`, `pnpm-workspace.yaml` defining `apps/*` and `packages/*`
    - Create `.env.example` with all required environment variables (DB, JWT, S3, SMS)
    - Create `docker-compose.yml` with PostgreSQL 15 and MinIO containers
    - Create root `tsconfig.json` with strict mode base configuration
    - _Requirements: 24.1, 24.2_

  - [ ] 1.2 Set up `packages/config` with shared ESLint, TypeScript, and Prettier configs
    - Create `packages/config/package.json`
    - Create shared ESLint config (`eslint-config`), TypeScript base config, Prettier config
    - Configure all workspace packages to extend these shared configs
    - _Requirements: 24.2_

  - [ ] 1.3 Set up `packages/shared` with enums, types, constants, and validation schemas
    - Create `packages/shared/package.json` and `tsconfig.json`
    - Implement all enums from design: `UserRole`, `LoanStatus`, `CustomerStatus`, `InterestType`, `Frequency`, `PaymentMode`, `CollectionStatus`, `ReceiptStatus`, `InstallmentStatus`, `OverdueBucket`, `GroupStatus`, `AccountCategory`, `JournalSourceType`, `OutboxStatus`, `AuditAction`
    - Implement shared Zod schemas: `aadhaarSchema`, `panSchema`, `mobileSchema`, `pincodeSchema`, `paiseSchema`, `createCustomerSchema`
    - Implement permission matrix constants (`PERMISSIONS` object)
    - Implement pure utility functions: `maskAadhaar`, `maskPan`, `maskMobile`, money formatting (Indian comma grouping), `paiseToDec`, `decToPaise` with Decimal.js
    - _Requirements: 1.2, 1.10, 1.11, 15.3, 21.1, 21.3, 21.4_

  - [ ]* 1.4 Write property tests for PII masking and input validation utilities
    - **Property 23: PII Masking** — For all Aadhaar numbers, masking produces `XXXX-XXXX-{last4}`; for all PAN numbers, masking produces `XXXXXX{last4}`
    - **Property 24: Input Format Validation** — Aadhaar validator accepts only 12-digit strings; PAN validator accepts only `[A-Z]{5}[0-9]{4}[A-Z]`; mobile validator accepts only 10-digit strings starting with 6-9
    - File: `packages/shared/src/utils/__tests__/masking.property.spec.ts`
    - **Validates: Requirements 1.2, 1.10, 1.11**

  - [ ]* 1.5 Write property test for password validation
    - **Property 35: Password Validation** — Validator accepts only passwords with min 8 chars, at least one uppercase, one lowercase, one digit; rejects all others
    - File: `packages/shared/src/validation/__tests__/password.property.spec.ts`
    - **Validates: Requirements 16.3**

  - [ ] 1.6 Set up `packages/testing` with test factory scaffolding
    - Create `packages/testing/package.json` and `tsconfig.json`
    - Create factory helper base in `packages/testing/src/factories/`
    - Create entity factories: `createCustomer`, `createLoanProduct`, `createLoan`, `createCollection`, `createInstallment`, `createUser`, `createGroup`, `createJournalEntry`
    - Create fixture data in `packages/testing/src/fixtures/`
    - _Requirements: 24.4_

- [ ] 2. NestJS backend scaffolding and database setup
  - [ ] 2.1 Initialize NestJS application in `apps/api`
    - Create `apps/api/package.json` with NestJS, Prisma, class-validator, class-transformer, Decimal.js, bcrypt, jsonwebtoken, pino dependencies
    - Create `apps/api/src/main.ts` with global pipes, filters, Swagger setup, and environment validation (fail-fast on missing config)
    - Create `apps/api/tsconfig.json` extending shared config
    - Create Vitest configuration for unit and integration tests
    - _Requirements: 24.2, 24.5, 24.6_

  - [ ] 2.2 Implement common infrastructure: guards, filters, interceptors, middleware
    - Create `apps/api/src/common/filters/global-exception.filter.ts` — maps `BusinessRuleError`, `ConflictError`, `ValidationError`, `NotFoundError`, `AuthorizationError` to HTTP responses with `requestId`; never exposes stack traces
    - Create `apps/api/src/common/middleware/request-id.middleware.ts` — generates/propagates `x-request-id` header via async local storage
    - Create `apps/api/src/common/guards/jwt-auth.guard.ts` — JWT verification
    - Create `apps/api/src/common/guards/rbac.guard.ts` — checks `@SetMetadata('permission', ...)` against user role using `PERMISSIONS` constant
    - Create `apps/api/src/common/interceptors/audit.interceptor.ts` — base audit logging interceptor
    - Create error classes: `AppError`, `BusinessRuleError`, `ConflictError`, `ValidationError`, `NotFoundError`, `AuthorizationError`
    - Create structured pino logger configuration with PII redaction paths
    - _Requirements: 15.2, 15.4, 15.5, 16.7, 22.6, 22.7, 24.6_

  - [ ] 2.3 Create Prisma schema with all entities, enums, indexes, and constraints
    - Create `apps/api/prisma/schema.prisma` with all 25+ entities from design: `users`, `refresh_tokens`, `user_area_assignments`, `customers`, `customer_documents`, `family_members`, `guarantors`, `loan_products`, `loan_product_versions`, `loans`, `loan_approvals`, `loan_status_history`, `loan_schedules`, `disbursements`, `collections`, `collection_allocations`, `receipts`, `penalties`, `foreclosures`, `overdue_entries`, `groups`, `group_members`, `group_collections`, `chart_of_accounts`, `journal_entries`, `journal_lines`, `cash_transactions`, `cash_handover_records`, `expenses`, `outbox_messages`, `sms_templates`, `audit_logs`, `settings`, `idempotency_keys`, `file_metadata`
    - Define all enums in Prisma: `UserRole`, `LoanStatus`, `CustomerStatus`, `InterestType`, `Frequency`, `PaymentMode`, `CollectionStatus`, `ReceiptStatus`, `InstallmentStatus`, `OverdueBucket`, `GroupStatus`, `AccountCategory`, `JournalSourceType`, `OutboxStatus`, `AuditAction`, `DayOfWeek`, `DocType`, `FeeType`, `PenaltyType`, `ForeclosureStatus`, `VerificationStatus`, `CashTxType`, `CashCategory`, `ApprovalAction`, `NotificationEvent`
    - Define all indexes from design document
    - Define unique constraints: `idempotency_keys.key`, `receipts.receipt_number`, `loans.loan_number`, `users.username`, `users.mobile`, `loan_product_versions(product_id, version_number)`, `loan_schedules(loan_id, installment_number)`, `penalties(loan_id, installment_id, penalty_period)`, `sms_templates(event_type, language)`, `settings.key`, `chart_of_accounts.code`
    - Use `BigInt` for all money fields, `Int` for version fields
    - _Requirements: 21.1, 20.4_

  - [ ] 2.4 Create Prisma database service and run initial migration
    - Create `apps/api/src/database/prisma.service.ts` wrapping `PrismaClient` with `onModuleInit`/`onModuleDestroy`
    - Generate initial migration via `prisma migrate dev`
    - Create receipt number database sequence: `CREATE SEQUENCE receipt_number_seq`
    - Create loan number database sequence: `CREATE SEQUENCE loan_number_seq` for generating `LN-{year}-{padded}` format
    - _Requirements: 24.3_

  - [ ] 2.5 Create seed script with chart of accounts and sample data
    - Create `apps/api/prisma/seed.ts`
    - Seed chart of accounts: Cash (1001), Bank (1002), Loans Receivable (1100), Interest Income (4001), Processing Fee Income (4002), Penalty Income (4003), Other Income (4004), Salary Expense (5001), Rent Expense (5002), Travel Expense (5003), Office Expense (5004), Other Expense (5099), Owner's Equity (3001)
    - Seed default system settings (holiday calendar, receipt scope, max interest rate bounds)
    - Seed sample users for each role, sample customers, sample loan products
    - _Requirements: 12.1, 24.4_

  - [ ] 2.6 Create health check module
    - Create `apps/api/src/modules/health/health.module.ts`, `health.controller.ts`
    - Implement `GET /health/ready` (checks DB connection) and `GET /health/live` (returns 200)
    - No authentication required for health endpoints
    - _Requirements: 24.7_

- [ ] 3. Checkpoint — Verify monorepo builds, Docker starts, migration runs, seed completes
  - Ensure `pnpm install` succeeds, `docker-compose up` starts PostgreSQL and MinIO, `prisma migrate dev` runs, `prisma db seed` completes, health endpoints respond, all property tests from task 1 pass. Ask the user if questions arise.


- [ ] 4. Authentication and user management modules
  - [ ] 4.1 Implement auth module (login, logout, JWT, refresh token, account lockout)
    - Create `apps/api/src/modules/auth/auth.module.ts`, `auth.service.ts`, `auth.controller.ts`
    - Implement `POST /auth/login` — validate credentials, bcrypt compare (cost 12+), issue JWT (15-min expiry) with `{ sub, role, iat, exp }`, set refresh token as httpOnly secure SameSite cookie (7-day expiry, rotated on use), store refresh token hash in `refresh_tokens` table
    - Implement `POST /auth/refresh` — verify refresh token hash in `refresh_tokens` table, issue new access token, rotate refresh token (revoke old, create new)
    - Implement `POST /auth/logout` — revoke refresh token in `refresh_tokens` table
    - Implement `POST /auth/change-password` — validate password requirements, hash with bcrypt, revoke all refresh tokens for user in `refresh_tokens` table
    - Implement account lockout: after 5 failed attempts, lock for 15 minutes; log lockout event to audit
    - Create DTOs: `LoginDto`, `ChangePasswordDto` with class-validator decorators
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6_

  - [ ] 4.2 Implement user module (CRUD, role assignment)
    - Create `apps/api/src/modules/user/user.module.ts`, `user.service.ts`, `user.controller.ts`, `user.repository.ts`
    - Implement `POST /users` — create user with role (requires super_admin or manager)
    - Implement `GET /users`, `GET /users/:id`, `PATCH /users/:id`
    - Implement role change with guard: prevent self-escalation, prevent granting beyond own level
    - Implement `POST /users/:id/area-assignments` and `DELETE /users/:id/area-assignments/:areaId` — manage area/route assignments for field officers and collection officers (requires manager/super_admin)
    - Create DTOs: `CreateUserDto`, `UpdateUserDto`
    - _Requirements: 15.1, 15.7, 15.8_

  - [ ]* 4.3 Write property test for RBAC permission enforcement
    - **Property 29: RBAC Permission Enforcement** — For all API actions and user roles, access is granted iff the role is in the allowed roles list for that action; unauthorized → 403, unauthenticated → 401
    - File: `apps/api/src/common/guards/__tests__/rbac.property.spec.ts`
    - **Validates: Requirements 15.2, 15.3, 15.4**

- [ ] 5. Customer module
  - [ ] 5.1 Implement customer module (CRUD, KYC, family, guarantors, duplicate detection, blacklisting)
    - Create `apps/api/src/modules/customer/customer.module.ts`, `customer.service.ts`, `customer.controller.ts`, `customer.repository.ts`
    - Implement `POST /customers` — create with mandatory fields (full name, father/husband name, mobile, Aadhaar, gender, address, photo), optional fields (alternate mobile, PAN, DOB/age, occupation, monthly income, work details, notes), validate Aadhaar/PAN format, check duplicates (Aadhaar/mobile), default risk level to medium
    - Implement `GET /customers`, `GET /customers/:id`, `PATCH /customers/:id` with scope enforcement (field officers see only assigned)
    - Implement `POST /customers/:id/blacklist` — requires Manager+, records reason and timestamp in audit log, prevents new loan applications
    - Implement `POST /customers/:id/reinstate` — requires Manager+, changes status back to active, records reinstatement reason in audit log
    - Implement `POST /customers/:id/family-members` and `POST /customers/:id/guarantors`
    - Implement duplicate detection: flag matching Aadhaar or mobile, require Manager review
    - Record before/after state in audit log on updates
    - Create DTOs: `CreateCustomerDto`, `UpdateCustomerDto`, `BlacklistDto`, `CreateFamilyMemberDto`, `CreateGuarantorDto`, `CustomerQueryDto`
    - _Requirements: 1.1, 1.2, 1.3, 1.6, 1.7, 1.8, 1.9, 1.12_

  - [ ]* 5.2 Write unit tests for customer validation and duplicate detection
    - Test Aadhaar format validation (12 digits only), PAN format validation, mobile format validation
    - Test duplicate detection logic (matching Aadhaar, matching mobile)
    - Test blacklisting prevents new loan applications
    - _Requirements: 1.2, 1.3, 1.9_

- [ ] 6. Document storage module
  - [ ] 6.1 Implement document module (S3 abstraction, upload validation, signed URLs)
    - Create `apps/api/src/modules/document/document.module.ts`, `document.service.ts`, `document.controller.ts`
    - Implement `StorageService` interface with S3 client (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`)
    - Implement `POST /documents/upload` — validate MIME type server-side (magic bytes: image/jpeg, image/png, application/pdf), validate file size ≤ 5MB, generate randomized UUID filename, upload to S3 with prefix (`kyc/`, `loan-docs/`, `receipts/`, `expenses/`), create `file_metadata` record
    - Implement `GET /documents/:id/url` — RBAC check, generate signed URL with 15-minute expiry
    - Implement soft delete (set `is_active=false`, retain in S3)
    - _Requirements: 1.4, 1.5, 22.4_

- [ ] 7. Loan product module
  - [ ] 7.1 Implement loan product module (CRUD, versioning, validation)
    - Create `apps/api/src/modules/loan-product/loan-product.module.ts`, `loan-product.service.ts`, `loan-product.controller.ts`, `loan-product.repository.ts`
    - Implement `POST /loan-products` — create with required fields (name, interest type, annual rate bps, principal range, tenure range, frequency, processing fee config, penalty config, allocation order)
    - Implement `PATCH /loan-products/:id` — create new version, preserve previous versions, update `current_version_id`
    - Implement `POST /loan-products/:id/deactivate` — prevent deactivation if active loans exist, prevent new applications
    - Validate rate/principal/tenure within system-configured bounds
    - Prevent deletion of products with active loans
    - Create DTOs: `CreateLoanProductDto`, `UpdateLoanProductDto`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

- [ ] 8. Schedule generation module (pure finance calculations)
  - [ ] 8.1 Implement schedule generation service (pure functions, no side effects)
    - Create `apps/api/src/modules/schedule/schedule.module.ts`, `schedule.service.ts`
    - Implement `calculateFlatEMI` — total interest = `P × R/10000 × T/12` using Decimal.js, derive N from frequency (monthly: N=T, weekly: N=T×4, daily: N=T×30), EMI = `(P + total_interest) / N`, fixed principal/interest per installment, rounding difference absorbed by last installment
    - Implement `calculateReducingBalanceEMI` — derive periodic rate from frequency (monthly: R/10000/12, weekly: R/10000/52, daily: R/10000/365), EMI = `P × r × (1+r)^n / ((1+r)^n - 1)` using Decimal.js, each installment: interest = `outstanding × periodic_rate`, principal = `EMI - interest`, rounding difference absorbed by last installment
    - Implement `generateSchedule(params: ScheduleParams): Installment[]` — dispatches to flat or reducing balance, generates due dates
    - Implement `adjustForHolidays(dueDates, holidays)` — shift due dates falling on holidays to next business day
    - All intermediate arithmetic via Decimal.js with `ROUND_HALF_UP`, round to integer paise at each installment boundary
    - Document rounding points in code comments
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 21.2, 21.3, 21.5_

  - [ ]* 8.2 Write property test for flat interest schedule reconciliation
    - **Property 1: Schedule Reconciliation (Flat Interest)** — For all valid flat-interest params, `sum(principal_paise) == principal` AND `sum(interest_paise) == total_interest`, rounding difference in last installment only
    - File: `apps/api/src/modules/schedule/__tests__/schedule.property.spec.ts`
    - Use 1000 iterations (critical finance property)
    - **Validates: Requirements 4.2, 4.6, 25.1**

  - [ ]* 8.3 Write property test for reducing balance schedule reconciliation
    - **Property 2: Schedule Reconciliation (Reducing Balance)** — For all valid reducing-balance params, `sum(principal_paise) == principal`, rounding difference in last installment only
    - File: `apps/api/src/modules/schedule/__tests__/schedule.property.spec.ts`
    - Use 1000 iterations (critical finance property)
    - **Validates: Requirements 4.3, 4.6, 25.1**

  - [ ]* 8.4 Write property test for schedule determinism
    - **Property 3: Schedule Determinism** — For all valid inputs, generating schedule twice produces byte-identical output
    - File: `apps/api/src/modules/schedule/__tests__/schedule.property.spec.ts`
    - **Validates: Requirements 4.5, 21.6, 25.10**

  - [ ]* 8.5 Write property test for schedule round-trip
    - **Property 4: Schedule Round-Trip** — For all valid schedules, serialize → parse → serialize produces equivalent object
    - File: `apps/api/src/modules/schedule/__tests__/schedule.property.spec.ts`
    - **Validates: Requirements 4.10**

  - [ ]* 8.6 Write property test for due date generation with holiday adjustment
    - **Property 5: Due Date Generation with Holiday Adjustment** — For all valid start dates, frequencies, and holiday calendars, due dates are correctly spaced and no due date falls on a holiday
    - File: `apps/api/src/modules/schedule/__tests__/schedule.property.spec.ts`
    - **Validates: Requirements 4.7, 4.8**

  - [ ]* 8.7 Write property test for model conformance
    - **Property 28: Model Conformance** — For all loans with a linked product version, the schedule conforms to the product's interest type, rate, and tenure/principal ranges
    - File: `apps/api/src/modules/schedule/__tests__/conformance.property.spec.ts`
    - **Validates: Requirements 2.8, 3.3, 25.12**

  - [ ]* 8.8 Write unit tests for schedule generation edge cases
    - Test specific known inputs/outputs: 12% flat on ₹100,000 for 12 months, verify exact installment values
    - Test zero-interest edge case, single installment, maximum tenure
    - Test reducing balance with known amortization table
    - _Requirements: 4.2, 4.3_

- [ ] 9. Checkpoint — Verify auth, customer, document, loan product, and schedule modules
  - Ensure all modules compile, unit tests pass, property tests pass, JWT auth flow works, RBAC guards enforce permissions, schedule generation produces correct results. Ask the user if questions arise.


- [ ] 10. Loan application lifecycle module
  - [ ] 10.1 Implement loan module (CRUD, state machine, maker-checker)
    - Create `apps/api/src/modules/loan/loan.module.ts`, `loan.service.ts`, `loan.controller.ts`, `loan.repository.ts`
    - Implement loan state machine with allowed transitions matrix from design: draft→submitted→under_review→approved→disbursed→active→closed, plus under_review→rejected, active→overdue/defaulted/foreclosed, overdue→active/foreclosed/defaulted/closed
    - Record every status transition in `loan_status_history` table with from_status, to_status, changed_by, reason, and metadata (e.g., DPD value for defaulting)
    - Implement `POST /loans` — create draft with customer ref, product version ref, principal, tenure, purpose; validate principal/tenure within product ranges; verify customer not blacklisted and no defaulted loans
    - Implement `POST /loans/:id/submit`, `POST /loans/:id/review`, `POST /loans/:id/approve` (maker-checker: approver ≠ creator), `POST /loans/:id/reject` (requires reason)
    - Implement immutability: prevent modification of principal/tenure/product after approved status
    - Implement concurrent loan limit check per product
    - Record all status transitions in `loan_approvals` table and audit log
    - Create DTOs: `CreateLoanDto`, `ApproveLoanDto`, `RejectLoanDto`, `LoanQueryDto`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10_

  - [ ]* 10.2 Write property test for loan state machine validity
    - **Property 21: Loan State Machine Validity** — Only transitions in the allowed matrix succeed; invalid transitions rejected with typed error; terminal states have no outgoing transitions
    - File: `apps/api/src/modules/loan/__tests__/loan-state.property.spec.ts`
    - **Validates: Requirements 3.1, 3.9**

  - [ ]* 10.3 Write property test for maker-checker enforcement
    - **Property 22: Maker-Checker Enforcement** — For all loan approvals, approver ≠ creator; for all foreclosure approvals, approver ≠ requester; maker == checker is always rejected
    - File: `apps/api/src/modules/loan/__tests__/loan-state.property.spec.ts`
    - **Validates: Requirements 3.7, 9.6**

- [ ] 11. Audit logging module
  - [ ] 11.1 Implement audit module (append-only audit log service)
    - Create `apps/api/src/modules/audit/audit.module.ts`, `audit.service.ts`, `audit.controller.ts`, `audit.repository.ts`
    - Implement `createAuditLog(dto, tx?)` — accepts optional Prisma transaction client for transactional audit logging; records action_type, actor_id, actor_role, target_entity, target_id, timestamp (UTC), ip_address, request_id, before_state, after_state, remarks
    - Implement `GET /audit-logs` — query by entity type, entity ID, actor, action type, date range with pagination; restricted to manager, super_admin, viewer_auditor
    - Enforce append-only: no UPDATE or DELETE operations on audit_logs table
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_

  - [ ]* 11.2 Write property test for audit completeness
    - **Property 16: Audit Completeness** — For all finance-affecting actions, a corresponding audit log entry exists with matching target_id, action_type, actor_id, and timestamp
    - File: `apps/api/src/modules/audit/__tests__/audit.property.spec.ts`
    - **Validates: Requirements 17.1, 17.6, 25.6**

  - [ ]* 11.3 Write property test for audit log append-only
    - **Property 17: Audit Log Append-Only** — No audit log entry is modifiable or deletable after creation; UPDATE/DELETE attempts are rejected
    - File: `apps/api/src/modules/audit/__tests__/audit.property.spec.ts`
    - **Validates: Requirements 17.4**

- [ ] 12. Accounting module (chart of accounts, journal entries, ledger)
  - [ ] 12.1 Implement accounting module (journal entries, trial balance, P&L, balance sheet)
    - Create `apps/api/src/modules/accounting/accounting.module.ts`, `accounting.service.ts`, `accounting.controller.ts`, `accounting.repository.ts`
    - Implement `createJournalEntry(dto, tx?)` — validate total debits == total credits before persistence, reject unbalanced entries; accepts Prisma transaction client
    - Implement source-to-journal mapping: disbursement (DR Loans Receivable, CR Cash/Bank), collection (DR Cash/Bank, CR Loans Receivable/Interest Income/Penalty Income per component), reversal (mirror entries), penalty (DR Loans Receivable, CR Penalty Income), expense (DR Expense, CR Cash/Bank), processing fee (DR Cash/Bank, CR Processing Fee Income)
    - Implement `GET /accounting/daybook` — journal entries for date range, chronological
    - Implement `GET /accounting/trial-balance` — sum of all debit balances == sum of all credit balances
    - Implement `GET /accounting/profit-loss` — income minus expenses for date range
    - Implement `GET /accounting/balance-sheet` — assets = liabilities + equity at point in time
    - Implement `GET /accounting/chart-of-accounts` and `GET /accounting/journal-entries`
    - Enforce immutability: no modification or deletion of posted journal entries
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 12.9, 12.10, 12.11, 12.12, 12.13_

  - [ ]* 12.2 Write property test for journal entry balance
    - **Property 12: Journal Entry Balance** — For all journal entries, `sum(debit_paise) == sum(credit_paise)`; unbalanced entries rejected before persistence
    - File: `apps/api/src/modules/accounting/__tests__/journal.property.spec.ts`
    - **Validates: Requirements 12.7, 25.5**

  - [ ]* 12.3 Write property test for journal entry immutability
    - **Property 13: Journal Entry Immutability** — No posted journal entry can be modified or deleted; corrections only via new compensating entries
    - File: `apps/api/src/modules/accounting/__tests__/journal.property.spec.ts`
    - **Validates: Requirements 12.8**

  - [ ]* 12.4 Write property test for trial balance identity
    - **Property 14: Trial Balance Identity** — For all posted journal entries, sum of all debit balances == sum of all credit balances across all accounts
    - File: `apps/api/src/modules/accounting/__tests__/journal.property.spec.ts`
    - **Validates: Requirements 12.11**

  - [ ]* 12.5 Write property test for balance sheet equation
    - **Property 15: Balance Sheet Equation** — For all points in time, `total_assets == total_liabilities + total_equity`
    - File: `apps/api/src/modules/accounting/__tests__/journal.property.spec.ts`
    - **Validates: Requirements 12.13**

- [ ] 13. Idempotency service
  - [ ] 13.1 Implement idempotency key service
    - Create `apps/api/src/modules/idempotency/idempotency.module.ts`, `idempotency.service.ts`
    - Implement `find(key)` — check if key exists and return cached result
    - Implement `store(key, operationType, resultStatus, resultBody, tx?)` — store within transaction
    - Implement concurrent duplicate handling: catch unique constraint violation, wait 100ms, retry SELECT
    - Implement key expiry cleanup (24-hour TTL, background job)
    - _Requirements: 20.1, 5.5, 6.4_

  - [ ]* 13.2 Write property test for idempotency
    - **Property 20: Idempotency** — For all finance operations with an idempotency key, processing the same key twice returns the same result with no duplicate records; `f(key) == f(f(key))`
    - File: `apps/api/src/modules/idempotency/__tests__/idempotency.property.spec.ts`
    - **Validates: Requirements 5.5, 6.4, 20.1, 25.9**

- [ ] 14. Receipt module
  - [ ] 14.1 Implement receipt module (generation, sequencing, immutability)
    - Create `apps/api/src/modules/receipt/receipt.module.ts`, `receipt.service.ts`, `receipt.controller.ts`, `receipt.repository.ts`
    - Implement `generateReceipt(data, tx)` — use database sequence (`receipt_number_seq`) for unique sequential receipt numbers (format: `RCP-{year}-{padded_number}`), create receipt with snapshot data (customer name, loan number, officer name, amount, components, outstanding after)
    - Implement `GET /receipts/:id` and `GET /receipts/:id/print` — printable format for thermal/A4
    - Implement `markAsReversed(receiptId, compensatingReceiptId, tx)` — mark original as reversed, link to compensating receipt
    - Enforce immutability: receipt content fields never updated after creation
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.6_

  - [ ]* 14.2 Write property test for receipt immutability
    - **Property 18: Receipt Immutability** — Reading a receipt at any time after creation returns identical content (amount, components, names, numbers)
    - File: `apps/api/src/modules/receipt/__tests__/receipt.property.spec.ts`
    - **Validates: Requirements 19.3, 25.7**

  - [ ]* 14.3 Write property test for receipt uniqueness and sequentiality
    - **Property 19: Receipt Uniqueness and Sequentiality** — All receipt numbers are unique; for R1 created before R2, R1's numeric portion < R2's
    - File: `apps/api/src/modules/receipt/__tests__/receipt.property.spec.ts`
    - **Validates: Requirements 19.2**

- [ ] 15. Checkpoint — Verify loan lifecycle, audit, accounting, idempotency, and receipt modules
  - Ensure loan state machine transitions work correctly, maker-checker enforced, audit logs created for all finance actions, journal entries balance, idempotency keys prevent duplicates, receipts generate with sequential numbers. All property tests pass. Ask the user if questions arise.


- [ ] 16. Disbursement module
  - [ ] 16.1 Implement disbursement module (prerequisite verification, atomic execution, idempotency)
    - Create `apps/api/src/modules/disbursement/disbursement.module.ts`, `disbursement.service.ts`, `disbursement.controller.ts`, `disbursement.repository.ts`
    - Implement `POST /disbursements` — verify prerequisites (loan status approved, schedule generated, KYC docs uploaded, not already disbursed), then execute atomically within `prisma.$transaction()`:
      1. Update loan status to disbursed then active
      2. Create disbursement record (amount, mode, reference number)
      3. Create journal entry (DR Loans Receivable, CR Cash/Bank)
      4. If Loan_Product has processing fee configured, calculate fee and create separate journal entry (DR Cash/Bank, CR Processing_Fee_Income)
      5. Activate/freeze schedule
      6. Set loan disbursement_date, first_due_date, last_due_date, cached_outstanding_paise
      7. Create audit log entry
      8. Enqueue SMS notification to outbox
      9. Store idempotency result
    - If any step fails, entire transaction rolls back — no partial state
    - Idempotency: return original result for duplicate idempotency key
    - Create DTOs: `DisburseDto`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 3.5a, 12.4_

- [ ] 17. Collection and allocation engine
  - [ ] 17.1 Implement allocation engine (pure function)
    - Create `apps/api/src/modules/collection/allocation-engine.ts`
    - Implement `allocate(params: AllocationParams): AllocationResult` — pure function that takes payment amount, installment states (ordered by due date), pending penalties (ordered by date), and allocation order
    - Allocation order: penalty (oldest first) → interest (current due, then oldest overdue) → principal (current due, then oldest overdue)
    - Handle partial payments: allocate available amount following order, leave remaining components unpaid
    - Handle advance payments: after clearing all current and overdue dues, allocate excess to future installments chronologically
    - Ensure `sum(penalty + interest + principal) == collection amount` exactly — no money created or lost
    - All arithmetic via Decimal.js with ROUND_HALF_UP
    - _Requirements: 6.5, 6.6, 6.7_

  - [ ]* 17.2 Write property test for allocation preservation
    - **Property 6: Allocation Preservation** — For all valid collections, `sum(penalty) + sum(interest) + sum(principal) == collection amount` exactly
    - File: `apps/api/src/modules/collection/__tests__/allocation.property.spec.ts`
    - Use 1000 iterations (critical finance property)
    - **Validates: Requirements 6.7, 25.4**

  - [ ]* 17.3 Write property test for allocation order correctness
    - **Property 7: Allocation Order Correctness** — For all partial/advance payments, allocation follows penalty→interest→principal order; no principal allocated while interest remains unpaid on same/older installment
    - File: `apps/api/src/modules/collection/__tests__/allocation.property.spec.ts`
    - Use 1000 iterations (critical finance property)
    - **Validates: Requirements 6.5, 6.6**

  - [ ] 17.4 Implement collection service (posting, transaction orchestration)
    - Create `apps/api/src/modules/collection/collection.module.ts`, `collection.service.ts`, `collection.controller.ts`, `collection.repository.ts`
    - Implement `POST /collections` — require loan ref, amount (paise), payment date, payment mode, idempotency key; execute atomically within `prisma.$transaction()` with `SELECT ... FOR UPDATE` on loan row:
      1. Verify loan status (active/overdue), compute outstanding, verify amount ≤ outstanding
      2. Run allocation engine
      3. Create collection record
      4. Create allocation records
      5. Update installment paid amounts and statuses
      6. Create journal entry (DR Cash/Bank, CR Loans Receivable/Interest Income/Penalty Income per component)
      7. Generate receipt via receipt service
      8. Update loan cached_outstanding, DPD, overdue_bucket
      9. Create audit log entry
      10. Enqueue SMS receipt notification to outbox
      11. Store idempotency result
    - Reject collections against closed/defaulted/rejected loans with typed error
    - Reject collections that would cause negative outstanding
    - Return original result for duplicate idempotency key
    - Create DTOs: `PostCollectionDto`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.8, 6.9, 6.10, 6.11, 6.12_

  - [ ]* 17.5 Write property test for outstanding balance accuracy
    - **Property 8: Outstanding Balance Accuracy** — For all valid sequences of collections/reversals, `outstanding == total_payable - sum(valid_allocated_payments)` at every point
    - File: `apps/api/src/modules/collection/__tests__/outstanding.property.spec.ts`
    - Use 1000 iterations (critical finance property)
    - **Validates: Requirements 6.11, 25.2**

  - [ ]* 17.6 Write property test for non-negative outstanding
    - **Property 9: Non-Negative Outstanding** — For all loan states after any valid operation sequence, outstanding ≥ 0; collections causing negative outstanding are rejected
    - File: `apps/api/src/modules/collection/__tests__/outstanding.property.spec.ts`
    - Use 1000 iterations (critical finance property)
    - **Validates: Requirements 6.12, 25.8**

- [ ] 18. Collection reversal module
  - [ ] 18.1 Implement reversal module (compensating entries, schedule rollback, ledger mirror)
    - Create `apps/api/src/modules/reversal/reversal.module.ts`, `reversal.service.ts`, `reversal.controller.ts`
    - Implement `POST /reversals` — require original collection ref, mandatory reason, Manager/Super_Admin role; execute atomically within `prisma.$transaction()`:
      1. Verify collection not already reversed, not a reversal itself
      2. Create compensating collection record (negative amount, is_reversal=true)
      3. Create reverse allocation records (negate originals)
      4. Restore installment paid amounts and statuses to pre-collection state
      5. Create mirror journal entry (original debits→credits, credits→debits)
      6. Mark original receipt as reversed, generate compensating receipt
      7. Update loan cached_outstanding, DPD, overdue_bucket
      8. Create audit log with reversal reason
      9. Store idempotency result
    - Prevent double reversal (collection already reversed → typed error)
    - Prevent reversal of reversal (no chained reversals → typed error)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_

  - [ ]* 18.2 Write property test for reversal neutrality
    - **Property 10: Reversal Neutrality** — For all valid reversals, net ledger effect of original + reversal == 0 for every account touched
    - File: `apps/api/src/modules/reversal/__tests__/reversal.property.spec.ts`
    - Use 1000 iterations (critical finance property)
    - **Validates: Requirements 7.4, 25.3**

  - [ ]* 18.3 Write property test for reversal constraints
    - **Property 11: Reversal Constraints** — Already-reversed collections cannot be reversed again; reversals cannot be reversed (no chained reversals)
    - File: `apps/api/src/modules/reversal/__tests__/reversal.property.spec.ts`
    - **Validates: Requirements 7.5, 7.6**

- [ ] 19. Overdue tracking and penalty module
  - [ ] 19.1 Implement penalty module (overdue tracking, DPD calculation, penalty posting)
    - Create `apps/api/src/modules/penalty/penalty.module.ts`, `penalty.service.ts`, `penalty.controller.ts`, `penalty.repository.ts`
    - Implement DPD calculation: calendar days since earliest unpaid installment due date
    - Implement overdue bucket classification: 0, 1-30, 31-60, 61-90, 90+
    - Implement penalty calculation: flat amount per period or percentage of overdue amount, per product configuration
    - Implement `POST /penalties/calculate` — calculate and post penalty atomically: create penalty record, create journal entry (DR Loans Receivable, CR Penalty Income), update outstanding, create audit log
    - Prevent duplicate penalty for same (loan_id, installment_id, penalty_period)
    - Implement `POST /penalties/:id/waive` — require mandatory reason, maker-checker (waiver requester ≠ approver), mark penalty as waived (not deleted), update outstanding balance, create audit log with waiver details
    - Implement loan status transitions: active→overdue when installment past due, overdue→active when DPD returns to 0
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.9_

  - [ ]* 19.2 Write property test for overdue bucket classification
    - **Property 25: Overdue Bucket Classification** — DPD 0→bucket_0, 1-30→bucket_1_30, 31-60→bucket_31_60, 61-90→bucket_61_90, >90→bucket_90_plus; function is total and deterministic
    - File: `apps/api/src/modules/penalty/__tests__/overdue.property.spec.ts`
    - **Validates: Requirements 8.2**

  - [ ]* 19.3 Write property test for penalty uniqueness
    - **Property 26: Penalty Uniqueness** — No two penalties exist for the same (loan_id, installment_id, penalty_period); duplicate attempts rejected
    - File: `apps/api/src/modules/penalty/__tests__/overdue.property.spec.ts`
    - **Validates: Requirements 8.5**

- [ ] 20. Foreclosure module
  - [ ] 20.1 Implement foreclosure module (quote, approval, settlement)
    - Create `apps/api/src/modules/foreclosure/foreclosure.module.ts`, `foreclosure.service.ts`, `foreclosure.controller.ts`
    - Implement `POST /foreclosures/quote` — calculate settlement: outstanding principal + accrued interest (pro-rata for flat, daily accrual for reducing balance) + pending penalties − rebate; itemize each component; create foreclosure record (status=quote, quote_expires_at=now+24h)
    - Implement `POST /foreclosures` — maker-checker (approver ≠ requester); verify quote not expired (reject with typed error if expired, require new quote); execute atomically:
      1. Post settlement collection with full allocation
      2. Close all remaining schedule installments (status=closed)
      3. Create journal entries for all settlement components
      4. Update loan status to foreclosed
      5. Update foreclosure status to settled
      6. Record rebate/waiver with reason and authorizing user in audit log
      7. Create audit log entry
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

  - [ ]* 20.2 Write property test for foreclosure settlement calculation
    - **Property 32: Foreclosure Settlement Calculation** — For all active/overdue loans, settlement == `outstanding_principal + accrued_interest + pending_penalties - rebate`, each component non-negative (except rebate reduces total)
    - File: `apps/api/src/modules/foreclosure/__tests__/foreclosure.property.spec.ts`
    - **Validates: Requirements 9.1, 9.2**

- [ ] 21. Loan closure module
  - [ ] 21.1 Implement loan closure logic within loan service
    - Implement `POST /loans/:id/close` — verify prerequisites: all installments fully paid, all penalties settled or waived, no pending reversals, outstanding balance == 0 (or within 1 paisa tolerance)
    - Reject closure with typed error listing unmet prerequisites
    - Update loan status to closed, create audit log
    - Prevent reopening closed loans; post-closure corrections via new compensating transactions with Manager authorization
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [ ] 22. Checkpoint — Verify complete finance engine
  - Ensure disbursement, collection, allocation, reversal, penalty, foreclosure, and closure flows work end-to-end. Verify atomic transactions (no partial state on failure), idempotency, ledger balance, outstanding accuracy. All property tests pass. Ask the user if questions arise.


- [ ] 23. Group loan management module
  - [ ] 23.1 Implement group module (CRUD, member management, group collections)
    - Create `apps/api/src/modules/group/group.module.ts`, `group.service.ts`, `group.controller.ts`, `group.repository.ts`
    - Implement `POST /groups` — require group name, meeting day, branch/area, group leader (must be a customer); enforce group size 5-15 members
    - Implement `POST /groups/:id/members` and `DELETE /groups/:id/members/:memberId` — enforce size constraints, verify no active loans before removal
    - Implement `POST /groups/:id/collections` — accept total amount and member-wise breakdown, validate `sum(member amounts) == total`, then for each member post individual collection via collection service within a single transaction, generate individual receipts per member
    - Implement `GET /groups/:id/summary` — total outstanding, total collected, member-wise payment status, group delinquency status
    - Track delinquency at individual and group level (group delinquent when any member has overdue installments)
    - Create DTOs: `CreateGroupDto`, `AddGroupMemberDto`, `PostGroupCollectionDto`
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9_

  - [ ]* 23.2 Write property test for group size constraint
    - **Property 30: Group Size Constraint** — For all group member operations, active member count stays between 5 and 15 inclusive; violations rejected
    - File: `apps/api/src/modules/group/__tests__/group.property.spec.ts`
    - **Validates: Requirements 11.2**

  - [ ]* 23.3 Write property test for group collection sum integrity
    - **Property 31: Group Collection Sum Integrity** — For all group collections, `sum(member_breakdown amounts) == total_amount`; discrepancy causes rejection
    - File: `apps/api/src/modules/group/__tests__/group.property.spec.ts`
    - **Validates: Requirements 11.5**

- [ ] 24. Cashbook and expense management module
  - [ ] 24.1 Implement cashbook module (expenses, handovers, daily reconciliation)
    - Create `apps/api/src/modules/cashbook/cashbook.module.ts`, `cashbook.service.ts`, `cashbook.controller.ts`, `cashbook.repository.ts`
    - Implement `POST /cashbook/expenses` — require category, amount (paise), date, description, optional document ref; create expense record and corresponding journal entry (DR Expense, CR Cash/Bank) atomically; create audit log
    - Implement `POST /cashbook/handovers` — record cash handover: total cash, receiving officer, date, verification status
    - Implement `PATCH /cashbook/handovers/:id/verify` — verify handover, flag discrepancies
    - Implement `GET /cashbook/daily-summary` — opening balance + cash inflows − cash outflows = closing balance; flag discrepancies
    - Implement `GET /cashbook/expenses` and `GET /cashbook/handovers` with filters
    - Classify income by source: interest, processing fee, penalty, other
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6_

  - [ ]* 24.2 Write property test for cash reconciliation
    - **Property 27: Cash Reconciliation** — For all business days, `opening_balance + cash_inflows - cash_outflows == closing_balance`; discrepancies flagged
    - File: `apps/api/src/modules/cashbook/__tests__/cashbook.property.spec.ts`
    - **Validates: Requirements 13.5, 25.11**

- [ ] 25. Notification module (SMS outbox)
  - [ ] 25.1 Implement notification module (outbox pattern, SMS dispatch, retry)
    - Create `apps/api/src/modules/notification/notification.module.ts`, `notification.service.ts`, `notification.controller.ts`
    - Implement `enqueue(dto, tx?)` — create outbox message within the same database transaction as the finance operation; message includes event_type, recipient_mobile, rendered message body, template variables snapshot
    - Implement `SmsProvider` interface with `send(to, message)` and `MockProvider` for testing
    - Implement `OutboxProcessor` — background polling (every 10s), `SELECT ... FOR UPDATE SKIP LOCKED`, render template, dispatch via provider
    - Implement retry with exponential backoff: 30s, 2min, 8min; after 3 retries move to dead_letter
    - Implement `GET /notifications` and `POST /notifications/:id/retry`
    - SMS failure never rolls back valid finance transaction
    - Seed SMS templates for all events: loan_approved, loan_rejected, disbursed, collection_receipt, emi_reminder, overdue_reminder, penalty_notice, daily_collection_summary
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7_

  - [ ]* 25.2 Write property test for notification outbox transactional consistency
    - **Property 33: Notification Outbox Transactional Consistency** — For all finance transactions that trigger notifications, outbox message created within same transaction; if finance tx rolls back, outbox message also rolls back
    - File: `apps/api/src/modules/notification/__tests__/notification.property.spec.ts`
    - **Validates: Requirements 18.2**

  - [ ]* 25.3 Write property test for SMS template rendering
    - **Property 34: SMS Template Rendering** — For all templates and valid variable maps, rendering substitutes all `{{variable}}` placeholders; no unsubstituted placeholders remain
    - File: `apps/api/src/modules/notification/__tests__/notification.property.spec.ts`
    - **Validates: Requirements 18.5**

- [ ] 26. Settings module (system settings, holiday calendar)
  - [ ] 26.1 Implement settings module
    - Create `apps/api/src/modules/settings/settings.module.ts`, `settings.service.ts`, `settings.controller.ts`
    - Implement `GET /settings`, `PATCH /settings/:key` (super_admin only)
    - Implement `GET /settings/holidays` and `PUT /settings/holidays` — manage holiday calendar as JSON array of ISO date strings
    - _Requirements: 4.8_

- [ ] 27. Report module
  - [ ] 27.1 Implement report module (20+ report types, RBAC-scoped, export)
    - Create `apps/api/src/modules/report/report.module.ts`, `report.service.ts`, `report.controller.ts`, `report.repository.ts`
    - Implement `GET /reports/:reportType` — support all 20 report types from design: Daily Collection, Overdue, Disbursement, Loan Portfolio, Customer, Repayment Schedule, Receipt Register, Cash Handover, Expense, Income, Trial Balance, P&L, Balance Sheet, Group Summary, Group Collection, Penalty, Foreclosure, Audit Trail, DPD Aging, Officer Performance
    - Apply RBAC scope filters: field officers see own data, collection officers see assigned routes, managers/super_admin/accountant/viewer_auditor see full data
    - All monetary totals derived from journal_lines (ledger source of truth), not cached fields
    - Implement `GET /reports/:reportType/export` — export in PDF (pdfkit), XLSX (exceljs), CSV formats
    - Enforce rate limiting: 5 report generations per minute per user
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6_

- [ ] 28. Checkpoint — Verify group lending, cashbook, notifications, settings, and reports
  - Ensure group collections work with member-wise allocation and individual receipts, cashbook reconciliation is accurate, outbox pattern dispatches SMS without affecting finance transactions, all report types generate with correct RBAC scoping, export works. All property tests pass. Ask the user if questions arise.


- [ ] 29. Next.js frontend scaffolding and shared UI
  - [ ] 29.1 Initialize Next.js application in `apps/web`
    - Create `apps/web/package.json` with Next.js 14+, Tailwind CSS, shadcn/ui, React Hook Form, Zod, TanStack Query dependencies
    - Create `apps/web/tsconfig.json` extending shared config
    - Configure Tailwind CSS with mobile-first responsive design
    - Set up shadcn/ui component library
    - Create `apps/web/src/lib/api-client.ts` — typed API client with JWT auth header injection, refresh token handling, request_id propagation
    - Create `apps/web/src/providers/` — AuthProvider (JWT state, login/logout), QueryProvider (TanStack Query), ThemeProvider
    - _Requirements: 23.1, 24.2_

  - [ ] 29.2 Implement auth pages and route-level authorization middleware
    - Create `apps/web/src/app/login/page.tsx` — login form with username/password, error display, loading state
    - Create `apps/web/src/middleware.ts` — Next.js middleware checking JWT and role before rendering pages; redirect unauthenticated to login
    - Create `useAuth` hook for auth state management
    - _Requirements: 16.1, 15.2_

  - [ ] 29.3 Implement shared layout and navigation
    - Create `apps/web/src/app/layout.tsx` — root layout with providers
    - Create `apps/web/src/app/(dashboard)/layout.tsx` — authenticated layout with sidebar navigation, role-based menu items
    - Create shared UI components: `StatusBadge` (loan status, overdue highlighting by DPD bucket), `MoneyDisplay` (INR formatting with Indian comma grouping), `ConfirmDialog` (for destructive/finance-affecting actions), `LoadingSpinner`, `ErrorMessage`, `PaginationControls`
    - _Requirements: 23.2, 23.3, 23.5, 23.6_

- [ ] 30. Frontend — Customer management screens
  - [ ] 30.1 Implement customer list and detail pages
    - Create `apps/web/src/app/(dashboard)/customers/page.tsx` — paginated customer list with search, risk level filter, status badges
    - Create `apps/web/src/app/(dashboard)/customers/[id]/page.tsx` — customer detail with KYC docs, family members, guarantors, loan history, Aadhaar masked display (XXXX-XXXX-1234)
    - Create `apps/web/src/app/(dashboard)/customers/new/page.tsx` — customer registration form with React Hook Form + Zod validation (Aadhaar, PAN, mobile format), photo upload, field-level error messages, input preservation on failure
    - Create hooks: `useCustomers`, `useCustomer`, `useCreateCustomer`
    - _Requirements: 1.1, 1.2, 1.10, 23.9_

- [ ] 31. Frontend — Loan management screens
  - [ ] 31.1 Implement loan list, detail, and application pages
    - Create `apps/web/src/app/(dashboard)/loans/page.tsx` — paginated loan list with status filter, overdue highlighting (color-coded by DPD bucket), status badges
    - Create `apps/web/src/app/(dashboard)/loans/[id]/page.tsx` — loan detail with schedule view, collection history, allocation breakdown, outstanding balance, DPD/bucket display
    - Create `apps/web/src/app/(dashboard)/loans/new/page.tsx` — loan application form with product selection, principal/tenure validation against product ranges, confirmation dialog
    - Implement loan action buttons (submit, review, approve, reject, disburse) with role-based visibility, confirmation dialogs, and no optimistic UI — wait for server response
    - Create hooks: `useLoans`, `useLoan`, `useCreateLoan`, `useLoanActions`
    - _Requirements: 3.1, 3.2, 23.3, 23.4, 23.6_

- [ ] 32. Frontend — Collection and receipt screens
  - [ ] 32.1 Implement collection posting and receipt screens
    - Create `apps/web/src/app/(dashboard)/collections/page.tsx` — collection list with date filter, officer filter
    - Create `apps/web/src/app/(dashboard)/collections/new/page.tsx` — collection posting form: loan selection, amount input (paise), payment date, payment mode; confirmation dialog before submission; generate idempotency key client-side; display allocation breakdown and receipt on success; no optimistic UI
    - Create `apps/web/src/app/(dashboard)/receipts/[id]/page.tsx` — receipt detail view with printable format (thermal printer and A4 optimized)
    - Create receipt print view with customer name, loan ref, amount (formatted INR), date, mode, allocation breakdown, outstanding after, officer name
    - Mobile-first design with large touch-friendly buttons (min 44×44px) for collection officer field use
    - Create hooks: `useCollections`, `usePostCollection`, `useReceipt`
    - _Requirements: 6.1, 19.1, 19.5, 23.1, 23.2, 23.3, 23.4, 23.8_

- [ ] 33. Frontend — Accounting, cashbook, and group screens
  - [ ] 33.1 Implement accounting screens
    - Create `apps/web/src/app/(dashboard)/accounting/page.tsx` — chart of accounts view, daybook, journal entry list
    - Create `apps/web/src/app/(dashboard)/accounting/trial-balance/page.tsx`
    - Create `apps/web/src/app/(dashboard)/accounting/profit-loss/page.tsx`
    - Create `apps/web/src/app/(dashboard)/accounting/balance-sheet/page.tsx`
    - _Requirements: 12.10, 12.11, 12.12, 12.13_

  - [ ] 33.2 Implement cashbook and expense screens
    - Create `apps/web/src/app/(dashboard)/cashbook/page.tsx` — daily cash summary, expense list, handover list
    - Create `apps/web/src/app/(dashboard)/cashbook/expenses/new/page.tsx` — expense entry form with category, amount, date, description, document upload
    - Create `apps/web/src/app/(dashboard)/cashbook/handovers/page.tsx` — handover recording and verification
    - _Requirements: 13.1, 13.2, 13.3_

  - [ ] 33.3 Implement group management screens
    - Create `apps/web/src/app/(dashboard)/groups/page.tsx` — group list with status
    - Create `apps/web/src/app/(dashboard)/groups/[id]/page.tsx` — group detail with member list, member-wise payment status, group delinquency, outstanding summary
    - Create `apps/web/src/app/(dashboard)/groups/[id]/collect/page.tsx` — group collection form with member-wise breakdown input, total validation, confirmation dialog
    - _Requirements: 11.4, 11.8_

- [ ] 34. Frontend — Dashboard, reports, and admin screens
  - [ ] 34.1 Implement dashboard
    - Create `apps/web/src/app/(dashboard)/page.tsx` — KPI dashboard: total active loans count/value, total outstanding, today's collection target/actual, overdue portfolio by bucket, disbursements this month, collection efficiency percentage
    - Role-scoped data display
    - _Requirements: 14.1_

  - [ ] 34.2 Implement report screens
    - Create `apps/web/src/app/(dashboard)/reports/page.tsx` — report type selection, date range filters, pagination
    - Create `apps/web/src/app/(dashboard)/reports/[type]/page.tsx` — report viewer with export buttons (PDF, XLSX, CSV)
    - _Requirements: 14.2, 14.4_

  - [ ] 34.3 Implement admin screens (users, settings, audit logs)
    - Create `apps/web/src/app/(dashboard)/users/page.tsx` — user list, create user form, role assignment
    - Create `apps/web/src/app/(dashboard)/settings/page.tsx` — system settings, holiday calendar management
    - Create `apps/web/src/app/(dashboard)/audit-logs/page.tsx` — audit log viewer with filters (entity, actor, action, date range)
    - _Requirements: 15.7, 17.5_

- [ ] 35. Checkpoint — Verify complete frontend
  - Ensure all pages render correctly, auth flow works (login/logout/refresh), RBAC hides unauthorized elements, collection posting flow works end-to-end with receipt generation, mobile-responsive design verified, confirmation dialogs on finance actions, no optimistic UI for finance mutations. Ask the user if questions arise.


- [ ] 36. Concurrency safety and data integrity hardening
  - [ ] 36.1 Implement optimistic locking on loan and installment records
    - Add version check to all loan and installment update operations using `updateMany` with `where: { id, version: expectedVersion }` pattern
    - Return typed `CONFLICT_OPTIMISTIC_LOCK` error on stale version with retry guidance
    - _Requirements: 20.2, 20.5_

  - [ ] 36.2 Implement database-level serialization for concurrent collection posting
    - Ensure `SELECT ... FOR UPDATE` on loan row within collection transaction to serialize concurrent collections
    - Verify no double-allocation or balance drift under concurrent requests
    - _Requirements: 20.3, 20.6_

  - [ ] 36.3 Implement rate limiting
    - Configure rate limiting: 10 req/min per IP on auth endpoints, 100 req/min per authenticated user on API endpoints, 20 uploads/min per user, 5 report generations/min per user
    - _Requirements: 22.5_

- [ ] 37. Security hardening
  - [ ] 37.1 Implement security headers and IDOR prevention
    - Set CSP headers on Next.js responses
    - Implement SameSite cookie attributes and CSRF protection
    - Implement scope-based access verification: field officers access only assigned customers, collection officers access only assigned loans
    - Enforce maximum page size (100 items) on all paginated endpoints
    - Use UUIDs for all external-facing entity identifiers
    - _Requirements: 22.1, 22.2, 22.3, 22.8, 22.9, 15.6_

  - [ ] 37.2 Implement secure file upload validation
    - Validate MIME type via magic bytes (not just extension)
    - Scan for embedded scripts in uploaded files
    - Store with randomized filenames, separate bucket prefixes
    - _Requirements: 22.4_

- [ ] 38. OpenAPI documentation and environment validation
  - [ ] 38.1 Configure Swagger/OpenAPI auto-generation
    - Set up NestJS Swagger module with decorators on all controllers
    - Generate OpenAPI spec automatically
    - _Requirements: 24.5_

  - [ ] 38.2 Implement startup environment validation
    - Validate all required environment variables at startup using Zod/envalid
    - Fail fast with descriptive errors on missing config
    - Separate configs for development, test, production
    - _Requirements: 24.2_

- [ ] 39. Integration tests for critical finance flows
  - [ ]* 39.1 Write integration tests for loan lifecycle flow
    - Test: customer creation → loan application → submission → review → approval (maker-checker) → disbursement → active status
    - Verify schedule generation, journal entries, audit logs at each step
    - Use test database with migrations applied, seed via test factories
    - _Requirements: 3.1, 5.3, 25.6_

  - [ ]* 39.2 Write integration tests for collection and allocation flow
    - Test: collection posting → allocation verification → receipt generation → outstanding update
    - Test partial payment → overdue computation → penalty posting
    - Test advance payment → future installment allocation
    - Verify ledger entries balance, allocation sums match collection amount
    - _Requirements: 6.2, 6.5, 6.6, 6.7, 8.1_

  - [ ]* 39.3 Write integration tests for reversal flow
    - Test: collection reversal → compensating entries → schedule rollback → ledger mirror
    - Verify net ledger effect == 0, installment statuses restored, receipt marked reversed
    - _Requirements: 7.2, 7.4_

  - [ ]* 39.4 Write integration tests for foreclosure flow
    - Test: foreclosure quote → approval (maker-checker) → settlement → loan closed
    - Verify settlement calculation, journal entries, all installments closed
    - _Requirements: 9.1, 9.4_

  - [ ]* 39.5 Write integration tests for group collection flow
    - Test: group creation → member loans → group collection with member breakdown → individual receipts
    - Verify sum validation, individual allocations correct
    - _Requirements: 11.4, 11.5, 11.7_

  - [ ]* 39.6 Write integration tests for cashbook and expense flow
    - Test: expense recording → journal entry → cashbook update → daily reconciliation
    - _Requirements: 13.3, 13.4, 13.5_

  - [ ]* 39.7 Write integration tests for notification outbox
    - Test: finance transaction enqueues outbox message → processor dispatches → SMS failure does not roll back finance transaction
    - _Requirements: 18.2, 18.4_

- [ ] 40. Concurrency and negative tests
  - [ ]* 40.1 Write concurrency tests
    - Test double-click payment submit (idempotency verification)
    - Test concurrent collection posting on same loan (serialization)
    - Test concurrent approval/disbursement attempts
    - Test receipt numbering collision under concurrent requests
    - Test stale balance conflict detection (optimistic locking)
    - _Requirements: 20.1, 20.2, 20.3, 20.4_

  - [ ]* 40.2 Write negative tests
    - Test invalid Aadhaar/PAN/mobile formats rejected
    - Test duplicate identity submission flagged
    - Test disbursement before approval rejected
    - Test invalid loan terms (out of range) rejected
    - Test invalid state transitions rejected with typed error
    - Test invalid file upload (wrong MIME, oversized) rejected
    - Test permission denial for unauthorized roles
    - Test over-collection (exceeds outstanding) rejected
    - Test reversal of already-reversed collection rejected
    - Test reversal of reversal rejected
    - _Requirements: 1.2, 3.9, 5.2, 6.10, 6.12, 7.5, 7.6, 15.4, 22.4_

  - [ ]* 40.3 Write security tests
    - Test auth bypass attempts (missing/invalid JWT)
    - Test RBAC enforcement per endpoint per role
    - Test IDOR checks (accessing other users' data)
    - Test SQL injection resistance (Prisma parameterization)
    - Test upload misuse (script injection, oversized files)
    - _Requirements: 15.4, 15.5, 15.6, 22.1, 22.4_

- [ ] 41. Final checkpoint — Full system verification
  - Ensure all modules compile with zero TypeScript errors, all unit tests pass, all property-based tests pass (35 properties), all integration tests pass, all concurrency tests pass, all security tests pass, Prisma migrations valid, OpenAPI docs generated, lint/format clean. Ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints (tasks 3, 9, 15, 22, 28, 35, 41) ensure incremental validation
- Property tests validate the 35 correctness properties from the design document using fast-check with Vitest
- Unit tests validate specific examples and edge cases
- Integration tests verify multi-layer flows with real database
- All money arithmetic uses Decimal.js with ROUND_HALF_UP — no floating-point money anywhere
- All finance operations are atomic within single database transactions
- Implementation language: TypeScript throughout (backend NestJS, frontend Next.js, shared packages)
- Concurrency safety (optimistic locking, SELECT FOR UPDATE) is built into finance modules from the start, not bolted on later
- Processing fee collection happens at disbursement time, not as a separate step for faster MVP
- Each task references specific requirements for traceability
- Checkpoints (tasks 3, 9, 15, 22, 28, 35, 41) ensure incremental validation
- Property tests validate the 35 correctness properties from the design document using fast-check with Vitest
- Unit tests validate specific examples and edge cases
- Integration tests verify multi-layer flows with real database
- All money arithmetic uses Decimal.js with ROUND_HALF_UP — no floating-point money anywhere
- All finance operations are atomic within single database transactions
- Implementation language: TypeScript throughout (backend NestJS, frontend Next.js, shared packages)
