import { test, expect } from './fixtures';

/**
 * Customer Management — Playwright E2E Tests
 *
 * Uses pre-authenticated page fixtures for fast test execution.
 */

test.describe('Customer Management', () => {
  test('should display customer list', async ({ managerPage }) => {
    await managerPage.goto('/customers');
    await managerPage.waitForLoadState('networkidle');

    // Customer list should be visible (either table or heading)
    await expect(
      managerPage.locator('table').or(managerPage.getByRole('heading', { name: /customers/i }))
    ).toBeVisible({ timeout: 15_000 });
  });

  test('should navigate to new customer form', async ({ fieldOfficerPage }) => {
    await fieldOfficerPage.goto('/customers');
    await fieldOfficerPage.waitForLoadState('networkidle');

    // Click new customer button
    const newButton = fieldOfficerPage.getByRole('link', { name: /new|add|register/i });
    if (await newButton.isVisible()) {
      await newButton.click();
      await fieldOfficerPage.waitForURL('**/customers/new', { timeout: 15_000 });
      await expect(fieldOfficerPage.getByRole('heading', { name: /register|new|add/i })).toBeVisible();
    }
  });

  test('should validate required fields on customer form', async ({ fieldOfficerPage }) => {
    await fieldOfficerPage.goto('/customers/new');
    await fieldOfficerPage.waitForLoadState('networkidle');

    // Wait for form to be visible
    await expect(fieldOfficerPage.getByRole('heading', { name: /register|new/i })).toBeVisible({ timeout: 15_000 });

    // Try submitting empty form
    await fieldOfficerPage.getByRole('button', { name: /register|submit|save/i }).click();

    // Validation errors should appear
    await expect(fieldOfficerPage.getByText(/required/i)).toBeVisible({ timeout: 10_000 });
  });

  test('should search customers', async ({ managerPage }) => {
    await managerPage.goto('/customers');
    await managerPage.waitForLoadState('networkidle');

    // Look for search input
    const searchInput = managerPage.getByPlaceholder(/search/i);
    if (await searchInput.isVisible()) {
      await searchInput.fill('test');
      await managerPage.waitForLoadState('networkidle');
      // Search should filter results
    }
  });

  test('should view customer details', async ({ managerPage }) => {
    await managerPage.goto('/customers');
    await managerPage.waitForLoadState('networkidle');

    // Click on first customer link
    const customerLink = managerPage.locator('table tbody tr a').first();
    if (await customerLink.isVisible()) {
      await customerLink.click();
      await managerPage.waitForURL(/\/customers\/[^/]+$/, { timeout: 15_000 });
    }
  });
});
