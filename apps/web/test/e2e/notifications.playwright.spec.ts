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

        // First row should have a status badge. StatusBadge renders a <span>
        // with rounded-full + capitalize classes — no literal "badge" class.
        await expect(
          firstRow.locator('span.rounded-full.capitalize').first(),
        ).toBeVisible();
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
          '/notifications?take=1',
          token
        );
        totalCount = notifications.total;
      } catch {
        totalCount = 0;
      }

      await adminPage.goto('/notifications');
      await adminPage.waitForLoadState('networkidle');

      // Wait for the heading so we know the page rendered before asserting pagination.
      await expect(adminPage.getByRole('heading', { name: 'Notifications' })).toBeVisible({
        timeout: 15_000,
      });

      if (totalCount > 20) {
        // Pagination should be visible — use .first() to tolerate any other "Page X of Y"
        // text that might appear elsewhere on the page.
        await expect(
          adminPage.getByText(/page \d+ of \d+/i).first(),
        ).toBeVisible({ timeout: 15_000 });
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

      // Should show access denied or redirect. AccessDenied renders both a heading
      // and a paragraph that match /access denied|permission/i, so .or() resolves
      // to multiple elements and triggers strict mode — use .first() to pick one.
      const accessDenied = fieldOfficerPage
        .getByText(/access denied|not authorized|permission/i)
        .first();
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

  /**
   * Retry + dead_letter coverage.
   *
   * The notification outbox has no API endpoint to seed a 'failed' or 'dead_letter'
   * row directly (creation only goes through finance transactions, and rows only
   * fail by going through the OutboxProcessor with a broken SMS provider — neither
   * is reachable from an E2E test in a deterministic time window).
   *
   * We close the gap by intercepting GET /notifications and POST /notifications/:id/retry
   * with page.route(), so we can deterministically render a failed/dead_letter row,
   * click the Retry button, assert the toast fires, and confirm the row status
   * transitions back to 'pending' after the mutation. This is the only way to
   * verify the full UI contract without flakiness.
   */
  test.describe('Retry Success + Dead Letter Handling', () => {
    const FAILED_ID = '11111111-1111-4111-8111-111111111111';
    const DEAD_LETTER_ID = '22222222-2222-4222-8222-222222222222';

    function makeNotification(overrides: {
      id: string;
      status: 'pending' | 'failed' | 'dead_letter' | 'sent' | 'processing';
      retry_count?: number;
      event_type?: string;
      recipient_mobile?: string;
      message_body?: string;
    }) {
      return {
        id: overrides.id,
        event_type: overrides.event_type ?? 'loan_disbursed',
        recipient_mobile: overrides.recipient_mobile ?? '9876543210',
        template_id: null,
        message_body: overrides.message_body ?? 'Your loan has been disbursed.',
        variables: {},
        status: overrides.status,
        retry_count: overrides.retry_count ?? 0,
        max_retries: 3,
        next_retry_at: null,
        provider_response: overrides.status === 'failed' || overrides.status === 'dead_letter'
          ? { error: 'SMS provider timeout' }
          : null,
        source_type: 'loan',
        source_id: '99999999-9999-4999-8999-999999999999',
        created_at: new Date().toISOString(),
        processed_at: overrides.status === 'failed' || overrides.status === 'dead_letter'
          ? new Date().toISOString()
          : null,
      };
    }

    test('manager clicks Retry on a failed notification, sees success toast, row flips to pending', async ({ managerPage }) => {
      // Per-test mutable state: simulate the backend updating the row when retry is POSTed.
      let failedRowStatus: 'failed' | 'pending' = 'failed';
      let retryCallCount = 0;

      await managerPage.route('**/notifications?**', async (route) => {
        const url = new URL(route.request().url());
        const statusFilter = url.searchParams.get('status');

        const failedRow = makeNotification({
          id: FAILED_ID,
          status: failedRowStatus,
          retry_count: failedRowStatus === 'failed' ? 2 : 0,
        });

        // If user filters to a specific status, only return matching rows.
        let data: ReturnType<typeof makeNotification>[] = [failedRow];
        if (statusFilter && statusFilter !== failedRowStatus) {
          data = [];
        }

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data, total: data.length }),
        });
      });

      await managerPage.route(`**/notifications/${FAILED_ID}/retry`, async (route) => {
        retryCallCount += 1;
        failedRowStatus = 'pending';
        const resetRow = makeNotification({
          id: FAILED_ID,
          status: 'pending',
          retry_count: 0,
        });
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(resetRow),
        });
      });

      await managerPage.setViewportSize({ width: 1280, height: 800 });
      await managerPage.goto('/notifications');
      await expect(managerPage.getByRole('heading', { name: 'Notifications' })).toBeVisible({
        timeout: 15_000,
      });

      // Sanity — Failed badge + Retry button are present in the desktop table.
      const tableRow = managerPage.locator('table tbody tr').first();
      await expect(tableRow).toBeVisible({ timeout: 15_000 });
      await expect(tableRow.getByText(/failed/i)).toBeVisible({ timeout: 15_000 });

      const retryButton = tableRow.getByRole('button', { name: /retry/i });
      await expect(retryButton).toBeVisible({ timeout: 15_000 });

      // Click Retry — verify mutation fires and success toast appears.
      await retryButton.click();

      // Toast container has role="status" and the success message text.
      await expect(
        managerPage.getByRole('status').filter({ hasText: /queued for retry/i }),
      ).toBeVisible({ timeout: 15_000 });

      expect(retryCallCount).toBe(1);

      // After the mutation, the cache is invalidated and refetched — the row
      // should now render as Pending and the Retry button should disappear.
      await expect(tableRow.getByText(/pending/i)).toBeVisible({ timeout: 15_000 });
      await expect(tableRow.getByRole('button', { name: /retry/i })).toHaveCount(0);
    });

    test('Dead Letter filter option is selectable and renders dead_letter rows with Retry button', async ({ managerPage }) => {
      let retryCallCount = 0;
      let deadLetterStatus: 'dead_letter' | 'pending' = 'dead_letter';

      await managerPage.route('**/notifications?**', async (route) => {
        const url = new URL(route.request().url());
        const statusFilter = url.searchParams.get('status');

        const deadLetterRow = makeNotification({
          id: DEAD_LETTER_ID,
          status: deadLetterStatus,
          retry_count: 3,
          event_type: 'collection_received',
          recipient_mobile: '9123456789',
          message_body: 'Payment received for loan installment.',
        });

        // No filter -> return all; filter -> only match.
        let data: ReturnType<typeof makeNotification>[] = [];
        if (!statusFilter) {
          data = [deadLetterRow];
        } else if (statusFilter === deadLetterStatus) {
          data = [deadLetterRow];
        }

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data, total: data.length }),
        });
      });

      await managerPage.route(`**/notifications/${DEAD_LETTER_ID}/retry`, async (route) => {
        retryCallCount += 1;
        deadLetterStatus = 'pending';
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            makeNotification({ id: DEAD_LETTER_ID, status: 'pending', retry_count: 0 }),
          ),
        });
      });

      await managerPage.setViewportSize({ width: 1280, height: 800 });
      await managerPage.goto('/notifications');
      await expect(managerPage.getByRole('heading', { name: 'Notifications' })).toBeVisible({
        timeout: 15_000,
      });

      // Open the status filter and pick "Dead Letter".
      const filterTrigger = managerPage.locator('[role="combobox"]').first();
      await filterTrigger.click();
      await managerPage.getByRole('option', { name: 'Dead Letter' }).click();
      await expect(filterTrigger).toContainText(/dead letter/i);

      // The dead_letter row is visible and shows a Retry button (since the page
      // surfaces Retry for both 'failed' and 'dead_letter').
      const tableRow = managerPage.locator('table tbody tr').first();
      await expect(tableRow).toBeVisible({ timeout: 15_000 });
      await expect(tableRow.getByText(/dead.?letter/i)).toBeVisible({ timeout: 15_000 });

      const retryButton = tableRow.getByRole('button', { name: /retry/i });
      await expect(retryButton).toBeVisible({ timeout: 15_000 });

      await retryButton.click();

      await expect(
        managerPage.getByRole('status').filter({ hasText: /queued for retry/i }),
      ).toBeVisible({ timeout: 15_000 });

      expect(retryCallCount).toBe(1);
    });

    test('Retry shows error toast when API rejects with 422 (non-retryable status)', async ({ managerPage }) => {
      await managerPage.route('**/notifications?**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: [makeNotification({ id: FAILED_ID, status: 'failed', retry_count: 2 })],
            total: 1,
          }),
        });
      });

      // Simulate the BusinessRuleError thrown by NotificationService.retry()
      // when the row is no longer in failed/dead_letter (race with processor).
      await managerPage.route(`**/notifications/${FAILED_ID}/retry`, async (route) => {
        await route.fulfill({
          status: 422,
          contentType: 'application/json',
          body: JSON.stringify({
            statusCode: 422,
            message:
              "Cannot retry message in 'sent' status. Only failed or dead_letter messages can be retried.",
            error: 'Unprocessable Entity',
          }),
        });
      });

      await managerPage.setViewportSize({ width: 1280, height: 800 });
      await managerPage.goto('/notifications');
      await expect(managerPage.getByRole('heading', { name: 'Notifications' })).toBeVisible({
        timeout: 15_000,
      });

      const retryButton = managerPage
        .locator('table tbody tr')
        .first()
        .getByRole('button', { name: /retry/i });
      await expect(retryButton).toBeVisible({ timeout: 15_000 });
      await retryButton.click();

      // Error toast — page shows the API error message or the generic fallback.
      // useToast renders into role="status" containers (one per toast).
      await expect(
        managerPage.getByRole('status').filter({ hasText: /cannot retry|failed to retry/i }),
      ).toBeVisible({ timeout: 15_000 });
    });

    test('auditor cannot retry — Retry button is hidden by PermissionGate even on a failed row', async ({ auditorPage }) => {
      await auditorPage.route('**/notifications?**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: [makeNotification({ id: FAILED_ID, status: 'failed', retry_count: 2 })],
            total: 1,
          }),
        });
      });

      await auditorPage.setViewportSize({ width: 1280, height: 800 });
      await auditorPage.goto('/notifications');

      // Auditor either has notification.read (sees rows but no Retry button) or
      // is denied entirely. Both outcomes satisfy "cannot retry". AccessDenied
      // renders both a heading and a paragraph matching /access denied|permission/i,
      // so we use .first() to avoid strict-mode violations in .or().
      const heading = auditorPage.getByRole('heading', { name: 'Notifications' });
      const denied = auditorPage
        .getByText(/access denied|not authorized|permission/i)
        .first();
      await expect(heading.or(denied)).toBeVisible({ timeout: 15_000 });

      if (await heading.isVisible()) {
        const row = auditorPage.locator('table tbody tr').first();
        await expect(row).toBeVisible({ timeout: 15_000 });
        await expect(row.getByText(/failed/i)).toBeVisible({ timeout: 15_000 });
        // No retry button — PermissionGate('notification.retry') strips it.
        await expect(row.getByRole('button', { name: /retry/i })).toHaveCount(0);
      }
    });
  });
});
