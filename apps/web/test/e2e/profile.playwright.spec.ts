import { test, expect } from './fixtures';
import { loginAsFieldOfficer, loginAsManager, login } from './fixtures';

/**
 * Profile Module — Playwright E2E Tests
 *
 * Tests cover:
 * 1. Change Password - form validation, password rules
 * 2. Eye toggle for password visibility
 * 3. Password match validation
 * 4. Success/error handling
 */

test.describe('Profile Module', () => {
  test.describe('Change Password Page', () => {
    test('navigates to change password page', async ({ page }) => {
      await loginAsFieldOfficer(page);
      await page.goto('/profile/change-password');

      await expect(page.getByRole('heading', { name: /change password/i })).toBeVisible({ timeout: 10_000 });
    });

    test('form has all required fields', async ({ page }) => {
      await loginAsFieldOfficer(page);
      await page.goto('/profile/change-password');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel('Current Password')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByLabel('New Password')).toBeVisible();
      await expect(page.getByLabel('Confirm New Password')).toBeVisible();
    });

    test('has password visibility toggle buttons', async ({ page }) => {
      await loginAsFieldOfficer(page);
      await page.goto('/profile/change-password');
      await page.waitForLoadState('networkidle');

      // Should have eye toggle buttons (3 password fields)
      const toggleButtons = page.locator('button').filter({ has: page.locator('svg') });
      expect(await toggleButtons.count()).toBeGreaterThanOrEqual(3);
    });

    test('eye toggle shows/hides password', async ({ page }) => {
      await loginAsFieldOfficer(page);
      await page.goto('/profile/change-password');
      await page.waitForLoadState('networkidle');

      const currentPasswordInput = page.getByLabel('Current Password');
      await currentPasswordInput.fill('TestPassword');

      // Initially type is password
      await expect(currentPasswordInput).toHaveAttribute('type', 'password');

      // Click toggle button (first one after the input)
      const toggleButton = page.locator('button').filter({ has: page.locator('svg') }).first();
      await toggleButton.click();

      // Now type should be text
      await expect(currentPasswordInput).toHaveAttribute('type', 'text');

      // Click again to hide
      await toggleButton.click();
      await expect(currentPasswordInput).toHaveAttribute('type', 'password');
    });

    test('validates current password is required', async ({ page }) => {
      await loginAsFieldOfficer(page);
      await page.goto('/profile/change-password');
      await page.waitForLoadState('networkidle');

      // Fill new password but not current
      await page.getByLabel('New Password').fill('NewPass123');
      await page.getByLabel('Confirm New Password').fill('NewPass123');

      await page.getByRole('button', { name: /change password/i }).click();

      await expect(
        page.getByText(/current password.*required/i).or(page.locator('[role="alert"]')),
      ).toBeVisible({ timeout: 5_000 });
    });

    test('validates new password minimum length', async ({ page }) => {
      await loginAsFieldOfficer(page);
      await page.goto('/profile/change-password');
      await page.waitForLoadState('networkidle');

      await page.getByLabel('Current Password').fill('Admin@123');
      await page.getByLabel('New Password').fill('Short1'); // Too short
      await page.getByLabel('Confirm New Password').fill('Short1');

      await page.getByRole('button', { name: /change password/i }).click();

      await expect(
        page.getByText(/at least 8 characters/i),
      ).toBeVisible({ timeout: 5_000 });
    });

    test('validates new password requires uppercase', async ({ page }) => {
      await loginAsFieldOfficer(page);
      await page.goto('/profile/change-password');
      await page.waitForLoadState('networkidle');

      await page.getByLabel('Current Password').fill('Admin@123');
      await page.getByLabel('New Password').fill('lowercase1'); // No uppercase
      await page.getByLabel('Confirm New Password').fill('lowercase1');

      await page.getByRole('button', { name: /change password/i }).click();

      await expect(
        page.getByText(/uppercase/i),
      ).toBeVisible({ timeout: 5_000 });
    });

    test('validates new password requires lowercase', async ({ page }) => {
      await loginAsFieldOfficer(page);
      await page.goto('/profile/change-password');
      await page.waitForLoadState('networkidle');

      await page.getByLabel('Current Password').fill('Admin@123');
      await page.getByLabel('New Password').fill('UPPERCASE1'); // No lowercase
      await page.getByLabel('Confirm New Password').fill('UPPERCASE1');

      await page.getByRole('button', { name: /change password/i }).click();

      await expect(
        page.getByText(/lowercase/i),
      ).toBeVisible({ timeout: 5_000 });
    });

    test('validates new password requires digit', async ({ page }) => {
      await loginAsFieldOfficer(page);
      await page.goto('/profile/change-password');
      await page.waitForLoadState('networkidle');

      await page.getByLabel('Current Password').fill('Admin@123');
      await page.getByLabel('New Password').fill('NoDigitsHere'); // No digit
      await page.getByLabel('Confirm New Password').fill('NoDigitsHere');

      await page.getByRole('button', { name: /change password/i }).click();

      await expect(
        page.getByText(/digit/i),
      ).toBeVisible({ timeout: 5_000 });
    });

    test('validates passwords must match', async ({ page }) => {
      await loginAsFieldOfficer(page);
      await page.goto('/profile/change-password');
      await page.waitForLoadState('networkidle');

      await page.getByLabel('Current Password').fill('Admin@123');
      await page.getByLabel('New Password').fill('NewPass123');
      await page.getByLabel('Confirm New Password').fill('DifferentPass123'); // Mismatch

      await page.getByRole('button', { name: /change password/i }).click();

      await expect(
        page.getByText(/passwords do not match|passwords must match/i),
      ).toBeVisible({ timeout: 5_000 });
    });

    test('validates new password must be different from current', async ({ page }) => {
      await loginAsFieldOfficer(page);
      await page.goto('/profile/change-password');
      await page.waitForLoadState('networkidle');

      await page.getByLabel('Current Password').fill('Admin@123');
      await page.getByLabel('New Password').fill('Admin@123'); // Same as current
      await page.getByLabel('Confirm New Password').fill('Admin@123');

      await page.getByRole('button', { name: /change password/i }).click();

      await expect(
        page.getByText(/must be different/i).or(page.getByText(/same.*current/i)),
      ).toBeVisible({ timeout: 5_000 });
    });

    test('shows error for incorrect current password', async ({ page }) => {
      await loginAsFieldOfficer(page);
      await page.goto('/profile/change-password');
      await page.waitForLoadState('networkidle');

      await page.getByLabel('Current Password').fill('WrongPassword1');
      await page.getByLabel('New Password').fill('NewValidPass1');
      await page.getByLabel('Confirm New Password').fill('NewValidPass1');

      await page.getByRole('button', { name: /change password/i }).click();

      // Should show error about incorrect password
      await expect(
        page.getByText(/incorrect|invalid|wrong/i),
      ).toBeVisible({ timeout: 10_000 });
    });

    test('back button returns to home', async ({ page }) => {
      await loginAsFieldOfficer(page);
      await page.goto('/profile/change-password');
      await page.waitForLoadState('networkidle');

      const backButton = page.getByRole('link').filter({ has: page.locator('svg') }).first();
      if (await backButton.isVisible()) {
        await backButton.click();
        await page.waitForURL(/\/$/, { timeout: 10_000 });
      }
    });
  });
});
