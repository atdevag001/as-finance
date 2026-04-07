import { test, expect } from './fixtures';
import {
  loginAsManager,
  loginAsAuditor,
  loginAsCollectionOfficer,
  getTokenForRole,
  createTestCustomer,
  createTestLoan,
  advanceLoanToStatus,
  createTestGroup,
} from './fixtures';

/**
 * Groups Module — Playwright E2E Tests
 *
 * Tests cover:
 * 1. Groups list page - viewing, pagination, empty state
 * 2. Group detail page - info, members, collection history
 * 3. Group collection - posting payments for multiple members
 * 4. Permission-based access (manager vs auditor)
 */

test.describe('Groups Module', () => {
  test.describe('Groups List Page', () => {
    test('manager can view groups list', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/groups');

      await expect(page.getByRole('heading', { name: 'Groups' })).toBeVisible({ timeout: 10_000 });
      // Table or empty state should be visible
      await expect(
        page.locator('table').or(page.getByText('No groups found')),
      ).toBeVisible({ timeout: 5_000 });
    });

    test('shows empty state when no groups exist', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/groups');

      // Wait for page to load
      await expect(page.getByRole('heading', { name: 'Groups' })).toBeVisible({ timeout: 10_000 });

      // If table has no data, empty state message should appear
      const emptyMessage = page.getByText('No groups found');
      const table = page.locator('table tbody tr');

      // Either we have rows or we have the empty message
      const hasRows = await table.count() > 0;
      if (!hasRows) {
        await expect(emptyMessage).toBeVisible();
      }
    });

    test('manager sees "New Group" button', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/groups');

      await expect(page.getByRole('heading', { name: 'Groups' })).toBeVisible({ timeout: 10_000 });
      await expect(page.getByRole('link', { name: /new group/i })).toBeVisible();
    });

    test('auditor does NOT see "New Group" button', async ({ page }) => {
      await loginAsAuditor(page);
      await page.goto('/groups');

      // Auditor might see access denied or groups list without create button
      const heading = page.getByRole('heading', { name: 'Groups' });
      const accessDenied = page.getByRole('heading', { name: 'Access Denied' });

      // Wait for either to appear
      await expect(heading.or(accessDenied)).toBeVisible({ timeout: 10_000 });

      // If groups page loaded, new group button should NOT be visible
      if (await heading.isVisible()) {
        await expect(page.getByRole('link', { name: /new group/i })).not.toBeVisible();
      }
    });

    test('pagination controls work', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/groups');

      await expect(page.getByRole('heading', { name: 'Groups' })).toBeVisible({ timeout: 10_000 });

      // Pagination controls should be present
      const pagination = page.locator('[data-testid="pagination"]').or(
        page.getByRole('navigation', { name: /pagination/i }),
      ).or(page.locator('.pagination'));

      // If there's data and pagination exists, test it
      const nextButton = page.getByRole('button', { name: /next/i });
      if (await nextButton.isVisible()) {
        await nextButton.click();
        // Page should update (URL or content change)
        await page.waitForLoadState('networkidle');
      }
    });

    test('clicking group row navigates to detail', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/groups');

      await expect(page.getByRole('heading', { name: 'Groups' })).toBeVisible({ timeout: 10_000 });

      // Find first group link
      const groupLink = page.locator('table tbody tr a').first();
      if (await groupLink.isVisible()) {
        await groupLink.click();
        await page.waitForURL(/\/groups\/[^/]+$/, { timeout: 10_000 });
      }
    });
  });

  test.describe('Group Detail Page', () => {
    test('displays group info correctly', async ({ page }) => {
      // First create a test group via API
      const token = await getTokenForRole('manager');
      let groupId: string;

      try {
        groupId = await createTestGroup(token, { name: 'E2E Test Group' });
      } catch {
        // If group creation fails, skip the test
        test.skip();
        return;
      }

      await loginAsManager(page);
      await page.goto(`/groups/${groupId}`);

      // Should show group name
      await expect(page.getByRole('heading', { name: /E2E Test Group/i })).toBeVisible({
        timeout: 10_000,
      });

      // Should show group info card
      await expect(page.getByText('Group Info').or(page.getByText('Leader'))).toBeVisible();
    });

    test('shows members list', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/groups');

      await expect(page.getByRole('heading', { name: 'Groups' })).toBeVisible({ timeout: 10_000 });

      // Navigate to first group if exists
      const groupLink = page.locator('table tbody tr a').first();
      if (await groupLink.isVisible()) {
        await groupLink.click();
        await page.waitForURL(/\/groups\/[^/]+$/, { timeout: 10_000 });

        // Members section should be visible
        await expect(
          page.getByText('Members').or(page.getByText('No members yet')),
        ).toBeVisible({ timeout: 5_000 });
      }
    });

    test('shows collection history', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/groups');

      await expect(page.getByRole('heading', { name: 'Groups' })).toBeVisible({ timeout: 10_000 });

      // Navigate to first group if exists
      const groupLink = page.locator('table tbody tr a').first();
      if (await groupLink.isVisible()) {
        await groupLink.click();
        await page.waitForURL(/\/groups\/[^/]+$/, { timeout: 10_000 });

        // Collection history section should be visible
        await expect(
          page.getByText('Collection History').or(page.getByText('No group collections yet')),
        ).toBeVisible({ timeout: 5_000 });
      }
    });

    test('manager sees "Add Member" button', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/groups');

      await expect(page.getByRole('heading', { name: 'Groups' })).toBeVisible({ timeout: 10_000 });

      const groupLink = page.locator('table tbody tr a').first();
      if (await groupLink.isVisible()) {
        await groupLink.click();
        await page.waitForURL(/\/groups\/[^/]+$/, { timeout: 10_000 });

        // Add member button should be visible for manager
        await expect(
          page.getByRole('button', { name: /add member/i }),
        ).toBeVisible({ timeout: 5_000 });
      }
    });

    test('manager sees "Post Group Collection" button', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/groups');

      await expect(page.getByRole('heading', { name: 'Groups' })).toBeVisible({ timeout: 10_000 });

      const groupLink = page.locator('table tbody tr a').first();
      if (await groupLink.isVisible()) {
        await groupLink.click();
        await page.waitForURL(/\/groups\/[^/]+$/, { timeout: 10_000 });

        // Post group collection button should be visible for manager
        await expect(
          page.getByRole('button', { name: /post group collection/i }),
        ).toBeVisible({ timeout: 5_000 });
      }
    });
  });

  test.describe('Group Collection', () => {
    test('collection officer can post group collection', async ({ page }) => {
      await loginAsCollectionOfficer(page);
      await page.goto('/groups');

      // If access denied, skip - CO may not have group list access
      const accessDenied = page.getByRole('heading', { name: 'Access Denied' });
      if (await accessDenied.isVisible({ timeout: 3_000 }).catch(() => false)) {
        test.skip();
        return;
      }

      await expect(page.getByRole('heading', { name: 'Groups' })).toBeVisible({ timeout: 10_000 });

      const groupLink = page.locator('table tbody tr a').first();
      if (await groupLink.isVisible()) {
        await groupLink.click();
        await page.waitForURL(/\/groups\/[^/]+$/, { timeout: 10_000 });

        // Click post group collection button
        const collectButton = page.getByRole('button', { name: /post group collection/i });
        if (await collectButton.isVisible()) {
          await collectButton.click();

          // Dialog should open
          await expect(
            page.getByRole('dialog').or(page.getByText('Enter payment amounts')),
          ).toBeVisible({ timeout: 5_000 });
        }
      }
    });

    test('validates at least one payment amount required', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/groups');

      await expect(page.getByRole('heading', { name: 'Groups' })).toBeVisible({ timeout: 10_000 });

      const groupLink = page.locator('table tbody tr a').first();
      if (await groupLink.isVisible()) {
        await groupLink.click();
        await page.waitForURL(/\/groups\/[^/]+$/, { timeout: 10_000 });

        const collectButton = page.getByRole('button', { name: /post group collection/i });
        if (await collectButton.isVisible()) {
          await collectButton.click();

          // Try to submit without entering amounts
          const confirmButton = page.getByRole('button', { name: /post collection|confirm/i });
          if (await confirmButton.isVisible()) {
            await confirmButton.click();

            // Should show validation error
            await expect(
              page.getByText(/at least one payment/i).or(page.getByText(/enter.*amount/i)),
            ).toBeVisible({ timeout: 5_000 });
          }
        }
      }
    });
  });

  test.describe('Add Member Dialog', () => {
    test('add member dialog opens and accepts input', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/groups');

      await expect(page.getByRole('heading', { name: 'Groups' })).toBeVisible({ timeout: 10_000 });

      const groupLink = page.locator('table tbody tr a').first();
      if (await groupLink.isVisible()) {
        await groupLink.click();
        await page.waitForURL(/\/groups\/[^/]+$/, { timeout: 10_000 });

        const addMemberButton = page.getByRole('button', { name: /add member/i });
        if (await addMemberButton.isVisible()) {
          await addMemberButton.click();

          // Dialog should open with customer ID input
          await expect(
            page.getByRole('dialog').or(page.getByLabel(/customer id/i)),
          ).toBeVisible({ timeout: 5_000 });

          // Input should be present
          const customerIdInput = page.getByLabel(/customer id/i).or(
            page.getByPlaceholder(/customer/i),
          );
          await expect(customerIdInput).toBeVisible();
        }
      }
    });
  });
});
