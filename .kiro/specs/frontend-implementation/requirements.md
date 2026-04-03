# Requirements Document

## Introduction

This specification covers making the AS Finance LMS Next.js frontend fully functional. The backend API (`apps/api/`) is complete with 1499 passing tests. The frontend at `apps/web/` has page shells, an API client with JWT refresh handling, an auth provider, RBAC-aware sidebar navigation, shared UI components (MoneyDisplay, StatusBadge, ConfirmDialog, LoadingSpinner, ErrorMessage, PaginationControls), and TanStack Query hooks for customers, loans, and collections. The goal is to evolve these shells into production-ready, finance-safe, mobile-friendly pages that consume the complete API surface — covering auth, dashboard, customer management, loan workflows, collection posting, receipts, reversals, accounting, cashbook, reports, audit, user management, and settings.

## Glossary

- **Frontend**: The Next.js 14+ App Router application at `apps/web/`
- **API_Client**: The typed fetch wrapper at `apps/web/src/lib/api-client.ts` with JWT injection and refresh token handling
- **Auth_Provider**: The React context provider managing login, logout, session restore, and user state
- **Dashboard_Page**: The role-aware home page displaying KPI cards and alerts
- **Customer_Form**: The React Hook Form + Zod validated form for creating and editing customers
- **Customer_List**: The paginated, searchable, filterable customer table page
- **Customer_Detail**: The page displaying a single customer's profile, family members, guarantors, documents, and loans
- **Loan_Form**: The form for creating a new loan application
- **Loan_List**: The paginated, status-filterable loan table page
- **Loan_Detail**: The page displaying loan info, schedule, collections, and action buttons
- **Collection_Form**: The mobile-first form for posting a payment collection
- **Collection_List**: The paginated collection history table
- **Receipt_View**: The printable receipt display component
- **Reversal_Form**: The form for reversing a posted collection with mandatory reason
- **Accounting_Pages**: The daybook, trial balance, P&L, and balance sheet views
- **Cashbook_Page**: The daily cashbook summary, expense entry, and cash handover views
- **Report_Pages**: The report generation views with date range filters and export
- **Audit_Page**: The searchable, filterable audit log viewer
- **User_Management**: The user list, create, edit, and role assignment pages
- **Settings_Page**: The system settings and holiday calendar management page
- **Sidebar_Nav**: The RBAC-aware navigation component filtering menu items by user role
- **Confirm_Dialog**: The reusable confirmation dialog for destructive and finance-affecting actions
- **Money_Display**: The component formatting integer paise to INR with Indian comma grouping
- **Status_Badge**: The component rendering color-coded status labels for loans, customers, installments, and collections
- **Middleware**: The Next.js edge middleware performing route-level auth gating via JWT cookie inspection
- **RBAC**: Role-Based Access Control using the shared permission matrix from `packages/shared`
- **Paise**: Integer representation of Indian currency (100 paise = 1 INR)
- **IST**: India Standard Time (Asia/Kolkata), the timezone for all user-facing dates
- **Idempotency_Key**: A UUID sent via `X-Idempotency-Key` header to prevent duplicate finance mutations
- **Maker_Checker**: The approval workflow where one user creates an action and another authorized user approves it


## Requirements

### Requirement 1: Authentication Flow

**User Story:** As any user, I want to log in with my credentials and have my session managed securely, so that I can access the system according to my role.

#### Acceptance Criteria

1. WHEN a user submits valid credentials on the login page, THE Auth_Provider SHALL call `POST /auth/login`, store the access token in memory and a cookie, and redirect the user to the dashboard.
2. WHEN the API returns HTTP 401 for invalid credentials, THE Frontend SHALL display "Invalid username or password." in an alert on the login page.
3. WHEN the API returns HTTP 423 for a locked account, THE Frontend SHALL display "Account is locked. Please try again later." in an alert on the login page.
4. WHEN the API returns a network error, THE Frontend SHALL display "Unable to connect to server. Please check your connection." in an alert on the login page.
5. WHEN the access token expires and an API call returns HTTP 401, THE API_Client SHALL automatically attempt a single refresh via `POST /auth/refresh` with the httpOnly cookie, retry the original request on success, and redirect to login on failure.
6. THE Middleware SHALL redirect unauthenticated requests (missing or expired JWT cookie) to `/login` with a `redirect` query parameter preserving the intended destination.
7. WHEN a user clicks "Sign out", THE Auth_Provider SHALL call `POST /auth/logout`, clear the access token from memory and cookie, and redirect to the login page.
8. WHILE the Auth_Provider is restoring a session on page load, THE Frontend SHALL display a full-screen loading spinner.
9. WHEN login succeeds and a `redirect` query parameter is present, THE Frontend SHALL navigate to the redirect path instead of the default dashboard.

### Requirement 2: Role-Based Route Protection and UI Visibility

**User Story:** As a system administrator, I want the frontend to enforce role-based access so that users only see and access features permitted by their role.

#### Acceptance Criteria

1. THE Sidebar_Nav SHALL render only navigation items for which the current user's role has the corresponding read permission in the shared PERMISSIONS matrix.
2. WHEN a user navigates to a route for which the user's role lacks the required permission, THE Frontend SHALL display an "Access Denied" message instead of the page content.
3. THE Frontend SHALL hide action buttons (create, edit, delete, approve, reject, disburse, reverse) for which the current user's role lacks the corresponding permission.
4. THE Frontend SHALL use the shared PERMISSIONS constant from `@as-finance/shared/constants` for all client-side permission checks.
5. THE Frontend SHALL treat client-side RBAC as a UX convenience and rely on server-side enforcement as the authoritative access control.

### Requirement 3: Dashboard

**User Story:** As a manager or officer, I want a role-aware dashboard showing key metrics and alerts, so that I can quickly assess the business state.

#### Acceptance Criteria

1. WHEN the dashboard page loads, THE Dashboard_Page SHALL fetch KPI data from `GET /dashboard` and display cards for total customers, active loans, overdue loans, pending approvals, total outstanding, today's collections, and cash in hand.
2. THE Dashboard_Page SHALL display all money values using the Money_Display component with INR formatting and Indian comma grouping.
3. WHEN the KPI data includes overdue loans greater than zero, THE Dashboard_Page SHALL highlight the overdue loans card with a danger variant.
4. WHILE the dashboard data is loading, THE Dashboard_Page SHALL display a loading spinner.
5. IF the dashboard API call fails, THEN THE Dashboard_Page SHALL display an error message with the failure reason.
6. THE Dashboard_Page SHALL link each KPI card to the relevant list page (customers, loans, collections).

### Requirement 4: Customer List with Search, Filter, and Pagination

**User Story:** As an office staff member, I want to browse, search, and filter customers, so that I can quickly find customer records.

#### Acceptance Criteria

1. WHEN the customer list page loads, THE Customer_List SHALL fetch paginated customers from `GET /customers` with `skip` and `take` query parameters.
2. WHEN a user types in the search input, THE Customer_List SHALL debounce the input and send a `search` query parameter to filter by name or mobile.
3. WHEN a user selects a status filter, THE Customer_List SHALL send a `status` query parameter and reset to page 1.
4. THE Customer_List SHALL display customer name (as a link to detail), mobile, city, and status badge in a responsive table.
5. THE Customer_List SHALL provide pagination controls showing current page and total pages.
6. WHILE customer data is loading, THE Customer_List SHALL display a loading spinner.
7. IF the customer list API call fails, THEN THE Customer_List SHALL display an error message.
8. WHEN no customers match the search or filter, THE Customer_List SHALL display "No customers found." in the table body.

### Requirement 5: Customer Registration with KYC Validation

**User Story:** As a field officer, I want to register a new customer with validated KYC details, so that customer data is accurate from the start.

#### Acceptance Criteria

1. THE Customer_Form SHALL validate Aadhaar as exactly 12 digits using the shared `aadhaarSchema` from `packages/shared`.
2. THE Customer_Form SHALL validate PAN as 5 uppercase letters followed by 4 digits followed by 1 uppercase letter using the shared `panSchema`.
3. THE Customer_Form SHALL validate mobile as a 10-digit number starting with 6-9 using the shared `mobileSchema`.
4. THE Customer_Form SHALL validate pincode as exactly 6 digits using the shared `pincodeSchema`.
5. WHEN the form is submitted with valid data, THE Customer_Form SHALL call `POST /customers` and navigate to the customer list on success.
6. IF the API returns a validation error (HTTP 400), THEN THE Customer_Form SHALL display the server error message above the form.
7. IF the API returns a conflict error (HTTP 409) for duplicate Aadhaar or mobile, THEN THE Customer_Form SHALL display a specific duplicate message.
8. WHILE the form is submitting, THE Customer_Form SHALL disable the submit button and show a "Saving…" indicator.
9. THE Customer_Form SHALL include fields for full name, father/husband name, mobile, alternate mobile, Aadhaar, PAN, date of birth, age, gender, occupation, monthly income, address line 1, address line 2, city, district, state, pincode, and notes.
10. THE Customer_Form SHALL use the shared `createCustomerSchema` from `packages/shared/validation` for client-side validation.


### Requirement 6: Customer Detail Page

**User Story:** As an officer, I want to view a customer's full profile including family members, guarantors, documents, and linked loans, so that I can assess the customer holistically.

#### Acceptance Criteria

1. WHEN the customer detail page loads, THE Customer_Detail SHALL fetch the customer from `GET /customers/:id` including family members and guarantors.
2. THE Customer_Detail SHALL display the customer's Aadhaar masked as `XXXX-XXXX-{last4}` using the last four digits from the API response.
3. THE Customer_Detail SHALL display PAN masked as `XXXXXX{last4}` when available.
4. THE Customer_Detail SHALL display money values (monthly income) using the Money_Display component.
5. THE Customer_Detail SHALL display family members in a list showing name, relationship, and contact number.
6. THE Customer_Detail SHALL display guarantors in a list showing name, relationship, and mobile.
7. WHERE the user's role has `customer.upload_doc` permission, THE Customer_Detail SHALL display a document upload section accepting JPEG, PNG, and PDF files up to 5MB.
8. WHERE the user's role has `customer.blacklist` permission and the customer status is active, THE Customer_Detail SHALL display a "Blacklist" button that opens a Confirm_Dialog requiring a reason.
9. WHERE the user's role has `customer.blacklist` permission and the customer status is blacklisted, THE Customer_Detail SHALL display a "Reinstate" button that opens a Confirm_Dialog.
10. WHILE customer data is loading, THE Customer_Detail SHALL display a loading spinner.
11. IF the customer is not found (HTTP 404), THEN THE Customer_Detail SHALL display "Customer not found".
12. THE Customer_Detail SHALL display a list of the customer's loans with loan number, principal, status, and outstanding as links to the loan detail page.

### Requirement 7: Loan Application Form

**User Story:** As a field officer, I want to create a loan application for a customer, so that the loan can enter the approval workflow.

#### Acceptance Criteria

1. THE Loan_Form SHALL require customer selection, loan product version selection, principal amount (in rupees, converted to paise on submit), tenure in months, and purpose.
2. THE Loan_Form SHALL validate that principal is a positive amount and tenure is at least 1 month.
3. WHEN the form is submitted with valid data, THE Loan_Form SHALL call `POST /loans` with the principal converted to integer paise and navigate to the loan list on success.
4. IF the API returns a validation or business error, THEN THE Loan_Form SHALL display the server error message.
5. WHILE the form is submitting, THE Loan_Form SHALL disable the submit button and show a "Submitting…" indicator.
6. THE Loan_Form SHALL provide a customer search/select input rather than requiring a raw UUID.
7. THE Loan_Form SHALL provide a loan product dropdown populated from `GET /loan-products`.

### Requirement 8: Loan List with Status Filters

**User Story:** As a manager, I want to browse loans filtered by status, so that I can focus on loans needing attention.

#### Acceptance Criteria

1. WHEN the loan list page loads, THE Loan_List SHALL fetch paginated loans from `GET /loans` with `skip`, `take`, and optional `status` query parameters.
2. THE Loan_List SHALL display status filter buttons for All, Draft, Submitted, Under Review, Approved, Active, Overdue, and Closed.
3. WHEN a user selects a status filter, THE Loan_List SHALL refetch with the selected status and reset to page 1.
4. THE Loan_List SHALL display loan number (as a link to detail), customer name, principal (formatted INR), status badge, and outstanding (formatted INR) in a responsive table.
5. THE Loan_List SHALL highlight overdue loans with the appropriate overdue status badge variant.
6. THE Loan_List SHALL provide pagination controls.
7. WHILE loan data is loading, THE Loan_List SHALL display a loading spinner.
8. IF the loan list API call fails, THEN THE Loan_List SHALL display an error message.

### Requirement 9: Loan Detail Page with Schedule and Actions

**User Story:** As a manager, I want to view a loan's full details, repayment schedule, and perform approval/rejection/disbursement actions, so that I can manage the loan lifecycle.

#### Acceptance Criteria

1. WHEN the loan detail page loads, THE Loan_Detail SHALL fetch the loan from `GET /loans/:id` including the repayment schedule.
2. THE Loan_Detail SHALL display summary cards for principal, outstanding, and tenure with money values formatted in INR.
3. THE Loan_Detail SHALL display the repayment schedule in a table with installment number, due date, principal, interest, total, and status badge per row.
4. THE Loan_Detail SHALL highlight overdue installments with the danger status badge variant.
5. WHERE the user's role has `loan.approve` permission and the loan status is `submitted` or `under_review`, THE Loan_Detail SHALL display "Approve" and "Reject" buttons.
6. WHEN the user clicks "Approve", THE Loan_Detail SHALL open a Confirm_Dialog and on confirmation call `POST /loans/:id/approve`.
7. WHEN the user clicks "Reject", THE Loan_Detail SHALL open a Confirm_Dialog requiring a reason and on confirmation call `POST /loans/:id/reject` with the reason.
8. WHERE the user's role has `loan.disburse` permission and the loan status is `approved`, THE Loan_Detail SHALL display a "Disburse" button.
9. WHEN the user clicks "Disburse", THE Loan_Detail SHALL open a Confirm_Dialog and on confirmation call `POST /loans/:id/disburse` with an idempotency key.
10. WHILE any action is in progress, THE Loan_Detail SHALL disable all action buttons and show a loading indicator on the active button.
11. WHEN an action succeeds, THE Loan_Detail SHALL display a success message and refetch the loan data.
12. IF an action fails, THEN THE Loan_Detail SHALL display the error message from the API response.
13. THE Loan_Detail SHALL display the loan's collection history fetched from `GET /collections?loanId=:id`.

### Requirement 10: Collection Posting (Mobile-First)

**User Story:** As a collection officer in the field, I want to post a payment collection using a mobile-friendly form, so that I can record payments on-site.

#### Acceptance Criteria

1. THE Collection_Form SHALL provide a loan search/select input for finding the loan by loan number or customer name.
2. THE Collection_Form SHALL display the selected loan's outstanding balance, customer name, and loan number before the officer enters the payment amount.
3. THE Collection_Form SHALL accept payment amount in rupees (converted to integer paise on submit) with a large, touch-friendly numeric input.
4. THE Collection_Form SHALL provide payment mode selection (Cash, Bank Transfer, Online) with large, tappable option buttons.
5. THE Collection_Form SHALL default the payment date to today's date in IST.
6. WHEN the form is submitted, THE Collection_Form SHALL open a Confirm_Dialog showing the loan number, customer name, amount, and payment mode for confirmation before posting.
7. WHEN the user confirms, THE Collection_Form SHALL call `POST /collections` with an idempotency key via the `X-Idempotency-Key` header.
8. WHILE the collection is posting, THE Collection_Form SHALL disable all inputs and the submit button and show a "Posting…" indicator.
9. WHEN the collection posts successfully, THE Collection_Form SHALL navigate to the receipt view for the newly created receipt.
10. IF the collection API call fails, THEN THE Collection_Form SHALL display the error message and re-enable the form for correction.
11. THE Collection_Form SHALL use large touch targets (minimum 44px height) for all interactive elements to support field use on mobile devices.
12. THE Collection_Form SHALL prevent double submission by disabling the submit button immediately on click and using the idempotency key.


### Requirement 11: Receipt Display and Printing

**User Story:** As a collection officer, I want to view and print a payment receipt after posting a collection, so that I can provide proof of payment to the customer.

#### Acceptance Criteria

1. WHEN the receipt page loads, THE Receipt_View SHALL fetch the receipt from `GET /receipts/:id`.
2. THE Receipt_View SHALL display receipt number, date, customer name, loan number, amount paid, payment mode, allocation breakdown (penalty, interest, principal), outstanding balance after payment, and collected-by officer name.
3. THE Receipt_View SHALL display all money values using the Money_Display component with INR formatting.
4. THE Receipt_View SHALL provide a "Print" button that triggers the browser print dialog with a print-optimized CSS layout.
5. THE Receipt_View SHALL render a print layout compatible with both thermal printers (58mm/80mm) and A4 paper using CSS `@media print` rules.
6. WHEN a receipt has status `reversed`, THE Receipt_View SHALL display a prominent "REVERSED" watermark overlay.
7. WHILE receipt data is loading, THE Receipt_View SHALL display a loading spinner.
8. IF the receipt is not found, THEN THE Receipt_View SHALL display "Receipt not found".

### Requirement 12: Receipt History per Loan

**User Story:** As a manager, I want to view all receipts for a specific loan, so that I can audit the payment history.

#### Acceptance Criteria

1. THE Loan_Detail SHALL include a receipts section fetching receipts from `GET /receipts?loanId=:id`.
2. THE receipts section SHALL display receipt number, date, amount, payment mode, and status badge in a table.
3. WHEN a user clicks a receipt row, THE Frontend SHALL navigate to the receipt detail page.
4. WHERE a receipt has status `reversed`, THE receipts section SHALL display the reversed status badge.

### Requirement 13: Collection Reversal Workflow

**User Story:** As a manager, I want to reverse an incorrect collection with a mandatory reason, so that the ledger is corrected via compensating entries.

#### Acceptance Criteria

1. WHERE the user's role has `collection.reverse` permission, THE Collection_List or Loan_Detail SHALL display a "Reverse" button next to posted (non-reversed) collections.
2. WHEN the user clicks "Reverse", THE Reversal_Form SHALL open a dialog requiring a mandatory reason/remarks field (minimum 10 characters).
3. WHEN the user confirms the reversal, THE Reversal_Form SHALL call `POST /reversals` with the collection ID, reason, and an idempotency key.
4. WHILE the reversal is processing, THE Reversal_Form SHALL disable the confirm button and show a "Reversing…" indicator.
5. WHEN the reversal succeeds, THE Frontend SHALL display a success message and refetch the collection and loan data.
6. IF the reversal fails, THEN THE Frontend SHALL display the error message from the API response.
7. THE Reversal_Form SHALL display the collection details (amount, date, loan number) in the confirmation dialog for verification before submission.

### Requirement 14: Accounting Pages

**User Story:** As an accountant, I want to view the daybook, trial balance, profit & loss, and balance sheet, so that I can monitor the financial health of the business.

#### Acceptance Criteria

1. THE Accounting_Pages SHALL provide a chart of accounts view fetched from `GET /accounting/chart-of-accounts` displaying account code, name, and category.
2. THE Accounting_Pages SHALL provide a daybook view fetched from `GET /accounting/daybook` with date range filters, displaying journal entries with their debit and credit lines.
3. THE Accounting_Pages SHALL provide a trial balance view fetched from `GET /accounting/trial-balance` with a date range filter, displaying account names with debit and credit totals.
4. THE Accounting_Pages SHALL provide a profit & loss view fetched from `GET /accounting/profit-loss` with a date range filter, displaying income and expense categories with totals.
5. THE Accounting_Pages SHALL provide a balance sheet view fetched from `GET /accounting/balance-sheet` with a date filter, displaying assets, liabilities, and equity with totals.
6. THE Accounting_Pages SHALL display all money values using the Money_Display component.
7. WHILE any accounting data is loading, THE Accounting_Pages SHALL display a loading spinner.
8. IF any accounting API call fails, THEN THE Accounting_Pages SHALL display an error message.

### Requirement 15: Cashbook

**User Story:** As an accountant, I want to view the daily cashbook, record expenses, and manage cash handovers, so that I can track cash flow accurately.

#### Acceptance Criteria

1. WHEN the cashbook page loads, THE Cashbook_Page SHALL fetch the daily summary from `GET /cashbook/daily-summary` for the selected date, displaying opening balance, inflows, outflows, closing balance, and transaction count.
2. THE Cashbook_Page SHALL provide a date picker to select the summary date, defaulting to today in IST.
3. WHEN a discrepancy is detected in the cashbook summary, THE Cashbook_Page SHALL display a warning indicator.
4. THE Cashbook_Page SHALL provide a link to the expense entry form at `/cashbook/expenses/new`.
5. THE expense entry form SHALL accept expense category, amount (in rupees, converted to paise), date, description, and payment mode, and call `POST /cashbook/expenses` on submit.
6. WHILE the expense is submitting, THE expense form SHALL disable the submit button and show a "Recording…" indicator.
7. THE Cashbook_Page SHALL provide a link to the cash handover page at `/cashbook/handovers`.
8. THE cash handover page SHALL display pending handovers and allow collection officers to initiate a handover with amount and remarks, calling `POST /cashbook/handovers`.
9. WHERE the user's role has `handover.verify` permission, THE cash handover page SHALL display a "Verify" button for pending handovers.
10. THE Cashbook_Page SHALL display all money values using the Money_Display component.

### Requirement 16: Reports with Export

**User Story:** As a manager, I want to generate reports with date range filters and export them to PDF or Excel, so that I can analyze business performance and share reports.

#### Acceptance Criteria

1. THE Report_Pages SHALL display a report index page listing available report types: Collection Summary, Outstanding, Disbursement, Overdue, Demand, and Portfolio.
2. WHEN a user selects a report type, THE Report_Pages SHALL navigate to a report detail page with date range filters (start date, end date).
3. WHEN the user applies date filters, THE Report_Pages SHALL fetch report data from the corresponding `GET /reports/:type` endpoint.
4. THE Report_Pages SHALL display report data in a tabular format with money values formatted in INR.
5. WHERE the user's role has `report.export` permission, THE Report_Pages SHALL display "Export PDF" and "Export Excel" buttons.
6. WHEN the user clicks an export button, THE Report_Pages SHALL call the export endpoint and trigger a file download.
7. WHILE report data is loading or exporting, THE Report_Pages SHALL display a loading indicator.
8. IF the report API call fails, THEN THE Report_Pages SHALL display an error message.


### Requirement 17: Audit Log Viewer

**User Story:** As an auditor, I want to search and filter audit logs by entity, action, actor, and date range, so that I can trace every finance-affecting mutation.

#### Acceptance Criteria

1. WHEN the audit page loads, THE Audit_Page SHALL fetch paginated audit logs from `GET /audit-logs` with `skip` and `take` parameters.
2. THE Audit_Page SHALL provide filter inputs for target entity type, action type, and start date.
3. WHEN a user applies filters, THE Audit_Page SHALL refetch with the filter parameters and reset to page 1.
4. THE Audit_Page SHALL display timestamp (formatted in IST), action type, actor ID with role, target entity with ID, and remarks in a responsive table.
5. THE Audit_Page SHALL provide pagination controls.
6. WHILE audit data is loading, THE Audit_Page SHALL display a loading spinner.
7. IF the audit API call fails, THEN THE Audit_Page SHALL display an error message.
8. WHEN no audit logs match the filters, THE Audit_Page SHALL display "No audit logs found."

### Requirement 18: User Management

**User Story:** As a super admin, I want to create, view, edit, and manage user accounts with role and area assignments, so that I can control system access.

#### Acceptance Criteria

1. THE User_Management SHALL display a paginated user list fetched from `GET /users` showing full name, username, role, mobile, and active status.
2. WHERE the user's role has `user.create` permission, THE User_Management SHALL display a "New User" button linking to a user creation form.
3. THE user creation form SHALL accept username, full name, mobile, password (validated against the shared `passwordSchema`), role selection, and optional area assignment.
4. WHEN the user creation form is submitted, THE User_Management SHALL call `POST /users` and navigate to the user list on success.
5. WHERE the user's role has `user.update` permission, THE User_Management SHALL allow editing a user's full name, mobile, role, active status, and area assignment via `PATCH /users/:id`.
6. WHERE the user's role has `user.change_role` permission, THE User_Management SHALL display a role change dropdown in the edit form.
7. WHILE any user management action is in progress, THE User_Management SHALL disable the submit button and show a loading indicator.
8. IF any user management API call fails, THEN THE User_Management SHALL display the error message.

### Requirement 19: Settings and Holiday Calendar

**User Story:** As a super admin, I want to manage system settings and the holiday calendar, so that business rules like due date adjustments work correctly.

#### Acceptance Criteria

1. WHEN the settings page loads, THE Settings_Page SHALL fetch all settings from `GET /settings` and display them as editable key-value pairs.
2. WHEN the user modifies settings and clicks "Save Changes", THE Settings_Page SHALL call `PATCH /settings` with only the changed settings.
3. WHILE settings are saving, THE Settings_Page SHALL disable the save button and show a "Saving…" indicator.
4. IF the settings API call fails, THEN THE Settings_Page SHALL display the error message.
5. THE Settings_Page SHALL include a holiday calendar section fetched from `GET /settings/holidays` displaying holidays for the current year.
6. WHERE the user's role has `settings.update` permission, THE Settings_Page SHALL allow adding new holidays (date and description) and removing existing holidays.

### Requirement 20: Money Display and Formatting

**User Story:** As any user, I want all money values displayed in INR with Indian comma grouping, so that amounts are readable and unambiguous.

#### Acceptance Criteria

1. THE Money_Display component SHALL convert integer paise to rupees and format with Indian comma grouping (last 3 digits, then groups of 2).
2. THE Money_Display component SHALL prefix amounts with the ₹ symbol.
3. THE Money_Display component SHALL display two decimal places for paise.
4. WHEN the amount is negative, THE Money_Display component SHALL prefix with a minus sign and apply a red color by default.
5. THE Money_Display component SHALL use tabular-nums CSS for aligned numeric columns.
6. THE Frontend SHALL perform paise-to-rupees conversion only at the display layer and transmit integer paise to the API.

### Requirement 21: Confirm Dialogs for Finance-Affecting Actions

**User Story:** As any user, I want confirmation dialogs before all destructive or finance-affecting actions, so that I do not accidentally trigger irreversible operations.

#### Acceptance Criteria

1. THE Frontend SHALL display a Confirm_Dialog before executing: loan approval, loan rejection, loan disbursement, collection posting, collection reversal, customer blacklisting, customer reinstatement, expense recording, and cash handover.
2. THE Confirm_Dialog SHALL display a title, description of the action, and the key details (amount, entity name) being acted upon.
3. THE Confirm_Dialog SHALL provide "Cancel" and "Confirm" buttons, with the confirm button styled as destructive for irreversible actions.
4. WHILE the confirmed action is processing, THE Confirm_Dialog SHALL disable both buttons and show a loading spinner on the confirm button.
5. THE Frontend SHALL wait for the authoritative server response before closing the dialog or updating the UI (no optimistic updates for finance mutations).

### Requirement 22: Loading States and Error Handling

**User Story:** As any user, I want clear loading indicators and error messages for all remote actions, so that I always know the system state.

#### Acceptance Criteria

1. WHILE any API request is in flight, THE Frontend SHALL display a loading indicator appropriate to the context (full-page spinner for page loads, inline spinner for actions, skeleton for lists).
2. IF any API request fails, THEN THE Frontend SHALL display the error message from the API response body, or a generic "Something went wrong" message if the body is unavailable.
3. THE Frontend SHALL include the request ID in error displays when available, so users can reference it for support.
4. THE Frontend SHALL provide a retry mechanism (refetch button or automatic retry) for failed read operations.
5. THE Frontend SHALL display explicit success messages (toast or inline) after successful write operations (create, update, approve, disburse, reverse).

### Requirement 23: Date and Timezone Display

**User Story:** As any user, I want all dates displayed in IST (India Standard Time), so that dates match the business context.

#### Acceptance Criteria

1. THE Frontend SHALL display all user-facing dates and timestamps formatted in IST (Asia/Kolkata timezone).
2. THE Frontend SHALL format dates as `DD-MMM-YYYY` (e.g., "15-Jan-2024") for date-only fields.
3. THE Frontend SHALL format timestamps as `DD-MMM-YYYY HH:mm` in IST for datetime fields.
4. THE Frontend SHALL send dates to the API as ISO 8601 strings.
5. WHEN a date input is used, THE Frontend SHALL default to today's date in IST.

### Requirement 24: Responsive and Mobile-First Design

**User Story:** As a collection officer using a mobile device in the field, I want the collection workflow to be optimized for touch interaction, so that I can work efficiently on small screens.

#### Acceptance Criteria

1. THE Collection_Form SHALL use a mobile-first layout with full-width inputs, large touch targets (minimum 44px height), and minimal scrolling.
2. THE Frontend SHALL use responsive breakpoints: mobile-first base styles, `sm:` for tablets (640px+), `md:` for small desktops (768px+), `lg:` for desktops (1024px+).
3. THE Dashboard layout SHALL collapse the sidebar into a hamburger menu on screens below `lg` breakpoint.
4. THE data tables SHALL hide non-essential columns on smaller screens using responsive visibility classes.
5. THE Frontend SHALL use `inputMode="numeric"` on numeric inputs for mobile keyboard optimization.

### Requirement 25: PII Masking in UI

**User Story:** As a compliance officer, I want sensitive identity numbers masked in the UI, so that PII exposure is minimized.

#### Acceptance Criteria

1. THE Frontend SHALL display Aadhaar numbers masked as `XXXX-XXXX-{last4}` using only the last four digits provided by the API.
2. THE Frontend SHALL display PAN numbers masked as `XXXXXX{last4}` using only the last four characters provided by the API.
3. THE Frontend SHALL display full mobile numbers only to roles with customer read permission.
4. THE Frontend SHALL use the masking utilities from `packages/shared/src/utils/masking.ts` for consistent masking.


### Requirement 26: Group Lending Management

**User Story:** As a manager, I want to create groups, manage group members, and post group collections, so that I can handle joint-liability group lending workflows.

#### Acceptance Criteria

1. THE Frontend SHALL provide a group list page fetched from `GET /groups` with pagination, displaying group name, leader name, member count, meeting day, and status badge.
2. WHERE the user's role has `group.create` permission, THE Frontend SHALL display a "New Group" button linking to a group creation form.
3. THE group creation form SHALL accept group name, meeting day, branch/area, and leader selection (customer search), and call `POST /groups` on submit.
4. THE Frontend SHALL provide a group detail page fetched from `GET /groups/:id` displaying group info, member list, and group collection history.
5. WHERE the user's role has `group.add_member` permission, THE group detail page SHALL allow adding members via customer search and calling `POST /groups/:id/members`.
6. WHERE the user's role has `group.collect` permission, THE group detail page SHALL provide a "Post Group Collection" button that opens a form for posting collections against all active group loans simultaneously.
7. THE group collection form SHALL display each member's loan with outstanding balance and allow entering individual payment amounts, then call `POST /group-collections` with all member payments in a single request.

### Requirement 27: Foreclosure Workflow

**User Story:** As a manager, I want to generate foreclosure quotes, approve them, and execute settlements, so that loans can be closed early with correct settlement amounts.

#### Acceptance Criteria

1. WHERE the user's role has `loan.foreclosure` permission and the loan status is `active` or `overdue`, THE Loan_Detail SHALL display a "Foreclosure" button.
2. WHEN the user clicks "Foreclosure", THE Frontend SHALL call `POST /foreclosures/quote` to generate a settlement quote and display the quote details: outstanding principal, accrued interest, pending penalties, rebate (if any), and total settlement amount.
3. THE foreclosure quote display SHALL show the quote expiry time (24 hours from creation) with a countdown or expiry timestamp.
4. WHERE the user's role has `loan.foreclosure_approve` permission, THE Frontend SHALL display an "Approve & Execute" button on the quote.
5. WHEN the user clicks "Approve & Execute", THE Frontend SHALL open a Confirm_Dialog showing the settlement amount and on confirmation call `POST /foreclosures/:id/execute` with an idempotency key.
6. WHEN foreclosure execution succeeds, THE Frontend SHALL display a success message and navigate to the loan detail page showing the loan as closed.
7. IF the quote has expired, THEN THE Frontend SHALL display "Quote expired. Please generate a new quote." and disable the execute button.

### Requirement 28: Penalty Management

**User Story:** As a manager, I want to view penalties on a loan and waive penalties when justified, so that I can manage overdue situations fairly.

#### Acceptance Criteria

1. THE Loan_Detail SHALL include a penalties section fetched from `GET /penalties?loanId=:id` displaying penalty date, amount, period, status (pending/paid/waived), and installment reference.
2. WHERE the user's role has `penalty.waive` permission, THE penalties section SHALL display a "Waive" button next to pending (unpaid, unwaived) penalties.
3. WHEN the user clicks "Waive", THE Frontend SHALL open a Confirm_Dialog requiring a mandatory reason (minimum 10 characters) and an approver selection.
4. WHEN the waiver is confirmed, THE Frontend SHALL call `POST /penalties/:id/waive` with the reason and approver ID.
5. THE Loan_Detail SHALL display the loan's current DPD (Days Past Due) and overdue bucket classification.

### Requirement 29: Loan Product Administration

**User Story:** As a super admin, I want to create, edit, and deactivate loan products, so that I can configure the lending terms available to field officers.

#### Acceptance Criteria

1. THE Frontend SHALL provide a loan product list page fetched from `GET /loan-products` with pagination, displaying product name, interest type, rate, frequency, and active status.
2. WHERE the user's role has `loan_product.create` permission, THE Frontend SHALL display a "New Product" button linking to a product creation form.
3. THE product creation form SHALL accept name, interest type (flat/reducing balance), annual rate (bps), principal range (min/max in rupees), tenure range (min/max months), repayment frequency, processing fee config, penalty config, and allocation order.
4. WHEN the form is submitted, THE Frontend SHALL call `POST /loan-products` and navigate to the product list on success.
5. WHERE the user's role has `loan_product.update` permission, THE Frontend SHALL allow editing a product (creates a new version) via `PATCH /loan-products/:id`.
6. WHERE the user's role has `loan_product.deactivate` permission, THE Frontend SHALL display a "Deactivate" button with a Confirm_Dialog, calling `POST /loan-products/:id/deactivate`.

### Requirement 30: Customer Edit

**User Story:** As an office staff member, I want to edit a customer's non-KYC details, so that I can correct or update customer information.

#### Acceptance Criteria

1. WHERE the user's role has `customer.update` permission, THE Customer_Detail SHALL display an "Edit" button linking to a customer edit form.
2. THE customer edit form SHALL pre-populate all fields from the existing customer data.
3. THE customer edit form SHALL call `PATCH /customers/:id` on submit with only the changed fields.
4. THE customer edit form SHALL use the same shared validation schemas as the create form.
5. WHEN the edit succeeds, THE Frontend SHALL display a success toast and navigate back to the customer detail page.

### Requirement 31: Password Change

**User Story:** As any user, I want to change my password, so that I can maintain account security.

#### Acceptance Criteria

1. THE Frontend SHALL provide a "Change Password" option accessible from the user profile menu or settings.
2. THE password change form SHALL accept current password, new password, and confirm new password.
3. THE password change form SHALL validate the new password against the shared `passwordSchema`.
4. WHEN the form is submitted, THE Frontend SHALL call `POST /auth/change-password` and display a success message on completion.
5. IF the current password is incorrect, THEN THE Frontend SHALL display "Current password is incorrect."

### Requirement 32: Loan Submit and Review Actions

**User Story:** As a field officer, I want to submit a draft loan for review, and as a manager, I want to move a submitted loan to under review, so that the approval workflow progresses correctly.

#### Acceptance Criteria

1. WHERE the loan status is `draft` and the user's role has `loan.submit` permission, THE Loan_Detail SHALL display a "Submit for Review" button.
2. WHEN the user clicks "Submit for Review", THE Frontend SHALL call `POST /loans/:id/submit` and refetch the loan data on success.
3. WHERE the loan status is `submitted` and the user's role has `loan.review` permission, THE Loan_Detail SHALL display a "Start Review" button.
4. WHEN the user clicks "Start Review", THE Frontend SHALL call `POST /loans/:id/review` and refetch the loan data on success.


### Requirement 33: Loan Status History Timeline

**User Story:** As a manager, I want to see the complete status history of a loan, so that I can trace every approval, rejection, and transition decision.

#### Acceptance Criteria

1. THE Loan_Detail SHALL include a status history section fetched from the loan's `status_history` relation, displaying each transition with from_status, to_status, changed_by (user name), reason, and timestamp (DateDisplay with time).
2. THE status history SHALL be displayed in reverse chronological order (newest first).
3. THE status history SHALL use StatusBadge for from_status and to_status values.

### Requirement 34: Family Member and Guarantor Management

**User Story:** As a field officer, I want to add family members and guarantors to an existing customer, so that I can complete the customer profile after initial registration.

#### Acceptance Criteria

1. WHERE the user's role has `customer.update` permission, THE Customer_Detail SHALL display "Add Family Member" and "Add Guarantor" buttons.
2. WHEN the user clicks "Add Family Member", THE Frontend SHALL open a form dialog accepting name, relationship, contact number, occupation, and income contribution, and call `POST /customers/:id/family-members` on submit.
3. WHEN the user clicks "Add Guarantor", THE Frontend SHALL open a form dialog accepting name, relationship, mobile, Aadhaar, and address, and call `POST /customers/:id/guarantors` on submit.

### Requirement 35: Document Viewer

**User Story:** As an officer, I want to view uploaded KYC documents for a customer, so that I can verify identity during loan processing.

#### Acceptance Criteria

1. THE Customer_Detail SHALL display a documents section listing all uploaded documents with document type, upload date, and a "View" link.
2. WHEN the user clicks "View", THE Frontend SHALL fetch a signed URL from `GET /documents/:id/url` and open the document in a new browser tab.
3. THE signed URL SHALL expire after 15 minutes as enforced by the backend.

### Requirement 36: Disbursement Mode Selection

**User Story:** As a manager, I want to select the disbursement mode (cash or bank transfer) when disbursing a loan, so that the payment method is recorded correctly.

#### Acceptance Criteria

1. WHEN the user clicks "Disburse" on the Loan_Detail, THE Confirm_Dialog SHALL include a payment mode selector (Cash, Bank Transfer).
2. WHEN "Bank Transfer" is selected, THE Confirm_Dialog SHALL display a reference number input field.
3. THE disbursement API call SHALL include the selected `mode` and optional `referenceNumber` in the request body.

### Requirement 37: Collection List Filtering

**User Story:** As a collection officer, I want to filter collections by date and loan, so that I can review today's collections or a specific loan's payment history.

#### Acceptance Criteria

1. THE Collection_List SHALL provide a date range filter (start date, end date) defaulting to today.
2. THE Collection_List SHALL provide a loan search/filter input to filter by loan number.
3. WHEN filters are applied, THE Collection_List SHALL refetch with the filter parameters and reset to page 1.

### Requirement 38: Session Timeout Warning

**User Story:** As any user, I want to be warned before my session expires, so that I can save my work and re-authenticate without losing data.

#### Acceptance Criteria

1. WHEN the JWT access token has less than 2 minutes remaining before expiry, THE Frontend SHALL display a non-blocking toast warning: "Your session will expire soon. Please save your work."
2. THE Frontend SHALL attempt a silent token refresh when the warning triggers.
3. IF the silent refresh succeeds, THE Frontend SHALL dismiss the warning toast.
4. IF the silent refresh fails, THE Frontend SHALL redirect to login with the current path as the redirect parameter.
