import { test, expect } from './fixtures';
import {
  getTokenForRole,
  createTestCustomer,
  apiRequest,
} from './fixtures';

/**
 * Loan firstEmiDate Override — E2E coverage
 *
 * Closes the gap identified by the autonomous test analyzer: the optional
 * `First EMI Date` input on the approve and disburse dialogs (and the
 * companion FIRST_EMI_DATE_NOT_FUTURE / FIRST_EMI_DATE_BEFORE_DISBURSEMENT
 * server-side rules) is never exercised by the loan-lifecycle or
 * loan-application specs.
 *
 * What we assert end-to-end (UI → API → DB):
 *  - Approve with an explicit firstEmiDate shifts the generated schedule's
 *    first installment to that exact ISO date.
 *  - Disburse with an explicit firstEmiDate after approval re-shifts the
 *    schedule's first installment to the new date.
 *  - Validation errors (past date / before-disbursement) surface the
 *    backend's user-friendly mapped messages and do NOT mutate state.
 *  - Field officer cannot reach the Approve dialog at all (RBAC).
 *  - The "First EMI Date (optional)" input renders inside the Approve
 *    dialog with the `min` attribute that gates past dates via the picker.
 *
 * Pattern mirrors loan-schedule-regeneration.playwright.spec.ts:
 *  - Seed loans via apiRequest, drive them to the right status via the API,
 *    then exercise the dialog through the UI.
 *  - Tolerate either mapped message (FIRST_EMI_DATE_NOT_FUTURE vs
 *    FIRST_EMI_DATE_BEFORE_DISBURSEMENT) because the server picks the
 *    branch — both are valid failure surfaces.
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
  disbursement_date?: string | null;
  first_due_date?: string | null;
  schedules?: ScheduleRow[];
}

interface CreatedLoan {
  id: string;
  loan_number: string;
}

/** Add `days` to today (UTC) and return YYYY-MM-DD. */
function isoDateOffset(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Format a Date as YYYY-MM-DD (UTC). */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function getProductVersionId(token: string): Promise<string> {
  const res = await fetch(`${API_BASE}/loan-products`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  const products: LoanProduct[] = Array.isArray(body) ? body : body.data ?? [];
  const product = products[0];
  const id =
    product?.current_version_id ?? product?.current_version?.id ?? product?.id;
  if (!id) throw new Error('No active loan product / version found');
  return id;
}

async function createLoan(
  token: string,
  customerId: string,
  productVersionId: string,
): Promise<CreatedLoan> {
  const res = await fetch(`${API_BASE}/loans`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      customerId,
      productVersionId,
      principalPaise: 5000000,
      tenureMonths: 12,
      purpose: `E2E firstEmiDate test ${Date.now()}`,
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
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`Loan action ${action} failed: ${await res.text()}`);
  }
}

/** Drive a loan from draft to under_review so Approve becomes available. */
async function bringLoanToUnderReview(
  foToken: string,
  managerToken: string,
  loanId: string,
): Promise<void> {
  await loanAction(foToken, loanId, 'submit');
  await loanAction(managerToken, loanId, 'review');
}

/** Drive a loan from draft to approved so Disburse becomes available. */
async function bringLoanToApproved(
  foToken: string,
  managerToken: string,
  loanId: string,
): Promise<void> {
  await bringLoanToUnderReview(foToken, managerToken, loanId);
  await loanAction(managerToken, loanId, 'approve');
}

test.describe('Loan firstEmiDate override (approve & disburse dialogs)', () => {
  let foToken: string;
  let managerToken: string;
  let productVersionId: string;

  test.beforeAll(async () => {
    foToken = await getTokenForRole('field_officer');
    managerToken = await getTokenForRole('manager');
    productVersionId = await getProductVersionId(foToken);
  });

  test('approve dialog renders the optional First EMI Date input with min=tomorrow', async ({
    managerPage,
  }) => {
    const customerId = await createTestCustomer(foToken);
    const { id } = await createLoan(foToken, customerId, productVersionId);
    await bringLoanToUnderReview(foToken, managerToken, id);

    await managerPage.goto(`/loans/${id}`);
    await managerPage.waitForLoadState('domcontentloaded');
    await expect(
      managerPage.locator('span', { hasText: /under.review/i }).first(),
    ).toBeVisible({ timeout: 30_000 });

    await managerPage.getByRole('button', { name: /^approve$/i }).click();

    const dialog = managerPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    // Confirm the optional first-EMI input is present and gated against past
    // dates by HTML5 `min` (tomorrowIST). We don't read tomorrowIST directly
    // — instead we assert the attribute is set to a YYYY-MM-DD string that is
    // strictly after today, which is the contract the page is keeping.
    const dateInput = dialog.locator('#approve-first-emi');
    await expect(dateInput).toBeVisible({ timeout: 15_000 });
    const min = await dateInput.getAttribute('min');
    expect(min).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(min! > isoDateOffset(0)).toBe(true);
    await expect(
      dialog.getByText(/leave empty to use default/i),
    ).toBeVisible();
  });

  test('approve with an explicit firstEmiDate shifts the schedule to that date (golden path)', async ({
    managerPage,
  }) => {
    const customerId = await createTestCustomer(foToken);
    const { id } = await createLoan(foToken, customerId, productVersionId);
    await bringLoanToUnderReview(foToken, managerToken, id);

    // Pick a date well into the future so it can't accidentally match the
    // server's default (approval + 1 payment period) — that way an assertion
    // failure is conclusive rather than a coincidence.
    const targetIso = isoDateOffset(45);

    await managerPage.goto(`/loans/${id}`);
    await managerPage.waitForLoadState('domcontentloaded');
    await expect(
      managerPage.locator('span', { hasText: /under.review/i }).first(),
    ).toBeVisible({ timeout: 30_000 });

    await managerPage.getByRole('button', { name: /^approve$/i }).click();

    const dialog = managerPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await dialog.locator('#approve-first-emi').fill(targetIso);
    await dialog.getByRole('button', { name: /^approve$/i }).click();

    await expect(
      managerPage.locator('span', { hasText: /^approved$/i }).first(),
    ).toBeVisible({ timeout: 30_000 });

    // Verify the persisted schedule's first installment lands on the picked
    // date, not the default — this is the entire point of the override.
    const after = await apiRequest<LoanResponse>(
      'GET',
      `/loans/${id}`,
      managerToken,
    );
    expect(after.first_due_date ? String(after.first_due_date).slice(0, 10) : null).toBe(
      targetIso,
    );
    const sorted = (after.schedules ?? [])
      .slice()
      .sort((a, b) => a.installment_number - b.installment_number);
    expect(sorted.length).toBeGreaterThan(0);
    expect(String(sorted[0].due_date).slice(0, 10)).toBe(targetIso);
  });

  test('approve with a past firstEmiDate surfaces FIRST_EMI_DATE_NOT_FUTURE and does not advance the loan', async ({
    managerPage,
  }) => {
    const customerId = await createTestCustomer(foToken);
    const { id } = await createLoan(foToken, customerId, productVersionId);
    await bringLoanToUnderReview(foToken, managerToken, id);

    // The picker's `min` attribute would block this through the spinner UI,
    // but `fill()` writes the value programmatically — which is exactly how
    // we reach the server-side FIRST_EMI_DATE_NOT_FUTURE branch.
    const pastIso = isoDateOffset(-3);

    await managerPage.goto(`/loans/${id}`);
    await managerPage.waitForLoadState('domcontentloaded');
    await expect(
      managerPage.locator('span', { hasText: /under.review/i }).first(),
    ).toBeVisible({ timeout: 30_000 });

    await managerPage.getByRole('button', { name: /^approve$/i }).click();

    const dialog = managerPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await dialog.locator('#approve-first-emi').fill(pastIso);
    await dialog.getByRole('button', { name: /^approve$/i }).click();

    // Mapped page message OR raw backend code — both are acceptable surfaces.
    const errorPattern =
      /(first emi date must be in the future|FIRST_EMI_DATE_NOT_FUTURE)/i;
    await expect(
      managerPage.getByText(errorPattern).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Loan must remain in under_review — no schedule should have been written.
    const after = await apiRequest<LoanResponse>(
      'GET',
      `/loans/${id}`,
      managerToken,
    );
    expect(after.status).toBe('under_review');
    expect(after.first_due_date ?? null).toBeNull();
  });

  test('disburse with an explicit firstEmiDate re-shifts the schedule (golden path)', async ({
    managerPage,
  }) => {
    const customerId = await createTestCustomer(foToken);
    const { id } = await createLoan(foToken, customerId, productVersionId);
    await bringLoanToApproved(foToken, managerToken, id);

    // Snapshot the schedule produced by the default approve path so we can
    // assert the disburse-time override genuinely changes it.
    const before = await apiRequest<LoanResponse>(
      'GET',
      `/loans/${id}`,
      managerToken,
    );
    const originalFirstDue = before.first_due_date
      ? String(before.first_due_date).slice(0, 10)
      : null;

    // Pick a date that differs from the default by a wide margin.
    const targetDate = new Date();
    targetDate.setUTCDate(targetDate.getUTCDate() + 60);
    const targetIso = isoDate(targetDate);
    // Defensive: don't collide with the original first_due_date.
    expect(targetIso).not.toBe(originalFirstDue);

    await managerPage.goto(`/loans/${id}`);
    await managerPage.waitForLoadState('domcontentloaded');
    await expect(
      managerPage.locator('span', { hasText: /^approved$/i }).first(),
    ).toBeVisible({ timeout: 30_000 });

    await managerPage.getByRole('button', { name: /^disburse$/i }).click();

    const dialog = managerPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    // Leave payment mode at default "cash" — the bank_transfer reference
    // requirement is already covered in loan-lifecycle.playwright.spec.ts.
    await dialog.locator('#disburse-first-emi').fill(targetIso);
    await dialog.getByRole('button', { name: /^disburse$/i }).click();

    await expect(
      managerPage.locator('span', { hasText: /^active$/i }).first(),
    ).toBeVisible({ timeout: 30_000 });

    const after = await apiRequest<LoanResponse>(
      'GET',
      `/loans/${id}`,
      managerToken,
    );
    expect(after.first_due_date ? String(after.first_due_date).slice(0, 10) : null).toBe(
      targetIso,
    );
    const sorted = (after.schedules ?? [])
      .slice()
      .sort((a, b) => a.installment_number - b.installment_number);
    expect(sorted.length).toBeGreaterThan(0);
    expect(String(sorted[0].due_date).slice(0, 10)).toBe(targetIso);
    // Sanity: every row is still pending (no collections posted in this test).
    for (const row of sorted) {
      expect(row.status).toBe('pending');
    }
  });

  test('disburse with a firstEmiDate before disbursement date surfaces the validation error and keeps loan approved', async ({
    managerPage,
  }) => {
    const customerId = await createTestCustomer(foToken);
    const { id } = await createLoan(foToken, customerId, productVersionId);
    await bringLoanToApproved(foToken, managerToken, id);

    // We use a past date — disbursement will happen "today" (server-side IST),
    // so a strictly-past date provokes either FIRST_EMI_DATE_NOT_FUTURE or
    // FIRST_EMI_DATE_BEFORE_DISBURSEMENT. Either is a valid failure surface;
    // we accept both rather than overfitting to one server branch.
    const pastIso = isoDateOffset(-1);

    await managerPage.goto(`/loans/${id}`);
    await managerPage.waitForLoadState('domcontentloaded');
    await expect(
      managerPage.locator('span', { hasText: /^approved$/i }).first(),
    ).toBeVisible({ timeout: 30_000 });

    await managerPage.getByRole('button', { name: /^disburse$/i }).click();

    const dialog = managerPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await dialog.locator('#disburse-first-emi').fill(pastIso);
    await dialog.getByRole('button', { name: /^disburse$/i }).click();

    const errorPattern =
      /(first emi date must be (after the disbursement|in the future)|FIRST_EMI_DATE_(NOT_FUTURE|BEFORE_DISBURSEMENT))/i;
    await expect(
      managerPage.getByText(errorPattern).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Loan must still be approved (not active) and have no disbursement date.
    const after = await apiRequest<LoanResponse>(
      'GET',
      `/loans/${id}`,
      managerToken,
    );
    expect(after.status).toBe('approved');
    expect(after.disbursement_date ?? null).toBeNull();
  });

  test('field officer cannot open the Approve dialog on an under-review loan (RBAC)', async ({
    fieldOfficerPage,
  }) => {
    const customerId = await createTestCustomer(foToken);
    const { id } = await createLoan(foToken, customerId, productVersionId);
    await bringLoanToUnderReview(foToken, managerToken, id);

    await fieldOfficerPage.goto(`/loans/${id}`);
    await fieldOfficerPage.waitForLoadState('domcontentloaded');
    await expect(
      fieldOfficerPage.locator('span', { hasText: /under.review/i }).first(),
    ).toBeVisible({ timeout: 30_000 });

    // The Approve button is gated by PermissionGate("loan.approve") which
    // the field_officer role does not hold. The trigger must be absent, and
    // therefore the optional firstEmiDate input it owns is unreachable.
    await expect(
      fieldOfficerPage.getByRole('button', { name: /^approve$/i }),
    ).not.toBeVisible();
    await expect(
      fieldOfficerPage.locator('#approve-first-emi'),
    ).not.toBeVisible();
  });
});
