/**
 * E2E Test Fixtures
 *
 * Central export point for all test fixtures.
 *
 * @module fixtures
 */

// Export the extended test, expect, and Page type
export { test, expect } from './base.fixture';
export type { Page, BrowserContext } from '@playwright/test';

// Export auth utilities
export {
  TEST_USERS,
  type UserRole,
  login,
  loginAsRole,
  loginAsAdmin,
  loginAsManager,
  loginAsFieldOfficer,
  loginAsCollectionOfficer,
  loginAsAccountant,
  loginAsOfficeStaff,
  loginAsAuditor,
  logout,
  expectAccessDenied,
  expectPageLoaded,
  navigateVia,
  ensureOnProtectedPage,
} from './auth.fixture';

// Export test data utilities
export {
  getAuthToken,
  getTokenForRole,
  apiRequest,
  createTestCustomer,
  createTestLoan,
  advanceLoanToStatus,
  createTestCollection,
  createTestGroup,
  clearTokenCache,
  cleanupTestData,
} from './test-data.fixture';
