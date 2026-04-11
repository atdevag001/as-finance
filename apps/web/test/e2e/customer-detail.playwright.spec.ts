import { test, expect } from './fixtures';
import { getTokenForRole, createTestCustomer } from './fixtures';

/**
 * Customer Detail Page — Playwright E2E Tests
 *
 * Streamlined tests focusing on core functionality.
 * Uses pre-authenticated fixtures.
 */

test.describe('Customer Detail Page', () => {
  let testCustomerId: string;
  let foToken: string;

  test.beforeAll(async () => {
    foToken = await getTokenForRole('field_officer');
    testCustomerId = await createTestCustomer(foToken);
  });

  test.describe('Page Load & Display', () => {
    test('manager can view customer detail with all sections', async ({ managerPage }) => {
      await managerPage.goto(`/customers/${testCustomerId}`);
      await managerPage.waitForLoadState('domcontentloaded');

      // Customer name and status should be visible
      await expect(managerPage.getByText(/Test Customer \d+/)).toBeVisible({ timeout: 30_000 });
      await expect(managerPage.getByText('Active')).toBeVisible();

      // All main sections should be visible (use headings to avoid ambiguity)
      await expect(managerPage.getByRole('heading', { name: 'Personal Info' })).toBeVisible();
      await expect(managerPage.getByRole('heading', { name: 'Address' })).toBeVisible();
      await expect(managerPage.getByRole('heading', { name: 'Family Members' })).toBeVisible();
      await expect(managerPage.getByRole('heading', { name: 'Guarantors' })).toBeVisible();

      // Action buttons should be visible for manager
      await expect(managerPage.getByRole('button', { name: /edit/i })).toBeVisible();
      await expect(managerPage.getByRole('button', { name: /blacklist/i })).toBeVisible();
    });

    test('displays customer personal info fields', async ({ managerPage }) => {
      await managerPage.goto(`/customers/${testCustomerId}`);
      await managerPage.waitForLoadState('domcontentloaded');

      await expect(managerPage.getByText('Personal Info')).toBeVisible({ timeout: 30_000 });
      // Key fields from the Personal Info card
      await expect(managerPage.getByText('Mobile')).toBeVisible();
      await expect(managerPage.getByText('Gender')).toBeVisible();
      await expect(managerPage.getByText('Aadhaar')).toBeVisible();
    });

    test('shows empty state for new customer sections', async ({ managerPage }) => {
      await managerPage.goto(`/customers/${testCustomerId}`);
      await managerPage.waitForLoadState('domcontentloaded');

      // New test customer should have no family members or guarantors
      await expect(managerPage.getByText('No family members added.')).toBeVisible({ timeout: 30_000 });
      await expect(managerPage.getByText('No guarantors added.')).toBeVisible();
    });
  });

  test.describe('Navigation', () => {
    test('back button returns to customers list', async ({ managerPage }) => {
      await managerPage.goto(`/customers/${testCustomerId}`);
      await managerPage.waitForLoadState('domcontentloaded');

      // Find and click the back link
      const backButton = managerPage.locator('a[href="/customers"]').first();
      await expect(backButton).toBeVisible({ timeout: 30_000 });
      await backButton.click();

      await managerPage.waitForURL('**/customers', { timeout: 30_000 });
    });
  });

  test.describe('Edit Customer', () => {
    test('Edit dialog opens with pre-populated data', async ({ managerPage }) => {
      await managerPage.goto(`/customers/${testCustomerId}`);
      await managerPage.waitForLoadState('domcontentloaded');

      await expect(managerPage.getByRole('button', { name: /edit/i })).toBeVisible({ timeout: 30_000 });
      await managerPage.getByRole('button', { name: /edit/i }).click();

      // Dialog should open with Edit Customer title
      await expect(managerPage.getByRole('dialog')).toBeVisible({ timeout: 10_000 });
      await expect(managerPage.getByText('Edit Customer')).toBeVisible();

      // Save button should be present
      await expect(managerPage.getByRole('button', { name: /save/i })).toBeVisible();
    });
  });

  test.describe('Family Members', () => {
    test('Add button opens family member dialog', async ({ managerPage }) => {
      await managerPage.goto(`/customers/${testCustomerId}`);
      await managerPage.waitForLoadState('domcontentloaded');

      // Wait for page to load
      await expect(managerPage.getByRole('heading', { name: 'Family Members' })).toBeVisible({ timeout: 30_000 });

      // Click the "+ Add" button in Family Members section (the button with just "Add" text)
      const familySection = managerPage.getByRole('heading', { name: 'Family Members' }).locator('..').locator('..');
      await familySection.getByRole('button', { name: 'Add' }).click();

      // Dialog should open with heading
      await expect(managerPage.getByRole('dialog')).toBeVisible({ timeout: 10_000 });
      await expect(managerPage.getByRole('heading', { name: 'Add Family Member' })).toBeVisible();
    });
  });

  test.describe('Guarantors', () => {
    test('Add button opens guarantor dialog', async ({ managerPage }) => {
      await managerPage.goto(`/customers/${testCustomerId}`);
      await managerPage.waitForLoadState('domcontentloaded');

      // Wait for page to load
      await expect(managerPage.getByRole('heading', { name: 'Guarantors' })).toBeVisible({ timeout: 30_000 });

      // Click the "+ Add" button in Guarantors section
      const guarantorSection = managerPage.getByRole('heading', { name: 'Guarantors' }).locator('..').locator('..');
      await guarantorSection.getByRole('button', { name: 'Add' }).click();

      // Dialog should open with heading
      await expect(managerPage.getByRole('dialog')).toBeVisible({ timeout: 10_000 });
      await expect(managerPage.getByRole('heading', { name: 'Add Guarantor' })).toBeVisible();
    });
  });

  test.describe('Blacklist', () => {
    test('Blacklist button opens confirmation dialog', async ({ managerPage }) => {
      await managerPage.goto(`/customers/${testCustomerId}`);
      await managerPage.waitForLoadState('domcontentloaded');

      const blacklistBtn = managerPage.getByRole('button', { name: /blacklist/i });
      await expect(blacklistBtn).toBeVisible({ timeout: 30_000 });

      await blacklistBtn.click();

      // Dialog should open
      await expect(managerPage.getByRole('dialog')).toBeVisible({ timeout: 10_000 });
      await expect(managerPage.getByText('Blacklist Customer')).toBeVisible();
    });
  });

  test.describe('Permission-based Access', () => {
    test('auditor can view but cannot edit', async ({ auditorPage }) => {
      await auditorPage.goto(`/customers/${testCustomerId}`);
      await auditorPage.waitForLoadState('domcontentloaded');

      // Should see customer data
      await expect(auditorPage.getByText(/Test Customer \d+/)).toBeVisible({ timeout: 30_000 });
      await expect(auditorPage.getByText('Personal Info')).toBeVisible();

      // Should NOT see Edit or Blacklist buttons
      await expect(auditorPage.getByRole('button', { name: /edit/i })).not.toBeVisible({ timeout: 3_000 });
      await expect(auditorPage.getByRole('button', { name: /blacklist/i })).not.toBeVisible();
    });
  });

  test.describe('Error Handling', () => {
    test('handles non-existent customer gracefully', async ({ managerPage }) => {
      await managerPage.goto('/customers/00000000-0000-0000-0000-000000000000');
      await managerPage.waitForLoadState('domcontentloaded');

      // Wait a bit for any content to load
      await managerPage.waitForTimeout(3000);

      // The page should NOT show normal customer data (no customer name heading)
      const hasCustomerName = await managerPage.getByText(/Test Customer \d+/).isVisible({ timeout: 3_000 }).catch(() => false);

      // Non-existent customer should not show normal customer detail content
      expect(hasCustomerName).toBe(false);
    });
  });
});
