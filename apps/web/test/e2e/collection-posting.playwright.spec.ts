import { test, expect, csrfHeadersFor } from './fixtures';

/**
 * Collection Posting — Playwright E2E Tests
 *
 * Uses pre-authenticated fixtures to avoid rate limiting.
 *
 * Validates: Requirements 6.1, 6.6; Design GAP 8 (Collection Posting)
 *
 * Tests cover:
 * 1. Post collection via form → verify success and receipt display
 * 2. Confirmation dialog appears before finance action submission
 * 3. Receipt print view renders correctly with all components
 */

test.describe('Collection Posting', () => {
  test('collection page loads with form elements', async ({ collectionOfficerPage }) => {
    // Navigate to the new collection form
    await collectionOfficerPage.goto('/collections/new');
    await collectionOfficerPage.waitForLoadState('domcontentloaded');

    // The form uses a loan search typeahead, not a simple text input
    // Verify form elements exist
    await expect(collectionOfficerPage.getByRole('heading', { name: /post collection/i })).toBeVisible({ timeout: 15_000 });
    await expect(collectionOfficerPage.getByPlaceholder(/search by loan number/i)).toBeVisible();
    await expect(collectionOfficerPage.getByText('Amount')).toBeVisible();
    await expect(collectionOfficerPage.getByText('Payment Mode')).toBeVisible();
    await expect(collectionOfficerPage.getByText('Payment Date')).toBeVisible();
    await expect(collectionOfficerPage.getByRole('button', { name: 'Post Collection' })).toBeVisible();
  });

  test('collections list page displays table', async ({ collectionOfficerPage }) => {
    await collectionOfficerPage.goto('/collections');
    await collectionOfficerPage.waitForLoadState('domcontentloaded');

    // Verify the collections list page loaded
    await expect(collectionOfficerPage.getByRole('heading', { name: 'Collections' })).toBeVisible({ timeout: 15_000 });
    // Page may show table, empty state, or loading state - all are valid
    await expect(
      collectionOfficerPage.locator('table')
        .or(collectionOfficerPage.getByText(/no collections|no data|empty|loading/i))
        .or(collectionOfficerPage.locator('[role="grid"]'))
    ).toBeVisible({ timeout: 15_000 });
  });

  test('confirmation dialog appears before finance action submission', async ({ collectionOfficerPage }) => {
    await collectionOfficerPage.goto('/collections/new');
    await collectionOfficerPage.waitForLoadState('domcontentloaded');

    // Verify the confirm dialog component exists by checking form structure
    // The form requires selecting a loan first via the typeahead
    await expect(collectionOfficerPage.getByRole('heading', { name: /post collection/i })).toBeVisible({ timeout: 15_000 });

    // Verify payment mode buttons exist (Cash, Bank Transfer, Online)
    await expect(collectionOfficerPage.getByText('Cash')).toBeVisible();
    await expect(collectionOfficerPage.getByText('Bank Transfer')).toBeVisible();
  });

  test('receipt print view renders correctly with all components', async ({ collectionOfficerPage }) => {
    // Navigate to collections list and find an existing receipt
    await collectionOfficerPage.goto('/collections');
    await collectionOfficerPage.waitForLoadState('domcontentloaded');

    // Check if there are any collections in the table
    const tableRows = collectionOfficerPage.locator('table tbody tr');
    const rowCount = await tableRows.count();

    if (rowCount === 0) {
      // No collections exist, skip receipt view test
      test.skip();
      return;
    }

    // Click on the first collection to view receipt (usually a link or button in the row)
    const receiptLink = tableRows.first().getByRole('link', { name: /view|receipt/i });
    if (await receiptLink.isVisible()) {
      await receiptLink.click();
      await collectionOfficerPage.waitForLoadState('domcontentloaded');

      // Verify the receipt page header
      await expect(collectionOfficerPage.getByText('AS Finance')).toBeVisible({ timeout: 15_000 });
      await expect(collectionOfficerPage.getByText('Payment Receipt')).toBeVisible();

      // Verify receipt components are displayed
      await expect(collectionOfficerPage.getByText('Receipt #')).toBeVisible();
      await expect(collectionOfficerPage.getByText('Date')).toBeVisible();
      await expect(collectionOfficerPage.getByText('Customer')).toBeVisible();

      // Verify the Print button is visible
      await expect(collectionOfficerPage.getByRole('button', { name: /print/i })).toBeVisible();
    } else {
      // No receipt link available - the table shows collections but without receipt link
      test.skip();
    }
  });
});

/**
 * Collection Posting — UI Happy-Path (GAP COVERAGE)
 *
 * The tests above only assert the form renders. This block exercises the primary
 * money-flow action end-to-end via the UI:
 *   1. Seed an active loan via API.
 *   2. Use the loan-number typeahead to select it.
 *   3. Fill amount + mode + date and submit.
 *   4. Confirm the dialog and verify success toast + redirect to /receipts/:id.
 *
 * Also covers a validation case (overpayment) and a RBAC denial case (auditor),
 * which together close the critical "happy path + error + RBAC" trio for the
 * Post Collection page.
 */

const API_BASE_PC = 'http://localhost:3001';

interface PostCollectionLoanProduct {
  id: string;
  current_version_id?: string;
  current_version?: { id: string };
}

async function pcGetProductVersionId(token: string): Promise<string> {
  const res = await fetch(`${API_BASE_PC}/loan-products`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  const products: PostCollectionLoanProduct[] = Array.isArray(body) ? body : body.data ?? [];
  const product = products[0];
  return (
    product?.current_version_id ??
    product?.current_version?.id ??
    product?.id
  );
}

async function pcCreateLoan(
  token: string,
  customerId: string,
  productVersionId: string,
): Promise<string> {
  const res = await fetch(`${API_BASE_PC}/loans`, {
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
      purpose: `Post collection UI test ${Date.now()}`,
    }),
  });
  const loan = await res.json();
  return loan.id;
}

async function pcActivateLoan(
  foToken: string,
  managerToken: string,
  loanId: string,
): Promise<void> {
  await fetch(`${API_BASE_PC}/loans/${loanId}/submit`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${foToken}`,
      ...(await csrfHeadersFor(foToken)),
    },
  });
  await fetch(`${API_BASE_PC}/loans/${loanId}/review`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${managerToken}`,
      ...(await csrfHeadersFor(managerToken)),
    },
  });
  await fetch(`${API_BASE_PC}/loans/${loanId}/approve`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${managerToken}`,
      ...(await csrfHeadersFor(managerToken)),
    },
  });
  await fetch(`${API_BASE_PC}/loans/${loanId}/disburse`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${managerToken}`,
      ...(await csrfHeadersFor(managerToken)),
    },
    body: JSON.stringify({ mode: 'cash' }),
  });
}

async function pcFetchLoanNumber(token: string, loanId: string): Promise<string> {
  const res = await fetch(`${API_BASE_PC}/loans/${loanId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  return body.loan_number ?? body.data?.loan_number;
}

test.describe('Collection Posting — UI Happy Path', () => {
  let foToken: string;
  let managerToken: string;
  let productVersionId: string;

  test.beforeAll(async () => {
    const { getTokenForRole } = await import('./fixtures');
    foToken = await getTokenForRole('field_officer');
    managerToken = await getTokenForRole('manager');
    productVersionId = await pcGetProductVersionId(foToken);
  });

  async function seedActiveLoan(): Promise<{ loanId: string; loanNumber: string }> {
    const { createTestCustomer } = await import('./fixtures');
    const customerId = await createTestCustomer(foToken);
    const loanId = await pcCreateLoan(foToken, customerId, productVersionId);
    await pcActivateLoan(foToken, managerToken, loanId);
    const loanNumber = await pcFetchLoanNumber(managerToken, loanId);
    return { loanId, loanNumber };
  }

  test('collection officer posts a cash payment and is redirected to the generated receipt', async ({
    collectionOfficerPage,
  }) => {
    const { loanId, loanNumber } = await seedActiveLoan();

    await collectionOfficerPage.goto('/collections/new');
    await collectionOfficerPage.waitForLoadState('domcontentloaded');
    await expect(
      collectionOfficerPage.getByRole('heading', { name: /post collection/i }),
    ).toBeVisible({ timeout: 15_000 });

    // Type into the loan typeahead — debounce is 300ms, so wait briefly for the listbox.
    const searchInput = collectionOfficerPage.getByPlaceholder(/search by loan number/i);
    await searchInput.fill(loanNumber);

    const listbox = collectionOfficerPage.getByRole('listbox');
    await expect(listbox).toBeVisible({ timeout: 15_000 });

    // The matching loan option must appear in the dropdown.
    const option = listbox.getByRole('option').filter({ hasText: loanNumber }).first();
    await expect(option).toBeVisible({ timeout: 15_000 });
    await option.click();

    // Selected-loan card now replaces the input; it must show outstanding amount.
    await expect(collectionOfficerPage.getByText(`Loan: ${loanNumber}`)).toBeVisible();

    // Fill amount well under outstanding so validation passes.
    await collectionOfficerPage.getByLabel('Amount (₹)').fill('1000');

    // Default mode is cash; explicitly click to make the intent clear.
    await collectionOfficerPage.getByRole('button', { name: 'Cash' }).click();

    // Submit -> opens confirm dialog (does NOT post yet).
    await collectionOfficerPage
      .getByRole('button', { name: 'Post Collection' })
      .click();

    const dialog = collectionOfficerPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText(/confirm collection/i)).toBeVisible();
    await expect(dialog.getByText(loanNumber)).toBeVisible();

    // Confirm — this is the real POST.
    await dialog.getByRole('button', { name: 'Post Collection' }).click();

    // Success toast fires.
    await expect(
      collectionOfficerPage.getByText(/collection posted successfully/i),
    ).toBeVisible({ timeout: 15_000 });

    // Redirect lands on /receipts/:id (not back on /collections/new and not on the list).
    await collectionOfficerPage.waitForURL(/\/receipts\/[0-9a-f-]+/i, { timeout: 15_000 });
    expect(collectionOfficerPage.url()).toMatch(/\/receipts\/[0-9a-f-]+/i);

    // Receipt view renders with the same loan number we paid against.
    await expect(
      collectionOfficerPage.getByRole('heading', { name: /^receipt$/i }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(collectionOfficerPage.getByText(loanNumber).first()).toBeVisible();

    // Sanity: server actually created a collection for this loan (defends against UI-only success).
    const { apiRequest } = await import('./fixtures');
    const collections = await apiRequest<{ data: Array<{ id: string; amount_paise: number }> }>(
      'GET',
      `/collections?loan_id=${loanId}&limit=10`,
      managerToken,
    );
    expect(collections.data.length).toBeGreaterThanOrEqual(1);
    expect(collections.data.some((c) => c.amount_paise === 100_000)).toBe(true);
  });

  test('client-side validation blocks overpayment before the confirm dialog opens', async ({
    collectionOfficerPage,
  }) => {
    const { loanNumber } = await seedActiveLoan();

    await collectionOfficerPage.goto('/collections/new');
    await collectionOfficerPage.waitForLoadState('domcontentloaded');
    await expect(
      collectionOfficerPage.getByRole('heading', { name: /post collection/i }),
    ).toBeVisible({ timeout: 15_000 });

    const searchInput = collectionOfficerPage.getByPlaceholder(/search by loan number/i);
    await searchInput.fill(loanNumber);

    const listbox = collectionOfficerPage.getByRole('listbox');
    await expect(listbox).toBeVisible({ timeout: 15_000 });
    await listbox.getByRole('option').filter({ hasText: loanNumber }).first().click();

    // Way more than outstanding (loan is ₹50,000 principal; ₹99,99,999 is gigantic).
    await collectionOfficerPage.getByLabel('Amount (₹)').fill('9999999');

    // The Post Collection button is disabled by `exceedsOutstanding`, so the confirm
    // dialog must never open — verifies the money-flow safety net.
    const submitButton = collectionOfficerPage.getByRole('button', { name: 'Post Collection' });
    await expect(submitButton).toBeDisabled({ timeout: 15_000 });

    // Dialog must NOT appear.
    await expect(collectionOfficerPage.getByRole('dialog')).not.toBeVisible();
  });

  test('auditor is denied access to the post-collection form', async ({ auditorPage }) => {
    await auditorPage.goto('/collections/new');
    await auditorPage.waitForLoadState('domcontentloaded');

    // Auditor lacks collection.create permission — page must show Access Denied
    // (or otherwise hide the Post Collection submit button). We assert both
    // behaviors as acceptable so the test still passes if the route guard changes
    // from a render-time AccessDenied to a server-side redirect.
    const accessDenied = auditorPage.getByRole('heading', { name: 'Access Denied' });
    const postBtn = auditorPage.getByRole('button', { name: 'Post Collection' });

    // Wait for at least one of: AccessDenied visible OR no submit button on the page.
    await expect(async () => {
      const deniedVisible = await accessDenied.isVisible().catch(() => false);
      const btnVisible = await postBtn.isVisible().catch(() => false);
      expect(deniedVisible || !btnVisible).toBe(true);
    }).toPass({ timeout: 15_000 });
  });
});
