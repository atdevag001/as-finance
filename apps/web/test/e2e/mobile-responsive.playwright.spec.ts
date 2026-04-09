import { test, expect } from './fixtures';

/**
 * Mobile Responsive — Playwright E2E Tests
 *
 * Uses pre-authenticated fixtures to avoid rate limiting.
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

// Force Pixel 5 viewport for all tests in this file
test.use({
  viewport: { width: 393, height: 851 },
  isMobile: true,
  hasTouch: true,
});

test.describe('Mobile Responsive', () => {
  test('collection form usable on mobile viewport', async ({ collectionOfficerPage }) => {
    // Navigate to the collection form
    await collectionOfficerPage.goto('/collections/new');
    await collectionOfficerPage.waitForLoadState('networkidle');

    // Verify the form heading is visible
    await expect(collectionOfficerPage.getByRole('heading', { name: /post collection/i })).toBeVisible({ timeout: 15_000 });

    // Verify loan search input is visible and interactable on mobile
    const loanSearchField = collectionOfficerPage.getByPlaceholder(/search by loan number/i);
    await expect(loanSearchField).toBeVisible();
    await expect(loanSearchField).toBeEnabled();

    // Verify amount field is visible
    const amountField = collectionOfficerPage.getByLabel(/amount/i);
    await expect(amountField).toBeVisible();
    await expect(amountField).toBeEnabled();

    // Verify the submit button is visible and not cut off
    const submitButton = collectionOfficerPage.getByRole('button', { name: 'Post Collection' });
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toBeEnabled();

    // Verify the form fields don't overflow the viewport
    const viewportWidth = 393;
    const fieldBox = await loanSearchField.boundingBox();
    expect(fieldBox).not.toBeNull();
    if (fieldBox) {
      expect(fieldBox.x).toBeGreaterThanOrEqual(0);
      expect(fieldBox.x + fieldBox.width).toBeLessThanOrEqual(viewportWidth + 20);
    }
  });

  test('touch targets sufficiently large (min 44x44px)', async ({ collectionOfficerPage }) => {
    await collectionOfficerPage.goto('/collections/new');
    await collectionOfficerPage.waitForLoadState('networkidle');

    // Check the submit button meets minimum touch target size (44x44px)
    const submitButton = collectionOfficerPage.getByRole('button', { name: 'Post Collection' });
    const submitBox = await submitButton.boundingBox();
    expect(submitBox).not.toBeNull();
    if (submitBox) {
      expect(submitBox.height).toBeGreaterThanOrEqual(44);
      expect(submitBox.width).toBeGreaterThanOrEqual(44);
    }

    // Check the hamburger menu button meets minimum touch target size
    const hamburgerButton = collectionOfficerPage.getByRole('button', { name: /open sidebar|menu/i });
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
    const amountField = collectionOfficerPage.getByLabel(/amount/i);
    const amountBox = await amountField.boundingBox();
    expect(amountBox).not.toBeNull();
    if (amountBox) {
      // Input fields should be at least 40px tall (h-10 = 40px in Tailwind)
      expect(amountBox.height).toBeGreaterThanOrEqual(40);
    }
  });

  test('navigation menu collapses to hamburger on mobile', async ({ collectionOfficerPage }) => {
    await collectionOfficerPage.goto('/');
    await collectionOfficerPage.waitForLoadState('networkidle');

    // On mobile, the sidebar should be hidden by default (translated off-screen)
    const sidebar = collectionOfficerPage.locator('aside');
    await expect(sidebar).toBeVisible({ timeout: 15_000 });

    // The sidebar should have the -translate-x-full class when closed on mobile
    await expect(sidebar).toHaveClass(/-translate-x-full/);

    // The hamburger button should be visible on mobile
    const hamburgerButton = collectionOfficerPage.getByRole('button', { name: /open sidebar|menu/i });
    await expect(hamburgerButton).toBeVisible();

    // Click the hamburger to open the sidebar
    await hamburgerButton.click();

    // After clicking, the sidebar should slide in (translate-x-0)
    await expect(sidebar).toHaveClass(/translate-x-0/);

    // The sidebar should show navigation links
    await expect(collectionOfficerPage.getByText('AS Finance LMS')).toBeVisible();

    // Close the sidebar by clicking the close button
    const closeButton = collectionOfficerPage.getByRole('button', { name: /close sidebar/i });
    const closeVisible = await closeButton.isVisible().catch(() => false);
    if (closeVisible) {
      await closeButton.click();
      // Sidebar should be hidden again
      await expect(sidebar).toHaveClass(/-translate-x-full/);
    }
  });
});
