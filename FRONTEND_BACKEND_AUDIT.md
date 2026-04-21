# Frontend-Backend Integration Audit Report

**Date:** 2026-04-21  
**Auditor:** Claude Opus 4.5  
**Scope:** All modules - Users, Customers, Loans, Collections, Groups, Loan Products, Accounting, Reports, Receipts, Cashbook, Audit

---

## Executive Summary

Comprehensive audit identified **47 issues** across all modules:
- **CRITICAL (17)**: Will cause runtime failures, API errors, or broken functionality
- **HIGH (12)**: Significant issues affecting core functionality  
- **MEDIUM (13)**: Data inconsistencies, missing features, or suboptimal behavior
- **LOW (5)**: Minor improvements, missing optional fields

---

## Task List by Priority

### CRITICAL Priority (Fix Immediately)

#### C1. Loan Products - Permission Name Mismatch
- **Files:** 
  - `apps/api/src/modules/loan-product/loan-product.controller.ts:27,63,76`
  - `apps/web/src/app/(dashboard)/loan-products/page.tsx:43,91,97,165,171`
  - `apps/web/src/app/(dashboard)/loan-products/[id]/edit/page.tsx:43`
- **Issue:** Backend uses `loan.create` for all operations; frontend uses `loan_product.create`, `loan_product.update`, `loan_product.deactivate`
- **Impact:** UI buttons hidden from users who have API access, or vice versa
- **Fix:** Change backend controller to use `loan_product.*` permissions OR update frontend to use `loan.create`

#### C2. Loan Products - Create Form Field Naming
- **Files:**
  - `apps/web/src/app/(dashboard)/loan-products/new/page.tsx:61-73`
  - `apps/api/src/modules/loan-product/dto/create-loan-product.dto.ts`
- **Issue:** Frontend sends snake_case (`interest_type`, `annual_rate`, `frequency`), backend expects camelCase (`interestType`, `annualRateBps`, `repaymentFrequency`)
- **Impact:** Create loan product fails with validation errors
- **Fix:** Update frontend to send camelCase field names

#### C3. Loan Products - Processing Fee Structure
- **Files:**
  - `apps/web/src/app/(dashboard)/loan-products/new/page.tsx:70`
  - `apps/api/src/modules/loan-product/dto/create-loan-product.dto.ts:55-64`
- **Issue:** Frontend sends single `processing_fee_percent`, backend expects `processingFeeType` + `processingFeeValue`
- **Impact:** Processing fee not saved correctly
- **Fix:** Add fee type selector to frontend form, send both fields

#### C4. Loan Products - Penalty Configuration Structure
- **Files:**
  - `apps/web/src/app/(dashboard)/loan-products/new/page.tsx:71`
  - `apps/api/src/modules/loan-product/dto/create-loan-product.dto.ts:66-86`
- **Issue:** Frontend sends single `penalty_rate_percent`, backend expects `penaltyGraceDays`, `penaltyType`, `penaltyValue`, `penaltyFrequency`
- **Impact:** Penalty configuration not saved
- **Fix:** Add penalty configuration fields to frontend form

#### C5. Loan Products - Allocation Order Type
- **Files:**
  - `apps/web/src/app/(dashboard)/loan-products/new/page.tsx:72`
  - `apps/api/src/modules/loan-product/dto/create-loan-product.dto.ts:95-103`
- **Issue:** Frontend sends comma-separated string, backend expects string array
- **Impact:** Create fails validation
- **Fix:** Split string to array before sending: `allocationOrder: formData.allocation_order.split(',').map(s => s.trim())`

#### C6. Loans - `loan.review` Permission Missing
- **Files:**
  - `apps/web/src/app/(dashboard)/loans/[id]/page.tsx:286`
  - `packages/shared/src/constants/permissions.ts`
- **Issue:** Frontend uses `loan.review` permission which doesn't exist
- **Impact:** "Start Review" button never renders
- **Fix:** Change to `loan.approve` (matching backend)

#### C7. Accounting - Trial Balance Response Mismatch
- **Files:**
  - `apps/web/src/hooks/useAccounting.ts:21-26,67-71`
  - `apps/api/src/modules/accounting/accounting.service.ts:235-241`
- **Issue:** Frontend expects flat array with `accountCode`, `accountName`; backend returns object with `rows` containing `code`, `name`
- **Impact:** Page crashes on `.reduce()`
- **Fix:** Update hook to extract `rows` from response, map field names

#### C8. Accounting - Trial Balance Date Parameter
- **Files:**
  - `apps/web/src/hooks/useAccounting.ts:67-71`
  - `apps/api/src/modules/accounting/dto/accounting-query.dto.ts:16-21`
- **Issue:** Frontend sends `startDate`/`endDate`, backend expects `asOfDate`
- **Impact:** Date filtering doesn't work
- **Fix:** Send `asOfDate` parameter

#### C9. Accounting - Balance Sheet Response Mismatch
- **Files:**
  - `apps/web/src/hooks/useAccounting.ts:34-38,81-85`
  - `apps/api/src/modules/accounting/accounting.service.ts:382-393`
- **Issue:** Frontend expects `totalPaise` (number), backend returns `balancePaise` (string)
- **Impact:** Incorrect display or NaN values
- **Fix:** Map `balancePaise` to `totalPaise`, convert string to number

#### C10. Accounting - Profit & Loss Response Mismatch
- **Files:**
  - `apps/web/src/hooks/useAccounting.ts:28-32`
  - `apps/api/src/modules/accounting/accounting.service.ts:309-317`
- **Issue:** Frontend expects `category`; backend returns `name`
- **Impact:** All items show "Other"
- **Fix:** Map `name` to `category`, `amountPaise` to `totalPaise`

#### C11. Reports - Response Structure Mismatch
- **Files:**
  - `apps/web/src/hooks/useReports.ts:6-11`
  - `apps/web/src/app/(dashboard)/reports/[type]/page.tsx:118`
  - `apps/api/src/modules/report/report.service.ts`
- **Issue:** Frontend expects `columns` and `rows`; backend returns `summary` and `data` with varying structures
- **Impact:** Report detail page fails to render
- **Fix:** Transform backend response OR redesign frontend to handle varying structures

#### C12. Audit Logs - Query Parameter Mismatch
- **Files:**
  - `apps/web/src/hooks/useAuditLogs.ts:32-33`
  - `apps/api/src/modules/audit/dto/audit-log-query.dto.ts:25,40`
- **Issue:** Frontend sends `entity`, `action`; backend expects `targetEntity`, `actionType`
- **Impact:** Filters don't work
- **Fix:** Update query param names in frontend hook

#### C13. Cashbook - Create Handover Missing Fields
- **Files:**
  - `apps/web/src/app/(dashboard)/cashbook/handovers/page.tsx:45`
  - `apps/api/src/modules/cashbook/dto/create-handover.dto.ts:8-21`
- **Issue:** Frontend sends `amountPaise`, `remarks`; backend expects `totalAmountPaise`, `receivingOfficerId`, `handoverDate`
- **Impact:** Create fails with validation errors
- **Fix:** Add receiving officer selector, date picker; rename field

#### C14. Cashbook - Verify Handover Missing Body
- **Files:**
  - `apps/web/src/hooks/useCashbook.ts:72-73`
  - `apps/api/src/modules/cashbook/dto/verify-handover.dto.ts:8-26`
- **Issue:** Frontend sends empty PATCH body; backend requires `verificationStatus`
- **Impact:** Verify fails with 400 error
- **Fix:** Add verification status dialog, send `{ verificationStatus: 'verified' }`

#### C15. Customers - Guarantor Required Fields
- **Files:**
  - `apps/web/src/app/(dashboard)/customers/[id]/page.tsx:847-852`
  - `apps/api/src/modules/customer/dto/create-guarantor.dto.ts:28-35`
- **Issue:** Backend requires `aadhaarNumber` and `address`; frontend treats them as optional
- **Impact:** Add guarantor fails validation
- **Fix:** Add required validation to frontend form schema

#### C16. Customers - Family Member Relationship Enum
- **Files:**
  - `apps/web/src/app/(dashboard)/customers/[id]/page.tsx:766-771`
  - `apps/api/src/modules/customer/dto/create-family-member.dto.ts:17-20`
- **Issue:** Frontend offers `parent`; backend only allows `father`, `mother`, `spouse`, `sibling`, `child`, `other`
- **Impact:** Selecting "parent" fails validation
- **Fix:** Change frontend to offer "Father"/"Mother" instead of "Parent"

#### C17. Groups - StatusBadge Enum Mismatch
- **Files:**
  - `apps/web/src/components/shared/status-badge.tsx:84`
  - `packages/shared/src/enums/index.ts:77`
- **Issue:** Frontend uses `disbanded`; backend uses `dissolved`
- **Impact:** Dissolved groups show wrong styling
- **Fix:** Change `disbanded` to `dissolved` in StatusBadge

---

### HIGH Priority (Fix Soon)

#### H1. Loans - Missing Status Filters
- **Files:** `apps/web/src/app/(dashboard)/loans/page.tsx:10-19`
- **Issue:** Missing `disbursed`, `rejected`, `defaulted`, `foreclosed` status filters
- **Fix:** Add missing status options to STATUS_FILTERS array

#### H2. Cashbook - Expense paymentMode Ignored
- **Files:**
  - `apps/web/src/app/(dashboard)/cashbook/expenses/new/page.tsx:60-66`
  - `apps/api/src/modules/cashbook/dto/create-expense.dto.ts:8-32`
- **Issue:** Frontend sends `paymentMode`; backend DTO doesn't accept it
- **Fix:** Add `paymentMode` to backend DTO OR remove from frontend

#### H3. Cashbook - Handover Response Field Names
- **Files:**
  - `apps/web/src/hooks/useCashbook.ts:16-25`
  - `apps/api/src/modules/cashbook/cashbook.repository.ts:89-95,154-165`
- **Issue:** Frontend expects `officer_id`, `amount_paise`, `status`; backend returns `collection_officer_id`, `total_amount_paise`, `verification_status`
- **Fix:** Update CashHandover interface to match backend response

#### H4. Accounting - Daybook Response Field Names
- **Files:**
  - `apps/web/src/hooks/useAccounting.ts:13-18`
  - `apps/api/src/modules/accounting/accounting.repository.ts:121-128`
- **Issue:** Frontend expects `date`, `sourceType`, `accountName`; backend returns `entry_date`, `source_type`, nested `account.name`
- **Fix:** Update JournalEntry interface, map/flatten fields

#### H5. Loan Products - Missing Fields in Edit Form
- **Files:** `apps/web/src/app/(dashboard)/loan-products/[id]/edit/page.tsx:78-94`
- **Issue:** Edit form loads `processing_fee_value`, `penalty_value` but ignores type, grace days, frequency
- **Fix:** Add UI for fee type, penalty type, penalty grace days, penalty frequency

#### H6. Loan Products - Missing maxConcurrentLoans Field
- **Files:**
  - `apps/web/src/app/(dashboard)/loan-products/new/page.tsx`
  - `apps/api/src/modules/loan-product/dto/create-loan-product.dto.ts:88-93`
- **Issue:** Backend supports `maxConcurrentLoans` (1-10); frontend form doesn't include it
- **Fix:** Add max concurrent loans field to form

#### H7. Reports - Type Mismatch
- **Files:**
  - `apps/web/src/app/(dashboard)/reports/page.tsx:50-51`
  - `apps/api/src/modules/report/report.service.ts:8-29`
- **Issue:** Frontend shows `interest-accrual`, `user-activity` (don't exist); missing `dpd-aging`, `officer-performance`
- **Fix:** Sync report types between frontend and backend

#### H8. Reports - Export Returns JSON Not Blob
- **Files:**
  - `apps/web/src/app/(dashboard)/reports/[type]/page.tsx:74-76`
  - `apps/api/src/modules/report/report.service.ts:135-149`
- **Issue:** Frontend expects Blob for download; backend returns JSON stub
- **Fix:** Implement actual file export OR handle JSON response

#### H9. Accounting - Money Fields String vs Number
- **Files:**
  - `apps/web/src/hooks/useAccounting.ts`
  - `apps/api/src/modules/accounting/accounting.service.ts`
- **Issue:** Backend returns BigInt as strings; frontend expects numbers
- **Fix:** Convert strings to numbers in hooks OR update interfaces

#### H10. Collections - Client-Side Only Loan Filtering
- **Files:** `apps/web/src/app/(dashboard)/collections/new/page.tsx:258-259`
- **Issue:** Filters active/overdue loans client-side after fetching all
- **Fix:** Pass `status` filter to `useLoans` hook: `status: 'active,overdue'`

#### H11. Loan Products - Edit Form Uses Correct camelCase (Inconsistency)
- **Files:**
  - `apps/web/src/app/(dashboard)/loan-products/new/page.tsx` (wrong - snake_case)
  - `apps/web/src/app/(dashboard)/loan-products/[id]/edit/page.tsx:138` (correct - camelCase)
- **Issue:** Create and Edit forms use different field naming conventions
- **Fix:** Align Create form to use camelCase like Edit form

#### H12. Customers - Missing workOrBusinessDetails in Interface
- **Files:**
  - `apps/web/src/hooks/useCustomers.ts:19-35`
  - `apps/api/src/modules/customer/dto/create-customer.dto.ts:83`
- **Issue:** Backend accepts/returns `work_or_business_details`; frontend interface missing it
- **Fix:** Add field to CustomerDetail interface

---

### MEDIUM Priority (Fix When Possible)

#### M1. Users - Missing Email Field
- **Files:**
  - `apps/web/src/app/(dashboard)/users/new/page.tsx:24-30`
  - `apps/web/src/app/(dashboard)/users/[id]/edit/page.tsx:24-29`
  - `apps/web/src/hooks/useUsers.ts:6-15`
- **Issue:** Backend supports optional `email`; frontend forms don't include it
- **Fix:** Add optional email field to forms and interface

#### M2. Users - Username Validation Mismatch
- **Files:**
  - `apps/web/src/app/(dashboard)/users/new/page.tsx:25`
  - `apps/api/src/modules/user/dto/create-user.dto.ts:18`
- **Issue:** Frontend: min 3, max 50; Backend: min 1 (non-empty), max 100
- **Fix:** Align to common standard (suggest 3-100)

#### M3. Cashbook - Expense Form Wrong Permission
- **Files:** `apps/web/src/app/(dashboard)/cashbook/expenses/new/page.tsx:26`
- **Issue:** Checks `accounting.manage_cashbook`; should be `accounting.create_expense`
- **Fix:** Update permission check

#### M4. Cashbook - Daily Summary Type Mismatch
- **Files:** `apps/web/src/hooks/useCashbook.ts:6-14`
- **Issue:** Interface expects numbers; backend returns strings (BigInt)
- **Fix:** Update interface to string OR convert in hook

#### M5. Audit Logs - Missing Fields in Interface
- **Files:** `apps/web/src/hooks/useAuditLogs.ts:6-15`
- **Issue:** Missing `ip_address`, `request_id`, `before_state`, `after_state`, `approval_id`
- **Fix:** Extend AuditLog interface

#### M6. Collections - Redundant Idempotency Header
- **Files:** `apps/web/src/app/(dashboard)/collections/new/page.tsx:148`
- **Issue:** Sends idempotency key in both body and header; header ignored
- **Fix:** Remove header, keep body only

#### M7. Collections - Missing Max Amount Validation
- **Files:** `apps/web/src/app/(dashboard)/collections/new/page.tsx:102-119`
- **Issue:** No client-side check against loan outstanding
- **Fix:** Add validation: amount <= outstanding (optional, backend validates)

#### M8. Receipts - BigInt Serialization Risk
- **Files:** `apps/api/src/modules/receipt/receipt.repository.ts:29-50`
- **Issue:** BigInt fields may fail JSON serialization
- **Fix:** Verify NestJS BigInt serialization config OR convert in repository

#### M9. Customers - Missing incomeContribution in Family Member Form
- **Files:**
  - `apps/web/src/app/(dashboard)/customers/[id]/page.tsx:79-84,748-792`
  - `apps/api/src/modules/customer/dto/create-family-member.dto.ts:37-41`
- **Issue:** Backend accepts `incomeContribution`; frontend form missing it
- **Fix:** Add optional income contribution field

#### M10. Loan Products - LoanProduct Interface Outdated
- **Files:** `apps/web/src/hooks/useLoanProducts.ts:6-33`
- **Issue:** Interface has deprecated fields (`processing_fee_percent`, `penalty_rate_percent`) instead of new structure
- **Fix:** Update interface to match current backend response

#### M11. Accounting - Balance Sheet Date Parameter
- **Files:** `apps/web/src/hooks/useAccounting.ts:81-85`
- **Issue:** Sends `endDate`; backend expects `asOfDate`
- **Fix:** Rename parameter

#### M12. Reports - Missing Error Handling for Permission
- **Files:** `apps/web/src/app/(dashboard)/reports/[type]/page.tsx:82-85`
- **Issue:** Silent failure for permission denied on export
- **Fix:** Show toast/error message on permission denied

#### M13. Loans - Missing groupId in Create Form
- **Files:** `apps/web/src/app/(dashboard)/loans/new/page.tsx`
- **Issue:** Backend supports `groupId`; frontend form doesn't include it
- **Fix:** Add optional group selector (or document that group loans use different workflow)

---

### LOW Priority (Nice to Have)

#### L1. Shared Schema Missing Fields
- **Files:** `packages/shared/src/validation/schemas.ts:27-49`
- **Issue:** `createCustomerSchema` missing `photoFileId`, `assignedOfficerId`
- **Fix:** Add optional fields to shared schema

#### L2. Loan Products - Name Validation Missing
- **Files:** `apps/web/src/app/(dashboard)/loan-products/new/page.tsx`
- **Issue:** No frontend validation for name max length (backend: 200)
- **Fix:** Add `.max(200)` to Zod schema

#### L3. Loan Products - Allocation Order Validation Missing
- **Files:** `apps/web/src/app/(dashboard)/loan-products/new/page.tsx`
- **Issue:** Backend requires exactly 3 components; frontend doesn't validate
- **Fix:** Add validation for 3 comma-separated values

#### L4. Users - Missing last_login_at, version in Interface
- **Files:** `apps/web/src/hooks/useUsers.ts:6-15`
- **Issue:** API returns these fields but interface doesn't include them
- **Fix:** Add optional fields to interface

#### L5. Customers - Missing photoFileId/assignedOfficerId in Create
- **Files:** `apps/web/src/app/(dashboard)/customers/new/page.tsx`
- **Issue:** Backend accepts these optional fields; frontend doesn't include
- **Fix:** Add if needed, or document as edit-only fields

---

## Implementation Recommendations

### Phase 1: Critical Fixes (Immediate)
Focus on C1-C17 issues that cause runtime failures. Estimated: 2-3 days

### Phase 2: High Priority (This Week)
Address H1-H12 issues affecting core functionality. Estimated: 2-3 days

### Phase 3: Medium Priority (Next Sprint)
Fix M1-M13 issues for data consistency. Estimated: 2-3 days

### Phase 4: Low Priority (Backlog)
Address L1-L5 improvements as time permits. Estimated: 1 day

---

## Prevention Strategies

### 1. Shared Type Definitions
Create shared TypeScript interfaces in `packages/shared/src/types/` that both frontend and backend import. This ensures field names and types stay synchronized.

### 2. API Contract Testing
Add contract tests that verify:
- Request payloads match backend DTOs
- Response structures match frontend interfaces
- Permission names exist in shared constants

### 3. Code Generation
Consider generating frontend types from backend DTOs using tools like:
- `openapi-typescript` from Swagger/OpenAPI specs
- Custom scripts to extract types from NestJS DTOs

### 4. Naming Convention Enforcement
- Backend: Always use camelCase in DTOs (class-transformer handles DB snake_case)
- Frontend: Always use camelCase in payloads
- Database: Continue using snake_case
- Add ESLint rules to enforce conventions

### 5. Permission Audit Script
Create a script that:
- Extracts all `@RequirePermission()` decorators from backend
- Extracts all `PermissionGate` and `hasPermission()` calls from frontend
- Reports any mismatches

### 6. Pre-commit Hooks
Add hooks that:
- Validate DTO field names are camelCase
- Check permission names exist in shared constants
- Verify interface definitions match between frontend/backend

---

## Quick Reference: Common Patterns to Follow

### Correct API Payload (camelCase)
```typescript
// Frontend - sending to API
await api.post('/loan-products', {
  name: 'Product Name',
  interestType: 'reducing',        // camelCase
  annualRateBps: 1200,             // camelCase
  repaymentFrequency: 'monthly',   // camelCase
  minPrincipalPaise: 1000000,      // camelCase
});
```

### Correct Response Handling (snake_case from DB)
```typescript
// Frontend - receiving from API (Prisma returns snake_case)
interface User {
  id: string;
  full_name: string;      // snake_case from DB
  is_active: boolean;     // snake_case from DB
  created_at: string;     // snake_case from DB
}
```

### Correct Permission Check
```typescript
// Use permission names from packages/shared/src/constants/permissions.ts
<PermissionGate permission="loan_product.create">  // Must exist in PERMISSIONS
  <Button>Create</Button>
</PermissionGate>
```

---

*Generated by Claude Opus 4.5 - Full audit completed 2026-04-21*
