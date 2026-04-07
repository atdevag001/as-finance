import { test, expect } from '@playwright/test';

/**
 * Navigation & UX — Playwright E2E Tests
 *
 * Tests the navigation flow. Uses storage state from auth.setup.ts
 * so tests are already authenticated as manager (default project).
 */

test.describe('Navigation & UX', () => {
  test('sidebar navigation works', async ({ page }) => {
    // Navigate to customers page - Playwright loads storage state automatically
    await page.goto('/customers');
    await page.waitForLoadState('networkidle');
    // Small wait for auth provider to initialize and refresh session
    await page.waitForTimeout(1000);

    // After navigation we should be on /customers with auth complete
    await expect(page.getByRole('heading', { name: /customers/i })).toBeVisible({ timeout: 20_000 });

    // Check sidebar has navigation links (wait for auth to complete loading user role)
    await expect(page.getByRole('link', { name: /customers/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('link', { name: /loans/i })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('link', { name: /collections/i })).toBeVisible({ timeout: 5_000 });

    // Navigate to loans using sidebar link (SPA navigation, not page reload)
    await page.getByRole('link', { name: /loans/i }).click();
    await page.waitForURL('**/loans', { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: /loans/i })).toBeVisible({ timeout: 10_000 });

    // Navigate to collections
    await page.getByRole('link', { name: /collections/i }).click();
    await page.waitForURL('**/collections', { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: /collections/i })).toBeVisible({ timeout: 10_000 });
  });

  test('browser back/forward works', async ({ page }) => {
    // Navigate directly - Playwright loads storage state automatically
    await page.goto('/customers');
    await page.waitForLoadState('networkidle');

    // Wait for auth to complete and sidebar to show
    await expect(page.getByRole('link', { name: /loans/i })).toBeVisible({ timeout: 20_000 });

    // Navigate to loans
    await page.getByRole('link', { name: /loans/i }).click();
    await page.waitForURL('**/loans', { timeout: 10_000 });

    // Navigate to collections
    await page.getByRole('link', { name: /collections/i }).click();
    await page.waitForURL('**/collections', { timeout: 10_000 });

    // Go back to loans
    await page.goBack();
    await page.waitForURL('**/loans', { timeout: 10_000 });

    // Go back to customers
    await page.goBack();
    await page.waitForURL('**/customers', { timeout: 10_000 });

    // Go forward to loans
    await page.goForward();
    await page.waitForURL('**/loans', { timeout: 10_000 });
  });

  test('page headings are correct', async ({ page }) => {
    // Navigate directly - Playwright loads storage state automatically
    await page.goto('/customers');
    await page.waitForLoadState('networkidle');

    // Wait for auth to complete and check customers page
    await expect(page.getByRole('heading', { name: /customers/i })).toBeVisible({ timeout: 20_000 });

    // Wait for sidebar to show (auth complete)
    await expect(page.getByRole('link', { name: /loans/i })).toBeVisible({ timeout: 10_000 });

    // Check loans page
    await page.getByRole('link', { name: /loans/i }).click();
    await page.waitForURL('**/loans', { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: /loans/i })).toBeVisible({ timeout: 10_000 });

    // Check collections page
    await page.getByRole('link', { name: /collections/i }).click();
    await page.waitForURL('**/collections', { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: /collections/i })).toBeVisible({ timeout: 10_000 });

    // Check settings page
    await page.getByRole('link', { name: /settings/i }).click();
    await page.waitForURL('**/settings', { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible({ timeout: 10_000 });

    // Check groups page
    await page.getByRole('link', { name: /groups/i }).click();
    await page.waitForURL('**/groups', { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: /groups/i })).toBeVisible({ timeout: 10_000 });
  });
});
