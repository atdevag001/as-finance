import { test, expect, type Page } from './fixtures';

/**
 * Customer Onboarding — Playwright E2E Tests
 *
 * Uses pre-authenticated fieldOfficerPage fixture for fast test execution.
 *
 * Tests cover:
 * 1. Fill customer form with valid data → submit → verify redirect to customers list
 * 2. Aadhaar validation error shown inline for invalid format
 * 3. PAN validation error shown inline for invalid format (if field present)
 * 4. Duplicate Aadhaar detection → verify warning/error
 */

// Unique suffix to avoid collisions across test runs
const UNIQUE = Date.now().toString().slice(-6);

interface CustomerFormData {
  fullName: string;
  fatherOrHusbandName: string;
  mobile: string;
  aadhaarNumber: string;
  gender: string;
  addressLine1: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
}

/**
 * Helper: fill the customer form with valid data.
 */
async function fillValidCustomerForm(page: Page, overrides: Partial<CustomerFormData> = {}, skipValidation = false) {
  const rand3 = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  const rand4 = Math.floor(Math.random() * 10000).toString().padStart(4, '0');

  const data: CustomerFormData = {
    fullName: `Test Customer ${UNIQUE}`,
    fatherOrHusbandName: 'Test Father',
    mobile: `9${UNIQUE}${rand3}`.slice(0, 10),
    aadhaarNumber: `2${UNIQUE}00${rand4}`.slice(0, 12),
    gender: 'male',
    addressLine1: '123 Test Street',
    city: 'TestCity',
    district: 'TestDistrict',
    state: 'TestState',
    pincode: '560001',
    ...overrides,
  };

  // Only auto-correct invalid data if not testing validation
  if (!skipValidation) {
    if (data.aadhaarNumber.length !== 12) {
      data.aadhaarNumber = '234567890123';
    }
    if (!/^[6-9]\d{9}$/.test(data.mobile)) {
      data.mobile = '9876543210';
    }
  }

  // Use text-based locators since form doesn't have proper accessible labels
  await page.locator('text=Full Name *').locator('..').getByRole('textbox').fill(data.fullName);
  if (data.fatherOrHusbandName) {
    await page.locator('text=Father/Husband Name').locator('..').getByRole('textbox').fill(data.fatherOrHusbandName);
  }
  await page.locator('text=Mobile *').locator('..').getByRole('textbox').first().fill(data.mobile);
  await page.locator('text=Aadhaar Number *').locator('..').getByRole('textbox').fill(data.aadhaarNumber);

  // Select gender from dropdown
  await page.locator('text=Gender *').locator('..').getByRole('combobox').selectOption(data.gender);

  await page.locator('text=Address Line 1 *').locator('..').getByRole('textbox').fill(data.addressLine1);
  await page.locator('text=City *').locator('..').getByRole('textbox').fill(data.city);
  await page.locator('text=District *').locator('..').getByRole('textbox').fill(data.district);
  await page.locator('text=State *').locator('..').getByRole('textbox').fill(data.state);
  await page.locator('text=Pincode *').locator('..').getByRole('textbox').fill(data.pincode);
}

test.describe('Customer Onboarding', () => {
  test('fill customer form with valid data → submit → verify redirect to customers list', async ({ fieldOfficerPage }) => {
    await fieldOfficerPage.goto('/customers/new');
    await fieldOfficerPage.waitForLoadState('domcontentloaded');
    await expect(fieldOfficerPage.getByRole('heading', { name: /register customer/i })).toBeVisible({ timeout: 30_000 });

    await fillValidCustomerForm(fieldOfficerPage);
    await fieldOfficerPage.getByRole('button', { name: 'Register Customer' }).click();

    // On success the app redirects to /customers
    await fieldOfficerPage.waitForURL('**/customers', { timeout: 15_000 });
    await expect(fieldOfficerPage).toHaveURL(/\/customers$/);
  });

  test('Aadhaar validation error shown inline for invalid format', async ({ fieldOfficerPage }) => {
    await fieldOfficerPage.goto('/customers/new');
    await fieldOfficerPage.waitForLoadState('domcontentloaded');
    await expect(fieldOfficerPage.getByRole('heading', { name: /register customer/i })).toBeVisible({ timeout: 30_000 });

    // Fill form with an invalid Aadhaar (less than 12 digits)
    await fillValidCustomerForm(fieldOfficerPage, { aadhaarNumber: '12345' }, true);
    await fieldOfficerPage.getByRole('button', { name: 'Register Customer' }).click();

    // Validation error should appear inline
    const validationError = fieldOfficerPage.locator('p.text-destructive');
    await expect(validationError.first()).toBeVisible({ timeout: 10_000 });
    await expect(fieldOfficerPage.getByText(/Aadhaar must be exactly 12 digits/i)).toBeVisible();
  });

  test('PAN validation error shown inline for invalid format', async ({ fieldOfficerPage }) => {
    await fieldOfficerPage.goto('/customers/new');
    await fieldOfficerPage.waitForLoadState('domcontentloaded');
    await expect(fieldOfficerPage.getByRole('heading', { name: /register customer/i })).toBeVisible({ timeout: 30_000 });

    await fillValidCustomerForm(fieldOfficerPage);

    // Check if PAN field exists
    const panFieldContainer = fieldOfficerPage.locator('text=PAN').locator('..');
    const panInput = panFieldContainer.getByRole('textbox');
    const panFieldVisible = await panInput.isVisible().catch(() => false);

    if (!panFieldVisible) {
      test.skip();
      return;
    }

    await panInput.fill('INVALID');
    await fieldOfficerPage.getByRole('button', { name: 'Register Customer' }).click();

    const validationError = fieldOfficerPage.locator('p.text-destructive');
    await expect(validationError.first()).toBeVisible({ timeout: 10_000 });
  });

  test('duplicate Aadhaar detection → verify warning or error', async ({ fieldOfficerPage }) => {
    await fieldOfficerPage.goto('/customers/new');
    await fieldOfficerPage.waitForLoadState('domcontentloaded');
    await expect(fieldOfficerPage.getByRole('heading', { name: /register customer/i })).toBeVisible({ timeout: 30_000 });

    const knownAadhaar = '234567890123';
    await fillValidCustomerForm(fieldOfficerPage, {
      fullName: `Dup Test A ${UNIQUE}`,
      aadhaarNumber: knownAadhaar,
      mobile: `9${UNIQUE}001`.slice(0, 10),
    });
    await fieldOfficerPage.getByRole('button', { name: 'Register Customer' }).click();

    // Wait for either redirect (success) or error (duplicate already exists)
    const redirected = await fieldOfficerPage
      .waitForURL('**/customers', { timeout: 10_000 })
      .then(() => true)
      .catch(() => false);

    if (!redirected) {
      // If not redirected, expect a duplicate error message
      const duplicateError = fieldOfficerPage.getByText(/already.*exists|duplicate|Aadhaar.*taken/i);
      await expect(duplicateError).toBeVisible({ timeout: 5_000 });
      return;
    }

    // First customer registered successfully; now try with same Aadhaar
    await fieldOfficerPage.goto('/customers/new');
    await fieldOfficerPage.waitForLoadState('domcontentloaded');
    await expect(fieldOfficerPage.getByRole('heading', { name: /register customer/i })).toBeVisible({ timeout: 30_000 });

    await fillValidCustomerForm(fieldOfficerPage, {
      fullName: `Dup Test B ${UNIQUE}`,
      aadhaarNumber: knownAadhaar,
      mobile: `9${UNIQUE}002`.slice(0, 10),
    });
    await fieldOfficerPage.getByRole('button', { name: 'Register Customer' }).click();

    // Now expect duplicate error
    const duplicateError = fieldOfficerPage.getByText(/already.*exists|duplicate|Aadhaar.*taken/i);
    await expect(duplicateError).toBeVisible({ timeout: 10_000 });
  });

  test('manager can access customers list', async ({ managerPage }) => {
    await managerPage.goto('/customers');
    await managerPage.waitForLoadState('domcontentloaded');
    await expect(managerPage.getByRole('heading', { name: /customers/i })).toBeVisible({ timeout: 30_000 });
  });

  test('customers list displays table with columns', async ({ managerPage }) => {
    await managerPage.goto('/customers');
    await managerPage.waitForLoadState('domcontentloaded');
    await expect(managerPage.getByRole('heading', { name: /customers/i })).toBeVisible({ timeout: 30_000 });

    const table = managerPage.locator('table');
    if (await table.isVisible()) {
      // Use table header cells for more reliable matching
      const headerRow = table.locator('thead tr').first();
      await expect(headerRow.getByText('Name').or(headerRow.getByText('Full Name'))).toBeVisible({ timeout: 5_000 });
      await expect(headerRow.getByText('Mobile').or(headerRow.getByText('Phone'))).toBeVisible({ timeout: 5_000 });
    }
  });
});
