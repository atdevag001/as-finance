import { test, expect } from '../support/fixtures';

test.describe('Login Page', () => {
  test('should display login form', async ({ page }) => {
    // Given: user navigates to login page
    await page.goto('/login');

    // Then: login form elements are visible
    await expect(page.getByTestId('username-input')).toBeVisible();
    await expect(page.getByTestId('password-input')).toBeVisible();
    await expect(page.getByTestId('login-submit')).toBeVisible();
  });

  test('should reject invalid credentials', async ({ page }) => {
    // Given: user is on login page
    await page.goto('/login');

    // When: user enters invalid credentials
    await page.getByTestId('username-input').fill('invalid_user');
    await page.getByTestId('password-input').fill('wrong_password');
    await page.getByTestId('login-submit').click();

    // Then: error message is shown
    await expect(page.getByTestId('error-message')).toBeVisible();
  });

  test('should redirect to dashboard on successful login', async ({ page, loginAs }) => {
    // Given: user logs in as manager
    await page.goto('/login');
    await loginAs('manager');

    // When: user navigates to dashboard
    await page.goto('/');

    // Then: dashboard is displayed
    await expect(page).toHaveURL(/dashboard|\/$/);
  });
});
