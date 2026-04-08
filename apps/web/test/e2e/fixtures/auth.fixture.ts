import { type Page } from '@playwright/test';

/**
 * Auth Fixtures for E2E Tests
 *
 * Provides login helpers for all 7 user roles in the AS Finance system.
 * Uses seeded test accounts from prisma/seed.ts.
 *
 * @module fixtures/auth
 */

// Common password for all seeded users
const DEFAULT_PASSWORD = 'Admin@123';

// Seeded user credentials by role
export const TEST_USERS = {
  super_admin: { username: 'admin', password: DEFAULT_PASSWORD },
  manager: { username: 'manager1', password: DEFAULT_PASSWORD },
  field_officer: { username: 'field1', password: DEFAULT_PASSWORD },
  collection_officer: { username: 'collector1', password: DEFAULT_PASSWORD },
  accountant: { username: 'accountant1', password: DEFAULT_PASSWORD },
  office_staff: { username: 'staff1', password: DEFAULT_PASSWORD },
  viewer_auditor: { username: 'auditor1', password: DEFAULT_PASSWORD },
} as const;

export type UserRole = keyof typeof TEST_USERS;

/**
 * Check if the page is already authenticated by checking cookies.
 * Returns true if refresh_token cookie exists (storage state was loaded).
 *
 * We check refresh_token instead of access_token because:
 * - access_token may have secure:true flag preventing HTTP access
 * - refresh_token is httpOnly but doesn't have secure flag
 * - The frontend will use refresh_token to get a new access_token
 */
async function isAuthenticated(page: Page): Promise<boolean> {
  try {
    const cookies = await page.context().cookies();
    // Check for refresh_token as it's more reliable
    const hasRefreshToken = cookies.some(c => c.name === 'refresh_token' && c.value);
    return hasRefreshToken;
  } catch {
    return false;
  }
}

/**
 * Log in via the UI and wait for redirect away from login page.
 * Always performs fresh login to ensure correct role is authenticated.
 */
export async function login(page: Page, username: string, password: string): Promise<void> {
  // Clear cookies first
  await page.context().clearCookies();

  // Navigate to login page
  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  // Clear localStorage after navigation (needs page context)
  await page.evaluate(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      // Ignore errors
    }
  });

  // Reload to ensure clean state
  await page.reload();
  await page.waitForLoadState('networkidle');

  // Wait for the login form to be ready
  const usernameInput = page.getByLabel('Username');
  const passwordInput = page.getByLabel('Password');
  const submitButton = page.getByRole('button', { name: 'Sign in' });

  await usernameInput.waitFor({ state: 'visible', timeout: 15_000 });

  // Fill credentials
  await usernameInput.fill(username);
  await passwordInput.fill(password);

  // Click and wait for navigation
  await Promise.all([
    page.waitForURL(/^(?!.*\/login)/, { timeout: 30_000 }),
    submitButton.click(),
  ]);
}

/**
 * Log in as a specific role.
 */
export async function loginAsRole(page: Page, role: UserRole): Promise<void> {
  const user = TEST_USERS[role];
  await login(page, user.username, user.password);
}

// Convenience functions for each role
export async function loginAsAdmin(page: Page): Promise<void> {
  await loginAsRole(page, 'super_admin');
}

export async function loginAsManager(page: Page): Promise<void> {
  await loginAsRole(page, 'manager');
}

export async function loginAsFieldOfficer(page: Page): Promise<void> {
  await loginAsRole(page, 'field_officer');
}

export async function loginAsCollectionOfficer(page: Page): Promise<void> {
  await loginAsRole(page, 'collection_officer');
}

export async function loginAsAccountant(page: Page): Promise<void> {
  await loginAsRole(page, 'accountant');
}

export async function loginAsOfficeStaff(page: Page): Promise<void> {
  await loginAsRole(page, 'office_staff');
}

export async function loginAsAuditor(page: Page): Promise<void> {
  await loginAsRole(page, 'viewer_auditor');
}

/**
 * Log out the current user.
 */
export async function logout(page: Page): Promise<void> {
  // Click the user menu button (usually in the header)
  const userMenuButton = page.getByRole('button', { name: /logout|sign out|menu/i });
  if (await userMenuButton.isVisible()) {
    await userMenuButton.click();
    const logoutLink = page.getByRole('menuitem', { name: /logout|sign out/i });
    if (await logoutLink.isVisible()) {
      await logoutLink.click();
    }
  }
  // Fallback: navigate directly to login
  await page.goto('/login');
  await page.waitForURL('**/login', { timeout: 10_000 });
}

/**
 * Verify access is denied by checking for AccessDenied component.
 */
export async function expectAccessDenied(page: Page): Promise<void> {
  const { expect } = await import('@playwright/test');
  await expect(page.getByRole('heading', { name: 'Access Denied' })).toBeVisible({ timeout: 5_000 });
}

/**
 * Verify page loaded successfully (no access denied).
 */
export async function expectPageLoaded(page: Page, headingPattern?: string | RegExp): Promise<void> {
  const { expect } = await import('@playwright/test');
  // Should NOT show access denied
  await expect(page.getByRole('heading', { name: 'Access Denied' })).not.toBeVisible({ timeout: 2_000 });

  // If heading pattern provided, verify it's visible
  if (headingPattern) {
    await expect(page.getByRole('heading', { name: headingPattern })).toBeVisible({ timeout: 10_000 });
  }
}

/**
 * Navigate to a page using the sidebar (SPA navigation).
 * More reliable than page.goto() for authenticated state.
 */
export async function navigateVia(page: Page, linkName: RegExp | string): Promise<void> {
  await page.getByRole('link', { name: linkName }).click();
  await page.waitForLoadState('networkidle');
}

/**
 * Ensure we're authenticated and on a protected page.
 * Use this at the start of tests that rely on storage state.
 */
export async function ensureOnProtectedPage(page: Page): Promise<void> {
  const currentUrl = page.url();

  // If not on any page yet, navigate to customers (default landing page)
  if (!currentUrl || currentUrl === 'about:blank') {
    await page.goto('/customers');
    await page.waitForLoadState('networkidle');
  }

  // If redirected to login, storage state might not be loaded correctly
  const url = page.url();
  if (url.includes('/login')) {
    throw new Error('Not authenticated - storage state may not be loaded. Run auth-setup first.');
  }
}
