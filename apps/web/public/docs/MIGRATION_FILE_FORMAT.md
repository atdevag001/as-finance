# Data Migration — File Format Spec

This document describes the .xlsx (or .csv) files you upload to `/data-migration` to bring existing customer + loan + collection + group data into AS-Finance from a legacy system.

> ⚠️ **One-shot operation.** After a successful migration, the endpoint locks itself forever (until ops manually resets `settings.migration_state`). Get it right the first time. Use the dry-run preview before committing.

> 🔒 **Super Admin only.** Only the `admin` account (or any other `super_admin` user) can upload migration files.

> 💾 **Templates.** Every file below has a downloadable blank template in the dashboard (Data Migration → "Template" button next to each file input). The template ships a `Data` sheet (header + one example row) and an `Instructions` sheet (required-vs-optional + enum cheat-sheet). Equivalent endpoint: `GET /api/migration/template/<domain>.xlsx`.

> 🔢 **Paise columns are integers.** Every column named `*_paise` must be a non-negative whole number ≤ 9007199254740992 (`Number.MAX_SAFE_INTEGER`). Decimals are rejected at dry-run. Convert rupees by multiplying by 100 and rounding once: `Math.round(rupees * 100)`.

## How cross-references work

Every domain uses **`legacy_*_id`** strings to reference rows in other files:

- A loan in `loans.xlsx` says `customer_legacy_customer_id = 'CUST-007'`
- The customer with `legacy_customer_id = 'CUST-007'` in `customers.xlsx` must exist
- The migration validates every reference in the dry-run; one bad reference aborts the entire commit

This means **you only need to know the legacy ids — the system assigns its own UUIDs after import** and keeps the legacy id in a searchable column for forensic lookup.

## File order (recommended upload)

1. `customers.xlsx`
2. `groups.xlsx` (optional)
3. `group_members.xlsx` (optional, requires groups + customers)
4. `loans.xlsx` (requires customers)
5. `collections.xlsx` (requires loans)

You can upload all of them in one POST — they're all validated together.

---

## 1. `customers.xlsx`

| Column | Required | Type | Notes |
|---|---|---|---|
| `legacy_customer_id` | ✅ | text | Your old system's customer id. Unique within the file. |
| `full_name` | ✅ | text | Up to 200 chars |
| `father_or_husband_name` | optional | text | |
| `mobile` | ✅ | text | 10 digits — leading zeros / non-digits stripped |
| `alternate_mobile` | optional | text | |
| `aadhaar` | ✅ | text | 12 digits. **Stored encrypted at rest** (you provide plaintext) |
| `pan` | optional | text | 10-char PAN, uppercase. Also stored encrypted |
| `dob` | optional | date | YYYY-MM-DD |
| `gender` | ✅ | text | `male`, `female`, `other` |
| `occupation` | optional | text | |
| `monthly_income_paise` | optional | number | In paise (₹ × 100), not rupees |
| `address_line1` | ✅ | text | |
| `address_line2` | optional | text | |
| `city` | ✅ | text | |
| `district` | ✅ | text | |
| `state` | ✅ | text | |
| `pincode` | ✅ | text | **Exactly 6 digits** (matches `/^\d{6}$/`). No padding, no truncation. Wrong length → `pincode must be exactly 6 digits; got "..."` |
| `status` | optional | text | `active` (default), `blacklisted`, or `inactive`. Case-insensitive |
| `assigned_officer_username` | optional | text | Must match a `users.username` already in the system (resolved at commit) |
| `registered_at` | optional | date | Preserves the original onboarding date (YYYY-MM-DD). If absent, defaults to migration time |

> 📝 Enum values are normalised case-insensitively — "Active", "ACTIVE", "active" all work.

**Example row:**

| legacy_customer_id | full_name | mobile | aadhaar | gender | address_line1 | city | district | state | pincode |
|---|---|---|---|---|---|---|---|---|---|
| CUST-007 | Ravi Kumar | 9876543210 | 123412341234 | male | 12 Gandhi Road | Pune | Pune | Maharashtra | 411001 |

---

## 2. `groups.xlsx` (optional)

| Column | Required | Type | Notes |
|---|---|---|---|
| `legacy_group_id` | ✅ | text | Unique within file |
| `name` | ✅ | text | |
| `leader_legacy_customer_id` | ✅ | text | Must reference a row in `customers.xlsx` |
| `meeting_day` | ✅ | text | `monday`..`sunday` (lowercase) |
| `branch_area` | ✅ | text | |
| `status` | optional | text | `active` (default), `inactive`, `dissolved` |

The leader is automatically added as the group's first member — you don't need to add them again in `group_members.xlsx`.

---

## 3. `group_members.xlsx` (optional)

| Column | Required | Type | Notes |
|---|---|---|---|
| `legacy_group_id` | ✅ | text | Must reference a row in `groups.xlsx` |
| `member_legacy_customer_id` | ✅ | text | Must reference a row in `customers.xlsx` |
| `joined_at` | optional | date | Preserves the original join date |

Don't include the leader's row here — that's auto-created from `groups.xlsx`.

> 🔁 **Duplicate rows are silently deduped.** If the same `(legacy_group_id, member_legacy_customer_id)` pair appears in multiple rows, only the first is inserted. Subsequent rows are treated as no-ops; any differing `joined_at` on later rows is discarded.

---

## 4. `loans.xlsx` (requires customers)

| Column | Required | Type | Notes |
|---|---|---|---|
| `legacy_loan_id` | ✅ | text | Your old system's loan number. Unique within file |
| `customer_legacy_customer_id` | ✅ | text | Must reference `customers.xlsx` |
| `group_legacy_id` | optional | text | Reference `groups.xlsx` only if it's a group loan |
| `principal_paise` | ✅ | number | Original disbursed amount, in paise. ₹10,000 = `1000000` |
| `total_interest_paise` | ✅ | number | Total interest over the tenure (paise). Bake compounding from your source |
| `total_payable_paise` | ✅ | number | `principal + interest`. Should equal `principal_paise + total_interest_paise` |
| `tenure_months` | ✅ | number | Total tenure in months. **Must be an integer ≥ 1** — `0`, negative, or decimal values are rejected at dry-run |
| `installments_paid_count` | optional | number | Default `0`. How many EMIs have been paid in full. **Must be ≤ `tenure_months`** |
| `emi_paise` | ✅ | number | Per-installment EMI in paise |
| `purpose` | ✅ | text | Brief description (e.g. "business expansion") |
| `status` | ✅ | text | `active`, `overdue`, `closed`, `foreclosed`, or `defaulted` (lowercase; case-insensitive). Other LoanStatus values are rejected at commit |
| `cached_outstanding_paise` | ✅ | number | **Current** balance the customer still owes. This is the single source of truth — the system trusts it. **Include any pending penalty amounts here** (we don't write separate penalty rows for migrated loans) |
| `disbursement_date` | ✅ | date | When the customer received the loan |
| `first_due_date` | ✅ | date | First EMI due date |
| `disbursement_mode` | optional | text | `cash` (default), `bank_transfer`, or `online`. Used for the disbursement report |

> ⚠️ **`cached_outstanding_paise` is the most important field.** If your source says the customer owes ₹4,500, put `450000` here. Don't compute it from collections — the system will trust whatever value you put.

> 📅 The schedule (every EMI date) is materialised automatically: `first_due_date`, `first_due_date + 1 month`, etc. for `tenure_months` total.

---

## 5. `collections.xlsx` (requires loans)

| Column | Required | Type | Notes |
|---|---|---|---|
| `legacy_collection_id` | ✅ | text | Your old system's collection / receipt id. **Must be unique within the file** — duplicates are detected at dry-run (they would otherwise collide on the `mig:coll:<id>` idempotency key mid-transaction) |
| `loan_legacy_loan_id` | ✅ | text | Must reference `loans.xlsx` |
| `amount_paise` | ✅ | number | Paid amount in paise |
| `payment_date` | ✅ | date | When the customer actually paid (preserves history) |
| `payment_mode` | ✅ | text | `cash`, `bank_transfer`, or `online` |

> 📝 **Migrated collections do NOT generate journal entries.** Reports filter on journal lines; the migration uses a shared zero-totals journal entry so the historical payments don't double-count in your P&L going forward.

> 📝 **Receipt numbers are not preserved.** New receipts (post-migration) will use the system's own number sequence. If you need to look up a legacy receipt, search by `legacy_collection_id`.

---

## What gets created on the database side

Reading this top to bottom: the migration writes one `customers` row per row in your file, one `groups` row + auto-leader-member, one `loans` row + `loan_status_history` + `loan_schedules` (one per installment) + a `disbursements` row, one `collections` row per collection.

For every row, `created_by` = the synthetic `migration-bot` user (super_admin, login disabled). All migrated loans point at a single `LEGACY_MIGRATION` loan product so the new system's penalty/interest rules don't retroactively apply to legacy balances.

Audit-log entries written per migration attempt:

- `migration_started` — written BEFORE the commit transaction begins (so it survives a rollback). Carries the file SHA-256 hashes and row counts. Lets ops see who attempted a migration even if it failed.
- `migration_completed` — written inside the commit transaction. The single batch-level entry. Its id is returned to the operator as `migrationAuditId` in the commit response, and is also stored in `settings.migration_state_meta` so the lock card can link back to it.
- `migration_failed` — written outside the rolled-back transaction if commit throws. Carries the file SHA-256 hashes, row counts, and the error message string. The draft is dropped (operator must re-upload to retry).

---

## What's NOT migrated

| Domain | Reason |
|---|---|
| Receipts | Auto-generated; legacy receipt numbers can't be preserved without colliding with the sequence |
| Disbursement journal entries | Migrated outstanding already reflects the disbursement; new JEs would double-count |
| Collection journal entries | Same — historical payments already in cached_outstanding_paise |
| Penalty rows | Pending penalties get baked into `cached_outstanding_paise`. We don't write separate penalty rows for migrated loans |
| Customer documents | Skipped — re-upload via the normal customer detail page if you have digital docs |
| Family members, guarantors | Skipped in V1. Add them manually post-migration if needed |
| Audit log entries (per-row) | Single batch-level entry; per-row is excessive for 5000+ rows |

---

## Rate limits

- Dry-run: 10 calls / min per user
- Commit: 3 calls / hour per user
- File size: 5 MB per file
- Total rows per file: 5,000

---

## Error → fix flow

The dry-run returns:
```json
{
  "draftId": "<uuid>",
  "totals": { "customers": 134, "loans": 89, ... },
  "validCount": { "customers": 134, "loans": 87, ... },
  "errors": [
    { "domain": "loans", "rowIndex": 12, "column": "customer_legacy_customer_id", "message": "Loan LN-019: customer CUST-XXX not found" }
  ]
}
```

The commit refuses if `errors.length > 0`. Fix the source files based on the error list, re-upload, dry-run again, then commit.

Representative dry-run errors you may see:

```
loans       row 12  customer_legacy_customer_id  Loan LN-019: customer CUST-XXX not found
customers   row 8   pincode                      pincode must be exactly 6 digits; got "12345"
customers   row 8   legacy_customer_id           Duplicate legacy_customer_id: CUST-007
loans       row 22  principal_paise              principal_paise must be a non-negative integer in paise (no decimals, max 9007199254740992); got "12345.67"
loans       row 22  tenure_months                tenure_months must be an integer ≥ 1; got "0"
loans       row 22  installments_paid_count      installments_paid_count (15) > tenure_months (12)
collections row 5   legacy_collection_id         Duplicate legacy_collection_id: COLL-501
```

---

## Commit response

A successful commit returns:

```json
{
  "draftId": "<uuid>",
  "rowsCommitted": { "customers": 134, "groups": 12, "group_members": 56, "loans": 89, "collections": 421 },
  "migrationAuditId": "<uuid>",
  "durationMs": 12450
}
```

- `rowsCommitted` — per-domain row counts that actually landed in the DB (matches `totals` from the dry-run unless someone uploaded a different file in between).
- `migrationAuditId` — the id of the `migration_completed` row in `audit_logs`. Surfaced on the dashboard for the operator to copy.
- `durationMs` — wall-clock duration of the commit transaction (operator-visible so a slow migration can be triaged).

The dashboard also shows the SHA-256 of every uploaded file alongside the audit id, for forensic auditors comparing the source spreadsheet to the live database.

---

## After migration

- Sidebar → Data Migration shows the lock state: `completed at YYYY-MM-DD by <user>`
- Customers, loans, collections, groups all show up in their respective list pages with `legacy_*_id` populated (filterable via the API; UI surfacing TBD)
- Reports (P&L, Trial Balance, Cashbook) ignore the shared migration journal entry because it has zero `journal_lines`
- DPD continues to compute from `loan_schedules` due dates — migrated loans behave like real loans from the next nightly cron run

If something looks wrong, **don't try to re-migrate**. Look at the specific records, fix them via the regular API endpoints, and let ops decide whether a re-migration is warranted (requires manual reset of `settings.migration_state`).
