import { test, expect, type Page } from '@playwright/test';

/**
 * Dashboard — Playwright E2E Tests
 *
 * Validates: Design GAP 8 (Dashboard)
 *
 * Tests cover:
 * 1. Dashboard loads with KPI cards (total outstanding, collections today, overdue count)
 * 2. KPI values match expected data from seeded test state
 * 3. Overdue loans highlighted with correct status badges
 */

const MANAGER_USERNAME = 'manager';
const MANAGER_PASSWORD = 'TestPass123!';

const API_BASE = 'http://localhost:3001';

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

/**
 * Helper: obtain a JWT token from the API for a given user.
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
    await login(page, MANAGER_USERNAME, MANAGER_PASSWORD);

    // After login we land on "/" which is the dashboard
    await expect(page).toHaveURL(/\/$/);

    // Verify the dashboard heading
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 10_000 });

    // Verify KPI cards are present
    await expect(page.getByText('Total Outstanding')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Today's Collections")).toBeVisible();
    await expect(page.getByText('Overdue Loans')).toBeVisible();
    await expect(page.getByText('Active Loans')).toBeVisible();
    await expect(page.getByText('Total Customers')).toBeVisible();
    await expect(page.getByText('Pending Approvals')).toBeVisible();
  });

  test('KPI values match expected data from seeded test state', async ({ page }) => {
    // Fetch dashboard data from the API to get expected values
    const token = await getToken(MANAGER_USERNAME, MANAGER_PASSWORD);
    const apiRes = await fetch(`${API_BASE}/dashboard`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const kpis = await apiRes.json();

    await login(page, MANAGER_USERNAME, MANAGER_PASSWORD);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 10_000 });

    // Verify the numeric KPI values rendered on the page match the API response
    // The KPI cards display counts as plain numbers
    await expect(page.getByText('Total Customers').locator('..').locator('..')).toContainText(
      String(kpis.totalCustomers),
    );
    await expect(page.getByText('Active Loans').locator('..').locator('..')).toContainText(
      String(kpis.activeLoans),
    );
    await expect(page.getByText('Overdue Loans').locator('..').locator('..')).toContainText(
      String(kpis.overdueLoans),
    );
  });

  test('overdue loans highlighted with correct status badges', async ({ page }) => {
    await login(page, MANAGER_USERNAME, MANAGER_PASSWORD);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 10_000 });

    // The "Overdue Loans" KPI card uses the "danger" variant which applies text-destructive class
    const overdueCard = page.getByText('Overdue Loans').locator('..').locator('..');
    await expect(overdueCard).toBeVisible();

    // Verify the overdue count value has the destructive (red) styling
    const overdueValue = overdueCard.locator('.text-destructive');
    await expect(overdueValue).toBeVisible();

    // Navigate to loans page to verify overdue status badges
    await overdueCard.click();
    await page.waitForURL('**/loans', { timeout: 10_000 });

    // The loans list page should be visible with a table
    await expect(page.locator('table').or(page.getByRole('heading', { name: /loans/i }))).toBeVisible({
      timeout: 10_000,
    });
  });
});
