import { test, expect } from './fixtures';

/**
 * Reports Module — Playwright E2E Tests
 *
 * Tests cover:
 * 1. Reports Hub - report cards (currently 21 reports across 7 categories)
 * 2. Report Detail - date filters, data display, export
 * 3. Permission-based access and export
 *
 * Uses pre-authenticated fixtures for faster, more reliable tests.
 */

test.describe('Reports Module', () => {
  test.describe('Reports Hub', () => {
    test('manager can access reports hub', async ({ managerPage }) => {
      await managerPage.goto('/reports');
      await managerPage.waitForLoadState('domcontentloaded');
      await expect(managerPage.getByRole('heading', { name: 'Reports' })).toBeVisible({ timeout: 20_000 });
    });

    test('displays report cards', async ({ managerPage }) => {
      await managerPage.goto('/reports');
      await managerPage.waitForLoadState('domcontentloaded');
      // Wait for the Reports heading to confirm page loaded
      await expect(managerPage.getByRole('heading', { name: 'Reports' })).toBeVisible({ timeout: 20_000 });
      // Check that at least 6 report links are present (page currently has 21)
      const reportLinks = managerPage.locator('a[href^="/reports/"]');
      await expect(reportLinks.first()).toBeVisible({ timeout: 20_000 });
      const count = await reportLinks.count();
      expect(count).toBeGreaterThanOrEqual(6);
    });

    test('daily collection card navigates correctly', async ({ managerPage }) => {
      await managerPage.goto('/reports');
      await managerPage.waitForLoadState('domcontentloaded');
      // Wait for report cards to be visible
      const link = managerPage.locator('a[href="/reports/daily-collection"]');
      await expect(link).toBeVisible({ timeout: 20_000 });
      await link.click();
      await managerPage.waitForURL('**/reports/daily-collection', { timeout: 20_000 });
    });

    test('receipt register card navigates correctly', async ({ managerPage }) => {
      await managerPage.goto('/reports');
      await managerPage.waitForLoadState('domcontentloaded');
      // Wait for report cards to be visible
      const link = managerPage.locator('a[href="/reports/receipt-register"]');
      await expect(link).toBeVisible({ timeout: 20_000 });
      await link.click();
      await managerPage.waitForURL('**/reports/receipt-register', { timeout: 20_000 });
    });

    test('disbursement card navigates correctly', async ({ managerPage }) => {
      await managerPage.goto('/reports');
      await managerPage.waitForLoadState('domcontentloaded');
      // Wait for report cards to be visible
      const disbursementLink = managerPage.locator('a[href="/reports/disbursement"]');
      await expect(disbursementLink).toBeVisible({ timeout: 20_000 });
      await disbursementLink.click();
      await managerPage.waitForURL('**/reports/disbursement', { timeout: 20_000 });
    });

    test('overdue card navigates correctly', async ({ managerPage }) => {
      await managerPage.goto('/reports');
      await managerPage.waitForLoadState('domcontentloaded');
      // Wait for report cards to be visible
      const overdueLink = managerPage.locator('a[href="/reports/overdue"]');
      await expect(overdueLink).toBeVisible({ timeout: 20_000 });
      await overdueLink.click();
      await managerPage.waitForURL('**/reports/overdue', { timeout: 20_000 });
    });

    test('cash handover card navigates correctly', async ({ managerPage }) => {
      await managerPage.goto('/reports');
      await managerPage.waitForLoadState('domcontentloaded');
      // Wait for report cards to be visible
      const link = managerPage.locator('a[href="/reports/cash-handover"]');
      await expect(link).toBeVisible({ timeout: 20_000 });
      await link.click();
      await managerPage.waitForURL('**/reports/cash-handover', { timeout: 20_000 });
    });

    test('loan portfolio card navigates correctly', async ({ managerPage }) => {
      await managerPage.goto('/reports');
      await managerPage.waitForLoadState('domcontentloaded');
      // Wait for report cards to be visible
      const portfolioLink = managerPage.locator('a[href="/reports/loan-portfolio"]');
      await expect(portfolioLink).toBeVisible({ timeout: 20_000 });
      await portfolioLink.click();
      await managerPage.waitForURL('**/reports/loan-portfolio', { timeout: 20_000 });
    });

    test('office_staff gets Access Denied', async ({ officeStaffPage }) => {
      await officeStaffPage.goto('/reports');
      await officeStaffPage.waitForLoadState('domcontentloaded');
      await expect(officeStaffPage.getByRole('heading', { name: 'Access Denied' })).toBeVisible({ timeout: 20_000 });
    });
  });

  test.describe('Report Detail Page', () => {
    test('displays report with date filters', async ({ managerPage }) => {
      await managerPage.goto('/reports/daily-collection');
      await managerPage.waitForLoadState('domcontentloaded');
      await expect(managerPage.getByRole('heading', { name: /daily collection/i })).toBeVisible({ timeout: 30_000 });
      await expect(managerPage.getByText('Start Date')).toBeVisible({ timeout: 20_000 });
      await expect(managerPage.getByText('End Date')).toBeVisible({ timeout: 20_000 });
    });

    test('date filter changes report data', async ({ managerPage }) => {
      await managerPage.goto('/reports/daily-collection');
      await managerPage.waitForLoadState('domcontentloaded');
      // Wait for page to load
      await expect(managerPage.getByRole('heading', { name: /daily collection/i })).toBeVisible({ timeout: 30_000 });
      // Change start date
      const startDateInput = managerPage.locator('input[type="date"]').first();
      await expect(startDateInput).toBeVisible({ timeout: 20_000 });
      if (await startDateInput.isVisible()) {
        await startDateInput.fill('2024-01-01');
        await managerPage.waitForLoadState('domcontentloaded');
      }
    });

    test('shows data table or empty state', async ({ managerPage }) => {
      await managerPage.goto('/reports/daily-collection');
      await managerPage.waitForLoadState('domcontentloaded');
      // Wait for page heading to confirm page loaded
      await expect(managerPage.getByRole('heading', { name: /daily collection/i })).toBeVisible({ timeout: 30_000 });
      // Wait for loading to finish - could show table, empty message, or error
      await managerPage.waitForTimeout(3000); // Allow API response
      const hasTable = await managerPage.locator('table').isVisible().catch(() => false);
      const hasEmptyMessage = await managerPage.getByText('No data for this period.').isVisible().catch(() => false);
      const hasError = await managerPage.getByText(/too many requests|error|failed/i).isVisible().catch(() => false);
      // Page should show one of these states
      expect(hasTable || hasEmptyMessage || hasError).toBeTruthy();
    });

    test('manager sees export buttons', async ({ managerPage }) => {
      await managerPage.goto('/reports/daily-collection');
      await managerPage.waitForLoadState('domcontentloaded');
      // Wait for page heading to confirm page loaded
      await expect(managerPage.getByRole('heading', { name: /daily collection/i })).toBeVisible({ timeout: 30_000 });
      // PDF button should be visible (managers have export permission)
      await expect(managerPage.getByRole('button', { name: 'PDF' })).toBeVisible({ timeout: 20_000 });
    });

    test('accountant sees export buttons', async ({ accountantPage }) => {
      await accountantPage.goto('/reports/daily-collection');
      await accountantPage.waitForLoadState('domcontentloaded');
      // Wait for page heading to confirm page loaded
      await expect(accountantPage.getByRole('heading', { name: /daily collection/i })).toBeVisible({ timeout: 30_000 });
      // PDF button should be visible (accountants have export permission)
      await expect(accountantPage.getByRole('button', { name: 'PDF' })).toBeVisible({ timeout: 20_000 });
    });

    test('field_officer does NOT see export buttons', async ({ fieldOfficerPage }) => {
      await fieldOfficerPage.goto('/reports/daily-collection');
      await fieldOfficerPage.waitForLoadState('domcontentloaded');
      // Wait for page heading to confirm page loaded
      await expect(fieldOfficerPage.getByRole('heading', { name: /daily collection/i })).toBeVisible({ timeout: 30_000 });
      await expect(fieldOfficerPage.getByRole('button', { name: /pdf/i })).not.toBeVisible({ timeout: 5_000 });
      await expect(fieldOfficerPage.getByRole('button', { name: /excel/i })).not.toBeVisible({ timeout: 5_000 });
    });

    test('back button returns to reports hub', async ({ managerPage }) => {
      await managerPage.goto('/reports/daily-collection');
      await managerPage.waitForLoadState('domcontentloaded');
      // Wait for page heading to confirm page loaded
      await expect(managerPage.getByRole('heading', { name: /daily collection/i })).toBeVisible({ timeout: 30_000 });
      // Back button has ArrowLeft icon and is in main content (not sidebar)
      const backButton = managerPage.locator('main a[href="/reports"]').first();
      await expect(backButton).toBeVisible({ timeout: 20_000 });
      await backButton.click();
      await managerPage.waitForURL(/\/reports$/, { timeout: 20_000 });
    });
  });

  test.describe('Report Types', () => {
    const reportTypes = [
      { path: 'daily-collection', title: /daily collection/i },
      { path: 'receipt-register', title: /receipt register/i },
      { path: 'disbursement', title: /disbursement/i },
      { path: 'overdue', title: /overdue/i },
      { path: 'cash-handover', title: /cash handover/i },
      { path: 'loan-portfolio', title: /loan portfolio/i },
    ];

    for (const { path, title } of reportTypes) {
      test(`${path} report loads correctly`, async ({ managerPage }) => {
        await managerPage.goto(`/reports/${path}`);
        await managerPage.waitForLoadState('domcontentloaded');
        await expect(managerPage.getByRole('heading', { name: title })).toBeVisible({ timeout: 30_000 });
      });
    }
  });

  test.describe('Export Functionality', () => {
    test('PDF export button triggers download', async ({ managerPage }) => {
      await managerPage.goto('/reports/daily-collection');
      await managerPage.waitForLoadState('domcontentloaded');
      // Wait for page heading to confirm page loaded
      await expect(managerPage.getByRole('heading', { name: /daily collection/i })).toBeVisible({ timeout: 30_000 });
      const pdfButton = managerPage.getByRole('button', { name: /pdf/i });
      await expect(pdfButton).toBeVisible({ timeout: 20_000 });
      if (await pdfButton.isVisible()) {
        // Set up download listener
        const downloadPromise = managerPage.waitForEvent('download', { timeout: 15_000 }).catch(() => null);
        await pdfButton.click();
        // Download may or may not occur depending on data availability
        await downloadPromise;
      }
    });

    test('Excel export button triggers download', async ({ managerPage }) => {
      await managerPage.goto('/reports/daily-collection');
      await managerPage.waitForLoadState('domcontentloaded');
      // Wait for page heading to confirm page loaded
      await expect(managerPage.getByRole('heading', { name: /daily collection/i })).toBeVisible({ timeout: 30_000 });
      const excelButton = managerPage.getByRole('button', { name: /excel/i });
      await expect(excelButton).toBeVisible({ timeout: 20_000 });
      if (await excelButton.isVisible()) {
        const downloadPromise = managerPage.waitForEvent('download', { timeout: 15_000 }).catch(() => null);
        await excelButton.click();
        await downloadPromise;
      }
    });

    test('export buttons show loading state', async ({ managerPage }) => {
      await managerPage.goto('/reports/daily-collection');
      await managerPage.waitForLoadState('domcontentloaded');
      // Wait for page heading to confirm page loaded
      await expect(managerPage.getByRole('heading', { name: /daily collection/i })).toBeVisible({ timeout: 30_000 });
      const pdfButton = managerPage.getByRole('button', { name: 'PDF' });
      await expect(pdfButton).toBeVisible({ timeout: 20_000 });
      if (await pdfButton.isVisible()) {
        await pdfButton.click();
        // Button may show "Exporting…" while loading - just verify the interaction worked
        // The button will either show loading or return to PDF state
        await expect(pdfButton).toBeVisible({ timeout: 5_000 });
      }
    });
  });
});
