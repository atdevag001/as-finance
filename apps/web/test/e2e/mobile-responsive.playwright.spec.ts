import { test, expect, type Page } from '@playwright/test';

/**
 * Mobile Responsive — Playwright E2E Tests
 *
 * Validates: Design GAP 8 (Mobile Responsive)
 *
 * Tests cover:
 * 1. Collection form usable on mobile viewport (Pixel 5)
 * 2. Touch targets sufficiently large (min 44x44px)
 * 3. Navigation menu collapses to hamburger on mobile
 *
 * These tests use the mobile-android project (Pixel 5 device) from playwright.config.ts.
 */

// Collection officer — primary mobile user persona
const CO_USERNAME = 'collector1';
const CO_PASSWORD = 'Admin@123';

/**
 * Helper: log in via the UI and wait for the dashboard redirect.
 */
async function login(page: Page, username: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/^(?!.*\/login)/, { timeout: 15_000 });
}

// Force Pixel 5 viewport for all tests in this file
test.use({
  viewport: { width: 393, height: 851 },
  isMobile: true,
  hasTouch: true,
});

test.describe('Mobile Responsive', () => {
  test('collection form usable on mobile viewport', async ({ page }) => {
    await login(page, CO_USERNAME, CO_PASSWORD);

    // Navigate to the collection form
    await page.goto('/collections/new');
    await page.waitForLoadState('networkidle');

    // Verify the form heading is visible
    await expect(page.getByText('Post Collection')).toBeVisible({ timeout: 10_000 });

    // Verify all form fields are visible and interactable on mobile
    const loanIdField = page.getByLabel('Loan ID *');
    await expect(loanIdField).toBeVisible();
    await expect(loanIdField).toBeEnabled();

    const amountField = page.getByLabel('Amount (paise) *');
    await expect(amountField).toBeVisible();
    await expect(amountField).toBeEnabled();

    const dateField = page.getByLabel('Payment Date *');
    await expect(dateField).toBeVisible();

    const modeField = page.getByLabel('Payment Mode *');
    await expect(modeField).toBeVisible();

    // Verify the submit button is visible and not cut off
    const submitButton = page.getByRole('button', { name: 'Post Collection' });
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toBeEnabled();

    // Verify the form fields don't overflow the viewport
    const viewportWidth = 393;
    const fieldBox = await loanIdField.boundingBox();
    expect(fieldBox).not.toBeNull();
    if (fieldBox) {
      expect(fieldBox.x).toBeGreaterThanOrEqual(0);
      expect(fieldBox.x + fieldBox.width).toBeLessThanOrEqual(viewportWidth + 1);
    }
  });

  test('touch targets sufficiently large (min 44x44px)', async ({ page }) => {
    await login(page, CO_USERNAME, CO_PASSWORD);

    await page.goto('/collections/new');
    await page.waitForLoadState('networkidle');

    // Check the submit button meets minimum touch target size (44x44px)
    const submitButton = page.getByRole('button', { name: 'Post Collection' });
    const submitBox = await submitButton.boundingBox();
    expect(submitBox).not.toBeNull();
    if (submitBox) {
      expect(submitBox.height).toBeGreaterThanOrEqual(44);
      expect(submitBox.width).toBeGreaterThanOrEqual(44);
    }

    // Check the hamburger menu button meets minimum touch target size
    const hamburgerButton = page.getByRole('button', { name: 'Open sidebar' });
    const hamburgerVisible = await hamburgerButton.isVisible().catch(() => false);
    if (hamburgerVisible) {
      const hamburgerBox = await hamburgerButton.boundingBox();
      expect(hamburgerBox).not.toBeNull();
      if (hamburgerBox) {
        expect(hamburgerBox.height).toBeGreaterThanOrEqual(44);
        expect(hamburgerBox.width).toBeGreaterThanOrEqual(44);
      }
    }

    // Check form input fields meet minimum touch target height
    const amountField = page.getByLabel('Amount (paise) *');
    const amountBox = await amountField.boundingBox();
    expect(amountBox).not.toBeNull();
    if (amountBox) {
      // Input fields should be at least 40px tall (h-10 = 40px in Tailwind)
      expect(amountBox.height).toBeGreaterThanOrEqual(40);
    }
  });

  test('navigation menu collapses to hamburger on mobile', async ({ page }) => {
    await login(page, CO_USERNAME, CO_PASSWORD);

    // On mobile, the sidebar should be hidden by default (translated off-screen)
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible({ timeout: 10_000 });

    // The sidebar should have the -translate-x-full class when closed on mobile
    await expect(sidebar).toHaveClass(/-translate-x-full/);

    // The hamburger button should be visible on mobile
    const hamburgerButton = page.getByRole('button', { name: 'Open sidebar' });
    await expect(hamburgerButton).toBeVisible();

    // Click the hamburger to open the sidebar
    await hamburgerButton.click();

    // After clicking, the sidebar should slide in (translate-x-0)
    await expect(sidebar).toHaveClass(/translate-x-0/);

    // The sidebar should show navigation links
    await expect(page.getByText('AS Finance LMS')).toBeVisible();

    // Close the sidebar by clicking the close button
    const closeButton = page.getByRole('button', { name: 'Close sidebar' });
    const closeVisible = await closeButton.isVisible().catch(() => false);
    if (closeVisible) {
      await closeButton.click();
      // Sidebar should be hidden again
      await expect(sidebar).toHaveClass(/-translate-x-full/);
    }
  });
});
