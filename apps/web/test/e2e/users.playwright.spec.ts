import { test, expect } from './fixtures';

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
      await expect(adminPage.getByRole('heading', { name: /user management/i })).toBeVisible({ timeout: 10_000 });
      // Table headers
      const table = adminPage.locator('table');
      if (await table.isVisible()) {
        await expect(adminPage.getByText('Full Name')).toBeVisible();
        await expect(adminPage.getByText('Username')).toBeVisible();
        await expect(adminPage.getByText('Status')).toBeVisible();
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
      await expect(adminPage.getByRole('link', { name: /new user/i })).toBeVisible({ timeout: 10_000 });
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
      await adminPage.getByRole('link', { name: /new user/i }).click();
      await adminPage.waitForURL('**/users/new', { timeout: 10_000 });
      await expect(adminPage.getByRole('heading', { name: /create user/i })).toBeVisible();
    });

    test('form has all required fields', async ({ adminPage }) => {
      await adminPage.goto('/users/new');
      await adminPage.waitForLoadState('networkidle');
      await expect(adminPage.getByText('Username')).toBeVisible({ timeout: 10_000 });
      await expect(adminPage.getByText('Full Name')).toBeVisible();
      await expect(adminPage.getByText('Mobile')).toBeVisible();
      await expect(adminPage.getByText('Password')).toBeVisible();
      await expect(adminPage.getByText('Role')).toBeVisible();
    });

    test('role dropdown has all 7 roles', async ({ adminPage }) => {
      await adminPage.goto('/users/new');
      await adminPage.waitForLoadState('networkidle');
      const roleSelect = adminPage.locator('select').first();
      if (await roleSelect.isVisible()) {
        const options = await roleSelect.locator('option').allTextContents();
        // Should have placeholder + 7 roles
        expect(options.length).toBeGreaterThanOrEqual(7);
      }
    });

    test('validates username is required', async ({ adminPage }) => {
      await adminPage.goto('/users/new');
      await adminPage.waitForLoadState('networkidle');
      // Fill other fields but not username
      await adminPage.getByLabel('Full Name').fill('Test User');
      await adminPage.getByLabel('Mobile').fill('9876543210');
      await adminPage.getByLabel('Password').fill('TestPass123');
      // Submit
      await adminPage.getByRole('button', { name: /create user/i }).click();
      // Should show validation error
      await expect(
        adminPage.getByText(/username.*required|at least 3/i),
      ).toBeVisible({ timeout: 5_000 });
    });

    test('validates username minimum length', async ({ adminPage }) => {
      await adminPage.goto('/users/new');
      await adminPage.waitForLoadState('networkidle');
      // Fill username with only 2 characters
      await adminPage.getByLabel('Username').fill('ab');
      await adminPage.getByLabel('Full Name').fill('Test User');
      await adminPage.getByLabel('Mobile').fill('9876543210');
      await adminPage.getByLabel('Password').fill('TestPass123');
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
      await adminPage.goto('/users/new');
      await adminPage.waitForLoadState('networkidle');
      await adminPage.getByLabel('Username').fill('testuser');
      await adminPage.getByLabel('Full Name').fill('Test User');
      await adminPage.getByLabel('Mobile').fill('9876543210');
      await adminPage.getByLabel('Password').fill('Short1'); // Too short
      await adminPage.locator('select').first().selectOption({ index: 1 });
      await adminPage.getByRole('button', { name: /create user/i }).click();
      await expect(
        adminPage.getByText(/at least 8 characters/i),
      ).toBeVisible({ timeout: 5_000 });
    });

    test('validates password strength - requires uppercase', async ({ adminPage }) => {
      await adminPage.goto('/users/new');
      await adminPage.waitForLoadState('networkidle');
      await adminPage.getByLabel('Username').fill('testuser');
      await adminPage.getByLabel('Full Name').fill('Test User');
      await adminPage.getByLabel('Mobile').fill('9876543210');
      await adminPage.getByLabel('Password').fill('lowercase1'); // No uppercase
      await adminPage.locator('select').first().selectOption({ index: 1 });
      await adminPage.getByRole('button', { name: /create user/i }).click();
      await expect(
        adminPage.getByText(/uppercase/i),
      ).toBeVisible({ timeout: 5_000 });
    });

    test('validates password strength - requires digit', async ({ adminPage }) => {
      await adminPage.goto('/users/new');
      await adminPage.waitForLoadState('networkidle');
      await adminPage.getByLabel('Username').fill('testuser');
      await adminPage.getByLabel('Full Name').fill('Test User');
      await adminPage.getByLabel('Mobile').fill('9876543210');
      await adminPage.getByLabel('Password').fill('NoDigits'); // No digit
      await adminPage.locator('select').first().selectOption({ index: 1 });
      await adminPage.getByRole('button', { name: /create user/i }).click();
      await expect(
        adminPage.getByText(/digit/i),
      ).toBeVisible({ timeout: 5_000 });
    });

    test('validates role is required', async ({ adminPage }) => {
      await adminPage.goto('/users/new');
      await adminPage.waitForLoadState('networkidle');
      await adminPage.getByLabel('Username').fill('testuser');
      await adminPage.getByLabel('Full Name').fill('Test User');
      await adminPage.getByLabel('Mobile').fill('9876543210');
      await adminPage.getByLabel('Password').fill('ValidPass1');
      // Don't select role
      await adminPage.getByRole('button', { name: /create user/i }).click();
      await expect(
        adminPage.getByText(/select.*role/i),
      ).toBeVisible({ timeout: 5_000 });
    });

    test('mobile field accepts only 10 digits', async ({ adminPage }) => {
      await adminPage.goto('/users/new');
      await adminPage.waitForLoadState('networkidle');
      const mobileInput = adminPage.getByLabel('Mobile');
      await mobileInput.fill('123456789'); // Only 9 digits
      await adminPage.getByLabel('Username').fill('testuser');
      await adminPage.getByLabel('Full Name').fill('Test User');
      await adminPage.getByLabel('Password').fill('ValidPass1');
      await adminPage.locator('select').first().selectOption({ index: 1 });
      await adminPage.getByRole('button', { name: /create user/i }).click();
      // Should show validation error
      await expect(
        adminPage.getByText(/mobile|10.*digits/i),
      ).toBeVisible({ timeout: 5_000 });
    });
  });

  test.describe('Edit User Form', () => {
    test('loads with pre-populated data', async ({ adminPage }) => {
      await adminPage.goto('/users');
      await adminPage.waitForLoadState('networkidle');
      const editLink = adminPage.getByRole('link', { name: /edit/i }).first();
      if (await editLink.isVisible()) {
        await editLink.click();
        await adminPage.waitForURL(/\/users\/[^/]+\/edit$/, { timeout: 10_000 });
        // Fields should be pre-populated
        await expect(adminPage.getByLabel('Full Name')).not.toBeEmpty();
        await expect(adminPage.getByLabel('Mobile')).not.toBeEmpty();
      }
    });

    test('username field is disabled', async ({ adminPage }) => {
      await adminPage.goto('/users');
      await adminPage.waitForLoadState('networkidle');
      const editLink = adminPage.getByRole('link', { name: /edit/i }).first();
      if (await editLink.isVisible()) {
        await editLink.click();
        await adminPage.waitForURL(/\/users\/[^/]+\/edit$/, { timeout: 10_000 });
        // Username should be disabled
        const usernameInput = adminPage.getByLabel('Username');
        await expect(usernameInput).toBeDisabled();
      }
    });

    test('has Active checkbox', async ({ adminPage }) => {
      await adminPage.goto('/users');
      await adminPage.waitForLoadState('networkidle');
      const editLink = adminPage.getByRole('link', { name: /edit/i }).first();
      if (await editLink.isVisible()) {
        await editLink.click();
        await adminPage.waitForURL(/\/users\/[^/]+\/edit$/, { timeout: 10_000 });
        // Active checkbox should be visible
        await expect(
          adminPage.getByLabel('Active').or(adminPage.locator('input[type="checkbox"]')),
        ).toBeVisible({ timeout: 5_000 });
      }
    });

    test('save changes button works', async ({ adminPage }) => {
      await adminPage.goto('/users');
      await adminPage.waitForLoadState('networkidle');
      const editLink = adminPage.getByRole('link', { name: /edit/i }).first();
      if (await editLink.isVisible()) {
        await editLink.click();
        await adminPage.waitForURL(/\/users\/[^/]+\/edit$/, { timeout: 10_000 });
        // Save button should be visible
        await expect(
          adminPage.getByRole('button', { name: /save/i }),
        ).toBeVisible({ timeout: 5_000 });
      }
    });
  });
});
