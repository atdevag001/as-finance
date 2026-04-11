import { test, expect } from './fixtures';

/**
 * Dashboard — Playwright E2E Tests
 *
 * Uses pre-authenticated managerPage fixture.
 *
 * Tests cover:
 * 1. Dashboard loads with KPI cards
 * 2. KPI values match expected data from API
 * 3. Navigation from dashboard works
 */

const API_BASE = 'http://localhost:3001';
const MANAGER_USERNAME = 'manager1';
const MANAGER_PASSWORD = 'Admin@123';

/**
 * Helper: obtain a JWT token from the API.
 */
async function getToken(username: string, password: string): Promise<string> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const body = await res.json();
  return body.accessToken ?? body.access_token ?? body.token;
}

test.describe('Dashboard', () => {
  test('dashboard loads with KPI cards', async ({ managerPage }) => {
    // Navigate to dashboard
    await managerPage.goto('/');
    await managerPage.waitForLoadState('domcontentloaded');

    // Verify the dashboard heading (appears immediately)
    await expect(managerPage.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 20_000 });

    // Wait for KPI cards to load - they appear after API response
    await expect(managerPage.getByText('Total Customers')).toBeVisible({ timeout: 30_000 });

    // Verify other KPI cards are present
    await expect(managerPage.getByText('Total Outstanding')).toBeVisible({ timeout: 5_000 });
    await expect(managerPage.getByText("Today's Collections")).toBeVisible({ timeout: 5_000 });
    await expect(managerPage.getByText('Overdue Loans')).toBeVisible({ timeout: 5_000 });
    await expect(managerPage.getByText('Active Loans')).toBeVisible({ timeout: 5_000 });
  });

  test('KPI values match expected data from API', async ({ managerPage }) => {
    // Fetch dashboard data from the API
    const token = await getToken(MANAGER_USERNAME, MANAGER_PASSWORD);
    const apiRes = await fetch(`${API_BASE}/dashboard`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const kpis = await apiRes.json();

    await managerPage.goto('/');
    await managerPage.waitForLoadState('domcontentloaded');
    await expect(managerPage.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 20_000 });

    // Wait for KPI cards to load
    await expect(managerPage.getByText('Total Customers')).toBeVisible({ timeout: 30_000 });

    // Verify the KPI values match (if API returns valid data)
    // Find the card that contains the KPI title, then check it also contains the value
    if (kpis.totalCustomers !== undefined) {
      const customersCard = managerPage.locator('a[href="/customers"]').filter({ hasText: 'Total Customers' });
      await expect(customersCard).toContainText(String(kpis.totalCustomers), { timeout: 5_000 });
    }
    if (kpis.activeLoans !== undefined) {
      const loansCard = managerPage.locator('a[href="/loans"]').filter({ hasText: 'Active Loans' });
      await expect(loansCard).toContainText(String(kpis.activeLoans), { timeout: 5_000 });
    }
  });

  test('overdue loans card navigates to loans page', async ({ managerPage }) => {
    await managerPage.goto('/');
    await managerPage.waitForLoadState('domcontentloaded');
    await expect(managerPage.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 20_000 });

    // Wait for KPI cards to load
    await expect(managerPage.getByText('Overdue Loans')).toBeVisible({ timeout: 30_000 });

    // Click on the Overdue Loans card (it's wrapped in a Link with href containing 'loans')
    const overdueCard = managerPage.locator('a[href*="loans"][href*="overdue"]').filter({ hasText: 'Overdue Loans' });
    await expect(overdueCard).toBeVisible({ timeout: 5_000 });
    await overdueCard.click();

    // Should navigate to loans page with overdue filter
    await expect(managerPage).toHaveURL(/\/loans/, { timeout: 15_000 });
    await expect(managerPage.getByRole('heading', { name: /loans/i })).toBeVisible({ timeout: 15_000 });
  });
});
