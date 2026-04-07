import { test, expect } from '@playwright/test';

/**
 * Login Flow — Playwright E2E Tests
 *
 * Validates: Design GAP 8 (Login Flow)
 *
 * Tests cover:
 * 1. Successful login redirects to dashboard
 * 2. Invalid credentials shows error message
 * 3. Account lockout shows lockout message after 5 failed attempts
 * 4. Login form validates required fields before submission
 */

// Use different users to avoid lockout interference between tests
// manager1 for login tests, admin for lockout test
const LOGIN_USER = 'manager1';
const LOCKOUT_USER = 'staff1'; // Use staff1 for lockout test to not affect other tests
const VALID_PASSWORD = 'Admin@123';
const INVALID_PASSWORD = 'wrong_password';

test.describe('Login Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('successful login redirects to dashboard', async ({ page }) => {
    await page.getByLabel('Username').fill(LOGIN_USER);
    await page.getByLabel('Password').fill(VALID_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    // After successful login the app redirects to "/" - allow more time for mobile
    await page.waitForURL('/', { timeout: 30_000 });
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('invalid credentials shows error message', async ({ page }) => {
    // Use a non-existent user to always get "invalid credentials" (not locked)
    await page.getByLabel('Username').fill('nonexistent_user_xyz');
    await page.getByLabel('Password').fill(INVALID_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Server error is displayed in a div with role="alert" (exclude Next.js route announcer)
    const alert = page.locator('[role="alert"]:not(#__next-route-announcer__)');
    await expect(alert).toBeVisible({ timeout: 10_000 });
    // The error message should indicate invalid credentials (or user not found)
    await expect(alert).toHaveText(/invalid|credentials|password|not found|unauthorized/i);
  });

  test('account lockout shows lockout message after 5 failed attempts', async ({ page }) => {
    // Use LOCKOUT_USER (staff1) to avoid affecting other tests that use manager1/admin
    // The backend locks the account after 5 consecutive failed attempts
    for (let i = 0; i < 5; i++) {
      await page.getByLabel('Username').fill(LOCKOUT_USER);
      await page.getByLabel('Password').fill(INVALID_PASSWORD);
      await page.getByRole('button', { name: 'Sign in' }).click();

      // Wait for the error alert to appear before the next attempt
      const alert = page.locator('[role="alert"]:not(#__next-route-announcer__)');
      await expect(alert).toBeVisible({ timeout: 10_000 });

      // Clear the form for the next attempt (if not the last)
      if (i < 4) {
        await page.getByLabel('Username').clear();
        await page.getByLabel('Password').clear();
      }
    }

    // After 5 failed attempts, the 6th attempt should show a lockout message
    await page.getByLabel('Username').clear();
    await page.getByLabel('Password').clear();
    await page.getByLabel('Username').fill(LOCKOUT_USER);
    await page.getByLabel('Password').fill(INVALID_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    const alert = page.locator('[role="alert"]:not(#__next-route-announcer__)');
    await expect(alert).toBeVisible({ timeout: 10_000 });
    await expect(alert).toHaveText(/locked|try again later/i);
  });

  test('login form validates required fields before submission', async ({ page }) => {
    // Click submit without filling any fields
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Client-side validation errors appear as <p> elements with class text-destructive
    const validationErrors = page.locator('p.text-destructive');
    await expect(validationErrors.first()).toBeVisible({ timeout: 5_000 });

    // Should show "Username is required" and "Password is required"
    await expect(page.getByText('Username is required')).toBeVisible();
    await expect(page.getByText('Password is required')).toBeVisible();

    // Should NOT have made a server request — no error alert should be visible (exclude Next.js route announcer)
    await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).not.toBeVisible();
  });
});
