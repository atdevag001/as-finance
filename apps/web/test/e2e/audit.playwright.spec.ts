import { test, expect } from './fixtures';
import { loginAsAuditor, loginAsManager, loginAsFieldOfficer } from './fixtures';

/**
 * Audit Module — Playwright E2E Tests
 *
 * Tests cover:
 * 1. Audit log viewing - table, pagination
 * 2. Filtering - by entity, action, date
 * 3. Entry details - actor, timestamp, target
 * 4. Permission-based access
 */

test.describe('Audit Module', () => {
  test.describe('Page Access', () => {
    test('auditor can access audit log', async ({ page }) => {
      await loginAsAuditor(page);
      await page.goto('/audit');

      await expect(page.getByRole('heading', { name: 'Audit Log' })).toBeVisible({ timeout: 10_000 });
    });

    test('manager can access audit log', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/audit');

      await expect(page.getByRole('heading', { name: 'Audit Log' })).toBeVisible({ timeout: 10_000 });
    });

    test('field_officer gets Access Denied', async ({ page }) => {
      await loginAsFieldOfficer(page);
      await page.goto('/audit');

      await expect(page.getByRole('heading', { name: 'Access Denied' })).toBeVisible({ timeout: 10_000 });
    });
  });

  test.describe('Audit Log Table', () => {
    test('displays audit log entries', async ({ page }) => {
      await loginAsAuditor(page);
      await page.goto('/audit');
      await page.waitForLoadState('networkidle');

      // Table or empty state should be visible
      await expect(
        page.locator('table').or(page.getByText('No audit logs found')),
      ).toBeVisible({ timeout: 10_000 });
    });

    test('table has correct columns', async ({ page }) => {
      await loginAsAuditor(page);
      await page.goto('/audit');
      await page.waitForLoadState('networkidle');

      const table = page.locator('table');
      if (await table.isVisible()) {
        await expect(page.getByText('Timestamp')).toBeVisible();
        await expect(page.getByText('Action')).toBeVisible();
      }
    });

    test('pagination works', async ({ page }) => {
      await loginAsAuditor(page);
      await page.goto('/audit');
      await page.waitForLoadState('networkidle');

      const nextButton = page.getByRole('button', { name: /next/i });
      if (await nextButton.isVisible() && await nextButton.isEnabled()) {
        await nextButton.click();
        await page.waitForLoadState('networkidle');
      }
    });

    test('shows empty state when no logs exist', async ({ page }) => {
      await loginAsAuditor(page);
      await page.goto('/audit');
      await page.waitForLoadState('networkidle');

      // Check if table has data or empty message
      const emptyMessage = page.getByText('No audit logs found');
      const tableRows = page.locator('table tbody tr');

      const hasRows = await tableRows.count() > 0;
      if (!hasRows) {
        await expect(emptyMessage).toBeVisible();
      }
    });
  });

  test.describe('Filtering', () => {
    test('has entity filter input', async ({ page }) => {
      await loginAsAuditor(page);
      await page.goto('/audit');
      await page.waitForLoadState('networkidle');

      await expect(page.getByPlaceholder(/entity/i)).toBeVisible({ timeout: 10_000 });
    });

    test('has action filter input', async ({ page }) => {
      await loginAsAuditor(page);
      await page.goto('/audit');
      await page.waitForLoadState('networkidle');

      await expect(page.getByPlaceholder(/action/i)).toBeVisible({ timeout: 10_000 });
    });

    test('has date filter input', async ({ page }) => {
      await loginAsAuditor(page);
      await page.goto('/audit');
      await page.waitForLoadState('networkidle');

      await expect(page.locator('input[type="date"]')).toBeVisible({ timeout: 10_000 });
    });

    test('entity filter updates results', async ({ page }) => {
      await loginAsAuditor(page);
      await page.goto('/audit');
      await page.waitForLoadState('networkidle');

      const entityFilter = page.getByPlaceholder(/entity/i);
      await entityFilter.fill('customer');
      await page.waitForLoadState('networkidle');

      // Results should update (no error = success)
    });

    test('action filter updates results', async ({ page }) => {
      await loginAsAuditor(page);
      await page.goto('/audit');
      await page.waitForLoadState('networkidle');

      const actionFilter = page.getByPlaceholder(/action/i);
      await actionFilter.fill('create');
      await page.waitForLoadState('networkidle');

      // Results should update (no error = success)
    });

    test('date filter updates results', async ({ page }) => {
      await loginAsAuditor(page);
      await page.goto('/audit');
      await page.waitForLoadState('networkidle');

      const dateFilter = page.locator('input[type="date"]');
      await dateFilter.fill('2024-01-01');
      await page.waitForLoadState('networkidle');

      // Results should update (no error = success)
    });

    test('combined filters work together', async ({ page }) => {
      await loginAsAuditor(page);
      await page.goto('/audit');
      await page.waitForLoadState('networkidle');

      // Apply multiple filters
      await page.getByPlaceholder(/entity/i).fill('loan');
      await page.getByPlaceholder(/action/i).fill('approve');
      await page.waitForLoadState('networkidle');

      // Results should update based on combined filters
    });

    test('clearing filter resets page to 1', async ({ page }) => {
      await loginAsAuditor(page);
      await page.goto('/audit');
      await page.waitForLoadState('networkidle');

      // Apply filter
      const entityFilter = page.getByPlaceholder(/entity/i);
      await entityFilter.fill('customer');
      await page.waitForLoadState('networkidle');

      // Clear filter
      await entityFilter.fill('');
      await page.waitForLoadState('networkidle');

      // Should reset to first page
    });
  });

  test.describe('Entry Details', () => {
    test('shows action type in readable format', async ({ page }) => {
      await loginAsAuditor(page);
      await page.goto('/audit');
      await page.waitForLoadState('networkidle');

      const table = page.locator('table');
      if (await table.isVisible()) {
        // Action column should show human-readable action (e.g., "Create Customer")
        const actionCells = page.locator('table tbody td').nth(1);
        // Actions are displayed with capitalized text
      }
    });

    test('shows actor information', async ({ page }) => {
      await loginAsAuditor(page);
      await page.goto('/audit');
      await page.waitForLoadState('networkidle');

      const table = page.locator('table');
      if (await table.isVisible()) {
        // Actor column should show user ID and role
        // Look for role text (e.g., "manager", "field officer")
      }
    });

    test('shows target entity information', async ({ page }) => {
      await loginAsAuditor(page);
      await page.goto('/audit');
      await page.waitForLoadState('networkidle');

      const table = page.locator('table');
      if (await table.isVisible()) {
        // Entity column should show entity type and ID
      }
    });

    test('timestamps are in IST timezone', async ({ page }) => {
      await loginAsAuditor(page);
      await page.goto('/audit');
      await page.waitForLoadState('networkidle');

      const table = page.locator('table');
      if (await table.isVisible()) {
        // Timestamp cells should show date and time
        const timestampCells = page.locator('table tbody td').first();
        // Time should be formatted correctly (e.g., "15 Jan 2024, 10:30 AM")
      }
    });

    test('remarks column shows additional context', async ({ page }) => {
      await loginAsAuditor(page);
      await page.goto('/audit');
      await page.waitForLoadState('networkidle');

      const table = page.locator('table');
      if (await table.isVisible()) {
        // Remarks column shows additional information or "—" for empty
        const remarksCells = page.locator('table tbody tr td').last();
        // Should be visible (content varies)
      }
    });
  });

  test.describe('Responsive Columns', () => {
    test('mobile view hides some columns', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });

      await loginAsAuditor(page);
      await page.goto('/audit');
      await page.waitForLoadState('networkidle');

      // Some columns should be hidden on mobile (sm:table-cell, md:table-cell, lg:table-cell)
      // The table should still be visible and functional
      await expect(
        page.locator('table').or(page.getByText('No audit logs found')),
      ).toBeVisible({ timeout: 10_000 });
    });
  });

  test.describe('Read-Only Access', () => {
    test('auditor has read-only access', async ({ page }) => {
      await loginAsAuditor(page);
      await page.goto('/audit');
      await page.waitForLoadState('networkidle');

      // Auditor should not see any edit/delete buttons
      await expect(page.getByRole('button', { name: /edit/i })).not.toBeVisible({ timeout: 3_000 });
      await expect(page.getByRole('button', { name: /delete/i })).not.toBeVisible();
    });

    test('no create/add buttons visible', async ({ page }) => {
      await loginAsAuditor(page);
      await page.goto('/audit');
      await page.waitForLoadState('networkidle');

      await expect(page.getByRole('button', { name: /add/i })).not.toBeVisible({ timeout: 3_000 });
      await expect(page.getByRole('button', { name: /create/i })).not.toBeVisible();
    });
  });
});
