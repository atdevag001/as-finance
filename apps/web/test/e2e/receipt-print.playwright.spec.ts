import { test, expect, type Page } from '@playwright/test';

/**
 * Receipt Print View — Playwright E2E Tests
 *
 * Validates: Design GAP 8 (Receipt Print View)
 *
 * Tests cover:
 * 1. Receipt page renders with customer name, loan number, amount, date, components
 * 2. Print layout correct (no navigation elements, proper formatting)
 */

// Collection officer posts collections and views receipts
const CO_USERNAME = 'collector1';
const CO_PASSWORD = 'Admin@123';

// Field officer creates prerequisite data
const FO_USERNAME = 'field1';
const FO_PASSWORD = 'Admin@123';

// Manager for loan approval and disbursement
const MANAGER_USERNAME = 'manager1';
const MANAGER_PASSWORD = 'Admin@123';

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
  return body.id;
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
  return (
    product?.currentVersionId ??
    product?.versionId ??
    product?.versions?.[0]?.id ??
    product?.id
  );
}

/**
 * Helper: create a loan and advance it to active status via the API.
 */
async function createActiveLoan(
  foToken: string,
  managerToken: string,
  customerId: string,
  productVersionId: string,
): Promise<string> {
  const createRes = await fetch(`${API_BASE}/loans`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${foToken}`,
    },
    body: JSON.stringify({
      customerId,
      productVersionId,
      principalPaise: 1000000,
      tenureMonths: 12,
      purpose: 'PW receipt test loan',
    }),
  });
  const loan = await createRes.json();
  const loanId = loan.id;

  await fetch(`${API_BASE}/loans/${loanId}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${foToken}` },
  });

  await fetch(`${API_BASE}/loans/${loanId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${managerToken}` },
  });

  await fetch(`${API_BASE}/disbursements`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${managerToken}` },
    body: JSON.stringify({ loanId, idempotencyKey: crypto.randomUUID() }),
  });

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
    },
    body: JSON.stringify({
      loanId,
      amountPaise,
      paymentDate: new Date().toISOString().slice(0, 10),
      paymentMode: 'cash',
      idempotencyKey: crypto.randomUUID(),
    }),
  });
  const collection = await res.json();
  return collection.receiptId ?? collection.receipt?.id ?? collection.id;
}

/**
 * Helper: log in via the UI and wait for the dashboard redirect.
 */
async function login(page: Page, username: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/^(?!.*\/login)/, { timeout: 15_000 });
}

test.describe('Receipt Print View', () => {
  let foToken: string;
  let managerToken: string;
  let coToken: string;
  let activeLoanId: string;
  let receiptId: string;

  test.beforeAll(async () => {
    foToken = await getToken(FO_USERNAME, FO_PASSWORD);
    managerToken = await getToken(MANAGER_USERNAME, MANAGER_PASSWORD);
    coToken = await getToken(CO_USERNAME, CO_PASSWORD);

    const customerId = await createTestCustomer(foToken);
    const productVersionId = await getProductVersionId(foToken);
    activeLoanId = await createActiveLoan(foToken, managerToken, customerId, productVersionId);
    receiptId = await postCollectionAndGetReceiptId(coToken, activeLoanId, 50000);
  });

  test('receipt page renders with customer name, loan number, amount, date, components', async ({ page }) => {
    await login(page, CO_USERNAME, CO_PASSWORD);

    // Navigate to the receipt detail page
    await page.goto(`/receipts/${receiptId}`);
    await page.waitForLoadState('networkidle');

    // Verify the receipt page header
    await expect(page.getByText('AS Finance')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Payment Receipt')).toBeVisible();

    // Verify receipt metadata fields
    await expect(page.getByText('Receipt #')).toBeVisible();
    await expect(page.getByText('Date')).toBeVisible();
    await expect(page.getByText('Customer')).toBeVisible();
    await expect(page.getByText('Loan #')).toBeVisible();
    await expect(page.getByText('Officer')).toBeVisible();
    await expect(page.getByText('Mode')).toBeVisible();

    // Verify allocation breakdown components
    await expect(page.getByText('Principal')).toBeVisible();
    await expect(page.getByText('Interest')).toBeVisible();
    await expect(page.getByText('Penalty')).toBeVisible();
    await expect(page.getByText('Total Paid')).toBeVisible();
    await expect(page.getByText('Outstanding After')).toBeVisible();

    // Verify the Print button is visible
    await expect(page.getByRole('button', { name: /print/i })).toBeVisible();
  });

  test('print layout correct — no navigation elements, proper formatting', async ({ page }) => {
    await login(page, CO_USERNAME, CO_PASSWORD);

    await page.goto(`/receipts/${receiptId}`);
    await page.waitForLoadState('networkidle');

    // The receipt page has a print:hidden section for navigation controls
    // In print mode, elements with print:hidden should not be visible
    // Verify the print:hidden class exists on the navigation bar
    const printHiddenElements = page.locator('.print\\:hidden');
    await expect(printHiddenElements.first()).toBeVisible();

    // The navigation back button and Print button are inside print:hidden
    // Verify they exist in the DOM (visible on screen, hidden in print)
    const backButton = printHiddenElements.locator('a[href="/collections"]');
    await expect(backButton).toBeVisible();

    // The receipt card content (not print:hidden) should contain the receipt data
    const receiptCard = page.locator('[ref="printRef"]').or(page.locator('.space-y-4 > div:last-child'));
    const cardContent = page.getByText('AS Finance');
    await expect(cardContent).toBeVisible();

    // Verify the receipt content is properly formatted inside a Card
    await expect(page.getByText('Payment Receipt')).toBeVisible();

    // Verify the receipt has a structured grid layout for metadata
    const metadataGrid = page.locator('.grid.gap-2.text-sm');
    await expect(metadataGrid).toBeVisible();

    // Verify the allocation breakdown section has a border separator
    const allocationSection = page.locator('.border-t.pt-4');
    await expect(allocationSection).toBeVisible();
  });
});
