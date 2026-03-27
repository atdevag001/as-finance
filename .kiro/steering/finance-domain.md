---
inclusion: always
---

# AS Finance LMS — Finance Domain Steering

## Financial Invariants

These invariants must hold at all times and are non-negotiable:

1. **Schedule Reconciliation**: Sum of all schedule installment components (principal + interest) must equal total loan payable amount, with any rounding difference absorbed by the last installment.
2. **Outstanding Accuracy**: Outstanding balance = total payable - sum of all valid allocated payments. Outstanding must never silently drift.
3. **Reversal Neutrality**: A reversal exactly offsets the original posting in the ledger. Net effect of original + reversal = zero.
4. **Allocation Preservation**: Partial payment allocation follows explicit order (penalty → interest → principal) and preserves component totals.
5. **Ledger Reconciliation**: Ledger totals must reconcile with loan event summaries. No orphaned or unmatched entries.
6. **Atomic Finance Actions**: Disbursement, collection, reversal, closure, and penalty posting are atomic at business transaction level. No partial inconsistent state.
7. **No Silent Mutation**: No hidden balance rewrites, schedule recalculations, ledger edits, or receipt modifications.
8. **Receipt Immutability**: Receipt numbers and content are immutable after issuance. Corrections via new compensating entries only.
9. **Non-Negative Outstanding**: Outstanding cannot become negative unless a deliberate documented credit balance model exists.
10. **Summary Rebuildability**: All summary/derived fields must be rebuildable from source-of-truth events or protected by reconciliation-safe update rules.

## Money Representation Rules

- **Storage**: All money values stored as integer paise (BigInt in Prisma, number in application layer for values within safe integer range)
- **Calculations**: Use Decimal.js for all intermediate arithmetic
- **No floats**: Never use JavaScript `number` type for money arithmetic. Never persist `Float` or `Decimal` Prisma types for money — use `Int` or `BigInt`
- **Display**: Convert paise to rupees only at display/formatting layer
- **API transport**: Money values transmitted as integer paise in JSON

## Rounding Policy

- **Default mode**: ROUND_HALF_UP (Banker's rounding not used — half-up is simpler and expected in Indian lending)
- **Rounding boundary**: Round to nearest paisa (integer) after each installment calculation
- **Accumulation handling**: Track cumulative rounding difference; absorb in last installment
- **Documentation**: Every calculation function must document its rounding point and mode in code comments

## Collection Allocation Order

Default allocation order for every payment:
1. **Penalty** (oldest first)
2. **Interest** (current due, then oldest overdue)
3. **Principal** (current due, then oldest overdue)

Product-level override of allocation order is supported but must be explicitly configured and documented.

Advance payments (paying future installments) are allocated after all current and overdue dues are cleared.

## Transaction Boundaries

Every finance-affecting operation must execute within a single database transaction:
- Disbursement: loan status update + disbursement record + ledger posting + schedule activation
- Collection: payment record + allocation records + schedule updates + ledger posting + receipt generation
- Reversal: compensating payment record + reverse allocations + schedule rollback + compensating ledger entries + audit entry
- Penalty posting: penalty record + ledger posting + outstanding update
- Foreclosure: settlement calculation + final payment + schedule closure + ledger posting + loan status update

If any step fails, the entire transaction rolls back. No partial state.

## Reversal Policy

- Reversals create compensating entries — never delete or modify original records
- Reversal requires authorized role (Manager or Super Admin)
- Reversal must include mandatory reason/remarks
- Reversal creates: compensating collection record, reverse allocation records, compensating ledger entries, audit trail
- Reversed receipt is marked as reversed (not deleted), new compensating receipt issued
- Reversal of a reversal is not supported (prevents infinite chains)

## Immutable Finance Event Philosophy

Finance events are append-only:
- Collections, disbursements, penalties, reversals, receipts are never modified or deleted
- Corrections happen via new compensating events
- Status fields on events (e.g., `reversed`, `cancelled`) are the only mutable attributes
- Full event history is always preserved and queryable

## Ledger Posting Principles

- Double-entry style journal entries for all finance events
- Every journal entry has: date, description, source document reference, debit lines, credit lines
- Journal entries balance (total debits = total credits)
- Chart of accounts defines account categories: assets, liabilities, income, expenses
- Key accounts: Cash, Bank, Loans Receivable, Interest Income, Processing Fee Income, Penalty Income, Expenses (by category)
- Disbursement: Debit Loans Receivable, Credit Cash/Bank
- Collection (principal): Debit Cash/Bank, Credit Loans Receivable
- Collection (interest): Debit Cash/Bank, Credit Interest Income
- Collection (penalty): Debit Cash/Bank, Credit Penalty Income
- Processing fee: Debit Cash/Bank, Credit Processing Fee Income
- Expense: Debit Expense Account, Credit Cash/Bank
- Reversal: Mirror entries of original posting

## Outstanding Derivation

Outstanding balance is derived, not stored as a mutable field:
- **Option A (preferred for accuracy)**: Compute from schedule + allocations on read
- **Option B (acceptable for performance)**: Maintain cached outstanding field, but update it transactionally with every payment/reversal and provide reconciliation mechanism
- Design must document which approach is used and how consistency is guaranteed

## Schedule Generation Rules

### Flat Interest
- Total interest = principal × annual_rate × tenure_months / 12
- EMI = (principal + total_interest) / number_of_installments
- Each installment: fixed principal component + fixed interest component
- Rounding difference absorbed by last installment

### Reducing Balance
- EMI = P × r × (1+r)^n / ((1+r)^n - 1) where r = monthly rate, n = number of installments
- Each installment: interest = outstanding_principal × monthly_rate, principal = EMI - interest
- Rounding difference absorbed by last installment

### Common Rules
- Schedules are generated at loan creation/approval and frozen at disbursement
- Schedule is deterministic: same inputs always produce same output
- First installment due date = start_date + one frequency period
- Due dates respect repayment frequency (monthly/weekly/daily)
- Holiday adjustment: if due date falls on a known holiday, shift to next business day (document this rule)
- Number of installments derived from frequency: monthly → N = tenure_months, weekly → N = tenure_months × 4, daily → N = tenure_months × 30 (or exact count from start to end date)
- Periodic rate derived from frequency: monthly → annual_rate / 12, weekly → annual_rate / 52, daily → annual_rate / 365

## Disbursement Prerequisites

Before disbursement is allowed:
1. Loan status must be `approved`
2. All required documents uploaded and verified
3. Schedule must be generated
4. Disbursement must be authorized by approving role
5. Idempotency check: loan not already disbursed

## Closure Prerequisites

Before loan closure:
1. All schedule installments fully paid
2. All penalties settled or explicitly waived (with authorization)
3. No pending reversals
4. Outstanding balance = 0 (or within documented tolerance for rounding)
5. Closure authorized by appropriate role

## Maker-Checker Expectations

Required for:
- Loan approval / rejection
- Disbursement authorization
- Collection reversal
- Penalty waiver (if supported)
- Foreclosure approval
- Customer blacklisting
- Customer reinstatement from blacklist
- Any correction to posted finance data

Pattern: Action creator (maker) submits → Authorized reviewer (checker) approves/rejects

## Foreclosure Rules

Foreclosure settlement = outstanding principal + accrued interest to date + pending penalties - any applicable rebate
- Accrued interest calculation method must be documented (daily accrual on reducing balance, or pro-rata on flat)
- Foreclosure quote expires after 24 hours; expired quotes cannot be executed
- Foreclosure requires explicit approval
- Foreclosure creates final settlement collection + closure entries
- No hidden fee waivers — all components explicit

## DPD and Overdue Definitions

- **DPD (Days Past Due)**: Calendar days since the earliest unpaid installment due date
- **Overdue buckets**: 1-30 DPD, 31-60 DPD, 61-90 DPD, 90+ DPD
- **Overdue status**: Loan marked overdue when any installment is unpaid past due date
- **Penalty trigger**: Configurable per product (e.g., penalty starts at DPD > 7)
- **Penalty calculation**: Flat amount per day/week/month, or percentage of overdue amount — configurable per product
