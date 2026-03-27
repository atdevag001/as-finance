# AS Finance — SMS Templates

## Template Variables

| Variable | Description | Example |
|---|---|---|
| `{{customerName}}` | Customer full name | Rajesh Kumar |
| `{{loanNumber}}` | Loan reference number | LN-2024-00015 |
| `{{amount}}` | Formatted INR amount | 5,000 |
| `{{receiptNumber}}` | Receipt reference | RCP-2024-00042 |
| `{{outstanding}}` | Outstanding balance formatted | 45,000 |
| `{{dueDate}}` | Due date formatted | 15-Feb-2024 |
| `{{dpd}}` | Days past due | 7 |
| `{{emiAmount}}` | EMI amount formatted | 2,500 |
| `{{totalCollected}}` | Total collected today formatted | 1,25,000 |
| `{{loanCount}}` | Number of loans collected | 15 |
| `{{targetAmount}}` | Collection target formatted | 2,00,000 |

## Templates (English)

### Loan Approved
```
Dear {{customerName}}, your loan {{loanNumber}} of Rs.{{amount}} has been approved by AS Finance. Please visit the branch for disbursement.
```

### Disbursement Confirmation
```
Dear {{customerName}}, Rs.{{amount}} has been disbursed for your loan {{loanNumber}} from AS Finance. Your first EMI of Rs.{{emiAmount}} is due on {{dueDate}}.
```

### Collection Receipt
```
Dear {{customerName}}, payment of Rs.{{amount}} received for loan {{loanNumber}}. Receipt: {{receiptNumber}}. Outstanding: Rs.{{outstanding}}. Thank you - AS Finance.
```

### EMI Reminder (3 days before due)
```
Dear {{customerName}}, your EMI of Rs.{{emiAmount}} for loan {{loanNumber}} is due on {{dueDate}}. Please arrange payment. - AS Finance
```

### Overdue Reminder
```
Dear {{customerName}}, your EMI of Rs.{{emiAmount}} for loan {{loanNumber}} is overdue by {{dpd}} days. Please pay immediately to avoid penalty. - AS Finance
```

### Penalty Notice
```
Dear {{customerName}}, a penalty of Rs.{{amount}} has been applied to your loan {{loanNumber}} due to overdue payment. Please clear your dues. - AS Finance
```

### Loan Rejection
```
Dear {{customerName}}, your loan application {{loanNumber}} has not been approved. Please visit the AS Finance branch for details.
```

### Daily Collection Summary (for officers)
```
AS Finance Daily Summary: Collections today Rs.{{totalCollected}} across {{loanCount}} loans. Outstanding target: Rs.{{targetAmount}}. - AS Finance
```

## Templates (Hindi) — Future

Templates will follow the same structure with Hindi translations. The system architecture supports multi-language templates via the `sms_templates` table with a `language` field.

## Dispatch Rules

- SMS failure never rolls back a valid finance transaction
- Retry: 3 attempts with exponential backoff (30s, 2min, 8min)
- Dead-letter after max retries for manual review
- Rate limited per provider configuration
- All dispatch attempts logged (success and failure)
