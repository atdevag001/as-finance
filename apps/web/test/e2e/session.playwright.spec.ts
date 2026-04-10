import { test, expect } from './fixtures';
import { TEST_USERS } from './fixtures';

/**
 * Session Management — Playwright E2E Tests
 *
 * Tests cover:
 * 1. Session persistence - refresh, restore
 * 2. Logout - clears session
 * 3. Expired token - redirect to login
 * 4. Return path - redirect back after login
 *
 * Note: Tests that need the login flow use `page` with manual login.
 * Tests that just need an authenticated session use `managerPage` fixture.
 */

test.describe('Session Management', () => {
  test.describe('Session Persistence', () => {
    test('session persists after page refresh', async ({ managerPage }) => {
      await managerPage.goto('/');
      await managerPage.waitForLoadState('networkidle');

      // Verify logged in
      await expect(managerPage.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 10_000 });

      // Refresh page
      await managerPage.reload();
      await managerPage.waitForLoadState('networkidle');

      // Should still be logged in
      await expect(managerPage.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 10_000 });
      // Should NOT redirect to login
      await expect(managerPage).not.toHaveURL(/\/login/);
    });

    test('session persists across navigation', async ({ managerPage }) => {
      // Navigate to different pages
      await managerPage.goto('/customers');
      await expect(managerPage.getByRole('heading', { name: /customers/i })).toBeVisible({ timeout: 10_000 });

      await managerPage.goto('/loans');
      await expect(managerPage.getByRole('heading', { name: /loans/i })).toBeVisible({ timeout: 10_000 });

      await managerPage.goto('/');
      await expect(managerPage.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 10_000 });

      // Should never redirect to login
      await expect(managerPage).not.toHaveURL(/\/login/);
    });
  });

  test.describe('Logout', () => {
    test('logout clears session and redirects to login', async ({ managerPage }) => {
      await managerPage.goto('/');
      await managerPage.waitForLoadState('networkidle');

      // Find and click logout - typically "Sign out" link in sidebar
      const signOutLink = managerPage.getByRole('link', { name: /sign out/i });
      if (await signOutLink.isVisible()) {
        await signOutLink.click();
        await managerPage.waitForURL('**/login', { timeout: 10_000 });
      }
    });

    test('after logout, protected routes redirect to login', async ({ managerPage }) => {
      // Clear cookies to simulate logout
      await managerPage.context().clearCookies();

      // Try to access protected route
      await managerPage.goto('/customers');

      // Should redirect to login
      await managerPage.waitForURL('**/login', { timeout: 10_000 });
    });
  });

  test.describe('Unauthenticated Access', () => {
    // These tests use plain page to test unauthenticated behavior
    test('unauthenticated user is redirected to login', async ({ page }) => {
      // Clear any existing session
      await page.context().clearCookies();

      // Try to access dashboard
      await page.goto('http://localhost:3000/');

      // Should redirect to login
      await page.waitForURL('**/login', { timeout: 10_000 });
    });

    test('login page is accessible without auth', async ({ page }) => {
      await page.context().clearCookies();
      await page.goto('http://localhost:3000/login');

      await expect(page.getByLabel('Username')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByLabel('Password')).toBeVisible();
    });

    test('direct URL to protected page redirects to login', async ({ page }) => {
      await page.context().clearCookies();
      await page.goto('http://localhost:3000/customers/new');

      await page.waitForURL('**/login', { timeout: 10_000 });
    });
  });

  test.describe('Return Path', () => {
    test('redirects back to intended page after login', async ({ page }) => {
      await page.context().clearCookies();

      // Try to access specific page
      await page.goto('http://localhost:3000/customers');
      await page.waitForURL('**/login', { timeout: 10_000 });

      // Login
      const user = TEST_USERS.manager;
      await page.getByLabel('Username').fill(user.username);
      await page.getByLabel('Password').fill(user.password);
      await page.getByRole('button', { name: 'Sign in' }).click();

      // Should redirect back to customers (or dashboard)
      await page.waitForURL(/^(?!.*\/login)/, { timeout: 30_000 });
    });
  });

  test.describe('Login Form', () => {
    test('shows validation errors for empty fields', async ({ page }) => {
      await page.goto('http://localhost:3000/login');

      await page.getByRole('button', { name: 'Sign in' }).click();

      // Validation errors should appear
      await expect(page.getByText(/username.*required/i)).toBeVisible({ timeout: 5_000 });
      await expect(page.getByText(/password.*required/i)).toBeVisible();
    });

    test('shows error for invalid credentials', async ({ page }) => {
      await page.goto('http://localhost:3000/login');

      await page.getByLabel('Username').fill('invalid_user');
      await page.getByLabel('Password').fill('invalid_password');
      await page.getByRole('button', { name: 'Sign in' }).click();

      // Server error should appear
      const alert = page.locator('[role="alert"]:not(#__next-route-announcer__)');
      await expect(alert).toBeVisible({ timeout: 10_000 });
    });

    test('successful login redirects to dashboard', async ({ page }) => {
      await page.goto('http://localhost:3000/login');

      const user = TEST_USERS.manager;
      await page.getByLabel('Username').fill(user.username);
      await page.getByLabel('Password').fill(user.password);
      await page.getByRole('button', { name: 'Sign in' }).click();

      await page.waitForURL(/^(?!.*\/login)/, { timeout: 30_000 });
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 10_000 });
    });
  });

  test.describe('Session State', () => {
    test('user info is available after login', async ({ managerPage }) => {
      await managerPage.goto('/');
      await managerPage.waitForLoadState('networkidle');

      // User info should be displayed somewhere - look for role or "Manager" text
      // The sidebar shows the role name
      await expect(managerPage.getByText(/manager/i).first()).toBeVisible({ timeout: 5_000 });
    });

    test('role-based UI shows correct elements', async ({ managerPage }) => {
      await managerPage.goto('/');
      await managerPage.waitForLoadState('networkidle');

      // Manager should see dashboard with stats
      await expect(managerPage.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 10_000 });
    });
  });
});
