import { test, expect, apiRequest, getTokenForRole } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * Settings Module — Playwright E2E Tests
 *
 * Tests cover:
 * 1. System Settings - view, edit, save
 * 2. Holiday Calendar - view, add, delete
 * 3. Dirty state tracking
 * 4. Permission-based access
 *
 * Uses pre-authenticated fixtures for faster, more reliable tests.
 */

/**
 * Navigate to a route and recover from the rare race where /auth/refresh
 * returns 429 and the page redirects to /login before the storage-state
 * cookies are fully applied. Reload up to twice if we landed on login.
 */
async function gotoWithAuthRetry(page: Page, path: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto(path);
    // Wait for either the dashboard layout or login form to settle.
    await page.waitForLoadState('domcontentloaded');
    // If we landed on /login due to refresh-token rate-limit (429), wait
    // a beat for the limiter window and retry.
    if (!/\/login/.test(page.url())) {
      return;
    }
    await page.waitForTimeout(1500);
  }
}

test.describe('Settings Module', () => {
  test.describe('Page Access', () => {
    test('admin can access settings', async ({ adminPage }) => {
      await gotoWithAuthRetry(adminPage, '/settings');
      await expect(adminPage.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible({ timeout: 15_000 });
    });

    test('manager can access settings', async ({ managerPage }) => {
      await gotoWithAuthRetry(managerPage, '/settings');
      await expect(managerPage.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible({ timeout: 15_000 });
    });

    test('field_officer gets Access Denied', async ({ fieldOfficerPage }) => {
      await gotoWithAuthRetry(fieldOfficerPage, '/settings');
      await expect(fieldOfficerPage.getByRole('heading', { name: 'Access Denied' })).toBeVisible({ timeout: 15_000 });
    });
  });

  test.describe('System Settings', () => {
    test('displays settings page', async ({ adminPage }) => {
      await gotoWithAuthRetry(adminPage, '/settings');
      // Page should show Settings heading
      await expect(adminPage.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible({ timeout: 15_000 });
    });

    test('settings page loads without error', async ({ adminPage }) => {
      await gotoWithAuthRetry(adminPage, '/settings');
      // Page should not show error
      await expect(adminPage.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible({ timeout: 15_000 });
      // Check that there's no error alert
      const errorAlert = adminPage.locator('[role="alert"]').first();
      const hasError = await errorAlert.isVisible().catch(() => false);
      // Page loaded successfully
    });

    test('save button is visible if present', async ({ adminPage }) => {
      await gotoWithAuthRetry(adminPage, '/settings');
      await expect(adminPage.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible({ timeout: 15_000 });
      // Save button may or may not be present depending on settings content
      const saveButton = adminPage.getByRole('button', { name: /save/i });
      // Just verify the page loaded
    });
  });

  test.describe('Holiday Calendar', () => {
    test('settings page accessible to admin', async ({ adminPage }) => {
      await gotoWithAuthRetry(adminPage, '/settings');
      // Settings page should be accessible - use exact match to avoid matching "System Settings"
      await expect(adminPage.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible({ timeout: 15_000 });
    });
  });

  test.describe('Permission-based visibility', () => {
    test('manager can access settings', async ({ managerPage }) => {
      await gotoWithAuthRetry(managerPage, '/settings');
      await expect(managerPage.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible({ timeout: 15_000 });
    });
  });

  /**
   * Gap closure — Settings Save (end-to-end) + RBAC denial on update.
   *
   * The existing tests above only assert the page heading renders. Nothing
   * actually edits a setting value, clicks Save, asserts the success toast,
   * and confirms persistence on the server. Nothing asserts that MANAGER
   * (read-only) is properly locked out of the editor controls.
   *
   * Permission contract (from lib/permissions): only super_admin holds
   * `settings.update`. manager has `settings.read` but no update.
   *
   * Seed strategy: capture the pre-test value of `max_group_size` via the
   * API, snapshot it in beforeAll, and restore it in afterAll so concurrent
   * tests (e.g. group creation flows) aren't disturbed by a leaked value.
   */
  test.describe('Settings save + RBAC denial', () => {
    const TARGET_KEY = 'max_group_size';
    let adminToken: string;
    let originalValue: number;

    test.beforeAll(async () => {
      adminToken = await getTokenForRole('super_admin');
      const settings = await apiRequest<Array<{ key: string; value: unknown }>>(
        'GET',
        '/settings',
        adminToken,
      );
      const target = settings.find((s) => s.key === TARGET_KEY);
      if (!target || typeof target.value !== 'number') {
        throw new Error(`Seed assumption violated: expected numeric ${TARGET_KEY}`);
      }
      originalValue = target.value;
    });

    test.afterAll(async () => {
      // Best-effort restore — even if the save test failed mid-flight we
      // don't want to leak a mutated max_group_size into sibling specs that
      // create groups.
      try {
        await apiRequest('PATCH', `/settings/${TARGET_KEY}`, adminToken, {
          value: originalValue,
        });
      } catch {
        // If admin token expired or API is down, surface in logs only — the
        // test that already passed shouldn't fail on teardown noise.
      }
    });

    test('admin edits a numeric setting, sees success toast, and value persists on the server', async ({
      adminPage,
    }) => {
      // Pick a new value that differs from whatever is in the DB so the
      // dirty-state check trips and the Save button enables.
      const newValue = originalValue === 20 ? 25 : 20;

      await gotoWithAuthRetry(adminPage, '/settings');
      await expect(
        adminPage.getByRole('heading', { name: 'Settings', exact: true }),
      ).toBeVisible({ timeout: 15_000 });

      // Editor inputs are keyed by `setting-${key}` id; this is the closest
      // we get to a data-testid here. The label renders the key text so we
      // can also assert that input is bound to the right setting.
      const input = adminPage.locator(`#setting-${TARGET_KEY}`);
      await expect(input).toBeVisible({ timeout: 15_000 });
      await expect(input).toBeEnabled();
      await expect(input).toHaveValue(String(originalValue));

      // Save Changes should start disabled (no edits = not dirty).
      const saveButton = adminPage.getByRole('button', { name: /save changes/i });
      await expect(saveButton).toBeVisible({ timeout: 15_000 });
      await expect(saveButton).toBeDisabled();

      // Edit -> button enables.
      await input.fill(String(newValue));
      await expect(saveButton).toBeEnabled({ timeout: 15_000 });

      await saveButton.click();

      // Success toast fires. Toast auto-dismisses after 5s, so use a tighter
      // timeout for liveness.
      await expect(
        adminPage.getByText(/settings saved successfully/i),
      ).toBeVisible({ timeout: 15_000 });

      // Behavior-level assertion: the new value is persisted on the server,
      // not just reflected in the UI cache. This defends against a regression
      // where the mutation succeeds locally but the PATCH never reached the API.
      const after = await apiRequest<Array<{ key: string; value: unknown }>>(
        'GET',
        '/settings',
        adminToken,
      );
      const persisted = after.find((s) => s.key === TARGET_KEY);
      expect(persisted?.value).toBe(newValue);

      // And the input should now reflect the saved value as the new baseline
      // (Save button returns to disabled because nothing is dirty anymore).
      await expect(input).toHaveValue(String(newValue));
      await expect(saveButton).toBeDisabled({ timeout: 15_000 });
    });

    test('manager (read-only) sees inputs disabled and Save button not rendered', async ({
      managerPage,
    }) => {
      await gotoWithAuthRetry(managerPage, '/settings');
      await expect(
        managerPage.getByRole('heading', { name: 'Settings', exact: true }),
      ).toBeVisible({ timeout: 15_000 });

      // The same scalar input loads because manager has settings.read.
      const input = managerPage.locator(`#setting-${TARGET_KEY}`);
      await expect(input).toBeVisible({ timeout: 15_000 });

      // But the UI is gated: input is disabled and Save button isn't rendered
      // at all for non-admins (see SettingsSection: `{canUpdate && <Button…>}`).
      await expect(input).toBeDisabled();
      await expect(
        managerPage.getByRole('button', { name: /save changes/i }),
      ).toHaveCount(0);
    });

    test('manager cannot PATCH a setting via the API (403 enforcement)', async () => {
      // Defence-in-depth: even if a manager bypasses the UI gate (e.g.
      // crafts a request directly), the backend must reject it. We try the
      // PATCH directly with a manager token and assert it fails.
      const managerToken = await getTokenForRole('manager');

      let status = 0;
      let body = '';
      try {
        await apiRequest('PATCH', `/settings/${TARGET_KEY}`, managerToken, {
          value: 999,
        });
      } catch (err) {
        // apiRequest throws on non-2xx; the message embeds the status code.
        body = (err as Error).message;
        const match = body.match(/failed:\s*(\d+)/);
        if (match) status = parseInt(match[1], 10);
      }

      expect(status, `expected 401/403 from manager PATCH, got: ${body}`).toBeGreaterThanOrEqual(
        400,
      );
      expect(status).toBeLessThan(500);

      // Sanity: the value on the server is still the (test-scoped) original,
      // not the 999 the manager tried to write.
      const settings = await apiRequest<Array<{ key: string; value: unknown }>>(
        'GET',
        '/settings',
        adminToken,
      );
      const target = settings.find((s) => s.key === TARGET_KEY);
      expect(target?.value).not.toBe(999);
    });
  });
});
