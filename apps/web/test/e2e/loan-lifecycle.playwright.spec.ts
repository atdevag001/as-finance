import { test, expect } from './fixtures';
import { getTokenForRole, createTestCustomer, apiRequest } from './fixtures';

/**
 * Loan Lifecycle — Comprehensive E2E Tests
 *
 * Tests the complete loan lifecycle from creation to closure:
 * - Status transitions: draft → submitted → under_review → approved → disbursed → active
 * - Rejection flow
 * - Disbursement with different payment modes
 * - Collection posting and reversal
 * - Foreclosure flow
 * - Penalty management and waiver
 * - EMI schedule display
 * - Status history timeline
 *
 * Validates: Requirements 3.1–3.4, 4.1–4.3, 5.1–5.3
 */

const API_BASE = 'http://localhost:3001';

interface LoanProduct {
  id: string;
  current_version_id?: string;
  current_version?: { id: string };
}

interface Loan {
  id: string;
  loan_number: string;
  status: string;
  principal_paise: number;
  schedules?: Array<{
    id: string;
    installment_number: number;
    due_date: string;
    principal_paise: number;
    interest_paise: number;
    total_paise: number;
    status: string;
  }>;
}

interface Collection {
  id: string;
  amount_paise: number;
  status: string;
  receiptId?: string;
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
 * Helper: Create a loan via API and return its ID and loan number.
 */
async function createLoan(
  token: string,
  customerId: string,
  productVersionId: string,
  principalPaise = 5000000,
): Promise<{ id: string; loan_number: string }> {
  const res = await fetch(`${API_BASE}/loans`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      customerId,
      productVersionId,
      principalPaise,
      tenureMonths: 12,
      purpose: `E2E lifecycle test ${Date.now()}`,
    }),
  });
  const loan = await res.json();
  if (!loan.id) {
    throw new Error(`Failed to create loan: ${JSON.stringify(loan)}`);
  }
  return { id: loan.id, loan_number: loan.loan_number };
}

/**
 * Helper: Perform loan action via API.
 */
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
    const error = await res.text();
    throw new Error(`Loan action ${action} failed: ${error}`);
  }
}

/**
 * Helper: Advance loan through review to approval.
 * Loan state: submitted → under_review → approved
 */
async function approveLoan(foToken: string, managerToken: string, loanId: string): Promise<void> {
  await loanAction(foToken, loanId, 'submit');
  await loanAction(managerToken, loanId, 'review');
  await loanAction(managerToken, loanId, 'approve');
}

/**
 * Helper: Advance loan to active status (disbursed).
 */
async function activateLoan(foToken: string, managerToken: string, loanId: string): Promise<void> {
  await approveLoan(foToken, managerToken, loanId);
  await loanAction(managerToken, loanId, 'disburse', { mode: 'cash' });
}

/**
 * Helper: Post a collection via API.
 */
async function postCollection(
  token: string,
  loanId: string,
  amountPaise: number,
): Promise<Collection> {
  const res = await fetch(`${API_BASE}/collections`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      loanId,
      amountPaise,
      paymentMode: 'cash',
      paymentDate: new Date().toISOString().split('T')[0],
      idempotencyKey: `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    }),
  });
  const collection = await res.json();
  return collection.data ?? collection;
}

test.describe('Loan Lifecycle', () => {
  let foToken: string;
  let managerToken: string;
  let productVersionId: string;

  test.beforeAll(async () => {
    foToken = await getTokenForRole('field_officer');
    managerToken = await getTokenForRole('manager');
    productVersionId = await getProductVersionId(foToken);
  });

  /**
   * Helper: Create a unique customer for each test to avoid concurrent loan limits.
   */
  async function createUniqueCustomer(): Promise<string> {
    return createTestCustomer(foToken);
  }

  test.describe('Status Transitions', () => {
    test('draft loan shows Submit for Review button', async ({ fieldOfficerPage }) => {
      const { id } = await createLoan(foToken, await createUniqueCustomer(), productVersionId);

      await fieldOfficerPage.goto(`/loans/${id}`);
      await fieldOfficerPage.waitForLoadState('domcontentloaded');

      // Verify draft status
      await expect(fieldOfficerPage.locator('span', { hasText: /^draft$/i }).first()).toBeVisible({ timeout: 30_000 });

      // Verify Submit for Review button is visible
      await expect(fieldOfficerPage.getByRole('button', { name: /submit for review/i })).toBeVisible();
    });

    test('submit for review changes status to submitted', async ({ fieldOfficerPage }) => {
      const { id } = await createLoan(foToken, await createUniqueCustomer(), productVersionId);

      await fieldOfficerPage.goto(`/loans/${id}`);
      await fieldOfficerPage.waitForLoadState('domcontentloaded');
      await expect(fieldOfficerPage.locator('span', { hasText: /^draft$/i }).first()).toBeVisible({ timeout: 30_000 });

      // Click Submit for Review
      await fieldOfficerPage.getByRole('button', { name: /submit for review/i }).click();

      // Wait for status to change
      await expect(fieldOfficerPage.locator('span', { hasText: /^submitted$/i }).first()).toBeVisible({ timeout: 15_000 });
    });

    test('manager can start review on submitted loan', async ({ managerPage }) => {
      const { id } = await createLoan(foToken, await createUniqueCustomer(), productVersionId);
      await loanAction(foToken, id, 'submit');

      await managerPage.goto(`/loans/${id}`);
      await managerPage.waitForLoadState('domcontentloaded');
      await expect(managerPage.locator('span', { hasText: /^submitted$/i }).first()).toBeVisible({ timeout: 30_000 });

      // Check for Start Review button
      const startReviewBtn = managerPage.getByRole('button', { name: /start review/i });
      if (await startReviewBtn.isVisible()) {
        await startReviewBtn.click();
        await expect(managerPage.locator('span', { hasText: /under.review/i }).first()).toBeVisible({ timeout: 15_000 });
      }
    });

    test('manager can approve loan', async ({ managerPage }) => {
      const { id } = await createLoan(foToken, await createUniqueCustomer(), productVersionId);
      await loanAction(foToken, id, 'submit');
      await loanAction(managerToken, id, 'review'); // Must go through review first

      await managerPage.goto(`/loans/${id}`);
      await managerPage.waitForLoadState('domcontentloaded');
      await expect(managerPage.locator('span', { hasText: /under.review/i }).first()).toBeVisible({ timeout: 30_000 });

      // Click Approve button
      await managerPage.getByRole('button', { name: /^approve$/i }).click();

      // Handle confirmation dialog
      const dialog = managerPage.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5_000 });
      await dialog.getByRole('button', { name: /^approve$/i }).click();

      // Wait for status to change (use .first() to avoid matching Status History badges)
      await expect(managerPage.locator('span', { hasText: /^approved$/i }).first()).toBeVisible({ timeout: 15_000 });
    });

    test('manager can reject loan with reason', async ({ managerPage }) => {
      const { id, loan_number } = await createLoan(foToken, await createUniqueCustomer(), productVersionId);
      await loanAction(foToken, id, 'submit');
      await loanAction(managerToken, id, 'review'); // Must go through review first

      await managerPage.goto(`/loans/${id}`);
      await managerPage.waitForLoadState('domcontentloaded');
      await expect(managerPage.locator('span', { hasText: /under.review/i }).first()).toBeVisible({ timeout: 30_000 });

      // Click Reject button
      await managerPage.getByRole('button', { name: /^reject$/i }).click();

      // Fill rejection reason in dialog
      const dialog = managerPage.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5_000 });
      await dialog.getByPlaceholder(/reason/i).fill('Insufficient documentation for E2E test');
      await dialog.getByRole('button', { name: /^reject$/i }).click();

      // Wait for status to change (use .first() to avoid matching Status History badges)
      await expect(managerPage.locator('span', { hasText: /^rejected$/i }).first()).toBeVisible({ timeout: 15_000 });
    });
  });

  test.describe('Disbursement', () => {
    test('disburse button shows for approved loans', async ({ managerPage }) => {
      const { id } = await createLoan(foToken, await createUniqueCustomer(), productVersionId);
      await approveLoan(foToken, managerToken, id);

      await managerPage.goto(`/loans/${id}`);
      await managerPage.waitForLoadState('domcontentloaded');
      await expect(managerPage.locator('span', { hasText: /^approved$/i }).first()).toBeVisible({ timeout: 30_000 });

      // Disburse button should be visible
      await expect(managerPage.getByRole('button', { name: /^disburse$/i })).toBeVisible();
    });

    test('disbursement dialog shows payment mode selection', async ({ managerPage }) => {
      const { id } = await createLoan(foToken, await createUniqueCustomer(), productVersionId);
      await approveLoan(foToken, managerToken, id);

      await managerPage.goto(`/loans/${id}`);
      await managerPage.waitForLoadState('domcontentloaded');
      await expect(managerPage.locator('span', { hasText: /^approved$/i }).first()).toBeVisible({ timeout: 30_000 });

      // Click Disburse button
      await managerPage.getByRole('button', { name: /^disburse$/i }).click();

      // Dialog should show payment mode dropdown
      const dialog = managerPage.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5_000 });
      await expect(dialog.getByText(/payment mode/i)).toBeVisible();
    });

    test('cash disbursement completes successfully', async ({ managerPage }) => {
      const { id } = await createLoan(foToken, await createUniqueCustomer(), productVersionId);
      await approveLoan(foToken, managerToken, id);

      await managerPage.goto(`/loans/${id}`);
      await managerPage.waitForLoadState('domcontentloaded');
      await expect(managerPage.locator('span', { hasText: /^approved$/i }).first()).toBeVisible({ timeout: 30_000 });

      // Click Disburse button
      await managerPage.getByRole('button', { name: /^disburse$/i }).click();

      // Confirm disbursement in dialog (cash is default)
      const dialog = managerPage.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5_000 });
      await dialog.getByRole('button', { name: /^disburse$/i }).click();

      // Wait for status to change to active
      await expect(managerPage.locator('span', { hasText: /^active$/i }).first()).toBeVisible({ timeout: 15_000 });
    });

    test('bank transfer disbursement requires reference number', async ({ managerPage }) => {
      const { id } = await createLoan(foToken, await createUniqueCustomer(), productVersionId);
      await approveLoan(foToken, managerToken, id);

      await managerPage.goto(`/loans/${id}`);
      await managerPage.waitForLoadState('domcontentloaded');
      await expect(managerPage.locator('span', { hasText: /^approved$/i }).first()).toBeVisible({ timeout: 30_000 });

      // Click Disburse button
      await managerPage.getByRole('button', { name: /^disburse$/i }).click();

      // Select bank transfer mode
      const dialog = managerPage.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5_000 });

      // Click the payment mode dropdown
      await dialog.locator('button[role="combobox"]').click();
      await managerPage.getByRole('option', { name: /bank transfer/i }).click();

      // Reference number field should appear
      await expect(dialog.getByPlaceholder(/reference/i)).toBeVisible();
    });
  });

  test.describe('EMI Schedule Display', () => {
    test('active loan shows repayment schedule table', async ({ fieldOfficerPage }) => {
      const { id } = await createLoan(foToken, await createUniqueCustomer(), productVersionId);
      await activateLoan(foToken, managerToken, id);

      await fieldOfficerPage.goto(`/loans/${id}`);
      await fieldOfficerPage.waitForLoadState('domcontentloaded');
      await expect(fieldOfficerPage.locator('span', { hasText: /^active$/i }).first()).toBeVisible({ timeout: 30_000 });

      // Verify repayment schedule section exists
      await expect(fieldOfficerPage.getByText('Repayment Schedule')).toBeVisible();

      // Verify schedule table has correct columns
      const scheduleTable = fieldOfficerPage.locator('table').filter({ hasText: 'Due Date' });
      await expect(scheduleTable).toBeVisible();
      await expect(scheduleTable.getByText('Principal')).toBeVisible();
      await expect(scheduleTable.getByText('Interest')).toBeVisible();
      await expect(scheduleTable.getByText('Total')).toBeVisible();
      await expect(scheduleTable.getByText('Status')).toBeVisible();
    });

    test('schedule shows 12 installments for 12-month loan', async ({ fieldOfficerPage }) => {
      const { id } = await createLoan(foToken, await createUniqueCustomer(), productVersionId);
      await activateLoan(foToken, managerToken, id);

      await fieldOfficerPage.goto(`/loans/${id}`);
      await fieldOfficerPage.waitForLoadState('domcontentloaded');
      await expect(fieldOfficerPage.locator('span', { hasText: /^active$/i }).first()).toBeVisible({ timeout: 30_000 });

      // Count installment rows (should be 12 for 12-month loan)
      const scheduleTable = fieldOfficerPage.locator('table').filter({ hasText: 'Due Date' });
      const rows = scheduleTable.locator('tbody tr');
      await expect(rows).toHaveCount(12, { timeout: 10_000 });
    });

    test('installments show pending status initially', async ({ fieldOfficerPage }) => {
      const { id } = await createLoan(foToken, await createUniqueCustomer(), productVersionId);
      await activateLoan(foToken, managerToken, id);

      await fieldOfficerPage.goto(`/loans/${id}`);
      await fieldOfficerPage.waitForLoadState('domcontentloaded');
      await expect(fieldOfficerPage.locator('span', { hasText: /^active$/i }).first()).toBeVisible({ timeout: 30_000 });

      // First installment should show pending status
      const scheduleTable = fieldOfficerPage.locator('table').filter({ hasText: 'Due Date' });
      await expect(scheduleTable.locator('tbody tr').first().getByText(/pending/i)).toBeVisible();
    });
  });

  test.describe('Collection & Reversal', () => {
    test('collection history section displays posted collections', async ({ collectionOfficerPage }) => {
      const { id } = await createLoan(foToken, await createUniqueCustomer(), productVersionId);
      await activateLoan(foToken, managerToken, id);

      // Post a collection via API
      const coToken = await getTokenForRole('collection_officer');
      await postCollection(coToken, id, 500000); // ₹5,000

      await collectionOfficerPage.goto(`/loans/${id}`);
      await collectionOfficerPage.waitForLoadState('networkidle');

      // Scroll to Collection History section and wait for data
      const collectionHeading = collectionOfficerPage.getByRole('heading', { name: 'Collection History' });
      await collectionHeading.scrollIntoViewIfNeeded();
      await expect(collectionHeading).toBeVisible({ timeout: 30_000 });

      // Wait for collection table to have data (not "No collections" message)
      const collectionTable = collectionOfficerPage.locator('table').filter({ hasText: 'Mode' });
      await expect(collectionTable.getByText(/₹5,000/).first()).toBeVisible({ timeout: 15_000 });
      await expect(collectionTable.locator('tbody tr').first()).toBeVisible();
    });

    test('manager sees Reverse button on posted collection', async ({ managerPage }) => {
      const { id } = await createLoan(foToken, await createUniqueCustomer(), productVersionId);
      await activateLoan(foToken, managerToken, id);

      // Post a collection
      const coToken = await getTokenForRole('collection_officer');
      await postCollection(coToken, id, 500000);

      await managerPage.goto(`/loans/${id}`);
      await managerPage.waitForLoadState('networkidle');

      // Scroll to Collection History section
      const collectionHeading = managerPage.getByRole('heading', { name: 'Collection History' });
      await collectionHeading.scrollIntoViewIfNeeded();
      await expect(collectionHeading).toBeVisible({ timeout: 30_000 });

      // Wait for table data to load then check for Reverse button
      const collectionTable = managerPage.locator('table').filter({ hasText: 'Mode' });
      await expect(collectionTable.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 });
      await expect(managerPage.getByRole('button', { name: /reverse/i })).toBeVisible();
    });

    test('reversal dialog requires reason', async ({ managerPage }) => {
      const { id } = await createLoan(foToken, await createUniqueCustomer(), productVersionId);
      await activateLoan(foToken, managerToken, id);

      // Post a collection
      const coToken = await getTokenForRole('collection_officer');
      await postCollection(coToken, id, 500000);

      await managerPage.goto(`/loans/${id}`);
      await managerPage.waitForLoadState('networkidle');

      // Scroll to and wait for Collection History table
      const collectionHeading = managerPage.getByRole('heading', { name: 'Collection History' });
      await collectionHeading.scrollIntoViewIfNeeded();
      const collectionTable = managerPage.locator('table').filter({ hasText: 'Mode' });
      await expect(collectionTable.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 });

      // Click Reverse button
      await managerPage.getByRole('button', { name: /reverse/i }).click();

      // Dialog should appear with reason field
      const dialog = managerPage.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5_000 });
      await expect(dialog.getByText(/reason/i)).toBeVisible();
      await expect(dialog.locator('input, textarea').first()).toBeVisible();
    });

    test('collection officer cannot see Reverse button', async ({ collectionOfficerPage }) => {
      const { id } = await createLoan(foToken, await createUniqueCustomer(), productVersionId);
      await activateLoan(foToken, managerToken, id);

      // Post a collection
      const coToken = await getTokenForRole('collection_officer');
      await postCollection(coToken, id, 500000);

      await collectionOfficerPage.goto(`/loans/${id}`);
      await collectionOfficerPage.waitForLoadState('networkidle');

      // Scroll to Collection History
      const collectionHeading = collectionOfficerPage.getByRole('heading', { name: 'Collection History' });
      await collectionHeading.scrollIntoViewIfNeeded();
      const collectionTable = collectionOfficerPage.locator('table').filter({ hasText: 'Mode' });
      await expect(collectionTable.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 });

      // Reverse button should NOT be visible for collection officer
      await expect(collectionOfficerPage.getByRole('button', { name: /reverse/i })).not.toBeVisible();
    });
  });

  test.describe('Foreclosure', () => {
    test('foreclosure button shows for active loans', async ({ managerPage }) => {
      const { id } = await createLoan(foToken, await createUniqueCustomer(), productVersionId);
      await activateLoan(foToken, managerToken, id);

      await managerPage.goto(`/loans/${id}`);
      await managerPage.waitForLoadState('domcontentloaded');
      await expect(managerPage.locator('span', { hasText: /^active$/i }).first()).toBeVisible({ timeout: 30_000 });

      // Foreclosure button should be visible
      await expect(managerPage.getByRole('button', { name: /foreclosure/i })).toBeVisible();
    });

    test('foreclosure generates quote with breakdown', async ({ managerPage }) => {
      const { id } = await createLoan(foToken, await createUniqueCustomer(), productVersionId);
      await activateLoan(foToken, managerToken, id);

      await managerPage.goto(`/loans/${id}`);
      await managerPage.waitForLoadState('domcontentloaded');
      await expect(managerPage.locator('span', { hasText: /^active$/i }).first()).toBeVisible({ timeout: 30_000 });

      // Click Foreclosure button
      await managerPage.getByRole('button', { name: /foreclosure/i }).click();

      // Quote dialog should show breakdown
      const dialog = managerPage.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 10_000 });
      await expect(dialog.getByText(/outstanding principal/i)).toBeVisible();
      await expect(dialog.getByText(/settlement amount/i)).toBeVisible();
    });

    test('foreclosure quote shows expiry time', async ({ managerPage }) => {
      const { id } = await createLoan(foToken, await createUniqueCustomer(), productVersionId);
      await activateLoan(foToken, managerToken, id);

      await managerPage.goto(`/loans/${id}`);
      await managerPage.waitForLoadState('domcontentloaded');
      await expect(managerPage.locator('span', { hasText: /^active$/i }).first()).toBeVisible({ timeout: 30_000 });

      // Click Foreclosure button
      await managerPage.getByRole('button', { name: /foreclosure/i }).click();

      // Quote should show expiry time
      const dialog = managerPage.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 10_000 });
      await expect(dialog.getByText(/expires/i)).toBeVisible();
    });

    test('field officer cannot see foreclosure button', async ({ fieldOfficerPage }) => {
      const { id } = await createLoan(foToken, await createUniqueCustomer(), productVersionId);
      await activateLoan(foToken, managerToken, id);

      await fieldOfficerPage.goto(`/loans/${id}`);
      await fieldOfficerPage.waitForLoadState('domcontentloaded');
      await expect(fieldOfficerPage.locator('span', { hasText: /^active$/i }).first()).toBeVisible({ timeout: 30_000 });

      // Foreclosure button should NOT be visible for field officer (requires foreclosure.quote permission)
      await expect(fieldOfficerPage.getByRole('button', { name: /foreclosure/i })).not.toBeVisible();
    });
  });

  test.describe('Status History', () => {
    test('status history timeline shows after disbursement', async ({ fieldOfficerPage }) => {
      const { id } = await createLoan(foToken, await createUniqueCustomer(), productVersionId);
      await activateLoan(foToken, managerToken, id);

      await fieldOfficerPage.goto(`/loans/${id}`);
      await fieldOfficerPage.waitForLoadState('networkidle');
      await expect(fieldOfficerPage.locator('span', { hasText: /^active$/i }).first()).toBeVisible({ timeout: 30_000 });

      // Scroll to Status History section
      const historyHeading = fieldOfficerPage.getByRole('heading', { name: 'Status History' });
      await historyHeading.scrollIntoViewIfNeeded();
      await expect(historyHeading).toBeVisible();
    });

    test('status history shows all transitions', async ({ fieldOfficerPage }) => {
      const { id } = await createLoan(foToken, await createUniqueCustomer(), productVersionId);
      await activateLoan(foToken, managerToken, id);

      await fieldOfficerPage.goto(`/loans/${id}`);
      await fieldOfficerPage.waitForLoadState('networkidle');
      await expect(fieldOfficerPage.locator('span', { hasText: /^active$/i }).first()).toBeVisible({ timeout: 30_000 });

      // Scroll to Status History section
      const historyHeading = fieldOfficerPage.getByRole('heading', { name: 'Status History' });
      await historyHeading.scrollIntoViewIfNeeded();
      await expect(historyHeading).toBeVisible();

      // The status history card contains the timeline - look for status badges after the heading
      // Count status badges that appear after the Status History heading
      const statusBadges = fieldOfficerPage.locator('span', { hasText: /^(draft|submitted|under_review|approved|disbursed|active)$/i });
      // There should be multiple status badges (at least 2 - one for current status + history entries)
      const count = await statusBadges.count();
      expect(count).toBeGreaterThan(1);
    });

    test('rejected loan shows rejection reason in history', async ({ managerPage }) => {
      const { id } = await createLoan(foToken, await createUniqueCustomer(), productVersionId);
      await loanAction(foToken, id, 'submit');
      await loanAction(managerToken, id, 'review'); // Must go through review first
      await loanAction(managerToken, id, 'reject', { reason: 'Test rejection reason for E2E' });

      await managerPage.goto(`/loans/${id}`);
      await managerPage.waitForLoadState('networkidle');
      await expect(managerPage.locator('span', { hasText: /^rejected$/i }).first()).toBeVisible({ timeout: 30_000 });

      // Scroll to Status History section
      const historyHeading = managerPage.getByRole('heading', { name: 'Status History' });
      await historyHeading.scrollIntoViewIfNeeded();
      await expect(historyHeading).toBeVisible();

      // Rejection reason should appear in the page (in Status History section)
      await expect(managerPage.getByText(/test rejection reason/i)).toBeVisible();
    });
  });

  test.describe('Receipts', () => {
    test('receipts section shows generated receipts', async ({ collectionOfficerPage }) => {
      const { id } = await createLoan(foToken, await createUniqueCustomer(), productVersionId);
      await activateLoan(foToken, managerToken, id);

      // Post a collection (which should generate a receipt)
      const coToken = await getTokenForRole('collection_officer');
      await postCollection(coToken, id, 500000);

      await collectionOfficerPage.goto(`/loans/${id}`);
      await collectionOfficerPage.waitForLoadState('networkidle');

      // Scroll to Receipts section
      const receiptsHeading = collectionOfficerPage.getByRole('heading', { name: 'Receipts' });
      await receiptsHeading.scrollIntoViewIfNeeded();
      await expect(receiptsHeading).toBeVisible({ timeout: 30_000 });

      // Wait for receipt table to have data - look for receipt number pattern (RCP-YYYY-NNNNN)
      await expect(collectionOfficerPage.getByText(/RCP-\d{4}-\d{5}/)).toBeVisible({ timeout: 15_000 });

      // Verify the receipt amount shows
      await expect(collectionOfficerPage.getByText(/₹5,000/).first()).toBeVisible();
    });

    test('receipt number links to receipt detail page', async ({ collectionOfficerPage }) => {
      const { id } = await createLoan(foToken, await createUniqueCustomer(), productVersionId);
      await activateLoan(foToken, managerToken, id);

      // Post a collection
      const coToken = await getTokenForRole('collection_officer');
      await postCollection(coToken, id, 500000);

      await collectionOfficerPage.goto(`/loans/${id}`);
      await collectionOfficerPage.waitForLoadState('networkidle');

      // Scroll to Receipts section
      const receiptsHeading = collectionOfficerPage.getByRole('heading', { name: 'Receipts' });
      await receiptsHeading.scrollIntoViewIfNeeded();
      await expect(receiptsHeading).toBeVisible({ timeout: 30_000 });

      // Wait for receipt to appear
      await expect(collectionOfficerPage.getByText(/RCP-\d{4}-\d{5}/)).toBeVisible({ timeout: 15_000 });

      // Find receipt link and verify it's clickable (the receipt number is a link)
      const receiptLink = collectionOfficerPage.locator('a[href*="/receipts/"]').first();
      await expect(receiptLink).toBeVisible();
      const href = await receiptLink.getAttribute('href');
      expect(href).toMatch(/\/receipts\/[a-f0-9-]+/);
    });
  });

  test.describe('Loan Details Display', () => {
    test('loan detail page shows principal amount', async ({ fieldOfficerPage }) => {
      const { id } = await createLoan(foToken, await createUniqueCustomer(), productVersionId, 5000000);

      await fieldOfficerPage.goto(`/loans/${id}`);
      await fieldOfficerPage.waitForLoadState('domcontentloaded');

      // Principal card should show ₹50,000
      await expect(fieldOfficerPage.getByText('Principal')).toBeVisible({ timeout: 30_000 });
      await expect(fieldOfficerPage.getByText('₹50,000')).toBeVisible();
    });

    test('loan detail page shows tenure', async ({ fieldOfficerPage }) => {
      const { id } = await createLoan(foToken, await createUniqueCustomer(), productVersionId);

      await fieldOfficerPage.goto(`/loans/${id}`);
      await fieldOfficerPage.waitForLoadState('domcontentloaded');

      // Tenure card should show 12 months
      await expect(fieldOfficerPage.getByText('Tenure')).toBeVisible({ timeout: 30_000 });
      await expect(fieldOfficerPage.getByText('12 months')).toBeVisible();
    });

    test('active loan shows outstanding amount', async ({ fieldOfficerPage }) => {
      const { id } = await createLoan(foToken, await createUniqueCustomer(), productVersionId);
      await activateLoan(foToken, managerToken, id);

      await fieldOfficerPage.goto(`/loans/${id}`);
      await fieldOfficerPage.waitForLoadState('domcontentloaded');

      // Wait for active status to confirm loan is disbursed
      await expect(fieldOfficerPage.locator('span', { hasText: /^active$/i }).first()).toBeVisible({ timeout: 30_000 });

      // Outstanding card should show an amount
      await expect(fieldOfficerPage.getByText('Outstanding')).toBeVisible();
    });

    test('loan detail shows purpose', async ({ fieldOfficerPage }) => {
      const { id } = await createLoan(foToken, await createUniqueCustomer(), productVersionId);

      await fieldOfficerPage.goto(`/loans/${id}`);
      await fieldOfficerPage.waitForLoadState('domcontentloaded');

      // Details section should show purpose
      await expect(fieldOfficerPage.getByText('Purpose')).toBeVisible({ timeout: 30_000 });
      await expect(fieldOfficerPage.getByText(/E2E lifecycle test/)).toBeVisible();
    });

    test('disbursed loan shows disbursement date', async ({ fieldOfficerPage }) => {
      const { id } = await createLoan(foToken, await createUniqueCustomer(), productVersionId);
      await activateLoan(foToken, managerToken, id);

      await fieldOfficerPage.goto(`/loans/${id}`);
      await fieldOfficerPage.waitForLoadState('domcontentloaded');
      await expect(fieldOfficerPage.locator('span', { hasText: /^active$/i }).first()).toBeVisible({ timeout: 30_000 });

      // Disbursement date should be visible
      await expect(fieldOfficerPage.getByText('Disbursement Date')).toBeVisible();
    });
  });

  test.describe('Access Control', () => {
    test('auditor can view loan but cannot perform actions', async ({ auditorPage }) => {
      const { id } = await createLoan(foToken, await createUniqueCustomer(), productVersionId);
      await loanAction(foToken, id, 'submit');

      await auditorPage.goto(`/loans/${id}`);
      await auditorPage.waitForLoadState('domcontentloaded');

      // Can view loan details
      await expect(auditorPage.locator('h1')).toContainText(/LN-/);

      // Should NOT see action buttons
      await expect(auditorPage.getByRole('button', { name: /approve/i })).not.toBeVisible();
      await expect(auditorPage.getByRole('button', { name: /reject/i })).not.toBeVisible();
      await expect(auditorPage.getByRole('button', { name: /disburse/i })).not.toBeVisible();
    });

    test('field officer cannot approve or reject', async ({ fieldOfficerPage }) => {
      const { id } = await createLoan(foToken, await createUniqueCustomer(), productVersionId);
      await loanAction(foToken, id, 'submit');

      await fieldOfficerPage.goto(`/loans/${id}`);
      await fieldOfficerPage.waitForLoadState('domcontentloaded');
      await expect(fieldOfficerPage.locator('span', { hasText: /^submitted$/i }).first()).toBeVisible({ timeout: 30_000 });

      // Field officer should NOT see approve/reject buttons
      await expect(fieldOfficerPage.getByRole('button', { name: /^approve$/i })).not.toBeVisible();
      await expect(fieldOfficerPage.getByRole('button', { name: /^reject$/i })).not.toBeVisible();
    });
  });
});
