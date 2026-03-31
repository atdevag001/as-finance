# Requirements Document — Deep Testing & Bugfix

## Introduction

This specification defines comprehensive testing requirements and permanent bugfix standards for the AS Finance Loan Management System. The system is a fullstack application (NestJS backend + Next.js frontend + PostgreSQL) serving a lending company in India. Every backend module, frontend page, shared package, and cross-cutting concern must be covered by unit tests, property-based tests, integration tests, API contract tests, security tests, concurrency tests, and negative tests. Any bugs discovered during testing must be permanently fixed with regression tests that prevent recurrence.

## Glossary

- **LMS**: The AS Finance Loan Management System (backend API + frontend web app)
- **Backend**: The NestJS API application at `apps/api/`
- **Frontend**: The Next.js web application at `apps/web/`
- **Allocation_Engine**: The pure function `allocate()` in `collection/allocation-engine.ts` that distributes payments across penalty, interest, and principal components
- **Schedule_Generator**: The pure functions `generateFlatSchedule()` and `generateReducingBalanceSchedule()` in `schedule/schedule.service.ts`
- **RBAC_Guard**: The NestJS guard at `common/guards/rbac.guard.ts` that enforces role-based access using the PERMISSIONS matrix
- **JWT_Guard**: The NestJS guard at `common/guards/jwt-auth.guard.ts` that validates JWT access tokens
- **Idempotency_Service**: The service at `idempotency/idempotency.service.ts` that prevents duplicate finance operations
- **Paise**: Integer representation of Indian currency (1 INR = 100 paise), used for all money storage and transport
- **DPD**: Days Past Due — calendar days since the earliest unpaid installment due date
- **EMI**: Equated Monthly Installment — the periodic repayment amount
- **PBT**: Property-Based Test using fast-check library with Vitest
- **Overdue_Bucket**: Classification of overdue severity: 0, 1-30, 31-60, 61-90, 90+ DPD
- **Journal_Entry**: A double-entry accounting record where total debits equal total credits
- **Foreclosure_Quote**: A time-limited settlement calculation that expires after 24 hours
- **Test_Suite**: The complete collection of automated tests across all categories
- **Regression_Test**: A test written specifically to prevent recurrence of a discovered bug
- **Permission_Matrix**: The PERMISSIONS constant in `packages/shared/src/constants/permissions.ts` mapping `module.action` to allowed UserRole arrays
- **Compensating_Entry**: A new record that offsets an original record (used for reversals), never modifying or deleting the original

## Requirements

### Requirement 1: Schedule Generation Unit Tests

**User Story:** As a developer, I want every schedule generation function to have comprehensive unit tests, so that EMI calculations are provably correct for all interest types and frequencies.

#### Acceptance Criteria

1. THE Test_Suite SHALL include unit tests for `generateFlatSchedule()` covering monthly, weekly, and daily frequencies with known expected outputs
2. THE Test_Suite SHALL include unit tests for `generateReducingBalanceSchedule()` covering monthly, weekly, and daily frequencies with known expected outputs
3. THE Test_Suite SHALL include unit tests for `deriveInstallmentCount()` verifying correct installment counts for each Frequency enum value
4. THE Test_Suite SHALL include unit tests for `derivePeriodicRate()` verifying correct rate derivation for each Frequency enum value
5. THE Test_Suite SHALL include unit tests for `generateDueDates()` verifying correct date spacing and holiday adjustment logic
6. THE Test_Suite SHALL include unit tests for `normalizeZero()` verifying that negative zero is converted to positive zero
7. WHEN a schedule is generated with any valid input combination, THE Schedule_Generator SHALL produce installments whose principal + interest components sum to the total payable amount within 1 paisa tolerance
8. THE Test_Suite SHALL include edge case tests for: zero tenure, single installment, maximum tenure (360 months), minimum principal (100 paise), maximum principal (10 billion paise), zero interest rate, and maximum interest rate (10000 bps)

### Requirement 2: Schedule Generation Property-Based Tests

**User Story:** As a developer, I want property-based tests for schedule generation, so that financial invariants hold for all valid random inputs.

#### Acceptance Criteria

1. THE Test_Suite SHALL include a PBT verifying that for all valid ScheduleParams, the sum of all installment principal components equals the loan principal amount (schedule reconciliation invariant)
2. THE Test_Suite SHALL include a PBT verifying that for all valid ScheduleParams, the sum of all installment interest components equals the total interest amount
3. THE Test_Suite SHALL include a PBT verifying that for all valid ScheduleParams, the sum of all installment total components equals the total payable amount
4. THE Test_Suite SHALL include a PBT verifying that for all valid ScheduleParams, the rounding difference is absorbed exclusively by the last installment
5. THE Test_Suite SHALL include a PBT verifying schedule determinism: the same ScheduleParams always produce the identical installment array
6. THE Test_Suite SHALL include a PBT verifying that all installment amounts are non-negative integers (no fractional paise, no negative values)
7. THE Test_Suite SHALL include a PBT verifying that due dates are strictly monotonically increasing
8. THE Test_Suite SHALL include a PBT verifying that the number of installments matches `deriveInstallmentCount()` output
9. WHEN running schedule PBTs, THE Test_Suite SHALL execute a minimum of 1000 examples per property

### Requirement 3: Allocation Engine Unit Tests

**User Story:** As a developer, I want comprehensive unit tests for the payment allocation engine, so that every payment is correctly distributed across penalty, interest, and principal.

#### Acceptance Criteria

1. THE Test_Suite SHALL include unit tests for `allocate()` verifying the default allocation order: penalty → interest → principal
2. THE Test_Suite SHALL include unit tests verifying that penalties are allocated oldest-first
3. THE Test_Suite SHALL include unit tests verifying that interest is allocated by installment due date (oldest first)
4. THE Test_Suite SHALL include unit tests verifying that principal is allocated by installment due date (oldest first)
5. THE Test_Suite SHALL include unit tests for partial payment scenarios where the amount covers only penalties
6. THE Test_Suite SHALL include unit tests for partial payment scenarios where the amount covers penalties and partial interest
7. THE Test_Suite SHALL include unit tests for exact full payment scenarios
8. THE Test_Suite SHALL include unit tests for overpayment scenarios verifying correct excess amount calculation
9. THE Test_Suite SHALL include unit tests for advance payment scenarios (paying future installments after clearing current/overdue)
10. THE Test_Suite SHALL include unit tests for zero amount input verifying empty allocation result
11. THE Test_Suite SHALL include unit tests verifying that negative amount input throws an error
12. THE Test_Suite SHALL include unit tests for custom allocation order (e.g., interest → principal → penalty)
13. THE Test_Suite SHALL include unit tests for scenarios with no pending penalties
14. THE Test_Suite SHALL include unit tests for scenarios with no outstanding interest
15. THE Test_Suite SHALL include unit tests for scenarios with fully paid installments mixed with unpaid ones

### Requirement 4: Allocation Engine Property-Based Tests

**User Story:** As a developer, I want property-based tests for the allocation engine, so that money conservation and allocation order invariants hold for all valid inputs.

#### Acceptance Criteria

1. THE Test_Suite SHALL include a PBT verifying that for all valid AllocationParams, totalPenaltyAllocated + totalInterestAllocated + totalPrincipalAllocated + excessAmount equals the input amountPaise (money conservation)
2. THE Test_Suite SHALL include a PBT verifying that no individual allocation line exceeds the outstanding amount for its target component
3. THE Test_Suite SHALL include a PBT verifying that all allocation amounts are non-negative integers
4. THE Test_Suite SHALL include a PBT verifying that the allocation order respects the configured allocationOrder parameter
5. THE Test_Suite SHALL include a PBT verifying that the outstanding balance after allocation is non-negative for every installment component
6. WHEN running allocation PBTs, THE Test_Suite SHALL execute a minimum of 1000 examples per property

### Requirement 5: Collection Service Unit Tests

**User Story:** As a developer, I want unit tests for every CollectionService method, so that payment posting, validation, and journal entry creation are verified.

#### Acceptance Criteria

1. THE Test_Suite SHALL include unit tests for `postCollection()` verifying successful payment posting with correct journal entries
2. THE Test_Suite SHALL include unit tests for `validateLoanStatus()` verifying that collections are rejected for loans not in active or overdue status
3. THE Test_Suite SHALL include unit tests for `computeOutstanding()` verifying correct outstanding calculation from schedule and allocations
4. THE Test_Suite SHALL include unit tests for `buildJournalLines()` verifying correct debit/credit entries for each allocation component
5. THE Test_Suite SHALL include unit tests for `buildAllocationRecords()` verifying correct Prisma create data from allocation results
6. THE Test_Suite SHALL include unit tests for `updateInstallments()` verifying correct schedule update after payment
7. THE Test_Suite SHALL include unit tests for `computeDpdAndBucket()` verifying correct DPD and overdue bucket classification
8. WHEN a collection is posted for a loan not in active or overdue status, THE LMS SHALL reject the operation with a BusinessRuleError
9. WHEN a collection amount exceeds the total outstanding, THE LMS SHALL handle the excess correctly per allocation engine rules

### Requirement 6: Collection Integration Tests

**User Story:** As a developer, I want integration tests for the complete collection flow, so that payment posting works end-to-end with real database transactions.

#### Acceptance Criteria

1. THE Test_Suite SHALL include an integration test for posting a full EMI payment on an active loan and verifying: collection record created, allocations created, schedule installment updated to paid, journal entry balanced, receipt generated, outstanding updated
2. THE Test_Suite SHALL include an integration test for posting a partial payment and verifying correct allocation across components
3. THE Test_Suite SHALL include an integration test for posting multiple sequential payments on the same loan
4. THE Test_Suite SHALL include an integration test verifying that collection posting is atomic: if any step fails, no partial state remains in the database
5. THE Test_Suite SHALL include an integration test verifying idempotency: duplicate collection with same idempotency key returns cached result without creating duplicate records
6. THE Test_Suite SHALL include an integration test for posting a payment on an overdue loan with pending penalties

### Requirement 7: Reversal Service Unit Tests

**User Story:** As a developer, I want unit tests for every ReversalService method, so that compensating entries correctly neutralize original postings.

#### Acceptance Criteria

1. THE Test_Suite SHALL include unit tests for `reverseCollection()` verifying that a compensating collection record is created with is_reversal=true
2. THE Test_Suite SHALL include unit tests for `getOriginalCollection()` verifying correct retrieval and validation of the original collection
3. THE Test_Suite SHALL include unit tests for `getOriginalAllocations()` verifying correct retrieval of allocation records
4. THE Test_Suite SHALL include unit tests for `getOriginalJournalEntry()` verifying correct retrieval of journal entry with lines
5. THE Test_Suite SHALL include unit tests for `restoreInstallments()` verifying that schedule installments are restored to pre-collection state
6. THE Test_Suite SHALL include unit tests verifying that reversing an already-reversed collection throws a BusinessRuleError
7. THE Test_Suite SHALL include unit tests verifying that reversal requires a mandatory reason/remarks field
8. THE Test_Suite SHALL include unit tests for `computeDpdAndBucket()` verifying DPD recalculation after reversal

### Requirement 8: Reversal Property-Based Tests

**User Story:** As a developer, I want property-based tests for reversal logic, so that reversal neutrality holds for all valid collection+reversal pairs.

#### Acceptance Criteria

1. THE Test_Suite SHALL include a PBT verifying that for any valid collection, the reversal journal entry is the exact mirror (debits become credits, credits become debits) of the original journal entry
2. THE Test_Suite SHALL include a PBT verifying that the net ledger effect of original collection + reversal equals zero for every account
3. THE Test_Suite SHALL include a PBT verifying that after reversal, each installment's paid amounts return to their pre-collection values
4. WHEN running reversal PBTs, THE Test_Suite SHALL execute a minimum of 1000 examples per property

### Requirement 9: Reversal Integration Tests

**User Story:** As a developer, I want integration tests for the complete reversal flow, so that compensating entries work correctly with real database transactions.

#### Acceptance Criteria

1. THE Test_Suite SHALL include an integration test for reversing a posted collection and verifying: compensating collection created, reverse allocations created, installments restored, compensating journal entry balanced, original receipt marked as reversed, compensating receipt created, audit log entry created
2. THE Test_Suite SHALL include an integration test verifying that reversal is atomic: if any step fails, no partial state remains
3. THE Test_Suite SHALL include an integration test verifying that a reversed collection cannot be reversed again
4. THE Test_Suite SHALL include an integration test verifying that reversal of a reversal is not supported (prevents infinite chains)


### Requirement 10: Penalty Service Unit Tests

**User Story:** As a developer, I want unit tests for every PenaltyService method, so that DPD calculation, penalty posting, and waiver logic are verified.

#### Acceptance Criteria

1. THE Test_Suite SHALL include unit tests for `calculateDpd()` verifying correct DPD computation from installment due dates and current date
2. THE Test_Suite SHALL include unit tests for `classifyOverdueBucket()` verifying correct bucket assignment for DPD values: 0, 1, 30, 31, 60, 61, 90, 91, 365
3. THE Test_Suite SHALL include unit tests for `calculatePenaltyAmount()` verifying flat_per_period and percentage_of_overdue penalty types
4. THE Test_Suite SHALL include unit tests for `calculateAndPost()` verifying atomic penalty posting with journal entry
5. THE Test_Suite SHALL include unit tests for `waivePenalty()` verifying that waiver requires authorized role and mandatory reason
6. THE Test_Suite SHALL include unit tests for `handleStatusTransition()` verifying loan status transitions to overdue/active based on DPD
7. THE Test_Suite SHALL include unit tests for `getLoanDpdInfo()` verifying correct aggregation of DPD information
8. WHEN a penalty is calculated for an installment within the grace period, THE LMS SHALL not post a penalty
9. WHEN a penalty has already been posted for the same installment and period, THE LMS SHALL reject the duplicate with a ConflictError

### Requirement 11: Penalty Property-Based Tests

**User Story:** As a developer, I want property-based tests for penalty calculations, so that DPD and penalty amount invariants hold for all valid inputs.

#### Acceptance Criteria

1. THE Test_Suite SHALL include a PBT verifying that DPD is always non-negative for any due date and reference date combination
2. THE Test_Suite SHALL include a PBT verifying that overdue bucket classification is monotonically non-decreasing with increasing DPD
3. THE Test_Suite SHALL include a PBT verifying that flat penalty amount is always a positive integer for valid configuration
4. THE Test_Suite SHALL include a PBT verifying that percentage-based penalty amount is proportional to the overdue amount and always a non-negative integer
5. WHEN running penalty PBTs, THE Test_Suite SHALL execute a minimum of 100 examples per property

### Requirement 12: Foreclosure Service Unit Tests

**User Story:** As a developer, I want unit tests for every ForeclosureService method, so that settlement quotes and execution are verified.

#### Acceptance Criteria

1. THE Test_Suite SHALL include unit tests for `calculateForeclosureSettlement()` verifying correct settlement amount: outstanding_principal + accrued_interest + pending_penalties - rebate
2. THE Test_Suite SHALL include unit tests for `calculateFlatAccruedInterest()` verifying pro-rata interest calculation for flat interest loans
3. THE Test_Suite SHALL include unit tests for `calculateReducingBalanceAccruedInterest()` verifying daily accrual interest calculation
4. THE Test_Suite SHALL include unit tests for `createQuote()` verifying quote creation with 24-hour expiry
5. THE Test_Suite SHALL include unit tests for `executeForeclosure()` verifying atomic settlement execution
6. THE Test_Suite SHALL include unit tests verifying that an expired quote cannot be executed
7. THE Test_Suite SHALL include unit tests verifying that a cancelled or already-settled quote cannot be executed
8. THE Test_Suite SHALL include unit tests for `computeOutstandingPrincipal()` verifying correct principal calculation from schedule
9. THE Test_Suite SHALL include unit tests for `buildSettlementJournalLines()` verifying correct journal entries for foreclosure

### Requirement 13: Foreclosure Integration Tests

**User Story:** As a developer, I want integration tests for the complete foreclosure flow, so that settlement works end-to-end with real database transactions.

#### Acceptance Criteria

1. THE Test_Suite SHALL include an integration test for the full foreclosure flow: create quote → approve → execute settlement → verify loan closed, collection created, journal entries balanced, all installments closed
2. THE Test_Suite SHALL include an integration test verifying that foreclosure execution is atomic
3. THE Test_Suite SHALL include an integration test verifying that an expired quote (>24 hours) is rejected on execution
4. THE Test_Suite SHALL include an integration test verifying foreclosure with a rebate amount and rebate authorization

### Requirement 14: Disbursement Service Unit Tests

**User Story:** As a developer, I want unit tests for every DisbursementService method, so that atomic disbursement with all prerequisites is verified.

#### Acceptance Criteria

1. THE Test_Suite SHALL include unit tests for `disburse()` verifying successful disbursement of an approved loan
2. THE Test_Suite SHALL include unit tests verifying that disbursement is rejected when loan status is not approved
3. THE Test_Suite SHALL include unit tests verifying that disbursement is rejected when no schedule exists
4. THE Test_Suite SHALL include unit tests verifying idempotency: duplicate disbursement with same key returns cached result
5. THE Test_Suite SHALL include unit tests verifying that disbursement creates correct journal entries (Debit Loans Receivable, Credit Cash/Bank)
6. THE Test_Suite SHALL include unit tests verifying loan status transitions: approved → disbursed → active
7. THE Test_Suite SHALL include unit tests verifying that disbursement amount matches loan principal

### Requirement 15: Loan Service Unit Tests

**User Story:** As a developer, I want unit tests for every LoanService method, so that the complete loan lifecycle state machine is verified.

#### Acceptance Criteria

1. THE Test_Suite SHALL include unit tests for `validateTransition()` verifying all valid transitions: draft→submitted, submitted→under_review, under_review→approved, under_review→rejected, approved→disbursed, disbursed→active, active→overdue, active→closed, active→foreclosed, active→defaulted, overdue→active, overdue→closed, overdue→foreclosed, overdue→defaulted
2. THE Test_Suite SHALL include unit tests for `validateTransition()` verifying all invalid transitions are rejected (e.g., draft→approved, closed→active, rejected→submitted)
3. THE Test_Suite SHALL include unit tests verifying that loan terms (principal, tenure, product) are immutable after approval
4. THE Test_Suite SHALL include unit tests for loan creation with valid and invalid DTOs
5. THE Test_Suite SHALL include unit tests for loan approval verifying approver role requirements
6. THE Test_Suite SHALL include unit tests for loan rejection with mandatory remarks
7. THE Test_Suite SHALL include unit tests for loan closure verifying all prerequisites (outstanding=0, no pending penalties, no pending reversals)
8. THE Test_Suite SHALL include unit tests verifying that terminal states (rejected, defaulted, foreclosed, closed) have no outgoing transitions

### Requirement 16: Loan Lifecycle Integration Tests

**User Story:** As a developer, I want integration tests for the complete loan lifecycle, so that multi-step flows work end-to-end.

#### Acceptance Criteria

1. THE Test_Suite SHALL include an integration test for the full happy path: create draft → submit → review → approve → disburse → collect all EMIs → close
2. THE Test_Suite SHALL include an integration test for the rejection path: create → submit → review → reject
3. THE Test_Suite SHALL include an integration test for the overdue path: create → approve → disburse → miss payment → verify overdue status and DPD
4. THE Test_Suite SHALL include an integration test verifying that schedule is generated at loan creation and frozen at disbursement
5. THE Test_Suite SHALL include an integration test verifying optimistic locking: concurrent updates to the same loan detect version conflicts

### Requirement 17: Auth Service Unit Tests

**User Story:** As a developer, I want unit tests for every AuthService method, so that login, refresh, logout, and password change are verified.

#### Acceptance Criteria

1. THE Test_Suite SHALL include unit tests for `login()` verifying successful login returns accessToken, refreshToken, and user data
2. THE Test_Suite SHALL include unit tests for `login()` verifying rejection of invalid username
3. THE Test_Suite SHALL include unit tests for `login()` verifying rejection of invalid password
4. THE Test_Suite SHALL include unit tests for `login()` verifying account lockout after 5 failed attempts
5. THE Test_Suite SHALL include unit tests for `login()` verifying that locked accounts are rejected until lockout expires
6. THE Test_Suite SHALL include unit tests for `login()` verifying that inactive users are rejected
7. THE Test_Suite SHALL include unit tests for `refreshToken()` verifying successful token rotation
8. THE Test_Suite SHALL include unit tests for `refreshToken()` verifying rejection of revoked refresh tokens
9. THE Test_Suite SHALL include unit tests for `refreshToken()` verifying rejection of expired refresh tokens
10. THE Test_Suite SHALL include unit tests for `logout()` verifying all refresh tokens are revoked
11. THE Test_Suite SHALL include unit tests for `changePassword()` verifying successful password change with session invalidation
12. THE Test_Suite SHALL include unit tests for `changePassword()` verifying rejection when current password is incorrect
13. THE Test_Suite SHALL include unit tests verifying that every auth action creates an audit log entry

### Requirement 18: User Service Unit Tests

**User Story:** As a developer, I want unit tests for every UserService method, so that CRUD, role management, and area assignments are verified.

#### Acceptance Criteria

1. THE Test_Suite SHALL include unit tests for user creation with valid data and password hashing
2. THE Test_Suite SHALL include unit tests for user creation rejecting duplicate username, email, and mobile
3. THE Test_Suite SHALL include unit tests for user update with optimistic locking (version check)
4. THE Test_Suite SHALL include unit tests for role change verifying authorization requirements
5. THE Test_Suite SHALL include unit tests for area assignment creation and deactivation
6. THE Test_Suite SHALL include unit tests for user listing with pagination and role filtering
7. THE Test_Suite SHALL include unit tests for user deactivation verifying that deactivated users cannot login

### Requirement 19: Customer Service Unit Tests

**User Story:** As a developer, I want unit tests for every customer-related service method, so that CRUD, blacklist, family members, and guarantors are verified.

#### Acceptance Criteria

1. THE Test_Suite SHALL include unit tests for customer creation with valid KYC data
2. THE Test_Suite SHALL include unit tests for customer creation rejecting invalid Aadhaar format (not 12 digits) and invalid PAN format
3. THE Test_Suite SHALL include unit tests for customer blacklisting with mandatory reason and authorized role
4. THE Test_Suite SHALL include unit tests for customer reinstatement from blacklist
5. THE Test_Suite SHALL include unit tests for family member CRUD operations
6. THE Test_Suite SHALL include unit tests for guarantor CRUD operations
7. THE Test_Suite SHALL include unit tests for customer listing with pagination, status filtering, and area-based scoping
8. WHEN a blacklisted customer is used for a new loan application, THE LMS SHALL reject the loan creation with a BusinessRuleError


### Requirement 20: Loan Product Service Unit Tests

**User Story:** As a developer, I want unit tests for loan product CRUD and versioning, so that product configuration integrity is verified.

#### Acceptance Criteria

1. THE Test_Suite SHALL include unit tests for loan product creation with valid configuration
2. THE Test_Suite SHALL include unit tests for loan product version creation verifying immutability of existing versions
3. THE Test_Suite SHALL include unit tests for loan product deactivation verifying that deactivated products cannot be used for new loans
4. THE Test_Suite SHALL include unit tests verifying that version_number auto-increments correctly
5. THE Test_Suite SHALL include unit tests for product listing with pagination and active/inactive filtering
6. THE Test_Suite SHALL include unit tests verifying validation of product parameters: min/max principal, min/max tenure, annual_rate_bps, processing fee, penalty configuration

### Requirement 21: Accounting Service Unit Tests

**User Story:** As a developer, I want unit tests for every AccountingService method, so that journal entries, trial balance, P&L, and balance sheet are verified.

#### Acceptance Criteria

1. THE Test_Suite SHALL include unit tests for `createJournalEntry()` verifying that total debits equal total credits (balanced entry)
2. THE Test_Suite SHALL include unit tests for `createJournalEntry()` rejecting unbalanced entries
3. THE Test_Suite SHALL include unit tests for `getTrialBalance()` verifying correct aggregation of account balances
4. THE Test_Suite SHALL include unit tests for `getProfitAndLoss()` verifying correct income minus expenses calculation
5. THE Test_Suite SHALL include unit tests for `getBalanceSheet()` verifying assets = liabilities + equity
6. THE Test_Suite SHALL include unit tests for `getDaybook()` verifying correct date-range filtering of journal entries
7. THE Test_Suite SHALL include unit tests for `getChartOfAccounts()` verifying all account categories are returned

### Requirement 22: Accounting Property-Based Tests

**User Story:** As a developer, I want property-based tests for accounting invariants, so that double-entry bookkeeping rules hold for all valid inputs.

#### Acceptance Criteria

1. THE Test_Suite SHALL include a PBT verifying that for any valid journal entry, total debit paise equals total credit paise
2. THE Test_Suite SHALL include a PBT verifying that trial balance total debits equal total credits across all accounts
3. THE Test_Suite SHALL include a PBT verifying that all journal entry amounts are positive integers
4. WHEN running accounting PBTs, THE Test_Suite SHALL execute a minimum of 1000 examples per property

### Requirement 23: Receipt Service Unit Tests

**User Story:** As a developer, I want unit tests for every ReceiptService method, so that receipt generation, immutability, and print formatting are verified.

#### Acceptance Criteria

1. THE Test_Suite SHALL include unit tests for `generateReceipt()` verifying correct receipt creation with sequential receipt number
2. THE Test_Suite SHALL include unit tests for `getReceiptForPrint()` verifying correct print layout structure
3. THE Test_Suite SHALL include unit tests for `markAsReversed()` verifying that only status and compensating_receipt_id are modified
4. THE Test_Suite SHALL include unit tests verifying that no method exists to modify receipt content fields (immutability enforcement)
5. THE Test_Suite SHALL include unit tests for `getReceiptsByLoanId()` verifying pagination
6. THE Test_Suite SHALL include unit tests verifying that reversal receipts have is_reversal=true and reference the original receipt

### Requirement 24: Receipt Property-Based Tests

**User Story:** As a developer, I want property-based tests for receipt invariants, so that receipt amounts always reconcile with collection allocations.

#### Acceptance Criteria

1. THE Test_Suite SHALL include a PBT verifying that for any valid receipt, penalty_component + interest_component + principal_component equals the receipt amount
2. THE Test_Suite SHALL include a PBT verifying that receipt numbers are unique and sequential
3. WHEN running receipt PBTs, THE Test_Suite SHALL execute a minimum of 100 examples per property

### Requirement 25: Cashbook Service Unit Tests

**User Story:** As a developer, I want unit tests for every CashbookService method, so that expenses, handovers, and daily summaries are verified.

#### Acceptance Criteria

1. THE Test_Suite SHALL include unit tests for `createExpense()` verifying expense record creation with correct journal entry
2. THE Test_Suite SHALL include unit tests for `createHandover()` verifying handover record creation
3. THE Test_Suite SHALL include unit tests for `verifyHandover()` verifying verification status transitions and discrepancy handling
4. THE Test_Suite SHALL include unit tests for `getDailySummary()` verifying correct aggregation of collections, disbursements, expenses, and handovers
5. THE Test_Suite SHALL include unit tests for `computeDailySummary()` pure function verifying: opening + inflows - outflows = closing balance
6. THE Test_Suite SHALL include unit tests for `mapCategoryToAccountCode()` verifying correct account code mapping for each expense category

### Requirement 26: Cashbook Property-Based Tests

**User Story:** As a developer, I want property-based tests for cashbook invariants, so that daily summary balances always reconcile.

#### Acceptance Criteria

1. THE Test_Suite SHALL include a PBT verifying that for any valid DailySummaryInput, opening_balance + total_inflows - total_outflows equals closing_balance
2. THE Test_Suite SHALL include a PBT verifying that all summary amounts are non-negative integers
3. WHEN running cashbook PBTs, THE Test_Suite SHALL execute a minimum of 100 examples per property

### Requirement 27: Cashbook Integration Tests

**User Story:** As a developer, I want integration tests for the cashbook flow, so that expense posting and handover verification work end-to-end.

#### Acceptance Criteria

1. THE Test_Suite SHALL include an integration test for creating an expense and verifying: expense record created, journal entry balanced, cash transaction recorded
2. THE Test_Suite SHALL include an integration test for the handover flow: create handover → verify handover → verify status updated
3. THE Test_Suite SHALL include an integration test for daily summary accuracy against known seed data

### Requirement 28: Group Service Unit Tests

**User Story:** As a developer, I want unit tests for every GroupService method, so that group lending with member management is verified.

#### Acceptance Criteria

1. THE Test_Suite SHALL include unit tests for `createGroup()` verifying group creation with leader and meeting day
2. THE Test_Suite SHALL include unit tests for `addMember()` verifying member addition with duplicate prevention
3. THE Test_Suite SHALL include unit tests for `removeMember()` verifying soft removal (left_at set, is_active=false)
4. THE Test_Suite SHALL include unit tests for `postGroupCollection()` verifying that collections are posted for each member's loan
5. THE Test_Suite SHALL include unit tests for `getGroupSummary()` verifying correct aggregation of member loan statuses
6. THE Test_Suite SHALL include unit tests verifying that dissolved groups cannot accept new members or collections

### Requirement 29: Group Collection Integration Tests

**User Story:** As a developer, I want integration tests for group collection, so that batch payment posting works correctly across multiple member loans.

#### Acceptance Criteria

1. THE Test_Suite SHALL include an integration test for posting a group collection and verifying: individual collections created for each member, allocations correct, receipts generated, journal entries balanced
2. THE Test_Suite SHALL include an integration test verifying that group collection is atomic: if any member's collection fails, the entire batch rolls back
3. THE Test_Suite SHALL include an integration test verifying group collection with mixed member statuses (some active, some overdue)

### Requirement 30: Notification Service Unit Tests

**User Story:** As a developer, I want unit tests for the notification outbox service, so that SMS enqueueing, retry logic, and dead-letter handling are verified.

#### Acceptance Criteria

1. THE Test_Suite SHALL include unit tests for outbox message creation within a transaction context
2. THE Test_Suite SHALL include unit tests for `fetchProcessableBatch()` verifying correct selection of pending and retryable messages
3. THE Test_Suite SHALL include unit tests for `markSent()` verifying status transition and processed_at timestamp
4. THE Test_Suite SHALL include unit tests for `markFailed()` verifying exponential backoff calculation (30s, 120s, 480s)
5. THE Test_Suite SHALL include unit tests for `markFailed()` verifying dead_letter transition after max retries
6. THE Test_Suite SHALL include unit tests for `resetForRetry()` verifying status reset to pending
7. THE Test_Suite SHALL include unit tests for template lookup by event type and language

### Requirement 31: Notification Integration Tests

**User Story:** As a developer, I want integration tests verifying that SMS notification failure does not break finance operations.

#### Acceptance Criteria

1. THE Test_Suite SHALL include an integration test verifying that a collection posting succeeds and creates an outbox message even when the SMS provider is unavailable
2. THE Test_Suite SHALL include an integration test verifying that notification enqueueing happens within the same transaction as the finance operation
3. IF the notification service throws an error during enqueueing, THEN THE LMS SHALL still complete the finance operation successfully

### Requirement 32: Report Service Unit Tests

**User Story:** As a developer, I want unit tests for every ReportService method, so that all report types produce correct output.

#### Acceptance Criteria

1. THE Test_Suite SHALL include unit tests for `dailyCollectionReport()` verifying correct aggregation of collections by date
2. THE Test_Suite SHALL include unit tests for `overdueReport()` verifying correct filtering by overdue bucket
3. THE Test_Suite SHALL include unit tests for `disbursementReport()` verifying correct date-range filtering
4. THE Test_Suite SHALL include unit tests for `loanPortfolioReport()` verifying correct status distribution
5. THE Test_Suite SHALL include unit tests for `dpdAgingReport()` verifying correct bucket-wise aggregation
6. THE Test_Suite SHALL include unit tests for `trialBalanceReport()` verifying consistency with AccountingService.getTrialBalance()
7. THE Test_Suite SHALL include unit tests for `profitLossReport()` verifying consistency with AccountingService.getProfitAndLoss()
8. THE Test_Suite SHALL include unit tests for `balanceSheetReport()` verifying consistency with AccountingService.getBalanceSheet()
9. THE Test_Suite SHALL include unit tests for `resolveScope()` verifying correct scope resolution per user role
10. THE Test_Suite SHALL include unit tests for `parseDateRange()` verifying correct date parsing and default range handling

### Requirement 33: Audit Service Unit Tests

**User Story:** As a developer, I want unit tests for the audit service, so that append-only audit logging is verified.

#### Acceptance Criteria

1. THE Test_Suite SHALL include unit tests for audit log creation with all required fields (action_type, actor_id, actor_role, target_entity, target_id, ip_address, request_id)
2. THE Test_Suite SHALL include unit tests for audit log querying with pagination and filtering by action_type, actor_id, target_entity, and date range
3. THE Test_Suite SHALL include unit tests verifying that no update or delete methods exist on the audit service (append-only enforcement)
4. THE Test_Suite SHALL include unit tests verifying that before_state and after_state are captured for update operations

### Requirement 34: Audit Property-Based Tests

**User Story:** As a developer, I want property-based tests for audit log invariants, so that audit completeness is verified.

#### Acceptance Criteria

1. THE Test_Suite SHALL include a PBT verifying that audit logs are append-only: the count of audit logs never decreases after any operation
2. THE Test_Suite SHALL include a PBT verifying that every audit log entry has a valid action_type from the AuditAction enum
3. WHEN running audit PBTs, THE Test_Suite SHALL execute a minimum of 100 examples per property

### Requirement 35: Idempotency Service Unit Tests

**User Story:** As a developer, I want unit tests for the idempotency service, so that duplicate prevention for finance operations is verified.

#### Acceptance Criteria

1. THE Test_Suite SHALL include unit tests for `find()` returning null for non-existent keys and cached result for existing keys
2. THE Test_Suite SHALL include unit tests for `store()` creating a new idempotency record with 24-hour expiry
3. THE Test_Suite SHALL include unit tests for `store()` handling concurrent duplicate by retrying SELECT after unique constraint violation
4. THE Test_Suite SHALL include unit tests for `cleanupExpired()` deleting expired keys and returning count
5. THE Test_Suite SHALL include unit tests verifying that store() uses the provided transaction client when given


### Requirement 36: Idempotency Property-Based Tests

**User Story:** As a developer, I want property-based tests for idempotency invariants, so that duplicate prevention holds for all valid key patterns.

#### Acceptance Criteria

1. THE Test_Suite SHALL include a PBT verifying that for any valid idempotency key, storing the same key twice returns the original cached result (idempotence property: f(x) = f(f(x)))
2. THE Test_Suite SHALL include a PBT verifying that idempotency keys with different operation types are stored independently
3. WHEN running idempotency PBTs, THE Test_Suite SHALL execute a minimum of 100 examples per property

### Requirement 37: RBAC Guard Unit Tests

**User Story:** As a developer, I want unit tests for the RBAC guard, so that permission enforcement is verified for every role and permission combination.

#### Acceptance Criteria

1. THE Test_Suite SHALL include unit tests verifying that the RBAC_Guard allows access when the user's role is in the allowed roles for the requested permission
2. THE Test_Suite SHALL include unit tests verifying that the RBAC_Guard denies access with ForbiddenException when the user's role is not in the allowed roles
3. THE Test_Suite SHALL include unit tests verifying that endpoints without @RequirePermission metadata are open to any authenticated user
4. THE Test_Suite SHALL include unit tests verifying that unknown permission keys result in denial (least privilege)
5. THE Test_Suite SHALL include unit tests verifying that missing user role results in ForbiddenException

### Requirement 38: RBAC Property-Based Tests

**User Story:** As a developer, I want property-based tests for the RBAC permission matrix, so that permission consistency is verified across all roles.

#### Acceptance Criteria

1. THE Test_Suite SHALL include a PBT verifying that for every permission in the PERMISSIONS matrix, at least one role has access (no orphaned permissions)
2. THE Test_Suite SHALL include a PBT verifying that super_admin has access to every permission in the matrix
3. THE Test_Suite SHALL include a PBT verifying that viewer_auditor has only read-level access (no create, update, delete, approve, reject, reverse, disburse permissions)
4. THE Test_Suite SHALL include a PBT verifying that the permission matrix contains no duplicate role entries per permission
5. WHEN running RBAC PBTs, THE Test_Suite SHALL execute a minimum of 100 examples per property

### Requirement 39: RBAC Enforcement Tests per Role × Endpoint

**User Story:** As a developer, I want exhaustive tests for every role against every API endpoint, so that no RBAC gaps exist.

#### Acceptance Criteria

1. THE Test_Suite SHALL include API contract tests verifying that each of the 7 roles (super_admin, manager, field_officer, collection_officer, accountant, office_staff, viewer_auditor) receives the correct HTTP status (200/201 for allowed, 403 for denied) for every protected endpoint
2. THE Test_Suite SHALL include tests verifying that unauthenticated requests to protected endpoints receive 401
3. THE Test_Suite SHALL include tests verifying that viewer_auditor cannot access: customer.create, loan.create, loan.approve, loan.disburse, collection.create, collection.reverse, penalty.calculate, penalty.waive, foreclosure.quote, foreclosure.execute, user.create, settings.update
4. THE Test_Suite SHALL include tests verifying that collection_officer can access: collection.create, collection.read, handover.create, group.collect but cannot access: loan.approve, loan.disburse, collection.reverse, user.create
5. THE Test_Suite SHALL include tests verifying that field_officer can access: customer.create, customer.read, customer.update, loan.create, loan.read, loan.submit, group.create, group.manage_members but cannot access: loan.approve, loan.disburse, collection.reverse, accounting.read
6. THE Test_Suite SHALL include tests verifying that accountant can access: accounting.read, accounting.create_expense, accounting.manage_cashbook, report.read, report.export, handover.verify but cannot access: loan.approve, loan.disburse, customer.create, collection.create

### Requirement 40: API Contract Tests for All Endpoints

**User Story:** As a developer, I want API contract tests for every endpoint, so that request/response shapes, validation, and error formats are verified.

#### Acceptance Criteria

1. THE Test_Suite SHALL include contract tests for all auth endpoints: POST /auth/login, POST /auth/refresh, POST /auth/logout, POST /auth/change-password
2. THE Test_Suite SHALL include contract tests for all user endpoints: GET /users, POST /users, GET /users/:id, PATCH /users/:id, POST /users/:id/area-assignments
3. THE Test_Suite SHALL include contract tests for all customer endpoints: GET /customers, POST /customers, GET /customers/:id, PATCH /customers/:id, POST /customers/:id/blacklist, POST /customers/:id/reinstate, POST /customers/:id/family-members, POST /customers/:id/guarantors
4. THE Test_Suite SHALL include contract tests for all loan endpoints: GET /loans, POST /loans, GET /loans/:id, POST /loans/:id/submit, POST /loans/:id/approve, POST /loans/:id/reject, POST /loans/:id/close
5. THE Test_Suite SHALL include contract tests for all collection endpoints: GET /collections, POST /collections
6. THE Test_Suite SHALL include contract tests for all disbursement endpoints: POST /disbursements
7. THE Test_Suite SHALL include contract tests for all reversal endpoints: POST /reversals
8. THE Test_Suite SHALL include contract tests for all penalty endpoints: GET /penalties/loan/:loanId, POST /penalties/calculate, POST /penalties/:id/waive
9. THE Test_Suite SHALL include contract tests for all foreclosure endpoints: POST /foreclosures/quote, POST /foreclosures/:id/execute, GET /foreclosures/:id
10. THE Test_Suite SHALL include contract tests for all receipt endpoints: GET /receipts/:id, GET /receipts/:id/print, GET /receipts/loan/:loanId
11. THE Test_Suite SHALL include contract tests for all accounting endpoints: GET /accounting/chart-of-accounts, GET /accounting/daybook, GET /accounting/trial-balance, GET /accounting/profit-and-loss, GET /accounting/balance-sheet
12. THE Test_Suite SHALL include contract tests for all cashbook endpoints: GET /cashbook/daily-summary, POST /cashbook/expenses, GET /cashbook/expenses, POST /cashbook/handovers, POST /cashbook/handovers/:id/verify
13. THE Test_Suite SHALL include contract tests for all group endpoints: GET /groups, POST /groups, GET /groups/:id, POST /groups/:id/members, DELETE /groups/:id/members/:memberId, POST /groups/:id/collect
14. THE Test_Suite SHALL include contract tests for all report endpoints: GET /reports, GET /reports/export
15. THE Test_Suite SHALL include contract tests for all audit endpoints: GET /audit-logs
16. THE Test_Suite SHALL include contract tests for all notification endpoints: GET /notifications, POST /notifications/:id/retry
17. THE Test_Suite SHALL include contract tests for all settings endpoints: GET /settings, PATCH /settings
18. WHEN an invalid request body is sent to any endpoint, THE LMS SHALL return a 400 status with a structured error response containing statusCode, message, and error fields
19. WHEN a valid request is sent, THE LMS SHALL return a response matching the documented schema with correct field names and types

### Requirement 41: Frontend-API Field Name Compatibility Tests

**User Story:** As a developer, I want tests verifying that the frontend sends correct field names to the API and correctly parses API responses, so that no camelCase/snake_case mismatches exist.

#### Acceptance Criteria

1. THE Test_Suite SHALL include tests verifying that the login page sends `username` and `password` fields matching the LoginDto
2. THE Test_Suite SHALL include tests verifying that the customer creation form sends field names matching the CreateCustomerDto (snake_case as expected by the API)
3. THE Test_Suite SHALL include tests verifying that the loan creation form sends field names matching the CreateLoanDto
4. THE Test_Suite SHALL include tests verifying that the collection creation form sends field names matching the PostCollectionDto
5. THE Test_Suite SHALL include tests verifying that all frontend list pages correctly parse paginated API responses (data array + total count)
6. THE Test_Suite SHALL include tests verifying that the loan detail page correctly maps API response fields to display components
7. THE Test_Suite SHALL include tests verifying that the accounting page correctly maps journal entry response fields
8. THE Test_Suite SHALL include tests verifying that the cashbook page uses the correct API endpoint path
9. THE Test_Suite SHALL include tests verifying that the notifications page correctly maps outbox message response fields
10. THE Test_Suite SHALL include tests verifying that the reports page correctly maps report response fields
11. THE Test_Suite SHALL include tests verifying that the receipts page correctly maps receipt response fields
12. IF a frontend page sends a field name that does not match the API DTO, THEN THE Test_Suite SHALL flag the mismatch as a failing test and THE LMS SHALL fix the field name permanently

### Requirement 42: Negative Tests — Invalid Inputs

**User Story:** As a developer, I want negative tests for all invalid input scenarios, so that the system rejects bad data with appropriate error messages.

#### Acceptance Criteria

1. THE Test_Suite SHALL include negative tests for invalid Aadhaar number formats (non-12-digit, non-numeric, empty)
2. THE Test_Suite SHALL include negative tests for invalid PAN number formats (not matching [A-Z]{5}[0-9]{4}[A-Z]{1})
3. THE Test_Suite SHALL include negative tests for invalid mobile number formats (non-10-digit, non-numeric)
4. THE Test_Suite SHALL include negative tests for invalid email formats
5. THE Test_Suite SHALL include negative tests for invalid password formats (too short, missing uppercase, missing lowercase, missing digit)
6. THE Test_Suite SHALL include negative tests for invalid loan amounts (zero, negative, below product minimum, above product maximum)
7. THE Test_Suite SHALL include negative tests for invalid tenure (zero, negative, below product minimum, above product maximum)
8. THE Test_Suite SHALL include negative tests for invalid interest rates (negative, zero for reducing balance)
9. THE Test_Suite SHALL include negative tests for invalid dates (future dates where not allowed, malformed ISO strings)
10. THE Test_Suite SHALL include negative tests for invalid UUIDs in path parameters
11. THE Test_Suite SHALL include negative tests for missing required fields in all DTOs
12. THE Test_Suite SHALL include negative tests for extra/unknown fields in request bodies (verify they are ignored or rejected)


### Requirement 43: Negative Tests — State Violations

**User Story:** As a developer, I want negative tests for all invalid state transition attempts, so that the system enforces business rules.

#### Acceptance Criteria

1. THE Test_Suite SHALL include negative tests for disbursement of a non-approved loan (draft, submitted, under_review, rejected, active, closed)
2. THE Test_Suite SHALL include negative tests for collection on a non-active/non-overdue loan (draft, submitted, approved, closed, foreclosed)
3. THE Test_Suite SHALL include negative tests for approval of a loan not in under_review status
4. THE Test_Suite SHALL include negative tests for closing a loan with outstanding balance > 0
5. THE Test_Suite SHALL include negative tests for closing a loan with pending unpaid penalties
6. THE Test_Suite SHALL include negative tests for reversing an already-reversed collection
7. THE Test_Suite SHALL include negative tests for executing an expired foreclosure quote
8. THE Test_Suite SHALL include negative tests for modifying loan terms after approval (principal, tenure, product_version_id)
9. THE Test_Suite SHALL include negative tests for adding members to a dissolved group
10. THE Test_Suite SHALL include negative tests for creating a loan for a blacklisted customer
11. THE Test_Suite SHALL include negative tests for duplicate penalty posting for the same installment and period

### Requirement 44: Negative Tests — Authorization Violations

**User Story:** As a developer, I want negative tests for all unauthorized access attempts, so that RBAC enforcement has no gaps.

#### Acceptance Criteria

1. THE Test_Suite SHALL include negative tests verifying that unauthenticated requests to all protected endpoints return 401
2. THE Test_Suite SHALL include negative tests verifying that expired JWT tokens are rejected with 401
3. THE Test_Suite SHALL include negative tests verifying that tampered JWT tokens are rejected
4. THE Test_Suite SHALL include negative tests verifying IDOR prevention: a field_officer cannot access customers assigned to another officer
5. THE Test_Suite SHALL include negative tests verifying IDOR prevention: a collection_officer cannot post collections for loans outside their assigned area
6. THE Test_Suite SHALL include negative tests verifying that viewer_auditor role cannot perform any write operations
7. THE Test_Suite SHALL include negative tests verifying that the frontend hides unauthorized UI elements (e.g., auditor should not see "New Customer" button)

### Requirement 45: Concurrency Tests

**User Story:** As a developer, I want concurrency tests for all finance-critical operations, so that race conditions and double-submissions are handled safely.

#### Acceptance Criteria

1. THE Test_Suite SHALL include a concurrency test for double-click payment submission verifying that only one collection is created (idempotency key prevents duplicate)
2. THE Test_Suite SHALL include a concurrency test for concurrent collection posting on the same loan verifying that both succeed without data corruption or that one is safely rejected
3. THE Test_Suite SHALL include a concurrency test for concurrent disbursement attempts on the same loan verifying that only one succeeds
4. THE Test_Suite SHALL include a concurrency test for concurrent reversal attempts on the same collection verifying that only one succeeds
5. THE Test_Suite SHALL include a concurrency test for concurrent loan approval attempts verifying optimistic locking prevents stale updates
6. THE Test_Suite SHALL include a concurrency test for receipt number generation under concurrent requests verifying no duplicate receipt numbers
7. THE Test_Suite SHALL include a concurrency test for concurrent penalty posting on the same installment verifying the unique constraint prevents duplicates
8. WHEN two concurrent requests attempt the same finance operation with the same idempotency key, THE LMS SHALL return the same result to both without creating duplicate records

### Requirement 46: Security Tests

**User Story:** As a developer, I want security tests for all attack vectors, so that the system is hardened against common vulnerabilities.

#### Acceptance Criteria

1. THE Test_Suite SHALL include security tests verifying that SQL injection attempts via query parameters and request bodies are neutralized by Prisma parameterization
2. THE Test_Suite SHALL include security tests verifying that auth endpoints are rate-limited (10 requests per minute per IP)
3. THE Test_Suite SHALL include security tests verifying that API endpoints are rate-limited (100 requests per minute per authenticated user)
4. THE Test_Suite SHALL include security tests verifying that error responses never expose stack traces, SQL queries, or internal file paths
5. THE Test_Suite SHALL include security tests verifying that PII (Aadhaar, PAN, mobile) is masked in log output
6. THE Test_Suite SHALL include security tests verifying that JWT secrets are not exposed in any API response
7. THE Test_Suite SHALL include security tests verifying that file upload endpoints reject invalid MIME types and oversized files
8. THE Test_Suite SHALL include security tests verifying that pagination has a maximum page size enforced server-side (100 items)

### Requirement 47: Shared Package Tests

**User Story:** As a developer, I want tests for all shared package utilities, so that validation, masking, and constant integrity are verified.

#### Acceptance Criteria

1. THE Test_Suite SHALL include unit tests for password validation verifying: minimum 8 characters, at least one uppercase, one lowercase, one digit
2. THE Test_Suite SHALL include unit tests for password validation rejecting: too short, missing uppercase, missing lowercase, missing digit, empty string
3. THE Test_Suite SHALL include unit tests for PII masking utility verifying correct Aadhaar masking (XXXX-XXXX-1234), PAN masking (XXXXXX1234), and mobile masking
4. THE Test_Suite SHALL include PBT for password validation verifying that all valid passwords pass and all invalid passwords fail (round-trip property)
5. THE Test_Suite SHALL include PBT for masking utility verifying that masked output never contains the full original value
6. THE Test_Suite SHALL include tests verifying that the PERMISSIONS constant covers all expected module.action combinations
7. THE Test_Suite SHALL include tests verifying that all enum values in the shared package match the Prisma schema enum definitions

### Requirement 48: Global Exception Filter Tests

**User Story:** As a developer, I want tests for the global exception filter, so that all error types are mapped to correct HTTP responses.

#### Acceptance Criteria

1. THE Test_Suite SHALL include unit tests verifying that BusinessRuleError maps to HTTP 422
2. THE Test_Suite SHALL include unit tests verifying that NotFoundError maps to HTTP 404
3. THE Test_Suite SHALL include unit tests verifying that AuthorizationError maps to HTTP 401 or 403
4. THE Test_Suite SHALL include unit tests verifying that ValidationError maps to HTTP 400
5. THE Test_Suite SHALL include unit tests verifying that ConflictError maps to HTTP 409
6. THE Test_Suite SHALL include unit tests verifying that unhandled errors map to HTTP 500 with a safe error message (no stack trace)
7. THE Test_Suite SHALL include unit tests verifying that all error responses include requestId for correlation

### Requirement 49: Request ID Middleware Tests

**User Story:** As a developer, I want tests for the request ID middleware, so that every request has a valid UUID for correlation.

#### Acceptance Criteria

1. THE Test_Suite SHALL include unit tests verifying that the middleware generates a UUID v4 request ID when none is provided in headers
2. THE Test_Suite SHALL include unit tests verifying that the middleware uses the provided x-request-id header when present and valid
3. THE Test_Suite SHALL include unit tests verifying that the middleware rejects invalid (non-UUID) x-request-id values and generates a new one
4. THE Test_Suite SHALL include unit tests verifying that the request ID is available to downstream handlers via the request object

### Requirement 50: End-to-End Critical Business Flow Tests

**User Story:** As a developer, I want end-to-end tests for the critical business flows, so that the complete system works from API request to database state.

#### Acceptance Criteria

1. THE Test_Suite SHALL include an E2E test for the complete onboarding flow: create customer → upload documents → create loan → submit → approve → disburse → verify all database state
2. THE Test_Suite SHALL include an E2E test for the complete collection flow: post collection → verify allocation → verify schedule update → verify receipt → verify journal entry → verify outstanding update
3. THE Test_Suite SHALL include an E2E test for the complete reversal flow: post collection → reverse collection → verify compensating entries → verify schedule restored → verify receipt reversed
4. THE Test_Suite SHALL include an E2E test for the overdue + penalty flow: disburse loan → wait past due date → calculate penalty → post penalty → verify DPD → collect with penalty allocation
5. THE Test_Suite SHALL include an E2E test for the foreclosure flow: create quote → approve → execute → verify loan closed → verify settlement collection → verify journal entries
6. THE Test_Suite SHALL include an E2E test for the group collection flow: create group → add members → post group collection → verify individual collections for each member
7. THE Test_Suite SHALL include an E2E test for the full loan lifecycle: create → submit → approve → disburse → collect all EMIs → close → verify final outstanding = 0

### Requirement 51: Bug Identification and Permanent Fix Requirements

**User Story:** As a developer, I want every discovered bug to be permanently fixed with a regression test, so that no bug recurs.

#### Acceptance Criteria

1. WHEN a test discovers a bug in any module, THE LMS SHALL fix the root cause (not a shallow workaround) and create a permanent regression test
2. THE Test_Suite SHALL include regression tests for all previously fixed bugs: pagination mismatch, field name mismatch, disbursement 500 error, cashbook wrong endpoint, loan detail missing schedule, Next.js params incompatibility
3. WHEN a frontend-API field name mismatch is discovered, THE LMS SHALL fix the field name at the source (frontend form or API DTO) and add a contract test preventing recurrence
4. WHEN an RBAC gap is discovered (e.g., auditor seeing write buttons), THE LMS SHALL fix the frontend role check and add a test verifying the UI element is hidden for unauthorized roles
5. WHEN a financial calculation bug is discovered, THE LMS SHALL fix the calculation, add a unit test with the specific failing input, and add a property-based test covering the invariant class
6. WHEN a concurrency bug is discovered, THE LMS SHALL fix the race condition (via idempotency, optimistic locking, or database constraints) and add a concurrency test reproducing the original scenario
7. WHEN a state transition bug is discovered, THE LMS SHALL fix the transition validation and add tests for both the valid and invalid transition paths
8. THE LMS SHALL maintain a regression test index documenting each bug, its root cause, the fix applied, and the regression test file path

### Requirement 52: Collection Posting End-to-End Verification

**User Story:** As a developer, I want to verify that collection posting works end-to-end since it is currently untested, so that payment posting bugs are found and fixed.

#### Acceptance Criteria

1. THE Test_Suite SHALL include an E2E test that creates a loan, disburses it, posts a collection via the API, and verifies: HTTP 201 response, collection record in database, allocation records matching allocation engine output, schedule installment updated, journal entry balanced, receipt generated with correct components, outstanding updated correctly
2. IF the collection posting E2E test fails, THEN THE LMS SHALL identify the root cause, fix the bug permanently, and add a regression test
3. THE Test_Suite SHALL include an E2E test for partial payment collection verifying correct partial allocation
4. THE Test_Suite SHALL include an E2E test for collection on an overdue loan with penalties verifying penalty-first allocation

### Requirement 53: Untested Flow Verification and Bugfix

**User Story:** As a developer, I want to verify all currently untested flows and fix any bugs found, so that no untested code path reaches production.

#### Acceptance Criteria

1. THE Test_Suite SHALL include verification tests for the reversal flow end-to-end, and IF bugs are found, THEN THE LMS SHALL fix the bugs permanently
2. THE Test_Suite SHALL include verification tests for the penalty calculation flow end-to-end, and IF bugs are found, THEN THE LMS SHALL fix the bugs permanently
3. THE Test_Suite SHALL include verification tests for the foreclosure flow end-to-end, and IF bugs are found, THEN THE LMS SHALL fix the bugs permanently
4. THE Test_Suite SHALL include verification tests for the group collection flow end-to-end, and IF bugs are found, THEN THE LMS SHALL fix the bugs permanently
5. THE Test_Suite SHALL include verification tests for the receipt generation flow end-to-end, and IF bugs are found, THEN THE LMS SHALL fix the bugs permanently
6. THE Test_Suite SHALL include verification tests for all report types, and IF bugs are found, THEN THE LMS SHALL fix the bugs permanently
7. THE Test_Suite SHALL include verification tests for the notification outbox flow, and IF bugs are found, THEN THE LMS SHALL fix the bugs permanently
8. THE Test_Suite SHALL include verification tests for the document upload flow (with MinIO mock), and IF bugs are found, THEN THE LMS SHALL fix the bugs permanently
9. THE Test_Suite SHALL include verification tests for the idempotency key handling end-to-end, and IF bugs are found, THEN THE LMS SHALL fix the bugs permanently

### Requirement 54: Frontend Page Snake_Case Compatibility Verification

**User Story:** As a developer, I want to verify that all remaining frontend pages correctly handle API response field names, so that no snake_case rendering bugs exist.

#### Acceptance Criteria

1. THE Test_Suite SHALL include tests verifying that the notifications page correctly renders outbox message fields from the API response
2. THE Test_Suite SHALL include tests verifying that the reports page correctly renders report data fields from the API response
3. THE Test_Suite SHALL include tests verifying that the receipts page correctly renders receipt fields from the API response
4. THE Test_Suite SHALL include tests verifying that the audit logs page correctly renders audit log fields from the API response
5. THE Test_Suite SHALL include tests verifying that the settings page correctly renders and submits settings fields
6. THE Test_Suite SHALL include tests verifying that the groups page correctly renders group and member fields
7. IF any frontend page displays "undefined" or missing data due to field name mismatch, THEN THE LMS SHALL fix the mapping and add a regression test

### Requirement 55: Edge Case Tests — Boundary Conditions

**User Story:** As a developer, I want edge case tests for all boundary conditions, so that the system handles extreme values correctly.

#### Acceptance Criteria

1. THE Test_Suite SHALL include edge case tests for zero-amount collection (verify rejection or correct handling)
2. THE Test_Suite SHALL include edge case tests for collection amount equal to exactly one paisa
3. THE Test_Suite SHALL include edge case tests for collection amount equal to the exact outstanding balance (full payoff)
4. THE Test_Suite SHALL include edge case tests for maximum safe integer values in money fields (Number.MAX_SAFE_INTEGER paise)
5. THE Test_Suite SHALL include edge case tests for loan with single installment (tenure = 1 month, monthly frequency)
6. THE Test_Suite SHALL include edge case tests for loan with maximum installments (360 months × daily = 10800 installments)
7. THE Test_Suite SHALL include edge case tests for due date falling on a holiday verifying correct shift to next business day
8. THE Test_Suite SHALL include edge case tests for all installments being overdue simultaneously
9. THE Test_Suite SHALL include edge case tests for foreclosure on the first day after disbursement
10. THE Test_Suite SHALL include edge case tests for foreclosure on the last installment due date
11. THE Test_Suite SHALL include edge case tests for penalty calculation with zero grace days
12. THE Test_Suite SHALL include edge case tests for group with single member
13. THE Test_Suite SHALL include edge case tests for empty pagination results (page beyond total count)
14. THE Test_Suite SHALL include edge case tests for concurrent receipt number generation verifying sequence integrity

### Requirement 56: Test Infrastructure and Coverage Requirements

**User Story:** As a developer, I want test infrastructure that supports all test categories with proper isolation and coverage reporting, so that test quality is measurable.

#### Acceptance Criteria

1. THE Test_Suite SHALL use Vitest as the test runner for all unit, property-based, and integration tests
2. THE Test_Suite SHALL use fast-check as the property-based testing library
3. THE Test_Suite SHALL use Supertest for API-level E2E tests
4. THE Test_Suite SHALL provide test factories for every Prisma model entity in `packages/testing/src/factories/`
5. THE Test_Suite SHALL achieve minimum code coverage: 95% for finance calculation functions, 95% for schedule generation, 95% for collection allocation, 90% for reversal logic, 90% for permission guards, 85% for domain services, 80% for API controllers, 70% for repositories
6. THE Test_Suite SHALL reset the test database between integration test suites using transaction rollback or truncation
7. THE Test_Suite SHALL not share mutable state between test files
8. THE Test_Suite SHALL tag regression tests with a `@regression` marker for CI identification


### Requirement 57: Document Service Unit Tests

**User Story:** As a developer, I want unit tests for the document service and its pure helper functions, so that file upload validation, MIME detection, and S3 storage abstraction are verified.

#### Acceptance Criteria

1. THE Test_Suite SHALL include unit tests for `detectMimeType()` verifying correct MIME detection for JPEG (0xFF 0xD8 0xFF), PNG (0x89 0x50 0x4E 0x47), and PDF (0x25 0x50 0x44 0x46) magic byte signatures
2. THE Test_Suite SHALL include unit tests for `detectMimeType()` returning null for unrecognized file buffers (e.g., plain text, empty buffer, truncated headers)
3. THE Test_Suite SHALL include unit tests for `isFileSizeValid()` verifying acceptance of sizes from 1 byte to 5,242,880 bytes (5 MB) and rejection of 0 bytes, negative values, and sizes exceeding 5 MB
4. THE Test_Suite SHALL include unit tests for `containsEmbeddedScripts()` verifying detection of `<script>` tags, `javascript:` URIs, inline event handlers (`onclick=`), server-side template injection (`<%`), and PHP tags (`<?php`)
5. THE Test_Suite SHALL include unit tests for `containsEmbeddedScripts()` returning false for clean JPEG, PNG, and PDF buffers
6. THE Test_Suite SHALL include unit tests for `DocumentService.upload()` verifying successful upload with valid file, correct S3 key generation with randomized filename, and file_metadata record creation
7. THE Test_Suite SHALL include unit tests for `DocumentService.upload()` rejecting invalid MIME type, oversized file, file with embedded scripts, and invalid prefix
8. THE Test_Suite SHALL include unit tests for `DocumentService.getSignedUrl()` verifying signed URL generation for active documents and NotFoundError for inactive or non-existent documents
9. THE Test_Suite SHALL include unit tests for `DocumentService.softDelete()` verifying that is_active is set to false and the file is retained in S3 storage
10. THE Test_Suite SHALL include unit tests for `S3StorageService` methods (upload, getSignedUrl, delete) using mocked S3Client verifying correct PutObjectCommand, GetObjectCommand, and DeleteObjectCommand parameters

### Requirement 58: Settings Service Unit Tests

**User Story:** As a developer, I want unit tests for the settings service, so that holiday calendar management and key-value settings CRUD are verified.

#### Acceptance Criteria

1. THE Test_Suite SHALL include unit tests for `SettingsService.findAll()` verifying delegation to the repository and correct return of all settings
2. THE Test_Suite SHALL include unit tests for `SettingsService.updateByKey()` verifying upsert delegation with correct key, value, actorId, and description parameters
3. THE Test_Suite SHALL include unit tests for `SettingsService.getHolidays()` verifying return of an empty array when no holiday_calendar setting exists
4. THE Test_Suite SHALL include unit tests for `SettingsService.getHolidays()` verifying correct return of stored holiday date strings
5. THE Test_Suite SHALL include unit tests for `SettingsService.setHolidays()` verifying ISO date string validation, rejecting invalid date strings with a ValidationError
6. THE Test_Suite SHALL include unit tests for `SettingsService.setHolidays()` verifying deduplication of duplicate date entries
7. THE Test_Suite SHALL include unit tests for `SettingsService.setHolidays()` verifying chronological sorting of the output array
8. THE Test_Suite SHALL include unit tests for `SettingsService.setHolidays()` verifying correct persistence via repository upsert with the HOLIDAYS_KEY constant
9. WHEN the schedule generator uses holidays from the settings service for due date adjustment, THE Test_Suite SHALL include an integration test verifying that a due date falling on a configured holiday is shifted to the next business day

### Requirement 59: Health Check Endpoint Tests

**User Story:** As a developer, I want tests for the health check endpoints, so that liveness and readiness probes are verified for production deployment reliability.

#### Acceptance Criteria

1. THE Test_Suite SHALL include unit tests for the liveness probe (GET /health/live) verifying HTTP 200 response with `{ status: 'ok' }` body
2. THE Test_Suite SHALL include unit tests for the readiness probe (GET /health/ready) verifying HTTP 200 response with `{ status: 'ok', database: 'connected' }` when the database query succeeds
3. WHEN the database is unreachable, THE HealthController readiness probe SHALL return HTTP 503 with `{ status: 'error', database: 'disconnected' }` body
4. THE Test_Suite SHALL include tests verifying that health endpoints are publicly accessible (no JWT authentication required) via the IS_PUBLIC_KEY metadata
5. THE Test_Suite SHALL include tests verifying that health endpoints are excluded from rate limiting via the @SkipThrottle() decorator

### Requirement 60: Database/Prisma Service Lifecycle Tests

**User Story:** As a developer, I want tests for the PrismaService connection lifecycle, so that startup connection and graceful shutdown are verified.

#### Acceptance Criteria

1. THE Test_Suite SHALL include unit tests for `PrismaService.onModuleInit()` verifying that `$connect()` is called during module initialization
2. THE Test_Suite SHALL include unit tests for `PrismaService.onModuleDestroy()` verifying that `$disconnect()` is called during module teardown
3. IF `$connect()` fails during module initialization, THEN THE PrismaService SHALL propagate the error to the NestJS bootstrap process causing a startup failure
4. THE Test_Suite SHALL include tests verifying that the PrismaService extends PrismaClient and implements both OnModuleInit and OnModuleDestroy interfaces


### Requirement 61: Maker-Checker Pattern Tests

**User Story:** As a developer, I want dedicated tests for the maker-checker constraint on loan approval, so that the approver-cannot-be-creator rule and role-based approval authorization are thoroughly verified.

#### Acceptance Criteria

1. THE Test_Suite SHALL include unit tests verifying that a user who created a loan (maker) cannot approve the same loan (checker constraint: approver_id ≠ creator_id)
2. THE Test_Suite SHALL include unit tests verifying that a different authorized user (manager or super_admin) can approve a loan they did not create
3. THE Test_Suite SHALL include unit tests verifying that the approval action records the approver's user ID in the approved_by field
4. THE Test_Suite SHALL include unit tests verifying that only users with the loan.approve permission (manager, super_admin) can approve loans
5. THE Test_Suite SHALL include unit tests verifying that field_officer, collection_officer, accountant, office_staff, and viewer_auditor roles are rejected when attempting loan approval
6. THE Test_Suite SHALL include an integration test verifying the full maker-checker flow: field_officer creates loan → submits → manager reviews → manager approves → audit log records both actor IDs
7. THE Test_Suite SHALL include unit tests verifying that the maker-checker constraint applies to: loan approval, loan rejection, disbursement authorization, collection reversal, penalty waiver, and foreclosure approval

### Requirement 62: BigInt/Number Conversion Safety Tests

**User Story:** As a developer, I want tests for the BigInt-to-Number conversion boundary, so that no precision loss occurs when money values cross the Prisma-to-application layer boundary.

#### Acceptance Criteria

1. THE Test_Suite SHALL include unit tests verifying that BigInt values within Number.MAX_SAFE_INTEGER (9,007,199,254,740,991 paise) convert to Number without precision loss
2. THE Test_Suite SHALL include unit tests verifying correct BigInt serialization in JSON API responses (BigInt values converted to Number or String before JSON.stringify)
3. THE Test_Suite SHALL include unit tests verifying that Decimal.js intermediate calculations produce correct integer paise results after ROUND_HALF_UP rounding
4. THE Test_Suite SHALL include unit tests verifying that the `calculateProcessingFee()` function produces correct BigInt results for both fixed and percentage fee types with edge cases: zero principal (0n), minimum principal (100n), and large principal (1,000,000,000,00n = 10 billion paise)
5. THE Test_Suite SHALL include unit tests verifying that BigInt arithmetic in allocation, reversal, and outstanding computation produces identical results to equivalent Decimal.js computation
6. IF a money value exceeds Number.MAX_SAFE_INTEGER, THEN THE Test_Suite SHALL verify that the system handles the value correctly without silent truncation

### Requirement 63: Timezone and Date Handling Tests

**User Story:** As a developer, I want tests for timezone-sensitive date operations, so that UTC/IST boundary behavior is verified for due dates, DPD calculations, and business date derivation.

#### Acceptance Criteria

1. THE Test_Suite SHALL include unit tests verifying that business date derivation (`new Date(now.toISOString().split('T')[0])`) produces the correct IST date when the UTC time is between 00:00 and 05:30 UTC (which is the previous day in IST vs UTC)
2. THE Test_Suite SHALL include unit tests verifying that due date generation produces correct dates across month boundaries (e.g., January 31 → February 28/29)
3. THE Test_Suite SHALL include unit tests verifying that DPD calculation uses date-only comparison (ignoring time component) to avoid off-by-one errors at midnight boundaries
4. THE Test_Suite SHALL include unit tests verifying that due dates generated for weekly and daily frequencies maintain correct spacing regardless of timezone offset
5. THE Test_Suite SHALL include unit tests verifying that penalty calculation reference dates use IST business dates consistently
6. WHEN a due date falls on a holiday and is shifted to the next business day, THE Test_Suite SHALL verify that the shifted date is also evaluated in IST context

### Requirement 64: Optimistic Locking Tests

**User Story:** As a developer, I want tests for optimistic locking behavior on customers, loans, and schedule installments, so that concurrent update conflicts are detected and reported correctly.

#### Acceptance Criteria

1. THE Test_Suite SHALL include unit tests verifying that updating a customer with a stale version number (version in request < version in database) is rejected with a ConflictError
2. THE Test_Suite SHALL include unit tests verifying that updating a loan with a stale version number is rejected with a ConflictError
3. THE Test_Suite SHALL include unit tests verifying that the version field auto-increments on every successful update
4. THE Test_Suite SHALL include integration tests verifying concurrent update conflict detection: two simultaneous updates to the same loan where the second update fails due to version mismatch
5. THE Test_Suite SHALL include unit tests verifying that the ConflictError message includes the entity type and ID for debugging
6. THE Test_Suite SHALL include unit tests verifying that schedule installment updates during collection posting use version checks to prevent stale state overwrites


### Requirement 65: Loan Number Generation Tests

**User Story:** As a developer, I want tests for sequential loan number generation, so that uniqueness, format correctness, and concurrent safety are verified.

#### Acceptance Criteria

1. THE Test_Suite SHALL include unit tests verifying that `generateLoanNumber()` produces numbers in the format LN-{YYYY}-{NNNNN} where YYYY is the current year and NNNNN is zero-padded to 5 digits
2. THE Test_Suite SHALL include unit tests verifying that sequential calls to `generateLoanNumber()` produce strictly increasing sequence numbers
3. THE Test_Suite SHALL include integration tests verifying that concurrent loan creation does not produce duplicate loan numbers (PostgreSQL sequence `loan_number_seq` guarantees uniqueness)
4. THE Test_Suite SHALL include unit tests verifying that the year prefix reflects the current calendar year at generation time
5. THE Test_Suite SHALL include unit tests verifying that the loan_number column unique constraint rejects duplicate values at the database level

### Requirement 66: Processing Fee Calculation Tests

**User Story:** As a developer, I want dedicated unit tests for the processing fee calculation pure function, so that fixed and percentage fee types are verified with edge cases and BigInt arithmetic correctness.

#### Acceptance Criteria

1. THE Test_Suite SHALL include unit tests for `calculateProcessingFee()` with fee_type='fixed' verifying that the returned BigInt equals the feeValue directly
2. THE Test_Suite SHALL include unit tests for `calculateProcessingFee()` with fee_type='percentage' verifying correct basis-point calculation (feeValue in bps: 200 = 2%) with ROUND_HALF_UP rounding
3. THE Test_Suite SHALL include unit tests for `calculateProcessingFee()` with zero principal (0n) verifying zero fee for both fixed and percentage types
4. THE Test_Suite SHALL include unit tests for `calculateProcessingFee()` with zero feeValue verifying zero fee for percentage type
5. THE Test_Suite SHALL include unit tests for `calculateProcessingFee()` verifying correct rounding for percentage calculations that produce fractional paise (e.g., 100001n principal at 150 bps)
6. THE Test_Suite SHALL include unit tests for `calculateProcessingFee()` with an unrecognized fee_type verifying that 0n is returned
7. THE Test_Suite SHALL include unit tests verifying that the processing fee journal entry (Debit Cash/Bank, Credit Processing_Fee_Income) is created during disbursement when a fee is configured

### Requirement 67: SMS Template Rendering Tests

**User Story:** As a developer, I want tests for SMS template rendering, so that variable substitution, missing variable handling, and template lookup are verified.

#### Acceptance Criteria

1. THE Test_Suite SHALL include unit tests for `renderTemplate()` verifying that all `{{variable}}` placeholders are substituted with corresponding values from the variable map
2. THE Test_Suite SHALL include unit tests for `renderTemplate()` verifying that templates with no placeholders return the original string unchanged
3. THE Test_Suite SHALL include unit tests for `renderTemplate()` verifying behavior when the variable map is missing a key referenced in the template (placeholder remains or is replaced with empty string, per implementation)
4. THE Test_Suite SHALL include unit tests for `renderTemplate()` verifying behavior with extra keys in the variable map that are not referenced in the template (no error, unused keys ignored)
5. THE Test_Suite SHALL include unit tests for template lookup by event_type and language verifying correct template selection and fallback behavior when a language-specific template is not found
6. THE Test_Suite SHALL include a PBT verifying that for all templates with matching variable maps, no unsubstituted `{{variable}}` placeholders remain in the rendered output
7. WHEN running template rendering PBTs, THE Test_Suite SHALL execute a minimum of 100 examples per property

### Requirement 68: Audit Interceptor Tests

**User Story:** As a developer, I want tests for the audit interceptor, so that request-level audit logging captures actor, action, timing, and error state correctly.

#### Acceptance Criteria

1. THE Test_Suite SHALL include unit tests verifying that the AuditInterceptor logs requestId, actorId, actorRole, HTTP method, URL, IP address, and duration for successful requests
2. THE Test_Suite SHALL include unit tests verifying that the AuditInterceptor logs error details (error message, not stack trace) for failed requests
3. THE Test_Suite SHALL include unit tests verifying that anonymous requests (no JWT user) are logged with actorId='anonymous' and actorRole='unknown'
4. THE Test_Suite SHALL include unit tests verifying that the interceptor does not modify the request or response (pass-through behavior via rxjs tap operator)
5. IF the interceptor's logging operation itself throws an error, THEN THE AuditInterceptor SHALL not break the request pipeline (error in logging must not cause a 500 response)


### Requirement 69: Throttler Guard Tests

**User Story:** As a developer, I want tests for the custom throttler guard, so that rate limiting per IP and per authenticated user is verified.

#### Acceptance Criteria

1. THE Test_Suite SHALL include unit tests verifying that `getTracker()` returns the authenticated user's sub (user ID) when a JWT user is present on the request
2. THE Test_Suite SHALL include unit tests verifying that `getTracker()` falls back to the request IP address when no authenticated user is present
3. THE Test_Suite SHALL include unit tests verifying that `getTracker()` returns 'unknown' when neither user nor IP is available
4. THE Test_Suite SHALL include unit tests verifying that `throwThrottlingException()` throws a ThrottlerException with the message 'Too many requests. Please try again later.'
5. THE Test_Suite SHALL include integration tests verifying that auth endpoints are rate-limited at 10 requests per minute per IP
6. THE Test_Suite SHALL include integration tests verifying that API endpoints are rate-limited at 100 requests per minute per authenticated user

### Requirement 70: Environment Validation Tests

**User Story:** As a developer, I want tests for environment variable validation at startup, so that fail-fast behavior on missing or invalid configuration is verified.

#### Acceptance Criteria

1. THE Test_Suite SHALL include unit tests for `validateEnv()` verifying that missing DATABASE_URL causes process exit with a descriptive error message
2. THE Test_Suite SHALL include unit tests for `validateEnv()` verifying that an invalid DATABASE_URL (non-URL format) is rejected
3. THE Test_Suite SHALL include unit tests for `validateEnv()` verifying that missing JWT_SECRET causes process exit with a descriptive error message
4. THE Test_Suite SHALL include unit tests for `validateEnv()` verifying that JWT_SECRET shorter than 16 characters is rejected
5. THE Test_Suite SHALL include unit tests for `validateEnv()` verifying that optional fields (S3_ENDPOINT, SMS_API_KEY) do not cause failure when absent
6. THE Test_Suite SHALL include unit tests for `validateEnv()` verifying correct default values: JWT_EXPIRY='15m', REFRESH_TOKEN_EXPIRY='7d', S3_BUCKET='as-finance-docs', NODE_ENV='development', PORT=3001
7. THE Test_Suite SHALL include unit tests for `validateEnv()` verifying that NODE_ENV accepts only 'development', 'test', 'staging', 'production' and rejects other values
8. THE Test_Suite SHALL include unit tests for the envSchema Zod schema verifying that PORT is coerced to a positive integer

### Requirement 71: Cross-Module Data Integrity Tests

**User Story:** As a developer, I want integration tests for cross-module data consistency, so that derived totals and summary fields reconcile with their source records across module boundaries.

#### Acceptance Criteria

1. THE Test_Suite SHALL include an integration test verifying that a loan's cached_outstanding_paise equals total_payable_paise minus the sum of all valid (non-reversed) allocation amounts for that loan
2. THE Test_Suite SHALL include an integration test verifying that journal entry totals for a collection match the collection amount_paise (total debits = total credits = collection amount)
3. THE Test_Suite SHALL include an integration test verifying that receipt amount_paise matches the corresponding collection amount_paise
4. THE Test_Suite SHALL include an integration test verifying that the count of audit_log entries for a loan matches the number of state-changing operations performed on that loan
5. THE Test_Suite SHALL include an integration test verifying that the sum of all allocation principal_paise for a loan never exceeds the loan's principal_paise
6. THE Test_Suite SHALL include an integration test verifying that the sum of all allocation interest_paise for a loan never exceeds the loan's total_interest_paise
7. WHEN a collection is posted and then reversed, THE Test_Suite SHALL verify that the net effect on cached_outstanding_paise is zero

### Requirement 72: Data Migration Safety Tests

**User Story:** As a developer, I want tests for database migration safety, so that schema changes are reversible and data integrity is preserved across migrations.

#### Acceptance Criteria

1. THE Test_Suite SHALL include migration tests verifying that all migrations apply successfully in sequence (migration up)
2. THE Test_Suite SHALL include migration tests verifying that the seed script executes without errors after all migrations are applied
3. THE Test_Suite SHALL include migration tests verifying that the final schema state matches the Prisma schema definition (no drift between schema.prisma and applied migrations)
4. IF a migration adds a NOT NULL column, THEN THE migration SHALL include a default value or data backfill to prevent failure on existing rows
5. THE Test_Suite SHALL include tests verifying that the migration_lock.toml file specifies the correct database provider (postgresql)


### Requirement 73: Pagination Edge Case Tests

**User Story:** As a developer, I want tests for pagination edge cases beyond empty results, so that boundary conditions in skip, take, and total count are handled correctly.

#### Acceptance Criteria

1. THE Test_Suite SHALL include tests verifying that skip values greater than the total record count return an empty data array with the correct total count
2. THE Test_Suite SHALL include tests verifying that take=0 is either rejected with a validation error or returns an empty data array (per implementation)
3. THE Test_Suite SHALL include tests verifying that negative skip values are rejected with a validation error
4. THE Test_Suite SHALL include tests verifying that negative take values are rejected with a validation error
5. THE Test_Suite SHALL include tests verifying that take values exceeding the maximum page size (100) are clamped to 100 or rejected with a validation error
6. THE Test_Suite SHALL include tests verifying that the total count in paginated responses reflects the filtered count (not the unfiltered table count) when query filters are applied
7. THE Test_Suite SHALL include tests verifying that skip + take combinations near the total count return the correct partial page of results

### Requirement 74: Loan Product Constraint Validation Tests

**User Story:** As a developer, I want tests for loan-product cross-entity validation, so that loan principal and tenure are verified against the product version's min/max bounds at creation time.

#### Acceptance Criteria

1. THE Test_Suite SHALL include unit tests verifying that loan creation with principal_paise exactly equal to the product version's min_principal_paise is accepted
2. THE Test_Suite SHALL include unit tests verifying that loan creation with principal_paise exactly equal to the product version's max_principal_paise is accepted
3. THE Test_Suite SHALL include unit tests verifying that loan creation with principal_paise below the product version's min_principal_paise is rejected with a ValidationError
4. THE Test_Suite SHALL include unit tests verifying that loan creation with principal_paise above the product version's max_principal_paise is rejected with a ValidationError
5. THE Test_Suite SHALL include unit tests verifying that loan creation with tenure_months exactly equal to the product version's min_tenure_months is accepted
6. THE Test_Suite SHALL include unit tests verifying that loan creation with tenure_months exactly equal to the product version's max_tenure_months is accepted
7. THE Test_Suite SHALL include unit tests verifying that loan creation with tenure_months outside the product version's min/max range is rejected with a ValidationError
8. THE Test_Suite SHALL include unit tests verifying that loan creation with a deactivated product (is_active=false) is rejected with a BusinessRuleError

### Requirement 75: Outstanding Balance Drift Detection Tests

**User Story:** As a developer, I want tests verifying that the outstanding balance never silently drifts, so that cached_outstanding_paise is always rebuildable from source events.

#### Acceptance Criteria

1. THE Test_Suite SHALL include an integration test verifying that cached_outstanding_paise can be recomputed from total_payable_paise minus the sum of all valid (non-reversed) allocation amounts, and the recomputed value matches the cached value
2. THE Test_Suite SHALL include an integration test verifying that after a sequence of collections and reversals, the cached_outstanding_paise matches the independently computed outstanding
3. THE Test_Suite SHALL include a PBT verifying that for any valid sequence of collection and reversal operations on a loan, the cached_outstanding_paise equals total_payable_paise minus net allocated payments
4. THE Test_Suite SHALL include tests verifying that cached_outstanding_paise is updated transactionally within the same database transaction as the collection or reversal that changes it
5. THE Test_Suite SHALL include tests verifying that cached_outstanding_paise never becomes negative after any valid operation sequence
6. WHEN running outstanding drift PBTs, THE Test_Suite SHALL execute a minimum of 1000 examples per property

### Requirement 76: Soft Delete Behavior Tests

**User Story:** As a developer, I want tests for soft delete behavior on documents, so that soft-deleted records are correctly excluded from queries while remaining accessible for compliance.

#### Acceptance Criteria

1. THE Test_Suite SHALL include unit tests verifying that soft-deleted documents (is_active=false) are excluded from standard document listing queries
2. THE Test_Suite SHALL include unit tests verifying that soft-deleted documents are still accessible via direct ID lookup for compliance and audit purposes (getSignedUrl returns NotFoundError, but the record exists in the database)
3. THE Test_Suite SHALL include unit tests verifying that the softDelete operation sets is_active=false without removing the file from S3 storage
4. THE Test_Suite SHALL include unit tests verifying that soft-deleted documents cannot be soft-deleted again (idempotent or error, per implementation)
5. THE Test_Suite SHALL include integration tests verifying that no cascade deletion occurs on finance records (collections, journal entries, receipts) when related entities are soft-deleted
6. THE Test_Suite SHALL include unit tests verifying that the document upload flow creates records with is_active=true by default
