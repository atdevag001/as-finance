/**
 * Selector helpers using data-testid strategy.
 * All selectors use data-testid for resilience against CSS/text changes.
 */

export const sel = {
  byTestId: (id: string) => `[data-testid="${id}"]`,
  byRole: (role: string, name?: string) =>
    name ? `role=${role}[name="${name}"]` : `role=${role}`,
  submitButton: '[data-testid="submit-btn"]',
  cancelButton: '[data-testid="cancel-btn"]',
  confirmDialog: '[data-testid="confirm-dialog"]',
  confirmYes: '[data-testid="confirm-yes"]',
  confirmNo: '[data-testid="confirm-no"]',
  toast: '[data-testid="toast"]',
  loadingSpinner: '[data-testid="loading"]',
  errorMessage: '[data-testid="error-message"]',
  pagination: {
    next: '[data-testid="pagination-next"]',
    prev: '[data-testid="pagination-prev"]',
    page: (n: number) => `[data-testid="pagination-page-${n}"]`,
  },
  nav: {
    customers: '[data-testid="nav-customers"]',
    loans: '[data-testid="nav-loans"]',
    collections: '[data-testid="nav-collections"]',
    accounting: '[data-testid="nav-accounting"]',
    cashbook: '[data-testid="nav-cashbook"]',
    reports: '[data-testid="nav-reports"]',
    audit: '[data-testid="nav-audit"]',
    settings: '[data-testid="nav-settings"]',
  },
};
