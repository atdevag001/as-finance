import { test, expect } from './fixtures';
import {
  getTokenForRole,
  apiRequest,
  createTestCustomer,
  createTestLoan,
  advanceLoanToStatus,
} from './fixtures';

/**
 * Customer Detail — Linked Loans Section — Playwright E2E
 *
 * Closes coverage gap: the existing customer-detail.playwright.spec.ts and
 * customer-operations.playwright.spec.ts never seed a loan against the
 * customer, so the `Linked Loans` card driven by GET /loans?customerId=...
 * has zero behavioral coverage. Specifically uncovered:
 *
 *   1. The section is hidden when the customer has no loans.
 *   2. After disbursement, the loan appears with loan_number, principal,
 *      outstanding amount, and a "disbursed" StatusBadge.
 *   3. Clicking the loan_number link navigates to /loans/:id (deep-link).
 *   4. RBAC: a viewer/auditor (read-only) still sees the linked loan row.
 *
 * Seeds data via apiRequest helpers so tests are self-contained.
 *
 * Validates: customer detail page `Linked Loans` card + navigation to loan detail.
 */

interface LoanApiRecord {
  id: string;
  loan_number: string;
  principal_paise: number;
  status: string;
  cached_outstanding_paise?: number | null;
}

test.describe('Customer Detail — Linked Loans', () => {
  let managerToken: string;

  test.beforeAll(async () => {
    managerToken = await getTokenForRole('manager');
  });

  test('Linked Loans card is NOT rendered when the customer has no loans', async ({ managerPage }) => {
    // Fresh customer, no loans seeded.
    const customerId = await createTestCustomer(managerToken, {
      fullName: `Linked Loans Empty ${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    });

    await managerPage.goto(`/customers/${customerId}`);
    await managerPage.waitForLoadState('domcontentloaded');

    // Wait for the page to actually render the customer; otherwise the
    // assertion on "Linked Loans" missing is vacuous on a still-loading page.
    await expect(
      managerPage.getByRole('heading', { name: 'Personal Info' }),
    ).toBeVisible({ timeout: 30_000 });

    // Wait for the Linked Loans query to settle (React Query fires on mount).
    // We can't wait on the network response by URL alone reliably across roles,
    // so give the SPA a beat to render the conditional card if it were going to.
    await managerPage.waitForLoadState('networkidle');

    // Behavior: the section is rendered only when linkedLoans.length > 0.
    // For a brand-new customer the heading must be absent.
    await expect(
      managerPage.getByRole('heading', { name: 'Linked Loans' }),
    ).toHaveCount(0);
  });

  test('Disbursed loan appears in Linked Loans with loan_number, principal and Disbursed badge', async ({ managerPage }) => {
    // Golden path: seed a fully disbursed loan for a fresh customer.
    const customerId = await createTestCustomer(managerToken, {
      fullName: `Linked Loans Golden ${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    });
    const principalPaise = 7500000; // ₹75,000 — distinct from default so we can assert
    const loanId = await createTestLoan(managerToken, customerId, undefined, {
      principalPaise,
      tenureMonths: 12,
    });
    await advanceLoanToStatus(managerToken, loanId, 'disbursed');

    // Pull the freshly-disbursed loan back to learn its server-assigned
    // loan_number — we cannot guess the format.
    const loan = await apiRequest<LoanApiRecord>('GET', `/loans/${loanId}`, managerToken);
    expect(loan.loan_number).toBeTruthy();

    await managerPage.goto(`/customers/${customerId}`);
    await managerPage.waitForLoadState('domcontentloaded');

    // Customer name renders → page mounted → linked loans query has fired.
    await expect(
      managerPage.getByRole('heading', { name: 'Personal Info' }),
    ).toBeVisible({ timeout: 30_000 });

    // Linked Loans card must now be present (linkedLoans.length > 0 branch).
    const linkedLoansHeading = managerPage.getByRole('heading', { name: 'Linked Loans' });
    await expect(linkedLoansHeading).toBeVisible({ timeout: 15_000 });

    // The loan row must show the loan_number returned by the API. The desktop
    // table renders the number as an anchor; on smaller breakpoints it renders
    // inside a card link. Either is acceptable.
    await expect(
      managerPage.getByRole('link', { name: loan.loan_number }),
    ).toBeVisible({ timeout: 15_000 });

    // Principal (₹75,000) must render — MoneyDisplay formats paise→rupees with
    // the ₹ glyph and Indian thousands separators.
    await expect(
      managerPage.getByText(/₹\s*75,000(\.00)?/).first(),
    ).toBeVisible();

    // Status badge: StatusBadge replaces underscores with spaces and CSS-
    // capitalizes. The DOM text is the raw "disbursed" string.
    await expect(
      managerPage.getByText('disbursed', { exact: true }).first(),
    ).toBeVisible();
  });

  test('Clicking the loan number in Linked Loans navigates to /loans/:id', async ({ managerPage }) => {
    // Seed a disbursed loan so the link is rendered.
    const customerId = await createTestCustomer(managerToken, {
      fullName: `Linked Loans Nav ${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    });
    const loanId = await createTestLoan(managerToken, customerId, undefined, {
      principalPaise: 5000000,
      tenureMonths: 12,
    });
    await advanceLoanToStatus(managerToken, loanId, 'disbursed');

    const loan = await apiRequest<LoanApiRecord>('GET', `/loans/${loanId}`, managerToken);

    await managerPage.goto(`/customers/${customerId}`);
    await managerPage.waitForLoadState('domcontentloaded');
    await expect(
      managerPage.getByRole('heading', { name: 'Linked Loans' }),
    ).toBeVisible({ timeout: 30_000 });

    // The desktop table renders the loan_number as a Next.js Link to /loans/:id.
    // The mobile card view wraps the whole row in a Link with the same href.
    // Either way an anchor with the right href must exist — assert href first,
    // then click it to verify the URL change.
    const loanLink = managerPage
      .locator(`a[href="/loans/${loanId}"]`)
      .first();
    await expect(loanLink).toBeVisible({ timeout: 15_000 });

    await loanLink.click();

    // Loan detail URL — Next.js may append a trailing slash or query depending
    // on the route config, so match by prefix.
    await managerPage.waitForURL(new RegExp(`/loans/${loanId}(\\?|$|/)`), {
      timeout: 30_000,
    });

    // Sanity: the loan detail page actually rendered. The exact heading varies
    // (`Loan ${loan_number}`, `LN-...`, etc.) — assert that the loan_number is
    // somewhere on the destination page rather than coupling to a specific
    // heading hierarchy.
    await expect(
      managerPage.getByText(loan.loan_number).first(),
    ).toBeVisible({ timeout: 30_000 });
  });

  test('Auditor (read-only) can see the Linked Loans row but no edit/blacklist actions', async ({ auditorPage }) => {
    // RBAC: viewer_auditor has loan.read so the Linked Loans card must render
    // identically to manager. But they must NOT see Edit/Blacklist on the
    // customer header — re-asserted here to guard against a regression that
    // accidentally widens audit-role surface area while we're testing the
    // linked-loans view.
    const customerId = await createTestCustomer(managerToken, {
      fullName: `Linked Loans RBAC ${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    });
    const loanId = await createTestLoan(managerToken, customerId, undefined, {
      principalPaise: 3000000, // ₹30,000
      tenureMonths: 6,
    });
    await advanceLoanToStatus(managerToken, loanId, 'disbursed');

    const loan = await apiRequest<LoanApiRecord>('GET', `/loans/${loanId}`, managerToken);

    await auditorPage.goto(`/customers/${customerId}`);
    await auditorPage.waitForLoadState('domcontentloaded');

    await expect(
      auditorPage.getByRole('heading', { name: 'Personal Info' }),
    ).toBeVisible({ timeout: 30_000 });

    // Linked Loans card must be present for auditor as well.
    await expect(
      auditorPage.getByRole('heading', { name: 'Linked Loans' }),
    ).toBeVisible({ timeout: 15_000 });

    // The seeded loan_number must appear as a link to the loan detail.
    await expect(
      auditorPage.locator(`a[href="/loans/${loanId}"]`).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      auditorPage.getByRole('link', { name: loan.loan_number }),
    ).toBeVisible();

    // Auditor must NOT have Edit/Blacklist on the customer header — these
    // are gated by PermissionGate and would indicate a permission regression.
    await expect(
      auditorPage.getByRole('button', { name: /^edit$/i }),
    ).toHaveCount(0);
    await expect(
      auditorPage.getByRole('button', { name: /^blacklist$/i }),
    ).toHaveCount(0);
  });
});
