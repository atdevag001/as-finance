/**
 * E2E Test Utilities
 *
 * Central export point for all test utilities.
 */

// Test data management
export {
  generateCustomer,
  generateLoan,
  generateCollection,
  createTestCustomerViaAPI,
  cleanupTestData,
  fillCustomerForm,
  getRunId,
  uniqueString,
  waitForAPI,
  TestDataSnapshot,
  type TestCustomer,
  type TestLoan,
  type TestCollection,
} from './test-data-manager';

// Accessibility testing
export {
  runAccessibilityAudit,
  expectNoA11yViolations,
  checkA11yRequirements,
  testKeyboardNavigation,
  checkColorContrast,
  generateA11yReport,
  type A11yViolation,
  type A11yResult,
} from './accessibility';

// Visual regression testing
export {
  compareScreenshot,
  compareElementScreenshot,
  testResponsiveDesign,
  captureAllPages,
  updateBaselines,
  generateVisualReport,
  COMMON_MASKS,
  type VisualComparisonOptions,
} from './visual-regression';
