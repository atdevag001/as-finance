# Requirements Document — Comprehensive E2E Testing for AS Finance LMS

## Introduction

This specification defines comprehensive end-to-end, integration, property-based, negative, concurrency, and security tests for the AS Finance Loan Management System. Unlike the existing unit test suite (which uses mocked dependencies), every test in this spec exercises REAL infrastructure: a live PostgreSQL database (localhost:5432, database `as_finance_lms`), Playwright MCP for browser-based UI testing, Vitest for test execution, and fast-check for property-based tests. The goal is to prove that the entire system — from browser form submission through NestJS API to PostgreSQL persistence and back — conforms to all requirements and financial invariants defined in the original specification.

**Assumptions:**
- PostgreSQL is running at `localhost:5432` with database `as_finance_lms`, user `postgres`, password `AsFinance2024!`.
- MinIO is running at `localhost:9000` with default credentials (`minioadmin`/`minioadmin`).
- The NestJS API server is running at `http://localhost:3001`.
- The Next.js frontend is running at `http://localhost:3000`.
- Playwright MCP is configured and available for browser automation.
- Database is migrated and seeded before test execution.
- Tests use a dedicated test transaction or cleanup strategy to avoid polluting the database between suites.
- All money values are integer paise (BigInt). Rounding mode is ROUND_HALF_UP.
- Finance events are append-only; corrections via compensating entries only.

## Glossary

- **E2E_Test**: An end-to-end test that exercises the full stack from browser or HTTP client through API to real database and back.
- **Integration_Test**: A test that exercises multiple service layers with a real PostgreSQL database connection, verifying transactional behavior and data persistence.
- **PBT**: Property-Based Test using fast-check to verify invariants hold for all valid generated inputs against the real system.
- **Negative_Test**: A test that submits invalid, malformed, or unauthorized inputs and verifies the system rejects them with correct error responses.
- **Concurrency_Test**: A test that simulates concurrent requests to verify idempotency, locking, and conflict detection with real database constraints.
- **Security_Test**: A test that verifies RBAC enforcement, auth bypass resistance, IDOR prevention, and input sanitization against the live API.
- **Playwright_Test**: A browser-based E2E test using Playwright MCP to automate UI interactions against the running Next.js frontend.
- **Test_Helper**: A utility module providing authenticated HTTP clients, database seeding, cleanup, and factory functions for test data creation.
- **LMS**: The AS Finance Loan Management System under test.
- **Allocation_Engine**: The pure function that distributes a payment across penalty, interest, and principal components.
- **Maker_Checker**: Workflow requiring different users for action creation and approval.
- **Health_Endpoint**: HTTP endpoints (/health/live, /health/ready) that report system liveness and readiness without requiring authentication.
- **Global_Exception_Filter**: The NestJS exception filter that maps all errors to a consistent JSON response shape.
- **Request_ID_Middleware**: Middleware that generates or propagates x-request-id headers for request correlation.
- **Env_Validator**: The Zod-based startup validator that checks required environment variables before the application boots.

## Requirements

### Requirement 1: Customer Onboarding E2E Tests

**User Story:** As a QA engineer, I want to verify the complete customer onboarding flow from API request through database persistence, so that I can confirm customer creation, KYC validation, duplicate detection, and document upload work correctly against real infrastructure.

#### Acceptance Criteria

1. WHEN a valid customer registration payload is submitted via POST /customers with a Field Officer JWT, THE LMS SHALL create a Customer record in PostgreSQL with all mandatory fields persisted correctly and return a 201 response with the customer ID.
2. WHEN a customer registration payload contains an invalid Aadhaar format (not 12 digits) or invalid PAN format (not matching AAAAA9999A), THE LMS SHALL reject the request with a 400 status and a descriptive validation error.
3. WHEN a customer registration payload contains an Aadhaar number or mobile number already present in the database, THE LMS SHALL flag the submission as a potential duplicate and return a typed error requiring Manager review.
4. WHEN a KYC document upload request includes a file with an invalid MIME type (not image/jpeg, image/png, or application/pdf) or exceeds 5MB, THE LMS SHALL reject the upload with a 400 status and descriptive error.
5. WHEN a valid KYC document is uploaded via the document endpoint, THE LMS SHALL store the file in MinIO S3-compatible storage and return a signed URL with a maximum expiry of 15 minutes.
6. WHEN a Customer record is updated via PATCH /customers/:id, THE LMS SHALL record the before_state and after_state in the audit_logs table with the actor identity and timestamp.
7. WHEN a Manager blacklists a Customer via POST /customers/:id/blacklist, THE LMS SHALL update the customer status to blacklisted, record the blacklist reason, and create an audit_log entry. Subsequent loan applications for that Customer SHALL be rejected.
8. THE LMS SHALL mask Aadhaar numbers to show only the last 4 digits (XXXX-XXXX-1234) in all API response bodies. PAN numbers SHALL show only the last 4 characters in log outputs.

### Requirement 2: Loan Product Configuration E2E Tests

**User Story:** As a QA engineer, I want to verify loan product creation, versioning, and validation against real database constraints, so that I can confirm product configuration rules are enforced end-to-end.

#### Acceptance Criteria

1. WHEN a Manager creates a new Loan Product via POST /loan-products with valid configuration (interest type, rate in basis points, principal range, tenure range, frequency, fees), THE LMS SHALL persist the product and its initial version in PostgreSQL and return a 201 response.
2. WHEN a Manager updates a Loan Product, THE LMS SHALL create a new version record in loan_product_versions and preserve the previous version. Existing loans SHALL continue referencing their original product version.
3. WHEN a Loan Product includes a processing fee configuration (fixed paise or percentage basis points), THE LMS SHALL persist the fee type and value and use them during disbursement.
4. WHEN a Manager attempts to deactivate a Loan Product that has active loans, THE LMS SHALL prevent deletion and return a typed error. Deactivation SHALL prevent new loan applications while existing loans continue under original terms.
5. WHEN a Loan Product configuration includes out-of-range values (negative rate, zero principal range, tenure min > max), THE LMS SHALL reject the request with a 400 status and descriptive validation errors.

### Requirement 3: Loan Application Lifecycle E2E Tests

**User Story:** As a QA engineer, I want to verify the complete loan application lifecycle from draft through approval/rejection against real database state transitions, so that I can confirm the state machine, maker-checker enforcement, and validation rules work correctly.

#### Acceptance Criteria

1. WHEN a Field Officer creates a loan application via POST /loans, THE LMS SHALL create a loan in draft status with a unique sequential loan number (format LN-YYYY-NNNNN) generated from a database sequence, and persist it in PostgreSQL.
2. WHEN a loan application is submitted via POST /loans/:id/submit, THE LMS SHALL validate that the principal and tenure fall within the Loan Product's configured ranges and that the Customer is not blacklisted and has no defaulted loans.
3. THE LMS SHALL enforce the complete status transition chain: draft → submitted → under_review → approved → disbursed → active → closed, with branches: under_review → rejected, active → overdue → defaulted, and active/overdue → foreclosed.
4. WHEN a Manager approves a loan via POST /loans/:id/approve, THE LMS SHALL verify the approver is a different user than the loan creator (Maker_Checker enforcement) and record the approval in the audit_logs table.
5. IF a user attempts an invalid status transition (e.g., draft → approved, rejected → disbursed), THEN THE LMS SHALL reject the request with a typed error code INVALID_STATUS_TRANSITION indicating the current status and allowed transitions.
6. WHEN a loan reaches approved status, THE LMS SHALL prevent modification of loan terms (principal, tenure, product) via PATCH /loans/:id, returning a typed error for any attempt to change immutable fields.
7. WHEN a loan number is generated, THE LMS SHALL ensure uniqueness across concurrent loan creation requests by using a database sequence. Concurrent POST /loans requests SHALL each receive distinct loan numbers following the LN-YYYY-NNNNN format.

### Requirement 4: EMI Schedule Generation E2E Tests

**User Story:** As a QA engineer, I want to verify that EMI schedule generation produces mathematically correct, deterministic schedules against real database persistence, so that I can confirm flat and reducing balance calculations, rounding, and holiday adjustments work correctly.

#### Acceptance Criteria

1. WHEN a loan is approved with flat interest type, THE LMS SHALL generate a Schedule where total interest equals principal_paise × annual_rate_bps / 10000 × tenure_months / 12, and each installment has equal principal and interest components, with rounding difference absorbed by the last installment.
2. WHEN a loan is approved with reducing_balance interest type, THE LMS SHALL generate a Schedule using the standard amortization formula (P × r × (1+r)^n / ((1+r)^n − 1)), with each installment's interest calculated on the outstanding principal and rounding difference absorbed by the last installment.
3. FOR ALL valid Schedule instances persisted in loan_schedules, THE LMS SHALL ensure that the sum of all installment principal_paise equals the loan principal_paise, and the sum of all installment interest_paise equals total_interest_paise.
4. THE LMS SHALL guarantee schedule determinism: generating a schedule twice with identical inputs (principal, rate, tenure, start date, frequency, interest type) SHALL produce byte-identical installment records.
5. WHEN a calculated due date falls on a date present in the system holiday calendar (settings table), THE LMS SHALL shift that due date to the next business day not in the holiday calendar.
6. FOR ALL valid Schedules, THE LMS SHALL use Decimal.js with ROUND_HALF_UP rounding at each installment calculation boundary. No floating-point arithmetic SHALL be used for money calculations.

### Requirement 5: Loan Disbursement E2E Tests

**User Story:** As a QA engineer, I want to verify the complete disbursement flow including prerequisite checks, atomic transaction execution, and ledger posting against real infrastructure, so that I can confirm funds are released safely with full audit trail.

#### Acceptance Criteria

1. WHEN a Manager initiates disbursement via POST /disbursements with a valid Idempotency_Key, THE LMS SHALL verify all prerequisites (loan status is approved, schedule exists, KYC documents uploaded, not already disbursed) and execute the disbursement atomically.
2. IF any disbursement prerequisite is not met, THEN THE LMS SHALL reject the disbursement with a typed error listing all unmet prerequisites (LOAN_NOT_APPROVED, SCHEDULE_NOT_GENERATED, KYC_DOCS_MISSING, ALREADY_DISBURSED).
3. WHEN disbursement executes successfully, THE LMS SHALL atomically: update loan status to active, create a disbursement record, create a Journal_Entry (DR Loans_Receivable, CR Cash/Bank), set loan dates and cached_outstanding_paise, and create an audit_log entry. All changes SHALL be visible in a single database query after completion.
4. IF any step within the disbursement transaction fails, THEN THE LMS SHALL roll back the entire transaction. Querying the database after failure SHALL show no partial state changes.
5. WHEN a disbursement request includes an Idempotency_Key that has already been processed, THE LMS SHALL return the original disbursement result with the same response body without creating duplicate records in disbursements, journal_entries, or audit_logs tables.
6. WHEN the Loan Product has a processing fee configured (fixed paise or percentage basis points), THE LMS SHALL calculate the fee correctly: fixed fee as exact paise amount, percentage fee using ROUND_HALF_UP on (principal × bps / 10000). A fee Journal_Entry (DR Cash/Bank, CR Processing_Fee_Income) SHALL be created only when the calculated fee is greater than zero.


### Requirement 6: Collection Posting and Allocation E2E Tests

**User Story:** As a QA engineer, I want to verify the complete collection posting flow including allocation engine, receipt generation, ledger posting, and outstanding balance updates against real infrastructure, so that I can confirm every payment is correctly recorded, allocated, and receipted.

#### Acceptance Criteria

1. WHEN a Collection Officer posts a Collection via POST /collections with a valid payload (loan reference, amount in paise, payment date, payment mode, Idempotency_Key), THE LMS SHALL execute the entire collection atomically: create collection record, run allocation engine, update installment paid amounts, create journal entries, generate receipt, update loan outstanding, and create audit log.
2. WHEN a Collection is allocated, THE LMS SHALL follow the allocation order: penalty (oldest first) → interest (current due then oldest overdue) → principal (current due then oldest overdue), as configured on the Loan Product.
3. FOR ALL valid Collections persisted in the database, THE LMS SHALL ensure that the sum of all allocation components (penalty_paise + interest_paise + principal_paise) across collection_allocations equals the collection amount_paise exactly.
4. WHEN a partial payment is posted (amount less than total current due), THE LMS SHALL allocate the available amount following the allocation order and leave remaining components as partially paid. The installment status SHALL update to partial.
5. WHEN a Collection request includes an Idempotency_Key that has already been processed, THE LMS SHALL return the original Collection result and Receipt without creating duplicate records.
6. THE LMS SHALL generate a unique, sequential receipt_number for each valid Collection. Receipt records SHALL be immutable after creation — no UPDATE or DELETE operations SHALL modify receipt content.
7. WHEN a Collection is posted against a loan with overdue installments, THE LMS SHALL recalculate the loan's DPD and overdue_bucket classification and persist the updated values.
8. THE LMS SHALL prevent posting a Collection against a loan in closed, defaulted, foreclosed, or rejected status, returning a typed error with the appropriate code (LOAN_CLOSED, LOAN_DEFAULTED, LOAN_FORECLOSED, LOAN_REJECTED).
9. FOR ALL valid payment sequences applied to a loan, THE LMS SHALL maintain the invariant: cached_outstanding_paise = total_payable_paise − sum_of_all_valid_allocated_payments. Outstanding SHALL never become negative.
10. IF a Collection amount would cause the outstanding balance to become negative, THEN THE LMS SHALL reject the Collection with a typed error COLLECTION_EXCEEDS_OUTSTANDING indicating the maximum acceptable payment amount.

### Requirement 7: Collection Reversal E2E Tests

**User Story:** As a QA engineer, I want to verify the complete reversal flow including compensating entries, schedule rollback, and ledger neutrality against real infrastructure, so that I can confirm errors are corrected without modifying original records.

#### Acceptance Criteria

1. WHEN a Manager initiates a Collection reversal via POST /collections/:id/reverse with a mandatory reason, THE LMS SHALL execute the reversal atomically: create compensating collection record, reverse allocation records, restore installment payment statuses, create compensating journal entries, mark original receipt as reversed, issue compensating receipt, and create audit log.
2. FOR ALL valid reversals, THE LMS SHALL ensure that the net ledger effect of the original Collection plus its Reversal equals zero. Querying journal_lines for the original and reversal journal entries SHALL show matching debit/credit amounts that sum to zero.
3. THE LMS SHALL prevent reversal of a Collection that has already been reversed, returning a typed error.
4. THE LMS SHALL prevent reversal of a reversal (no chained reversals), returning a typed error.
5. WHEN a reversal is completed, THE LMS SHALL recalculate the loan's DPD and overdue_bucket classification based on the updated payment state and persist the new values.
6. THE LMS SHALL record the reversal in the audit_logs table with actor identity, original collection reference, reversal reason, and timestamp.

### Requirement 8: Overdue Tracking and Penalty Management E2E Tests

**User Story:** As a QA engineer, I want to verify overdue detection, DPD calculation, penalty posting, and penalty waiver flows against real infrastructure, so that I can confirm delinquency management works correctly with real dates and database state.

#### Acceptance Criteria

1. WHEN an Installment's due date passes without full payment, THE LMS SHALL mark the Installment as overdue and update the loan's DPD to the calendar days since the earliest unpaid installment due date.
2. THE LMS SHALL classify loans into correct overdue_bucket values: bucket_1_30 (1–30 DPD), bucket_31_60 (31–60 DPD), bucket_61_90 (61–90 DPD), bucket_90_plus (90+ DPD).
3. WHEN a Penalty is posted for an overdue installment, THE LMS SHALL atomically: create a penalty record, create a Journal_Entry (DR Loans_Receivable, CR Penalty_Income), update the loan's outstanding balance, and create an audit_log entry.
4. THE LMS SHALL prevent duplicate penalty posting for the same installment and penalty period, using the unique constraint on (loan_id, installment_id, penalty_period).
5. WHEN all overdue installments are paid and DPD returns to zero, THE LMS SHALL transition the loan status from overdue back to active.
6. WHEN a Manager waives a Penalty, THE LMS SHALL require Maker_Checker approval (waiver requester and approver must differ), mark the penalty as waived (not deleted), and record the waiver in the audit_log.
7. THE LMS SHALL calculate DPD using calendar days correctly, including across timezone boundaries where business dates use IST and timestamps are stored as UTC.

### Requirement 9: Foreclosure E2E Tests

**User Story:** As a QA engineer, I want to verify the complete foreclosure flow from quote generation through settlement payment and loan closure against real infrastructure, so that I can confirm early closure calculations and atomic execution work correctly.

#### Acceptance Criteria

1. WHEN a Manager requests a foreclosure quote via POST /foreclosures/quote, THE LMS SHALL calculate the settlement amount as: outstanding principal + accrued interest to date + pending penalties − any applicable rebate, with each component explicitly itemized in the response.
2. THE LMS SHALL assign a 24-hour validity period to each foreclosure quote. WHEN a foreclosure execution is attempted after the quote has expired, THE LMS SHALL reject the request with a typed error and require a new quote.
3. WHEN a foreclosure settlement payment is posted, THE LMS SHALL atomically: create a final settlement collection with full allocation, close all remaining schedule installments, create journal entries for all settlement components, update loan status to foreclosed, and create an audit_log entry.
4. IF any step within the foreclosure transaction fails, THEN THE LMS SHALL roll back the entire transaction. No partial state SHALL persist.
5. THE LMS SHALL require Maker_Checker approval for foreclosure: the requesting user and the approving user must be different.

### Requirement 10: Loan Closure E2E Tests

**User Story:** As a QA engineer, I want to verify the loan closure prerequisite checks and status transition against real database state, so that I can confirm only fully repaid loans can be closed.

#### Acceptance Criteria

1. WHEN a Manager initiates loan closure via POST /loans/:id/close, THE LMS SHALL verify all prerequisites: all schedule installments fully paid, all penalties settled or waived, no pending reversals, and outstanding balance equals zero (within 1 paisa tolerance).
2. IF any closure prerequisite is not met, THEN THE LMS SHALL reject the closure with a typed error CLOSURE_PREREQUISITES_NOT_MET listing all unmet prerequisites.
3. WHEN loan closure executes successfully, THE LMS SHALL update the loan status to closed and create an audit_log entry with the final outstanding balance.
4. THE LMS SHALL prevent reopening a closed loan. Any POST /loans/:id/submit or status transition attempt on a closed loan SHALL return a typed error INVALID_STATUS_TRANSITION.

### Requirement 11: Group Loan Management E2E Tests

**User Story:** As a QA engineer, I want to verify group creation, member management, and group collection posting against real infrastructure, so that I can confirm group lending workflows work correctly with member-wise allocation and receipting.

#### Acceptance Criteria

1. WHEN a Field Officer creates a Group via POST /groups with valid data (name, meeting day, branch/area, leader from members), THE LMS SHALL persist the group and its members in PostgreSQL.
2. THE LMS SHALL enforce group size constraints: minimum 5 members and maximum 15 members. Requests violating these bounds SHALL be rejected with a descriptive error.
3. WHEN a group collection is posted via POST /groups/:id/collections with a total amount and member-wise breakdown, THE LMS SHALL validate that member amounts sum to the total and allocate each member's portion to their individual loan.
4. IF the member-wise breakdown does not sum to the total group collection amount, THEN THE LMS SHALL reject the collection with a typed error showing the discrepancy.
5. WHEN a group collection is posted successfully, THE LMS SHALL generate individual receipts for each member's allocated portion.
6. THE LMS SHALL prevent removing a member from a Group when that member has active loans linked to the Group.

### Requirement 12: Double-Entry Accounting and Ledger E2E Tests

**User Story:** As a QA engineer, I want to verify that all finance events produce balanced journal entries and that ledger queries return correct results against real database state, so that I can confirm the accounting system is accurate and reconcilable.

#### Acceptance Criteria

1. FOR ALL journal_entries in the database, THE LMS SHALL enforce that total debit_paise equals total credit_paise across all journal_lines for each entry. Any attempt to create an unbalanced entry SHALL be rejected with a typed error.
2. WHEN a Disbursement occurs, THE LMS SHALL create a Journal_Entry with lines: DR Loans_Receivable for the disbursed amount, CR Cash/Bank for the disbursed amount.
3. WHEN a Collection is allocated, THE LMS SHALL create Journal_Entry lines: DR Cash/Bank for the total amount, CR Loans_Receivable for the principal component, CR Interest_Income for the interest component, CR Penalty_Income for the penalty component.
4. WHEN a Reversal occurs, THE LMS SHALL create mirror Journal_Entries where original debits become credits and original credits become debits for the exact same amounts.
5. THE LMS SHALL prevent modification or deletion of posted journal_entries. No UPDATE or DELETE SQL operations SHALL succeed against journal_entries or journal_lines tables via the API.
6. THE LMS SHALL support generating a trial balance where the sum of all debit balances equals the sum of all credit balances across all accounts in chart_of_accounts.
7. FOR ALL posted journal_entries, THE LMS SHALL ensure that ledger totals reconcile with loan event summaries. No orphaned journal entries (entries without a valid source reference) SHALL exist.


### Requirement 13: Cashbook and Expense Management E2E Tests

**User Story:** As a QA engineer, I want to verify expense recording, cash handover, and cashbook balance tracking against real infrastructure, so that I can confirm cash management workflows produce correct ledger entries and audit trails.

#### Acceptance Criteria

1. WHEN an Accountant records an expense via POST /cashbook/expenses, THE LMS SHALL create an expense record, a Journal_Entry (DR Expense account, CR Cash/Bank), and an audit_log entry atomically.
2. WHEN a Collection Officer initiates a cash handover via POST /cashbook/handovers, THE LMS SHALL create a handover record with the declared a