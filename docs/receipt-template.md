# AS Finance — Receipt Template

## Receipt Format

```
╔══════════════════════════════════════════════╗
║              AS FINANCE                       ║
║           PAYMENT RECEIPT                     ║
╠══════════════════════════════════════════════╣
║                                               ║
║  Receipt No:    RCP-2024-00042                ║
║  Date:          15-Jan-2024                   ║
║                                               ║
║  Customer:      [Customer Name]               ║
║  Loan No:       LN-2024-00015                 ║
║                                               ║
║  ─────────────────────────────────────────── ║
║  Payment Details                              ║
║  ─────────────────────────────────────────── ║
║  Amount Paid:         ₹5,000.00               ║
║  Payment Mode:        Cash                    ║
║                                               ║
║  Allocation:                                  ║
║    Penalty:           ₹200.00                 ║
║    Interest:          ₹1,800.00               ║
║    Principal:         ₹3,000.00               ║
║                                               ║
║  ─────────────────────────────────────────── ║
║  Outstanding Balance: ₹45,000.00              ║
║  ─────────────────────────────────────────── ║
║                                               ║
║  Collected By:  [Officer Name]                ║
║                                               ║
║  This is a computer-generated receipt.        ║
║  No signature required.                       ║
║                                               ║
║  AS Finance | Contact: [branch_phone]         ║
╚══════════════════════════════════════════════╝
```

## Fields

| Field | Source | Immutable |
|---|---|---|
| Receipt No | Database sequence (RCP-{year}-{padded}) | Yes |
| Date | Collection payment_date | Yes |
| Customer | Snapshot of customer.full_name at receipt time | Yes |
| Loan No | Snapshot of loan.loan_number | Yes |
| Amount Paid | collection.amount_paise → formatted INR | Yes |
| Payment Mode | collection.payment_mode | Yes |
| Penalty | sum(allocations.penalty_paise) → formatted INR | Yes |
| Interest | sum(allocations.interest_paise) → formatted INR | Yes |
| Principal | sum(allocations.principal_paise) → formatted INR | Yes |
| Outstanding | loan.cached_outstanding_paise after collection → formatted INR | Yes |
| Collected By | Snapshot of user.full_name at receipt time | Yes |

## Notes

- All fields are snapshot values captured at receipt creation time
- Receipt content is immutable — never updated after generation
- Reversed receipts are marked with status=reversed, not deleted
- Compensating receipts reference the original receipt
- Format optimized for thermal printers (58mm/80mm) and A4 paper
