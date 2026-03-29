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

// Seed credentials (from prisma/seed.ts)
const VALID_USERNAME = 'super_admin';
const VALID_PASSWORD = 'TestPass123!';
const INVALID_PASSWORD = 'wrong_password';

test.describe('Login Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('successful login redirects to dashboard', async ({ page }) => {
    await page.getByLabel('Username').fill(VALID_USERNAME);
    await page.getByLabel('Password').fill(VALID_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    // After successful login the app redirects to "/"
    await page.waitForURL('/', { timeout: 15_000 });
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('invalid credentials shows error message', async ({ page }) => {
    await page.getByLabel('Username').fill(VALID_USERNAME);
    await page.getByLabel('Password').fill(INVALID_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Server error is displayed in a div with role="alert"
    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible({ timeout: 10_000 });
    // The error message should indicate invalid credentials
    await expect(alert).toHaveText(/invalid|credentials|password/i);
  });

  test('account lockout shows lockout message after 5 failed attempts', async ({ page }) => {
    // Use a unique-ish approach: attempt login 5 times with wrong password
    // The backend locks the account after 5 consecutive failed attempts
    for (let i = 0; i < 5; i++) {
      await page.getByLabel('Username').fill(VALID_USERNAME);
      await page.getByLabel('Password').fill(INVALID_PASSWORD);
      await page.getByRole('button', { name: 'Sign in' }).click();

      // Wait for the error alert to appear before the next attempt
      const alert = page.getByRole('alert');
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
    await page.getByLabel('Username').fill(VALID_USERNAME);
    await page.getByLabel('Password').fill(INVALID_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    const alert = page.getByRole('alert');
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

    // Should NOT have made a server request — no alert should be visible
    await expect(page.getByRole('alert')).not.toBeVisible();
  });
});
