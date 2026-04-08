import { test, expect } from '@playwright/test';

/**
 * Dashboard — Playwright E2E Tests
 *
 * Uses the default `page` which is pre-authenticated as manager
 * via storageState in playwright.config.ts (desktop-chrome project).
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
  test('dashboard loads with KPI cards', async ({ page }) => {
    // Navigate to dashboard (page is pre-authenticated as manager)
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Verify the dashboard heading
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 20_000 });

    // Verify KPI cards are present
    await expect(page.getByText('Total Outstanding')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Today's Collections")).toBeVisible();
    await expect(page.getByText('Overdue Loans')).toBeVisible();
    await expect(page.getByText('Active Loans')).toBeVisible();
    await expect(page.getByText('Total Customers')).toBeVisible();
  });

  test('KPI values match expected data from API', async ({ page }) => {
    // Fetch dashboard data from the API
    const token = await getToken(MANAGER_USERNAME, MANAGER_PASSWORD);
    const apiRes = await fetch(`${API_BASE}/dashboard`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const kpis = await apiRes.json();

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 20_000 });

    // Verify the KPI values match
    await expect(page.getByText('Total Customers').locator('..').locator('..')).toContainText(
      String(kpis.totalCustomers),
    );
    await expect(page.getByText('Active Loans').locator('..').locator('..')).toContainText(
      String(kpis.activeLoans),
    );
  });

  test('overdue loans card navigates to loans page', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 20_000 });

    // Click on the Overdue Loans card
    const overdueCard = page.getByText('Overdue Loans').locator('..').locator('..');
    await expect(overdueCard).toBeVisible();
    await overdueCard.click();

    // Should navigate to loans page
    await page.waitForURL('**/loans**', { timeout: 15_000 });
    await expect(page.locator('table').or(page.getByRole('heading', { name: /loans/i }))).toBeVisible({
      timeout: 15_000,
    });
  });
});
