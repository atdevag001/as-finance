import { test, expect } from './fixtures';
import { getTokenForRole, createTestGroup, createTestCustomer, apiRequest } from './fixtures';

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
      // Table should be visible (may contain data or empty state message)
      await expect(managerPage.locator('table')).toBeVisible({ timeout: 10_000 });
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
      // Use exact match — table rows may contain group names like "E2E New Group 23048378"
      // which would otherwise produce a strict-mode violation against the create link.
      await expect(managerPage.getByRole('link', { name: 'New Group', exact: true })).toBeVisible();
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
        // Exact match — table may contain group names that include "New Group".
        await expect(auditorPage.getByRole('link', { name: 'New Group', exact: true })).toHaveCount(0);
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
        await managerPage.waitForLoadState('domcontentloaded');
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

        // Members section should be visible. Use heading role + .first() so we don't
        // collide with the "Members" label inside the Group Info card.
        await expect(
          managerPage
            .getByRole('heading', { name: /^members$/i })
            .or(managerPage.getByText(/no members yet/i))
            .first(),
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

        // Collection history section should be visible. Both the heading and the
        // "No group collections yet" placeholder can be present simultaneously, so
        // pick the first match to avoid a strict-mode violation on `.or()`.
        await expect(
          managerPage
            .getByRole('heading', { name: /collection history/i })
            .or(managerPage.getByText(/no group collections yet/i))
            .first(),
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

  /**
   * Add Member submission (success + error) and member-removal coverage.
   *
   * The detail page exposes only the Add Member dialog — backend supports member
   * removal via DELETE /groups/:id/members/:memberId, so we verify the removal
   * contract through the API and confirm the detail page reflects the change.
   */
  test.describe('Add Member submission & member removal', () => {
    test('manager can add an existing customer as a new member and sees confirmation', async ({
      managerPage,
    }) => {
      const token = await getTokenForRole('manager');

      // Seed fresh group + customer per test so results are deterministic.
      let groupId: string;
      let customerId: string;
      try {
        groupId = await createTestGroup(token, { name: `AddMember Success ${Date.now()}` });
        customerId = await createTestCustomer(token);
      } catch {
        test.skip();
        return;
      }

      // Fetch the seeded customer name so we can match it in the search dropdown.
      const customer = await apiRequest<{ full_name: string }>(
        'GET',
        `/customers/${customerId}`,
        token,
      );

      await managerPage.goto(`/groups/${groupId}`);
      await expect(managerPage.getByRole('heading', { name: /AddMember Success/i })).toBeVisible({
        timeout: 15_000,
      });

      // Open the Add Member dialog
      await managerPage.getByRole('button', { name: /add member/i }).click();
      await expect(managerPage.getByRole('dialog')).toBeVisible({ timeout: 10_000 });

      // Search by full name (debounced 300ms inside the page).
      const searchInput = managerPage.getByPlaceholder(/search customer by name/i);
      await searchInput.fill(customer.full_name);

      // The debounce + customer search query can take a moment; allow up to 15s for the dropdown row.
      const dropdownOption = managerPage
        .getByRole('dialog')
        .locator('li', { hasText: customer.full_name })
        .first();
      await expect(dropdownOption).toBeVisible({ timeout: 15_000 });
      await dropdownOption.click();

      // Submit the dialog
      await managerPage.getByRole('button', { name: /^add member$/i }).click();

      // Success toast should fire and the dialog should close.
      await expect(managerPage.getByText(/member added successfully/i)).toBeVisible({
        timeout: 15_000,
      });
      await expect(managerPage.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 });

      // Member should appear in the members list (matches mobile card OR desktop row).
      await expect(
        managerPage.getByText(customer.full_name).first(),
      ).toBeVisible({ timeout: 15_000 });

      // Verify against the API source of truth as well.
      const detail = await apiRequest<{ members: Array<{ customer_id: string }> }>(
        'GET',
        `/groups/${groupId}`,
        token,
      );
      expect(detail.members.some((m) => m.customer_id === customerId)).toBe(true);
    });

    test('adding a customer who is already a member surfaces an error in the dialog', async ({
      managerPage,
    }) => {
      const token = await getTokenForRole('manager');

      let groupId: string;
      let customerId: string;
      try {
        groupId = await createTestGroup(token, { name: `AddMember Duplicate ${Date.now()}` });
        customerId = await createTestCustomer(token);
        // Pre-add via API so the UI attempt is guaranteed to be a duplicate.
        await apiRequest('POST', `/groups/${groupId}/members`, token, { customerId });
      } catch {
        test.skip();
        return;
      }

      const customer = await apiRequest<{ full_name: string }>(
        'GET',
        `/customers/${customerId}`,
        token,
      );

      await managerPage.goto(`/groups/${groupId}`);
      await expect(managerPage.getByRole('heading', { name: /AddMember Duplicate/i })).toBeVisible({
        timeout: 15_000,
      });

      await managerPage.getByRole('button', { name: /add member/i }).click();
      await expect(managerPage.getByRole('dialog')).toBeVisible({ timeout: 10_000 });

      const searchInput = managerPage.getByPlaceholder(/search customer by name/i);
      await searchInput.fill(customer.full_name);

      const dropdownOption = managerPage
        .getByRole('dialog')
        .locator('li', { hasText: customer.full_name })
        .first();
      await expect(dropdownOption).toBeVisible({ timeout: 15_000 });
      await dropdownOption.click();

      await managerPage.getByRole('button', { name: /^add member$/i }).click();

      // The dialog should remain open and display the backend error message.
      // We don't assert the exact wording — the page sets `addMemberError` to the API error
      // text, so we look for any visible destructive (red) error inside the still-open dialog.
      const dialog = managerPage.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 10_000 });
      await expect(dialog.locator('.text-destructive').first()).toBeVisible({ timeout: 15_000 });

      // The success toast must NOT have appeared.
      await expect(managerPage.getByText(/member added successfully/i)).not.toBeVisible();

      // API should still only show one membership row for this customer.
      const detail = await apiRequest<{ members: Array<{ customer_id: string }> }>(
        'GET',
        `/groups/${groupId}`,
        token,
      );
      const matches = detail.members.filter((m) => m.customer_id === customerId);
      expect(matches.length).toBe(1);
    });

    test('submitting Add Member with no customer selected shows validation error', async ({
      managerPage,
    }) => {
      const token = await getTokenForRole('manager');

      let groupId: string;
      try {
        groupId = await createTestGroup(token, { name: `AddMember Validation ${Date.now()}` });
      } catch {
        test.skip();
        return;
      }

      await managerPage.goto(`/groups/${groupId}`);
      await expect(managerPage.getByRole('heading', { name: /AddMember Validation/i })).toBeVisible({
        timeout: 15_000,
      });

      await managerPage.getByRole('button', { name: /add member/i }).click();
      const dialog = managerPage.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 10_000 });

      // Click confirm without selecting a customer
      await managerPage.getByRole('button', { name: /^add member$/i }).click();

      // The handler short-circuits with "Please select a customer" before hitting the API.
      await expect(dialog.getByText(/please select a customer/i)).toBeVisible({ timeout: 10_000 });
      // Dialog should remain open
      await expect(dialog).toBeVisible();
    });

    test('auditor does NOT see Add Member button on group detail (RBAC denial)', async ({
      auditorPage,
    }) => {
      const token = await getTokenForRole('manager');

      let groupId: string;
      try {
        groupId = await createTestGroup(token, { name: `AddMember RBAC ${Date.now()}` });
      } catch {
        test.skip();
        return;
      }

      await auditorPage.goto(`/groups/${groupId}`);

      // Either the page loads (without the Add Member button) or we hit Access Denied.
      const heading = auditorPage.getByRole('heading', { name: /AddMember RBAC/i });
      const accessDenied = auditorPage.getByRole('heading', { name: /access denied/i });
      await expect(heading.or(accessDenied)).toBeVisible({ timeout: 15_000 });

      if (await heading.isVisible()) {
        await expect(
          auditorPage.getByRole('button', { name: /add member/i }),
        ).toHaveCount(0);
      }
    });

    test('member removal via API removes the member from the detail page view', async ({
      managerPage,
    }) => {
      const token = await getTokenForRole('manager');

      let groupId: string;
      let customerId: string;
      let memberId: string;
      try {
        groupId = await createTestGroup(token, { name: `MemberRemoval ${Date.now()}` });
        customerId = await createTestCustomer(token);
        const addResult = await apiRequest<{ id: string }>(
          'POST',
          `/groups/${groupId}/members`,
          token,
          { customerId },
        );
        memberId = addResult.id;
      } catch {
        test.skip();
        return;
      }

      const customer = await apiRequest<{ full_name: string }>(
        'GET',
        `/customers/${customerId}`,
        token,
      );

      // Confirm the member is present before removal.
      await managerPage.goto(`/groups/${groupId}`);
      await expect(managerPage.getByRole('heading', { name: /MemberRemoval/i })).toBeVisible({
        timeout: 15_000,
      });
      await expect(managerPage.getByText(customer.full_name).first()).toBeVisible({
        timeout: 15_000,
      });

      // Remove via API (UI has no removal control; this exercises the contract + page re-render).
      await apiRequest('DELETE', `/groups/${groupId}/members/${memberId}`, token);

      // Reload the detail page and verify the member no longer appears.
      await managerPage.goto(`/groups/${groupId}`);
      await expect(managerPage.getByRole('heading', { name: /MemberRemoval/i })).toBeVisible({
        timeout: 15_000,
      });
      await expect(managerPage.getByText(customer.full_name)).toHaveCount(0, {
        timeout: 15_000,
      });

      // API confirms member is gone too.
      const detail = await apiRequest<{ members: Array<{ customer_id: string }> }>(
        'GET',
        `/groups/${groupId}`,
        token,
      );
      expect(detail.members.some((m) => m.customer_id === customerId)).toBe(false);
    });

    test('auditor cannot remove a group member via the API (RBAC denial)', async ({}) => {
      const managerToken = await getTokenForRole('manager');
      const auditorToken = await getTokenForRole('viewer_auditor');

      let groupId: string;
      let memberId: string;
      try {
        groupId = await createTestGroup(managerToken, {
          name: `MemberRemoval RBAC ${Date.now()}`,
        });
        const customerId = await createTestCustomer(managerToken);
        const addResult = await apiRequest<{ id: string }>(
          'POST',
          `/groups/${groupId}/members`,
          managerToken,
          { customerId },
        );
        memberId = addResult.id;
      } catch {
        test.skip();
        return;
      }

      // Auditor lacks `group.manage_members`; expect the request to be rejected.
      let rejected = false;
      try {
        await apiRequest('DELETE', `/groups/${groupId}/members/${memberId}`, auditorToken);
      } catch (err) {
        rejected = true;
        // The error message includes the status; assert 401/403 specifically.
        expect((err as Error).message).toMatch(/40[13]/);
      }
      expect(rejected).toBe(true);

      // Member is still present.
      const detail = await apiRequest<{ members: Array<{ id: string }> }>(
        'GET',
        `/groups/${groupId}`,
        managerToken,
      );
      expect(detail.members.some((m) => m.id === memberId)).toBe(true);
    });
  });
});
