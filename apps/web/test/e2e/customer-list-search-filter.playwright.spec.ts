import { test, expect, getTokenForRole, apiRequest, createTestCustomer } from './fixtures';

/**
 * Customers List — Search + Status Filter E2E Tests
 *
 * Covers the gap on /customers where the debounced name/mobile search box
 * and the Active/Blacklisted status <select> were never exercised.
 *
 * Patterns:
 * - Seed two customers via API (one Active, one Blacklisted) so the tests are
 *   self-contained and don't depend on existing DB rows.
 * - Use managerPage (unrestricted role) so seeded customers are visible
 *   regardless of assigned_officer_id scoping.
 * - Debounce on the search input is 300ms; we wait on the network response
 *   for /customers?search=… rather than racing a fixed sleep.
 */

// Unique suffix shared across this file so the names are stable per-run
// and we can search for them without colliding with other seeded data.
const RUN_ID = Date.now().toString().slice(-8);
const RAND = Math.floor(Math.random() * 10000).toString().padStart(4, '0');

// Pre-computed unique tokens we can search for.
// Full name must contain a string that is unlikely to appear in other customers.
const ACTIVE_NAME_TAG = `Zappa${RUN_ID}${RAND}`;
const BLACKLISTED_NAME_TAG = `Quill${RUN_ID}${RAND}`;

// Mobile numbers — Indian format: starts 6-9, exactly 10 digits.
// Both share a prefix so a substring search on the prefix would match both;
// the last 4 digits differ so each can be uniquely searched.
const MOBILE_PREFIX = `9${RUN_ID.slice(0, 5)}`; // 6 digits, leaves room for 4
const ACTIVE_MOBILE = `${MOBILE_PREFIX}1234`;
const BLACKLISTED_MOBILE = `${MOBILE_PREFIX}5678`;

let activeCustomerId: string;
let blacklistedCustomerId: string;

test.describe('Customers List — Search & Status Filter', () => {
  test.beforeAll(async () => {
    const token = await getTokenForRole('manager');

    // Seed an Active customer with a unique searchable name + mobile.
    activeCustomerId = await createTestCustomer(token, {
      fullName: `${ACTIVE_NAME_TAG} Active`,
      mobile: ACTIVE_MOBILE,
    });

    // Seed a second customer and blacklist it.
    blacklistedCustomerId = await createTestCustomer(token, {
      fullName: `${BLACKLISTED_NAME_TAG} Target`,
      mobile: BLACKLISTED_MOBILE,
    });

    await apiRequest('POST', `/customers/${blacklistedCustomerId}/blacklist`, token, {
      reason: 'E2E seed — verifying status filter excludes active rows',
    });
  });

  test('search by full name shows only matching rows (debounced)', async ({ managerPage }) => {
    await managerPage.goto('/customers');
    await expect(managerPage.getByRole('heading', { name: /customers/i })).toBeVisible({
      timeout: 30_000,
    });

    const searchInput = managerPage.getByPlaceholder('Search by name or mobile…');
    await expect(searchInput).toBeVisible();

    // Wait for the debounced /customers?search=… request to complete so we
    // assert against the filtered response, not the initial unfiltered render.
    const searchResponse = managerPage.waitForResponse(
      (res) =>
        res.url().includes('/customers') &&
        res.url().includes(`search=${encodeURIComponent(ACTIVE_NAME_TAG)}`) &&
        res.request().method() === 'GET',
      { timeout: 20_000 },
    );

    await searchInput.fill(ACTIVE_NAME_TAG);
    await searchResponse;

    // Matching row is visible — assert via the customer-detail link href so we
    // bind to behavior (the right row rendered), not to incidental text.
    const activeRow = managerPage.locator(`a[href="/customers/${activeCustomerId}"]`);
    await expect(activeRow).toBeVisible({ timeout: 15_000 });
    await expect(activeRow).toContainText(ACTIVE_NAME_TAG);

    // Blacklisted customer's row must NOT appear when searching by Active's name.
    const blacklistedRow = managerPage.locator(`a[href="/customers/${blacklistedCustomerId}"]`);
    await expect(blacklistedRow).toHaveCount(0);
  });

  test('search by mobile substring narrows results to the matching customer', async ({
    managerPage,
  }) => {
    await managerPage.goto('/customers');
    await expect(managerPage.getByRole('heading', { name: /customers/i })).toBeVisible({
      timeout: 30_000,
    });

    const searchInput = managerPage.getByPlaceholder('Search by name or mobile…');

    // Use the unique last-4 of the blacklisted customer's mobile so only they
    // match, even though both seeded customers share the prefix.
    const uniqueMobileFragment = BLACKLISTED_MOBILE.slice(-4); // "5678"

    const searchResponse = managerPage.waitForResponse(
      (res) =>
        res.url().includes('/customers') &&
        res.url().includes(`search=${uniqueMobileFragment}`) &&
        res.request().method() === 'GET',
      { timeout: 20_000 },
    );

    await searchInput.fill(uniqueMobileFragment);
    await searchResponse;

    const blacklistedRow = managerPage.locator(
      `a[href="/customers/${blacklistedCustomerId}"]`,
    );
    await expect(blacklistedRow).toBeVisible({ timeout: 15_000 });

    const activeRow = managerPage.locator(`a[href="/customers/${activeCustomerId}"]`);
    await expect(activeRow).toHaveCount(0);
  });

  test('Blacklisted status filter excludes Active customers', async ({ managerPage }) => {
    await managerPage.goto('/customers');
    await expect(managerPage.getByRole('heading', { name: /customers/i })).toBeVisible({
      timeout: 30_000,
    });

    // Combine status filter with a name search so the assertion is robust
    // against unrelated blacklisted rows that already exist in the DB.
    const searchInput = managerPage.getByPlaceholder('Search by name or mobile…');
    const filteredResponse = managerPage.waitForResponse(
      (res) =>
        res.url().includes('/customers') &&
        res.url().includes('status=blacklisted') &&
        res.url().includes(`search=${RUN_ID}`) &&
        res.request().method() === 'GET',
      { timeout: 20_000 },
    );

    await searchInput.fill(RUN_ID);
    await managerPage.getByLabel('Filter by status').selectOption('blacklisted');
    await filteredResponse;

    // The blacklisted seeded customer must appear.
    const blacklistedRow = managerPage.locator(
      `a[href="/customers/${blacklistedCustomerId}"]`,
    );
    await expect(blacklistedRow).toBeVisible({ timeout: 15_000 });

    // The Active seeded customer must NOT appear under the Blacklisted filter,
    // even though it also matches the RUN_ID name search.
    const activeRow = managerPage.locator(`a[href="/customers/${activeCustomerId}"]`);
    await expect(activeRow).toHaveCount(0);
  });

  test('Active status filter excludes blacklisted customers', async ({ managerPage }) => {
    await managerPage.goto('/customers');
    await expect(managerPage.getByRole('heading', { name: /customers/i })).toBeVisible({
      timeout: 30_000,
    });

    const searchInput = managerPage.getByPlaceholder('Search by name or mobile…');
    const filteredResponse = managerPage.waitForResponse(
      (res) =>
        res.url().includes('/customers') &&
        res.url().includes('status=active') &&
        res.url().includes(`search=${RUN_ID}`) &&
        res.request().method() === 'GET',
      { timeout: 20_000 },
    );

    await searchInput.fill(RUN_ID);
    await managerPage.getByLabel('Filter by status').selectOption('active');
    await filteredResponse;

    const activeRow = managerPage.locator(`a[href="/customers/${activeCustomerId}"]`);
    await expect(activeRow).toBeVisible({ timeout: 15_000 });

    const blacklistedRow = managerPage.locator(
      `a[href="/customers/${blacklistedCustomerId}"]`,
    );
    await expect(blacklistedRow).toHaveCount(0);
  });

  test('search with no matches renders the empty-state message', async ({ managerPage }) => {
    await managerPage.goto('/customers');
    await expect(managerPage.getByRole('heading', { name: /customers/i })).toBeVisible({
      timeout: 30_000,
    });

    // A 24-character random token is overwhelmingly unlikely to match any row.
    const noMatchQuery = `nomatch_${RUN_ID}_${Math.random().toString(36).slice(2, 10)}xyz`;

    const searchInput = managerPage.getByPlaceholder('Search by name or mobile…');
    const searchResponse = managerPage.waitForResponse(
      (res) =>
        res.url().includes('/customers') &&
        res.url().includes(`search=${encodeURIComponent(noMatchQuery)}`) &&
        res.request().method() === 'GET',
      { timeout: 20_000 },
    );

    await searchInput.fill(noMatchQuery);
    await searchResponse;

    // Both seeded rows must be gone, and the empty-state copy must be shown.
    // The empty-state text is rendered in both the desktop table and the
    // mobile card list; .first() is fine — either is acceptable evidence.
    await expect(
      managerPage.getByText('No customers found.').first(),
    ).toBeVisible({ timeout: 15_000 });

    await expect(
      managerPage.locator(`a[href="/customers/${activeCustomerId}"]`),
    ).toHaveCount(0);
    await expect(
      managerPage.locator(`a[href="/customers/${blacklistedCustomerId}"]`),
    ).toHaveCount(0);
  });

  test('auditor can search the customer list but cannot see New Customer button', async ({
    auditorPage,
  }) => {
    await auditorPage.goto('/customers');
    await expect(auditorPage.getByRole('heading', { name: /customers/i })).toBeVisible({
      timeout: 30_000,
    });

    // RBAC: viewer_auditor has customer.read but NOT customer.create, so the
    // PermissionGate-wrapped "New Customer" link must not render.
    await expect(
      auditorPage.getByRole('link', { name: /new customer/i }),
    ).toHaveCount(0);

    // Read-only auditor must still be able to use the search box.
    const searchInput = auditorPage.getByPlaceholder('Search by name or mobile…');
    const searchResponse = auditorPage.waitForResponse(
      (res) =>
        res.url().includes('/customers') &&
        res.url().includes(`search=${ACTIVE_NAME_TAG}`) &&
        res.request().method() === 'GET',
      { timeout: 20_000 },
    );

    await searchInput.fill(ACTIVE_NAME_TAG);
    await searchResponse;

    const activeRow = auditorPage.locator(`a[href="/customers/${activeCustomerId}"]`);
    await expect(activeRow).toBeVisible({ timeout: 15_000 });
  });
});
