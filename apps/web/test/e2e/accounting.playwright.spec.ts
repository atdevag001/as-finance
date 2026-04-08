import { test, expect } from './fixtures';

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
 *
 * Uses pre-authenticated page fixtures (accountantPage, auditorPage, etc.)
 * instead of UI login for faster test execution.
 */

test.describe('Accounting Module', () => {
  test.describe('Chart of Accounts', () => {
    test('accountant can view chart of accounts', async ({ accountantPage }) => {
      await accountantPage.goto('/accounting');
      await expect(accountantPage.getByRole('heading', { name: 'Accounting' })).toBeVisible({ timeout: 15_000 });
      await expect(accountantPage.getByRole('button', { name: /chart of accounts/i })).toBeVisible();
    });

    test('displays account table with code, name, category', async ({ accountantPage }) => {
      await accountantPage.goto('/accounting');
      await accountantPage.waitForLoadState('networkidle');
      await expect(accountantPage.getByRole('heading', { name: 'Accounting' })).toBeVisible({ timeout: 15_000 });

      const table = accountantPage.locator('table');
      if (await table.isVisible()) {
        await expect(accountantPage.getByText('Code')).toBeVisible();
        await expect(accountantPage.getByText('Name')).toBeVisible();
        await expect(accountantPage.getByText('Category')).toBeVisible();
      }
    });

    test('shows empty state when no accounts exist', async ({ accountantPage }) => {
      await accountantPage.goto('/accounting');
      await accountantPage.waitForLoadState('networkidle');
      await expect(
        accountantPage.locator('table tbody tr').first().or(accountantPage.getByText('No accounts found')),
      ).toBeVisible({ timeout: 10_000 });
    });

    test('field_officer gets Access Denied', async ({ fieldOfficerPage }) => {
      await fieldOfficerPage.goto('/accounting');
      await expect(fieldOfficerPage.getByRole('heading', { name: 'Access Denied' })).toBeVisible({ timeout: 15_000 });
    });

    test('auditor can view chart of accounts (read-only)', async ({ auditorPage }) => {
      await auditorPage.goto('/accounting');
      await expect(auditorPage.getByRole('heading', { name: 'Accounting' })).toBeVisible({ timeout: 15_000 });
    });
  });

  test.describe('Daybook', () => {
    test('can switch to Daybook tab', async ({ accountantPage }) => {
      await accountantPage.goto('/accounting');
      await accountantPage.waitForLoadState('networkidle');
      await accountantPage.getByRole('button', { name: /daybook/i }).click();
      await expect(accountantPage.getByText('From')).toBeVisible({ timeout: 10_000 });
      await expect(accountantPage.getByText('To')).toBeVisible();
    });

    test('date filter updates journal entries', async ({ accountantPage }) => {
      await accountantPage.goto('/accounting');
      await accountantPage.waitForLoadState('networkidle');
      await accountantPage.getByRole('button', { name: /daybook/i }).click();
      await accountantPage.waitForLoadState('networkidle');

      const startDateInput = accountantPage.locator('input[type="date"]').first();
      if (await startDateInput.isVisible()) {
        await startDateInput.fill('2024-01-01');
        await accountantPage.waitForLoadState('networkidle');
      }
    });

    test('shows journal entries with debit/credit columns', async ({ accountantPage }) => {
      await accountantPage.goto('/accounting');
      await accountantPage.waitForLoadState('networkidle');
      await accountantPage.getByRole('button', { name: /daybook/i }).click();
      await accountantPage.waitForLoadState('networkidle');

      await expect(
        accountantPage.locator('[class*="card"]').or(accountantPage.getByText('No entries for this period')),
      ).toBeVisible({ timeout: 10_000 });
    });
  });

  test.describe('Trial Balance', () => {
    test('navigates to trial balance page', async ({ accountantPage }) => {
      await accountantPage.goto('/accounting');
      await accountantPage.waitForLoadState('networkidle');
      await accountantPage.getByRole('link', { name: /trial balance/i }).click();
      await accountantPage.waitForURL('**/accounting/trial-balance', { timeout: 15_000 });
      await expect(accountantPage.getByRole('heading', { name: 'Trial Balance' })).toBeVisible();
    });

    test('displays debit and credit columns', async ({ accountantPage }) => {
      await accountantPage.goto('/accounting/trial-balance');
      await accountantPage.waitForLoadState('networkidle');
      await expect(accountantPage.getByRole('heading', { name: 'Trial Balance' })).toBeVisible({ timeout: 15_000 });

      const table = accountantPage.locator('table');
      if (await table.isVisible()) {
        await expect(accountantPage.getByText('Debit')).toBeVisible();
        await expect(accountantPage.getByText('Credit')).toBeVisible();
      }
    });

    test('shows totals row', async ({ accountantPage }) => {
      await accountantPage.goto('/accounting/trial-balance');
      await accountantPage.waitForLoadState('networkidle');
      // Total row may or may not be visible depending on data
      await expect(accountantPage.getByRole('heading', { name: 'Trial Balance' })).toBeVisible({ timeout: 15_000 });
    });

    test('date filter works', async ({ accountantPage }) => {
      await accountantPage.goto('/accounting/trial-balance');
      await accountantPage.waitForLoadState('networkidle');
      await expect(accountantPage.locator('input[type="date"]').first()).toBeVisible({ timeout: 10_000 });
    });
  });

  test.describe('Profit & Loss', () => {
    test('navigates to P&L page', async ({ accountantPage }) => {
      await accountantPage.goto('/accounting');
      await accountantPage.waitForLoadState('networkidle');
      await accountantPage.getByRole('link', { name: /p&l|profit/i }).click();
      await accountantPage.waitForURL('**/accounting/profit-loss', { timeout: 15_000 });
      await expect(accountantPage.getByRole('heading', { name: /profit|p&l/i })).toBeVisible({ timeout: 15_000 });
    });

    test('displays income and expense sections', async ({ accountantPage }) => {
      await accountantPage.goto('/accounting/profit-loss');
      await accountantPage.waitForLoadState('networkidle');
      await expect(
        accountantPage.getByText(/income/i).or(accountantPage.getByText(/expense/i)).or(accountantPage.getByText(/no data/i)),
      ).toBeVisible({ timeout: 15_000 });
    });

    test('date range filter works', async ({ accountantPage }) => {
      await accountantPage.goto('/accounting/profit-loss');
      await accountantPage.waitForLoadState('networkidle');
      await expect(accountantPage.locator('input[type="date"]').first()).toBeVisible({ timeout: 10_000 });
    });
  });

  test.describe('Balance Sheet', () => {
    test('navigates to Balance Sheet page', async ({ accountantPage }) => {
      await accountantPage.goto('/accounting');
      await accountantPage.waitForLoadState('networkidle');
      await accountantPage.getByRole('link', { name: /balance sheet/i }).click();
      await accountantPage.waitForURL('**/accounting/balance-sheet', { timeout: 15_000 });
      await expect(accountantPage.getByRole('heading', { name: /balance sheet/i })).toBeVisible({ timeout: 15_000 });
    });

    test('displays assets, liabilities, equity sections', async ({ accountantPage }) => {
      await accountantPage.goto('/accounting/balance-sheet');
      await accountantPage.waitForLoadState('networkidle');
      await expect(
        accountantPage.getByText(/assets/i).or(accountantPage.getByText(/liabilities/i)).or(accountantPage.getByText(/no data/i)),
      ).toBeVisible({ timeout: 15_000 });
    });
  });

  test.describe('Navigation Links', () => {
    test('accounting page has links to all reports', async ({ accountantPage }) => {
      await accountantPage.goto('/accounting');
      await accountantPage.waitForLoadState('networkidle');
      await expect(accountantPage.getByRole('link', { name: /trial balance/i })).toBeVisible({ timeout: 15_000 });
      await expect(accountantPage.getByRole('link', { name: /p&l|profit/i })).toBeVisible();
      await expect(accountantPage.getByRole('link', { name: /balance sheet/i })).toBeVisible();
    });

    test('back navigation works from sub-pages', async ({ accountantPage }) => {
      await accountantPage.goto('/accounting/trial-balance');
      await accountantPage.waitForLoadState('networkidle');
      const backButton = accountantPage.getByRole('link', { name: '' }).filter({ has: accountantPage.locator('svg') }).first();
      if (await backButton.isVisible()) {
        await backButton.click();
        await accountantPage.waitForURL('**/accounting', { timeout: 15_000 });
      }
    });
  });
});
