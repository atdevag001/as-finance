/**
 * Base Fixtures for E2E Tests
 *
 * Extends Playwright test with pre-authenticated page contexts for each role.
 * This allows tests to start with a logged-in user without repeating login flows.
 *
 * @module fixtures/base
 */

import { test as base, type Page, type BrowserContext } from '@playwright/test';
import { TEST_USERS, type UserRole, login } from './auth.fixture';

// Extended test type with role-specific pages
type AuthFixtures = {
  adminPage: Page;
  managerPage: Page;
  fieldOfficerPage: Page;
  collectionOfficerPage: Page;
  accountantPage: Page;
  officeStaffPage: Page;
  auditorPage: Page;
  // Utility to get a page for any role
  getPageForRole: (role: UserRole) => Promise<Page>;
};

/**
 * Login a page as a specific role and return it.
 * Uses the shared login function from auth.fixture.ts.
 */
async function loginPage(context: BrowserContext, role: UserRole): Promise<Page> {
  const page = await context.newPage();
  const user = TEST_USERS[role];
  await login(page, user.username, user.password);
  return page;
}

/**
 * Extended test with pre-authenticated pages for each role.
 *
 * Usage:
 * ```typescript
 * import { test, expect } from './fixtures/base.fixture';
 *
 * test('manager can approve loan', async ({ managerPage }) => {
 *   await managerPage.goto('/loans');
 *   // Already logged in as manager
 * });
 * ```
 */
export const test = base.extend<AuthFixtures>({
  adminPage: async ({ context }, use) => {
    const page = await loginPage(context, 'super_admin');
    await use(page);
    await page.close();
  },

  managerPage: async ({ context }, use) => {
    const page = await loginPage(context, 'manager');
    await use(page);
    await page.close();
  },

  fieldOfficerPage: async ({ context }, use) => {
    const page = await loginPage(context, 'field_officer');
    await use(page);
    await page.close();
  },

  collectionOfficerPage: async ({ context }, use) => {
    const page = await loginPage(context, 'collection_officer');
    await use(page);
    await page.close();
  },

  accountantPage: async ({ context }, use) => {
    const page = await loginPage(context, 'accountant');
    await use(page);
    await page.close();
  },

  officeStaffPage: async ({ context }, use) => {
    const page = await loginPage(context, 'office_staff');
    await use(page);
    await page.close();
  },

  auditorPage: async ({ context }, use) => {
    const page = await loginPage(context, 'viewer_auditor');
    await use(page);
    await page.close();
  },

  getPageForRole: async ({ context }, use) => {
    const pages: Map<UserRole, Page> = new Map();

    const getter = async (role: UserRole): Promise<Page> => {
      if (!pages.has(role)) {
        const page = await loginPage(context, role);
        pages.set(role, page);
      }
      return pages.get(role)!;
    };

    await use(getter);

    // Cleanup all created pages
    for (const page of pages.values()) {
      await page.close();
    }
  },
});

// Re-export expect for convenience
export { expect } from '@playwright/test';

// Re-export auth utilities
export * from './auth.fixture';

// Re-export test data utilities
export * from './test-data.fixture';
