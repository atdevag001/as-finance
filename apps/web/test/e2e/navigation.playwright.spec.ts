import { test, expect } from './fixtures';

/**
 * Navigation & UX — Playwright E2E Tests
 *
 * Uses pre-authenticated managerPage fixture for fast test execution.
 */

test.describe('Navigation & UX', () => {
  test('sidebar navigation works', async ({ managerPage }) => {
    await managerPage.goto('/customers');
    await managerPage.waitForLoadState('networkidle');

    // After navigation we should be on /customers with auth complete
    await expect(managerPage.getByRole('heading', { name: /customers/i })).toBeVisible({ timeout: 15_000 });

    // Check sidebar has navigation links
    await expect(managerPage.getByRole('link', { name: 'Customers', exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(managerPage.getByRole('link', { name: /loans/i })).toBeVisible({ timeout: 5_000 });
    await expect(managerPage.getByRole('link', { name: /collections/i })).toBeVisible({ timeout: 5_000 });

    // Navigate to loans using sidebar link
    await managerPage.getByRole('link', { name: /^Loans$/i }).click();
    await managerPage.waitForURL('**/loans', { timeout: 15_000 });
    await expect(managerPage.getByRole('heading', { name: /loans/i })).toBeVisible({ timeout: 10_000 });

    // Navigate to collections
    await managerPage.getByRole('link', { name: /collections/i }).click();
    await managerPage.waitForURL('**/collections', { timeout: 15_000 });
    await expect(managerPage.getByRole('heading', { name: /collections/i })).toBeVisible({ timeout: 10_000 });
  });

  test('browser back/forward works', async ({ managerPage }) => {
    await managerPage.goto('/customers');
    await managerPage.waitForLoadState('networkidle');

    // Wait for auth to complete and sidebar to show
    await expect(managerPage.getByRole('link', { name: /^Loans$/i })).toBeVisible({ timeout: 15_000 });

    // Navigate to loans
    await managerPage.getByRole('link', { name: /^Loans$/i }).click();
    await managerPage.waitForURL('**/loans', { timeout: 15_000 });

    // Navigate to collections
    await managerPage.getByRole('link', { name: /collections/i }).click();
    await managerPage.waitForURL('**/collections', { timeout: 15_000 });

    // Go back to loans
    await managerPage.goBack();
    await managerPage.waitForURL('**/loans', { timeout: 15_000 });

    // Go back to customers
    await managerPage.goBack();
    await managerPage.waitForURL('**/customers', { timeout: 15_000 });

    // Go forward to loans
    await managerPage.goForward();
    await managerPage.waitForURL('**/loans', { timeout: 15_000 });
  });

  test('page headings are correct', async ({ managerPage }) => {
    await managerPage.goto('/customers');
    await managerPage.waitForLoadState('networkidle');

    // Wait for auth to complete and check customers page
    await expect(managerPage.getByRole('heading', { name: /customers/i })).toBeVisible({ timeout: 15_000 });

    // Wait for sidebar to show (auth complete)
    await expect(managerPage.getByRole('link', { name: /^Loans$/i })).toBeVisible({ timeout: 10_000 });

    // Check loans page
    await managerPage.getByRole('link', { name: /^Loans$/i }).click();
    await managerPage.waitForURL('**/loans', { timeout: 15_000 });
    await expect(managerPage.getByRole('heading', { name: /loans/i })).toBeVisible({ timeout: 10_000 });

    // Check collections page
    await managerPage.getByRole('link', { name: /collections/i }).click();
    await managerPage.waitForURL('**/collections', { timeout: 15_000 });
    await expect(managerPage.getByRole('heading', { name: /collections/i })).toBeVisible({ timeout: 10_000 });

    // Check groups page
    await managerPage.getByRole('link', { name: /groups/i }).click();
    await managerPage.waitForURL('**/groups', { timeout: 15_000 });
    await expect(managerPage.getByRole('heading', { name: /groups/i })).toBeVisible({ timeout: 10_000 });
  });
});
