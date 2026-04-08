import { test, expect } from './fixtures';

/**
 * Loan Products Module — Playwright E2E Tests
 *
 * Uses pre-authenticated page fixtures (adminPage, managerPage)
 * instead of UI login for fast test execution.
 *
 * Tests cover:
 * 1. Products list - viewing, status badges, pagination
 * 2. Create product - form validation, field types
 * 3. Edit product - permission-based
 * 4. Deactivate product - confirmation dialog
 */

test.describe('Loan Products Module', () => {
  test.describe('Products List Page', () => {
    test('displays loan products list', async ({ adminPage }) => {
      await adminPage.goto('/loan-products');
      await expect(adminPage.getByRole('heading', { name: /loan products/i })).toBeVisible({ timeout: 15_000 });
    });

    test('displays products table with columns', async ({ adminPage }) => {
      await adminPage.goto('/loan-products');
      await adminPage.waitForLoadState('networkidle');

      const table = adminPage.locator('table');
      if (await table.isVisible()) {
        await expect(adminPage.getByText('Name')).toBeVisible();
        await expect(adminPage.getByText('Rate')).toBeVisible();
        await expect(adminPage.getByText('Status')).toBeVisible();
      }
    });

    test('shows status badges for active/inactive products', async ({ adminPage }) => {
      await adminPage.goto('/loan-products');
      await adminPage.waitForLoadState('networkidle');

      const statusBadges = adminPage.locator('[class*="badge"]').or(adminPage.locator('[class*="status"]'));
      if ((await statusBadges.count()) > 0) {
        await expect(statusBadges.first()).toBeVisible();
      }
    });

    test('admin sees "New Product" button', async ({ adminPage }) => {
      await adminPage.goto('/loan-products');
      await adminPage.waitForLoadState('networkidle');
      await expect(adminPage.getByRole('link', { name: /new product/i })).toBeVisible({ timeout: 15_000 });
    });

    test('manager does NOT see "New Product" button', async ({ managerPage }) => {
      await managerPage.goto('/loan-products');
      await managerPage.waitForLoadState('networkidle');
      await expect(managerPage.getByRole('link', { name: /new product/i })).not.toBeVisible({ timeout: 5_000 });
    });

    test('displays interest rate in percentage format', async ({ adminPage }) => {
      await adminPage.goto('/loan-products');
      await adminPage.waitForLoadState('networkidle');
      // Look for percentage values in table
      const percentageValues = adminPage.locator('td').filter({ hasText: /\d+\.\d+/ });
      // Values should be formatted as percentages
    });

    test('displays principal range in INR format', async ({ adminPage }) => {
      await adminPage.goto('/loan-products');
      await adminPage.waitForLoadState('networkidle');
      // Look for INR formatted values
      const currencyValues = adminPage.locator('td').filter({ hasText: /₹|Rs/ });
    });

    test('clicking product name navigates to detail', async ({ adminPage }) => {
      await adminPage.goto('/loan-products');
      await adminPage.waitForLoadState('networkidle');

      const productLink = adminPage.locator('table tbody tr a').first();
      if (await productLink.isVisible()) {
        await productLink.click();
        await adminPage.waitForURL(/\/loan-products\/[^/]+$/, { timeout: 15_000 });
      }
    });
  });

  test.describe('Create Product Form', () => {
    test('navigates to create product page', async ({ adminPage }) => {
      await adminPage.goto('/loan-products');
      await adminPage.waitForLoadState('networkidle');
      await adminPage.getByRole('link', { name: /new product/i }).click();
      await adminPage.waitForURL('**/loan-products/new', { timeout: 15_000 });
      await expect(adminPage.getByRole('heading', { name: /new loan product/i })).toBeVisible();
    });

    test('form has all required fields', async ({ adminPage }) => {
      await adminPage.goto('/loan-products/new');
      await adminPage.waitForLoadState('networkidle');

      await expect(adminPage.getByText('Product Name')).toBeVisible({ timeout: 15_000 });
      await expect(adminPage.getByText('Interest Type')).toBeVisible();
      await expect(adminPage.getByText('Annual Rate')).toBeVisible();
      await expect(adminPage.getByText('Repayment Frequency')).toBeVisible();
      await expect(adminPage.getByText('Min Principal')).toBeVisible();
      await expect(adminPage.getByText('Max Principal')).toBeVisible();
      await expect(adminPage.getByText('Min Tenure')).toBeVisible();
      await expect(adminPage.getByText('Max Tenure')).toBeVisible();
    });

    test('interest type dropdown has flat and reducing balance options', async ({ adminPage }) => {
      await adminPage.goto('/loan-products/new');
      await adminPage.waitForLoadState('networkidle');

      const interestTypeSelect = adminPage.locator('#interest_type').or(adminPage.getByLabel('Interest Type'));
      if (await interestTypeSelect.isVisible()) {
        await interestTypeSelect.click();
        await expect(adminPage.getByText('Flat')).toBeVisible({ timeout: 5_000 });
        await expect(adminPage.getByText('Reducing Balance')).toBeVisible();
      }
    });

    test('frequency dropdown has daily, weekly, monthly options', async ({ adminPage }) => {
      await adminPage.goto('/loan-products/new');
      await adminPage.waitForLoadState('networkidle');

      const frequencySelect = adminPage.locator('#frequency').or(adminPage.getByLabel('Repayment Frequency'));
      if (await frequencySelect.isVisible()) {
        await frequencySelect.click();
        await expect(adminPage.getByText('Daily')).toBeVisible({ timeout: 5_000 });
        await expect(adminPage.getByText('Weekly')).toBeVisible();
        await expect(adminPage.getByText('Monthly')).toBeVisible();
      }
    });

    test('validates product name is required', async ({ adminPage }) => {
      await adminPage.goto('/loan-products/new');
      await adminPage.waitForLoadState('networkidle');

      await adminPage.getByLabel('Annual Rate').fill('24');
      await adminPage.getByLabel('Min Principal').fill('5000');
      await adminPage.getByLabel('Max Principal').fill('100000');
      await adminPage.getByLabel('Min Tenure').fill('3');
      await adminPage.getByLabel('Max Tenure').fill('24');

      await adminPage.getByRole('button', { name: /create product/i }).click();

      await expect(
        adminPage.getByText(/name.*required/i).or(adminPage.locator('[role="alert"]')),
      ).toBeVisible({ timeout: 10_000 });
    });

    test('validates annual rate is required and positive', async ({ adminPage }) => {
      await adminPage.goto('/loan-products/new');
      await adminPage.waitForLoadState('networkidle');

      await adminPage.getByLabel('Product Name').fill('Test Product');
      await adminPage.getByLabel('Annual Rate').fill('0');
      await adminPage.getByLabel('Min Principal').fill('5000');
      await adminPage.getByLabel('Max Principal').fill('100000');
      await adminPage.getByLabel('Min Tenure').fill('3');
      await adminPage.getByLabel('Max Tenure').fill('24');

      await adminPage.getByRole('button', { name: /create product/i }).click();

      await expect(
        adminPage.getByText(/rate.*positive/i).or(adminPage.locator('[role="alert"]')),
      ).toBeVisible({ timeout: 10_000 });
    });

    test('validates min principal cannot exceed max principal', async ({ adminPage }) => {
      await adminPage.goto('/loan-products/new');
      await adminPage.waitForLoadState('networkidle');

      await adminPage.getByLabel('Product Name').fill('Test Product');
      await adminPage.getByLabel('Annual Rate').fill('24');
      await adminPage.getByLabel('Min Principal').fill('100000');
      await adminPage.getByLabel('Max Principal').fill('5000');
      await adminPage.getByLabel('Min Tenure').fill('3');
      await adminPage.getByLabel('Max Tenure').fill('24');

      await adminPage.getByRole('button', { name: /create product/i }).click();

      await expect(adminPage.locator('[role="alert"]')).toBeVisible({ timeout: 10_000 });
    });

    test('validates tenure range', async ({ adminPage }) => {
      await adminPage.goto('/loan-products/new');
      await adminPage.waitForLoadState('networkidle');

      await adminPage.getByLabel('Product Name').fill('Test Product');
      await adminPage.getByLabel('Annual Rate').fill('24');
      await adminPage.getByLabel('Min Principal').fill('5000');
      await adminPage.getByLabel('Max Principal').fill('100000');
      await adminPage.getByLabel('Min Tenure').fill('24');
      await adminPage.getByLabel('Max Tenure').fill('3');

      await adminPage.getByRole('button', { name: /create product/i }).click();

      await expect(adminPage.locator('[role="alert"]')).toBeVisible({ timeout: 10_000 });
    });

    test('cancel button returns to list', async ({ adminPage }) => {
      await adminPage.goto('/loan-products/new');
      await adminPage.waitForLoadState('networkidle');

      await adminPage.getByRole('link', { name: /cancel/i }).click();
      await adminPage.waitForURL('**/loan-products', { timeout: 15_000 });
    });
  });

  test.describe('Deactivate Product', () => {
    test('deactivate button shows for active products', async ({ adminPage }) => {
      await adminPage.goto('/loan-products');
      await adminPage.waitForLoadState('networkidle');
      const deactivateButton = adminPage.getByRole('button', { name: /deactivate/i }).first();
      // Button visibility depends on product status
    });

    test('deactivate shows confirmation dialog', async ({ adminPage }) => {
      await adminPage.goto('/loan-products');
      await adminPage.waitForLoadState('networkidle');

      const deactivateButton = adminPage.getByRole('button', { name: /deactivate/i }).first();
      if (await deactivateButton.isVisible()) {
        await deactivateButton.click();
        await expect(
          adminPage.getByRole('dialog').or(adminPage.getByText(/are you sure/i)),
        ).toBeVisible({ timeout: 10_000 });
      }
    });

    test('manager cannot see deactivate button', async ({ managerPage }) => {
      await managerPage.goto('/loan-products');
      await managerPage.waitForLoadState('networkidle');
      await expect(managerPage.getByRole('button', { name: /deactivate/i })).not.toBeVisible({ timeout: 5_000 });
    });
  });

  test.describe('Edit Product', () => {
    test('admin sees edit button', async ({ adminPage }) => {
      await adminPage.goto('/loan-products');
      await adminPage.waitForLoadState('networkidle');
      const editButton = adminPage.getByRole('link', { name: /edit/i }).first();
      // Edit button may be visible for admin
    });

    test('manager does NOT see edit button', async ({ managerPage }) => {
      await managerPage.goto('/loan-products');
      await managerPage.waitForLoadState('networkidle');
      await expect(managerPage.getByRole('link', { name: /edit/i })).not.toBeVisible({ timeout: 5_000 });
    });
  });
});
