/**
 * Canonical route paths — single source of truth used by both the app and the help content.
 *
 * Help content imports from here instead of inlining strings, so a rename in the app
 * surfaces as a typecheck error in the guide rather than as a stale doc.
 */
export const ROUTES = {
  // Auth
  LOGIN: '/login',

  // Top-level dashboard
  DASHBOARD: '/',

  // Customers
  CUSTOMERS: '/customers',
  CUSTOMER_NEW: '/customers/new',
  CUSTOMER_DETAIL: (id: string) => `/customers/${id}`,

  // Loans
  LOANS: '/loans',
  LOAN_NEW: '/loans/new',
  LOAN_DETAIL: (id: string) => `/loans/${id}`,

  // Loan Products
  LOAN_PRODUCTS: '/loan-products',
  LOAN_PRODUCT_NEW: '/loan-products/new',

  // Collections
  COLLECTIONS: '/collections',
  COLLECTION_NEW: '/collections/new',

  // Receipts
  RECEIPTS: '/receipts',
  RECEIPT_DETAIL: (id: string) => `/receipts/${id}`,

  // Groups
  GROUPS: '/groups',
  GROUP_NEW: '/groups/new',
  GROUP_DETAIL: (id: string) => `/groups/${id}`,
  GROUP_COLLECT: (id: string) => `/groups/${id}/collect`,

  // Accounting
  ACCOUNTING: '/accounting',
  TRIAL_BALANCE: '/accounting/trial-balance',
  PROFIT_LOSS: '/accounting/profit-loss',
  BALANCE_SHEET: '/accounting/balance-sheet',

  // Cashbook
  CASHBOOK: '/cashbook',
  CASHBOOK_EXPENSE_NEW: '/cashbook/expenses/new',
  CASHBOOK_HANDOVERS: '/cashbook/handovers',

  // Reports
  REPORTS: '/reports',

  // Users
  USERS: '/users',
  USER_NEW: '/users/new',
  USER_EDIT: (id: string) => `/users/${id}/edit`,

  // Other
  AUDIT: '/audit',
  NOTIFICATIONS: '/notifications',
  SETTINGS: '/settings',
  PROFILE_CHANGE_PASSWORD: '/profile/change-password',

  // Help
  HELP: '/help',
  HELP_CHAPTER: (chapter: string) => `/help/${chapter}`,
} as const;
