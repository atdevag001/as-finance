import { test, expect } from './fixtures';

/**
 * Profile Module — Playwright E2E Tests
 *
 * Tests cover:
 * 1. Change Password - form validation, password rules
 * 2. Eye toggle for password visibility
 * 3. Password match validation
 * 4. Success/error handling
 *
 * Uses pre-authenticated fieldOfficerPage fixture to avoid rate limiting.
 */

test.describe('Profile Module', () => {
  test.describe('Change Password Page', () => {
    // The auth provider calls /auth/refresh on every page mount to hydrate
    // the user. Running 13 tests back-to-back exhausts the per-IP rate-limit
    // on /auth/refresh, causing late tests to be redirected to /login. Pace
    // tests so the burst window stays under the rate-limit.
    test.beforeEach(async () => {
      await new Promise((resolve) => setTimeout(resolve, 8_000));
    });
    test('navigates to change password page', async ({ fieldOfficerPage }) => {
      await fieldOfficerPage.goto('/profile/change-password');
      await expect(fieldOfficerPage.getByRole('heading', { name: /change password/i })).toBeVisible({ timeout: 15_000 });
    });

    test('form has all required fields', async ({ fieldOfficerPage }) => {
      await fieldOfficerPage.goto('/profile/change-password');
      await fieldOfficerPage.waitForLoadState('domcontentloaded');

      // Wait for the form to be visible first
      await expect(fieldOfficerPage.locator('#currentPassword')).toBeVisible({ timeout: 15_000 });
      await expect(fieldOfficerPage.locator('#newPassword')).toBeVisible({ timeout: 10_000 });
      await expect(fieldOfficerPage.locator('#confirmPassword')).toBeVisible({ timeout: 10_000 });
    });

    test('has password visibility toggle buttons', async ({ fieldOfficerPage }) => {
      await fieldOfficerPage.goto('/profile/change-password');
      await fieldOfficerPage.waitForLoadState('domcontentloaded');

      // Wait for form to load first
      await expect(fieldOfficerPage.locator('#currentPassword')).toBeVisible({ timeout: 15_000 });

      // Should have eye toggle buttons (3 password fields)
      const toggleButtons = fieldOfficerPage.locator('button').filter({ has: fieldOfficerPage.locator('svg') });
      expect(await toggleButtons.count()).toBeGreaterThanOrEqual(3);
    });

    test('eye toggle shows/hides password', async ({ fieldOfficerPage }) => {
      await fieldOfficerPage.goto('/profile/change-password');
      await fieldOfficerPage.waitForLoadState('domcontentloaded');

      const currentPasswordInput = fieldOfficerPage.locator('#currentPassword');
      await expect(currentPasswordInput).toBeVisible({ timeout: 15_000 });
      await currentPasswordInput.fill('TestPassword');

      // Initially type is password
      await expect(currentPasswordInput).toHaveAttribute('type', 'password');

      // Click toggle button (the one inside the currentPassword field's parent div)
      const toggleButton = fieldOfficerPage.locator('#currentPassword').locator('..').locator('button');
      await toggleButton.click();

      // Now type should be text
      await expect(currentPasswordInput).toHaveAttribute('type', 'text');

      // Click again to hide
      await toggleButton.click();
      await expect(currentPasswordInput).toHaveAttribute('type', 'password');
    });

    test('validates current password is required', async ({ fieldOfficerPage }) => {
      await fieldOfficerPage.goto('/profile/change-password');
      await fieldOfficerPage.waitForLoadState('domcontentloaded');

      // Wait for form to load
      await expect(fieldOfficerPage.locator('#currentPassword')).toBeVisible({ timeout: 15_000 });

      // Fill new password but not current
      await fieldOfficerPage.locator('#newPassword').fill('NewPass123');
      await fieldOfficerPage.locator('#confirmPassword').fill('NewPass123');

      await fieldOfficerPage.getByRole('button', { name: /change password/i }).click();

      // Error should appear - look for the specific error message text
      await expect(
        fieldOfficerPage.getByText('Current password is required'),
      ).toBeVisible({ timeout: 10_000 });
    });

    test('validates new password minimum length', async ({ fieldOfficerPage }) => {
      await fieldOfficerPage.goto('/profile/change-password');
      await fieldOfficerPage.waitForLoadState('domcontentloaded');

      // Wait for form to load
      await expect(fieldOfficerPage.locator('#currentPassword')).toBeVisible({ timeout: 15_000 });

      await fieldOfficerPage.locator('#currentPassword').fill('Admin@123');
      await fieldOfficerPage.locator('#newPassword').fill('Short1'); // Too short
      await fieldOfficerPage.locator('#confirmPassword').fill('Short1');

      await fieldOfficerPage.getByRole('button', { name: /change password/i }).click();

      // Error list should appear
      await expect(
        fieldOfficerPage.locator('li').filter({ hasText: /at least 8 characters/i }),
      ).toBeVisible({ timeout: 10_000 });
    });

    test('validates new password requires uppercase', async ({ fieldOfficerPage }) => {
      await fieldOfficerPage.goto('/profile/change-password');
      await fieldOfficerPage.waitForLoadState('domcontentloaded');

      // Wait for form to load
      await expect(fieldOfficerPage.locator('#currentPassword')).toBeVisible({ timeout: 15_000 });

      await fieldOfficerPage.locator('#currentPassword').fill('Admin@123');
      await fieldOfficerPage.locator('#newPassword').fill('lowercase1'); // No uppercase
      await fieldOfficerPage.locator('#confirmPassword').fill('lowercase1');

      await fieldOfficerPage.getByRole('button', { name: /change password/i }).click();

      // Error list should appear - look for the specific list item
      await expect(
        fieldOfficerPage.locator('li').filter({ hasText: /uppercase letter/i }),
      ).toBeVisible({ timeout: 10_000 });
    });

    test('validates new password requires lowercase', async ({ fieldOfficerPage }) => {
      await fieldOfficerPage.goto('/profile/change-password');
      await fieldOfficerPage.waitForLoadState('domcontentloaded');

      // Wait for form to load
      await expect(fieldOfficerPage.locator('#currentPassword')).toBeVisible({ timeout: 15_000 });

      await fieldOfficerPage.locator('#currentPassword').fill('Admin@123');
      await fieldOfficerPage.locator('#newPassword').fill('UPPERCASE1'); // No lowercase
      await fieldOfficerPage.locator('#confirmPassword').fill('UPPERCASE1');

      await fieldOfficerPage.getByRole('button', { name: /change password/i }).click();

      // Error list should appear - look for the specific list item
      await expect(
        fieldOfficerPage.locator('li').filter({ hasText: /lowercase letter/i }),
      ).toBeVisible({ timeout: 10_000 });
    });

    test('validates new password requires digit', async ({ fieldOfficerPage }) => {
      await fieldOfficerPage.goto('/profile/change-password');
      await fieldOfficerPage.waitForLoadState('domcontentloaded');

      // Wait for form to load
      await expect(fieldOfficerPage.locator('#currentPassword')).toBeVisible({ timeout: 15_000 });

      await fieldOfficerPage.locator('#currentPassword').fill('Admin@123');
      await fieldOfficerPage.locator('#newPassword').fill('NoDigitsHere'); // No digit
      await fieldOfficerPage.locator('#confirmPassword').fill('NoDigitsHere');

      await fieldOfficerPage.getByRole('button', { name: /change password/i }).click();

      // Error list should appear - look for the specific list item
      await expect(
        fieldOfficerPage.locator('li').filter({ hasText: /at least one digit/i }),
      ).toBeVisible({ timeout: 10_000 });
    });

    test('validates passwords must match', async ({ fieldOfficerPage }) => {
      await fieldOfficerPage.goto('/profile/change-password');
      await fieldOfficerPage.waitForLoadState('domcontentloaded');

      // Wait for form to load
      await expect(fieldOfficerPage.locator('#currentPassword')).toBeVisible({ timeout: 15_000 });

      await fieldOfficerPage.locator('#currentPassword').fill('Admin@123');
      await fieldOfficerPage.locator('#newPassword').fill('NewPass123');
      await fieldOfficerPage.locator('#confirmPassword').fill('DifferentPass123'); // Mismatch

      await fieldOfficerPage.getByRole('button', { name: /change password/i }).click();

      await expect(
        fieldOfficerPage.getByText(/passwords do not match|passwords must match/i),
      ).toBeVisible({ timeout: 10_000 });
    });

    test('validates new password must be different from current', async ({ fieldOfficerPage }) => {
      await fieldOfficerPage.goto('/profile/change-password');
      await fieldOfficerPage.waitForLoadState('domcontentloaded');

      // Wait for form to load
      await expect(fieldOfficerPage.locator('#currentPassword')).toBeVisible({ timeout: 15_000 });

      await fieldOfficerPage.locator('#currentPassword').fill('Admin@123');
      await fieldOfficerPage.locator('#newPassword').fill('Admin@123'); // Same as current
      await fieldOfficerPage.locator('#confirmPassword').fill('Admin@123');

      await fieldOfficerPage.getByRole('button', { name: /change password/i }).click();

      await expect(
        fieldOfficerPage.getByText(/must be different/i).or(fieldOfficerPage.getByText(/same.*current/i)),
      ).toBeVisible({ timeout: 10_000 });
    });

    test('shows error for incorrect current password', async ({ fieldOfficerPage }) => {
      await fieldOfficerPage.goto('/profile/change-password');
      await fieldOfficerPage.waitForLoadState('domcontentloaded');

      // Wait for form to load
      await expect(fieldOfficerPage.locator('#currentPassword')).toBeVisible({ timeout: 15_000 });

      await fieldOfficerPage.locator('#currentPassword').fill('WrongPassword1');
      await fieldOfficerPage.locator('#newPassword').fill('NewValidPass1');
      await fieldOfficerPage.locator('#confirmPassword').fill('NewValidPass1');

      await fieldOfficerPage.getByRole('button', { name: /change password/i }).click();

      // Should show error about incorrect password
      await expect(
        fieldOfficerPage.getByText(/incorrect|invalid|wrong/i),
      ).toBeVisible({ timeout: 15_000 });
    });

    test('back button returns to dashboard', async ({ fieldOfficerPage }) => {
      await fieldOfficerPage.goto('/profile/change-password');
      await fieldOfficerPage.waitForLoadState('domcontentloaded');

      // Wait for page to load
      await expect(fieldOfficerPage.getByRole('heading', { name: /change password/i })).toBeVisible({ timeout: 15_000 });

      const backButton = fieldOfficerPage.getByRole('link').filter({ has: fieldOfficerPage.locator('svg') }).first();
      if (await backButton.isVisible()) {
        await backButton.click();
        // The back button links to "/" which redirects to dashboard
        await fieldOfficerPage.waitForURL(/\/($|customers|loans|dashboard)/, { timeout: 15_000 });
      }
    });
  });
});
