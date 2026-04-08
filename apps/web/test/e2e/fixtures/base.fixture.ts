/**
 * Base Fixtures for E2E Tests
 *
 * Extends Playwright test with pre-authenticated page contexts for each role.
 * Uses pre-saved storage state files (from auth.setup.ts) instead of UI login.
 *
 * IMPORTANT: The default `page` from desktop-chrome project is already authenticated
 * as manager via storageState in playwright.config.ts. Use the role-specific fixtures
 * (adminPage, accountantPage, etc.) only when you need a different role.
 *
 * @module fixtures/base
 */

import { test as base, type Page, type BrowserContext, type Browser } from '@playwright/test';
import { TEST_USERS, type UserRole } from './auth.fixture';
import * as path from 'path';
import * as fs from 'fs';

// Auth state file paths
const AUTH_DIR = path.join(__dirname, '..', '.auth');
const authFile = (role: string) => path.join(AUTH_DIR, `${role}.json`);

// Extended test type with role-specific pages
type AuthFixtures = {
  adminPage: Page;
  managerPage: Page;
  fieldOfficerPage: Page;
  collectionOfficerPage: Page;
  accountantPage: Page;
  officeStaffPage: Page;
  auditorPage: Page;
  getPageForRole: (role: UserRole) => Promise<Page>;
};

/**
 * Create a new browser context with the storage state for a specific role.
 */
async function createContextForRole(browser: Browser, role: UserRole): Promise<BrowserContext> {
  const storageStatePath = authFile(role);

  if (!fs.existsSync(storageStatePath)) {
    throw new Error(`Auth state file not found for role "${role}" at ${storageStatePath}. Run "pnpm test:e2e --project=auth-setup" first.`);
  }

  return browser.newContext({
    storageState: storageStatePath,
  });
}

/**
 * Extended test with pre-authenticated pages for each role.
 *
 * Usage:
 * ```typescript
 * import { test, expect } from './fixtures';
 *
 * // For tests that need manager role, use the default page
 * // (desktop-chrome project already loads manager storage state)
 * test('manager can view dashboard', async ({ page }) => {
 *   await page.goto('/dashboard');
 * });
 *
 * // For tests that need a different role:
 * test('accountant can view accounting', async ({ accountantPage }) => {
 *   await accountantPage.goto('/accounting');
 * });
 * ```
 */
export const test = base.extend<AuthFixtures>({
  adminPage: async ({ browser }, use) => {
    const context = await createContextForRole(browser, 'super_admin');
    const page = await context.newPage();
    await use(page);
    await page.close();
    await context.close();
  },

  managerPage: async ({ browser }, use) => {
    const context = await createContextForRole(browser, 'manager');
    const page = await context.newPage();
    await use(page);
    await page.close();
    await context.close();
  },

  fieldOfficerPage: async ({ browser }, use) => {
    const context = await createContextForRole(browser, 'field_officer');
    const page = await context.newPage();
    await use(page);
    await page.close();
    await context.close();
  },

  collectionOfficerPage: async ({ browser }, use) => {
    const context = await createContextForRole(browser, 'collection_officer');
    const page = await context.newPage();
    await use(page);
    await page.close();
    await context.close();
  },

  accountantPage: async ({ browser }, use) => {
    const context = await createContextForRole(browser, 'accountant');
    const page = await context.newPage();
    await use(page);
    await page.close();
    await context.close();
  },

  officeStaffPage: async ({ browser }, use) => {
    const context = await createContextForRole(browser, 'office_staff');
    const page = await context.newPage();
    await use(page);
    await page.close();
    await context.close();
  },

  auditorPage: async ({ browser }, use) => {
    const context = await createContextForRole(browser, 'viewer_auditor');
    const page = await context.newPage();
    await use(page);
    await page.close();
    await context.close();
  },

  getPageForRole: async ({ browser }, use) => {
    const contexts: Map<UserRole, { page: Page; context: BrowserContext }> = new Map();

    const getter = async (role: UserRole): Promise<Page> => {
      if (!contexts.has(role)) {
        const context = await createContextForRole(browser, role);
        const page = await context.newPage();
        contexts.set(role, { page, context });
      }
      return contexts.get(role)!.page;
    };

    await use(getter);

    // Cleanup all created pages and contexts
    for (const { page, context } of Array.from(contexts.values())) {
      await page.close();
      await context.close();
    }
  },
});

// Re-export expect for convenience
export { expect } from '@playwright/test';

// Re-export auth utilities
export * from './auth.fixture';

// Re-export test data utilities
export * from './test-data.fixture';
