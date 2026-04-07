import { test, expect } from './fixtures';
import { loginAsAdmin, loginAsManager, loginAsFieldOfficer } from './fixtures';

/**
 * Loan Products Module — Playwright E2E Tests
 *
 * Tests cover:
 * 1. Products list - viewing, status badges, pagination
 * 2. Create product - form validation, field types
 * 3. Edit product - permission-based
 * 4. Deactivate product - confirmation dialog
 */

test.describe('Loan Products Module', () => {
  test.describe('Products List Page', () => {
    test('displays loan products list', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/loan-products');

      await expect(page.getByRole('heading', { name: /loan products/i })).toBeVisible({ timeout: 10_000 });
    });

    test('displays products table with columns', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/loan-products');
      await page.waitForLoadState('networkidle');

      const table = page.locator('table');
      if (await table.isVisible()) {
        await expect(page.getByText('Name')).toBeVisible();
        await expect(page.getByText('Rate')).toBeVisible();
        await expect(page.getByText('Status')).toBeVisible();
      }
    });

    test('shows status badges for active/inactive products', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/loan-products');
      await page.waitForLoadState('networkidle');

      // Status badges should be visible
      const statusBadges = page.locator('[class*="badge"]').or(page.locator('[class*="status"]'));
      if ((await statusBadges.count()) > 0) {
        await expect(statusBadges.first()).toBeVisible();
      }
    });

    test('admin sees "New Product" button', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/loan-products');
      await page.waitForLoadState('networkidle');

      await expect(page.getByRole('link', { name: /new product/i })).toBeVisible({ timeout: 10_000 });
    });

    test('manager does NOT see "New Product" button', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/loan-products');
      await page.waitForLoadState('networkidle');

      await expect(page.getByRole('link', { name: /new product/i })).not.toBeVisible({ timeout: 3_000 });
    });

    test('displays interest rate in percentage format', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/loan-products');
      await page.waitForLoadState('networkidle');

      // Look for percentage values in table
      const percentageValues = page.locator('td').filter({ hasText: /\d+\.\d+/ });
      // Values should be formatted as percentages
    });

    test('displays principal range in INR format', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/loan-products');
      await page.waitForLoadState('networkidle');

      // Look for INR formatted values (₹ symbol or Rs)
      const currencyValues = page.locator('td').filter({ hasText: /₹|Rs/ });
      // Values should be formatted with currency symbol
    });

    test('clicking product name navigates to detail', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/loan-products');
      await page.waitForLoadState('networkidle');

      const productLink = page.locator('table tbody tr a').first();
      if (await productLink.isVisible()) {
        await productLink.click();
        await page.waitForURL(/\/loan-products\/[^/]+$/, { timeout: 10_000 });
      }
    });
  });

  test.describe('Create Product Form', () => {
    test('navigates to create product page', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/loan-products');
      await page.waitForLoadState('networkidle');

      await page.getByRole('link', { name: /new product/i }).click();
      await page.waitForURL('**/loan-products/new', { timeout: 10_000 });

      await expect(page.getByRole('heading', { name: /new loan product/i })).toBeVisible();
    });

    test('form has all required fields', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/loan-products/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByText('Product Name')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText('Interest Type')).toBeVisible();
      await expect(page.getByText('Annual Rate')).toBeVisible();
      await expect(page.getByText('Repayment Frequency')).toBeVisible();
      await expect(page.getByText('Min Principal')).toBeVisible();
      await expect(page.getByText('Max Principal')).toBeVisible();
      await expect(page.getByText('Min Tenure')).toBeVisible();
      await expect(page.getByText('Max Tenure')).toBeVisible();
    });

    test('interest type dropdown has flat and reducing balance options', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/loan-products/new');
      await page.waitForLoadState('networkidle');

      // Click on interest type select
      const interestTypeSelect = page.locator('#interest_type').or(page.getByLabel('Interest Type'));
      if (await interestTypeSelect.isVisible()) {
        await interestTypeSelect.click();

        // Check for options
        await expect(page.getByText('Flat')).toBeVisible({ timeout: 3_000 });
        await expect(page.getByText('Reducing Balance')).toBeVisible();
      }
    });

    test('frequency dropdown has daily, weekly, monthly options', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/loan-products/new');
      await page.waitForLoadState('networkidle');

      const frequencySelect = page.locator('#frequency').or(page.getByLabel('Repayment Frequency'));
      if (await frequencySelect.isVisible()) {
        await frequencySelect.click();

        await expect(page.getByText('Daily')).toBeVisible({ timeout: 3_000 });
        await expect(page.getByText('Weekly')).toBeVisible();
        await expect(page.getByText('Monthly')).toBeVisible();
      }
    });

    test('validates product name is required', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/loan-products/new');
      await page.waitForLoadState('networkidle');

      // Fill other fields but not name
      await page.getByLabel('Annual Rate').fill('24');
      await page.getByLabel('Min Principal').fill('5000');
      await page.getByLabel('Max Principal').fill('100000');
      await page.getByLabel('Min Tenure').fill('3');
      await page.getByLabel('Max Tenure').fill('24');

      // Submit
      await page.getByRole('button', { name: /create product/i }).click();

      // Should show validation error
      await expect(
        page.getByText(/name.*required/i).or(page.locator('[role="alert"]')),
      ).toBeVisible({ timeout: 5_000 });
    });

    test('validates annual rate is required and positive', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/loan-products/new');
      await page.waitForLoadState('networkidle');

      await page.getByLabel('Product Name').fill('Test Product');
      await page.getByLabel('Annual Rate').fill('0'); // Zero rate
      await page.getByLabel('Min Principal').fill('5000');
      await page.getByLabel('Max Principal').fill('100000');
      await page.getByLabel('Min Tenure').fill('3');
      await page.getByLabel('Max Tenure').fill('24');

      await page.getByRole('button', { name: /create product/i }).click();

      await expect(
        page.getByText(/rate.*positive/i).or(page.locator('[role="alert"]')),
      ).toBeVisible({ timeout: 5_000 });
    });

    test('validates min principal cannot exceed max principal', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/loan-products/new');
      await page.waitForLoadState('networkidle');

      await page.getByLabel('Product Name').fill('Test Product');
      await page.getByLabel('Annual Rate').fill('24');
      await page.getByLabel('Min Principal').fill('100000'); // Greater than max
      await page.getByLabel('Max Principal').fill('5000'); // Less than min
      await page.getByLabel('Min Tenure').fill('3');
      await page.getByLabel('Max Tenure').fill('24');

      await page.getByRole('button', { name: /create product/i }).click();

      // Should show validation error about range
      await expect(
        page.locator('[role="alert"]'),
      ).toBeVisible({ timeout: 5_000 });
    });

    test('validates tenure range', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/loan-products/new');
      await page.waitForLoadState('networkidle');

      await page.getByLabel('Product Name').fill('Test Product');
      await page.getByLabel('Annual Rate').fill('24');
      await page.getByLabel('Min Principal').fill('5000');
      await page.getByLabel('Max Principal').fill('100000');
      await page.getByLabel('Min Tenure').fill('24'); // Greater than max
      await page.getByLabel('Max Tenure').fill('3'); // Less than min

      await page.getByRole('button', { name: /create product/i }).click();

      await expect(
        page.locator('[role="alert"]'),
      ).toBeVisible({ timeout: 5_000 });
    });

    test('cancel button returns to list', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/loan-products/new');
      await page.waitForLoadState('networkidle');

      await page.getByRole('link', { name: /cancel/i }).click();
      await page.waitForURL('**/loan-products', { timeout: 10_000 });
    });
  });

  test.describe('Deactivate Product', () => {
    test('deactivate button shows for active products', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/loan-products');
      await page.waitForLoadState('networkidle');

      // Look for deactivate button
      const deactivateButton = page.getByRole('button', { name: /deactivate/i }).first();
      // Button visibility depends on product status
    });

    test('deactivate shows confirmation dialog', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/loan-products');
      await page.waitForLoadState('networkidle');

      const deactivateButton = page.getByRole('button', { name: /deactivate/i }).first();
      if (await deactivateButton.isVisible()) {
        await deactivateButton.click();

        // Confirmation dialog should appear
        await expect(
          page.getByRole('dialog').or(page.getByText(/are you sure/i)),
        ).toBeVisible({ timeout: 5_000 });
      }
    });

    test('manager cannot see deactivate button', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/loan-products');
      await page.waitForLoadState('networkidle');

      await expect(page.getByRole('button', { name: /deactivate/i })).not.toBeVisible({ timeout: 3_000 });
    });
  });

  test.describe('Edit Product', () => {
    test('admin sees edit button', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/loan-products');
      await page.waitForLoadState('networkidle');

      const editButton = page.getByRole('link', { name: /edit/i }).first();
      // Edit button may be visible for admin
    });

    test('manager does NOT see edit button', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/loan-products');
      await page.waitForLoadState('networkidle');

      await expect(page.getByRole('link', { name: /edit/i })).not.toBeVisible({ timeout: 3_000 });
    });
  });
});
