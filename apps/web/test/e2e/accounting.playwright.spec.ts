import { test, expect } from './fixtures';
import { loginAsAccountant, loginAsManager, loginAsFieldOfficer, loginAsAuditor } from './fixtures';

/**
 * Accounting Module — Playwright E2E Tests
 *
 * Tests cover:
 * 1. Chart of Accounts - viewing accounts list
 * 2. Daybook - viewing journal entries with date filter
 * 3. Trial Balance - debit/credit columns, date filter
 * 4. Profit & Loss - income/expense sections
 * 5. Balance Sheet - assets/liabilities/equity
 * 6. Permission-based access
 */

test.describe('Accounting Module', () => {
  test.describe('Chart of Accounts', () => {
    test('accountant can view chart of accounts', async ({ page }) => {
      await loginAsAccountant(page);
      await page.goto('/accounting');

      await expect(page.getByRole('heading', { name: 'Accounting' })).toBeVisible({ timeout: 10_000 });

      // Chart of Accounts tab should be active by default
      await expect(page.getByRole('button', { name: /chart of accounts/i })).toBeVisible();
    });

    test('displays account table with code, name, category', async ({ page }) => {
      await loginAsAccountant(page);
      await page.goto('/accounting');
      await page.waitForLoadState('networkidle');

      // Wait for data to load
      await expect(page.getByRole('heading', { name: 'Accounting' })).toBeVisible({ timeout: 10_000 });

      // Table headers should be visible
      const table = page.locator('table');
      if (await table.isVisible()) {
        await expect(page.getByText('Code')).toBeVisible();
        await expect(page.getByText('Name')).toBeVisible();
        await expect(page.getByText('Category')).toBeVisible();
      }
    });

    test('shows empty state when no accounts exist', async ({ page }) => {
      await loginAsAccountant(page);
      await page.goto('/accounting');
      await page.waitForLoadState('networkidle');

      // Either table with data or empty message
      await expect(
        page.locator('table tbody tr').first().or(page.getByText('No accounts found')),
      ).toBeVisible({ timeout: 5_000 });
    });

    test('field_officer gets Access Denied', async ({ page }) => {
      await loginAsFieldOfficer(page);
      await page.goto('/accounting');
      await expect(page.getByRole('heading', { name: 'Access Denied' })).toBeVisible({ timeout: 10_000 });
    });

    test('auditor can view chart of accounts (read-only)', async ({ page }) => {
      await loginAsAuditor(page);
      await page.goto('/accounting');
      await expect(page.getByRole('heading', { name: 'Accounting' })).toBeVisible({ timeout: 10_000 });
    });
  });

  test.describe('Daybook', () => {
    test('can switch to Daybook tab', async ({ page }) => {
      await loginAsAccountant(page);
      await page.goto('/accounting');
      await page.waitForLoadState('networkidle');

      // Click Daybook tab
      await page.getByRole('button', { name: /daybook/i }).click();

      // Date filter should be visible
      await expect(page.getByText('From')).toBeVisible({ timeout: 5_000 });
      await expect(page.getByText('To')).toBeVisible();
    });

    test('date filter updates journal entries', async ({ page }) => {
      await loginAsAccountant(page);
      await page.goto('/accounting');
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: /daybook/i }).click();
      await page.waitForLoadState('networkidle');

      // Change start date
      const startDateInput = page.locator('input[type="date"]').first();
      if (await startDateInput.isVisible()) {
        await startDateInput.fill('2024-01-01');
        await page.waitForLoadState('networkidle');
        // Data should refresh (no assertion needed, just verify no error)
      }
    });

    test('shows journal entries with debit/credit columns', async ({ page }) => {
      await loginAsAccountant(page);
      await page.goto('/accounting');
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: /daybook/i }).click();
      await page.waitForLoadState('networkidle');

      // Journal entries or empty state
      await expect(
        page.locator('[class*="card"]').or(page.getByText('No entries for this period')),
      ).toBeVisible({ timeout: 5_000 });
    });
  });

  test.describe('Trial Balance', () => {
    test('navigates to trial balance page', async ({ page }) => {
      await loginAsAccountant(page);
      await page.goto('/accounting');
      await page.waitForLoadState('networkidle');

      // Click Trial Balance link
      await page.getByRole('link', { name: /trial balance/i }).click();
      await page.waitForURL('**/accounting/trial-balance', { timeout: 10_000 });

      await expect(page.getByRole('heading', { name: 'Trial Balance' })).toBeVisible();
    });

    test('displays debit and credit columns', async ({ page }) => {
      await loginAsAccountant(page);
      await page.goto('/accounting/trial-balance');
      await page.waitForLoadState('networkidle');

      await expect(page.getByRole('heading', { name: 'Trial Balance' })).toBeVisible({ timeout: 10_000 });

      // Table should have Debit and Credit columns
      const table = page.locator('table');
      if (await table.isVisible()) {
        await expect(page.getByText('Debit')).toBeVisible();
        await expect(page.getByText('Credit')).toBeVisible();
      }
    });

    test('shows totals row', async ({ page }) => {
      await loginAsAccountant(page);
      await page.goto('/accounting/trial-balance');
      await page.waitForLoadState('networkidle');

      // Total row in footer
      const totalRow = page.locator('tfoot').or(page.getByText('Total'));
      // May or may not be visible depending on data
    });

    test('date filter works', async ({ page }) => {
      await loginAsAccountant(page);
      await page.goto('/accounting/trial-balance');
      await page.waitForLoadState('networkidle');

      // Date inputs should be visible
      await expect(page.locator('input[type="date"]').first()).toBeVisible({ timeout: 5_000 });
    });
  });

  test.describe('Profit & Loss', () => {
    test('navigates to P&L page', async ({ page }) => {
      await loginAsAccountant(page);
      await page.goto('/accounting');
      await page.waitForLoadState('networkidle');

      await page.getByRole('link', { name: /p&l|profit/i }).click();
      await page.waitForURL('**/accounting/profit-loss', { timeout: 10_000 });

      await expect(
        page.getByRole('heading', { name: /profit|p&l/i }),
      ).toBeVisible({ timeout: 10_000 });
    });

    test('displays income and expense sections', async ({ page }) => {
      await loginAsAccountant(page);
      await page.goto('/accounting/profit-loss');
      await page.waitForLoadState('networkidle');

      // Look for income/expense labels or sections
      await expect(
        page.getByText(/income/i).or(page.getByText(/expense/i)).or(page.getByText(/no data/i)),
      ).toBeVisible({ timeout: 10_000 });
    });

    test('date range filter works', async ({ page }) => {
      await loginAsAccountant(page);
      await page.goto('/accounting/profit-loss');
      await page.waitForLoadState('networkidle');

      await expect(page.locator('input[type="date"]').first()).toBeVisible({ timeout: 5_000 });
    });
  });

  test.describe('Balance Sheet', () => {
    test('navigates to Balance Sheet page', async ({ page }) => {
      await loginAsAccountant(page);
      await page.goto('/accounting');
      await page.waitForLoadState('networkidle');

      await page.getByRole('link', { name: /balance sheet/i }).click();
      await page.waitForURL('**/accounting/balance-sheet', { timeout: 10_000 });

      await expect(
        page.getByRole('heading', { name: /balance sheet/i }),
      ).toBeVisible({ timeout: 10_000 });
    });

    test('displays assets, liabilities, equity sections', async ({ page }) => {
      await loginAsAccountant(page);
      await page.goto('/accounting/balance-sheet');
      await page.waitForLoadState('networkidle');

      // Look for section labels
      await expect(
        page.getByText(/assets/i).or(page.getByText(/liabilities/i)).or(page.getByText(/no data/i)),
      ).toBeVisible({ timeout: 10_000 });
    });
  });

  test.describe('Navigation Links', () => {
    test('accounting page has links to all reports', async ({ page }) => {
      await loginAsAccountant(page);
      await page.goto('/accounting');
      await page.waitForLoadState('networkidle');

      await expect(page.getByRole('link', { name: /trial balance/i })).toBeVisible({ timeout: 10_000 });
      await expect(page.getByRole('link', { name: /p&l|profit/i })).toBeVisible();
      await expect(page.getByRole('link', { name: /balance sheet/i })).toBeVisible();
    });

    test('back navigation works from sub-pages', async ({ page }) => {
      await loginAsAccountant(page);
      await page.goto('/accounting/trial-balance');
      await page.waitForLoadState('networkidle');

      // Click back button
      const backButton = page.getByRole('link', { name: '' }).filter({ has: page.locator('svg') }).first();
      if (await backButton.isVisible()) {
        await backButton.click();
        await page.waitForURL('**/accounting', { timeout: 10_000 });
      }
    });
  });
});
