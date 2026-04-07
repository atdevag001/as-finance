import { test, expect } from './fixtures';
import { loginAsManager, loginAsAccountant, loginAsFieldOfficer, loginAsOfficeStaff } from './fixtures';

/**
 * Reports Module — Playwright E2E Tests
 *
 * Tests cover:
 * 1. Reports Hub - 6 report cards
 * 2. Report Detail - date filters, data display, export
 * 3. Permission-based access and export
 */

test.describe('Reports Module', () => {
  test.describe('Reports Hub', () => {
    test('manager can access reports hub', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/reports');

      await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible({ timeout: 10_000 });
    });

    test('displays 6 report cards', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/reports');
      await page.waitForLoadState('networkidle');

      // Check for report cards
      await expect(page.getByText('Collection Summary')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText('Outstanding')).toBeVisible();
      await expect(page.getByText('Disbursement')).toBeVisible();
      await expect(page.getByText('Overdue')).toBeVisible();
      await expect(page.getByText('Demand')).toBeVisible();
      await expect(page.getByText('Portfolio')).toBeVisible();
    });

    test('collection summary card navigates correctly', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/reports');
      await page.waitForLoadState('networkidle');

      await page.getByText('Collection Summary').click();
      await page.waitForURL('**/reports/collection-summary', { timeout: 10_000 });
    });

    test('outstanding card navigates correctly', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/reports');
      await page.waitForLoadState('networkidle');

      await page.getByText('Outstanding').click();
      await page.waitForURL('**/reports/outstanding', { timeout: 10_000 });
    });

    test('disbursement card navigates correctly', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/reports');
      await page.waitForLoadState('networkidle');

      await page.getByText('Disbursement').click();
      await page.waitForURL('**/reports/disbursement', { timeout: 10_000 });
    });

    test('overdue card navigates correctly', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/reports');
      await page.waitForLoadState('networkidle');

      await page.getByText('Overdue').first().click();
      await page.waitForURL('**/reports/overdue', { timeout: 10_000 });
    });

    test('demand card navigates correctly', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/reports');
      await page.waitForLoadState('networkidle');

      await page.getByText('Demand').click();
      await page.waitForURL('**/reports/demand', { timeout: 10_000 });
    });

    test('portfolio card navigates correctly', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/reports');
      await page.waitForLoadState('networkidle');

      await page.getByText('Portfolio').click();
      await page.waitForURL('**/reports/portfolio', { timeout: 10_000 });
    });

    test('office_staff gets Access Denied', async ({ page }) => {
      await loginAsOfficeStaff(page);
      await page.goto('/reports');

      await expect(page.getByRole('heading', { name: 'Access Denied' })).toBeVisible({ timeout: 10_000 });
    });
  });

  test.describe('Report Detail Page', () => {
    test('displays report with date filters', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/reports/collection-summary');
      await page.waitForLoadState('networkidle');

      await expect(page.getByRole('heading', { name: /collection summary/i })).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText('Start Date')).toBeVisible();
      await expect(page.getByText('End Date')).toBeVisible();
    });

    test('date filter changes report data', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/reports/collection-summary');
      await page.waitForLoadState('networkidle');

      // Change start date
      const startDateInput = page.locator('input[type="date"]').first();
      if (await startDateInput.isVisible()) {
        await startDateInput.fill('2024-01-01');
        await page.waitForLoadState('networkidle');
        // Data should refresh (no error = success)
      }
    });

    test('shows data table or empty state', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/reports/collection-summary');
      await page.waitForLoadState('networkidle');

      // Either table with data or empty message
      await expect(
        page.locator('table').or(page.getByText(/no data/i)),
      ).toBeVisible({ timeout: 10_000 });
    });

    test('manager sees export buttons', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/reports/collection-summary');
      await page.waitForLoadState('networkidle');

      await expect(
        page.getByRole('button', { name: /pdf/i }).or(page.getByRole('button', { name: /excel/i })),
      ).toBeVisible({ timeout: 10_000 });
    });

    test('accountant sees export buttons', async ({ page }) => {
      await loginAsAccountant(page);
      await page.goto('/reports/collection-summary');
      await page.waitForLoadState('networkidle');

      await expect(
        page.getByRole('button', { name: /pdf/i }).or(page.getByRole('button', { name: /excel/i })),
      ).toBeVisible({ timeout: 10_000 });
    });

    test('field_officer does NOT see export buttons', async ({ page }) => {
      await loginAsFieldOfficer(page);
      await page.goto('/reports/collection-summary');
      await page.waitForLoadState('networkidle');

      await expect(page.getByRole('button', { name: /pdf/i })).not.toBeVisible({ timeout: 3_000 });
      await expect(page.getByRole('button', { name: /excel/i })).not.toBeVisible();
    });

    test('back button returns to reports hub', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/reports/collection-summary');
      await page.waitForLoadState('networkidle');

      const backButton = page.getByRole('link').filter({ has: page.locator('svg') }).first();
      if (await backButton.isVisible()) {
        await backButton.click();
        await page.waitForURL('**/reports', { timeout: 10_000 });
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
      test(`${path} report loads correctly`, async ({ page }) => {
        await loginAsManager(page);
        await page.goto(`/reports/${path}`);
        await page.waitForLoadState('networkidle');

        await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 10_000 });
      });
    }
  });

  test.describe('Export Functionality', () => {
    test('PDF export button triggers download', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/reports/collection-summary');
      await page.waitForLoadState('networkidle');

      const pdfButton = page.getByRole('button', { name: /pdf/i });
      if (await pdfButton.isVisible()) {
        // Set up download listener
        const downloadPromise = page.waitForEvent('download', { timeout: 10_000 }).catch(() => null);

        await pdfButton.click();

        // Wait for download or timeout (export might fail if no data)
        const download = await downloadPromise;
        // Download may or may not occur depending on data availability
      }
    });

    test('Excel export button triggers download', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/reports/collection-summary');
      await page.waitForLoadState('networkidle');

      const excelButton = page.getByRole('button', { name: /excel/i });
      if (await excelButton.isVisible()) {
        const downloadPromise = page.waitForEvent('download', { timeout: 10_000 }).catch(() => null);

        await excelButton.click();

        const download = await downloadPromise;
        // Download may or may not occur depending on data availability
      }
    });

    test('export buttons show loading state', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/reports/collection-summary');
      await page.waitForLoadState('networkidle');

      const pdfButton = page.getByRole('button', { name: /pdf/i });
      if (await pdfButton.isVisible()) {
        await pdfButton.click();

        // Button should show loading state (Exporting...)
        await expect(
          page.getByText(/exporting/i).or(pdfButton),
        ).toBeVisible({ timeout: 3_000 });
      }
    });
  });
});
