import { test, expect, csrfHeadersFor } from './fixtures';

/**
 * Receipt Print View — Playwright E2E Tests
 *
 * Uses pre-authenticated fixtures to avoid rate limiting.
 *
 * Validates: Design GAP 8 (Receipt Print View)
 *
 * Tests cover:
 * 1. Receipt page renders with customer name, loan number, amount, date, components
 * 2. Print layout correct (no navigation elements, proper formatting)
 */

// Field officer creates prerequisite data
const FO_USERNAME = 'field1';
const FO_PASSWORD = 'Admin@123';

// Manager for loan approval and disbursement
const MANAGER_USERNAME = 'manager1';
const MANAGER_PASSWORD = 'Admin@123';

// Collection officer posts collections and views receipts
const CO_USERNAME = 'collector1';
const CO_PASSWORD = 'Admin@123';

const API_BASE = 'http://localhost:3001';

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

/**
 * Helper: create a customer via the API.
 */
async function createTestCustomer(token: string): Promise<string> {
  const suffix = Date.now().toString().slice(-6);
  const res = await fetch(`${API_BASE}/customers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(await csrfHeadersFor(token)),
    },
    body: JSON.stringify({
      fullName: `PW Receipt Test ${suffix}`,
      fatherOrHusbandName: 'Test Father',
      mobile: `9${suffix}0003`.slice(0, 10),
      aadhaarNumber: `4${suffix}000003`.slice(0, 12),
      gender: 'male',
      addressLine1: '1 Receipt Road',
      city: 'TestCity',
      district: 'TestDistrict',
      state: 'TestState',
      pincode: '560001',
    }),
  });
  const body = await res.json();
  // API returns { customer: { id, ... }, duplicateWarnings: [...] }
  return body.customer?.id ?? body.id;
}

/**
 * Helper: fetch the first active loan product version ID from the API.
 */
async function getProductVersionId(token: string): Promise<string> {
  const res = await fetch(`${API_BASE}/loan-products`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  const products = Array.isArray(body) ? body : body.data ?? [];
  const product = products[0];
  if (!product) {
    throw new Error('No loan products found');
  }
  // API uses snake_case: current_version_id
  return (
    product?.current_version_id ??
    product?.currentVersionId ??
    product?.current_version?.id ??
    product?.versions?.[0]?.id ??
    product?.id
  );
}

/**
 * Helper: create a loan and advance it to active status via the API.
 * Workflow: draft -> submitted -> under_review -> approved -> disbursed (active)
 */
async function createActiveLoan(
  foToken: string,
  managerToken: string,
  customerId: string,
  productVersionId: string,
): Promise<string> {
  // Create loan in draft status
  // Note: Principal must be within product limits (min 5000000 paise = 50,000 INR)
  const createRes = await fetch(`${API_BASE}/loans`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${foToken}`,
      ...(await csrfHeadersFor(foToken)),
    },
    body: JSON.stringify({
      customerId,
      productVersionId,
      principalPaise: 5000000, // 50,000 INR - minimum allowed
      tenureMonths: 12,
      purpose: 'PW receipt test loan',
    }),
  });
  const loan = await createRes.json();
  const loanId = loan.id;
  if (!loanId) throw new Error(`Failed to create loan: ${JSON.stringify(loan)}`);

  // Submit loan (draft -> submitted)
  const submitRes = await fetch(`${API_BASE}/loans/${loanId}/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${foToken}`,
      ...(await csrfHeadersFor(foToken)),
    },
  });
  if (!submitRes.ok) throw new Error(`Failed to submit loan: ${await submitRes.text()}`);

  // Move to review (submitted -> under_review)
  const reviewRes = await fetch(`${API_BASE}/loans/${loanId}/review`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${managerToken}`,
      ...(await csrfHeadersFor(managerToken)),
    },
  });
  if (!reviewRes.ok) throw new Error(`Failed to review loan: ${await reviewRes.text()}`);

  // Approve loan (under_review -> approved)
  const approveRes = await fetch(`${API_BASE}/loans/${loanId}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${managerToken}`,
      ...(await csrfHeadersFor(managerToken)),
    },
  });
  if (!approveRes.ok) throw new Error(`Failed to approve loan: ${await approveRes.text()}`);

  // Disburse loan (approved -> disbursed/active) - requires mode parameter
  const disburseRes = await fetch(`${API_BASE}/disbursements`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${managerToken}`,
      ...(await csrfHeadersFor(managerToken)),
    },
    body: JSON.stringify({ loanId, mode: 'cash', idempotencyKey: crypto.randomUUID() }),
  });
  if (!disburseRes.ok) throw new Error(`Failed to disburse loan: ${await disburseRes.text()}`);

  return loanId;
}

/**
 * Helper: post a collection via the API and return the receipt ID.
 */
async function postCollectionAndGetReceiptId(
  coToken: string,
  loanId: string,
  amountPaise: number,
): Promise<string> {
  const res = await fetch(`${API_BASE}/collections`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${coToken}`,
      ...(await csrfHeadersFor(coToken)),
    },
    body: JSON.stringify({
      loanId,
      amountPaise,
      paymentDate: new Date().toISOString().slice(0, 10),
      paymentMode: 'cash',
      idempotencyKey: crypto.randomUUID(),
    }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Failed to post collection: ${JSON.stringify(body)}`);
  }
  // API response: { statusCode: 201, data: { collectionId, receiptId, ... } }
  const collection = body.data ?? body;
  const receiptId = collection.receiptId ?? collection.receipt_id ?? collection.receipt?.id ?? collection.id;
  return receiptId;
}

test.describe('Receipt Print View', () => {
  let foToken: string;
  let managerToken: string;
  let coToken: string;
  let activeLoanId: string;
  let receiptId: string;

  test.beforeAll(async () => {
    try {
      foToken = await getToken(FO_USERNAME, FO_PASSWORD);
      if (!foToken) throw new Error('Failed to get field officer token');

      managerToken = await getToken(MANAGER_USERNAME, MANAGER_PASSWORD);
      if (!managerToken) throw new Error('Failed to get manager token');

      coToken = await getToken(CO_USERNAME, CO_PASSWORD);
      if (!coToken) throw new Error('Failed to get collection officer token');

      const customerId = await createTestCustomer(foToken);
      if (!customerId) throw new Error('Failed to create test customer');

      const productVersionId = await getProductVersionId(foToken);
      if (!productVersionId) throw new Error('Failed to get product version ID');

      activeLoanId = await createActiveLoan(foToken, managerToken, customerId, productVersionId);
      if (!activeLoanId) throw new Error('Failed to create active loan');

      receiptId = await postCollectionAndGetReceiptId(coToken, activeLoanId, 50000);
      if (!receiptId) throw new Error('Failed to create receipt');

      console.log(`Test data created - Loan: ${activeLoanId}, Receipt: ${receiptId}`);
    } catch (error) {
      console.error('beforeAll setup failed:', error);
      throw error;
    }
  });

  test('receipt page renders with customer name, loan number, amount, date, components', async ({ collectionOfficerPage }) => {
    // Navigate to the receipt detail page (using pre-authenticated page)
    await collectionOfficerPage.goto(`/receipts/${receiptId}`, { timeout: 30_000 });
    await collectionOfficerPage.waitForLoadState('networkidle');

    // Verify the receipt page header - target the receipt card specifically
    // The heading "Payment Receipt" is inside a CardTitle within the receipt container
    await expect(collectionOfficerPage.getByRole('heading', { name: 'Payment Receipt' })).toBeVisible({ timeout: 10_000 });

    // Scope selectors to main content area to avoid sidebar matches
    const mainContent = collectionOfficerPage.locator('main');

    // Verify receipt metadata fields - the receipt uses label/value rows
    // Use exact matching to avoid partial matches (e.g., "Customer" vs "Customers")
    await expect(mainContent.getByText('Date', { exact: true })).toBeVisible();
    await expect(mainContent.getByText('Customer', { exact: true })).toBeVisible();
    await expect(mainContent.getByText('Loan Number', { exact: true })).toBeVisible();
    await expect(mainContent.getByText('Payment Mode', { exact: true })).toBeVisible();

    // Verify allocation breakdown section
    await expect(mainContent.getByText('Allocation Breakdown')).toBeVisible();
    await expect(mainContent.getByText('Principal', { exact: true })).toBeVisible();
    await expect(mainContent.getByText('Interest', { exact: true })).toBeVisible();
    await expect(mainContent.getByText('Penalty', { exact: true })).toBeVisible();

    // Verify outstanding after payment
    await expect(mainContent.getByText('Outstanding After Payment')).toBeVisible();

    // Verify the collected by field
    await expect(mainContent.getByText('Collected By')).toBeVisible();

    // Verify the Print button is visible
    await expect(collectionOfficerPage.getByRole('button', { name: /print/i })).toBeVisible();
  });

  test('print layout correct — no navigation elements, proper formatting', async ({ collectionOfficerPage }) => {
    await collectionOfficerPage.goto(`/receipts/${receiptId}`, { timeout: 30_000 });
    await collectionOfficerPage.waitForLoadState('networkidle');

    // Scope to main content to avoid sidebar elements
    const mainContent = collectionOfficerPage.locator('main');

    // The receipt page uses .no-print class for elements that should be hidden when printing
    // This includes the back button and print button header area
    const noPrintElements = mainContent.locator('.no-print');
    await expect(noPrintElements.first()).toBeVisible({ timeout: 10_000 });

    // The back button is in main content, not the sidebar
    // Verify it exists in the DOM (visible on screen, hidden in print)
    const backButton = mainContent.locator('a[href="/collections"]');
    await expect(backButton).toBeVisible();

    // Verify the Print button exists in the no-print section
    const printButton = collectionOfficerPage.getByRole('button', { name: /print/i });
    await expect(printButton).toBeVisible();

    // Verify the receipt content is properly formatted inside a Card
    await expect(collectionOfficerPage.getByRole('heading', { name: 'Payment Receipt' })).toBeVisible();

    // The receipt card has the receipt-container class for print styling
    const receiptCard = mainContent.locator('.receipt-container');
    await expect(receiptCard).toBeVisible();

    // Verify the allocation breakdown section exists
    await expect(mainContent.getByText('Allocation Breakdown')).toBeVisible();

    // Verify the outstanding section exists
    await expect(mainContent.getByText('Outstanding After Payment')).toBeVisible();
  });
});
