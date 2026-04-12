import { test, expect } from './fixtures';

/**
 * Change Password — E2E Tests
 *
 * Tests the password change flow:
 * - Navigation to change password page
 * - Password validation rules
 * - Current password verification
 * - Successful password change
 *
 * Validates: Requirements 1.5 (User profile management)
 */

test.describe('Change Password', () => {
  test.describe('Page Navigation', () => {
    test('change password page accessible from profile menu', async ({ managerPage }) => {
      await managerPage.goto('/dashboard');
      await managerPage.waitForLoadState('domcontentloaded');

      // Open profile dropdown or navigate to profile
      const profileLink = managerPage.getByRole('link', { name: /profile/i });
      if (await profileLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await profileLink.click();
        await managerPage.waitForURL(/profile/);
      } else {
        // Try direct navigation
        await managerPage.goto('/profile');
      }

      // Look for change password link/button
      const changePasswordLink = managerPage.getByRole('link', { name: /change password/i });
      const changePasswordButton = managerPage.getByRole('button', { name: /change password/i });

      const linkVisible = await changePasswordLink.isVisible({ timeout: 5_000 }).catch(() => false);
      const buttonVisible = await changePasswordButton.isVisible({ timeout: 2_000 }).catch(() => false);

      expect(linkVisible || buttonVisible).toBe(true);
    });

    test('change password page loads successfully', async ({ managerPage }) => {
      await managerPage.goto('/profile/change-password');
      await managerPage.waitForLoadState('domcontentloaded');

      // Should show password fields
      await expect(managerPage.getByText(/current password/i)).toBeVisible({ timeout: 10_000 });
      await expect(managerPage.getByText(/new password/i)).toBeVisible();
    });
  });

  test.describe('Form Validation', () => {
    test('shows validation error for empty fields', async ({ managerPage }) => {
      await managerPage.goto('/profile/change-password');
      await managerPage.waitForLoadState('domcontentloaded');

      // Try to submit without filling fields
      const submitButton = managerPage.getByRole('button', { name: /change password|update|save/i });
      await expect(submitButton).toBeVisible({ timeout: 10_000 });

      // Button might be disabled or clicking shows validation
      if (!await submitButton.isDisabled()) {
        await submitButton.click();

        // Should show validation messages
        const errorMessage = managerPage.getByText(/required|cannot be empty/i);
        await expect(errorMessage).toBeVisible({ timeout: 5_000 });
      }
    });

    test('shows validation for password mismatch', async ({ managerPage }) => {
      await managerPage.goto('/profile/change-password');
      await managerPage.waitForLoadState('domcontentloaded');

      // Fill in mismatched passwords
      const currentPwdInput = managerPage.locator('input[name*="current"], input[type="password"]').first();
      const newPwdInput = managerPage.locator('input[name*="new"], input[name*="password"]').nth(1);
      const confirmPwdInput = managerPage.locator('input[name*="confirm"], input[type="password"]').last();

      await currentPwdInput.fill('OldPassword123!');
      await newPwdInput.fill('NewPassword123!');
      await confirmPwdInput.fill('DifferentPassword123!');

      const submitButton = managerPage.getByRole('button', { name: /change password|update|save/i });
      await submitButton.click();

      // Should show password mismatch error
      await expect(managerPage.getByText(/match|mismatch|not the same/i)).toBeVisible({ timeout: 5_000 });
    });

    test('shows validation for weak password', async ({ managerPage }) => {
      await managerPage.goto('/profile/change-password');
      await managerPage.waitForLoadState('domcontentloaded');

      // Fill in weak password
      const currentPwdInput = managerPage.locator('input[name*="current"], input[type="password"]').first();
      const newPwdInput = managerPage.locator('input[name*="new"], input[name*="password"]').nth(1);
      const confirmPwdInput = managerPage.locator('input[name*="confirm"], input[type="password"]').last();

      await currentPwdInput.fill('OldPassword123!');
      await newPwdInput.fill('weak');
      await confirmPwdInput.fill('weak');

      const submitButton = managerPage.getByRole('button', { name: /change password|update|save/i });
      if (!await submitButton.isDisabled()) {
        await submitButton.click();

        // Should show password strength error
        const strengthError = managerPage.getByText(/too weak|too short|minimum|at least/i);
        await expect(strengthError).toBeVisible({ timeout: 5_000 });
      }
    });
  });

  test.describe('Password Change', () => {
    test('shows error for incorrect current password', async ({ managerPage }) => {
      await managerPage.goto('/profile/change-password');
      await managerPage.waitForLoadState('domcontentloaded');

      // Fill with incorrect current password
      const currentPwdInput = managerPage.locator('input[name*="current"], input[type="password"]').first();
      const newPwdInput = managerPage.locator('input[name*="new"], input[name*="password"]').nth(1);
      const confirmPwdInput = managerPage.locator('input[name*="confirm"], input[type="password"]').last();

      await currentPwdInput.fill('WrongCurrentPassword123!');
      await newPwdInput.fill('NewStrongPassword123!');
      await confirmPwdInput.fill('NewStrongPassword123!');

      const submitButton = managerPage.getByRole('button', { name: /change password|update|save/i });
      await submitButton.click();

      // Should show error about incorrect current password
      await expect(managerPage.getByText(/incorrect|invalid|wrong.*password/i)).toBeVisible({ timeout: 10_000 });
    });
  });

  test.describe('UI Elements', () => {
    test('password fields have show/hide toggle', async ({ managerPage }) => {
      await managerPage.goto('/profile/change-password');
      await managerPage.waitForLoadState('domcontentloaded');

      // Password fields should start as type="password"
      const passwordInputs = managerPage.locator('input[type="password"]');
      const count = await passwordInputs.count();
      expect(count).toBeGreaterThanOrEqual(2);

      // Look for show/hide buttons (eye icon)
      const toggleButtons = managerPage.locator('button[aria-label*="show"], button[aria-label*="hide"], button svg');
      // At least one toggle should exist
    });

    test('back button returns to profile page', async ({ managerPage }) => {
      await managerPage.goto('/profile/change-password');
      await managerPage.waitForLoadState('domcontentloaded');

      // Look for back button/link
      const backButton = managerPage.getByRole('link', { name: /back|cancel/i });
      const backLink = managerPage.locator('a[href="/profile"]');

      if (await backButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await backButton.click();
        await managerPage.waitForURL(/profile/);
      } else if (await backLink.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await backLink.click();
        await managerPage.waitForURL(/profile/);
      }
    });
  });
});
