/**
 * Test Data Fixtures for E2E Tests
 *
 * Provides API helpers for creating and managing test data.
 * Uses the backend API at localhost:3001.
 *
 * @module fixtures/test-data
 */

import { TEST_USERS, type UserRole } from './auth.fixture';
import * as fs from 'fs';
import * as path from 'path';

const API_BASE = 'http://localhost:3001';
const AUTH_DIR = path.join(__dirname, '..', '.auth');

// Cache tokens to avoid repeated login calls
const tokenCache: Map<string, string> = new Map();

/**
 * Read an access_token cookie from the storage state file written by
 * auth.setup.ts. Returns null if no fresh token is available. Saves
 * us from hammering /auth/login from N parallel workers (the route
 * rate-limits at 5 req / 60s).
 */
function readTokenFromStorageState(role: UserRole): string | null {
  const file = path.join(AUTH_DIR, `${role}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    const json = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      cookies: Array<{ name: string; value: string }>;
    };
    const cookie = json.cookies?.find((c) => c.name === 'access_token');
    if (!cookie?.value) return null;
    // Decode the JWT exp claim directly — the cookie's `expires` field
    // reflects Set-Cookie Max-Age (hardcoded 15min in auth.controller),
    // not the JWT's actual TTL (JWT_EXPIRY env). With JWT_EXPIRY=60m the
    // JWT outlasts the cookie maxAge.
    const parts = cookie.value.split('.');
    if (parts.length < 2) return null;
    try {
      const payload = JSON.parse(
        Buffer.from(parts[1]!, 'base64url').toString('utf8'),
      ) as { exp?: number };
      if (!payload.exp || payload.exp < Date.now() / 1000 + 30) return null;
    } catch {
      return null;
    }
    return cookie.value;
  } catch {
    return null;
  }
}

// Cache csrf_token cookies per token so we don't fetch one before every
// mutating request. The backend (audit pass) requires x-csrf-token on
// every non-GET/HEAD/OPTIONS request via CsrfGuard. We grab one via a
// safe-method probe and reuse it.
const csrfCache: Map<string, string> = new Map();

async function getCsrfToken(token: string): Promise<string> {
  const cached = csrfCache.get(token);
  if (cached) return cached;

  // /auth/refresh is @Public and always issues csrf_token on response.
  // We hit it intentionally; the body is irrelevant — the Set-Cookie is.
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const setCookie = res.headers.get('set-cookie') ?? '';
  const match = setCookie.match(/csrf_token=([^;]+)/);
  if (!match) {
    throw new Error('Could not obtain csrf_token from /auth/refresh');
  }
  csrfCache.set(token, match[1]!);
  return match[1]!;
}

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
  // Prefer the cookie cached by auth-setup so N parallel workers don't
  // all hit /auth/login (rate-limited at 5/60s). Fall back to a real
  // login only when the storage state file is missing or expired.
  const cached = readTokenFromStorageState(role);
  if (cached) return cached;
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
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  // CSRF: any non-safe method needs the double-submit token. Fetch once
  // per token and reuse — the cookie is good for 24h.
  if (method !== 'GET') {
    const csrf = await getCsrfToken(token);
    headers['Cookie'] = `csrf_token=${csrf}`;
    headers['x-csrf-token'] = csrf;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
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
    aadhaarNumber: string;
    panNumber: string;
    dob: string;
    gender: 'male' | 'female' | 'other';
    monthlyIncomePaise: number;
    addressLine1: string;
    city: string;
    district: string;
    state: string;
    pincode: string;
  }> = {},
): Promise<string> {
  // Generate unique test data
  const timestamp = Date.now();
  const randomSuffix = Math.floor(Math.random() * 10000);

  const customer = {
    fullName: overrides.fullName ?? `Test Customer ${timestamp}`,
    mobile: overrides.mobile ?? `9${String(timestamp).slice(-9)}`,
    aadhaarNumber: overrides.aadhaarNumber ?? generateValidAadhaar(),
    panNumber: overrides.panNumber ?? generateValidPAN(),
    dob: overrides.dob ?? '1990-01-15',
    gender: overrides.gender ?? 'male',
    monthlyIncomePaise: overrides.monthlyIncomePaise ?? 5000000, // ₹50,000
    addressLine1: overrides.addressLine1 ?? `${randomSuffix} Test Street`,
    city: overrides.city ?? 'Mumbai',
    district: overrides.district ?? 'Mumbai',
    state: overrides.state ?? 'Maharashtra',
    pincode: overrides.pincode ?? '400001',
  };

  const result = await apiRequest<{ customer: { id: string } }>('POST', '/customers', token, customer);
  return result.customer.id;
}

/**
 * Create a test loan via API.
 */
export async function createTestLoan(
  token: string,
  customerId: string,
  productVersionId?: string,
  overrides: Partial<{
    principalPaise: number;
    tenureMonths: number;
    purpose: string;
  }> = {},
): Promise<string> {
  // Get the current_version_id of the first active loan product if not
  // provided. The loan DTO requires a version UUID, not a product UUID
  // (loan-products are versioned so historical loans pin to the version
  // they were created under).
  if (!productVersionId) {
    const products = await apiRequest<{
      data: Array<{ id: string; current_version_id: string; current_version?: { id: string }; is_active: boolean }>
    }>(
      'GET',
      '/loan-products?limit=10',
      token,
    );
    const active = (products.data ?? []).find(
      (p) => p.is_active && (p.current_version_id ?? p.current_version?.id),
    );
    if (!active) throw new Error('No active loan products with a current version found');
    productVersionId = active.current_version_id ?? active.current_version!.id;
  }

  const loan = {
    customerId,
    productVersionId,
    principalPaise: overrides.principalPaise ?? 5000000, // ₹50,000
    tenureMonths: overrides.tenureMonths ?? 12,
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

  // The audit added a maker-checker rule: whoever created the loan
  // cannot approve it. Use a different actor (super_admin) for the
  // approve step. Same actor is fine for submit / review / disburse.
  let approverToken: string | null = null;

  for (let i = currentIndex + 1; i <= targetIndex; i++) {
    const status = statusOrder[i];
    const action = statusActions[status];
    if (!action) continue;
    const actorToken =
      status === 'approved' ? (approverToken ??= await getTokenForRole('super_admin')) : token;
    await apiRequest(
      'POST',
      `/loans/${loanId}${action}`,
      actorToken,
      status === 'disbursed' ? { mode: 'cash' } : undefined,
    );
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
    loanId,
    amountPaise,
    paymentMode: 'cash',
    paymentDate: new Date().toISOString().split('T')[0],
    idempotencyKey: crypto.randomUUID(),
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
  csrfCache.clear();
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
