import { test, expect } from '../support/fixtures';
import { seedCustomer } from '../support/helpers/seed-helpers';
import { createCleanupTracker } from '../support/helpers/cleanup';

test.describe('Customer Management', () => {
  const cleanup = createCleanupTracker();

  test.afterEach(async ({ request }) => {
    // Best-effort cleanup of seeded data
    // In real usage, pass an admin token
  });

  test('should display customer list', async ({ page, loginAs }) => {
    // Given: manager is logged in
    await loginAs('manager');

    // When: navigating to customers page
    await page.goto('/customers');

    // Then: customer list is visible
    await expect(page.getByTestId('customer-list')).toBeVisible();
  });

  test('should navigate to new customer form', async ({ page, loginAs }) => {
    // Given: field officer is logged in
    await loginAs('field_officer');

    // When: clicking new customer button
    await page.goto('/customers');
    await page.getByTestId('new-customer-btn').click();

    // Then: customer creation form is displayed
    await expect(page).toHaveURL('/customers/new');
    await expect(page.getByTestId('customer-form')).toBeVisible();
  });

  test('should validate required fields on customer form', async ({ page, loginAs }) => {
    // Given: field officer is on new customer form
    await loginAs('field_officer');
    await page.goto('/customers/new');

    // When: submitting empty form
    await page.getByTestId('submit-btn').click();

    // Then: validation errors are shown
    await expect(page.getByText(/required/i)).toBeVisible();
  });
});
