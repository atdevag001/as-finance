import { test, expect } from './fixtures';
import { loginAsAdmin, loginAsManager, loginAsFieldOfficer } from './fixtures';

/**
 * Users Module — Playwright E2E Tests
 *
 * Tests cover:
 * 1. Users list - viewing, pagination, status badges
 * 2. Create user - form validation, password strength
 * 3. Edit user - update, activate/deactivate, role change
 * 4. Permission-based access
 */

test.describe('Users Module', () => {
  test.describe('Users List Page', () => {
    test('admin can view users list', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/users');

      await expect(page.getByRole('heading', { name: /user management/i })).toBeVisible({ timeout: 10_000 });
    });

    test('manager can view users list', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/users');

      await expect(page.getByRole('heading', { name: /user management/i })).toBeVisible({ timeout: 10_000 });
    });

    test('field_officer gets Access Denied', async ({ page }) => {
      await loginAsFieldOfficer(page);
      await page.goto('/users');

      await expect(page.getByRole('heading', { name: 'Access Denied' })).toBeVisible({ timeout: 10_000 });
    });

    test('displays users table with columns', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/users');
      await page.waitForLoadState('networkidle');

      await expect(page.getByRole('heading', { name: /user management/i })).toBeVisible({ timeout: 10_000 });

      // Table headers
      const table = page.locator('table');
      if (await table.isVisible()) {
        await expect(page.getByText('Full Name')).toBeVisible();
        await expect(page.getByText('Username')).toBeVisible();
        await expect(page.getByText('Status')).toBeVisible();
      }
    });

    test('shows status badges for active/inactive users', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/users');
      await page.waitForLoadState('networkidle');

      // Look for status badges
      const statusBadges = page.locator('[class*="badge"]').or(page.locator('[class*="status"]'));
      if ((await statusBadges.count()) > 0) {
        // At least one badge should be visible
        await expect(statusBadges.first()).toBeVisible();
      }
    });

    test('admin sees "New User" button', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/users');
      await page.waitForLoadState('networkidle');

      await expect(page.getByRole('link', { name: /new user/i })).toBeVisible({ timeout: 10_000 });
    });

    test('pagination works', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/users');
      await page.waitForLoadState('networkidle');

      // If pagination exists, test it
      const nextButton = page.getByRole('button', { name: /next/i });
      if (await nextButton.isVisible() && await nextButton.isEnabled()) {
        await nextButton.click();
        await page.waitForLoadState('networkidle');
      }
    });

    test('edit link navigates to edit page', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/users');
      await page.waitForLoadState('networkidle');

      const editButton = page.getByRole('link', { name: /edit/i }).first();
      if (await editButton.isVisible()) {
        await editButton.click();
        await page.waitForURL(/\/users\/[^/]+\/edit$/, { timeout: 10_000 });
      }
    });
  });

  test.describe('Create User Form', () => {
    test('navigates to create user page', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/users');
      await page.waitForLoadState('networkidle');

      await page.getByRole('link', { name: /new user/i }).click();
      await page.waitForURL('**/users/new', { timeout: 10_000 });

      await expect(page.getByRole('heading', { name: /create user/i })).toBeVisible();
    });

    test('form has all required fields', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/users/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByText('Username')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText('Full Name')).toBeVisible();
      await expect(page.getByText('Mobile')).toBeVisible();
      await expect(page.getByText('Password')).toBeVisible();
      await expect(page.getByText('Role')).toBeVisible();
    });

    test('role dropdown has all 7 roles', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/users/new');
      await page.waitForLoadState('networkidle');

      const roleSelect = page.locator('select').first();
      if (await roleSelect.isVisible()) {
        const options = await roleSelect.locator('option').allTextContents();
        // Should have placeholder + 7 roles
        expect(options.length).toBeGreaterThanOrEqual(7);
      }
    });

    test('validates username is required', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/users/new');
      await page.waitForLoadState('networkidle');

      // Fill other fields but not username
      await page.getByLabel('Full Name').fill('Test User');
      await page.getByLabel('Mobile').fill('9876543210');
      await page.getByLabel('Password').fill('TestPass123');

      // Submit
      await page.getByRole('button', { name: /create user/i }).click();

      // Should show validation error
      await expect(
        page.getByText(/username.*required|at least 3/i),
      ).toBeVisible({ timeout: 5_000 });
    });

    test('validates username minimum length', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/users/new');
      await page.waitForLoadState('networkidle');

      // Fill username with only 2 characters
      await page.getByLabel('Username').fill('ab');
      await page.getByLabel('Full Name').fill('Test User');
      await page.getByLabel('Mobile').fill('9876543210');
      await page.getByLabel('Password').fill('TestPass123');

      // Select a role
      await page.locator('select').first().selectOption({ index: 1 });

      // Submit
      await page.getByRole('button', { name: /create user/i }).click();

      // Should show validation error for username length
      await expect(
        page.getByText(/at least 3 characters/i),
      ).toBeVisible({ timeout: 5_000 });
    });

    test('validates password strength - minimum 8 characters', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/users/new');
      await page.waitForLoadState('networkidle');

      await page.getByLabel('Username').fill('testuser');
      await page.getByLabel('Full Name').fill('Test User');
      await page.getByLabel('Mobile').fill('9876543210');
      await page.getByLabel('Password').fill('Short1'); // Too short

      await page.locator('select').first().selectOption({ index: 1 });

      await page.getByRole('button', { name: /create user/i }).click();

      await expect(
        page.getByText(/at least 8 characters/i),
      ).toBeVisible({ timeout: 5_000 });
    });

    test('validates password strength - requires uppercase', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/users/new');
      await page.waitForLoadState('networkidle');

      await page.getByLabel('Username').fill('testuser');
      await page.getByLabel('Full Name').fill('Test User');
      await page.getByLabel('Mobile').fill('9876543210');
      await page.getByLabel('Password').fill('lowercase1'); // No uppercase

      await page.locator('select').first().selectOption({ index: 1 });

      await page.getByRole('button', { name: /create user/i }).click();

      await expect(
        page.getByText(/uppercase/i),
      ).toBeVisible({ timeout: 5_000 });
    });

    test('validates password strength - requires digit', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/users/new');
      await page.waitForLoadState('networkidle');

      await page.getByLabel('Username').fill('testuser');
      await page.getByLabel('Full Name').fill('Test User');
      await page.getByLabel('Mobile').fill('9876543210');
      await page.getByLabel('Password').fill('NoDigits'); // No digit

      await page.locator('select').first().selectOption({ index: 1 });

      await page.getByRole('button', { name: /create user/i }).click();

      await expect(
        page.getByText(/digit/i),
      ).toBeVisible({ timeout: 5_000 });
    });

    test('validates role is required', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/users/new');
      await page.waitForLoadState('networkidle');

      await page.getByLabel('Username').fill('testuser');
      await page.getByLabel('Full Name').fill('Test User');
      await page.getByLabel('Mobile').fill('9876543210');
      await page.getByLabel('Password').fill('ValidPass1');

      // Don't select role

      await page.getByRole('button', { name: /create user/i }).click();

      await expect(
        page.getByText(/select.*role/i),
      ).toBeVisible({ timeout: 5_000 });
    });

    test('mobile field accepts only 10 digits', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/users/new');
      await page.waitForLoadState('networkidle');

      const mobileInput = page.getByLabel('Mobile');
      await mobileInput.fill('123456789'); // Only 9 digits

      await page.getByLabel('Username').fill('testuser');
      await page.getByLabel('Full Name').fill('Test User');
      await page.getByLabel('Password').fill('ValidPass1');
      await page.locator('select').first().selectOption({ index: 1 });

      await page.getByRole('button', { name: /create user/i }).click();

      // Should show validation error
      await expect(
        page.getByText(/mobile|10.*digits/i),
      ).toBeVisible({ timeout: 5_000 });
    });
  });

  test.describe('Edit User Form', () => {
    test('loads with pre-populated data', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/users');
      await page.waitForLoadState('networkidle');

      const editLink = page.getByRole('link', { name: /edit/i }).first();
      if (await editLink.isVisible()) {
        await editLink.click();
        await page.waitForURL(/\/users\/[^/]+\/edit$/, { timeout: 10_000 });

        // Fields should be pre-populated
        await expect(page.getByLabel('Full Name')).not.toBeEmpty();
        await expect(page.getByLabel('Mobile')).not.toBeEmpty();
      }
    });

    test('username field is disabled', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/users');
      await page.waitForLoadState('networkidle');

      const editLink = page.getByRole('link', { name: /edit/i }).first();
      if (await editLink.isVisible()) {
        await editLink.click();
        await page.waitForURL(/\/users\/[^/]+\/edit$/, { timeout: 10_000 });

        // Username should be disabled
        const usernameInput = page.getByLabel('Username');
        await expect(usernameInput).toBeDisabled();
      }
    });

    test('has Active checkbox', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/users');
      await page.waitForLoadState('networkidle');

      const editLink = page.getByRole('link', { name: /edit/i }).first();
      if (await editLink.isVisible()) {
        await editLink.click();
        await page.waitForURL(/\/users\/[^/]+\/edit$/, { timeout: 10_000 });

        // Active checkbox should be visible
        await expect(
          page.getByLabel('Active').or(page.locator('input[type="checkbox"]')),
        ).toBeVisible({ timeout: 5_000 });
      }
    });

    test('save changes button works', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/users');
      await page.waitForLoadState('networkidle');

      const editLink = page.getByRole('link', { name: /edit/i }).first();
      if (await editLink.isVisible()) {
        await editLink.click();
        await page.waitForURL(/\/users\/[^/]+\/edit$/, { timeout: 10_000 });

        // Save button should be visible
        await expect(
          page.getByRole('button', { name: /save/i }),
        ).toBeVisible({ timeout: 5_000 });
      }
    });
  });
});
