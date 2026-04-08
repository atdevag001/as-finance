/**
 * Test Data Manager
 *
 * Provides isolated test data for E2E tests to prevent conflicts.
 * Each test run gets unique identifiers to avoid data collision.
 */

import { Page } from '@playwright/test';

// Generate unique identifier for this test run
const RUN_ID = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export interface TestCustomer {
  fullName: string;
  fatherOrHusbandName: string;
  mobile: string;
  aadhaarNumber: string;
  gender: 'male' | 'female' | 'other';
  addressLine1: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
}

export interface TestLoan {
  productId: string;
  customerId: string;
  principal: number;
  tenure: number;
  purpose: string;
}

export interface TestCollection {
  loanId: string;
  amount: number;
  paymentMode: 'cash' | 'cheque' | 'upi' | 'bank_transfer';
}

/**
 * Generate unique test customer data
 */
export function generateCustomer(suffix?: string): TestCustomer {
  const id = suffix || RUN_ID;
  const randomDigits = () => Math.floor(Math.random() * 10000).toString().padStart(4, '0');

  return {
    fullName: `Test Customer ${id}`,
    fatherOrHusbandName: `Father ${id}`,
    mobile: `9${id.slice(0, 4).padStart(4, '0')}${randomDigits()}`.slice(0, 10),
    aadhaarNumber: `2${randomDigits()}${randomDigits()}${randomDigits()}`.slice(0, 12),
    gender: 'male',
    addressLine1: `${id} Test Street`,
    city: 'TestCity',
    district: 'TestDistrict',
    state: 'TestState',
    pincode: '560001',
  };
}

/**
 * Generate unique test loan data
 */
export function generateLoan(customerId: string, productId?: string): TestLoan {
  return {
    productId: productId || 'default-product',
    customerId,
    principal: 10000 + Math.floor(Math.random() * 90000),
    tenure: 6 + Math.floor(Math.random() * 18),
    purpose: `Test Loan ${RUN_ID}`,
  };
}

/**
 * Generate unique test collection data
 */
export function generateCollection(loanId: string, amount?: number): TestCollection {
  return {
    loanId,
    amount: amount || 1000 + Math.floor(Math.random() * 4000),
    paymentMode: 'cash',
  };
}

/**
 * Create test customer via API
 */
export async function createTestCustomerViaAPI(
  token: string,
  data?: Partial<TestCustomer>
): Promise<{ id: string; customer: TestCustomer }> {
  const customer = { ...generateCustomer(), ...data };

  const response = await fetch('http://localhost:3001/api/customers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(customer),
  });

  if (!response.ok) {
    throw new Error(`Failed to create customer: ${response.statusText}`);
  }

  const result = await response.json();
  return { id: result.id, customer };
}

/**
 * Delete test data created by this run
 */
export async function cleanupTestData(token: string): Promise<void> {
  console.log(`Cleaning up test data for run: ${RUN_ID}`);

  // In a real implementation, you would:
  // 1. Track created entities in a map/array
  // 2. Delete them in reverse order (collections -> loans -> customers)
  // 3. Handle errors gracefully

  // For now, this is a placeholder
  // Real cleanup would use API calls with the token
}

/**
 * Fill customer form on page
 */
export async function fillCustomerForm(
  page: Page,
  customer: TestCustomer
): Promise<void> {
  // Use flexible selectors that work with the actual form
  const fillField = async (labelPattern: RegExp, value: string) => {
    const container = page.locator(`text=${labelPattern.source}`).locator('..');
    const input = container.getByRole('textbox').first();
    if (await input.isVisible().catch(() => false)) {
      await input.fill(value);
    }
  };

  await fillField(/full\s*name/i, customer.fullName);
  await fillField(/father|husband/i, customer.fatherOrHusbandName);
  await fillField(/mobile/i, customer.mobile);
  await fillField(/aadhaar/i, customer.aadhaarNumber);
  await fillField(/address/i, customer.addressLine1);
  await fillField(/city/i, customer.city);
  await fillField(/district/i, customer.district);
  await fillField(/state/i, customer.state);
  await fillField(/pincode/i, customer.pincode);

  // Handle gender dropdown
  const genderSelect = page.locator('text=/gender/i').locator('..').getByRole('combobox');
  if (await genderSelect.isVisible().catch(() => false)) {
    await genderSelect.selectOption(customer.gender);
  }
}

/**
 * Get current test run ID
 */
export function getRunId(): string {
  return RUN_ID;
}

/**
 * Generate unique string for this test run
 */
export function uniqueString(prefix: string = ''): string {
  return `${prefix}${RUN_ID}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Wait for API to be ready
 */
export async function waitForAPI(
  baseUrl: string = 'http://localhost:3001',
  timeout: number = 30000
): Promise<boolean> {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(`${baseUrl}/health/live`);
      if (response.ok) return true;
    } catch {
      // Continue waiting
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return false;
}

/**
 * Test data snapshot for rollback
 */
export class TestDataSnapshot {
  private createdIds: Map<string, string[]> = new Map();

  track(type: 'customer' | 'loan' | 'collection' | 'receipt', id: string): void {
    const ids = this.createdIds.get(type) || [];
    ids.push(id);
    this.createdIds.set(type, ids);
  }

  getCreatedIds(type: string): string[] {
    return this.createdIds.get(type) || [];
  }

  async rollback(token: string): Promise<void> {
    // Delete in reverse dependency order
    const order = ['receipt', 'collection', 'loan', 'customer'];

    for (const type of order) {
      const ids = this.createdIds.get(type) || [];
      for (const id of ids.reverse()) {
        try {
          await fetch(`http://localhost:3001/api/${type}s/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          });
          console.log(`Deleted ${type}: ${id}`);
        } catch (error) {
          console.warn(`Failed to delete ${type} ${id}:`, error);
        }
      }
    }

    this.createdIds.clear();
  }
}
