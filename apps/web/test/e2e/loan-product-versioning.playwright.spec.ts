import { test, expect, getTokenForRole, apiRequest } from './fixtures';

/**
 * Loan Product Edit + Versioning — Playwright E2E Tests
 *
 * Closes the critical coverage gap for /loan-products/[id]/edit. The existing
 * loan-products spec only asserts that the Edit button is visible to admin;
 * none of the actual edit flows (rate change, principal range change, penalty
 * rate change, allocation order change) — each of which triggers a NEW product
 * version on the backend — were exercised. Versioning is load-bearing for
 * historical loan accuracy: existing loans must keep their original terms,
 * while new loans must use the updated terms.
 *
 * Each test seeds its own loan product via the /loan-products POST endpoint
 * using a super_admin token (apiRequest) so the tests are self-contained and
 * don't collide with the shared seed catalogue. We then drive the UI edit
 * form and verify the resulting version bump via a follow-up GET.
 *
 * Roles & permissions (from packages/shared/src/constants/permissions.ts):
 *   - loan_product.update  → SUPER_ADMIN only
 *   - All non-admin roles must hit AccessDenied on the edit page (RBAC)
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface SeededProduct {
  id: string;
  name: string;
  versionNumber: number;
  annualRateBps: number;
  minPrincipalPaise: number;
  maxPrincipalPaise: number;
  minTenureMonths: number;
  maxTenureMonths: number;
  penaltyValueBps: number;
  allocationOrder: string[];
}

/**
 * Seed a fresh loan product owned by super_admin and return its current
 * version snapshot, so tests can assert the version_number bump after edit.
 */
async function seedLoanProduct(suffix: string): Promise<SeededProduct> {
  const token = await getTokenForRole('super_admin');
  const name = `E2E Versioning ${suffix} ${Date.now()}`;

  const created = await apiRequest<{
    id: string;
    current_version?: { version_number?: number };
  }>('POST', '/loan-products', token, {
    name,
    interestType: 'flat',
    annualRateBps: 1800,            // 18.00% p.a.
    minPrincipalPaise: 1_000_000,   // ₹10,000
    maxPrincipalPaise: 10_000_000,  // ₹100,000
    minTenureMonths: 3,
    maxTenureMonths: 24,
    repaymentFrequency: 'monthly',
    processingFeeType: 'percentage',
    processingFeeValue: 200,        // 2.00% (bps)
    penaltyType: 'percentage_of_overdue',
    penaltyValue: 200,              // 2.00% (bps)
    penaltyFrequency: 'monthly',
    penaltyGraceDays: 0,
    allocationOrder: ['penalty', 'interest', 'principal'],
  });

  return {
    id: created.id,
    name,
    versionNumber: created.current_version?.version_number ?? 1,
    annualRateBps: 1800,
    minPrincipalPaise: 1_000_000,
    maxPrincipalPaise: 10_000_000,
    minTenureMonths: 3,
    maxTenureMonths: 24,
    penaltyValueBps: 200,
    allocationOrder: ['penalty', 'interest', 'principal'],
  };
}

/**
 * Fetch the product as super_admin and return its current version block so
 * tests can assert the backend actually rolled forward.
 */
async function fetchCurrentVersion(productId: string) {
  const token = await getTokenForRole('super_admin');
  return apiRequest<{
    id: string;
    current_version: {
      version_number: number;
      annual_rate_bps: number;
      min_principal_paise: number;
      max_principal_paise: number;
      penalty_value: number | null;
      allocation_order: string[];
    };
  }>('GET', `/loan-products/${productId}`, token);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Loan Product Edit + Versioning', () => {
  test.describe('Golden path — edit creates a new version', () => {
    test('admin can change annual rate and a new version is created', async ({ adminPage }) => {
      const seeded = await seedLoanProduct('rate');

      await adminPage.goto(`/loan-products/${seeded.id}/edit`);
      await expect(adminPage.getByRole('heading', { name: 'Edit Loan Product' }))
        .toBeVisible({ timeout: 15_000 });

      // Form should hydrate with the seeded rate (18.00) before we mutate it.
      // Without this wait the fill() below can race the React Query fetch and
      // be overwritten by the useEffect that loads `product.current_version`.
      await expect(adminPage.locator('#annual_rate')).toHaveValue('18', { timeout: 15_000 });

      await adminPage.locator('#annual_rate').fill('22.5');
      await adminPage.getByRole('button', { name: /save changes/i }).click();

      // Behaviour assertion #1: success toast confirms the PATCH and the
      // user-facing copy explicitly says a new version was created.
      await expect(
        adminPage.getByRole('status').filter({ hasText: /new version was created/i }),
      ).toBeVisible({ timeout: 15_000 });

      // Behaviour assertion #2: redirected back to the list page.
      await adminPage.waitForURL('**/loan-products', { timeout: 15_000 });

      // Behaviour assertion #3: backend rolled forward — fetch over the API
      // and confirm the version number bumped and rate changed.
      const after = await fetchCurrentVersion(seeded.id);
      expect(after.current_version.version_number).toBeGreaterThan(seeded.versionNumber);
      expect(after.current_version.annual_rate_bps).toBe(2250); // 22.50%
    });

    test('admin can change principal range and a new version is created', async ({ adminPage }) => {
      const seeded = await seedLoanProduct('principal');

      await adminPage.goto(`/loan-products/${seeded.id}/edit`);
      await expect(adminPage.locator('#min_principal')).toHaveValue('10000', { timeout: 15_000 });
      await expect(adminPage.locator('#max_principal')).toHaveValue('100000', { timeout: 15_000 });

      await adminPage.locator('#min_principal').fill('25000');
      await adminPage.locator('#max_principal').fill('250000');
      await adminPage.getByRole('button', { name: /save changes/i }).click();

      await expect(
        adminPage.getByRole('status').filter({ hasText: /new version was created/i }),
      ).toBeVisible({ timeout: 15_000 });
      await adminPage.waitForURL('**/loan-products', { timeout: 15_000 });

      const after = await fetchCurrentVersion(seeded.id);
      expect(after.current_version.version_number).toBeGreaterThan(seeded.versionNumber);
      expect(after.current_version.min_principal_paise).toBe(2_500_000);
      expect(after.current_version.max_principal_paise).toBe(25_000_000);
    });

    test('admin can change penalty rate and a new version is created', async ({ adminPage }) => {
      const seeded = await seedLoanProduct('penalty');

      await adminPage.goto(`/loan-products/${seeded.id}/edit`);
      await expect(adminPage.locator('#penalty_rate_percent')).toHaveValue('2', { timeout: 15_000 });

      await adminPage.locator('#penalty_rate_percent').fill('3.5');
      await adminPage.getByRole('button', { name: /save changes/i }).click();

      await expect(
        adminPage.getByRole('status').filter({ hasText: /new version was created/i }),
      ).toBeVisible({ timeout: 15_000 });
      await adminPage.waitForURL('**/loan-products', { timeout: 15_000 });

      const after = await fetchCurrentVersion(seeded.id);
      expect(after.current_version.version_number).toBeGreaterThan(seeded.versionNumber);
      // 3.5% stored as bps (350)
      expect(after.current_version.penalty_value).toBe(350);
    });

    test('admin can change allocation order and a new version is created', async ({ adminPage }) => {
      const seeded = await seedLoanProduct('allocation');

      await adminPage.goto(`/loan-products/${seeded.id}/edit`);
      await expect(adminPage.locator('#allocation_order'))
        .toHaveValue('penalty,interest,principal', { timeout: 15_000 });

      // Swap to interest-first allocation — a real business decision that must
      // not retroactively touch existing loans.
      await adminPage.locator('#allocation_order').fill('interest,principal,penalty');
      await adminPage.getByRole('button', { name: /save changes/i }).click();

      await expect(
        adminPage.getByRole('status').filter({ hasText: /new version was created/i }),
      ).toBeVisible({ timeout: 15_000 });
      await adminPage.waitForURL('**/loan-products', { timeout: 15_000 });

      const after = await fetchCurrentVersion(seeded.id);
      expect(after.current_version.version_number).toBeGreaterThan(seeded.versionNumber);
      expect(after.current_version.allocation_order).toEqual([
        'interest', 'principal', 'penalty',
      ]);
    });

    test('list view shows the bumped version number after edit', async ({ adminPage }) => {
      const seeded = await seedLoanProduct('list-bump');

      await adminPage.goto(`/loan-products/${seeded.id}/edit`);
      await expect(adminPage.locator('#annual_rate')).toHaveValue('18', { timeout: 15_000 });

      await adminPage.locator('#annual_rate').fill('19');
      await adminPage.getByRole('button', { name: /save changes/i }).click();
      await adminPage.waitForURL('**/loan-products', { timeout: 15_000 });

      // The list page renders "vN" next to each product name. Locate the row
      // for our seeded product and confirm the suffix is v2 (or higher), which
      // proves React Query refetched and the version bump is user-visible.
      // Use the link locator (admin can click product names) for stability.
      const productLink = adminPage.getByRole('link', { name: seeded.name }).first();
      await expect(productLink).toBeVisible({ timeout: 15_000 });
      const row = adminPage.locator('tr').filter({ has: productLink });
      await expect(row).toContainText(/v[2-9]/, { timeout: 15_000 });
    });
  });

  test.describe('Validation — bad input does NOT create a version', () => {
    test('min principal greater than max principal shows error and stays on edit page', async ({ adminPage }) => {
      const seeded = await seedLoanProduct('val-principal');

      await adminPage.goto(`/loan-products/${seeded.id}/edit`);
      await expect(adminPage.locator('#min_principal')).toHaveValue('10000', { timeout: 15_000 });

      await adminPage.locator('#min_principal').fill('500000');
      await adminPage.locator('#max_principal').fill('100000');
      await adminPage.getByRole('button', { name: /save changes/i }).click();

      // Behaviour assertion: inline error message renders and we stay on /edit.
      await expect(
        adminPage.getByText(/min principal cannot be greater than max principal/i),
      ).toBeVisible({ timeout: 15_000 });
      expect(adminPage.url()).toContain(`/loan-products/${seeded.id}/edit`);

      // Behaviour assertion: no version bump occurred on the backend.
      const after = await fetchCurrentVersion(seeded.id);
      expect(after.current_version.version_number).toBe(seeded.versionNumber);
    });

    test('zero or negative annual rate shows error and does not save', async ({ adminPage }) => {
      const seeded = await seedLoanProduct('val-rate');

      await adminPage.goto(`/loan-products/${seeded.id}/edit`);
      await expect(adminPage.locator('#annual_rate')).toHaveValue('18', { timeout: 15_000 });

      await adminPage.locator('#annual_rate').fill('0');
      await adminPage.getByRole('button', { name: /save changes/i }).click();

      await expect(
        adminPage.getByText(/annual rate must be positive/i),
      ).toBeVisible({ timeout: 15_000 });
      expect(adminPage.url()).toContain(`/loan-products/${seeded.id}/edit`);

      const after = await fetchCurrentVersion(seeded.id);
      expect(after.current_version.version_number).toBe(seeded.versionNumber);
      expect(after.current_version.annual_rate_bps).toBe(seeded.annualRateBps);
    });

    test('min tenure greater than max tenure shows error and does not save', async ({ adminPage }) => {
      const seeded = await seedLoanProduct('val-tenure');

      await adminPage.goto(`/loan-products/${seeded.id}/edit`);
      await expect(adminPage.locator('#min_tenure_months')).toHaveValue('3', { timeout: 15_000 });

      await adminPage.locator('#min_tenure_months').fill('36');
      await adminPage.locator('#max_tenure_months').fill('6');
      await adminPage.getByRole('button', { name: /save changes/i }).click();

      await expect(
        adminPage.getByText(/min tenure cannot be greater than max tenure/i),
      ).toBeVisible({ timeout: 15_000 });
      expect(adminPage.url()).toContain(`/loan-products/${seeded.id}/edit`);

      const after = await fetchCurrentVersion(seeded.id);
      expect(after.current_version.version_number).toBe(seeded.versionNumber);
    });
  });

  test.describe('RBAC — only super_admin can edit', () => {
    test('manager hitting the edit URL directly sees Access Denied', async ({ managerPage }) => {
      const seeded = await seedLoanProduct('rbac-manager');

      await managerPage.goto(`/loan-products/${seeded.id}/edit`);
      // The page component renders <AccessDenied /> when role lacks update.
      await expect(managerPage.getByRole('heading', { name: 'Access Denied' }))
        .toBeVisible({ timeout: 15_000 });

      // Defence-in-depth: the form's primary action must not be present.
      await expect(managerPage.getByRole('button', { name: /save changes/i }))
        .toHaveCount(0);
    });

    test('field_officer hitting the edit URL directly sees Access Denied', async ({ fieldOfficerPage }) => {
      const seeded = await seedLoanProduct('rbac-field');

      await fieldOfficerPage.goto(`/loan-products/${seeded.id}/edit`);
      await expect(fieldOfficerPage.getByRole('heading', { name: 'Access Denied' }))
        .toBeVisible({ timeout: 15_000 });
      await expect(fieldOfficerPage.getByRole('button', { name: /save changes/i }))
        .toHaveCount(0);
    });

    test('accountant hitting the edit URL directly sees Access Denied', async ({ accountantPage }) => {
      const seeded = await seedLoanProduct('rbac-accountant');

      await accountantPage.goto(`/loan-products/${seeded.id}/edit`);
      await expect(accountantPage.getByRole('heading', { name: 'Access Denied' }))
        .toBeVisible({ timeout: 15_000 });
      await expect(accountantPage.getByRole('button', { name: /save changes/i }))
        .toHaveCount(0);
    });

    test('API rejects PATCH from non-admin even if UI is bypassed', async () => {
      // Belt-and-braces server-side enforcement check. If the form's
      // AccessDenied gate were ever removed, the API still must reject.
      const seeded = await seedLoanProduct('rbac-api');
      const managerToken = await getTokenForRole('manager');

      let threw = false;
      try {
        await apiRequest('PATCH', `/loan-products/${seeded.id}`, managerToken, {
          annualRateBps: 9999,
        });
      } catch (err) {
        threw = true;
        // The shared apiRequest helper throws a string-formatted Error with
        // the HTTP status when the response is not ok. We just require it
        // fails — distinguishing 401 vs 403 here is brittle across guards.
        expect((err as Error).message).toMatch(/failed: 4\d\d/);
      }
      expect(threw).toBe(true);

      // Confirm the manager's attempt did NOT bump the version.
      const after = await fetchCurrentVersion(seeded.id);
      expect(after.current_version.version_number).toBe(seeded.versionNumber);
      expect(after.current_version.annual_rate_bps).toBe(seeded.annualRateBps);
    });
  });
});
