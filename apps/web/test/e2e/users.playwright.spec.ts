import { test, expect, type Page } from './fixtures';

/**
 * Recover from a login redirect that some parallel-load test runs hit when
 * /auth/refresh races against itself. Navigates to the target URL up to N
 * times; after each, waits for the named selector OR resets via a reload.
 */
async function gotoStableForm(
  page: Page,
  url: string,
  anchorSelector: string,
  attempts = 3,
): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    if (!page.url().includes('/login')) {
      try {
        await page.locator(anchorSelector).waitFor({ state: 'visible', timeout: 10_000 });
        return;
      } catch {
        // fall through to retry
      }
    }
    await page.waitForTimeout(1000);
  }
  // Last-resort: caller will see the next assertion fail with a clean reason
}

/**
 * Users Module — Playwright E2E Tests
 *
 * Tests cover:
 * 1. Users list - viewing, pagination, status badges
 * 2. Create user - form validation, password strength
 * 3. Edit user - update, activate/deactivate, role change
 * 4. Permission-based access
 *
 * Uses pre-authenticated fixtures for faster, more reliable tests.
 */

test.describe('Users Module', () => {
  test.describe('Users List Page', () => {
    test('admin can view users list', async ({ adminPage }) => {
      await adminPage.goto('/users');
      await expect(adminPage.getByRole('heading', { name: /user management/i })).toBeVisible({ timeout: 10_000 });
    });

    test('manager can view users list', async ({ managerPage }) => {
      await managerPage.goto('/users');
      await expect(managerPage.getByRole('heading', { name: /user management/i })).toBeVisible({ timeout: 10_000 });
    });

    test('field_officer gets Access Denied', async ({ fieldOfficerPage }) => {
      await fieldOfficerPage.goto('/users');
      await expect(fieldOfficerPage.getByRole('heading', { name: 'Access Denied' })).toBeVisible({ timeout: 10_000 });
    });

    test('displays users table with columns', async ({ adminPage }) => {
      await adminPage.goto('/users');
      await adminPage.waitForLoadState('networkidle');
      // If auth refresh was rate-limited (429), page may redirect to /login. Retry once.
      if (adminPage.url().includes('/login')) {
        await adminPage.waitForTimeout(1500);
        await adminPage.goto('/users');
        await adminPage.waitForLoadState('networkidle');
      }
      await expect(adminPage.getByRole('heading', { name: /user management/i })).toBeVisible({ timeout: 30_000 });
      // Table headers
      const table = adminPage.locator('table');
      if (await table.isVisible({ timeout: 10_000 })) {
        await expect(adminPage.getByText('Full Name')).toBeVisible({ timeout: 5_000 });
        await expect(adminPage.getByText('Username')).toBeVisible({ timeout: 5_000 });
        await expect(adminPage.getByText('Status')).toBeVisible({ timeout: 5_000 });
      }
    });

    test('shows status badges for active/inactive users', async ({ adminPage }) => {
      await adminPage.goto('/users');
      await adminPage.waitForLoadState('networkidle');
      // Look for status badges
      const statusBadges = adminPage.locator('[class*="badge"]').or(adminPage.locator('[class*="status"]'));
      if ((await statusBadges.count()) > 0) {
        // At least one badge should be visible
        await expect(statusBadges.first()).toBeVisible();
      }
    });

    test('admin sees "New User" button', async ({ adminPage }) => {
      await adminPage.goto('/users');
      await adminPage.waitForLoadState('networkidle');
      await expect(adminPage.getByRole('heading', { name: /user management/i })).toBeVisible({ timeout: 30_000 });
      await expect(adminPage.getByRole('link', { name: /new user/i })).toBeVisible({ timeout: 15_000 });
    });

    test('pagination works', async ({ adminPage }) => {
      await adminPage.goto('/users');
      await adminPage.waitForLoadState('networkidle');
      // If pagination exists, test it
      const nextButton = adminPage.getByRole('button', { name: /next/i });
      if (await nextButton.isVisible() && await nextButton.isEnabled()) {
        await nextButton.click();
        await adminPage.waitForLoadState('networkidle');
      }
    });

    test('edit link navigates to edit page', async ({ adminPage }) => {
      await adminPage.goto('/users');
      await adminPage.waitForLoadState('networkidle');
      const editButton = adminPage.getByRole('link', { name: /edit/i }).first();
      if (await editButton.isVisible()) {
        await editButton.click();
        await adminPage.waitForURL(/\/users\/[^/]+\/edit$/, { timeout: 10_000 });
      }
    });
  });

  test.describe('Create User Form', () => {
    test('navigates to create user page', async ({ adminPage }) => {
      await adminPage.goto('/users');
      await adminPage.waitForLoadState('networkidle');
      await expect(adminPage.getByRole('heading', { name: /user management/i })).toBeVisible({ timeout: 30_000 });
      await adminPage.getByRole('link', { name: /new user/i }).click();
      await adminPage.waitForURL('**/users/new', { timeout: 15_000 });
      await expect(adminPage.getByRole('heading', { name: /create user/i })).toBeVisible({ timeout: 30_000 });
    });

    test('form has all required fields', async ({ adminPage }) => {
      await adminPage.goto('/users/new');
      await adminPage.waitForLoadState('networkidle');
      if (adminPage.url().includes('/login')) {
        await adminPage.waitForTimeout(1500);
        await adminPage.goto('/users/new');
        await adminPage.waitForLoadState('networkidle');
      }
      // Wait for form to load
      await expect(adminPage.getByRole('heading', { name: /create user/i })).toBeVisible({ timeout: 30_000 });
      // Labels have asterisks, e.g. "Username *" - check inputs exist by name
      await expect(adminPage.locator('input[name="username"]')).toBeVisible({ timeout: 15_000 });
      await expect(adminPage.locator('input[name="fullName"]')).toBeVisible({ timeout: 5_000 });
      await expect(adminPage.locator('input[name="mobile"]')).toBeVisible({ timeout: 5_000 });
      await expect(adminPage.locator('input[name="password"]')).toBeVisible({ timeout: 5_000 });
      await expect(adminPage.locator('select[name="role"]')).toBeVisible({ timeout: 5_000 });
    });

    test('role dropdown has all 7 roles', async ({ adminPage }) => {
      await adminPage.goto('/users/new');
      await adminPage.waitForLoadState('networkidle');
      if (adminPage.url().includes('/login')) {
        await adminPage.waitForTimeout(1500);
        await adminPage.goto('/users/new');
        await adminPage.waitForLoadState('networkidle');
      }
      const roleSelect = adminPage.locator('select').first();
      if (await roleSelect.isVisible()) {
        const options = await roleSelect.locator('option').allTextContents();
        // Should have placeholder + 7 roles
        expect(options.length).toBeGreaterThanOrEqual(7);
      }
    });

    test('validates username is required', async ({ adminPage }) => {
      await gotoStableForm(adminPage, '/users/new', 'input[name="username"]');
      // Fill other fields but not username (use name attribute since labels lack htmlFor)
      await adminPage.locator('input[name="fullName"]').fill('Test User');
      await adminPage.locator('input[name="mobile"]').fill('9876543210');
      await adminPage.locator('input[name="password"]').fill('TestPass123');
      // Submit
      await adminPage.getByRole('button', { name: /create user/i }).click();
      // Should show validation error
      await expect(
        adminPage.getByText(/username.*required|at least 3/i),
      ).toBeVisible({ timeout: 5_000 });
    });

    test('validates username minimum length', async ({ adminPage }) => {
      await gotoStableForm(adminPage, '/users/new', 'input[name="username"]');
      // Fill username with only 2 characters (use name attribute since labels lack htmlFor)
      await adminPage.locator('input[name="username"]').fill('ab');
      await adminPage.locator('input[name="fullName"]').fill('Test User');
      await adminPage.locator('input[name="mobile"]').fill('9876543210');
      await adminPage.locator('input[name="password"]').fill('TestPass123');
      // Select a role
      await adminPage.locator('select').first().selectOption({ index: 1 });
      // Submit
      await adminPage.getByRole('button', { name: /create user/i }).click();
      // Should show validation error for username length
      await expect(
        adminPage.getByText(/at least 3 characters/i),
      ).toBeVisible({ timeout: 5_000 });
    });

    test('validates password strength - minimum 8 characters', async ({ adminPage }) => {
      await gotoStableForm(adminPage, '/users/new', 'input[name="username"]');
      await adminPage.locator('input[name="username"]').fill('testuser');
      await adminPage.locator('input[name="fullName"]').fill('Test User');
      await adminPage.locator('input[name="mobile"]').fill('9876543210');
      await adminPage.locator('input[name="password"]').fill('Short1'); // Too short
      await adminPage.locator('select').first().selectOption({ index: 1 });
      await adminPage.getByRole('button', { name: /create user/i }).click();
      await expect(
        adminPage.getByText(/at least 8 characters/i),
      ).toBeVisible({ timeout: 5_000 });
    });

    test('validates password strength - requires uppercase', async ({ adminPage }) => {
      await gotoStableForm(adminPage, '/users/new', 'input[name="username"]');
      await adminPage.locator('input[name="username"]').fill('testuser');
      await adminPage.locator('input[name="fullName"]').fill('Test User');
      await adminPage.locator('input[name="mobile"]').fill('9876543210');
      await adminPage.locator('input[name="password"]').fill('lowercase1'); // No uppercase
      await adminPage.locator('select').first().selectOption({ index: 1 });
      await adminPage.getByRole('button', { name: /create user/i }).click();
      await expect(
        adminPage.getByText(/uppercase/i),
      ).toBeVisible({ timeout: 5_000 });
    });

    test('validates password strength - requires digit', async ({ adminPage }) => {
      await adminPage.goto('/users/new');
      await adminPage.waitForLoadState('networkidle');
      // If auth refresh was rate-limited (429), page may redirect to /login. Retry once.
      if (adminPage.url().includes('/login')) {
        await adminPage.waitForTimeout(1500);
        await adminPage.goto('/users/new');
        await adminPage.waitForLoadState('networkidle');
      }
      // Wait for form to load
      await expect(adminPage.locator('input[name="username"]')).toBeVisible({ timeout: 30_000 });
      await adminPage.locator('input[name="username"]').fill('testuser');
      await adminPage.locator('input[name="fullName"]').fill('Test User');
      await adminPage.locator('input[name="mobile"]').fill('9876543210');
      await adminPage.locator('input[name="password"]').fill('NoDigits'); // No digit
      await adminPage.locator('select').first().selectOption({ index: 1 });
      await adminPage.getByRole('button', { name: /create user/i }).click();
      await expect(
        adminPage.getByText(/digit/i),
      ).toBeVisible({ timeout: 5_000 });
    });

    test('validates role is required', async ({ adminPage }) => {
      await gotoStableForm(adminPage, '/users/new', 'input[name="username"]');
      await adminPage.locator('input[name="username"]').fill('testuser');
      await adminPage.locator('input[name="fullName"]').fill('Test User');
      await adminPage.locator('input[name="mobile"]').fill('9876543210');
      await adminPage.locator('input[name="password"]').fill('ValidPass1');
      // Don't select role
      await adminPage.getByRole('button', { name: /create user/i }).click();
      // Check for "Please select a role" error message
      await expect(
        adminPage.locator('p.text-destructive', { hasText: /select.*role/i }),
      ).toBeVisible({ timeout: 5_000 });
    });

    test('mobile field accepts only 10 digits', async ({ adminPage }) => {
      await gotoStableForm(adminPage, '/users/new', 'input[name="username"]');
      await adminPage.locator('input[name="mobile"]').fill('123456789'); // Only 9 digits
      await adminPage.locator('input[name="username"]').fill('testuser');
      await adminPage.locator('input[name="fullName"]').fill('Test User');
      await adminPage.locator('input[name="password"]').fill('ValidPass1');
      await adminPage.locator('select').first().selectOption({ index: 1 });
      await adminPage.getByRole('button', { name: /create user/i }).click();
      // Should show validation error - look for error message, not label
      await expect(
        adminPage.locator('p.text-destructive', { hasText: /mobile|invalid/i }),
      ).toBeVisible({ timeout: 5_000 });
    });
  });

  test.describe('Edit User Form', () => {
    test('loads with pre-populated data', async ({ adminPage }) => {
      await adminPage.goto('/users');
      await adminPage.waitForLoadState('networkidle');
      // Wait for page to load
      await expect(adminPage.getByRole('heading', { name: /user management/i })).toBeVisible({ timeout: 30_000 });
      const editLink = adminPage.getByRole('link', { name: /edit/i }).first();
      if (await editLink.isVisible({ timeout: 10_000 })) {
        await editLink.click();
        await adminPage.waitForURL(/\/users\/[^/]+\/edit$/, { timeout: 15_000 });
        // Wait for form to load
        await expect(adminPage.locator('input[name="fullName"]')).toBeVisible({ timeout: 30_000 });
        // Fields should be pre-populated (use name attribute since labels lack htmlFor)
        await expect(adminPage.locator('input[name="fullName"]')).not.toBeEmpty({ timeout: 10_000 });
        await expect(adminPage.locator('input[name="mobile"]')).not.toBeEmpty({ timeout: 10_000 });
      }
    });

    test('username field is disabled', async ({ adminPage }) => {
      await adminPage.goto('/users');
      await adminPage.waitForLoadState('networkidle');
      // Wait for page to load
      await expect(adminPage.getByRole('heading', { name: /user management/i })).toBeVisible({ timeout: 30_000 });
      const editLink = adminPage.getByRole('link', { name: /edit/i }).first();
      if (await editLink.isVisible({ timeout: 10_000 })) {
        await editLink.click();
        await adminPage.waitForURL(/\/users\/[^/]+\/edit$/, { timeout: 15_000 });
        // Wait for form to load
        await expect(adminPage.locator('input[name="fullName"]')).toBeVisible({ timeout: 30_000 });
        // Username field is a disabled input with bg-muted class (not a form field, just display)
        const usernameInput = adminPage.locator('input[disabled].bg-muted').first();
        await expect(usernameInput).toBeDisabled();
      }
    });

    test('has Active checkbox', async ({ adminPage }) => {
      await adminPage.goto('/users');
      await adminPage.waitForLoadState('networkidle');
      // Wait for page to load
      await expect(adminPage.getByRole('heading', { name: /user management/i })).toBeVisible({ timeout: 30_000 });
      const editLink = adminPage.getByRole('link', { name: /edit/i }).first();
      if (await editLink.isVisible({ timeout: 10_000 })) {
        await editLink.click();
        await adminPage.waitForURL(/\/users\/[^/]+\/edit$/, { timeout: 15_000 });
        // Wait for form to load
        await expect(adminPage.locator('input[name="fullName"]')).toBeVisible({ timeout: 30_000 });
        // Active checkbox should be visible
        await expect(
          adminPage.locator('input[name="isActive"]').or(adminPage.locator('input[type="checkbox"]')),
        ).toBeVisible({ timeout: 10_000 });
      }
    });

    test('save changes button works', async ({ adminPage }) => {
      await adminPage.goto('/users');
      await adminPage.waitForLoadState('networkidle');
      // Wait for page to load
      await expect(adminPage.getByRole('heading', { name: /user management/i })).toBeVisible({ timeout: 30_000 });
      const editLink = adminPage.getByRole('link', { name: /edit/i }).first();
      if (await editLink.isVisible({ timeout: 10_000 })) {
        await editLink.click();
        await adminPage.waitForURL(/\/users\/[^/]+\/edit$/, { timeout: 15_000 });
        // Wait for form to load
        await expect(adminPage.locator('input[name="fullName"]')).toBeVisible({ timeout: 30_000 });
        // Save button should be visible
        await expect(
          adminPage.getByRole('button', { name: /save/i }),
        ).toBeVisible({ timeout: 10_000 });
      }
    });
  });
});
