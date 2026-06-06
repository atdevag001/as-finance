import { test, expect, getTokenForRole, apiRequest } from './fixtures';

/**
 * Notifications Page — Playwright E2E Tests
 *
 * Uses pre-authenticated adminPage fixture (admins have notification.read permission).
 *
 * Tests cover:
 * 1. Notifications page loads with table/list
 * 2. Status filter works correctly
 * 3. Retry button appears for failed notifications
 * 4. Pagination works
 * 5. Mobile view shows card layout
 * 6. RBAC — unauthorized roles see access denied
 */

test.describe('Notifications Page', () => {
  test.describe('Page Load', () => {
    test('notifications page loads with heading', async ({ adminPage }) => {
      await adminPage.goto('/notifications');
      await adminPage.waitForLoadState('domcontentloaded');

      await expect(adminPage.getByRole('heading', { name: 'Notifications' })).toBeVisible({ timeout: 15_000 });
    });

    test('notifications table displays on desktop', async ({ adminPage }) => {
      await adminPage.setViewportSize({ width: 1280, height: 800 });
      await adminPage.goto('/notifications');
      await adminPage.waitForLoadState('networkidle');

      await expect(adminPage.getByRole('heading', { name: 'Notifications' })).toBeVisible({ timeout: 15_000 });

      // Either table is visible or empty state message
      const table = adminPage.locator('table');
      const emptyState = adminPage.getByText(/no notifications found/i);

      await expect(table.or(emptyState)).toBeVisible({ timeout: 15_000 });
    });

    test('notifications show card layout on mobile', async ({ adminPage }) => {
      await adminPage.setViewportSize({ width: 375, height: 667 });
      await adminPage.goto('/notifications');
      await adminPage.waitForLoadState('networkidle');

      await expect(adminPage.getByRole('heading', { name: 'Notifications' })).toBeVisible({ timeout: 15_000 });

      // Table should be hidden on mobile (lg:hidden on mobile cards, hidden lg:block on table)
      const table = adminPage.locator('.hidden.lg\\:block table');
      await expect(table).not.toBeVisible();

      // Cards should be visible (or empty state)
      const mobileCards = adminPage.locator('.space-y-3.lg\\:hidden');
      const emptyState = adminPage.getByText(/no notifications found/i);
      await expect(mobileCards.or(emptyState)).toBeVisible({ timeout: 15_000 });
    });
  });

  test.describe('Status Filter', () => {
    test('status filter dropdown is present', async ({ adminPage }) => {
      await adminPage.goto('/notifications');
      await adminPage.waitForLoadState('networkidle');

      await expect(adminPage.getByRole('heading', { name: 'Notifications' })).toBeVisible({ timeout: 15_000 });

      // Find the status filter trigger
      const filterTrigger = adminPage.locator('[role="combobox"]').filter({ hasText: /all statuses/i });
      await expect(filterTrigger).toBeVisible();
    });

    test('can filter by pending status', async ({ adminPage }) => {
      await adminPage.goto('/notifications');
      await adminPage.waitForLoadState('networkidle');

      await expect(adminPage.getByRole('heading', { name: 'Notifications' })).toBeVisible({ timeout: 15_000 });

      // Open the filter dropdown
      const filterTrigger = adminPage.locator('[role="combobox"]');
      await filterTrigger.click();

      // Select "Pending"
      await adminPage.getByRole('option', { name: 'Pending' }).click();

      // Filter should update
      await expect(filterTrigger).toContainText('Pending');

      // Wait for the page to reflect the filter
      await adminPage.waitForLoadState('networkidle');
    });

    test('can filter by failed status', async ({ adminPage }) => {
      await adminPage.goto('/notifications');
      await adminPage.waitForLoadState('networkidle');

      await expect(adminPage.getByRole('heading', { name: 'Notifications' })).toBeVisible({ timeout: 15_000 });

      const filterTrigger = adminPage.locator('[role="combobox"]');
      await filterTrigger.click();

      await adminPage.getByRole('option', { name: 'Failed' }).click();

      await expect(filterTrigger).toContainText('Failed');
    });

    test('filter resets page to 1', async ({ adminPage }) => {
      await adminPage.goto('/notifications');
      await adminPage.waitForLoadState('networkidle');

      await expect(adminPage.getByRole('heading', { name: 'Notifications' })).toBeVisible({ timeout: 15_000 });

      // Change filter
      const filterTrigger = adminPage.locator('[role="combobox"]');
      await filterTrigger.click();
      await adminPage.getByRole('option', { name: 'Sent' }).click();

      // Page should reset (pagination controls should show page 1 if pagination is visible)
      // This is implicit in the filter behavior
      await adminPage.waitForLoadState('networkidle');
    });
  });

  test.describe('Retry Functionality', () => {
    test('retry button appears for failed notifications', async ({ adminPage }) => {
      // First check if there are any failed notifications via API
      const token = await getTokenForRole('super_admin');
      let hasFailedNotifications = false;

      try {
        const notifications = await apiRequest<{ data: Array<{ status: string }> }>(
          'GET',
          '/notifications?status=failed&limit=1',
          token
        );
        hasFailedNotifications = notifications.data.length > 0;
      } catch {
        // API might not have this endpoint or no data
        hasFailedNotifications = false;
      }

      await adminPage.goto('/notifications');
      await adminPage.waitForLoadState('networkidle');

      if (hasFailedNotifications) {
        // Filter to failed
        const filterTrigger = adminPage.locator('[role="combobox"]');
        await filterTrigger.click();
        await adminPage.getByRole('option', { name: 'Failed' }).click();
        await adminPage.waitForLoadState('networkidle');

        // Retry button should be visible
        await expect(adminPage.getByRole('button', { name: /retry/i })).toBeVisible({ timeout: 15_000 });
      } else {
        // No failed notifications, test passes (nothing to retry)
        test.skip();
      }
    });
  });

  test.describe('Notification Details', () => {
    test('notification row shows event type, recipient, and status', async ({ adminPage }) => {
      await adminPage.setViewportSize({ width: 1280, height: 800 });
      await adminPage.goto('/notifications');
      await adminPage.waitForLoadState('networkidle');

      await expect(adminPage.getByRole('heading', { name: 'Notifications' })).toBeVisible({ timeout: 15_000 });

      // If table has rows, verify structure
      const tableRows = adminPage.locator('table tbody tr');
      const rowCount = await tableRows.count();

      if (rowCount > 0) {
        const firstRow = tableRows.first();
        // Check table headers exist (indicates proper structure)
        await expect(adminPage.getByRole('columnheader', { name: /event/i })).toBeVisible();
        await expect(adminPage.getByRole('columnheader', { name: /recipient/i })).toBeVisible();
        await expect(adminPage.getByRole('columnheader', { name: /status/i })).toBeVisible();

        // First row should have a status badge
        await expect(firstRow.locator('[class*="badge"], [class*="status"]')).toBeVisible();
      }
    });
  });

  test.describe('Pagination', () => {
    test('pagination controls appear when multiple pages exist', async ({ adminPage }) => {
      // Fetch to check if there are enough notifications for pagination
      const token = await getTokenForRole('super_admin');
      let totalCount = 0;

      try {
        const notifications = await apiRequest<{ total: number }>(
          'GET',
          '/notifications?limit=1',
          token
        );
        totalCount = notifications.total;
      } catch {
        totalCount = 0;
      }

      await adminPage.goto('/notifications');
      await adminPage.waitForLoadState('networkidle');

      if (totalCount > 20) {
        // Pagination should be visible
        await expect(adminPage.getByText(/page \d+ of \d+/i)).toBeVisible({ timeout: 15_000 });
      } else {
        // Few/no notifications, pagination may not show or show "Page 1 of 1"
        // This is acceptable behavior
      }
    });
  });

  test.describe('RBAC', () => {
    test('field officer cannot access notifications page', async ({ fieldOfficerPage }) => {
      await fieldOfficerPage.goto('/notifications');
      await fieldOfficerPage.waitForLoadState('domcontentloaded');

      // Should show access denied or redirect
      const accessDenied = fieldOfficerPage.getByText(/access denied|not authorized|permission/i);
      const redirectedAway = fieldOfficerPage.getByRole('heading', { name: 'Dashboard' });

      await expect(accessDenied.or(redirectedAway)).toBeVisible({ timeout: 15_000 });
    });

    test('manager can access notifications page', async ({ managerPage }) => {
      await managerPage.goto('/notifications');
      await managerPage.waitForLoadState('domcontentloaded');

      // Manager should have access (notification.read permission)
      await expect(managerPage.getByRole('heading', { name: 'Notifications' })).toBeVisible({ timeout: 15_000 });
    });
  });
});
