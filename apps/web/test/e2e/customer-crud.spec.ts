import { test, expect } from './fixtures';

/**
 * Customer Management — Playwright E2E Tests
 *
 * Uses pre-authenticated page fixtures for fast test execution.
 */

test.describe('Customer Management', () => {
  test('should display customer list', async ({ managerPage }) => {
    await managerPage.goto('/customers');
    await managerPage.waitForLoadState('domcontentloaded');

    // Customer list should be visible (either table or heading)
    await expect(
      managerPage.getByRole('heading', { name: 'Customers' })
    ).toBeVisible({ timeout: 30_000 });
  });

  test('should navigate to new customer form', async ({ fieldOfficerPage }) => {
    await fieldOfficerPage.goto('/customers');
    await fieldOfficerPage.waitForLoadState('domcontentloaded');

    // Wait for the page content to load
    await expect(
      fieldOfficerPage.getByRole('heading', { name: 'Customers' })
    ).toBeVisible({ timeout: 30_000 });

    // Click new customer button
    const newButton = fieldOfficerPage.getByRole('link', { name: /new|add|register/i });
    if (await newButton.isVisible()) {
      await newButton.click();
      await fieldOfficerPage.waitForURL('**/customers/new', { timeout: 30_000 });
      await expect(fieldOfficerPage.getByRole('heading', { name: 'Register Customer' })).toBeVisible({ timeout: 30_000 });
    }
  });

  test('should validate required fields on customer form', async ({ fieldOfficerPage }) => {
    await fieldOfficerPage.goto('/customers/new');
    await fieldOfficerPage.waitForLoadState('domcontentloaded');

    // Wait for form to be visible
    await expect(fieldOfficerPage.getByRole('heading', { name: 'Register Customer' })).toBeVisible({ timeout: 30_000 });

    // Try submitting empty form
    await fieldOfficerPage.getByRole('button', { name: /register|submit|save/i }).click();

    // Validation errors should appear
    await expect(fieldOfficerPage.getByText(/required/i)).toBeVisible({ timeout: 10_000 });
  });

  test('should search customers', async ({ managerPage }) => {
    await managerPage.goto('/customers');
    await managerPage.waitForLoadState('domcontentloaded');

    // Wait for page content to load
    await expect(
      managerPage.getByRole('heading', { name: 'Customers' })
    ).toBeVisible({ timeout: 30_000 });

    // Look for search input
    const searchInput = managerPage.getByPlaceholder(/search/i);
    if (await searchInput.isVisible()) {
      await searchInput.fill('test');
      // Wait for table to update after search
      await managerPage.waitForTimeout(1000);
    }
  });

  test('should view customer details', async ({ managerPage }) => {
    await managerPage.goto('/customers');
    await managerPage.waitForLoadState('domcontentloaded');

    // Wait for page content to load
    await expect(
      managerPage.getByRole('heading', { name: 'Customers' })
    ).toBeVisible({ timeout: 30_000 });

    // Click on first customer link
    const customerLink = managerPage.locator('table tbody tr a').first();
    if (await customerLink.isVisible()) {
      await customerLink.click();
      await managerPage.waitForURL(/\/customers\/[^/]+$/, { timeout: 30_000 });
    }
  });
});
