# Implementation Plan: AS Finance LMS Frontend

## Overview

Evolve the existing Next.js 14+ App Router frontend shells at `apps/web/` into production-ready, finance-safe pages. The backend API is complete. The frontend already has: API client with JWT refresh, auth provider, RBAC sidebar, shared UI components (MoneyDisplay, StatusBadge, ConfirmDialog, LoadingSpinner, ErrorMessage, PaginationControls), TanStack Query hooks for customers/loans/collections, and page shells for most routes. Implementation proceeds in dependency order: foundation → auth/RBAC → core pages → finance pages → office pages → admin pages → testing.

## Tasks

- [x] 1. Foundation: Shared components, utilities, and hooks
  - [x] 1.1 Create `PermissionGate` component at `apps/web/src/components/shared/permission-gate.tsx`
    - Implement `PermissionGateProps` interface: `permission: string`, `children: ReactNode`, `fallback?: ReactNode`
    - Read user role from `useAuth()`, check against shared `PERMISSIONS` constant via `hasPermission(role, permission)`
    - Render children when permitted, fallback (default `null`) otherwise
    - Export from `apps/web/src/components/shared/index.ts`
    - _Requirements: 2.1, 2.3, 2.5_

  - [x] 1.2 Create `AccessDenied` component at `apps/web/src/components/shared/access-denied.tsx`
    - Full-page "Access Denied" message with icon and "Go back" link
    - Export from shared index
    - _Requirements: 2.2_

  - [x] 1.3 Create `DateDisplay` component at `apps/web/src/components/shared/date-display.tsx`
    - Props: `date: string` (ISO 8601), `showTime?: boolean`
    - Format to `DD-MMM-YYYY` or `DD-MMM-YYYY HH:mm` in IST (Asia/Kolkata)
    - Export from shared index
    - _Requirements: 23.1, 23.2, 23.3_

  - [x] 1.4 Create date utility functions at `apps/web/src/lib/date-utils.ts`
    - `formatDateIST(isoString: string): string` → `DD-MMM-YYYY` in IST
    - `formatTimestampIST(isoString: string): string` → `DD-MMM-YYYY HH:mm` in IST
    - `todayIST(): string` → `YYYY-MM-DD` for HTML date inputs
    - _Requirements: 23.1, 23.2, 23.3, 23.5_

  - [x] 1.5 Create permission utility at `apps/web/src/lib/permissions.ts`
    - Extract `hasPermission(role, permission)` from sidebar-nav into standalone module
    - Import `PERMISSIONS` from `@as-finance/shared/constants`
    - _Requirements: 2.1, 2.4_

  - [x] 1.6 Create Toast system provider and component
    - Create `apps/web/src/providers/toast-provider.tsx` with context-based toast state
    - Create `apps/web/src/components/shared/toast.tsx` for rendering toasts
    - Support success/error variants, auto-dismiss after 5 seconds, dismiss button
    - Wire into root layout providers
    - _Requirements: 22.5_

  - [x] 1.7 Create `useDashboard` hook at `apps/web/src/hooks/useDashboard.ts`
    - Query: `GET /dashboard` → `DashboardKPIs` type
    - _Requirements: 3.1_

  - [x] 1.8 Create `useLoanProducts` hook at `apps/web/src/hooks/useLoanProducts.ts`
    - Query: `GET /loan-products` → `LoanProduct[]` type
    - _Requirements: 7.7_

  - [x] 1.9 Create `useReceipts` hook at `apps/web/src/hooks/useReceipts.ts`
    - Queries: `GET /receipts/:id`, `GET /receipts?loanId=`
    - _Requirements: 11.1, 12.1_

  - [x] 1.10 Create `useReversals` hook at `apps/web/src/hooks/useReversals.ts`
    - Mutation: `POST /reversals` with idempotency key header
    - Invalidate collections and loan queries on success
    - _Requirements: 13.3_

  - [x] 1.11 Create `useAccounting` hook at `apps/web/src/hooks/useAccounting.ts`
    - Queries: `GET /accounting/chart-of-accounts`, `/daybook`, `/trial-balance`, `/profit-loss`, `/balance-sheet`
    - Each query accepts date range params
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

  - [x] 1.12 Create `useCashbook` hook at `apps/web/src/hooks/useCashbook.ts`
    - Queries: `GET /cashbook/daily-summary`, `GET /cashbook/handovers`
    - Mutations: `POST /cashbook/expenses`, `POST /cashbook/handovers`, `PATCH /cashbook/handovers/:id/verify`
    - _Requirements: 15.1, 15.5, 15.8, 15.9_

  - [x] 1.13 Create `useReports` hook at `apps/web/src/hooks/useReports.ts`
    - Query: `GET /reports/:type` with date range params
    - _Requirements: 16.3_

  - [x] 1.14 Create `useAuditLogs` hook at `apps/web/src/hooks/useAuditLogs.ts`
    - Query: `GET /audit-logs` with pagination and filter params (entity, action, date)
    - _Requirements: 17.1, 17.2_

  - [x] 1.15 Create `useUsers` hook at `apps/web/src/hooks/useUsers.ts`
    - Queries: `GET /users`, `GET /users/:id`
    - Mutations: `POST /users`, `PATCH /users/:id`
    - _Requirements: 18.1, 18.4, 18.5_

  - [x] 1.16 Create `useSettings` hook at `apps/web/src/hooks/useSettings.ts`
    - Queries: `GET /settings`, `GET /settings/holidays`
    - Mutations: `PATCH /settings`, `POST /settings/holidays`, `DELETE /settings/holidays/:id`
    - _Requirements: 19.1, 19.2, 19.5, 19.6_

- [x] 2. Checkpoint — Foundation complete
  - Ensure all shared components render correctly, all hooks compile, and exports are wired. Ask the user if questions arise.

- [x] 3. Auth, RBAC, and middleware
  - [x] 3.1 Update edge middleware at `apps/web/src/middleware.ts`
    - Redirect unauthenticated requests (missing JWT cookie) to `/login?redirect={originalPath}`
    - Define public paths list (login, public assets)
    - _Requirements: 1.6_

  - [x] 3.2 Update login page at `apps/web/src/app/login/page.tsx`
    - Handle `redirect` query parameter: navigate to redirect path on successful login instead of default dashboard
    - Session restore loading spinner already handled by auth provider
    - _Requirements: 1.9_

  - [x] 3.3 Add route-level permission checks to protected pages
    - In each page that requires a specific permission, check `hasPermission` and render `AccessDenied` if unauthorized
    - Apply to: user management, settings, accounting, cashbook, reports, audit pages
    - _Requirements: 2.2_

- [x] 4. Dashboard page
  - [x] 4.1 Complete dashboard page at `apps/web/src/app/(dashboard)/page.tsx`
    - Fetch KPIs via `useDashboard` hook
    - Display KPI cards: total customers, active loans, overdue loans, pending approvals, total outstanding, today's collections, cash in hand
    - All money values via `MoneyDisplay`
    - Overdue card highlighted with danger variant when `overdueLoans > 0`
    - Each card links to relevant list page
    - Loading spinner while fetching, error message on failure
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 4.2 Write property test for overdue dashboard highlighting
    - **Property 17: Overdue dashboard card highlighting**
    - **Validates: Requirements 3.3**

- [x] 5. Customer pages
  - [x] 5.1 Complete customer list page at `apps/web/src/app/(dashboard)/customers/page.tsx`
    - Debounced search input (300ms) filtering by name or mobile
    - Status filter dropdown (Active, Blacklisted, Inactive) — resets to page 1 on change
    - Table: Name (link to detail), Mobile, City (hidden on mobile), Status badge
    - PaginationControls at bottom
    - Empty state: "No customers found."
    - Loading spinner, error message
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

  - [x] 5.2 Complete customer create page at `apps/web/src/app/(dashboard)/customers/new/page.tsx`
    - Replace inline Zod schema with `createCustomerSchema` from `@as-finance/shared/validation`
    - Add all fields: full name, father/husband name, mobile, alternate mobile, Aadhaar, PAN, DOB, age, gender, occupation, monthly income (rupees→paise), address line 1, address line 2, city, district, state, pincode, notes
    - Use shared `aadhaarSchema`, `panSchema`, `mobileSchema`, `pincodeSchema` for field validation
    - Handle 409 conflict for duplicate Aadhaar/mobile
    - Handle 400 validation errors inline
    - Disable submit + "Saving…" indicator while submitting
    - Navigate to customer list on success, show success toast
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10_

  - [x] 5.3 Complete customer detail page at `apps/web/src/app/(dashboard)/customers/[id]/page.tsx`
    - Fetch customer from `GET /customers/:id` including family members and guarantors
    - Display Aadhaar masked as `XXXX-XXXX-{last4}`, PAN masked as `XXXXXX{last4}`
    - Money values (monthly income) via MoneyDisplay
    - Family members list: name, relationship, contact
    - Guarantors list: name, relationship, mobile
    - Document upload section (gated by `customer.upload_doc` permission) — JPEG, PNG, PDF up to 5MB
    - Blacklist button (gated by `customer.blacklist`, active customers) with ConfirmDialog + reason
    - Reinstate button (gated by `customer.blacklist`, blacklisted customers) with ConfirmDialog
    - Linked loans section: loan number, principal, status, outstanding as links to loan detail
    - Loading spinner, 404 "Customer not found" handling
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11, 6.12_

  - [x] 5.4 Write property tests for customer-related utilities
    - **Property 3: PII masking round-trip consistency**
    - **Validates: Requirements 6.2, 6.3, 25.1, 25.2**
    - **Property 4: Shared validation schema correctness**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 18.3**

- [x] 6. Loan pages
  - [x] 6.1 Create loan new page at `apps/web/src/app/(dashboard)/loans/new/page.tsx`
    - Customer search/select typeahead input against `GET /customers?search=`
    - Loan product dropdown from `useLoanProducts` hook
    - Principal input in rupees → converted to paise on submit
    - Tenure in months, purpose text field
    - Validation: positive principal, tenure ≥ 1
    - Call `POST /loans` on submit, navigate to loan list on success
    - Handle validation/business errors inline
    - Disable submit + "Submitting…" indicator
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [x] 6.2 Complete loan list page at `apps/web/src/app/(dashboard)/loans/page.tsx`
    - Status filter buttons: All, Draft, Submitted, Under Review, Approved, Active, Overdue, Closed
    - Reset to page 1 on filter change
    - Table: Loan Number (link), Customer Name, Principal (INR), Status Badge, Outstanding (INR)
    - Overdue loans highlighted via StatusBadge
    - PaginationControls, loading spinner, error message
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8_

  - [x] 6.3 Complete loan detail page at `apps/web/src/app/(dashboard)/loans/[id]/page.tsx`
    - Fetch loan from `GET /loans/:id` with repayment schedule
    - Summary cards: principal, outstanding, tenure (money via MoneyDisplay)
    - Schedule table: installment #, due date (DateDisplay), principal, interest, total, status badge
    - Overdue installments with danger status badge
    - Approve/Reject buttons (gated by `loan.approve`, visible for submitted/under_review)
    - Approve: ConfirmDialog → `POST /loans/:id/approve`
    - Reject: ConfirmDialog with reason input → `POST /loans/:id/reject`
    - Disburse button (gated by `loan.disburse`, visible for approved) with ConfirmDialog + idempotency key → `POST /loans/:id/disburse`
    - All action buttons disabled while any action in progress
    - Success toast + refetch on action success, error message on failure
    - Collection history section from `GET /collections?loanId=:id`
    - Receipts section from `GET /receipts?loanId=:id` with links to receipt detail
    - Reverse button per collection (gated by `collection.reverse`, posted status only)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10, 9.11, 9.12, 9.13, 12.1, 12.2, 12.3, 12.4, 13.1_

  - [x] 6.4 Write property tests for loan-related UI logic
    - **Property 8: Status badge variant mapping**
    - **Validates: Requirements 8.5, 9.4, 11.6, 12.4**
    - **Property 14: Rejection and reversal reason validation**
    - **Validates: Requirements 9.7, 13.2**

- [x] 7. Checkpoint — Core pages complete
  - Ensure customer CRUD, loan lifecycle, and dashboard pages work end-to-end against the API. Ask the user if questions arise.

- [x] 8. Finance pages: Collections, receipts, reversals
  - [x] 8.1 Complete collection new page at `apps/web/src/app/(dashboard)/collections/new/page.tsx`
    - Mobile-first layout with large touch targets (min 44px height)
    - Loan search by loan number or customer name
    - Display selected loan info: outstanding, customer name, loan number
    - Amount input in rupees with large touch-friendly numeric input, `inputMode="numeric"`
    - Payment mode as large tappable buttons (Cash, Bank Transfer, Online)
    - Date defaults to today IST via `todayIST()`
    - ConfirmDialog before posting showing all details
    - Idempotency key generated once per form session via `crypto.randomUUID()`
    - Call `POST /collections` with `X-Idempotency-Key` header
    - Disable all inputs + "Posting…" indicator while submitting
    - Navigate to receipt view on success
    - Error display + re-enable form on failure, preserve idempotency key
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10, 10.11, 10.12_

  - [x] 8.2 Complete collection list page at `apps/web/src/app/(dashboard)/collections/page.tsx`
    - Table: Date (DateDisplay), Loan Number, Customer, Amount (MoneyDisplay), Mode, Status Badge
    - Reverse button per row (gated by `collection.reverse`, posted status only)
    - PaginationControls, loading spinner, error message
    - _Requirements: 13.1_

  - [x] 8.3 Create receipt view page at `apps/web/src/app/(dashboard)/receipts/[id]/page.tsx`
    - Fetch receipt from `useReceipts` hook via `GET /receipts/:id`
    - Display: receipt number, date (DateDisplay), customer name, loan number, amount (MoneyDisplay), payment mode
    - Allocation breakdown: penalty, interest, principal amounts (MoneyDisplay)
    - Outstanding balance after payment, collected-by officer name
    - Print button → `window.print()` with `@media print` CSS
    - Print layout compatible with thermal (58mm/80mm) and A4 paper
    - "REVERSED" watermark overlay for reversed receipts
    - Loading spinner, 404 "Receipt not found" handling
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8_

  - [x] 8.4 Create reversal dialog component
    - Reversal dialog with mandatory reason field (min 10 characters)
    - Display collection details: amount, date, loan number for verification
    - Call `POST /reversals` via `useReversals` hook with idempotency key
    - Disable confirm + "Reversing…" indicator while processing
    - Success toast + refetch on success, error message on failure
    - Wire into collection list and loan detail reverse buttons
    - _Requirements: 13.2, 13.3, 13.4, 13.5, 13.6, 13.7_

  - [x] 8.5 Write property tests for finance page utilities
    - **Property 5: Rupee-to-paise conversion integrity**
    - **Validates: Requirements 7.3, 10.3**
    - **Property 12: Idempotency key presence on finance mutations**
    - **Validates: Requirements 10.7, 10.12, 13.3**
    - **Property 13: ConfirmDialog gate for finance actions**
    - **Validates: Requirements 21.1, 21.2, 21.5**

- [x] 9. Checkpoint — Finance pages complete
  - Ensure collection posting, receipt view, and reversal flow work correctly. Verify idempotency keys are sent on all finance mutations. Ask the user if questions arise.

- [x] 10. Office pages: Accounting, cashbook, reports, audit
  - [x] 10.1 Complete accounting page at `apps/web/src/app/(dashboard)/accounting/page.tsx`
    - Chart of accounts view: account code, name, category from `GET /accounting/chart-of-accounts`
    - Daybook link/section with date range filter
    - All money via MoneyDisplay
    - Loading spinner, error message
    - _Requirements: 14.1, 14.2, 14.6, 14.7, 14.8_

  - [x] 10.2 Complete trial balance page at `apps/web/src/app/(dashboard)/accounting/trial-balance/page.tsx`
    - Date range filter
    - Table: account name, debit total (MoneyDisplay), credit total (MoneyDisplay)
    - _Requirements: 14.3, 14.6_

  - [x] 10.3 Complete profit & loss page at `apps/web/src/app/(dashboard)/accounting/profit-loss/page.tsx`
    - Date range filter
    - Income categories with totals, expense categories with totals, net profit
    - All money via MoneyDisplay
    - _Requirements: 14.4, 14.6_

  - [x] 10.4 Complete balance sheet page at `apps/web/src/app/(dashboard)/accounting/balance-sheet/page.tsx`
    - Date filter
    - Assets, liabilities, equity sections with totals
    - All money via MoneyDisplay
    - _Requirements: 14.5, 14.6_

  - [x] 10.5 Complete cashbook page at `apps/web/src/app/(dashboard)/cashbook/page.tsx`
    - Daily summary: opening balance, inflows, outflows, closing balance, transaction count
    - Date picker defaulting to today IST
    - Discrepancy warning indicator when `hasDiscrepancy` is true
    - Links to expense entry and handover pages
    - All money via MoneyDisplay
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.7, 15.10_

  - [x] 10.6 Create cashbook expense form at `apps/web/src/app/(dashboard)/cashbook/expenses/new/page.tsx`
    - Fields: category, amount (rupees→paise), date, description, payment mode
    - Call `POST /cashbook/expenses` via `useCashbook` hook
    - Disable submit + "Recording…" indicator
    - ConfirmDialog before posting
    - Success toast on completion
    - _Requirements: 15.5, 15.6_

  - [x] 10.7 Create cashbook handover page at `apps/web/src/app/(dashboard)/cashbook/handovers/page.tsx`
    - List pending handovers
    - Initiate handover form: amount (rupees→paise), remarks → `POST /cashbook/handovers`
    - Verify button (gated by `handover.verify`) → `PATCH /cashbook/handovers/:id/verify`
    - _Requirements: 15.8, 15.9_

  - [x] 10.8 Write property test for cashbook discrepancy warning
    - **Property 18: Cashbook discrepancy warning**
    - **Validates: Requirements 15.3**

  - [x] 10.9 Complete reports index page at `apps/web/src/app/(dashboard)/reports/page.tsx`
    - List available report types: Collection Summary, Outstanding, Disbursement, Overdue, Demand, Portfolio
    - Each links to report detail page
    - _Requirements: 16.1_

  - [x] 10.10 Complete report detail page at `apps/web/src/app/(dashboard)/reports/[type]/page.tsx`
    - Date range filters (start date, end date)
    - Fetch report data from `GET /reports/:type` via `useReports` hook
    - Tabular data display with money values in INR via MoneyDisplay
    - Export PDF/Excel buttons (gated by `report.export` permission)
    - Export triggers file download
    - Loading indicator while fetching/exporting, error message on failure
    - _Requirements: 16.2, 16.3, 16.4, 16.5, 16.6, 16.7, 16.8_

  - [x] 10.11 Complete audit page at `apps/web/src/app/(dashboard)/audit/page.tsx`
    - Fetch paginated audit logs via `useAuditLogs` hook
    - Filter inputs: target entity type, action type, start date
    - Reset to page 1 on filter change
    - Table: timestamp (DateDisplay with time), action type, actor ID + role, target entity + ID, remarks
    - Responsive column hiding on mobile
    - PaginationControls
    - Empty state: "No audit logs found."
    - Loading spinner, error message
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7, 17.8_

- [x] 11. Checkpoint — Office pages complete
  - Ensure accounting views, cashbook, reports, and audit page render correctly with real API data. Ask the user if questions arise.

- [x] 12. Admin pages: Users and settings
  - [x] 12.1 Complete user management page at `apps/web/src/app/(dashboard)/users/page.tsx`
    - Paginated user list via `useUsers` hook: full name, username, role, mobile, active status
    - "New User" button (gated by `user.create` permission)
    - _Requirements: 18.1, 18.2_

  - [x] 12.2 Create user creation form (inline or separate route)
    - Fields: username, full name, mobile, password (validated against shared `passwordSchema`), role selection, optional area
    - Call `POST /users` on submit, navigate to user list on success
    - Disable submit + loading indicator while submitting
    - Error message on failure
    - _Requirements: 18.3, 18.4, 18.7, 18.8_

  - [x] 12.3 Create user edit form
    - Fields: full name, mobile, role (gated by `user.change_role`), active status, area
    - Call `PATCH /users/:id` on submit
    - Disable submit + loading indicator while submitting
    - Error message on failure, success toast on completion
    - _Requirements: 18.5, 18.6, 18.7, 18.8_

  - [x] 12.4 Complete settings page at `apps/web/src/app/(dashboard)/settings/page.tsx`
    - Fetch settings via `useSettings` hook, display as editable key-value pairs
    - Dirty tracking: only submit changed settings via `PATCH /settings`
    - Disable save + "Saving…" indicator while submitting
    - Error message on failure, success toast on completion
    - _Requirements: 19.1, 19.2, 19.3, 19.4_

  - [x] 12.5 Add holiday calendar section to settings page
    - Fetch holidays from `GET /settings/holidays`
    - Display holidays for current year
    - Add holiday form: date + description → `POST /settings/holidays` (gated by `settings.update`)
    - Remove holiday button → `DELETE /settings/holidays/:id` (gated by `settings.update`)
    - _Requirements: 19.5, 19.6_

  - [x] 12.6 Write property test for settings dirty tracking
    - **Property 19: Settings dirty tracking — only changed values submitted**
    - **Validates: Requirements 19.2**

- [x] 13. Checkpoint — Admin pages complete
  - Ensure user management CRUD and settings page with holiday calendar work correctly. Ask the user if questions arise.

- [x] 13.5 Gap-fill pages: Groups, foreclosure, penalties, loan products, customer edit, password change
  - [x] 13.5.1 Create group list page at `apps/web/src/app/(dashboard)/groups/page.tsx`
    - Paginated group list: name, leader, member count, meeting day, status badge
    - "New Group" button (gated by `group.create`)
    - _Requirements: 26.1, 26.2_

  - [x] 13.5.2 Create group detail page at `apps/web/src/app/(dashboard)/groups/[id]/page.tsx`
    - Group info, member list, add member (gated by `group.add_member`)
    - Group collection history, "Post Group Collection" button (gated by `group.collect`)
    - _Requirements: 26.4, 26.5, 26.6_

  - [x] 13.5.3 Create group collection form
    - Display each member's loan with outstanding, individual payment amount inputs
    - Call `POST /group-collections` on submit with idempotency key
    - _Requirements: 26.7_

  - [x] 13.5.4 Create `useGroups` hook at `apps/web/src/hooks/useGroups.ts`
    - Queries: `GET /groups`, `GET /groups/:id`
    - Mutations: `POST /groups`, `POST /groups/:id/members`, `POST /group-collections`
    - _Requirements: 26.1, 26.3, 26.5, 26.7_

  - [x] 13.5.5 Add foreclosure workflow to loan detail page
    - "Foreclosure" button (gated by `loan.foreclosure`, active/overdue loans)
    - Quote generation → display settlement breakdown with expiry countdown
    - "Approve & Execute" button (gated by `loan.foreclosure_approve`) with ConfirmDialog + idempotency key
    - Handle expired quotes
    - _Requirements: 27.1, 27.2, 27.3, 27.4, 27.5, 27.6, 27.7_

  - [x] 13.5.6 Create `useForeclosures` hook at `apps/web/src/hooks/useForeclosures.ts`
    - Mutations: `POST /foreclosures/quote`, `POST /foreclosures/:id/execute`
    - _Requirements: 27.2, 27.5_

  - [x] 13.5.7 Add penalties section to loan detail page
    - Penalties table: date, amount, period, status, installment ref
    - "Waive" button per pending penalty (gated by `penalty.waive`) with ConfirmDialog + reason + approver
    - Display DPD and overdue bucket
    - _Requirements: 28.1, 28.2, 28.3, 28.4, 28.5_

  - [x] 13.5.8 Create `usePenalties` hook at `apps/web/src/hooks/usePenalties.ts`
    - Query: `GET /penalties?loanId=`
    - Mutation: `POST /penalties/:id/waive`
    - _Requirements: 28.1, 28.4_

  - [x] 13.5.9 Create loan product admin pages
    - Product list page at `apps/web/src/app/(dashboard)/loan-products/page.tsx`
    - Product create form, product edit (new version), deactivate button
    - _Requirements: 29.1, 29.2, 29.3, 29.4, 29.5, 29.6_

  - [x] 13.5.10 Add customer edit form to customer detail page
    - "Edit" button (gated by `customer.update`) → edit form pre-populated with existing data
    - Call `PATCH /customers/:id` with changed fields only
    - _Requirements: 30.1, 30.2, 30.3, 30.4, 30.5_

  - [x] 13.5.11 Add password change page at `apps/web/src/app/(dashboard)/profile/change-password/page.tsx`
    - Current password, new password, confirm password fields
    - Validate against shared `passwordSchema`
    - Call `POST /auth/change-password`
    - _Requirements: 31.1, 31.2, 31.3, 31.4, 31.5_

  - [x] 13.5.12 Add submit and review buttons to loan detail page
    - "Submit for Review" button (draft status, `loan.submit` permission) → `POST /loans/:id/submit`
    - "Start Review" button (submitted status, `loan.review` permission) → `POST /loans/:id/review`
    - _Requirements: 32.1, 32.2, 32.3, 32.4_

  - [x] 13.5.13 Add loan status history timeline to loan detail page
    - Display status transitions in reverse chronological order
    - Show from_status → to_status with StatusBadge, changed_by name, reason, timestamp (DateDisplay)
    - _Requirements: 33.1, 33.2, 33.3_

  - [x] 13.5.14 Add family member and guarantor management to customer detail
    - "Add Family Member" button (gated by `customer.update`) → form dialog → `POST /customers/:id/family-members`
    - "Add Guarantor" button (gated by `customer.update`) → form dialog → `POST /customers/:id/guarantors`
    - _Requirements: 34.1, 34.2, 34.3_

  - [x] 13.5.15 Add document viewer to customer detail
    - Documents list with type, upload date, "View" link
    - View link fetches signed URL from `GET /documents/:id/url` and opens in new tab
    - _Requirements: 35.1, 35.2, 35.3_

  - [x] 13.5.16 Add disbursement mode selection to disburse ConfirmDialog
    - Payment mode selector (Cash, Bank Transfer) in the disburse dialog
    - Reference number input when Bank Transfer selected
    - Include mode and referenceNumber in API call
    - _Requirements: 36.1, 36.2, 36.3_

  - [x] 13.5.17 Add date and loan filters to collection list page
    - Date range filter (start/end) defaulting to today
    - Loan number search filter
    - Reset to page 1 on filter change
    - _Requirements: 37.1, 37.2, 37.3_

  - [x] 13.5.18 Add session timeout warning
    - Monitor JWT expiry, show toast warning at 2 minutes remaining
    - Attempt silent refresh on warning trigger
    - Dismiss on success, redirect to login on failure
    - _Requirements: 38.1, 38.2, 38.3, 38.4_

- [x] 14. Cross-cutting property tests
  - [x] 14.1 Write property test for MoneyDisplay formatting
    - File: `apps/web/src/lib/__tests__/finance-utils.property.spec.ts` (Property 5 covers money formatting)
    - **Property 1: MoneyDisplay formatting correctness** — ₹ prefix, Indian comma grouping, 2 decimal places, round-trip parse
    - **Validates: Requirements 20.1, 20.2, 20.3, 20.4**

  - [x] 14.2 Write property test for date formatting in IST
    - File: `apps/web/src/lib/__tests__/date-utils.property.spec.ts`
    - **Property 2: Date formatting in IST** — DD-MMM-YYYY pattern, correct IST calendar date
    - **Property 15: Default date is today in IST** — todayIST() matches current IST date
    - **Validates: Requirements 23.1, 23.2, 23.3, 23.5, 10.5, 15.2**

  - [x] 14.3 Write property test for RBAC permission gate
    - File: `apps/web/src/lib/__tests__/permissions.property.spec.ts`
    - **Property 6: RBAC permission gate consistency** — hasPermission matches PERMISSIONS matrix
    - **Property 7: Sidebar navigation filtering** — only permitted items shown
    - **Validates: Requirements 2.1, 2.3, 6.7, 6.8, 6.9, 9.5, 9.8, 13.1, 15.9, 16.5, 18.2, 18.5, 18.6, 19.6**

  - [x] 14.4 Write property test for pagination calculation
    - File: `apps/web/src/components/shared/__tests__/pagination.property.spec.ts`
    - **Property 9: Pagination calculation correctness** — totalPages, skip, boundary disabling
    - **Property 10: Filter application resets to page 1**
    - **Validates: Requirements 4.5, 8.6, 17.5, 4.3, 8.3, 17.3**

  - [x] 14.5 Write property test for search debounce
    - File: `apps/web/src/hooks/__tests__/debounce.property.spec.ts`
    - **Property 11: Search debounce behavior** — API called only after 300ms idle
    - **Validates: Requirements 4.2**

  - [x] 14.6 Write property test for receipt display completeness
    - File: `apps/web/src/app/(dashboard)/receipts/__tests__/receipt.property.spec.ts`
    - **Property 20: Receipt display completeness** — all required fields present
    - **Validates: Requirements 11.2**

  - [x] 14.7 Write property test for API client token refresh
    - File: `apps/web/src/lib/__tests__/api-client.property.spec.ts`
    - **Property 21: Token refresh on 401** — single refresh attempt, retry on success, redirect on failure
    - **Property 16: API error display includes message and request ID**
    - **Validates: Requirements 1.5, 22.2, 22.3**

  - [x] 14.8 Write property test for middleware redirect
    - File: `apps/web/src/lib/__tests__/middleware.property.spec.ts`
    - **Property 22: Middleware redirect for unauthenticated requests** — redirect to /login with redirect param
    - **Validates: Requirements 1.6**

- [x] 15. E2E tests (Playwright)
  - [x] 15.1 Set up Playwright test infrastructure
    - Configure Playwright for `apps/web/` with MSW handlers for API mocking
    - Create `apps/web/test/setup/msw-handlers.ts` with mock API responses
    - Configure mobile and desktop viewports
    - _Requirements: 24.1, 24.2_

  - [x] 15.2 Write E2E test: Login → Dashboard → Navigate
    - File: `apps/web/test/e2e/login.playwright.spec.ts`
    - Test login with valid credentials, verify dashboard loads, navigate to customers
    - Test invalid credentials error display
    - Test session expiry → refresh → continued operation
    - _Requirements: 1.1, 1.2, 1.5_

  - [x] 15.3 Write E2E test: Customer creation flow
    - File: `apps/web/test/e2e/customer-onboarding.playwright.spec.ts`
    - Test form validation errors (invalid Aadhaar, PAN, mobile)
    - Test successful customer creation → redirect to list
    - _Requirements: 5.1, 5.2, 5.3, 5.5_

  - [x] 15.4 Write E2E test: Loan lifecycle
    - File: `apps/web/test/e2e/loan-application.playwright.spec.ts`
    - Test loan creation → approval → disbursement flow
    - Verify action buttons appear/disappear based on loan status
    - _Requirements: 7.1, 9.5, 9.6, 9.8, 9.9_

  - [x] 15.5 Write E2E test: Collection posting (mobile viewport)
    - File: `apps/web/test/e2e/collection-posting.playwright.spec.ts`
    - Test mobile viewport collection flow: search loan → enter amount → confirm → receipt
    - Verify large touch targets and mobile layout
    - _Requirements: 10.1, 10.3, 10.6, 10.9, 10.11_

  - [x] 15.6 Write E2E test: RBAC enforcement
    - File: `apps/web/test/e2e/confirmation-dialogs.playwright.spec.ts`
    - Test unauthorized route shows Access Denied
    - Test action buttons hidden for unauthorized roles
    - _Requirements: 2.2, 2.3_

- [x] 16. Final checkpoint — All tests pass
  - All 38 requirements implemented across gap-fill tasks and core pages
  - Property tests validate 22 correctness properties
  - E2E tests cover critical user flows

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate the 22 universal correctness properties from the design document
- All finance mutations use idempotency keys and ConfirmDialogs — no optimistic updates
- All money displayed via MoneyDisplay (paise→INR), all dates via DateDisplay (UTC→IST)
- The design uses TypeScript throughout — all implementation in TypeScript with strict mode
- **Gap-fill tasks (13.5.x)** address 7 gaps found during deep analysis: group lending, foreclosure, penalties, loan product admin, customer edit, password change, and loan submit/review workflow steps
- Requirements 26–32 were added in first gap analysis to close gaps against the backend API surface and product steering
- Requirements 33–38 were added in second gap analysis covering: loan status history timeline, family/guarantor management from detail page, document viewer with signed URLs, disbursement mode selection, collection list filtering, and session timeout warning
- Total: 38 requirements, 22 correctness properties, ~65 implementation sub-tasks
