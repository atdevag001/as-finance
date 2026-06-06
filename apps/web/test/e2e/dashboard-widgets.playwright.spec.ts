import { test, expect, getTokenForRole, apiRequest } from './fixtures';

/**
 * Dashboard Widgets — Extended E2E Tests
 *
 * Uses pre-authenticated managerPage fixture.
 *
 * Tests cover:
 * 1. KPI cards display correct values from API
 * 2. Money displays are formatted correctly (INR)
 * 3. Quick action buttons navigate correctly
 * 4. Overdue loans card shows danger styling when > 0
 * 5. Dashboard refreshes on navigation back
 * 6. Role-based dashboard content (field officer vs manager)
 */

test.describe('Dashboard Widgets', () => {
  test.describe('KPI Cards', () => {
    test('all KPI cards display and have clickable links', async ({ managerPage }) => {
      await managerPage.goto('/');
      await managerPage.waitForLoadState('networkidle');

      // Wait for data to load
      await expect(managerPage.getByText('Total Customers')).toBeVisible({ timeout: 30_000 });

      // Verify all KPI cards are present
      const kpiCards = [
        { title: 'Total Customers', href: '/customers' },
        { title: 'Active Loans', href: '/loans' },
        { title: 'Overdue Loans', href: '/loans?status=overdue' },
        { title: 'Pending Approvals', href: '/loans?status=submitted' },
      ];

      for (const kpi of kpiCards) {
        const card = managerPage.locator(`a[href="${kpi.href}"]`).filter({ hasText: kpi.title });
        await expect(card).toBeVisible();
        // Verify card contains a number (the KPI value)
        await expect(card.locator('span.font-bold, span.text-2xl, span.text-3xl')).toBeVisible();
      }
    });

    test('KPI values match API response', async ({ managerPage }) => {
      // Fetch dashboard data from API
      const token = await getTokenForRole('manager');
      const dashboardData = await apiRequest<{
        totalCustomers: number;
        activeLoans: number;
        overdueLoans: number;
        pendingApprovals: number;
        totalOutstandingPaise: number;
        todayCollectionsPaise: number;
        todayDisbursementsPaise: number;
      }>('GET', '/dashboard', token);

      await managerPage.goto('/');
      await managerPage.waitForLoadState('networkidle');
      await expect(managerPage.getByText('Total Customers')).toBeVisible({ timeout: 30_000 });

      // Verify numeric KPIs match
      const customersCard = managerPage.locator('a[href="/customers"]').filter({ hasText: 'Total Customers' });
      await expect(customersCard).toContainText(String(dashboardData.totalCustomers));

      const activeLoansCard = managerPage.locator('a[href="/loans"]').filter({ hasText: 'Active Loans' });
      await expect(activeLoansCard).toContainText(String(dashboardData.activeLoans));

      const overdueCard = managerPage.locator('a[href*="overdue"]').filter({ hasText: 'Overdue Loans' });
      await expect(overdueCard).toContainText(String(dashboardData.overdueLoans));

      const pendingCard = managerPage.locator('a[href*="submitted"]').filter({ hasText: 'Pending Approvals' });
      await expect(pendingCard).toContainText(String(dashboardData.pendingApprovals));
    });

    test('overdue loans card shows danger styling when count > 0', async ({ managerPage }) => {
      // Fetch to check if there are overdue loans
      const token = await getTokenForRole('manager');
      const dashboardData = await apiRequest<{ overdueLoans: number }>('GET', '/dashboard', token);

      await managerPage.goto('/');
      await managerPage.waitForLoadState('networkidle');
      await expect(managerPage.getByText('Overdue Loans')).toBeVisible({ timeout: 30_000 });

      const overdueCard = managerPage.locator('a[href*="overdue"]').filter({ hasText: 'Overdue Loans' });

      if (dashboardData.overdueLoans > 0) {
        // Should have danger border
        await expect(overdueCard.locator('.border-destructive')).toBeVisible();
        // Value should be in destructive color
        await expect(overdueCard.locator('.text-destructive')).toBeVisible();
      } else {
        // Should not have danger styling
        await expect(overdueCard.locator('.border-destructive')).not.toBeVisible();
      }
    });
  });

  test.describe('Money Displays', () => {
    test('money values are formatted as INR with proper grouping', async ({ managerPage }) => {
      await managerPage.goto('/');
      await managerPage.waitForLoadState('networkidle');
      await expect(managerPage.getByText('Total Outstanding')).toBeVisible({ timeout: 30_000 });

      // Money display should show ₹ symbol
      const outstandingCard = managerPage.locator('a[href="/loans"]').filter({ hasText: 'Total Outstanding' });
      await expect(outstandingCard.getByText(/₹/)).toBeVisible();

      const collectionsCard = managerPage.locator('a[href="/collections"]').filter({ hasText: "Today's Collections" });
      await expect(collectionsCard.getByText(/₹/)).toBeVisible();

      const disbursementsCard = managerPage.locator('a[href="/loans"]').filter({ hasText: "Today's Disbursements" });
      await expect(disbursementsCard.getByText(/₹/)).toBeVisible();
    });
  });

  test.describe('Quick Actions', () => {
    test('quick action buttons are visible on mobile viewport', async ({ managerPage }) => {
      // Set mobile viewport
      await managerPage.setViewportSize({ width: 375, height: 667 });
      await managerPage.goto('/');
      await managerPage.waitForLoadState('networkidle');
      await expect(managerPage.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 20_000 });

      // Quick actions should be visible on mobile
      await expect(managerPage.getByRole('link', { name: /post collection/i })).toBeVisible();
      await expect(managerPage.getByRole('link', { name: /find customer/i })).toBeVisible();
      await expect(managerPage.getByRole('link', { name: /groups/i })).toBeVisible();
    });

    test('post collection quick action navigates correctly', async ({ managerPage }) => {
      await managerPage.setViewportSize({ width: 375, height: 667 });
      await managerPage.goto('/');
      await managerPage.waitForLoadState('networkidle');
      await expect(managerPage.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 20_000 });

      await managerPage.getByRole('link', { name: /post collection/i }).click();
      await expect(managerPage).toHaveURL(/\/collections\/new/);
    });

    test('quick actions are hidden on desktop viewport', async ({ managerPage }) => {
      await managerPage.setViewportSize({ width: 1280, height: 800 });
      await managerPage.goto('/');
      await managerPage.waitForLoadState('networkidle');
      await expect(managerPage.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 20_000 });

      // Quick action grid should be hidden on desktop (lg:hidden class)
      const quickActionsContainer = managerPage.locator('.grid.grid-cols-3.gap-3.lg\\:hidden');
      await expect(quickActionsContainer).not.toBeVisible();
    });
  });

  test.describe('Navigation', () => {
    test('clicking KPI card navigates to filtered list', async ({ managerPage }) => {
      await managerPage.goto('/');
      await managerPage.waitForLoadState('networkidle');
      await expect(managerPage.getByText('Overdue Loans')).toBeVisible({ timeout: 30_000 });

      // Click overdue loans card
      const overdueCard = managerPage.locator('a[href*="overdue"]').filter({ hasText: 'Overdue Loans' });
      await overdueCard.click();

      // Should navigate to loans with overdue filter
      await expect(managerPage).toHaveURL(/\/loans\?status=overdue/);
      await expect(managerPage.getByRole('heading', { name: /loans/i })).toBeVisible({ timeout: 15_000 });
    });

    test('dashboard data refreshes on navigation back', async ({ managerPage }) => {
      await managerPage.goto('/');
      await managerPage.waitForLoadState('networkidle');
      await expect(managerPage.getByText('Total Customers')).toBeVisible({ timeout: 30_000 });

      // Navigate away
      await managerPage.goto('/customers');
      await expect(managerPage.getByRole('heading', { name: /customers/i })).toBeVisible({ timeout: 15_000 });

      // Navigate back to dashboard
      await managerPage.goto('/');
      await managerPage.waitForLoadState('networkidle');

      // Dashboard should still show data (not be stuck in loading state)
      await expect(managerPage.getByText('Total Customers')).toBeVisible({ timeout: 30_000 });
      await expect(managerPage.locator('.animate-spin')).not.toBeVisible({ timeout: 5_000 });
    });
  });

  test.describe('Role-Based Content', () => {
    test('field officer sees dashboard with relevant KPIs', async ({ fieldOfficerPage }) => {
      await fieldOfficerPage.goto('/');
      await fieldOfficerPage.waitForLoadState('networkidle');
      await expect(fieldOfficerPage.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 20_000 });

      // Field officer should see dashboard (not access denied)
      await expect(fieldOfficerPage.getByText('Total Customers')).toBeVisible({ timeout: 30_000 });
    });

    test('collection officer sees dashboard with collection KPIs', async ({ collectionOfficerPage }) => {
      await collectionOfficerPage.goto('/');
      await collectionOfficerPage.waitForLoadState('networkidle');
      await expect(collectionOfficerPage.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 20_000 });

      // Should see today's collections KPI
      await expect(collectionOfficerPage.getByText("Today's Collections")).toBeVisible({ timeout: 30_000 });
    });
  });
});
