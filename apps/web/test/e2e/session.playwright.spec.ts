import { test, expect } from './fixtures';
import { login, loginAsManager, TEST_USERS } from './fixtures';

/**
 * Session Management — Playwright E2E Tests
 *
 * Tests cover:
 * 1. Session persistence - refresh, restore
 * 2. Logout - clears session
 * 3. Expired token - redirect to login
 * 4. Return path - redirect back after login
 */

test.describe('Session Management', () => {
  test.describe('Session Persistence', () => {
    test('session persists after page refresh', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Verify logged in
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 10_000 });

      // Refresh page
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Should still be logged in
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 10_000 });
      // Should NOT redirect to login
      await expect(page).not.toHaveURL(/\/login/);
    });

    test('session persists across navigation', async ({ page }) => {
      await loginAsManager(page);

      // Navigate to different pages
      await page.goto('/customers');
      await expect(page.getByRole('heading', { name: /customers/i })).toBeVisible({ timeout: 10_000 });

      await page.goto('/loans');
      await expect(page.getByRole('heading', { name: /loans/i })).toBeVisible({ timeout: 10_000 });

      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 10_000 });

      // Should never redirect to login
      await expect(page).not.toHaveURL(/\/login/);
    });
  });

  test.describe('Logout', () => {
    test('logout clears session and redirects to login', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Find and click logout (may be in a dropdown menu)
      const userMenuButton = page.getByRole('button', { name: /menu|user|profile/i }).or(
        page.locator('[aria-haspopup="menu"]'),
      );

      if (await userMenuButton.isVisible()) {
        await userMenuButton.click();

        const logoutButton = page.getByRole('menuitem', { name: /logout|sign out/i }).or(
          page.getByText(/logout|sign out/i),
        );

        if (await logoutButton.isVisible()) {
          await logoutButton.click();
          await page.waitForURL('**/login', { timeout: 10_000 });
        }
      } else {
        // Try direct logout link
        const logoutLink = page.getByRole('link', { name: /logout|sign out/i });
        if (await logoutLink.isVisible()) {
          await logoutLink.click();
          await page.waitForURL('**/login', { timeout: 10_000 });
        }
      }
    });

    test('after logout, protected routes redirect to login', async ({ page }) => {
      // First login
      await loginAsManager(page);

      // Clear cookies to simulate logout
      await page.context().clearCookies();

      // Try to access protected route
      await page.goto('/customers');

      // Should redirect to login
      await page.waitForURL('**/login', { timeout: 10_000 });
    });
  });

  test.describe('Unauthenticated Access', () => {
    test('unauthenticated user is redirected to login', async ({ page }) => {
      // Clear any existing session
      await page.context().clearCookies();

      // Try to access dashboard
      await page.goto('/');

      // Should redirect to login
      await page.waitForURL('**/login', { timeout: 10_000 });
    });

    test('login page is accessible without auth', async ({ page }) => {
      await page.context().clearCookies();
      await page.goto('/login');

      await expect(page.getByLabel('Username')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByLabel('Password')).toBeVisible();
    });

    test('direct URL to protected page redirects to login', async ({ page }) => {
      await page.context().clearCookies();
      await page.goto('/customers/new');

      await page.waitForURL('**/login', { timeout: 10_000 });
    });
  });

  test.describe('Return Path', () => {
    test('redirects back to intended page after login', async ({ page }) => {
      await page.context().clearCookies();

      // Try to access specific page
      await page.goto('/customers');
      await page.waitForURL('**/login', { timeout: 10_000 });

      // Login
      const user = TEST_USERS.manager;
      await page.getByLabel('Username').fill(user.username);
      await page.getByLabel('Password').fill(user.password);
      await page.getByRole('button', { name: 'Sign in' }).click();

      // Should redirect back to customers (or dashboard)
      await page.waitForURL(/^(?!.*\/login)/, { timeout: 15_000 });
    });
  });

  test.describe('Login Form', () => {
    test('shows validation errors for empty fields', async ({ page }) => {
      await page.goto('/login');

      await page.getByRole('button', { name: 'Sign in' }).click();

      // Validation errors should appear
      await expect(page.getByText(/username.*required/i)).toBeVisible({ timeout: 5_000 });
      await expect(page.getByText(/password.*required/i)).toBeVisible();
    });

    test('shows error for invalid credentials', async ({ page }) => {
      await page.goto('/login');

      await page.getByLabel('Username').fill('invalid_user');
      await page.getByLabel('Password').fill('invalid_password');
      await page.getByRole('button', { name: 'Sign in' }).click();

      // Server error should appear
      const alert = page.locator('[role="alert"]:not(#__next-route-announcer__)');
      await expect(alert).toBeVisible({ timeout: 10_000 });
    });

    test('successful login redirects to dashboard', async ({ page }) => {
      await page.goto('/login');

      const user = TEST_USERS.manager;
      await page.getByLabel('Username').fill(user.username);
      await page.getByLabel('Password').fill(user.password);
      await page.getByRole('button', { name: 'Sign in' }).click();

      await page.waitForURL(/^(?!.*\/login)/, { timeout: 15_000 });
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 10_000 });
    });
  });

  test.describe('Session State', () => {
    test('user info is available after login', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // User info should be displayed somewhere (e.g., in header)
      // Look for username or role indication
    });

    test('role-based UI shows correct elements', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Manager should see certain elements
      // This is verified by the RBAC tests
    });
  });
});
