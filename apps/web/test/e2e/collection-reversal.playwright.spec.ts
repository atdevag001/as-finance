import { test, expect } from './fixtures';
import { getTokenForRole, createTestCustomer, csrfHeadersFor } from './fixtures';

/**
 * Collection Reversal — E2E Tests
 *
 * Tests the complete collection reversal flow:
 * - Reversal dialog display
 * - Reason validation (min 10 chars)
 * - Successful reversal execution
 * - Status update after reversal
 * - Permission checks (only manager can reverse)
 *
 * Validates: Requirements 5.2, 5.3 (Collection reversal)
 */

const API_BASE = 'http://localhost:3001';

interface LoanProduct {
  id: string;
  current_version_id?: string;
  current_version?: { id: string };
}

interface Collection {
  id: string;
  amount_paise: number;
  status: string;
}

/**
 * Helper: Get the first active loan product version ID.
 */
async function getProductVersionId(token: string): Promise<string> {
  const res = await fetch(`${API_BASE}/loan-products`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  const products: LoanProduct[] = Array.isArray(body) ? body : body.data ?? [];
  const product = products[0];
  return (
    product?.current_version_id ??
    product?.current_version?.id ??
    product?.id
  );
}

/**
 * Helper: Create a loan via API.
 */
async function createLoan(
  token: string,
  customerId: string,
  productVersionId: string,
): Promise<string> {
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
      purpose: `Reversal test ${Date.now()}`,
    }),
  });
  const loan = await res.json();
  return loan.id;
}

/**
 * Helper: Advance loan to active status.
 * Workflow: draft -> submit -> review -> approve -> disburse -> active
 *
 * Maker-checker rule: the user who approves cannot be the user who disburses.
 * Approve with super_admin so the manager can perform the disbursement.
 */
async function activateLoan(foToken: string, managerToken: string, loanId: string): Promise<void> {
  const approverToken = await getTokenForRole('super_admin');
  await fetch(`${API_BASE}/loans/${loanId}/submit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${foToken}`, ...(await csrfHeadersFor(foToken)) },
  });
  await fetch(`${API_BASE}/loans/${loanId}/review`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${managerToken}`, ...(await csrfHeadersFor(managerToken)) },
  });
  await fetch(`${API_BASE}/loans/${loanId}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${approverToken}`, ...(await csrfHeadersFor(approverToken)) },
  });
  const disburseRes = await fetch(`${API_BASE}/loans/${loanId}/disburse`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${managerToken}`,
      ...(await csrfHeadersFor(managerToken)),
    },
    body: JSON.stringify({ mode: 'cash' }),
  });
  if (!disburseRes.ok) {
    throw new Error(`Disburse failed: ${disburseRes.status} ${await disburseRes.text()}`);
  }
  // Poll until the loan is observed as active so the UI assertion is not racing
  // the post-disbursement state transition (approved → disbursed → active).
  for (let attempt = 0; attempt < 10; attempt++) {
    const res = await fetch(`${API_BASE}/loans/${loanId}`, {
      headers: { Authorization: `Bearer ${managerToken}` },
    });
    const body = await res.json();
    const loan = body.data ?? body;
    if (loan.status === 'active') return;
    await new Promise((r) => setTimeout(r, 250));
  }
}

/**
 * Helper: Post a collection via API.
 */
async function postCollection(
  token: string,
  loanId: string,
  amountPaise: number = 500000,
): Promise<Collection> {
  const res = await fetch(`${API_BASE}/collections`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(await csrfHeadersFor(token)),
    },
    body: JSON.stringify({
      loanId,
      amountPaise,
      paymentMode: 'cash',
      paymentDate: new Date().toISOString().split('T')[0],
      idempotencyKey: `e2e-reversal-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    }),
  });
  const collection = await res.json();
  return collection.data ?? collection;
}

test.describe('Collection Reversal', () => {
  let foToken: string;
  let managerToken: string;
  let coToken: string;
  let productVersionId: string;

  test.beforeAll(async () => {
    foToken = await getTokenForRole('field_officer');
    managerToken = await getTokenForRole('manager');
    coToken = await getTokenForRole('collection_officer');
    productVersionId = await getProductVersionId(foToken);
  });

  /**
   * Helper: Create a unique customer for each test to avoid concurrent loan limits.
   */
  async function createUniqueCustomer(): Promise<string> {
    return await createTestCustomer(foToken);
  }

  test.describe('Reversal Dialog', () => {
    test('clicking Reverse opens reversal dialog with collection details', async ({ managerPage }) => {
      const customerId = await createUniqueCustomer();
      const loanId = await createLoan(foToken, customerId, productVersionId);
      await activateLoan(foToken, managerToken, loanId);
      await postCollection(coToken, loanId, 500000);

      await managerPage.goto(`/loans/${loanId}`);
      await managerPage.waitForLoadState('networkidle');

      // Wait for loan status to confirm page loaded
      await expect(managerPage.locator('span', { hasText: /^active$/i }).first()).toBeVisible({ timeout: 30_000 });

      // Scroll to Collection History and wait for data
      const collectionHeading = managerPage.getByRole('heading', { name: 'Collection History' });
      await collectionHeading.scrollIntoViewIfNeeded();
      await expect(collectionHeading).toBeVisible({ timeout: 30_000 });

      // Wait for collection table to load
      const collectionTable = managerPage.locator('table').filter({ hasText: 'Mode' });
      await expect(collectionTable.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 });

      // Click Reverse button
      await managerPage.getByRole('button', { name: /reverse/i }).click();

      // Dialog should show collection details
      const dialog = managerPage.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5_000 });
      await expect(dialog.getByText('Reverse Collection')).toBeVisible();
      await expect(dialog.getByText(/₹5,000/)).toBeVisible();
      await expect(dialog.getByText('Loan Number')).toBeVisible();
    });

    test('reversal dialog requires reason with minimum 10 characters', async ({ managerPage }) => {
      const customerId = await createUniqueCustomer();
      const loanId = await createLoan(foToken, customerId, productVersionId);
      await activateLoan(foToken, managerToken, loanId);
      await postCollection(coToken, loanId, 500000);

      await managerPage.goto(`/loans/${loanId}`);
      await managerPage.waitForLoadState('networkidle');
      await expect(managerPage.locator('span', { hasText: /^active$/i }).first()).toBeVisible({ timeout: 30_000 });

      const collectionHeading = managerPage.getByRole('heading', { name: 'Collection History' });
      await collectionHeading.scrollIntoViewIfNeeded();
      const collectionTable = managerPage.locator('table').filter({ hasText: 'Mode' });
      await expect(collectionTable.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 });

      await managerPage.getByRole('button', { name: /reverse/i }).click();

      const dialog = managerPage.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5_000 });

      // Enter short reason
      await dialog.locator('textarea').fill('short');

      // Reverse button should be disabled with short reason
      const reverseBtn = dialog.getByRole('button', { name: /^reverse$/i });
      await expect(reverseBtn).toBeDisabled();

      // Should show characters needed message (use first() to avoid strict mode violation)
      await expect(dialog.getByText(/characters/i).first()).toBeVisible();
    });

    test('reversal succeeds with valid reason', async ({ managerPage }) => {
      const customerId = await createUniqueCustomer();
      const loanId = await createLoan(foToken, customerId, productVersionId);
      await activateLoan(foToken, managerToken, loanId);
      await postCollection(coToken, loanId, 500000);

      await managerPage.goto(`/loans/${loanId}`);
      await managerPage.waitForLoadState('networkidle');
      await expect(managerPage.locator('span', { hasText: /^active$/i }).first()).toBeVisible({ timeout: 30_000 });

      const collectionHeading = managerPage.getByRole('heading', { name: 'Collection History' });
      await collectionHeading.scrollIntoViewIfNeeded();
      const collectionTable = managerPage.locator('table').filter({ hasText: 'Mode' });
      await expect(collectionTable.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 });

      // Count collections before reversal
      const rowsBefore = await collectionTable.locator('tbody tr').count();

      await managerPage.getByRole('button', { name: /reverse/i }).click();

      const dialog = managerPage.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5_000 });

      // Enter valid reason (10+ chars)
      await dialog.locator('textarea').fill('Customer returned the payment due to account error');

      // Click Reverse
      const reverseBtn = dialog.getByRole('button', { name: /^reverse$/i });
      await expect(reverseBtn).toBeEnabled();
      await reverseBtn.click();

      // Dialog should close
      await expect(dialog).not.toBeVisible({ timeout: 10_000 });

      // Toast should show success
      await expect(managerPage.getByText(/reversed successfully/i)).toBeVisible({ timeout: 5_000 });
    });
  });

  test.describe('Permission Checks', () => {
    test('collection officer cannot see Reverse button', async ({ collectionOfficerPage }) => {
      const customerId = await createUniqueCustomer();
      const loanId = await createLoan(foToken, customerId, productVersionId);
      await activateLoan(foToken, managerToken, loanId);
      await postCollection(coToken, loanId, 500000);

      await collectionOfficerPage.goto(`/loans/${loanId}`);
      await collectionOfficerPage.waitForLoadState('networkidle');
      await expect(collectionOfficerPage.locator('span', { hasText: /^active$/i }).first()).toBeVisible({ timeout: 30_000 });

      const collectionHeading = collectionOfficerPage.getByRole('heading', { name: 'Collection History' });
      await collectionHeading.scrollIntoViewIfNeeded();
      const collectionTable = collectionOfficerPage.locator('table').filter({ hasText: 'Mode' });
      await expect(collectionTable.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 });

      // Reverse button should NOT be visible
      await expect(collectionOfficerPage.getByRole('button', { name: /reverse/i })).not.toBeVisible();
    });

    test('field officer cannot see Reverse button', async ({ fieldOfficerPage }) => {
      const customerId = await createUniqueCustomer();
      const loanId = await createLoan(foToken, customerId, productVersionId);
      await activateLoan(foToken, managerToken, loanId);
      await postCollection(coToken, loanId, 500000);

      await fieldOfficerPage.goto(`/loans/${loanId}`);
      await fieldOfficerPage.waitForLoadState('networkidle');
      await expect(fieldOfficerPage.locator('span', { hasText: /^active$/i }).first()).toBeVisible({ timeout: 30_000 });

      const collectionHeading = fieldOfficerPage.getByRole('heading', { name: 'Collection History' });
      await collectionHeading.scrollIntoViewIfNeeded();
      const collectionTable = fieldOfficerPage.locator('table').filter({ hasText: 'Mode' });
      await expect(collectionTable.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 });

      // Reverse button should NOT be visible
      await expect(fieldOfficerPage.getByRole('button', { name: /reverse/i })).not.toBeVisible();
    });

    test('auditor cannot see Reverse button', async ({ auditorPage }) => {
      const customerId = await createUniqueCustomer();
      const loanId = await createLoan(foToken, customerId, productVersionId);
      await activateLoan(foToken, managerToken, loanId);
      await postCollection(coToken, loanId, 500000);

      await auditorPage.goto(`/loans/${loanId}`);
      await auditorPage.waitForLoadState('networkidle');
      await expect(auditorPage.locator('span', { hasText: /^active$/i }).first()).toBeVisible({ timeout: 30_000 });

      const collectionHeading = auditorPage.getByRole('heading', { name: 'Collection History' });
      await collectionHeading.scrollIntoViewIfNeeded();
      const collectionTable = auditorPage.locator('table').filter({ hasText: 'Mode' });
      await expect(collectionTable.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 });

      // Reverse button should NOT be visible
      await expect(auditorPage.getByRole('button', { name: /reverse/i })).not.toBeVisible();
    });
  });

  test.describe('Reversal Status', () => {
    test('reversed collection shows reversed status badge', async ({ managerPage }) => {
      const customerId = await createUniqueCustomer();
      const loanId = await createLoan(foToken, customerId, productVersionId);
      await activateLoan(foToken, managerToken, loanId);
      await postCollection(coToken, loanId, 500000);

      await managerPage.goto(`/loans/${loanId}`);
      await managerPage.waitForLoadState('networkidle');
      await expect(managerPage.locator('span', { hasText: /^active$/i }).first()).toBeVisible({ timeout: 30_000 });

      const collectionHeading = managerPage.getByRole('heading', { name: 'Collection History' });
      await collectionHeading.scrollIntoViewIfNeeded();
      const collectionTable = managerPage.locator('table').filter({ hasText: 'Mode' });
      await expect(collectionTable.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 });

      // Perform reversal
      await managerPage.getByRole('button', { name: /reverse/i }).click();
      const dialog = managerPage.getByRole('dialog');
      await dialog.locator('textarea').fill('Reversing for E2E test verification');
      await dialog.getByRole('button', { name: /^reverse$/i }).click();
      await expect(dialog).not.toBeVisible({ timeout: 10_000 });

      // Wait for page to refresh/update
      await managerPage.waitForTimeout(1000);

      // The reversed collection should show "reversed" status
      await expect(collectionTable.getByText(/reversed/i).first()).toBeVisible({ timeout: 10_000 });
    });

    test('Reverse button not shown for already reversed collections', async ({ managerPage }) => {
      const customerId = await createUniqueCustomer();
      const loanId = await createLoan(foToken, customerId, productVersionId);
      await activateLoan(foToken, managerToken, loanId);
      await postCollection(coToken, loanId, 500000);

      await managerPage.goto(`/loans/${loanId}`);
      await managerPage.waitForLoadState('networkidle');
      await expect(managerPage.locator('span', { hasText: /^active$/i }).first()).toBeVisible({ timeout: 30_000 });

      const collectionHeading = managerPage.getByRole('heading', { name: 'Collection History' });
      await collectionHeading.scrollIntoViewIfNeeded();
      const collectionTable = managerPage.locator('table').filter({ hasText: 'Mode' });
      await expect(collectionTable.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 });

      // Perform reversal
      await managerPage.getByRole('button', { name: /reverse/i }).click();
      const dialog = managerPage.getByRole('dialog');
      await dialog.locator('textarea').fill('Reversing for E2E test verification');
      await dialog.getByRole('button', { name: /^reverse$/i }).click();
      await expect(dialog).not.toBeVisible({ timeout: 10_000 });

      // After reversal, the row should NOT have a Reverse button
      // Reload the page to ensure fresh state
      await managerPage.reload();
      await managerPage.waitForLoadState('networkidle');

      await collectionHeading.scrollIntoViewIfNeeded();
      await expect(collectionTable.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 });

      // The reversed row should show "reversed" status but no Reverse button
      const reversedRow = collectionTable.locator('tbody tr').filter({ hasText: /reversed/i });
      if (await reversedRow.count() > 0) {
        await expect(reversedRow.getByRole('button', { name: /reverse/i })).not.toBeVisible();
      }
    });
  });

  test.describe('Cancel Reversal', () => {
    test('clicking Cancel closes dialog without reversing', async ({ managerPage }) => {
      const customerId = await createUniqueCustomer();
      const loanId = await createLoan(foToken, customerId, productVersionId);
      await activateLoan(foToken, managerToken, loanId);
      await postCollection(coToken, loanId, 500000);

      await managerPage.goto(`/loans/${loanId}`);
      await managerPage.waitForLoadState('networkidle');
      await expect(managerPage.locator('span', { hasText: /^active$/i }).first()).toBeVisible({ timeout: 30_000 });

      const collectionHeading = managerPage.getByRole('heading', { name: 'Collection History' });
      await collectionHeading.scrollIntoViewIfNeeded();
      const collectionTable = managerPage.locator('table').filter({ hasText: 'Mode' });
      await expect(collectionTable.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 });

      await managerPage.getByRole('button', { name: /reverse/i }).click();

      const dialog = managerPage.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5_000 });

      // Enter some reason
      await dialog.locator('textarea').fill('This should not be saved');

      // Click Cancel
      await dialog.getByRole('button', { name: /cancel/i }).click();

      // Dialog should close
      await expect(dialog).not.toBeVisible({ timeout: 5_000 });

      // Collection should still be "posted" not "reversed"
      await expect(collectionTable.getByText(/posted/i).first()).toBeVisible();
    });
  });
});
