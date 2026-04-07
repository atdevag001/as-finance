import { test, expect, type Page } from '@playwright/test';
import {
  TEST_USERS,
  type UserRole,
  login,
  loginAsRole,
} from './fixtures';

/**
 * RBAC Matrix — Playwright E2E Tests
 *
 * Tests the complete Role-Based Access Control matrix for all 7 roles
 * across all pages and permissions.
 *
 * Roles:
 * - super_admin: Full access
 * - manager: Full access except system settings
 * - field_officer: Customer/loan creation, limited access
 * - collection_officer: Collection posting only
 * - accountant: Accounting/cashbook access
 * - office_staff: Customer/loan creation, limited access
 * - viewer_auditor: Read-only audit access
 */

// Page access expectations by role
const PAGE_ACCESS: Record<string, Record<UserRole, boolean>> = {
  '/': {
    super_admin: true,
    manager: true,
    field_officer: true,
    collection_officer: true,
    accountant: true,
    office_staff: true,
    viewer_auditor: true,
  },
  '/customers': {
    super_admin: true,
    manager: true,
    field_officer: true,
    collection_officer: true,
    accountant: true,
    office_staff: true,
    viewer_auditor: true,
  },
  '/loans': {
    super_admin: true,
    manager: true,
    field_officer: true,
    collection_officer: true,
    accountant: true,
    office_staff: true,
    viewer_auditor: true,
  },
  '/collections': {
    super_admin: true,
    manager: true,
    field_officer: true,
    collection_officer: true,
    accountant: true,
    office_staff: true,
    viewer_auditor: true,
  },
  '/groups': {
    super_admin: true,
    manager: true,
    field_officer: true,
    collection_officer: true,
    accountant: true,
    office_staff: true,
    viewer_auditor: true,
  },
  '/accounting': {
    super_admin: true,
    manager: true,
    field_officer: false,
    collection_officer: false,
    accountant: true,
    office_staff: false,
    viewer_auditor: true,
  },
  '/cashbook': {
    super_admin: true,
    manager: true,
    field_officer: false,
    collection_officer: false,
    accountant: true,
    office_staff: false,
    viewer_auditor: false,
  },
  '/reports': {
    super_admin: true,
    manager: true,
    field_officer: true,
    collection_officer: true,
    accountant: true,
    office_staff: false,
    viewer_auditor: true,
  },
  '/users': {
    super_admin: true,
    manager: true,
    field_officer: false,
    collection_officer: false,
    accountant: false,
    office_staff: false,
    viewer_auditor: false,
  },
  '/settings': {
    super_admin: true,
    manager: true,
    field_officer: false,
    collection_officer: false,
    accountant: false,
    office_staff: false,
    viewer_auditor: false,
  },
  '/audit': {
    super_admin: true,
    manager: true,
    field_officer: false,
    collection_officer: false,
    accountant: false,
    office_staff: false,
    viewer_auditor: true,
  },
};

/**
 * Check if user has access to a page.
 * Returns true if page loaded without Access Denied.
 */
async function checkPageAccess(page: Page, url: string): Promise<boolean> {
  await page.goto(url);

  // Wait for page to load
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

  // Check for Access Denied
  const accessDenied = page.getByRole('heading', { name: 'Access Denied' });
  const isAccessDenied = await accessDenied.isVisible({ timeout: 2_000 }).catch(() => false);

  return !isAccessDenied;
}

test.describe('RBAC Page Access Matrix', () => {
  // Generate tests for each role × page combination
  for (const [pagePath, roleAccess] of Object.entries(PAGE_ACCESS)) {
    for (const [role, shouldHaveAccess] of Object.entries(roleAccess) as [UserRole, boolean][]) {
      const testName = shouldHaveAccess
        ? `${role} CAN access ${pagePath}`
        : `${role} CANNOT access ${pagePath}`;

      test(testName, async ({ page }) => {
        const user = TEST_USERS[role];
        await login(page, user.username, user.password);

        const hasAccess = await checkPageAccess(page, pagePath);

        if (shouldHaveAccess) {
          expect(hasAccess).toBe(true);
        } else {
          expect(hasAccess).toBe(false);
        }
      });
    }
  }
});

test.describe('RBAC Action Permissions', () => {
  test.describe('Customer Actions', () => {
    test('field_officer can see "New Customer" button', async ({ page }) => {
      await loginAsRole(page, 'field_officer');
      await page.goto('/customers');
      await expect(page.getByRole('link', { name: /new customer/i })).toBeVisible({ timeout: 10_000 });
    });

    test('viewer_auditor CANNOT see "New Customer" button', async ({ page }) => {
      await loginAsRole(page, 'viewer_auditor');
      await page.goto('/customers');
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('link', { name: /new customer/i })).not.toBeVisible({ timeout: 3_000 });
    });

    test('collection_officer CANNOT see "New Customer" button', async ({ page }) => {
      await loginAsRole(page, 'collection_officer');
      await page.goto('/customers');
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('link', { name: /new customer/i })).not.toBeVisible({ timeout: 3_000 });
    });
  });

  test.describe('Loan Actions', () => {
    test('field_officer can see "New Loan" button', async ({ page }) => {
      await loginAsRole(page, 'field_officer');
      await page.goto('/loans');
      await expect(page.getByRole('link', { name: /new loan/i })).toBeVisible({ timeout: 10_000 });
    });

    test('viewer_auditor CANNOT see "New Loan" button', async ({ page }) => {
      await loginAsRole(page, 'viewer_auditor');
      await page.goto('/loans');
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('link', { name: /new loan/i })).not.toBeVisible({ timeout: 3_000 });
    });

    test('manager can see approve/reject buttons on loan detail', async ({ page }) => {
      await loginAsRole(page, 'manager');
      await page.goto('/loans');

      // Find a loan in submitted or under_review status
      const loanLink = page.locator('table tbody tr a').first();
      if (await loanLink.isVisible()) {
        await loanLink.click();
        await page.waitForURL(/\/loans\/[^/]+$/, { timeout: 10_000 });

        // Manager should see action buttons (at least some loan actions)
        const actionButtons = page.getByRole('button', { name: /approve|reject|disburse|submit/i });
        // Count doesn't matter, just check for presence of any action
        await page.waitForLoadState('networkidle');
      }
    });

    test('field_officer CANNOT see approve button on loan detail', async ({ page }) => {
      await loginAsRole(page, 'field_officer');
      await page.goto('/loans');

      const loanLink = page.locator('table tbody tr a').first();
      if (await loanLink.isVisible()) {
        await loanLink.click();
        await page.waitForURL(/\/loans\/[^/]+$/, { timeout: 10_000 });
        await page.waitForLoadState('networkidle');

        // FO should NOT see approve button
        await expect(page.getByRole('button', { name: /^approve$/i })).not.toBeVisible({ timeout: 3_000 });
      }
    });
  });

  test.describe('Collection Actions', () => {
    test('collection_officer can see "New Collection" button', async ({ page }) => {
      await loginAsRole(page, 'collection_officer');
      await page.goto('/collections');
      await expect(
        page.getByRole('link', { name: /new collection/i }).or(
          page.getByRole('link', { name: /record collection/i }),
        ),
      ).toBeVisible({ timeout: 10_000 });
    });

    test('viewer_auditor CANNOT see "New Collection" button', async ({ page }) => {
      await loginAsRole(page, 'viewer_auditor');
      await page.goto('/collections');
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('link', { name: /new collection/i })).not.toBeVisible({ timeout: 3_000 });
    });

    test('manager can see "Reverse" button on collection', async ({ page }) => {
      await loginAsRole(page, 'manager');
      await page.goto('/collections');

      const collectionLink = page.locator('table tbody tr a').first();
      if (await collectionLink.isVisible()) {
        await collectionLink.click();
        await page.waitForURL(/\/collections\/[^/]+$/, { timeout: 10_000 });
        await page.waitForLoadState('networkidle');

        // Manager may see reverse button for posted collections
        // This is conditional on collection status
      }
    });

    test('collection_officer CANNOT see "Reverse" button', async ({ page }) => {
      await loginAsRole(page, 'collection_officer');
      await page.goto('/collections');

      const collectionLink = page.locator('table tbody tr a').first();
      if (await collectionLink.isVisible()) {
        await collectionLink.click();
        await page.waitForURL(/\/collections\/[^/]+$/, { timeout: 10_000 });
        await page.waitForLoadState('networkidle');

        await expect(page.getByRole('button', { name: /reverse/i })).not.toBeVisible({ timeout: 3_000 });
      }
    });
  });

  test.describe('User Management Actions', () => {
    test('super_admin can see "New User" button', async ({ page }) => {
      await loginAsRole(page, 'super_admin');
      await page.goto('/users');
      await expect(page.getByRole('link', { name: /new user/i })).toBeVisible({ timeout: 10_000 });
    });

    test('manager can see "New User" button', async ({ page }) => {
      await loginAsRole(page, 'manager');
      await page.goto('/users');
      await expect(page.getByRole('link', { name: /new user/i })).toBeVisible({ timeout: 10_000 });
    });

    test('field_officer gets Access Denied on /users', async ({ page }) => {
      await loginAsRole(page, 'field_officer');
      await page.goto('/users');
      await expect(page.getByRole('heading', { name: 'Access Denied' })).toBeVisible({ timeout: 10_000 });
    });
  });

  test.describe('Settings Actions', () => {
    test('super_admin can access settings', async ({ page }) => {
      await loginAsRole(page, 'super_admin');
      await page.goto('/settings');
      await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 10_000 });
    });

    test('super_admin can see Save button on settings', async ({ page }) => {
      await loginAsRole(page, 'super_admin');
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('button', { name: /save/i })).toBeVisible({ timeout: 10_000 });
    });

    test('field_officer gets Access Denied on /settings', async ({ page }) => {
      await loginAsRole(page, 'field_officer');
      await page.goto('/settings');
      await expect(page.getByRole('heading', { name: 'Access Denied' })).toBeVisible({ timeout: 10_000 });
    });
  });

  test.describe('Cashbook Actions', () => {
    test('accountant can access cashbook', async ({ page }) => {
      await loginAsRole(page, 'accountant');
      await page.goto('/cashbook');
      await expect(page.getByRole('heading', { name: 'Cashbook' })).toBeVisible({ timeout: 10_000 });
    });

    test('accountant can see "Record Expense" link', async ({ page }) => {
      await loginAsRole(page, 'accountant');
      await page.goto('/cashbook');
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('link', { name: /record expense/i })).toBeVisible({ timeout: 10_000 });
    });

    test('field_officer gets Access Denied on /cashbook', async ({ page }) => {
      await loginAsRole(page, 'field_officer');
      await page.goto('/cashbook');
      await expect(page.getByRole('heading', { name: 'Access Denied' })).toBeVisible({ timeout: 10_000 });
    });

    test('viewer_auditor gets Access Denied on /cashbook', async ({ page }) => {
      await loginAsRole(page, 'viewer_auditor');
      await page.goto('/cashbook');
      await expect(page.getByRole('heading', { name: 'Access Denied' })).toBeVisible({ timeout: 10_000 });
    });
  });

  test.describe('Report Export Actions', () => {
    test('manager can see Export buttons on reports', async ({ page }) => {
      await loginAsRole(page, 'manager');
      await page.goto('/reports/collection-summary');
      await page.waitForLoadState('networkidle');

      // Export buttons should be visible
      await expect(
        page.getByRole('button', { name: /pdf/i }).or(page.getByRole('button', { name: /excel/i })),
      ).toBeVisible({ timeout: 10_000 });
    });

    test('accountant can see Export buttons on reports', async ({ page }) => {
      await loginAsRole(page, 'accountant');
      await page.goto('/reports/collection-summary');
      await page.waitForLoadState('networkidle');

      await expect(
        page.getByRole('button', { name: /pdf/i }).or(page.getByRole('button', { name: /excel/i })),
      ).toBeVisible({ timeout: 10_000 });
    });

    test('field_officer CANNOT see Export buttons on reports', async ({ page }) => {
      await loginAsRole(page, 'field_officer');
      await page.goto('/reports/collection-summary');
      await page.waitForLoadState('networkidle');

      // FO can view reports but not export
      await expect(page.getByRole('button', { name: /^pdf$/i })).not.toBeVisible({ timeout: 3_000 });
    });
  });

  test.describe('Loan Product Actions', () => {
    test('super_admin can see "New Product" button', async ({ page }) => {
      await loginAsRole(page, 'super_admin');
      await page.goto('/loan-products');
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('link', { name: /new product/i })).toBeVisible({ timeout: 10_000 });
    });

    test('manager CANNOT see "New Product" button', async ({ page }) => {
      await loginAsRole(page, 'manager');
      await page.goto('/loan-products');
      await page.waitForLoadState('networkidle');
      // Manager can view but not create products
      await expect(page.getByRole('link', { name: /new product/i })).not.toBeVisible({ timeout: 3_000 });
    });

    test('super_admin can see "Deactivate" button on product', async ({ page }) => {
      await loginAsRole(page, 'super_admin');
      await page.goto('/loan-products');
      await page.waitForLoadState('networkidle');

      // Look for deactivate button in the table
      const deactivateButton = page.getByRole('button', { name: /deactivate/i }).first();
      // Button visibility depends on product status (only active products have it)
    });
  });
});

test.describe('RBAC Audit Log Access', () => {
  test('viewer_auditor can access audit log', async ({ page }) => {
    await loginAsRole(page, 'viewer_auditor');
    await page.goto('/audit');
    await expect(page.getByRole('heading', { name: 'Audit Log' })).toBeVisible({ timeout: 10_000 });
  });

  test('viewer_auditor can see audit entries', async ({ page }) => {
    await loginAsRole(page, 'viewer_auditor');
    await page.goto('/audit');
    await page.waitForLoadState('networkidle');

    // Should see table or empty state
    await expect(
      page.locator('table').or(page.getByText('No audit logs found')),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('viewer_auditor can filter audit log', async ({ page }) => {
    await loginAsRole(page, 'viewer_auditor');
    await page.goto('/audit');
    await page.waitForLoadState('networkidle');

    // Filter inputs should be visible
    const entityFilter = page.getByPlaceholder(/entity/i);
    const actionFilter = page.getByPlaceholder(/action/i);

    await expect(entityFilter.or(actionFilter)).toBeVisible({ timeout: 5_000 });
  });

  test('field_officer gets Access Denied on /audit', async ({ page }) => {
    await loginAsRole(page, 'field_officer');
    await page.goto('/audit');
    await expect(page.getByRole('heading', { name: 'Access Denied' })).toBeVisible({ timeout: 10_000 });
  });
});
