# AS Finance LMS — Finance Invariants Reference

## Non-Negotiable Invariants

| # | Invariant | Description | Enforcement |
|---|---|---|---|
| 1 | Schedule Reconciliation | sum(principal components) == loan principal; sum(interest components) == total interest | Schedule generation + property test |
| 2 | Outstanding Accuracy | outstanding == total_payable - sum(valid_allocated_payments) | Transactional update + reconciliation |
| 3 | Reversal Neutrality | original + reversal net ledger effect == 0 | Mirror journal entries |
| 4 | Allocation Preservation | sum(penalty + interest + principal allocations) == collection amount | Allocation engine + property test |
| 5 | Journal Balance | sum(debits) == sum(credits) per journal entry | Pre-persistence validation |
| 6 | Audit Completeness | Every finance action has a corresponding audit log entry | Transactional audit logging |
| 7 | Receipt Immutability | Receipt content never changes after creation | Snapshot fields, no UPDATE |
| 8 | Non-Negative Outstanding | Outstanding >= 0 always | Pre-collection validation |
| 9 | Idempotency | Same key → same result, no duplicate effects | Idempotency key service |
| 10 | Schedule Determinism | Same inputs → same schedule always | Pure function, no side effects |
| 11 | Cash Reconciliation | opening + inflows - outflows == closing | Daily reconciliation check |
| 12 | Model Conformance | Schedule conforms to product configuration | Validation at generation |

## Operational Rules

- Defaulted transition: Loan moves from overdue to defaulted when DPD exceeds configurable threshold (default: 90 days)
- Processing fee: Collected at disbursement time, recorded as separate journal entry (DR Cash/Bank, CR Processing_Fee_Income)
- Penalty posting: DR Loans_Receivable, CR Penalty_Income (increases outstanding balance)
- Foreclosure quote expiry: Quotes valid for 24 hours only; expired quotes require regeneration
- Frequency-aware rate conversion: monthly = annual/12, weekly = annual/52, daily = annual/365
- Loan status history: Every status transition recorded in loan_status_history table with actor, reason, and metadata

## Money Rules

- All money stored as integer paise (1 INR = 100 paise)
- All calculations via Decimal.js with ROUND_HALF_UP
- No binary floating point for money anywhere
- Round to nearest paisa at each documented calculation boundary
- Rounding difference absorbed by last installment only

## Allocation Order (Default)

1. Penalty (oldest first)
2. Interest (current due, then oldest overdue)
3. Principal (current due, then oldest overdue)

## Transaction Boundaries

Every finance mutation is atomic within a single database transaction:
- Disbursement: status + record + journal + schedule activation + audit + outbox
- Collection: record + allocations + installment updates + journal + receipt + audit + outbox
- Reversal: compensating record + reverse allocations + installment rollback + mirror journal + receipt update + audit
- Penalty: record + journal + outstanding update + audit
- Penalty waiver: mark waived + outstanding update + audit (maker-checker required)
- Foreclosure: settlement collection + installment closure + journal + status update + audit
