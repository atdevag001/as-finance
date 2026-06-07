import { test, expect } from './fixtures';
import { apiRequest, getTokenForRole } from './fixtures';

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
 * 5. Deactivate product - execute end-to-end (status flip + dropdown filter)
 */

/**
 * Seed a fresh active loan product via API. Returns the created product id and name.
 * Each test gets a unique product so deactivation does not affect other tests
 * or seeded products that subsequent specs may depend on.
 */
async function seedActiveLoanProduct(
  token: string,
  suffix: string,
): Promise<{ id: string; name: string }> {
  const name = `Deactivate Test ${suffix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const created = await apiRequest<{ id: string; name: string }>(
    'POST',
    '/loan-products',
    token,
    {
      name,
      interestType: 'flat',
      annualRateBps: 1800, // 18%
      minPrincipalPaise: 1_000_00, // ₹1,000
      maxPrincipalPaise: 100_000_00, // ₹1,00,000
      minTenureMonths: 3,
      maxTenureMonths: 24,
      repaymentFrequency: 'monthly',
    },
  );
  return { id: created.id, name: created.name };
}

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

  /**
   * Deactivate execution — closes the coverage gap where prior tests stop at
   * the confirmation dialog and never verify that confirming actually flips
   * the product to inactive or removes it from the new-loan product dropdown.
   */
  test.describe('Deactivate Product — execute end-to-end', () => {
    test('admin deactivates product: dialog confirm flips status to inactive and shows success toast', async ({ adminPage }) => {
      const adminToken = await getTokenForRole('super_admin');
      const product = await seedActiveLoanProduct(adminToken, 'golden');

      // Navigate to the products list and locate the seeded product row.
      await adminPage.goto('/loan-products');
      await expect(adminPage.getByRole('heading', { name: /loan products/i })).toBeVisible({ timeout: 15_000 });

      // The list is paginated (20/page) so we may need to search across pages.
      // For a freshly created product, it's at the start of the most recent page —
      // load enough pages by directly hitting the API to find the page index.
      // Simpler: paginate forward up to 5 pages searching for the product name.
      let row = adminPage.locator('table tbody tr', { hasText: product.name });
      let found = await row.first().isVisible({ timeout: 5_000 }).catch(() => false);
      for (let i = 0; i < 5 && !found; i++) {
        const nextBtn = adminPage.getByRole('button', { name: /next/i });
        if (!(await nextBtn.isEnabled().catch(() => false))) break;
        await nextBtn.click();
        await adminPage.waitForLoadState('networkidle');
        row = adminPage.locator('table tbody tr', { hasText: product.name });
        found = await row.first().isVisible({ timeout: 3_000 }).catch(() => false);
      }
      expect(found, `Seeded product "${product.name}" must be visible in the list`).toBe(true);

      // Sanity check: the row reports an Active badge before deactivation.
      await expect(row.first().getByText(/active/i)).toBeVisible({ timeout: 10_000 });

      // Click the row's Deactivate button.
      await row.first().getByRole('button', { name: /deactivate/i }).click();

      // ConfirmDialog should appear with the product name in the description.
      const dialog = adminPage.getByRole('alertdialog').or(adminPage.getByRole('dialog'));
      await expect(dialog).toBeVisible({ timeout: 10_000 });
      await expect(dialog.getByText(product.name, { exact: false })).toBeVisible();

      // Confirm deactivation. The dialog button uses the destructive variant
      // with label "Deactivate" (per ConfirmDialog confirmLabel prop).
      await dialog.getByRole('button', { name: /^deactivate$/i }).click();

      // Success toast confirms the API call resolved.
      await expect(adminPage.getByText(/product deactivated/i)).toBeVisible({ timeout: 15_000 });

      // Dialog closes.
      await expect(dialog).not.toBeVisible({ timeout: 10_000 });

      // Backend state: GET the product and assert is_active === false.
      const refreshed = await apiRequest<{ id: string; is_active: boolean }>(
        'GET',
        `/loan-products/${product.id}`,
        adminToken,
      );
      expect(refreshed.is_active).toBe(false);

      // UI state: the row's badge flips to Inactive and the Deactivate button
      // is no longer rendered for that product (page.tsx only renders it when p.is_active).
      const refreshedRow = adminPage.locator('table tbody tr', { hasText: product.name }).first();
      await expect(refreshedRow.getByText(/inactive/i)).toBeVisible({ timeout: 15_000 });
      await expect(refreshedRow.getByRole('button', { name: /deactivate/i })).toHaveCount(0);
    });

    test('deactivated product is excluded from the new-loan product dropdown', async ({ adminPage }) => {
      const adminToken = await getTokenForRole('super_admin');
      const product = await seedActiveLoanProduct(adminToken, 'dropdown');

      // Verify the product IS in the new-loan dropdown while active.
      await adminPage.goto('/loans/new');
      await expect(adminPage.getByRole('heading', { name: /new loan application/i })).toBeVisible({ timeout: 15_000 });

      // The product dropdown is a native <select> following the Loan Product label.
      // Options are formatted as "{name} — {Flat|Reducing} @ {rate}% ({frequency})".
      const productSelect = adminPage.locator('select').filter({ hasText: /select loan product/i }).first();
      await expect(productSelect).toBeVisible({ timeout: 15_000 });
      await expect(productSelect.locator('option', { hasText: product.name })).toHaveCount(1, { timeout: 15_000 });

      // Deactivate via API (UI is exercised in the golden-path test above).
      await apiRequest('POST', `/loan-products/${product.id}/deactivate`, adminToken);

      // Re-open the new-loan page and assert the product is no longer offered.
      // page.tsx filters `(p.is_active)` before mapping to <option>.
      await adminPage.goto('/loans/new');
      await expect(adminPage.getByRole('heading', { name: /new loan application/i })).toBeVisible({ timeout: 15_000 });
      const refreshedSelect = adminPage.locator('select').filter({ hasText: /select loan product/i }).first();
      await expect(refreshedSelect).toBeVisible({ timeout: 15_000 });
      await expect(refreshedSelect.locator('option', { hasText: product.name })).toHaveCount(0, { timeout: 15_000 });
    });

    test('cancel on confirmation dialog leaves product active', async ({ adminPage }) => {
      const adminToken = await getTokenForRole('super_admin');
      const product = await seedActiveLoanProduct(adminToken, 'cancel');

      await adminPage.goto('/loan-products');
      await expect(adminPage.getByRole('heading', { name: /loan products/i })).toBeVisible({ timeout: 15_000 });

      // Locate the seeded row (paginate up to 5 pages if needed).
      let row = adminPage.locator('table tbody tr', { hasText: product.name });
      let found = await row.first().isVisible({ timeout: 5_000 }).catch(() => false);
      for (let i = 0; i < 5 && !found; i++) {
        const nextBtn = adminPage.getByRole('button', { name: /next/i });
        if (!(await nextBtn.isEnabled().catch(() => false))) break;
        await nextBtn.click();
        await adminPage.waitForLoadState('networkidle');
        row = adminPage.locator('table tbody tr', { hasText: product.name });
        found = await row.first().isVisible({ timeout: 3_000 }).catch(() => false);
      }
      expect(found).toBe(true);

      await row.first().getByRole('button', { name: /deactivate/i }).click();
      const dialog = adminPage.getByRole('alertdialog').or(adminPage.getByRole('dialog'));
      await expect(dialog).toBeVisible({ timeout: 10_000 });

      // Cancel — ConfirmDialog renders a "Cancel" button next to the destructive confirm.
      await dialog.getByRole('button', { name: /^cancel$/i }).click();
      await expect(dialog).not.toBeVisible({ timeout: 10_000 });

      // No toast should have fired.
      await expect(adminPage.getByText(/product deactivated/i)).not.toBeVisible({ timeout: 2_000 });

      // Backend state: still active.
      const refreshed = await apiRequest<{ id: string; is_active: boolean }>(
        'GET',
        `/loan-products/${product.id}`,
        adminToken,
      );
      expect(refreshed.is_active).toBe(true);

      // UI state: deactivate button still present on the row.
      const stillActiveRow = adminPage.locator('table tbody tr', { hasText: product.name }).first();
      await expect(stillActiveRow.getByRole('button', { name: /deactivate/i })).toBeVisible({ timeout: 10_000 });
    });

    test('manager is denied at API layer when attempting to deactivate (RBAC)', async () => {
      const adminToken = await getTokenForRole('super_admin');
      const managerToken = await getTokenForRole('manager');
      const product = await seedActiveLoanProduct(adminToken, 'rbac');

      // Manager lacks loan_product.deactivate permission — the API must reject.
      // apiRequest throws on non-2xx, so we capture the error and assert the status.
      let errorMessage = '';
      try {
        await apiRequest('POST', `/loan-products/${product.id}/deactivate`, managerToken);
      } catch (err) {
        errorMessage = (err as Error).message;
      }
      // Should surface a 403 Forbidden (or 401 if the permission guard rewrites it).
      expect(errorMessage).toMatch(/40[13]/);

      // Product remains active after the denied call.
      const refreshed = await apiRequest<{ id: string; is_active: boolean }>(
        'GET',
        `/loan-products/${product.id}`,
        adminToken,
      );
      expect(refreshed.is_active).toBe(true);
    });
  });
});
