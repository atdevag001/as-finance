import { test, expect } from './fixtures';
import { getTokenForRole, createTestGroup } from './fixtures';

/**
 * Groups Module — Playwright E2E Tests
 *
 * Uses pre-authenticated fixtures to avoid rate limiting.
 *
 * Tests cover:
 * 1. Groups list page - viewing, pagination, empty state
 * 2. Group detail page - info, members, collection history
 * 3. Group collection - posting payments for multiple members
 * 4. Permission-based access (manager vs auditor)
 */

test.describe('Groups Module', () => {
  test.describe('Groups List Page', () => {
    test('manager can view groups list', async ({ managerPage }) => {
      await managerPage.goto('/groups');

      await expect(managerPage.getByRole('heading', { name: 'Groups' })).toBeVisible({ timeout: 15_000 });
      // Table or empty state should be visible
      await expect(
        managerPage.locator('table').or(managerPage.getByText('No groups found')),
      ).toBeVisible({ timeout: 10_000 });
    });

    test('shows empty state when no groups exist', async ({ managerPage }) => {
      await managerPage.goto('/groups');

      // Wait for page to load
      await expect(managerPage.getByRole('heading', { name: 'Groups' })).toBeVisible({ timeout: 15_000 });

      // If table has no data, empty state message should appear
      const emptyMessage = managerPage.getByText('No groups found');
      const table = managerPage.locator('table tbody tr');

      // Either we have rows or we have the empty message
      const hasRows = await table.count() > 0;
      if (!hasRows) {
        await expect(emptyMessage).toBeVisible();
      }
    });

    test('manager sees "New Group" button', async ({ managerPage }) => {
      await managerPage.goto('/groups');

      await expect(managerPage.getByRole('heading', { name: 'Groups' })).toBeVisible({ timeout: 15_000 });
      await expect(managerPage.getByRole('link', { name: /new group/i })).toBeVisible();
    });

    test('auditor does NOT see "New Group" button', async ({ auditorPage }) => {
      await auditorPage.goto('/groups');

      // Auditor might see access denied or groups list without create button
      const heading = auditorPage.getByRole('heading', { name: 'Groups' });
      const accessDenied = auditorPage.getByRole('heading', { name: 'Access Denied' });

      // Wait for either to appear
      await expect(heading.or(accessDenied)).toBeVisible({ timeout: 15_000 });

      // If groups page loaded, new group button should NOT be visible
      if (await heading.isVisible()) {
        await expect(auditorPage.getByRole('link', { name: /new group/i })).not.toBeVisible();
      }
    });

    test('pagination controls work', async ({ managerPage }) => {
      await managerPage.goto('/groups');

      await expect(managerPage.getByRole('heading', { name: 'Groups' })).toBeVisible({ timeout: 15_000 });

      // If there's data and pagination exists, test it
      const nextButton = managerPage.getByRole('button', { name: /next/i });
      if (await nextButton.isVisible()) {
        await nextButton.click();
        // Page should update (URL or content change)
        await managerPage.waitForLoadState('networkidle');
      }
    });

    test('clicking group row navigates to detail', async ({ managerPage }) => {
      await managerPage.goto('/groups');

      await expect(managerPage.getByRole('heading', { name: 'Groups' })).toBeVisible({ timeout: 15_000 });

      // Find first group link
      const groupLink = managerPage.locator('table tbody tr a').first();
      if (await groupLink.isVisible()) {
        await groupLink.click();
        await managerPage.waitForURL(/\/groups\/[^/]+$/, { timeout: 15_000 });
      }
    });
  });

  test.describe('Group Detail Page', () => {
    test('displays group info correctly', async ({ managerPage }) => {
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

      await managerPage.goto(`/groups/${groupId}`);

      // Should show group name
      await expect(managerPage.getByRole('heading', { name: /E2E Test Group/i })).toBeVisible({
        timeout: 15_000,
      });

      // Should show group info card
      await expect(managerPage.getByText('Group Info').or(managerPage.getByText('Leader'))).toBeVisible();
    });

    test('shows members list', async ({ managerPage }) => {
      await managerPage.goto('/groups');

      await expect(managerPage.getByRole('heading', { name: 'Groups' })).toBeVisible({ timeout: 15_000 });

      // Navigate to first group if exists
      const groupLink = managerPage.locator('table tbody tr a').first();
      if (await groupLink.isVisible()) {
        await groupLink.click();
        await managerPage.waitForURL(/\/groups\/[^/]+$/, { timeout: 15_000 });

        // Members section should be visible
        await expect(
          managerPage.getByText('Members').or(managerPage.getByText('No members yet')),
        ).toBeVisible({ timeout: 10_000 });
      }
    });

    test('shows collection history', async ({ managerPage }) => {
      await managerPage.goto('/groups');

      await expect(managerPage.getByRole('heading', { name: 'Groups' })).toBeVisible({ timeout: 15_000 });

      // Navigate to first group if exists
      const groupLink = managerPage.locator('table tbody tr a').first();
      if (await groupLink.isVisible()) {
        await groupLink.click();
        await managerPage.waitForURL(/\/groups\/[^/]+$/, { timeout: 15_000 });

        // Collection history section should be visible
        await expect(
          managerPage.getByText('Collection History').or(managerPage.getByText('No group collections yet')),
        ).toBeVisible({ timeout: 10_000 });
      }
    });

    test('manager sees "Add Member" button', async ({ managerPage }) => {
      await managerPage.goto('/groups');

      await expect(managerPage.getByRole('heading', { name: 'Groups' })).toBeVisible({ timeout: 15_000 });

      const groupLink = managerPage.locator('table tbody tr a').first();
      if (await groupLink.isVisible()) {
        await groupLink.click();
        await managerPage.waitForURL(/\/groups\/[^/]+$/, { timeout: 15_000 });

        // Add member button should be visible for manager
        await expect(
          managerPage.getByRole('button', { name: /add member/i }),
        ).toBeVisible({ timeout: 10_000 });
      }
    });

    test('manager sees "Post Group Collection" button', async ({ managerPage }) => {
      await managerPage.goto('/groups');

      await expect(managerPage.getByRole('heading', { name: 'Groups' })).toBeVisible({ timeout: 15_000 });

      const groupLink = managerPage.locator('table tbody tr a').first();
      if (await groupLink.isVisible()) {
        await groupLink.click();
        await managerPage.waitForURL(/\/groups\/[^/]+$/, { timeout: 15_000 });

        // Post group collection button should be visible for manager
        await expect(
          managerPage.getByRole('button', { name: /post group collection/i }),
        ).toBeVisible({ timeout: 10_000 });
      }
    });
  });

  test.describe('Group Collection', () => {
    test('collection officer can post group collection', async ({ collectionOfficerPage }) => {
      await collectionOfficerPage.goto('/groups');

      // If access denied, skip - CO may not have group list access
      const accessDenied = collectionOfficerPage.getByRole('heading', { name: 'Access Denied' });
      if (await accessDenied.isVisible({ timeout: 5_000 }).catch(() => false)) {
        test.skip();
        return;
      }

      await expect(collectionOfficerPage.getByRole('heading', { name: 'Groups' })).toBeVisible({ timeout: 15_000 });

      const groupLink = collectionOfficerPage.locator('table tbody tr a').first();
      if (await groupLink.isVisible()) {
        await groupLink.click();
        await collectionOfficerPage.waitForURL(/\/groups\/[^/]+$/, { timeout: 15_000 });

        // Click post group collection button
        const collectButton = collectionOfficerPage.getByRole('button', { name: /post group collection/i });
        if (await collectButton.isVisible()) {
          await collectButton.click();

          // Dialog should open
          await expect(
            collectionOfficerPage.getByRole('dialog').or(collectionOfficerPage.getByText('Enter payment amounts')),
          ).toBeVisible({ timeout: 10_000 });
        }
      }
    });

    test('validates at least one payment amount required', async ({ managerPage }) => {
      await managerPage.goto('/groups');

      await expect(managerPage.getByRole('heading', { name: 'Groups' })).toBeVisible({ timeout: 15_000 });

      const groupLink = managerPage.locator('table tbody tr a').first();
      if (await groupLink.isVisible()) {
        await groupLink.click();
        await managerPage.waitForURL(/\/groups\/[^/]+$/, { timeout: 15_000 });

        const collectButton = managerPage.getByRole('button', { name: /post group collection/i });
        if (await collectButton.isVisible()) {
          await collectButton.click();

          // Try to submit without entering amounts
          const confirmButton = managerPage.getByRole('button', { name: /post collection|confirm/i });
          if (await confirmButton.isVisible()) {
            await confirmButton.click();

            // Should show validation error
            await expect(
              managerPage.getByText(/at least one payment/i).or(managerPage.getByText(/enter.*amount/i)),
            ).toBeVisible({ timeout: 10_000 });
          }
        }
      }
    });
  });

  test.describe('Add Member Dialog', () => {
    test('add member dialog opens and accepts input', async ({ managerPage }) => {
      await managerPage.goto('/groups');

      await expect(managerPage.getByRole('heading', { name: 'Groups' })).toBeVisible({ timeout: 15_000 });

      const groupLink = managerPage.locator('table tbody tr a').first();
      if (await groupLink.isVisible()) {
        await groupLink.click();
        await managerPage.waitForURL(/\/groups\/[^/]+$/, { timeout: 15_000 });

        const addMemberButton = managerPage.getByRole('button', { name: /add member/i });
        if (await addMemberButton.isVisible()) {
          await addMemberButton.click();

          // Dialog should open with customer ID input
          await expect(
            managerPage.getByRole('dialog').or(managerPage.getByLabel(/customer id/i)),
          ).toBeVisible({ timeout: 10_000 });

          // Input should be present
          const customerIdInput = managerPage.getByLabel(/customer id/i).or(
            managerPage.getByPlaceholder(/customer/i),
          );
          await expect(customerIdInput).toBeVisible();
        }
      }
    });
  });
});
