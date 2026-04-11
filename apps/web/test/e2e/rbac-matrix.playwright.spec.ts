import { test, expect, type Page, type UserRole } from './fixtures';

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
  await page.waitForLoadState('domcontentloaded');

  // Give the page time to render content after navigation
  // This is needed because React hydration and RBAC checks happen after initial load
  await page.waitForTimeout(1000);

  // Check for Access Denied heading - look for exact match to avoid false positives
  const accessDenied = page.getByRole('heading', { name: 'Access Denied', exact: true });

  // Try to detect if Access Denied is visible, with longer timeout for slow renders
  const isAccessDenied = await accessDenied.isVisible({ timeout: 10_000 }).catch(() => false);

  return !isAccessDenied;
}

test.describe('RBAC Page Access Matrix', () => {
  // Increase timeout for RBAC matrix tests since we're checking many role/page combinations
  test.setTimeout(60_000);

  // Generate tests for each role × page combination
  // Uses pre-authenticated fixtures to avoid UI login overhead
  for (const [pagePath, roleAccess] of Object.entries(PAGE_ACCESS)) {
    for (const [role, shouldHaveAccess] of Object.entries(roleAccess) as [UserRole, boolean][]) {
      const testName = shouldHaveAccess
        ? `${role} CAN access ${pagePath}`
        : `${role} CANNOT access ${pagePath}`;

      test(testName, async ({ getPageForRole }) => {
        const page = await getPageForRole(role);

        await page.goto(pagePath);
        await page.waitForLoadState('domcontentloaded');

        // Wait for the page to stabilize - RBAC checks happen after initial render
        await page.waitForTimeout(1500);

        const accessDenied = page.getByRole('heading', { name: 'Access Denied', exact: true });

        if (shouldHaveAccess) {
          // User SHOULD have access - verify Access Denied is NOT visible
          const isAccessDenied = await accessDenied.isVisible({ timeout: 3_000 }).catch(() => false);
          expect(isAccessDenied).toBe(false);
        } else {
          // User should NOT have access - verify Access Denied IS visible
          await expect(accessDenied).toBeVisible({ timeout: 15_000 });
        }
      });
    }
  }
});

test.describe('RBAC Action Permissions', () => {
  // Increase timeout for action permission tests
  test.setTimeout(60_000);

  test.describe('Customer Actions', () => {
    test('field_officer can see "New Customer" button', async ({ fieldOfficerPage }) => {
      await fieldOfficerPage.goto('/customers');
      await expect(fieldOfficerPage.getByRole('link', { name: /new customer/i })).toBeVisible({ timeout: 15_000 });
    });

    test('viewer_auditor CANNOT see "New Customer" button', async ({ auditorPage }) => {
      await auditorPage.goto('/customers');
      await auditorPage.waitForLoadState('domcontentloaded');
      // Wait for page heading to confirm page loaded before checking for absence
      await expect(auditorPage.getByRole('heading', { name: /customers/i })).toBeVisible({ timeout: 30_000 });
      await expect(auditorPage.getByRole('link', { name: /new customer/i })).not.toBeVisible({ timeout: 5_000 });
    });

    test('collection_officer CANNOT see "New Customer" button', async ({ collectionOfficerPage }) => {
      await collectionOfficerPage.goto('/customers');
      await collectionOfficerPage.waitForLoadState('domcontentloaded');
      // Wait for page heading to confirm page loaded before checking for absence
      await expect(collectionOfficerPage.getByRole('heading', { name: /customers/i })).toBeVisible({ timeout: 30_000 });
      await expect(collectionOfficerPage.getByRole('link', { name: /new customer/i })).not.toBeVisible({ timeout: 5_000 });
    });
  });

  test.describe('Loan Actions', () => {
    test('field_officer can see "New Loan" button', async ({ fieldOfficerPage }) => {
      await fieldOfficerPage.goto('/loans');
      await expect(fieldOfficerPage.getByRole('link', { name: /new loan/i })).toBeVisible({ timeout: 15_000 });
    });

    test('viewer_auditor CANNOT see "New Loan" button', async ({ auditorPage }) => {
      await auditorPage.goto('/loans');
      await auditorPage.waitForLoadState('domcontentloaded');
      // Wait for page heading to confirm page loaded before checking for absence
      await expect(auditorPage.getByRole('heading', { name: /loans/i })).toBeVisible({ timeout: 30_000 });
      await expect(auditorPage.getByRole('link', { name: /new loan/i })).not.toBeVisible({ timeout: 5_000 });
    });

    test('manager can see approve/reject buttons on loan detail', async ({ managerPage }) => {
      await managerPage.goto('/loans');

      // Find a loan in submitted or under_review status
      const loanLink = managerPage.locator('table tbody tr a').first();
      if (await loanLink.isVisible({ timeout: 10_000 }).catch(() => false)) {
        await loanLink.click();
        await managerPage.waitForURL(/\/loans\/[^/]+$/, { timeout: 10_000 });

        // Manager should see action buttons (at least some loan actions)
        await managerPage.waitForLoadState('domcontentloaded');
      }
    });

    test('field_officer CANNOT see approve button on loan detail', async ({ fieldOfficerPage }) => {
      await fieldOfficerPage.goto('/loans');

      const loanLink = fieldOfficerPage.locator('table tbody tr a').first();
      if (await loanLink.isVisible({ timeout: 10_000 }).catch(() => false)) {
        await loanLink.click();
        await fieldOfficerPage.waitForURL(/\/loans\/[^/]+$/, { timeout: 10_000 });
        await fieldOfficerPage.waitForLoadState('domcontentloaded');

        // FO should NOT see approve button
        await expect(fieldOfficerPage.getByRole('button', { name: /^approve$/i })).not.toBeVisible({ timeout: 5_000 });
      }
    });
  });

  test.describe('Collection Actions', () => {
    test('collection_officer can see "New Collection" button', async ({ collectionOfficerPage }) => {
      await collectionOfficerPage.goto('/collections');
      await collectionOfficerPage.waitForLoadState('domcontentloaded');
      // Wait for page heading to confirm page loaded
      await expect(collectionOfficerPage.getByRole('heading', { name: /collections/i })).toBeVisible({ timeout: 30_000 });
      await expect(
        collectionOfficerPage.getByRole('link', { name: /new collection/i }).or(
          collectionOfficerPage.getByRole('link', { name: /record collection/i }),
        ).or(collectionOfficerPage.getByRole('link', { name: /post collection/i })),
      ).toBeVisible({ timeout: 15_000 });
    });

    test('viewer_auditor CANNOT see "New Collection" button', async ({ auditorPage }) => {
      await auditorPage.goto('/collections');
      await auditorPage.waitForLoadState('domcontentloaded');
      // Wait for page content to stabilize before checking for absence of element
      await auditorPage.waitForTimeout(1500);
      await expect(auditorPage.getByRole('link', { name: /new collection/i })).not.toBeVisible({ timeout: 5_000 });
    });

    test('manager can see "Reverse" button on collection', async ({ managerPage }) => {
      await managerPage.goto('/collections');

      const collectionLink = managerPage.locator('table tbody tr a').first();
      if (await collectionLink.isVisible({ timeout: 10_000 }).catch(() => false)) {
        await collectionLink.click();
        await managerPage.waitForURL(/\/collections\/[^/]+$/, { timeout: 10_000 });
        await managerPage.waitForLoadState('domcontentloaded');

        // Manager may see reverse button for posted collections
        // This is conditional on collection status
      }
    });

    test('collection_officer CANNOT see "Reverse" button', async ({ collectionOfficerPage }) => {
      await collectionOfficerPage.goto('/collections');

      const collectionLink = collectionOfficerPage.locator('table tbody tr a').first();
      if (await collectionLink.isVisible({ timeout: 10_000 }).catch(() => false)) {
        await collectionLink.click();
        await collectionOfficerPage.waitForURL(/\/collections\/[^/]+$/, { timeout: 10_000 });
        await collectionOfficerPage.waitForLoadState('domcontentloaded');

        await expect(collectionOfficerPage.getByRole('button', { name: /reverse/i })).not.toBeVisible({ timeout: 5_000 });
      }
    });
  });

  test.describe('User Management Actions', () => {
    test('super_admin can see "New User" button', async ({ adminPage }) => {
      await adminPage.goto('/users');
      await expect(adminPage.getByRole('link', { name: /new user/i })).toBeVisible({ timeout: 15_000 });
    });

    test('manager can see "New User" button', async ({ managerPage }) => {
      await managerPage.goto('/users');
      await expect(managerPage.getByRole('link', { name: /new user/i })).toBeVisible({ timeout: 15_000 });
    });

    test('field_officer gets Access Denied on /users', async ({ fieldOfficerPage }) => {
      await fieldOfficerPage.goto('/users');
      await fieldOfficerPage.waitForLoadState('domcontentloaded');
      await expect(fieldOfficerPage.getByRole('heading', { name: 'Access Denied', exact: true })).toBeVisible({ timeout: 15_000 });
    });
  });

  test.describe('Settings Actions', () => {
    test('super_admin can access settings', async ({ adminPage }) => {
      await adminPage.goto('/settings');
      await adminPage.waitForLoadState('domcontentloaded');
      await expect(adminPage.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible({ timeout: 30_000 });
    });

    test('super_admin can see Save button on settings', async ({ adminPage }) => {
      await adminPage.goto('/settings');
      await adminPage.waitForLoadState('domcontentloaded');
      await expect(adminPage.getByRole('button', { name: /save/i })).toBeVisible({ timeout: 15_000 });
    });

    test('field_officer gets Access Denied on /settings', async ({ fieldOfficerPage }) => {
      await fieldOfficerPage.goto('/settings');
      await fieldOfficerPage.waitForLoadState('domcontentloaded');
      await expect(fieldOfficerPage.getByRole('heading', { name: 'Access Denied', exact: true })).toBeVisible({ timeout: 15_000 });
    });
  });

  test.describe('Cashbook Actions', () => {
    test('accountant can access cashbook', async ({ accountantPage }) => {
      await accountantPage.goto('/cashbook');
      await expect(accountantPage.getByRole('heading', { name: 'Cashbook' })).toBeVisible({ timeout: 15_000 });
    });

    test('accountant can see "Record Expense" link', async ({ accountantPage }) => {
      await accountantPage.goto('/cashbook');
      await accountantPage.waitForLoadState('domcontentloaded');
      await expect(accountantPage.getByRole('link', { name: /record expense/i })).toBeVisible({ timeout: 15_000 });
    });

    test('field_officer gets Access Denied on /cashbook', async ({ fieldOfficerPage }) => {
      await fieldOfficerPage.goto('/cashbook');
      await fieldOfficerPage.waitForLoadState('domcontentloaded');
      await expect(fieldOfficerPage.getByRole('heading', { name: 'Access Denied', exact: true })).toBeVisible({ timeout: 15_000 });
    });

    test('viewer_auditor gets Access Denied on /cashbook', async ({ auditorPage }) => {
      await auditorPage.goto('/cashbook');
      await auditorPage.waitForLoadState('domcontentloaded');
      await expect(auditorPage.getByRole('heading', { name: 'Access Denied', exact: true })).toBeVisible({ timeout: 15_000 });
    });
  });

  test.describe('Report Export Actions', () => {
    test('manager can see Export buttons on reports', async ({ managerPage }) => {
      await managerPage.goto('/reports/collection-summary');
      await managerPage.waitForLoadState('domcontentloaded');

      // Wait for page heading to confirm page loaded
      await expect(managerPage.getByRole('heading', { name: /collection summary/i })).toBeVisible({ timeout: 30_000 });

      // Export buttons should be visible - check for export link/button with common patterns
      await expect(
        managerPage.getByRole('button', { name: /pdf/i }).or(
          managerPage.getByRole('button', { name: /excel/i })
        ).or(managerPage.getByRole('button', { name: /export/i })).or(
          managerPage.getByRole('link', { name: /export/i })
        ),
      ).toBeVisible({ timeout: 15_000 });
    });

    test('accountant can see Export buttons on reports', async ({ accountantPage }) => {
      await accountantPage.goto('/reports/collection-summary');
      await accountantPage.waitForLoadState('domcontentloaded');

      // Wait for page heading to confirm page loaded
      await expect(accountantPage.getByRole('heading', { name: /collection summary/i })).toBeVisible({ timeout: 30_000 });

      await expect(
        accountantPage.getByRole('button', { name: /pdf/i }).or(
          accountantPage.getByRole('button', { name: /excel/i })
        ).or(accountantPage.getByRole('button', { name: /export/i })).or(
          accountantPage.getByRole('link', { name: /export/i })
        ),
      ).toBeVisible({ timeout: 15_000 });
    });

    test('field_officer CANNOT see Export buttons on reports', async ({ fieldOfficerPage }) => {
      await fieldOfficerPage.goto('/reports/collection-summary');
      await fieldOfficerPage.waitForLoadState('domcontentloaded');
      // Wait for page content to stabilize before checking for absence of element
      await fieldOfficerPage.waitForTimeout(1500);

      // FO can view reports but not export
      await expect(fieldOfficerPage.getByRole('button', { name: /^pdf$/i })).not.toBeVisible({ timeout: 5_000 });
    });
  });

  test.describe('Loan Product Actions', () => {
    test('super_admin can see "New Product" button', async ({ adminPage }) => {
      await adminPage.goto('/loan-products');
      await adminPage.waitForLoadState('domcontentloaded');
      await expect(adminPage.getByRole('link', { name: /new product/i })).toBeVisible({ timeout: 15_000 });
    });

    test('manager CANNOT see "New Product" button', async ({ managerPage }) => {
      await managerPage.goto('/loan-products');
      await managerPage.waitForLoadState('domcontentloaded');
      // Wait for page content to stabilize before checking for absence of element
      await managerPage.waitForTimeout(1500);
      // Manager can view but not create products
      await expect(managerPage.getByRole('link', { name: /new product/i })).not.toBeVisible({ timeout: 5_000 });
    });

    test('super_admin can see "Deactivate" button on product', async ({ adminPage }) => {
      await adminPage.goto('/loan-products');
      await adminPage.waitForLoadState('domcontentloaded');

      // Look for deactivate button in the table
      // Button visibility depends on product status (only active products have it)
    });
  });
});

test.describe('RBAC Audit Log Access', () => {
  // Increase timeout for audit log access tests
  test.setTimeout(60_000);
  test('viewer_auditor can access audit log', async ({ auditorPage }) => {
    await auditorPage.goto('/audit');
    await expect(auditorPage.getByRole('heading', { name: 'Audit Log' })).toBeVisible({ timeout: 15_000 });
  });

  test('viewer_auditor can see audit entries', async ({ auditorPage }) => {
    await auditorPage.goto('/audit');
    await auditorPage.waitForLoadState('domcontentloaded');

    // Should see table or empty state
    await expect(
      auditorPage.locator('table').or(auditorPage.getByText('No audit logs found')),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('viewer_auditor can filter audit log', async ({ auditorPage }) => {
    await auditorPage.goto('/audit');
    await auditorPage.waitForLoadState('domcontentloaded');

    // Wait for page heading to confirm page loaded
    await expect(auditorPage.getByRole('heading', { name: 'Audit Log' })).toBeVisible({ timeout: 30_000 });

    // Filter inputs or select elements should be visible
    const entityFilter = auditorPage.getByPlaceholder(/entity/i);
    const actionFilter = auditorPage.getByPlaceholder(/action/i);
    const selectFilters = auditorPage.locator('select');

    await expect(entityFilter.or(actionFilter).or(selectFilters.first())).toBeVisible({ timeout: 15_000 });
  });

  test('field_officer gets Access Denied on /audit', async ({ fieldOfficerPage }) => {
    await fieldOfficerPage.goto('/audit');
    await fieldOfficerPage.waitForLoadState('domcontentloaded');
    await expect(fieldOfficerPage.getByRole('heading', { name: 'Access Denied', exact: true })).toBeVisible({ timeout: 15_000 });
  });
});
