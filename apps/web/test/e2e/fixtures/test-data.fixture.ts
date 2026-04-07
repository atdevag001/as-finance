/**
 * Test Data Fixtures for E2E Tests
 *
 * Provides API helpers for creating and managing test data.
 * Uses the backend API at localhost:3001.
 *
 * @module fixtures/test-data
 */

import { TEST_USERS, type UserRole } from './auth.fixture';

const API_BASE = 'http://localhost:3001';

// Cache tokens to avoid repeated login calls
const tokenCache: Map<string, string> = new Map();

/**
 * Get a JWT token for a user by logging in via the API.
 */
export async function getAuthToken(username: string, password: string): Promise<string> {
  const cacheKey = `${username}:${password}`;
  if (tokenCache.has(cacheKey)) {
    return tokenCache.get(cacheKey)!;
  }

  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    throw new Error(`Login failed for ${username}: ${res.status} ${res.statusText}`);
  }

  const body = await res.json();
  const token = body.accessToken ?? body.access_token ?? body.token;

  if (!token) {
    throw new Error(`No token returned for ${username}`);
  }

  tokenCache.set(cacheKey, token);
  return token;
}

/**
 * Get a JWT token for a specific role.
 */
export async function getTokenForRole(role: UserRole): Promise<string> {
  const user = TEST_USERS[role];
  return getAuthToken(user.username, user.password);
}

/**
 * Make an authenticated API request.
 */
export async function apiRequest<T = unknown>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  token: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`API ${method} ${path} failed: ${res.status} - ${errorBody}`);
  }

  // Handle 204 No Content
  if (res.status === 204) {
    return {} as T;
  }

  return res.json();
}

/**
 * Create a test customer via API.
 */
export async function createTestCustomer(
  token: string,
  overrides: Partial<{
    fullName: string;
    mobile: string;
    aadhaar: string;
    pan: string;
    dateOfBirth: string;
    gender: 'male' | 'female' | 'other';
    monthlyIncomePaise: number;
    address: {
      line1: string;
      city: string;
      district: string;
      state: string;
      pincode: string;
    };
  }> = {},
): Promise<string> {
  // Generate unique test data
  const timestamp = Date.now();
  const randomSuffix = Math.floor(Math.random() * 10000);

  const customer = {
    full_name: overrides.fullName ?? `Test Customer ${timestamp}`,
    mobile: overrides.mobile ?? `9${String(timestamp).slice(-9)}`,
    aadhaar: overrides.aadhaar ?? generateValidAadhaar(),
    pan: overrides.pan ?? generateValidPAN(),
    date_of_birth: overrides.dateOfBirth ?? '1990-01-15',
    gender: overrides.gender ?? 'male',
    monthly_income_paise: overrides.monthlyIncomePaise ?? 5000000, // ₹50,000
    address: overrides.address ?? {
      line1: `${randomSuffix} Test Street`,
      city: 'Mumbai',
      district: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
    },
  };

  const result = await apiRequest<{ id: string }>('POST', '/customers', token, customer);
  return result.id;
}

/**
 * Create a test loan via API.
 */
export async function createTestLoan(
  token: string,
  customerId: string,
  productId?: string,
  overrides: Partial<{
    principalPaise: number;
    tenureMonths: number;
    purpose: string;
  }> = {},
): Promise<string> {
  // Get first active loan product if not provided
  if (!productId) {
    const products = await apiRequest<{ data: Array<{ id: string; is_active: boolean }> }>(
      'GET',
      '/loan-products?limit=1',
      token,
    );
    if (!products.data?.length) {
      throw new Error('No loan products found');
    }
    productId = products.data[0].id;
  }

  const loan = {
    customer_id: customerId,
    product_id: productId,
    principal_paise: overrides.principalPaise ?? 5000000, // ₹50,000
    tenure_months: overrides.tenureMonths ?? 12,
    purpose: overrides.purpose ?? 'Test loan purpose',
  };

  const result = await apiRequest<{ id: string }>('POST', '/loans', token, loan);
  return result.id;
}

/**
 * Advance a loan to a specific status.
 */
export async function advanceLoanToStatus(
  token: string,
  loanId: string,
  targetStatus: 'submitted' | 'under_review' | 'approved' | 'disbursed' | 'active',
): Promise<void> {
  const statusActions: Record<string, string> = {
    submitted: '/submit',
    under_review: '/review',
    approved: '/approve',
    disbursed: '/disburse',
  };

  // Get current loan status
  const loan = await apiRequest<{ status: string }>('GET', `/loans/${loanId}`, token);

  const statusOrder = ['draft', 'submitted', 'under_review', 'approved', 'disbursed', 'active'];
  const currentIndex = statusOrder.indexOf(loan.status);
  const targetIndex = statusOrder.indexOf(targetStatus);

  if (targetIndex <= currentIndex) {
    return; // Already at or past target status
  }

  // Advance through each status
  for (let i = currentIndex + 1; i <= targetIndex; i++) {
    const status = statusOrder[i];
    const action = statusActions[status];
    if (action) {
      await apiRequest('POST', `/loans/${loanId}${action}`, token, {
        disbursement_mode: status === 'disbursed' ? 'cash' : undefined,
      });
    }
  }
}

/**
 * Create a test collection via API.
 */
export async function createTestCollection(
  token: string,
  loanId: string,
  amountPaise: number = 500000, // ₹5,000
): Promise<string> {
  const collection = {
    loan_id: loanId,
    amount_paise: amountPaise,
    payment_mode: 'cash',
    payment_date: new Date().toISOString().split('T')[0],
    idempotency_key: crypto.randomUUID(),
  };

  const result = await apiRequest<{ id: string }>('POST', '/collections', token, collection);
  return result.id;
}

/**
 * Create a test group via API.
 */
export async function createTestGroup(
  token: string,
  overrides: Partial<{
    name: string;
    meetingDay: string;
    leaderId: string;
  }> = {},
): Promise<string> {
  const timestamp = Date.now();

  const group = {
    name: overrides.name ?? `Test Group ${timestamp}`,
    meeting_day: overrides.meetingDay ?? 'monday',
    leader_id: overrides.leaderId,
  };

  const result = await apiRequest<{ id: string }>('POST', '/groups', token, group);
  return result.id;
}

/**
 * Generate a valid Aadhaar number (12 digits with valid Verhoeff checksum).
 */
function generateValidAadhaar(): string {
  // Verhoeff multiplication table
  const d = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
    [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
  ];
  const p = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
  ];
  const inv = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

  // Generate 11 random digits (first digit 2-9)
  const digits: number[] = [];
  digits.push(Math.floor(Math.random() * 8) + 2); // 2-9
  for (let i = 1; i < 11; i++) {
    digits.push(Math.floor(Math.random() * 10));
  }

  // Calculate Verhoeff checksum
  let c = 0;
  for (let i = 0; i < 11; i++) {
    c = d[c][p[(i + 1) % 8][digits[10 - i]]];
  }

  digits.push(inv[c]);
  return digits.join('');
}

/**
 * Generate a valid PAN number (AAAAA1234A format).
 */
function generateValidPAN(): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const digits = '0123456789';

  let pan = '';
  // First 5 letters
  for (let i = 0; i < 5; i++) {
    pan += letters[Math.floor(Math.random() * 26)];
  }
  // 4 digits
  for (let i = 0; i < 4; i++) {
    pan += digits[Math.floor(Math.random() * 10)];
  }
  // Last letter
  pan += letters[Math.floor(Math.random() * 26)];

  return pan;
}

/**
 * Clear the token cache (useful between test suites).
 */
export function clearTokenCache(): void {
  tokenCache.clear();
}

/**
 * Clean up test data created during tests.
 * Note: This is a best-effort cleanup; some test data may persist.
 */
export async function cleanupTestData(): Promise<void> {
  // In a real implementation, this would delete test-created entities
  // For now, we rely on the test database being reset between test runs
  clearTokenCache();
}
