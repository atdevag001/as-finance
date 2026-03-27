# Requirements Document — AS Finance Loan Management System

## Introduction

AS Finance LMS is a production-grade fullstack web application for managing the complete lending lifecycle of AS Finance, a lending company operating in small cities and villages in India. The system covers customer onboarding, loan product configuration, loan application lifecycle, deterministic EMI schedule generation, field and office collection posting, group lending, double-entry accounting, reporting, SMS notifications, RBAC, and audit logging. Every design decision prioritizes financial correctness, auditability, and field usability over developer convenience.

**Assumptions (safest practical):**
- Currency is INR, persisted as integer paise (1 INR = 100 paise). No multi-currency support.
- Timezone for all business date logic is Asia/Kolkata (IST). Timestamps stored as UTC.
- Rounding mode is ROUND_HALF_UP for all money calculations. Rounding difference absorbed by last installment.
- Allocation order: penalty → interest → principal (oldest first), unless overridden at product level.
- Outstanding balance is derived (computed from schedule + allocations), with optional cached field updated transactionally.
- Finance events are append-only. Corrections via compensating entries only.
- Soft delete for non-finance entities where safe. Finance history is never deleted.
- SMS/notification failure never rolls back a valid finance transaction.
- Group size: 5–15 members.
- Holiday calendar is manually maintained by admin. Due dates falling on holidays shift to next business day.

## Glossary

- **LMS**: Loan Management System — the application being specified
- **Customer**: An individual borrower registered in the system with KYC details
- **Guarantor**: A person who guarantees repayment of a customer's loan
- **Loan_Product**: A configurable template defining interest type, rates, fees, penalties, and repayment terms
- **Loan**: A specific lending agreement between AS Finance and a Customer, based on a Loan_Product
- **EMI**: Equated Monthly Installment — a fixed periodic repayment amount
- **Schedule**: The deterministic list of installments (principal + interest components) for a Loan
- **Installment**: A single row in the Schedule with due date, principal component, interest component, and payment status
- **Collection**: A payment received from a Customer against a Loan
- **Allocation**: The breakdown of a Collection into penalty, interest, and principal components across installments
- **Receipt**: An immutable document generated for every valid Collection
- **Reversal**: A compensating entry that exactly offsets an original Collection in the ledger
- **Disbursement**: The release of loan funds to the Customer after approval
- **Foreclosure**: Early closure of a Loan by paying all outstanding dues before the scheduled end date
- **Penalty**: A charge applied when an installment is overdue beyond a configured grace period
- **DPD**: Days Past Due — calendar days since the earliest unpaid installment due date
- **Overdue_Bucket**: Classification of overdue severity (1–30, 31–60, 61–90, 90+ DPD)
- **Group**: A collection of 5–15 Customers who borrow and repay together under group lending
- **Group_Leader**: A designated member of a Group responsible for coordination
- **Ledger**: The double-entry journal recording all finance events as balanced debit/credit entries
- **Journal_Entry**: A single balanced accounting entry with debit and credit lines
- **Chart_of_Accounts**: The hierarchical list of account categories (assets, liabilities, income, expenses)
- **Cashbook**: A record of all cash inflows and outflows
- **Outbox**: An async message queue for SMS/notification dispatch, decoupled from finance transactions
- **Idempotency_Key**: A unique key submitted with finance-affecting requests to prevent duplicate processing
- **Maker_Checker**: A workflow where one user initiates an action and another authorized user approves it
- **RBAC**: Role-Based Access Control — permission enforcement based on user roles
- **Audit_Log**: An append-only record of every finance-affecting and security-relevant action
- **PII**: Personally Identifiable Information — sensitive data requiring masking (Aadhaar, PAN, mobile)
- **Paise**: The smallest unit of INR (1 INR = 100 paise), used for all money storage and transport
- **Signed_URL**: A time-limited URL granting temporary access to a stored document

## Requirements

### Requirement 1: Customer Onboarding and Profile Management

**User Story:** As a Field Officer, I want to register new customers with full KYC details, family members, and guarantors, so that AS Finance has complete borrower profiles before loan origination.

#### Acceptance Criteria

1. WHEN a Field Officer submits a new customer registration form, THE LMS SHALL create a Customer record with mandatory fields: full name, father/husband name, mobile number, Aadhaar number, date of birth or age, gender, full address (line1, city, district, state, pincode), and at least one photo. Optional fields include: alternate mobile, PAN number, occupation, monthly income, and work/business details.
2. WHEN a customer registration is submitted, THE LMS SHALL validate Aadhaar format (12 digits) and PAN format (AAAAA9999A) and reject submissions with invalid formats with a descriptive error message.
3. WHEN a customer registration includes an Aadhaar number or mobile number already present in the system, THE LMS SHALL flag the submission as a potential duplicate and require Manager review before proceeding.
4. WHEN a Field Officer uploads a KYC document, THE LMS SHALL validate the file MIME type (image/jpeg, image/png, application/pdf only) and reject files exceeding 5MB with a descriptive error.
5. THE LMS SHALL store all KYC documents in S3-compatible storage and provide access only via Signed_URLs with a maximum expiry of 15 minutes.
6. WHEN a Field Officer adds family members to a Customer profile, THE LMS SHALL record each family member's name, relationship, contact number, occupation (optional), and income contribution (optional).
7. WHEN a Field Officer adds a Guarantor to a Customer profile, THE LMS SHALL record the Guarantor's name, relationship to Customer, mobile number, Aadhaar number, address, and at least one photo.
8. THE LMS SHALL support assigning a risk level (low, medium, high) to each Customer, defaulting to medium on creation.
9. WHEN a Manager blacklists a Customer, THE LMS SHALL prevent new loan applications for that Customer and record the blacklisting reason and timestamp in the Audit_Log.
9a. WHEN a Manager reinstates a blacklisted Customer, THE LMS SHALL change the Customer status back to active and record the reinstatement with reason and timestamp in the Audit_Log. Reinstatement requires Manager or Super_Admin role.
10. THE LMS SHALL mask Aadhaar numbers to show only the last 4 digits (XXXX-XXXX-1234) in all UI displays and log outputs.
11. THE LMS SHALL mask PAN numbers to show only the last 4 characters (XXXXXX1234) in all log outputs.
12. WHEN a Customer record is updated, THE LMS SHALL record the before-state and after-state in the Audit_Log with the actor identity and timestamp.


### Requirement 2: Loan Product Management

**User Story:** As a Manager, I want to configure loan products with different interest types, rates, fees, and penalty rules, so that AS Finance can offer multiple lending products with consistent terms.

#### Acceptance Criteria

1. WHEN a Manager creates a new Loan_Product, THE LMS SHALL require: product name, interest type (flat or reducing_balance), annual interest rate (integer basis points), minimum and maximum principal amount (paise), minimum and maximum tenure (months), repayment frequency (daily, weekly, monthly), and processing fee configuration.
2. THE LMS SHALL support two interest calculation types: flat interest and reducing balance, each with documented formulas.
3. WHEN a Loan_Product includes a processing fee, THE LMS SHALL store the fee as either a fixed amount (paise) or a percentage of principal (basis points), with explicit configuration.
4. WHEN a Manager configures penalty rules for a Loan_Product, THE LMS SHALL accept: penalty grace period (days), penalty type (flat_per_period or percentage_of_overdue), penalty amount or rate, and penalty frequency (daily, weekly, monthly).
5. WHEN a Loan_Product is updated, THE LMS SHALL create a new version of the product and preserve all previous versions. Existing Loans SHALL continue to reference the product version active at the time of their creation.
6. THE LMS SHALL prevent deletion of a Loan_Product that has any associated active Loans.
7. WHEN a Loan_Product is deactivated, THE LMS SHALL prevent new Loan applications using that product while allowing existing Loans to continue under their original terms.
8. THE LMS SHALL validate that the annual interest rate, principal range, and tenure range are within system-configured bounds and reject out-of-range values with descriptive errors.

### Requirement 3: Loan Application Lifecycle

**User Story:** As a Field Officer, I want to create loan applications for customers and track them through the approval process, so that loans are originated with proper authorization and documentation.

#### Acceptance Criteria

1. THE LMS SHALL enforce the following loan status transitions: draft → submitted → under_review → approved → disbursed → active → closed, with additional transitions: under_review → rejected, active → overdue, active → defaulted, and active/overdue → foreclosed.
2. WHEN a Field Officer creates a loan application, THE LMS SHALL require: Customer reference, Loan_Product reference, requested principal amount (paise), requested tenure (months), and purpose of loan.
2a. THE LMS SHALL generate a unique, sequential loan number (format: LN-{year}-{padded_number}) for each loan application using a database sequence. Loan numbers SHALL be immutable after generation.
3. WHEN a loan application is submitted, THE LMS SHALL validate that the requested principal and tenure fall within the Loan_Product's configured ranges and reject non-compliant applications with descriptive errors.
4. WHEN a loan application is submitted, THE LMS SHALL verify that the Customer is not blacklisted and has no defaulted loans, and reject the application if either condition is true.
5. THE LMS SHALL support multiple active Loans per Customer, subject to a configurable maximum concurrent loan limit per Loan_Product.
5a. WHEN a loan is approved and the Loan_Product has a processing fee configured, THE LMS SHALL calculate the processing fee (fixed paise or percentage of principal in basis points) and record it. The processing fee SHALL be collected at disbursement and recorded as a separate Journal_Entry (DR Cash/Bank, CR Processing_Fee_Income).
6. WHEN a Manager moves a loan to under_review status, THE LMS SHALL record the reviewer identity and timestamp in the Audit_Log.
7. WHEN a Manager approves a loan, THE LMS SHALL require the approver to be a different user than the application creator (Maker_Checker enforcement) and record the approval with approver identity, timestamp, and optional remarks in the Audit_Log.
8. WHEN a Manager rejects a loan, THE LMS SHALL require a rejection reason and record the rejection with reviewer identity, reason, and timestamp in the Audit_Log.
9. IF a user attempts an invalid status transition (e.g., draft → approved, rejected → disbursed), THEN THE LMS SHALL reject the request with a typed error indicating the current status and allowed transitions.
10. THE LMS SHALL prevent any modification to loan terms (principal, tenure, product) after the loan reaches approved status.


### Requirement 4: EMI Schedule Generation

**User Story:** As a Manager, I want the system to generate deterministic repayment schedules based on loan product configuration, so that every loan has a clear, auditable, and mathematically correct repayment plan.

#### Acceptance Criteria

1. WHEN a loan is approved, THE LMS SHALL generate a Schedule consisting of Installments with due dates, principal component (paise), and interest component (paise) for each period.
2. WHEN the Loan_Product interest type is flat, THE LMS SHALL calculate total interest as: principal_paise × annual_rate_bps / 10000 × tenure_months / 12, compute EMI as (principal_paise + total_interest) / number_of_installments, and distribute fixed principal and interest components per installment, with rounding difference absorbed by the last installment.
3. WHEN the Loan_Product interest type is reducing_balance, THE LMS SHALL calculate EMI using the formula: P × r × (1+r)^n / ((1+r)^n − 1) where r = monthly_rate and n = number_of_installments, compute each installment's interest as outstanding_principal × monthly_rate and principal as EMI − interest, with rounding difference absorbed by the last installment.
4. THE LMS SHALL use Decimal.js for all intermediate money arithmetic and round to the nearest paisa (integer) using ROUND_HALF_UP at each installment calculation boundary.
5. THE LMS SHALL guarantee schedule determinism: given identical inputs (principal, rate, tenure, start date, frequency, interest type), the generated Schedule SHALL be byte-identical across invocations.
6. FOR ALL valid Schedule instances, THE LMS SHALL ensure that the sum of all installment principal components equals the loan principal amount, and the sum of all installment interest components equals the total calculated interest, with any rounding difference confined to the last installment only.
7. WHEN the repayment frequency is monthly, THE LMS SHALL set the first installment due date to start_date plus one month, and subsequent due dates at one-month intervals. WHEN the frequency is weekly, intervals SHALL be 7 days. WHEN the frequency is daily, intervals SHALL be 1 day.
8. WHEN a calculated due date falls on a date present in the system holiday calendar, THE LMS SHALL shift that due date to the next business day not in the holiday calendar.
9. THE LMS SHALL freeze the Schedule at disbursement. After disbursement, the Schedule SHALL be immutable — no recalculation or modification is permitted.
10. FOR ALL valid Schedules, parsing the Schedule into a structured object, formatting it back to its storage representation, and parsing again SHALL produce an equivalent object (round-trip property).

### Requirement 5: Loan Disbursement

**User Story:** As a Manager, I want to disburse approved loans with full transaction safety, so that funds are released only after all prerequisites are met and the event is fully recorded in the ledger.

#### Acceptance Criteria

1. WHEN a Manager initiates disbursement, THE LMS SHALL verify all prerequisites: loan status is approved, Schedule is generated, all required KYC documents are uploaded, and the loan has not already been disbursed (idempotency check).
2. IF any disbursement prerequisite is not met, THEN THE LMS SHALL reject the disbursement with a typed error listing all unmet prerequisites.
3. WHEN disbursement is executed, THE LMS SHALL perform the following atomically within a single database transaction: update loan status to disbursed, create a Disbursement record with amount (paise), date, mode (cash/bank), and reference number, create a Journal_Entry debiting Loans_Receivable and crediting Cash/Bank for the disbursed amount, activate the Schedule, and create an Audit_Log entry.
4. IF any step within the disbursement transaction fails, THEN THE LMS SHALL roll back the entire transaction and return a typed error. No partial state SHALL persist.
5. WHEN a disbursement request includes an Idempotency_Key that has already been processed, THE LMS SHALL return the original disbursement result without creating a duplicate disbursement.
6. WHEN disbursement completes successfully, THE LMS SHALL transition the loan status from disbursed to active.
7. THE LMS SHALL record the disbursement in the Audit_Log with actor identity, loan reference, amount, mode, and timestamp.

### Requirement 6: Collection Posting and Allocation

**User Story:** As a Collection Officer, I want to post payments against loans with automatic allocation to penalties, interest, and principal, so that every payment is correctly recorded, allocated, and receipted.

#### Acceptance Criteria

1. WHEN a Collection Officer posts a Collection, THE LMS SHALL require: loan reference, amount (paise), payment date, payment mode (cash, bank_transfer, online), and an Idempotency_Key.
2. WHEN a Collection is posted, THE LMS SHALL perform the following atomically within a single database transaction: create a Collection record, allocate the payment amount across outstanding components in the order penalty (oldest first) → interest (current due then oldest overdue) → principal (current due then oldest overdue), update Installment payment statuses, create Journal_Entries (debit Cash/Bank, credit appropriate income/receivable accounts per component), generate an immutable Receipt, and create an Audit_Log entry.
3. IF any step within the collection transaction fails, THEN THE LMS SHALL roll back the entire transaction. No partial state SHALL persist.
4. WHEN a Collection request includes an Idempotency_Key that has already been processed, THE LMS SHALL return the original Collection result and Receipt without creating a duplicate posting.
5. WHEN a partial payment is posted (amount less than total current due), THE LMS SHALL allocate the available amount following the allocation order and leave remaining components as partially paid or unpaid.
6. WHEN an advance payment is posted (amount exceeding all current and overdue dues), THE LMS SHALL allocate excess to future installments in chronological order after clearing all current and overdue dues.
7. FOR ALL valid Collections, THE LMS SHALL ensure that the sum of all Allocation components (penalty + interest + principal) equals the Collection amount exactly.
8. THE LMS SHALL generate a unique, sequential Receipt number for each valid Collection. Receipt numbers SHALL be immutable after generation.
9. WHEN a Collection is posted against a loan with overdue installments, THE LMS SHALL update the loan's DPD and Overdue_Bucket classification after allocation.
10. THE LMS SHALL prevent posting a Collection against a loan in closed, defaulted, foreclosed, or rejected status, returning a typed error.
11. FOR ALL valid payment sequences applied to a loan, THE LMS SHALL maintain the invariant: outstanding_balance = total_payable − sum_of_all_valid_allocated_payments. Outstanding SHALL never become negative.
12. IF a Collection amount would cause the outstanding balance to become negative, THEN THE LMS SHALL reject the Collection with a typed error indicating the maximum acceptable payment amount.


### Requirement 7: Collection Reversal

**User Story:** As a Manager, I want to reverse an incorrectly posted collection with full compensating entries, so that errors are corrected without modifying or deleting original records.

#### Acceptance Criteria

1. WHEN a Manager initiates a Collection reversal, THE LMS SHALL require: the original Collection reference, a mandatory reason/remarks, and the reversal must be authorized by a user with Manager or Super_Admin role.
2. WHEN a reversal is executed, THE LMS SHALL perform the following atomically within a single database transaction: create a compensating Collection record (negative amount), create reverse Allocation records that exactly offset the original allocations, restore Installment payment statuses to their pre-collection state, create compensating Journal_Entries that mirror the original entries (debits become credits, credits become debits), mark the original Receipt as reversed (not deleted) and issue a compensating Receipt, and create an Audit_Log entry with the reversal reason.
3. IF any step within the reversal transaction fails, THEN THE LMS SHALL roll back the entire transaction. No partial state SHALL persist.
4. FOR ALL valid reversals, THE LMS SHALL ensure that the net ledger effect of the original Collection plus its Reversal equals zero (Reversal Neutrality invariant).
5. THE LMS SHALL prevent reversal of a Collection that has already been reversed, returning a typed error.
6. THE LMS SHALL prevent reversal of a reversal (no chained reversals), returning a typed error.
7. WHEN a reversal is completed, THE LMS SHALL recalculate the loan's DPD and Overdue_Bucket classification based on the updated payment state.
8. THE LMS SHALL record the reversal in the Audit_Log with actor identity, original Collection reference, reversal reason, and timestamp.

### Requirement 8: Overdue Tracking and Penalty Management

**User Story:** As a Manager, I want the system to automatically track overdue installments and apply penalties according to product rules, so that delinquency is managed consistently and transparently.

#### Acceptance Criteria

1. WHEN an Installment's due date passes without full payment, THE LMS SHALL mark the Installment as overdue and update the loan's DPD (calendar days since the earliest unpaid installment due date).
2. THE LMS SHALL classify loans into Overdue_Buckets: 1–30 DPD, 31–60 DPD, 61–90 DPD, and 90+ DPD.
3. WHEN a loan's DPD exceeds the Loan_Product's configured penalty grace period, THE LMS SHALL calculate and post a Penalty according to the product's penalty configuration (flat amount per period or percentage of overdue amount).
4. WHEN a Penalty is posted, THE LMS SHALL perform atomically: create a Penalty record with amount (paise), calculation details, and source installment reference, create a Journal_Entry debiting Loans_Receivable and crediting Penalty_Income, update the loan's outstanding balance, and create an Audit_Log entry.
5. THE LMS SHALL prevent duplicate penalty posting for the same installment and penalty period, using the installment reference and period as a uniqueness constraint.
6. WHEN a loan transitions from active to overdue status, THE LMS SHALL record the transition in the Audit_Log.
7. WHEN all overdue installments are paid and DPD returns to zero, THE LMS SHALL transition the loan status from overdue back to active.
8. WHEN a loan's DPD exceeds a configurable threshold (default: 90 days), THE LMS SHALL support transitioning the loan status from overdue to defaulted. This transition SHALL be recorded in the Audit_Log with the DPD value and actor identity.
9. WHEN a Manager waives a Penalty, THE LMS SHALL require a mandatory reason, mark the Penalty as waived (not deleted), record the waiver amount, reason, and authorizing user in the Audit_Log, and update the loan's outstanding balance accordingly. Penalty waiver requires Maker_Checker approval (waiver requester and approver must differ).

### Requirement 9: Foreclosure (Early Closure)

**User Story:** As a Manager, I want to process early loan closures with accurate settlement calculations, so that customers can pay off loans before the scheduled end date with all components explicitly accounted for.

#### Acceptance Criteria

1. WHEN a Manager requests a foreclosure quote, THE LMS SHALL calculate the settlement amount as: outstanding principal + accrued interest to date + pending penalties − any applicable rebate, with each component explicitly itemized.
1a. THE LMS SHALL assign a validity period of 24 hours to each foreclosure quote. IF a foreclosure execution is attempted after the quote has expired, THE LMS SHALL reject the request with a typed error and require a new quote to be generated.
2. WHEN the Loan_Product interest type is flat, THE LMS SHALL calculate accrued interest pro-rata based on elapsed tenure. WHEN the interest type is reducing_balance, THE LMS SHALL calculate accrued interest using daily accrual on the current outstanding principal.
3. THE LMS SHALL document the accrued interest calculation method used for each interest type in the foreclosure computation.
4. WHEN a foreclosure is approved and the settlement payment is posted, THE LMS SHALL perform atomically: create a final settlement Collection with full allocation, close all remaining Schedule installments, create Journal_Entries for all settlement components, update loan status to foreclosed/closed, and create an Audit_Log entry.
5. IF any step within the foreclosure transaction fails, THEN THE LMS SHALL roll back the entire transaction. No partial state SHALL persist.
6. THE LMS SHALL require Maker_Checker approval for foreclosure: the requesting user and the approving user must be different.
7. WHEN a foreclosure includes a rebate or fee waiver, THE LMS SHALL record the waiver amount, reason, and authorizing user in the Audit_Log.

### Requirement 10: Loan Closure

**User Story:** As a Manager, I want to close fully repaid loans with verification of all prerequisites, so that loan records are finalized accurately.

#### Acceptance Criteria

1. WHEN a Manager initiates loan closure, THE LMS SHALL verify all prerequisites: all Schedule installments are fully paid, all Penalties are settled or explicitly waived with authorization, no pending Reversals exist, and outstanding balance equals zero (or within a documented rounding tolerance of 1 paisa).
2. IF any closure prerequisite is not met, THEN THE LMS SHALL reject the closure with a typed error listing all unmet prerequisites.
3. WHEN loan closure is executed, THE LMS SHALL update the loan status to closed and create an Audit_Log entry with actor identity, loan reference, final outstanding balance, and timestamp.
4. THE LMS SHALL prevent reopening a closed loan. Any post-closure correction SHALL be handled via a new compensating transaction with Manager authorization.


### Requirement 11: Group Loan Management

**User Story:** As a Field Officer, I want to manage group loans where 5–15 members borrow and repay together, so that AS Finance can serve community-based lending with member-wise tracking and group-level collection.

#### Acceptance Criteria

1. WHEN a Field Officer creates a Group, THE LMS SHALL require: group name, meeting day (day of week), branch/area, and a designated Group_Leader from among the members.
2. THE LMS SHALL enforce group size constraints: minimum 5 members and maximum 15 members. IF a group creation or member addition would violate these bounds, THEN THE LMS SHALL reject the request with a descriptive error.
3. WHEN a Group is created, THE LMS SHALL allow individual Loans to be created for each member, linked to the Group.
4. WHEN a group collection is posted, THE LMS SHALL accept a total collection amount and a member-wise breakdown, validate that the member amounts sum to the total, and allocate each member's portion to their individual Loan following the standard allocation order.
5. IF the member-wise breakdown does not sum to the total group collection amount, THEN THE LMS SHALL reject the collection with a typed error showing the discrepancy.
6. THE LMS SHALL track delinquency at both the individual member level and the group level. A Group is delinquent when any member has overdue installments.
7. WHEN a group collection is posted, THE LMS SHALL generate individual Receipts for each member's allocated portion.
8. THE LMS SHALL support viewing group-level summaries: total outstanding, total collected, member-wise payment status, and group delinquency status.
9. WHEN a member is removed from a Group, THE LMS SHALL verify that the member has no active Loans linked to the Group before allowing removal.

### Requirement 12: Double-Entry Accounting and Ledger

**User Story:** As an Accountant, I want all finance events to be recorded as balanced double-entry journal entries against a chart of accounts, so that AS Finance maintains an accurate, auditable, and reconcilable ledger.

#### Acceptance Criteria

1. THE LMS SHALL maintain a Chart_of_Accounts with account categories: assets, liabilities, income, and expenses, with predefined accounts including: Cash, Bank, Loans_Receivable, Interest_Income, Processing_Fee_Income, Penalty_Income, and configurable Expense sub-accounts.
2. WHEN a Disbursement occurs, THE LMS SHALL create a Journal_Entry: debit Loans_Receivable, credit Cash/Bank, for the disbursed amount.
3. WHEN a Collection is allocated, THE LMS SHALL create Journal_Entry lines: debit Cash/Bank and credit Loans_Receivable for the principal component, credit Interest_Income for the interest component, and credit Penalty_Income for the penalty component.
4. WHEN a processing fee is collected, THE LMS SHALL create a Journal_Entry: debit Cash/Bank, credit Processing_Fee_Income.
5. WHEN an Expense is recorded, THE LMS SHALL create a Journal_Entry: debit the appropriate Expense account, credit Cash/Bank.
6. WHEN a Reversal occurs, THE LMS SHALL create mirror Journal_Entries: original debits become credits and original credits become debits, for the exact same amounts.
7. FOR ALL Journal_Entries, THE LMS SHALL enforce that total debit amounts equal total credit amounts. IF a Journal_Entry does not balance, THEN THE LMS SHALL reject the entry with a typed error.
8. THE LMS SHALL prevent modification or deletion of posted Journal_Entries. Corrections SHALL be made via new compensating Journal_Entries only.
9. FOR ALL posted Journal_Entries, THE LMS SHALL ensure that ledger totals reconcile with loan event summaries. No orphaned or unmatched entries SHALL exist (Ledger Reconciliation invariant).
10. THE LMS SHALL support generating a daybook view: all Journal_Entries for a given date range, ordered chronologically.
11. THE LMS SHALL support generating a trial balance: sum of all debit balances equals sum of all credit balances across all accounts.
12. THE LMS SHALL support generating a Profit & Loss statement: income accounts minus expense accounts for a given date range.
13. THE LMS SHALL support generating a Balance Sheet: assets = liabilities + equity at a given point in time.

### Requirement 13: Cashbook and Expense Management

**User Story:** As an Accountant, I want to track all cash inflows and outflows with proper categorization, so that daily cash positions are accurate and reconcilable.

#### Acceptance Criteria

1. THE LMS SHALL maintain a Cashbook recording all cash transactions: collections received (cash mode), disbursements made (cash mode), expenses paid, and cash handovers.
2. WHEN a Collection Officer completes a field collection round, THE LMS SHALL support recording a cash handover: total cash collected, receiving officer, handover date, and verification status.
3. WHEN an Accountant records an expense, THE LMS SHALL require: expense category (from configurable list), amount (paise), date, description, and supporting document reference (optional).
4. WHEN an expense is recorded, THE LMS SHALL create the corresponding Journal_Entry atomically and record the expense in the Audit_Log.
5. THE LMS SHALL support daily cash reconciliation: opening balance + cash inflows − cash outflows = closing balance, with any discrepancy flagged for review.
6. THE LMS SHALL classify income by source: interest income, processing fee income, penalty income, and other income.


### Requirement 14: Reports and Dashboard

**User Story:** As a Manager, I want comprehensive reports and a dashboard with key performance indicators, so that I can monitor business health, track collections, and make informed decisions.

#### Acceptance Criteria

1. THE LMS SHALL provide a Dashboard displaying KPIs: total active loans count and value, total outstanding amount, today's collection target and actual, overdue portfolio summary by bucket, disbursements this month, and collection efficiency percentage.
2. THE LMS SHALL support the following report types with date range filters and pagination:
   - Daily Collection Report (by officer, by area)
   - Overdue Report (by bucket, by officer, by area)
   - Disbursement Report (by date range, by product)
   - Loan Portfolio Report (by status, by product, by officer)
   - Customer Report (by risk level, by area)
   - Repayment Schedule Report (per loan)
   - Receipt Register (by date range, by officer)
   - Cash Handover Report (by officer, by date)
   - Expense Report (by category, by date range)
   - Income Report (by source, by date range)
   - Trial Balance Report
   - Profit & Loss Report (by date range)
   - Balance Sheet Report (as of date)
   - Group Loan Summary Report
   - Group Collection Report
   - Penalty Report (by loan, by date range)
   - Foreclosure Report (by date range)
   - Audit Trail Report (by entity, by actor, by date range)
   - DPD Aging Report
   - Officer Performance Report
3. WHEN a user generates a report, THE LMS SHALL enforce RBAC: Field Officers see only their assigned data, Collection Officers see only their assigned routes, Managers see branch-level data, and Super_Admin sees all data.
4. THE LMS SHALL support exporting reports in PDF, Excel (XLSX), and CSV formats.
5. WHEN a report is generated, THE LMS SHALL apply rate limiting: maximum 5 report generation requests per minute per user.
6. THE LMS SHALL ensure all monetary totals in reports reconcile with the underlying ledger data. Report totals SHALL be derived from the same source of truth as the ledger.

### Requirement 15: Role-Based Access Control

**User Story:** As a Super Admin, I want to manage user accounts with granular role-based permissions, so that every user has access only to the functions and data appropriate to their role.

#### Acceptance Criteria

1. THE LMS SHALL enforce seven roles: super_admin, manager, field_officer, collection_officer, accountant, office_staff, and viewer_auditor.
2. THE LMS SHALL enforce permissions at the API level using NestJS guards and at the route level using Next.js middleware. Frontend SHALL hide unauthorized UI elements but SHALL NOT rely on client-side enforcement alone.
3. THE LMS SHALL enforce the following permission matrix:
   - super_admin: full access to all modules and actions
   - manager: create/read/update customers, approve/reject/disburse loans, read/reverse collections, read accounting, read/export reports, manage users (except super_admin)
   - field_officer: create/read/update own assigned customers, create/submit loan applications, read own loans
   - collection_officer: read assigned loans, create collections for assigned loans, generate receipts, record cash handovers
   - accountant: read all finance data, create/read expenses, manage cashbook, read/export reports, read ledger
   - office_staff: create/read/update customers, upload documents, read loans, data entry
   - viewer_auditor: read-only access to all data including audit logs
4. WHEN an unauthorized user attempts an action, THE LMS SHALL return HTTP 403 with a typed error code and log the attempt in the Audit_Log.
5. WHEN an unauthenticated request is received, THE LMS SHALL return HTTP 401 with a typed error code.
6. THE LMS SHALL enforce scope restrictions: Field Officers access only their assigned Customers, Collection Officers access only their assigned loan routes/areas. Manager override is required for cross-scope access.
7. THE LMS SHALL require super_admin or manager role for user creation and role assignment.
8. THE LMS SHALL prevent a user from escalating their own role or granting permissions beyond their own level.

### Requirement 16: Authentication and Session Management

**User Story:** As a user, I want secure login with session management, so that my account is protected and sessions are managed safely.

#### Acceptance Criteria

1. THE LMS SHALL authenticate users via username/password with JWT access tokens (15-minute expiry) and refresh tokens (httpOnly secure cookie, 7-day expiry, rotated on use).
2. THE LMS SHALL hash passwords using bcrypt with a cost factor of 12 or higher.
3. THE LMS SHALL enforce password requirements: minimum 8 characters, at least one uppercase letter, one lowercase letter, and one digit.
4. WHEN a user fails login 5 times consecutively, THE LMS SHALL lock the account for 15 minutes and log the lockout event.
5. WHEN a user changes their password, THE LMS SHALL invalidate all existing sessions for that user.
6. WHEN a user logs out, THE LMS SHALL invalidate the refresh token.
7. THE LMS SHALL propagate a unique request_id on every API request for correlation in logs and error responses.

### Requirement 17: Audit Logging

**User Story:** As an Auditor, I want a complete, immutable audit trail of all finance-affecting and security-relevant actions, so that every mutation can be traced to a specific user and timestamp.

#### Acceptance Criteria

1. THE LMS SHALL create an Audit_Log entry for every finance-affecting action: disbursement, collection, reversal, penalty posting, foreclosure, closure, expense recording, and any ledger mutation.
2. THE LMS SHALL create an Audit_Log entry for every security-relevant action: login, logout, failed login, role change, permission change, customer blacklisting, and unauthorized access attempts.
3. EACH Audit_Log entry SHALL include: action_type, actor_id, actor_role, target_entity, target_id, timestamp (UTC), ip_address, request_id, before_state (for updates), after_state (for updates), and optional remarks.
4. THE LMS SHALL enforce that Audit_Log entries are append-only. No Audit_Log entry SHALL be modified or deleted.
5. THE LMS SHALL support querying Audit_Log entries by: entity type, entity ID, actor, action type, and date range, with pagination.
6. FOR ALL finance-affecting actions, THE LMS SHALL ensure that an Audit_Log entry exists. A finance action without a corresponding Audit_Log entry is a system integrity violation (Audit Completeness invariant).


### Requirement 18: SMS Notification System

**User Story:** As a Manager, I want the system to send SMS notifications for key events using an async outbox pattern, so that customers are informed without risking finance transaction integrity.

#### Acceptance Criteria

1. THE LMS SHALL support SMS notifications for events: loan approval, loan rejection, disbursement, collection receipt, EMI reminder (configurable days before due), overdue reminder, penalty notice, and daily collection summary for officers.
2. THE LMS SHALL use an async outbox pattern: finance transactions enqueue notification messages to an Outbox table within the same database transaction, and a separate background processor dispatches SMS messages from the Outbox.
3. THE LMS SHALL implement a pluggable SMS provider abstraction (interface-based), allowing provider replacement without code changes to the core notification logic.
4. IF an SMS dispatch fails, THEN THE LMS SHALL retry up to 3 times with exponential backoff, then move the message to a dead-letter state for manual review. SMS failure SHALL NOT affect the validity of the originating finance transaction.
5. THE LMS SHALL support template-based SMS messages with variable substitution (customer name, amount, loan reference, due date).
6. THE LMS SHALL log all SMS dispatch attempts (success and failure) with message reference, provider response, and timestamp.
7. THE LMS SHALL enforce rate limiting on SMS dispatch according to provider configuration.

### Requirement 19: Receipt Generation and Management

**User Story:** As a Collection Officer, I want to generate printable receipts for every collection, so that customers have proof of payment and AS Finance has an auditable record.

#### Acceptance Criteria

1. WHEN a Collection is successfully posted, THE LMS SHALL generate a Receipt with: unique sequential receipt number, customer name, loan reference, payment amount (paise and formatted INR), payment date, payment mode, allocation breakdown (penalty, interest, principal components), remaining outstanding balance, and officer name.
2. THE LMS SHALL ensure Receipt numbers are unique and sequential within a configurable scope (branch or system-wide).
3. THE LMS SHALL ensure Receipts are immutable after generation. No modification or deletion of Receipt content is permitted.
4. WHEN a Collection is reversed, THE LMS SHALL mark the original Receipt as reversed and generate a compensating Receipt referencing the original.
5. THE LMS SHALL support printing Receipts in a format suitable for thermal printers and A4 paper.
6. THE LMS SHALL prevent concurrent requests from generating duplicate Receipt numbers, using database-level sequencing or locking.

### Requirement 20: Data Integrity and Concurrency Safety

**User Story:** As a system operator, I want the system to prevent data corruption from concurrent operations, duplicate submissions, and race conditions, so that financial data remains consistent under all operational conditions.

#### Acceptance Criteria

1. THE LMS SHALL use Idempotency_Keys for all finance-affecting write operations (collection, disbursement, reversal, penalty posting). Duplicate requests with the same Idempotency_Key SHALL return the original result without creating duplicate effects.
2. THE LMS SHALL use optimistic locking (version field) on loan and installment records to detect and reject stale concurrent updates with a typed conflict error.
3. WHEN concurrent collection postings target the same loan, THE LMS SHALL serialize the operations using database-level locking within the transaction to prevent double-allocation or balance drift.
4. THE LMS SHALL use database-level constraints (unique indexes) to prevent duplicate receipt numbers, duplicate penalty postings for the same period, and duplicate idempotency keys.
5. IF a concurrent conflict is detected (optimistic lock failure or unique constraint violation), THEN THE LMS SHALL return a typed conflict error with guidance for the user to retry.
6. FOR ALL finance operations, THE LMS SHALL ensure atomicity: either all steps complete successfully or none persist. No partial state is acceptable.

### Requirement 21: Money Representation and Calculation Safety

**User Story:** As a developer, I want all money values to be stored and calculated safely, so that no rounding errors, floating-point artifacts, or silent precision loss can corrupt financial data.

#### Acceptance Criteria

1. THE LMS SHALL store all money values as integer paise (Int or BigInt in the database). No Float or Decimal database types SHALL be used for money fields.
2. THE LMS SHALL use Decimal.js for all intermediate money arithmetic. JavaScript native number type SHALL NOT be used for money calculations.
3. THE LMS SHALL apply ROUND_HALF_UP rounding at each documented calculation boundary and round to the nearest paisa (integer).
4. THE LMS SHALL transmit all money values as integer paise in API request and response payloads. Conversion to display format (INR with Indian comma grouping) SHALL occur only at the presentation layer.
5. THE LMS SHALL document the rounding point and rounding mode in code comments for every money calculation function.
6. FOR ALL money calculations, THE LMS SHALL ensure that input paise values processed through a calculation and then verified against the expected output produce consistent results across repeated invocations (determinism property).


### Requirement 22: Security Hardening

**User Story:** As a Super Admin, I want the system to be protected against common web vulnerabilities, so that customer data and financial records are secure.

#### Acceptance Criteria

1. THE LMS SHALL use Prisma parameterized queries for all database access. Raw SQL queries SHALL use parameterization and SHALL NOT interpolate user input.
2. THE LMS SHALL set Content Security Policy (CSP) headers and rely on React's default output escaping to prevent XSS attacks.
3. THE LMS SHALL use SameSite cookie attributes on all cookies and implement CSRF protection for state-changing requests.
4. THE LMS SHALL validate all file uploads server-side for MIME type, file size, and common attack patterns (embedded scripts). Files SHALL be stored with randomized filenames.
5. THE LMS SHALL enforce rate limiting: 10 requests per minute per IP on auth endpoints, 100 requests per minute per authenticated user on API endpoints, 20 uploads per minute per user, and 5 report generations per minute per user.
6. THE LMS SHALL return typed error codes with safe user-friendly messages. Stack traces, SQL queries, and internal paths SHALL NOT be exposed in API responses.
7. THE LMS SHALL include a correlation request_id in all error responses for support reference.
8. THE LMS SHALL enforce maximum page size (100 items) on all paginated endpoints to prevent resource exhaustion.
9. THE LMS SHALL use UUIDs for all external-facing entity identifiers to prevent enumeration attacks.

### Requirement 23: Frontend User Experience

**User Story:** As a Collection Officer working in the field on a mobile device, I want a simple, responsive, and reliable interface, so that I can perform collections and generate receipts efficiently even with limited connectivity.

#### Acceptance Criteria

1. THE LMS SHALL implement a mobile-first responsive design using Tailwind CSS, with large touch-friendly buttons (minimum 44×44px touch targets) for field-use workflows.
2. THE LMS SHALL display explicit success or failure messages for all finance-affecting actions. No ambiguous loading states or silent failures are permitted.
3. WHEN a user initiates a finance-affecting action (collection, disbursement, reversal), THE LMS SHALL display a confirmation dialog before submission.
4. THE LMS SHALL NOT use optimistic UI updates for finance mutations. All finance-affecting UI updates SHALL wait for authoritative server response before reflecting changes.
5. THE LMS SHALL display loading indicators for all remote API calls.
6. THE LMS SHALL display status badges (active, overdue, closed, defaulted) and overdue highlighting (color-coded by DPD bucket) on loan list and detail views.
7. THE LMS SHALL support keyboard-friendly form navigation for office/desktop workflows.
8. THE LMS SHALL support printable receipt views optimized for thermal printers and A4 paper.
9. WHEN a form submission fails due to validation errors, THE LMS SHALL display field-level error messages and preserve the user's input.

### Requirement 24: Environment and Infrastructure

**User Story:** As a developer, I want a well-configured development environment with Docker, database migrations, and environment validation, so that the system is reproducible and deployable.

#### Acceptance Criteria

1. THE LMS SHALL provide a docker-compose configuration with PostgreSQL and MinIO (S3-compatible) containers for local development.
2. THE LMS SHALL validate all required environment variables at startup and fail fast with descriptive errors if any are missing.
3. THE LMS SHALL manage all database schema changes via Prisma migrations. Each migration SHALL be reversible or have a documented rollback strategy.
4. THE LMS SHALL provide a seed script for development and testing with realistic sample data covering all entity types.
5. THE LMS SHALL generate OpenAPI/Swagger documentation automatically from the NestJS API.
6. THE LMS SHALL use structured JSON logging (pino or winston) with request_id propagation and automatic PII redaction.
7. THE LMS SHALL provide health check endpoints for readiness and liveness probes.

### Requirement 25: Financial Invariants and Correctness Properties

**User Story:** As a developer and auditor, I want the system to enforce and verify a set of non-negotiable financial invariants, so that the system's financial integrity can be proven through automated testing.

#### Acceptance Criteria

1. FOR ALL valid Schedules, THE LMS SHALL ensure: sum of all installment principal components = loan principal amount, and sum of all installment interest components = total calculated interest, with rounding difference confined to the last installment (Schedule Reconciliation invariant).
2. FOR ALL valid payment sequences on a loan, THE LMS SHALL ensure: outstanding_balance = total_payable − sum_of_valid_allocated_payments. Outstanding SHALL NOT silently drift (Outstanding Accuracy invariant).
3. FOR ALL valid Reversals, THE LMS SHALL ensure: the net ledger effect of the original posting plus the reversal equals zero (Reversal Neutrality invariant).
4. FOR ALL valid Collections, THE LMS SHALL ensure: sum of allocation components (penalty + interest + principal) = collection amount (Allocation Preservation invariant).
5. FOR ALL posted Journal_Entries, THE LMS SHALL ensure: total debits = total credits (Journal Balance invariant).
6. FOR ALL finance-affecting actions, THE LMS SHALL ensure: a corresponding Audit_Log entry exists (Audit Completeness invariant).
7. FOR ALL Receipts, THE LMS SHALL ensure: receipt content is immutable after generation. Any read of a Receipt SHALL return the same content as the original generation (Receipt Immutability invariant).
8. FOR ALL loan states, THE LMS SHALL ensure: outstanding balance is non-negative, unless a documented credit balance model is in effect (Non-Negative Outstanding invariant).
9. FOR ALL idempotent operations, THE LMS SHALL ensure: processing the same Idempotency_Key twice produces the same result and does not create duplicate effects (Idempotency invariant). Mathematically: f(x) = f(f(x)).
10. FOR ALL Schedule generation inputs, THE LMS SHALL ensure: identical inputs produce identical outputs across invocations (Determinism invariant).
11. FOR ALL daily cash reconciliations, THE LMS SHALL ensure: opening_balance + cash_inflows − cash_outflows = closing_balance (Cash Reconciliation invariant).
12. FOR ALL Loan_Product configurations, THE LMS SHALL ensure: generated schedules conform to the product's interest type, rate, and tenure parameters (Model Conformance property).
