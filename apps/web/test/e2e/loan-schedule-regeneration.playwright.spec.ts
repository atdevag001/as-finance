import { test, expect } from './fixtures';
import { getTokenForRole, createTestCustomer, apiRequest, csrfHeadersFor } from './fixtures';

/**
 * Loan Schedule Regeneration — E2E Tests
 *
 * Closes the gap around the "Change EMI Date" / Regenerate Schedule dialog
 * exposed on the loan detail page (apps/web/src/app/(dashboard)/loans/[id]/page.tsx).
 *
 * This flow is critical because it rewrites the future EMI schedule for a loan
 * that is approved (or active with no collections yet). It must:
 *   - Be gated behind the loan.approve permission (manager only; field officer
 *     and auditor cannot see the trigger button).
 *   - Reject invalid dates (e.g. before the disbursement date — server returns
 *     FIRST_EMI_DATE_BEFORE_DISBURSEMENT mapped to a user-friendly message).
 *   - On success, regenerate every installment's due_date so the first
 *     installment lands on the chosen date and the displayed first-due-date
 *     in the Details card updates.
 *
 * Scenarios covered:
 *   1. Golden path — manager opens dialog on an approved loan, picks a valid
 *      future date, confirms, and the Details card / schedule table reflect
 *      the new first due date.
 *   2. Validation — picking a date before the disbursement date surfaces the
 *      backend FIRST_EMI_DATE_BEFORE_DISBURSEMENT error message inline.
 *   3. RBAC denial — field officer never sees the "Change EMI Date" button on
 *      an approved loan even though the loan is in a state that would enable
 *      it for an authorised user.
 *   4. State gating — once a collection has been posted on an active loan the
 *      button must disappear (the page hides it when status==='active' and
 *      collections.length > 0) so paid rows can't be silently rewritten.
 */

const API_BASE = 'http://localhost:3001';

interface LoanProduct {
  id: string;
  current_version_id?: string;
  current_version?: { id: string };
}

interface ScheduleRow {
  id: string;
  installment_number: number;
  due_date: string;
  status: string;
}

interface LoanResponse {
  id: string;
  loan_number: string;
  status: string;
  first_due_date?: string;
  disbursement_date?: string;
  schedules?: ScheduleRow[];
}

/**
 * Helper: pick the first product version id the same way loan-lifecycle does.
 * Falls back through the various shapes the API returns so this stays in lock-
 * step with that spec's helper.
 */
async function getProductVersionId(token: string): Promise<string> {
  const res = await fetch(`${API_BASE}/loan-products`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  const products: LoanProduct[] = Array.isArray(body) ? body : body.data ?? [];
  const product = products[0];
  if (!product) throw new Error('No loan products available for regeneration spec');
  return product.current_version_id ?? product.current_version?.id ?? product.id;
}

/**
 * Helper: create a loan via the camelCase /loans contract used by
 * loan-lifecycle.playwright.spec.ts. We mirror that shape rather than
 * test-data.fixture.ts because the lifecycle spec is the canonical reference
 * for loans created with a productVersionId.
 */
async function createLoan(
  token: string,
  customerId: string,
  productVersionId: string,
): Promise<{ id: string; loan_number: string }> {
  const res = await fetch(`${API_BASE}/loans`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(await csrfHeadersFor(token)),
    },
    body: JSON.stringify({
      customerId,
      productVersionId,
      principalPaise: 5000000,
      tenureMonths: 12,
      purpose: `E2E schedule-regeneration ${Date.now()}`,
    }),
  });
  const loan = await res.json();
  if (!loan.id) throw new Error(`Failed to create loan: ${JSON.stringify(loan)}`);
  return { id: loan.id, loan_number: loan.loan_number };
}

async function loanAction(
  token: string,
  loanId: string,
  action: string,
  body?: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(`${API_BASE}/loans/${loanId}/${action}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(await csrfHeadersFor(token)),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Loan action ${action} failed (${res.status}): ${error}`);
  }
}

/**
 * Drive a loan to the `approved` status using the maker/checker split that
 * matches the production rules (FO submits; manager reviews + approves).
 */
async function bringLoanToApproved(
  foToken: string,
  managerToken: string,
  loanId: string,
): Promise<void> {
  await loanAction(foToken, loanId, 'submit');
  await loanAction(managerToken, loanId, 'review');
  await loanAction(managerToken, loanId, 'approve');
}

/**
 * Drive a loan to `active` (disbursed) status. Used by the state-gating test
 * where a collection then needs to be posted to hide the trigger button.
 */
async function bringLoanToActive(
  foToken: string,
  managerToken: string,
  loanId: string,
): Promise<void> {
  await bringLoanToApproved(foToken, managerToken, loanId);
  await loanAction(managerToken, loanId, 'disburse', { mode: 'cash' });
}

/**
 * Format a Date as YYYY-MM-DD without TZ surprises — matches the value the
 * <input type="date"> control produces and what the backend expects.
 */
function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

test.describe('Loan Schedule Regeneration (Change EMI Date)', () => {
  let foToken: string;
  let managerToken: string;
  let productVersionId: string;

  test.beforeAll(async () => {
    foToken = await getTokenForRole('field_officer');
    managerToken = await getTokenForRole('manager');
    productVersionId = await getProductVersionId(foToken);
  });

  test('manager can regenerate schedule with a new first EMI date and the Details card reflects it', async ({ managerPage }) => {
    const customerId = await createTestCustomer(foToken);
    const { id } = await createLoan(foToken, customerId, productVersionId);
    await bringLoanToApproved(foToken, managerToken, id);

    // Capture the existing first_due_date so we can assert it actually changes
    // (a stale-cache no-op would otherwise pass the visible-text assertion).
    const before = await apiRequest<LoanResponse>('GET', `/loans/${id}`, managerToken);
    const originalFirstDue = before.first_due_date
      ? String(before.first_due_date).slice(0, 10)
      : null;

    // Pick a date ~45 days in the future — comfortably after any default
    // first-due that approval might have produced, and well within tenure.
    const newDate = new Date();
    newDate.setDate(newDate.getDate() + 45);
    const newDateIso = isoDate(newDate);

    await managerPage.goto(`/loans/${id}`);
    await managerPage.waitForLoadState('domcontentloaded');
    await expect(managerPage.locator('span', { hasText: /^approved$/i }).first()).toBeVisible({ timeout: 30_000 });

    // Open the Change EMI Date dialog
    await managerPage.getByRole('button', { name: /change emi date/i }).click();

    const dialog = managerPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText(/regenerate the entire repayment schedule/i)).toBeVisible();

    // Fill the new date — the input is bound to id="regenerate-first-emi".
    const dateInput = dialog.locator('#regenerate-first-emi');
    await dateInput.fill(newDateIso);

    // Confirm. Button label inside the dialog is "Regenerate Schedule".
    await dialog.getByRole('button', { name: /regenerate schedule/i }).click();

    // Dialog closes and toast fires on success.
    await expect(dialog).not.toBeVisible({ timeout: 15_000 });
    await expect(managerPage.getByText(/emi schedule regenerated successfully/i)).toBeVisible({ timeout: 15_000 });

    // Details card now shows the new first due date. We scope to the Details
    // card to avoid matching the same value if it happened to appear elsewhere.
    const detailsCard = managerPage.locator('div').filter({ has: managerPage.getByText('First Due Date', { exact: true }) }).first();
    await expect(detailsCard.getByText(newDateIso)).toBeVisible({ timeout: 15_000 });

    // And the underlying loan record was updated server-side (defence in depth
    // against the UI rendering stale cached data).
    const after = await apiRequest<LoanResponse>('GET', `/loans/${id}`, managerToken);
    expect(after.first_due_date ? String(after.first_due_date).slice(0, 10) : null).toBe(newDateIso);
    if (originalFirstDue) {
      expect(after.first_due_date ? String(after.first_due_date).slice(0, 10) : null).not.toBe(originalFirstDue);
    }
    // Every schedule row should still be pending (none were paid) and the
    // first installment due date should match the picked date.
    const sorted = (after.schedules ?? []).slice().sort((a, b) => a.installment_number - b.installment_number);
    expect(sorted.length).toBeGreaterThan(0);
    expect(String(sorted[0].due_date).slice(0, 10)).toBe(newDateIso);
    for (const row of sorted) {
      expect(row.status).toBe('pending');
    }
  });

  test('selecting a date before the disbursement date surfaces a validation error', async ({ managerPage }) => {
    const customerId = await createTestCustomer(foToken);
    const { id } = await createLoan(foToken, customerId, productVersionId);
    // Drive to active so a disbursement_date exists; then hand-craft a state
    // where no collections have been posted (default after disbursement) so
    // the trigger button is still visible.
    await bringLoanToActive(foToken, managerToken, id);

    const loan = await apiRequest<LoanResponse>('GET', `/loans/${id}`, managerToken);
    expect(loan.disbursement_date).toBeTruthy();
    const disbursementIso = String(loan.disbursement_date).slice(0, 10);

    // Pick a date strictly before the disbursement date. The <input min=...>
    // attribute will block past dates from the spinner UI, but `fill()` writes
    // the value programmatically — which is exactly how we provoke the server
    // FIRST_EMI_DATE_BEFORE_DISBURSEMENT error path.
    const before = new Date(disbursementIso);
    before.setDate(before.getDate() - 1);
    const badIso = isoDate(before);

    await managerPage.goto(`/loans/${id}`);
    await managerPage.waitForLoadState('domcontentloaded');
    await expect(managerPage.locator('span', { hasText: /^active$/i }).first()).toBeVisible({ timeout: 30_000 });

    // Sanity check: the button is visible because no collections exist yet.
    const trigger = managerPage.getByRole('button', { name: /change emi date/i });
    await expect(trigger).toBeVisible({ timeout: 15_000 });
    await trigger.click();

    const dialog = managerPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    const dateInput = dialog.locator('#regenerate-first-emi');
    await dateInput.fill(badIso);

    await dialog.getByRole('button', { name: /regenerate schedule/i }).click();

    // Either the user-friendly mapped message ("First EMI date must be after
    // the disbursement date.") or the not-future variant — whichever the
    // backend chose. Both are valid failure surfaces here; we accept either
    // rather than overfitting to one server branch.
    const errorPattern = /(first emi date must be (after the disbursement|in the future)|FIRST_EMI_DATE_(NOT_FUTURE|BEFORE_DISBURSEMENT))/i;
    await expect(managerPage.getByText(errorPattern).first()).toBeVisible({ timeout: 15_000 });

    // Loan's first_due_date must not have changed.
    const after = await apiRequest<LoanResponse>('GET', `/loans/${id}`, managerToken);
    expect(after.first_due_date).toBe(loan.first_due_date);
  });

  test('field officer cannot see the Change EMI Date button on an approved loan (RBAC)', async ({ fieldOfficerPage }) => {
    const customerId = await createTestCustomer(foToken);
    const { id } = await createLoan(foToken, customerId, productVersionId);
    await bringLoanToApproved(foToken, managerToken, id);

    await fieldOfficerPage.goto(`/loans/${id}`);
    await fieldOfficerPage.waitForLoadState('domcontentloaded');
    await expect(fieldOfficerPage.locator('span', { hasText: /^approved$/i }).first()).toBeVisible({ timeout: 30_000 });

    // The button is gated by PermissionGate("loan.approve") which the field
    // officer role does not hold — so the trigger must be absent entirely.
    await expect(fieldOfficerPage.getByRole('button', { name: /change emi date/i })).not.toBeVisible();
  });

  test('active loan with a posted collection hides the Change EMI Date button to protect paid rows', async ({ managerPage }) => {
    const customerId = await createTestCustomer(foToken);
    const { id } = await createLoan(foToken, customerId, productVersionId);
    await bringLoanToActive(foToken, managerToken, id);

    // Before posting a collection, the button is visible on an active loan
    // (the no-collections branch of the gate). We don't assert that here to
    // keep this test focused on the after-collection hide.
    const coToken = await getTokenForRole('collection_officer');
    const collectionRes = await fetch(`${API_BASE}/collections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${coToken}`,
        ...(await csrfHeadersFor(coToken)),
      },
      body: JSON.stringify({
        loanId: id,
        amountPaise: 500000,
        paymentMode: 'cash',
        paymentDate: new Date().toISOString().split('T')[0],
        idempotencyKey: `e2e-regen-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      }),
    });
    expect(collectionRes.ok).toBe(true);

    await managerPage.goto(`/loans/${id}`);
    await managerPage.waitForLoadState('networkidle');
    await expect(managerPage.locator('span', { hasText: /^(active|overdue)$/i }).first()).toBeVisible({ timeout: 30_000 });

    // The Collection History section must show at least one row before we
    // assert the button is hidden — otherwise we'd race the page's hide logic
    // (which depends on collectionsData being loaded with length > 0).
    const collectionTable = managerPage.locator('table').filter({ hasText: 'Mode' });
    await collectionTable.scrollIntoViewIfNeeded();
    await expect(collectionTable.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 });

    await expect(managerPage.getByRole('button', { name: /change emi date/i })).not.toBeVisible();
  });
});
