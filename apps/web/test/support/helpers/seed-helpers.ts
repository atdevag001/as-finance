import type { APIRequestContext } from '@playwright/test';

const API_URL = process.env['API_URL'] || 'http://localhost:3001';

async function apiPost(request: APIRequestContext, path: string, data: unknown, token: string) {
  const response = await request.post(`${API_URL}${path}`, {
    data,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!response.ok()) {
    const text = await response.text();
    throw new Error(`Seed failed: POST ${path} → ${response.status()} ${text}`);
  }
  return response.json();
}

export async function seedCustomer(request: APIRequestContext, token: string, overrides: Record<string, unknown> = {}) {
  const data = {
    full_name: `Test Customer ${Date.now()}`,
    aadhaar_number: '123456789012',
    pan_number: 'ABCDE1234F',
    mobile: `9${Math.floor(100000000 + Math.random() * 900000000)}`,
    address: 'Test Address, Test City',
    pincode: '400001',
    ...overrides,
  };
  return apiPost(request, '/customers', data, token);
}

export async function seedLoan(request: APIRequestContext, token: string, customerId: string, overrides: Record<string, unknown> = {}) {
  const data = {
    customer_id: customerId,
    product_version_id: overrides['product_version_id'] || 'default-pv-id',
    principal_paise: 100_000_00,
    tenure_months: 12,
    ...overrides,
  };
  return apiPost(request, '/loans', data, token);
}

export async function seedCollection(request: APIRequestContext, token: string, loanId: string, amountPaise: number, overrides: Record<string, unknown> = {}) {
  const data = {
    loan_id: loanId,
    amount_paise: amountPaise,
    payment_mode: 'cash',
    payment_date: new Date().toISOString().split('T')[0],
    idempotency_key: `test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    ...overrides,
  };
  return apiPost(request, '/collections', data, token);
}
