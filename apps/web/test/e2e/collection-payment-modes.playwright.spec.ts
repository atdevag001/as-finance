import {
  test,
  expect,
  getTokenForRole,
  apiRequest,
  createTestCustomer,
  createTestLoan,
  advanceLoanToStatus,
} from './fixtures';

/**
 * Collection Payment Modes — Bank Transfer & Online — Playwright E2E
 *
 * Closes coverage gap: the existing `collection-posting.playwright.spec.ts`
 * only smoke-tests the form. No spec exercises selecting the non-cash
 * payment modes (`bank_transfer`, `online`) end-to-end, nor verifies that
 * the posted collection is persisted with the correct mode label and that
 * the confirm dialog and final receipt reflect the selected mode.
 *
 * Validates: Requirements 6.1, 6.2 — `paymentMode` enum (`cash`, `bank_transfer`, `online`)
 * Validates: Design GAP 8 — Collection posting, all payment channels
 *
 * Scenarios:
 * 1. Golden path: Bank Transfer end-to-end (form -> confirm -> API -> persisted)
 * 2. Golden path: Online end-to-end
 * 3. Confirm dialog labels — humanised mode strings ("Bank Transfer", "Online")
 * 4. API validation — invalid `paymentMode` enum value is rejected
 * 5. RBAC denial — auditor cannot reach the post collection form
 */

interface CollectionApiRecord {
  id: string;
  payment_mode: string;
  amount_paise: number;
  status: string;
}

interface CollectionListResponse {
  data: CollectionApiRecord[];
}

interface LoanLite {
  id: string;
  loan_number: string;
}

test.describe('Collection Payment Modes — Bank Transfer & Online', () => {
  let managerToken: string;
  let coToken: string;

  // Seed a separate loan per payment-mode test so allocations don't bleed across cases.
  async function seedActiveLoan(): Promise<LoanLite> {
    const customerId = await createTestCustomer(managerToken, {
      fullName: `Payment Mode Test ${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    });
    const loanId = await createTestLoan(managerToken, customerId, undefined, {
      principalPaise: 5000000, // ₹50,000
      tenureMonths: 12,
    });
    await advanceLoanToStatus(managerToken, loanId, 'active');
    const loan = await apiRequest<LoanLite>('GET', `/loans/${loanId}`, managerToken);
    return loan;
  }

  test.beforeAll(async () => {
    managerToken = await getTokenForRole('manager');
    coToken = await getTokenForRole('collection_officer');
  });

  test('Bank Transfer collection posts end-to-end and persists with payment_mode=bank_transfer', async ({ collectionOfficerPage }) => {
    const loan = await seedActiveLoan();

    await collectionOfficerPage.goto('/collections/new');
    await collectionOfficerPage.waitForLoadState('domcontentloaded');
    await expect(
      collectionOfficerPage.getByRole('heading', { name: /post collection/i }),
    ).toBeVisible({ timeout: 15_000 });

    // Typeahead select the seeded loan.
    const searchBox = collectionOfficerPage.getByPlaceholder(/search by loan number/i);
    await searchBox.fill(loan.loan_number);

    // Typeahead is debounced 300ms server-side; listbox loads with up to two parallel queries,
    // so 15s covers both round-trips in CI.
    const listbox = collectionOfficerPage.getByRole('listbox');
    await expect(listbox).toBeVisible({ timeout: 15_000 });
    await listbox.getByText(loan.loan_number, { exact: false }).first().click();

    // Confirm the loan card replaced the search input.
    await expect(collectionOfficerPage.getByText(`Loan: ${loan.loan_number}`)).toBeVisible({ timeout: 5_000 });

    // Fill amount, pick Bank Transfer mode.
    await collectionOfficerPage.getByLabel(/amount/i).fill('1500');
    await collectionOfficerPage.getByRole('button', { name: 'Bank Transfer' }).click();

    // Submit -> confirm dialog opens.
    await collectionOfficerPage.getByRole('button', { name: 'Post Collection' }).click();

    const dialog = collectionOfficerPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    // The dialog must render the humanised mode label (the page swaps `_` for space).
    await expect(dialog.getByText(/bank transfer/i)).toBeVisible();

    // Confirm — submit to API.
    await dialog.getByRole('button', { name: 'Post Collection' }).click();

    // On success, app routes to /receipts/:id (URL-level proof the POST succeeded).
    await expect(collectionOfficerPage).toHaveURL(/\/receipts\/[0-9a-f-]+/, { timeout: 20_000 });

    // Cross-check persistence via API — payment_mode must equal 'bank_transfer'.
    const list = await apiRequest<CollectionListResponse>(
      'GET',
      `/collections?loan_id=${loan.id}`,
      managerToken,
    );
    const posted = list.data?.find((c) => c.amount_paise === 150000);
    expect(posted, 'newly posted collection should be retrievable').toBeDefined();
    expect(posted!.payment_mode).toBe('bank_transfer');
  });

  test('Online collection posts end-to-end and persists with payment_mode=online', async ({ collectionOfficerPage }) => {
    const loan = await seedActiveLoan();

    await collectionOfficerPage.goto('/collections/new');
    await collectionOfficerPage.waitForLoadState('domcontentloaded');
    await expect(
      collectionOfficerPage.getByRole('heading', { name: /post collection/i }),
    ).toBeVisible({ timeout: 15_000 });

    const searchBox = collectionOfficerPage.getByPlaceholder(/search by loan number/i);
    await searchBox.fill(loan.loan_number);

    const listbox = collectionOfficerPage.getByRole('listbox');
    await expect(listbox).toBeVisible({ timeout: 15_000 });
    await listbox.getByText(loan.loan_number, { exact: false }).first().click();

    await expect(collectionOfficerPage.getByText(`Loan: ${loan.loan_number}`)).toBeVisible({ timeout: 5_000 });

    await collectionOfficerPage.getByLabel(/amount/i).fill('2500');
    await collectionOfficerPage.getByRole('button', { name: 'Online' }).click();

    await collectionOfficerPage.getByRole('button', { name: 'Post Collection' }).click();

    const dialog = collectionOfficerPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText(/^online$/i)).toBeVisible();

    await dialog.getByRole('button', { name: 'Post Collection' }).click();

    await expect(collectionOfficerPage).toHaveURL(/\/receipts\/[0-9a-f-]+/, { timeout: 20_000 });

    const list = await apiRequest<CollectionListResponse>(
      'GET',
      `/collections?loan_id=${loan.id}`,
      managerToken,
    );
    const posted = list.data?.find((c) => c.amount_paise === 250000);
    expect(posted, 'newly posted collection should be retrievable').toBeDefined();
    expect(posted!.payment_mode).toBe('online');
  });

  test('confirm dialog renders the humanised payment-mode label for Bank Transfer', async ({ collectionOfficerPage }) => {
    const loan = await seedActiveLoan();

    await collectionOfficerPage.goto('/collections/new');
    await collectionOfficerPage.waitForLoadState('domcontentloaded');

    const searchBox = collectionOfficerPage.getByPlaceholder(/search by loan number/i);
    await searchBox.fill(loan.loan_number);

    const listbox = collectionOfficerPage.getByRole('listbox');
    await expect(listbox).toBeVisible({ timeout: 15_000 });
    await listbox.getByText(loan.loan_number, { exact: false }).first().click();

    await expect(collectionOfficerPage.getByText(`Loan: ${loan.loan_number}`)).toBeVisible({ timeout: 5_000 });

    await collectionOfficerPage.getByLabel(/amount/i).fill('500');
    await collectionOfficerPage.getByRole('button', { name: 'Bank Transfer' }).click();
    await collectionOfficerPage.getByRole('button', { name: 'Post Collection' }).click();

    const dialog = collectionOfficerPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Dialog must show the loan number, amount and the humanised "Bank Transfer" — not "bank_transfer".
    await expect(dialog.getByText(loan.loan_number)).toBeVisible();
    await expect(dialog.getByText(/bank transfer/i)).toBeVisible();
    await expect(dialog.getByText('bank_transfer')).not.toBeVisible();
  });

  test('API rejects collection posted with an invalid paymentMode enum value', async () => {
    const loan = await seedActiveLoan();

    // Direct API call — the form only exposes the three valid modes via buttons,
    // but the server must still defend against rogue clients.
    const res = await fetch('http://localhost:3001/collections', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${coToken}`,
      },
      body: JSON.stringify({
        loanId: loan.id,
        amountPaise: 100000,
        paymentDate: new Date().toISOString().split('T')[0],
        paymentMode: 'cheque', // not in enum
        idempotencyKey: `e2e-invalid-mode-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      }),
    });

    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
    const body = await res.json();
    // class-validator emits an array under `message` for DTO failures.
    const msg = JSON.stringify(body.message ?? body);
    expect(msg.toLowerCase()).toMatch(/paymentmode|cash|bank_transfer|online/);
  });

  test('auditor cannot post a Bank Transfer collection (RBAC denial)', async ({ auditorPage }) => {
    await auditorPage.goto('/collections/new');
    // Allow extra time for the access-denied redirect / guard to evaluate after navigation.
    await auditorPage.waitForLoadState('domcontentloaded');

    // Auditors must NOT see the Post Collection submit button on this page — either the
    // route is denied (redirected) or the form is unreachable.
    const submitButton = auditorPage.getByRole('button', { name: 'Post Collection' });
    const denied =
      (await auditorPage.getByText(/access denied|forbidden|not authorized|unauthorized/i).first().isVisible().catch(() => false)) ||
      !auditorPage.url().includes('/collections/new') ||
      !(await submitButton.isVisible().catch(() => false));

    expect(denied, 'auditor should be denied access to /collections/new').toBe(true);

    // Belt-and-braces: even if the form somehow renders, attempting to POST via API as auditor
    // should be rejected by the server-side guard.
    const apiRes = await fetch('http://localhost:3001/collections', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await getTokenForRole('viewer_auditor')}`,
      },
      body: JSON.stringify({
        loanId: '00000000-0000-0000-0000-000000000000',
        amountPaise: 100000,
        paymentDate: new Date().toISOString().split('T')[0],
        paymentMode: 'bank_transfer',
        idempotencyKey: `e2e-rbac-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      }),
    });
    // 403 forbidden is the expected RBAC denial; 401 is also acceptable if the role lacks auth.
    expect([401, 403]).toContain(apiRes.status);
  });
});
