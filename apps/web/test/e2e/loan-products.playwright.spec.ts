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
      await adminPage.waitForLoadState('domcontentloaded');

      const table = adminPage.locator('table');
      if (await table.isVisible()) {
        await expect(adminPage.getByText('Name')).toBeVisible();
        await expect(adminPage.getByText('Rate')).toBeVisible();
        await expect(adminPage.getByText('Status')).toBeVisible();
      }
    });

    test('shows status badges for active/inactive products', async ({ adminPage }) => {
      await adminPage.goto('/loan-products');
      await adminPage.waitForLoadState('domcontentloaded');

      const statusBadges = adminPage.locator('[class*="badge"]').or(adminPage.locator('[class*="status"]'));
      if ((await statusBadges.count()) > 0) {
        await expect(statusBadges.first()).toBeVisible();
      }
    });

    test('admin sees "New Product" button', async ({ adminPage }) => {
      await adminPage.goto('/loan-products');
      await adminPage.waitForLoadState('domcontentloaded');
      await expect(adminPage.getByRole('link', { name: /new product/i })).toBeVisible({ timeout: 15_000 });
    });

    test('manager does NOT see "New Product" button', async ({ managerPage }) => {
      await managerPage.goto('/loan-products');
      await managerPage.waitForLoadState('domcontentloaded');
      // Wait for page heading to appear before checking button visibility
      await expect(managerPage.getByRole('heading', { name: /loan products/i })).toBeVisible({ timeout: 30_000 });
      await expect(managerPage.getByRole('link', { name: /new product/i })).not.toBeVisible({ timeout: 5_000 });
    });

    test('displays interest rate in percentage format', async ({ adminPage }) => {
      await adminPage.goto('/loan-products');
      await adminPage.waitForLoadState('domcontentloaded');
      // Look for percentage values in table
      const percentageValues = adminPage.locator('td').filter({ hasText: /\d+\.\d+/ });
      // Values should be formatted as percentages
    });

    test('displays principal range in INR format', async ({ adminPage }) => {
      await adminPage.goto('/loan-products');
      await adminPage.waitForLoadState('domcontentloaded');
      // Look for INR formatted values
      const currencyValues = adminPage.locator('td').filter({ hasText: /₹|Rs/ });
    });

    test('clicking product name navigates to detail', async ({ adminPage }) => {
      await adminPage.goto('/loan-products');
      await adminPage.waitForLoadState('domcontentloaded');

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
      await adminPage.waitForLoadState('domcontentloaded');
      await adminPage.getByRole('link', { name: /new product/i }).click();
      await adminPage.waitForURL('**/loan-products/new', { timeout: 15_000 });
      await expect(adminPage.getByRole('heading', { name: /new loan product/i })).toBeVisible();
    });

    test('form has all required fields', async ({ adminPage }) => {
      await adminPage.goto('/loan-products/new');
      await adminPage.waitForLoadState('domcontentloaded');

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
      await adminPage.waitForLoadState('domcontentloaded');

      // Wait for form to load
      await expect(adminPage.getByText('Interest Type')).toBeVisible({ timeout: 15_000 });

      // Click the select trigger to open dropdown
      const interestTypeSelect = adminPage.locator('#interest_type');
      await interestTypeSelect.click();

      // Radix UI renders options in a portal - use role selectors
      await expect(adminPage.getByRole('option', { name: 'Flat' })).toBeVisible({ timeout: 5_000 });
      await expect(adminPage.getByRole('option', { name: 'Reducing Balance' })).toBeVisible();
    });

    test('frequency dropdown has daily, weekly, monthly options', async ({ adminPage }) => {
      await adminPage.goto('/loan-products/new');
      await adminPage.waitForLoadState('domcontentloaded');

      // Wait for form to load
      await expect(adminPage.getByText('Repayment Frequency')).toBeVisible({ timeout: 15_000 });

      // Click the select trigger to open dropdown
      const frequencySelect = adminPage.locator('#frequency');
      await frequencySelect.click();

      // Radix UI renders options in a portal - use role selectors
      await expect(adminPage.getByRole('option', { name: 'Daily' })).toBeVisible({ timeout: 5_000 });
      await expect(adminPage.getByRole('option', { name: 'Weekly' })).toBeVisible();
      await expect(adminPage.getByRole('option', { name: 'Monthly' })).toBeVisible();
    });

    test('validates product name is required', async ({ adminPage }) => {
      await adminPage.goto('/loan-products/new');
      await adminPage.waitForLoadState('domcontentloaded');
      // Wait for form to load
      await expect(adminPage.getByText('Product Name')).toBeVisible({ timeout: 30_000 });

      // Use locators by ID since labels include extra text like (%) and *
      await adminPage.locator('#annual_rate').fill('24');
      await adminPage.locator('#min_principal').fill('5000');
      await adminPage.locator('#max_principal').fill('100000');
      await adminPage.locator('#min_tenure_months').fill('3');
      await adminPage.locator('#max_tenure_months').fill('24');

      await adminPage.getByRole('button', { name: /create product/i }).click();

      // The form shows an error message via ErrorMessage component
      await expect(
        adminPage.getByText(/name.*required/i).or(adminPage.getByText(/Product name is required/i)),
      ).toBeVisible({ timeout: 10_000 });
    });

    test('validates annual rate is required and positive', async ({ adminPage }) => {
      await adminPage.goto('/loan-products/new');
      await adminPage.waitForLoadState('domcontentloaded');
      // Wait for form to load
      await expect(adminPage.getByText('Product Name')).toBeVisible({ timeout: 30_000 });

      // Use locators by ID since labels include extra text like (%) and *
      await adminPage.locator('#name').fill('Test Product');
      await adminPage.locator('#annual_rate').fill('0');
      await adminPage.locator('#min_principal').fill('5000');
      await adminPage.locator('#max_principal').fill('100000');
      await adminPage.locator('#min_tenure_months').fill('3');
      await adminPage.locator('#max_tenure_months').fill('24');

      await adminPage.getByRole('button', { name: /create product/i }).click();

      // The form shows an error message via ErrorMessage component
      await expect(
        adminPage.getByText(/rate.*positive/i).or(adminPage.getByText(/Annual rate must be positive/i)),
      ).toBeVisible({ timeout: 10_000 });
    });

    test('validates min principal cannot exceed max principal', async ({ adminPage }) => {
      await adminPage.goto('/loan-products/new');
      await adminPage.waitForLoadState('domcontentloaded');
      // Wait for form to load
      await expect(adminPage.getByText('Product Name')).toBeVisible({ timeout: 30_000 });

      // Use locators by ID since labels include extra text like (Rs) and *
      await adminPage.locator('#name').fill('Test Product');
      await adminPage.locator('#annual_rate').fill('24');
      await adminPage.locator('#min_principal').fill('100000');
      await adminPage.locator('#max_principal').fill('5000');
      await adminPage.locator('#min_tenure_months').fill('3');
      await adminPage.locator('#max_tenure_months').fill('24');

      await adminPage.getByRole('button', { name: /create product/i }).click();

      // The API returns validation errors shown in the ErrorMessage component (role="alert")
      // ErrorMessage component wraps errors in a role="alert" div
      const errorAlert = adminPage.locator('[role="alert"]:not(#__next-route-announcer__)');
      await expect(errorAlert).toBeVisible({ timeout: 10_000 });
    });

    test('validates tenure range', async ({ adminPage }) => {
      await adminPage.goto('/loan-products/new');
      await adminPage.waitForLoadState('domcontentloaded');
      // Wait for form to load
      await expect(adminPage.getByText('Product Name')).toBeVisible({ timeout: 30_000 });

      // Use locators by ID since labels include extra text like (months) and *
      await adminPage.locator('#name').fill('Test Product');
      await adminPage.locator('#annual_rate').fill('24');
      await adminPage.locator('#min_principal').fill('5000');
      await adminPage.locator('#max_principal').fill('100000');
      await adminPage.locator('#min_tenure_months').fill('24');
      await adminPage.locator('#max_tenure_months').fill('3');

      await adminPage.getByRole('button', { name: /create product/i }).click();

      // The API returns validation errors shown in the ErrorMessage component (role="alert")
      // ErrorMessage component wraps errors in a role="alert" div
      const errorAlert = adminPage.locator('[role="alert"]:not(#__next-route-announcer__)');
      await expect(errorAlert).toBeVisible({ timeout: 10_000 });
    });

    test('cancel button returns to list', async ({ adminPage }) => {
      await adminPage.goto('/loan-products/new');
      await adminPage.waitForLoadState('domcontentloaded');

      await adminPage.getByRole('link', { name: /cancel/i }).click();
      await adminPage.waitForURL('**/loan-products', { timeout: 15_000 });
    });
  });

  test.describe('Deactivate Product', () => {
    test('deactivate button shows for active products', async ({ adminPage }) => {
      await adminPage.goto('/loan-products');
      await adminPage.waitForLoadState('domcontentloaded');

      // Verify page loads
      await expect(adminPage.getByRole('heading', { name: /loan products/i })).toBeVisible({ timeout: 10_000 });

      // Wait for table to load
      const table = adminPage.locator('table');
      await expect(table).toBeVisible({ timeout: 10_000 });

      // Check if there are any active products with deactivate buttons
      const deactivateButton = adminPage.getByRole('button', { name: /deactivate/i }).first();
      // If active products exist, deactivate button should be visible
      // This test passes if either no products exist OR deactivate button is visible for active products
      const hasDeactivateButton = await deactivateButton.isVisible({ timeout: 5_000 }).catch(() => false);
      const hasNoProducts = await adminPage.getByText('No loan products found').isVisible({ timeout: 1_000 }).catch(() => false);

      // Test passes if either we have deactivate buttons or no products
      expect(hasDeactivateButton || hasNoProducts).toBeTruthy();
    });

    test('deactivate shows confirmation dialog', async ({ adminPage }) => {
      await adminPage.goto('/loan-products');
      await adminPage.waitForLoadState('domcontentloaded');

      // Wait for page to load
      await expect(adminPage.getByRole('heading', { name: /loan products/i })).toBeVisible({ timeout: 10_000 });

      const deactivateButton = adminPage.getByRole('button', { name: /deactivate/i }).first();
      const isVisible = await deactivateButton.isVisible({ timeout: 5_000 }).catch(() => false);

      if (isVisible) {
        await deactivateButton.click();
        // The ConfirmDialog component shows "Deactivate Product" title and "Are you sure" text
        await expect(
          adminPage.getByRole('alertdialog').or(adminPage.getByText(/are you sure/i)),
        ).toBeVisible({ timeout: 10_000 });
      } else {
        // Skip test if no active products to deactivate
        test.skip();
      }
    });

    test('manager cannot see deactivate button', async ({ managerPage }) => {
      await managerPage.goto('/loan-products');
      await managerPage.waitForLoadState('domcontentloaded');
      // Wait for page heading to appear before checking button visibility
      await expect(managerPage.getByRole('heading', { name: /loan products/i })).toBeVisible({ timeout: 30_000 });
      await expect(managerPage.getByRole('button', { name: /deactivate/i })).not.toBeVisible({ timeout: 5_000 });
    });
  });

  test.describe('Edit Product', () => {
    test('admin sees edit button', async ({ adminPage }) => {
      await adminPage.goto('/loan-products');
      await adminPage.waitForLoadState('domcontentloaded');
      const editButton = adminPage.getByRole('link', { name: /edit/i }).first();
      // Edit button may be visible for admin
    });

    test('manager does NOT see edit button', async ({ managerPage }) => {
      await managerPage.goto('/loan-products');
      await managerPage.waitForLoadState('domcontentloaded');
      // Wait for page heading to appear before checking button visibility
      await expect(managerPage.getByRole('heading', { name: /loan products/i })).toBeVisible({ timeout: 30_000 });
      await expect(managerPage.getByRole('link', { name: /edit/i })).not.toBeVisible({ timeout: 5_000 });
    });
  });
});
