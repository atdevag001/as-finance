# Regression Test Index

All bugs discovered during the deep testing and bugfix process, with permanent regression tests.

| Bug ID | Description | Root Cause | Fix | Regression Test File |
|--------|-------------|------------|-----|---------------------|
| BUG-001 | Receipt detail page uses camelCase field names but hook interface defines snake_case | Frontend Receipt interface uses snake_case (receipt_number) but page component accesses camelCase (receiptNumber) | Updated page component to use snake_case field names matching the API response | `apps/api/test/contract/frontend-regression.spec.ts`, `apps/api/test/contract/frontend-snake-case-compat.spec.ts` |
| BUG-002 | List pages use page/pageSize instead of skip/take pagination | Backend query DTOs accept skip (offset) and take (limit), not page numbers | Updated all list page API calls to use skip/take parameters | `apps/api/test/contract/frontend-regression.spec.ts` |
| BUG-003 | Cashbook page calls wrong API endpoint | Page was calling `/cashbook?date=` instead of `/cashbook/daily-summary?date=` | Updated cashbook page to use correct endpoint path | `apps/api/test/contract/frontend-regression.spec.ts` |
| BUG-004 | Loan detail page missing repayment schedule | API response field is `schedules` (array) but page checked for `schedule` (singular) | Updated page to read `schedules` field from API response | `apps/api/test/contract/frontend-regression.spec.ts` |
| BUG-005 | Next.js 14 App Router params incompatibility | Next.js 14 changed dynamic route params to be a Promise; pages used sync destructuring | Updated all dynamic route pages to await params Promise | `apps/api/test/contract/frontend-regression.spec.ts` |
| BUG-006 | Disbursement 500 error when chart of accounts not configured | Service throws BusinessRuleError but error was not properly caught by exception filter | Ensured BusinessRuleError is thrown with correct code for missing accounts | `apps/api/test/contract/frontend-regression.spec.ts` |
| BUG-007 | RBAC UI elements visible to unauthorized roles | Frontend pages show "New Customer", "New Loan" buttons to roles without create permission | Added role-based conditional rendering for all write action buttons | `apps/api/test/contract/frontend-regression.spec.ts` |

## Test File Locations

- **Frontend regression tests**: `apps/api/test/contract/frontend-regression.spec.ts`
- **Snake_case compatibility tests**: `apps/api/test/contract/frontend-snake-case-compat.spec.ts`
- **RBAC UI tests**: `apps/api/test/contract/frontend-rbac-ui.spec.ts`
- **Frontend API compatibility tests**: `apps/api/test/contract/frontend-api-compat.spec.ts`

## Tagging Convention

All regression tests include a JSDoc comment block:
```typescript
/**
 * @regression BUG-{number}
 * @description {brief description}
 * @rootCause {what caused the bug}
 * @fix {what was changed}
 */
```
