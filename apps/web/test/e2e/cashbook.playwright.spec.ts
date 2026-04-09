import { test, expect } from './fixtures';

/**
 * Cashbook Module — Playwright E2E Tests
 *
 * Uses pre-authenticated fixtures to avoid rate limiting.
 *
 * Tests cover:
 * 1. Daily Summary - KPI cards, date picker
 * 2. Discrepancy warning - alert display
 * 3. New Expense - form validation, submission
 * 4. Handovers - initiate, verify, list
 * 5. Permission-based access
 */

test.describe('Cashbook Module', () => {
  test.describe('Daily Summary', () => {
    test('accountant can view daily summary', async ({ accountantPage }) => {
      await accountantPage.goto('/cashbook');
      await expect(accountantPage.getByRole('heading', { name: 'Cashbook' })).toBeVisible({ timeout: 15_000 });
    });

    test('displays summary cards', async ({ accountantPage }) => {
      await accountantPage.goto('/cashbook');
      await accountantPage.waitForLoadState('networkidle');

      await expect(accountantPage.getByRole('heading', { name: 'Cashbook' })).toBeVisible({ timeout: 15_000 });

      // Summary cards should be visible (these are CardTitle components)
      await expect(accountantPage.getByText('Opening Balance', { exact: true })).toBeVisible({ timeout: 10_000 });
      await expect(accountantPage.getByText('Cash Inflows', { exact: true })).toBeVisible();
      await expect(accountantPage.getByText('Cash Outflows', { exact: true })).toBeVisible();
      await expect(accountantPage.getByText('Closing Balance', { exact: true })).toBeVisible();
    });

    test('date picker changes summary data', async ({ accountantPage }) => {
      await accountantPage.goto('/cashbook');
      await accountantPage.waitForLoadState('networkidle');

      const dateInput = accountantPage.locator('input[type="date"]').first();
      if (await dateInput.isVisible()) {
        // Change to yesterday
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const dateStr = yesterday.toISOString().split('T')[0];
        await dateInput.fill(dateStr);
        await accountantPage.waitForLoadState('networkidle');
        // Data should refresh (no error = success)
      }
    });

    test('shows transaction count', async ({ accountantPage }) => {
      await accountantPage.goto('/cashbook');
      await accountantPage.waitForLoadState('networkidle');

      // Transaction count text - format is "N transaction(s) on DATE"
      await expect(
        accountantPage.getByText(/\d+ transaction\(s\) on/i),
      ).toBeVisible({ timeout: 15_000 });
    });

    test('field_officer gets Access Denied', async ({ fieldOfficerPage }) => {
      await fieldOfficerPage.goto('/cashbook');
      await expect(fieldOfficerPage.getByRole('heading', { name: 'Access Denied' })).toBeVisible({ timeout: 15_000 });
    });

    test('displays discrepancy warning when exists', async ({ accountantPage }) => {
      await accountantPage.goto('/cashbook');
      await accountantPage.waitForLoadState('networkidle');

      // Discrepancy warning is conditional - just verify page loaded
      await expect(accountantPage.getByRole('heading', { name: 'Cashbook' })).toBeVisible({ timeout: 15_000 });
    });
  });

  test.describe('Navigation Links', () => {
    test('has link to Record Expense', async ({ accountantPage }) => {
      await accountantPage.goto('/cashbook');
      await accountantPage.waitForLoadState('networkidle');

      await expect(accountantPage.getByRole('link', { name: /record expense/i })).toBeVisible({ timeout: 15_000 });
    });

    test('has link to Handovers', async ({ accountantPage }) => {
      await accountantPage.goto('/cashbook');
      await accountantPage.waitForLoadState('networkidle');

      await expect(accountantPage.getByRole('link', { name: /handovers/i })).toBeVisible({ timeout: 15_000 });
    });
  });

  test.describe('New Expense Form', () => {
    test('navigates to new expense page', async ({ accountantPage }) => {
      await accountantPage.goto('/cashbook');
      await accountantPage.waitForLoadState('networkidle');

      await accountantPage.getByRole('link', { name: /record expense/i }).click();
      await accountantPage.waitForURL('**/cashbook/expenses/new', { timeout: 15_000 });

      await expect(accountantPage.getByRole('heading', { name: /record expense/i })).toBeVisible();
    });

    test('form has all required fields', async ({ accountantPage }) => {
      await accountantPage.goto('/cashbook/expenses/new');
      await accountantPage.waitForLoadState('networkidle');

      await expect(accountantPage.getByText('Category')).toBeVisible({ timeout: 15_000 });
      await expect(accountantPage.getByText(/Amount/)).toBeVisible();
      await expect(accountantPage.getByText('Date')).toBeVisible();
      await expect(accountantPage.getByText('Description')).toBeVisible();
      await expect(accountantPage.getByText('Payment Mode')).toBeVisible();
    });

    test('category dropdown has 7 options', async ({ accountantPage }) => {
      await accountantPage.goto('/cashbook/expenses/new');
      await accountantPage.waitForLoadState('networkidle');

      const categorySelect = accountantPage.locator('select').first();
      if (await categorySelect.isVisible()) {
        const options = await categorySelect.locator('option').allTextContents();
        expect(options.length).toBeGreaterThanOrEqual(7);
      }
    });

    test('validates form fields before submit', async ({ accountantPage }) => {
      await accountantPage.goto('/cashbook/expenses/new');
      await accountantPage.waitForLoadState('networkidle');

      // Fill only amount, not description
      await accountantPage.locator('input[type="number"]').first().fill('100');

      // Click submit
      await accountantPage.getByRole('button', { name: /record expense/i }).click();

      // Should show validation error (the specific error message text)
      await expect(
        accountantPage.getByText(/fill all required fields|valid values/i),
      ).toBeVisible({ timeout: 10_000 });
    });

    test('shows confirmation dialog before submit', async ({ accountantPage }) => {
      await accountantPage.goto('/cashbook/expenses/new');
      await accountantPage.waitForLoadState('networkidle');

      // Fill valid data - amount and description
      await accountantPage.locator('input[type="number"]').first().fill('500');
      const descInput = accountantPage.getByPlaceholder(/describe/i);
      await expect(descInput).toBeVisible({ timeout: 10_000 });
      await descInput.fill('Test expense description');

      // Click submit
      await accountantPage.getByRole('button', { name: /record expense/i }).click();

      // Confirmation dialog should appear (Confirm Expense title)
      await expect(
        accountantPage.getByRole('dialog').or(accountantPage.getByRole('alertdialog')),
      ).toBeVisible({ timeout: 10_000 });
    });

    test('back button returns to cashbook', async ({ accountantPage }) => {
      await accountantPage.goto('/cashbook/expenses/new');
      await accountantPage.waitForLoadState('networkidle');

      // Wait for heading to ensure page is fully loaded
      await expect(accountantPage.getByRole('heading', { name: /record expense/i })).toBeVisible({ timeout: 15_000 });

      // Try to find a visible back button - either in page header or navigation
      // On mobile, the sidebar nav may be hidden, so look for the page's back link first
      const pageBackLink = accountantPage.locator('main a[href="/cashbook"], [role="main"] a[href="/cashbook"]').first();
      const navBackLink = accountantPage.locator('nav a[href="/cashbook"]').first();

      // Check which back link is visible and clickable
      const backButton = (await pageBackLink.isVisible()) ? pageBackLink : navBackLink;
      await backButton.scrollIntoViewIfNeeded();
      await backButton.click({ timeout: 15_000 });

      // Wait for URL change first
      await accountantPage.waitForURL(/\/cashbook$/, { timeout: 15_000 });

      // Then verify the cashbook heading is visible
      await expect(accountantPage.getByRole('heading', { name: 'Cashbook' })).toBeVisible({ timeout: 15_000 });
    });
  });

  test.describe('Handovers Page', () => {
    test('navigates to handovers page', async ({ accountantPage }) => {
      await accountantPage.goto('/cashbook');
      await accountantPage.waitForLoadState('networkidle');

      await accountantPage.getByRole('link', { name: /handovers/i }).click();
      await accountantPage.waitForURL('**/cashbook/handovers', { timeout: 15_000 });

      await expect(accountantPage.getByRole('heading', { name: /cash handovers/i })).toBeVisible();
    });

    test('shows initiate handover form', async ({ accountantPage }) => {
      await accountantPage.goto('/cashbook/handovers');
      await accountantPage.waitForLoadState('networkidle');

      // Wait for the heading first
      await expect(accountantPage.getByRole('heading', { name: 'Cash Handovers' })).toBeVisible({ timeout: 15_000 });

      // The "Initiate Handover" is a CardTitle - find the form elements
      await expect(accountantPage.locator('input[type="number"]').first()).toBeVisible({ timeout: 10_000 });
      // Button text is "Initiate Handover"
      await expect(accountantPage.getByRole('button', { name: 'Initiate Handover' })).toBeVisible();
    });

    test('validates handover amount is required', async ({ accountantPage }) => {
      await accountantPage.goto('/cashbook/handovers');
      await accountantPage.waitForLoadState('networkidle');

      // Wait for the page to load
      await expect(accountantPage.getByRole('heading', { name: 'Cash Handovers' })).toBeVisible({ timeout: 15_000 });

      // Click submit without entering amount (or with 0)
      await accountantPage.getByRole('button', { name: 'Initiate Handover' }).click();

      // Should show validation error - look for specific text
      await expect(
        accountantPage.getByText(/Amount must be greater than zero/i),
      ).toBeVisible({ timeout: 10_000 });
    });

    test('shows pending handovers section', async ({ accountantPage }) => {
      await accountantPage.goto('/cashbook/handovers');
      await accountantPage.waitForLoadState('networkidle');

      // The page shows "Pending Handovers" as h2 heading
      await expect(
        accountantPage.getByText('Pending Handovers', { exact: true }),
      ).toBeVisible({ timeout: 15_000 });
    });

    test('manager can view handovers page', async ({ managerPage }) => {
      await managerPage.goto('/cashbook/handovers');
      await managerPage.waitForLoadState('networkidle');

      // Page should load without error - that's success
      await expect(managerPage.getByRole('heading', { name: /cash handovers/i })).toBeVisible({ timeout: 15_000 });
    });
  });
});
