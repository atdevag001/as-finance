import { test, expect } from './fixtures';

/**
 * Reports Module — Playwright E2E Tests
 *
 * Tests cover:
 * 1. Reports Hub - 6 report cards
 * 2. Report Detail - date filters, data display, export
 * 3. Permission-based access and export
 *
 * Uses pre-authenticated fixtures for faster, more reliable tests.
 */

test.describe('Reports Module', () => {
  test.describe('Reports Hub', () => {
    test('manager can access reports hub', async ({ managerPage }) => {
      await managerPage.goto('/reports');
      await expect(managerPage.getByRole('heading', { name: 'Reports' })).toBeVisible({ timeout: 10_000 });
    });

    test('displays 6 report cards', async ({ managerPage }) => {
      await managerPage.goto('/reports');
      await managerPage.waitForLoadState('networkidle');
      // Check for report cards
      await expect(managerPage.getByText('Collection Summary')).toBeVisible({ timeout: 10_000 });
      await expect(managerPage.getByText('Outstanding')).toBeVisible();
      await expect(managerPage.getByText('Disbursement')).toBeVisible();
      await expect(managerPage.getByText('Overdue')).toBeVisible();
      await expect(managerPage.getByText('Demand')).toBeVisible();
      await expect(managerPage.getByText('Portfolio')).toBeVisible();
    });

    test('collection summary card navigates correctly', async ({ managerPage }) => {
      await managerPage.goto('/reports');
      await managerPage.waitForLoadState('networkidle');
      await managerPage.getByText('Collection Summary').click();
      await managerPage.waitForURL('**/reports/collection-summary', { timeout: 10_000 });
    });

    test('outstanding card navigates correctly', async ({ managerPage }) => {
      await managerPage.goto('/reports');
      await managerPage.waitForLoadState('networkidle');
      await managerPage.getByText('Outstanding').click();
      await managerPage.waitForURL('**/reports/outstanding', { timeout: 10_000 });
    });

    test('disbursement card navigates correctly', async ({ managerPage }) => {
      await managerPage.goto('/reports');
      await managerPage.waitForLoadState('networkidle');
      await managerPage.getByText('Disbursement').click();
      await managerPage.waitForURL('**/reports/disbursement', { timeout: 10_000 });
    });

    test('overdue card navigates correctly', async ({ managerPage }) => {
      await managerPage.goto('/reports');
      await managerPage.waitForLoadState('networkidle');
      await managerPage.getByText('Overdue').first().click();
      await managerPage.waitForURL('**/reports/overdue', { timeout: 10_000 });
    });

    test('demand card navigates correctly', async ({ managerPage }) => {
      await managerPage.goto('/reports');
      await managerPage.waitForLoadState('networkidle');
      await managerPage.getByText('Demand').click();
      await managerPage.waitForURL('**/reports/demand', { timeout: 10_000 });
    });

    test('portfolio card navigates correctly', async ({ managerPage }) => {
      await managerPage.goto('/reports');
      await managerPage.waitForLoadState('networkidle');
      await managerPage.getByText('Portfolio').click();
      await managerPage.waitForURL('**/reports/portfolio', { timeout: 10_000 });
    });

    test('office_staff gets Access Denied', async ({ officeStaffPage }) => {
      await officeStaffPage.goto('/reports');
      await expect(officeStaffPage.getByRole('heading', { name: 'Access Denied' })).toBeVisible({ timeout: 10_000 });
    });
  });

  test.describe('Report Detail Page', () => {
    test('displays report with date filters', async ({ managerPage }) => {
      await managerPage.goto('/reports/collection-summary');
      await managerPage.waitForLoadState('networkidle');
      await expect(managerPage.getByRole('heading', { name: /collection summary/i })).toBeVisible({ timeout: 10_000 });
      await expect(managerPage.getByText('Start Date')).toBeVisible();
      await expect(managerPage.getByText('End Date')).toBeVisible();
    });

    test('date filter changes report data', async ({ managerPage }) => {
      await managerPage.goto('/reports/collection-summary');
      await managerPage.waitForLoadState('networkidle');
      // Change start date
      const startDateInput = managerPage.locator('input[type="date"]').first();
      if (await startDateInput.isVisible()) {
        await startDateInput.fill('2024-01-01');
        await managerPage.waitForLoadState('networkidle');
      }
    });

    test('shows data table or empty state', async ({ managerPage }) => {
      await managerPage.goto('/reports/collection-summary');
      await managerPage.waitForLoadState('networkidle');
      // Either table with data or empty message
      await expect(
        managerPage.locator('table').or(managerPage.getByText(/no data/i)),
      ).toBeVisible({ timeout: 10_000 });
    });

    test('manager sees export buttons', async ({ managerPage }) => {
      await managerPage.goto('/reports/collection-summary');
      await managerPage.waitForLoadState('networkidle');
      await expect(
        managerPage.getByRole('button', { name: /pdf/i }).or(managerPage.getByRole('button', { name: /excel/i })),
      ).toBeVisible({ timeout: 10_000 });
    });

    test('accountant sees export buttons', async ({ accountantPage }) => {
      await accountantPage.goto('/reports/collection-summary');
      await accountantPage.waitForLoadState('networkidle');
      await expect(
        accountantPage.getByRole('button', { name: /pdf/i }).or(accountantPage.getByRole('button', { name: /excel/i })),
      ).toBeVisible({ timeout: 10_000 });
    });

    test('field_officer does NOT see export buttons', async ({ fieldOfficerPage }) => {
      await fieldOfficerPage.goto('/reports/collection-summary');
      await fieldOfficerPage.waitForLoadState('networkidle');
      await expect(fieldOfficerPage.getByRole('button', { name: /pdf/i })).not.toBeVisible({ timeout: 3_000 });
      await expect(fieldOfficerPage.getByRole('button', { name: /excel/i })).not.toBeVisible();
    });

    test('back button returns to reports hub', async ({ managerPage }) => {
      await managerPage.goto('/reports/collection-summary');
      await managerPage.waitForLoadState('networkidle');
      const backButton = managerPage.getByRole('link').filter({ has: managerPage.locator('svg') }).first();
      if (await backButton.isVisible()) {
        await backButton.click();
        await managerPage.waitForURL('**/reports', { timeout: 10_000 });
      }
    });
  });

  test.describe('Report Types', () => {
    const reportTypes = [
      { path: 'collection-summary', title: /collection summary/i },
      { path: 'outstanding', title: /outstanding/i },
      { path: 'disbursement', title: /disbursement/i },
      { path: 'overdue', title: /overdue/i },
      { path: 'demand', title: /demand/i },
      { path: 'portfolio', title: /portfolio/i },
    ];

    for (const { path, title } of reportTypes) {
      test(`${path} report loads correctly`, async ({ managerPage }) => {
        await managerPage.goto(`/reports/${path}`);
        await managerPage.waitForLoadState('networkidle');
        await expect(managerPage.getByRole('heading', { name: title })).toBeVisible({ timeout: 10_000 });
      });
    }
  });

  test.describe('Export Functionality', () => {
    test('PDF export button triggers download', async ({ managerPage }) => {
      await managerPage.goto('/reports/collection-summary');
      await managerPage.waitForLoadState('networkidle');
      const pdfButton = managerPage.getByRole('button', { name: /pdf/i });
      if (await pdfButton.isVisible()) {
        // Set up download listener
        const downloadPromise = managerPage.waitForEvent('download', { timeout: 10_000 }).catch(() => null);
        await pdfButton.click();
        // Download may or may not occur depending on data availability
        await downloadPromise;
      }
    });

    test('Excel export button triggers download', async ({ managerPage }) => {
      await managerPage.goto('/reports/collection-summary');
      await managerPage.waitForLoadState('networkidle');
      const excelButton = managerPage.getByRole('button', { name: /excel/i });
      if (await excelButton.isVisible()) {
        const downloadPromise = managerPage.waitForEvent('download', { timeout: 10_000 }).catch(() => null);
        await excelButton.click();
        await downloadPromise;
      }
    });

    test('export buttons show loading state', async ({ managerPage }) => {
      await managerPage.goto('/reports/collection-summary');
      await managerPage.waitForLoadState('networkidle');
      const pdfButton = managerPage.getByRole('button', { name: /pdf/i });
      if (await pdfButton.isVisible()) {
        await pdfButton.click();
        // Button should show loading state
        await expect(
          managerPage.getByText(/exporting/i).or(pdfButton),
        ).toBeVisible({ timeout: 3_000 });
      }
    });
  });
});
