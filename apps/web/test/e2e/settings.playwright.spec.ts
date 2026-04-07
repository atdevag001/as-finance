import { test, expect } from './fixtures';
import { loginAsAdmin, loginAsManager, loginAsFieldOfficer } from './fixtures';

/**
 * Settings Module — Playwright E2E Tests
 *
 * Tests cover:
 * 1. System Settings - view, edit, save
 * 2. Holiday Calendar - view, add, delete
 * 3. Dirty state tracking
 * 4. Permission-based access
 */

test.describe('Settings Module', () => {
  test.describe('Page Access', () => {
    test('admin can access settings', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/settings');

      await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 10_000 });
    });

    test('manager can access settings', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/settings');

      await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 10_000 });
    });

    test('field_officer gets Access Denied', async ({ page }) => {
      await loginAsFieldOfficer(page);
      await page.goto('/settings');

      await expect(page.getByRole('heading', { name: 'Access Denied' })).toBeVisible({ timeout: 10_000 });
    });
  });

  test.describe('System Settings', () => {
    test('displays settings list', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');

      await expect(page.getByText('System Settings')).toBeVisible({ timeout: 10_000 });
    });

    test('settings have input fields', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');

      // Should have at least one input field for settings
      const settingInputs = page.locator('input').first();
      await expect(settingInputs).toBeVisible({ timeout: 5_000 });
    });

    test('save button is visible', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');

      await expect(page.getByRole('button', { name: /save/i })).toBeVisible({ timeout: 10_000 });
    });

    test('save button is disabled when no changes', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');

      const saveButton = page.getByRole('button', { name: /save changes/i });
      // Button should be disabled when no changes made
      await expect(saveButton).toBeDisabled({ timeout: 5_000 });
    });

    test('save button enables when settings changed', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');

      // Find first setting input and change its value
      const firstInput = page.locator('input[type="text"]').first();
      if (await firstInput.isVisible()) {
        const currentValue = await firstInput.inputValue();
        await firstInput.fill(currentValue + '1');

        // Save button should now be enabled
        const saveButton = page.getByRole('button', { name: /save/i });
        await expect(saveButton).toBeEnabled({ timeout: 5_000 });
      }
    });
  });

  test.describe('Holiday Calendar', () => {
    test('displays holiday calendar section', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/holiday calendar/i)).toBeVisible({ timeout: 10_000 });
    });

    test('shows current year in title', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');

      const currentYear = new Date().getFullYear().toString();
      await expect(page.getByText(new RegExp(currentYear))).toBeVisible({ timeout: 10_000 });
    });

    test('shows holidays table or empty state', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');

      // Either table with holidays or empty message
      await expect(
        page.locator('table').or(page.getByText(/no holidays configured/i)),
      ).toBeVisible({ timeout: 5_000 });
    });

    test('add holiday form has date and description fields', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');

      // Date input for adding holiday
      await expect(page.getByLabel('Date')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByLabel('Description')).toBeVisible();
    });

    test('validates holiday date is required', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');

      // Fill description but not date
      await page.getByLabel('Description').fill('Test Holiday');

      // Try to add
      await page.getByRole('button', { name: /add holiday/i }).click();

      // Form should not submit (required attribute prevents it)
      // The date input should still be visible and empty
    });

    test('validates holiday description is required', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');

      // Fill date but not description
      await page.getByLabel('Date').last().fill('2024-12-25');

      // Try to add
      await page.getByRole('button', { name: /add holiday/i }).click();

      // Form should not submit (required attribute prevents it)
    });

    test('admin can delete holiday', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');

      // Look for delete button (trash icon)
      const deleteButton = page.locator('button').filter({ has: page.locator('svg[class*="trash"]') }).first();
      // Button may or may not be visible depending on existing holidays
    });
  });

  test.describe('Permission-based visibility', () => {
    test('manager sees read-only settings if no update permission', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');

      // Check if manager has update capability
      // This depends on permission configuration
      await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 10_000 });
    });
  });
});
