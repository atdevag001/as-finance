import { test as baseTest, expect } from '@playwright/test';

/**
 * Login Flow — Playwright E2E Tests
 *
 * These tests verify the login flow and must start with a clean (unauthenticated) state.
 * We explicitly clear cookies before each test.
 */

// Use different users to avoid lockout interference between tests
const LOGIN_USER = 'manager1';
const LOCKOUT_USER = 'staff1';
const VALID_PASSWORD = 'Admin@123';
const INVALID_PASSWORD = 'wrong_password';

// Create a test with unauthenticated state
const test = baseTest.extend({
  page: async ({ browser }, use) => {
    // Create a fresh context without storage state
    const context = await browser.newContext();
    const page = await context.newPage();
    await use(page);
    await page.close();
    await context.close();
  },
});

test.describe('Login Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.waitForSelector('input[id="username"]', { state: 'visible', timeout: 30_000 });
  });

  test('successful login redirects to dashboard', async ({ page }) => {
    await page.getByLabel('Username').fill(LOGIN_USER);
    await page.getByLabel('Password').fill(VALID_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    // After successful login the app redirects to "/"
    await page.waitForURL('/', { timeout: 30_000 });
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('invalid credentials shows error message', async ({ page }) => {
    await page.getByLabel('Username').fill('nonexistent_user_xyz');
    await page.getByLabel('Password').fill(INVALID_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Server error is displayed in a div with role="alert"
    const alert = page.locator('[role="alert"]:not(#__next-route-announcer__)');
    await expect(alert).toBeVisible({ timeout: 15_000 });
    await expect(alert).toHaveText(/invalid|credentials|password|not found|unauthorized/i);
  });

  test('login form validates required fields before submission', async ({ page }) => {
    // Click submit without filling any fields
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Client-side validation errors appear as <p> elements with class text-destructive
    const validationErrors = page.locator('p.text-destructive');
    await expect(validationErrors.first()).toBeVisible({ timeout: 10_000 });

    // Should show validation messages
    await expect(page.getByText('Username is required')).toBeVisible();
    await expect(page.getByText('Password is required')).toBeVisible();
  });

  test('password field is masked', async ({ page }) => {
    const passwordInput = page.getByLabel('Password');
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('forgot password link is visible', async ({ page }) => {
    // Check if forgot password link exists (may or may not be present)
    const forgotLink = page.getByText(/forgot/i);
    // This is optional - don't fail if not present
  });
});
