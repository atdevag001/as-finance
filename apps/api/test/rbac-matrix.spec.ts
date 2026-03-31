import { describe, it, expect, beforeAll } from 'vitest';
import supertest from 'supertest';
import { getApiBaseUrl, getUserTokens } from './helpers/seed.js';
import { createAuthClients, type AuthClients } from './helpers/auth-client.js';

/**
 * RBAC Matrix Tests
 *
 * Exhaustive tests verifying every role against every protected endpoint.
 * Tests all 7 roles: super_admin, manager, field_officer, collection_officer,
 * accountant, office_staff, viewer_auditor.
 *
 * For allowed roles: expects 200/201 (or 404/422 for missing entities — NOT 403).
 * For denied roles: expects 403.
 * For unauthenticated: expects 401.
 *
 * Validates: Requirements 39.1, 39.2, 39.3, 39.4, 39.5, 39.6
 */

// ─── Types ───────────────────────────────────────────────────────────────────

type RoleKey =
  | 'superAdmin'
  | 'manager'
  | 'fieldOfficer'
  | 'collectionOfficer'
  | 'accountant'
  | 'officeStaff'
  | 'viewerAuditor';

type HttpMethod = 'get' | 'post' | 'patch' | 'put' | 'delete';

interface EndpointDef {
  method: HttpMethod;
  path: string;
  permission: string;
  /** Body to send for POST/PATCH/PUT requests (minimal, just enough to avoid 400 before RBAC) */
  body?: Record<string, unknown>;
  /** Description for test output */
  label: string;
}

// ─── Role mapping ────────────────────────────────────────────────────────────

const ROLE_KEYS: RoleKey[] = [
  'superAdmin',
  'manager',
  'fieldOfficer',
  'collectionOfficer',
  'accountant',
  'officeStaff',
  'viewerAuditor',
];

const ROLE_KEY_TO_ENUM: Record<RoleKey, string> = {
  superAdmin: 'super_admin',
  manager: 'manager',
  fieldOfficer: 'field_officer',
  collectionOfficer: 'collection_officer',
  accountant: 'accountant',
  officeStaff: 'office_staff',
  viewerAuditor: 'viewer_auditor',
};

// ─── Endpoint Definitions ────────────────────────────────────────────────────
// Each endpoint maps to a permission from the PERMISSIONS constant.
// We use dummy UUIDs for path params — the RBAC guard runs before service logic,
// so 403 is returned before any "not found" check for denied roles.

const DUMMY_UUID = '00000000-0000-0000-0000-000000000001';

const ENDPOINTS: EndpointDef[] = [
  // ── Customer ─────────────────────────────────────────────────────────────
  { method: 'post', path: '/customers', permission: 'customer.create', body: { fullName: 'RBAC Test', aadhaarNumber: '123456789012', mobile: '9999999999' }, label: 'POST /customers (customer.create)' },
  { method: 'get', path: '/customers', permission: 'customer.read', label: 'GET /customers (customer.read)' },
  { method: 'get', path: `/customers/${DUMMY_UUID}`, permission: 'customer.read', label: 'GET /customers/:id (customer.read)' },
  { method: 'patch', path: `/customers/${DUMMY_UUID}`, permission: 'customer.update', body: { fullName: 'Updated' }, label: 'PATCH /customers/:id (customer.update)' },
  { method: 'post', path: `/customers/${DUMMY_UUID}/blacklist`, permission: 'customer.blacklist', body: { reason: 'test' }, label: 'POST /customers/:id/blacklist (customer.blacklist)' },
  { method: 'post', path: `/customers/${DUMMY_UUID}/reinstate`, permission: 'customer.blacklist', body: { reason: 'test' }, label: 'POST /customers/:id/reinstate (customer.blacklist)' },
  { method: 'post', path: `/customers/${DUMMY_UUID}/family-members`, permission: 'customer.update', body: { fullName: 'Test', relationship: 'spouse' }, label: 'POST /customers/:id/family-members (customer.update)' },
  { method: 'post', path: `/customers/${DUMMY_UUID}/guarantors`, permission: 'customer.update', body: { fullName: 'Test', mobile: '9999999998' }, label: 'POST /customers/:id/guarantors (customer.update)' },

  // ── Document ─────────────────────────────────────────────────────────────
  { method: 'get', path: `/documents/${DUMMY_UUID}/url`, permission: 'customer.read', label: 'GET /documents/:id/url (customer.read)' },

  // ── Loan ─────────────────────────────────────────────────────────────────
  { method: 'post', path: '/loans', permission: 'loan.create', body: { customerId: DUMMY_UUID, productVersionId: DUMMY_UUID, principalPaise: 100000, tenureMonths: 12 }, label: 'POST /loans (loan.create)' },
  { method: 'get', path: '/loans', permission: 'loan.read', label: 'GET /loans (loan.read)' },
  { method: 'get', path: `/loans/${DUMMY_UUID}`, permission: 'loan.read', label: 'GET /loans/:id (loan.read)' },
  { method: 'post', path: `/loans/${DUMMY_UUID}/submit`, permission: 'loan.submit', label: 'POST /loans/:id/submit (loan.submit)' },
  { method: 'post', path: `/loans/${DUMMY_UUID}/review`, permission: 'loan.approve', label: 'POST /loans/:id/review (loan.approve)' },
  { method: 'post', path: `/loans/${DUMMY_UUID}/approve`, permission: 'loan.approve', body: { remarks: 'ok' }, label: 'POST /loans/:id/approve (loan.approve)' },
  { method: 'post', path: `/loans/${DUMMY_UUID}/reject`, permission: 'loan.reject', body: { reason: 'test' }, label: 'POST /loans/:id/reject (loan.reject)' },
  { method: 'post', path: `/loans/${DUMMY_UUID}/close`, permission: 'loan.close', label: 'POST /loans/:id/close (loan.close)' },

  // ── Loan Product ─────────────────────────────────────────────────────────
  { method: 'get', path: '/loan-products', permission: 'loan.read', label: 'GET /loan-products (loan.read)' },
  { method: 'get', path: `/loan-products/${DUMMY_UUID}`, permission: 'loan.read', label: 'GET /loan-products/:id (loan.read)' },

  // ── Disbursement ─────────────────────────────────────────────────────────
  { method: 'post', path: '/disbursements', permission: 'loan.disburse', body: { loanId: DUMMY_UUID, idempotencyKey: 'rbac-test-key' }, label: 'POST /disbursements (loan.disburse)' },

  // ── Collection ───────────────────────────────────────────────────────────
  { method: 'post', path: '/collections', permission: 'collection.create', body: { loanId: DUMMY_UUID, amountPaise: 1000, paymentMode: 'cash', idempotencyKey: 'rbac-test-col' }, label: 'POST /collections (collection.create)' },

  // ── Reversal ─────────────────────────────────────────────────────────────
  { method: 'post', path: '/reversals', permission: 'collection.reverse', body: { collectionId: DUMMY_UUID, reason: 'test', remarks: 'test' }, label: 'POST /reversals (collection.reverse)' },

  // ── Receipt ──────────────────────────────────────────────────────────────
  { method: 'get', path: `/receipts/${DUMMY_UUID}`, permission: 'receipt.read', label: 'GET /receipts/:id (receipt.read)' },
  { method: 'get', path: `/receipts/${DUMMY_UUID}/print`, permission: 'receipt.print', label: 'GET /receipts/:id/print (receipt.print)' },

  // ── Penalty ──────────────────────────────────────────────────────────────
  { method: 'post', path: '/penalties/calculate', permission: 'penalty.calculate', body: { loanId: DUMMY_UUID }, label: 'POST /penalties/calculate (penalty.calculate)' },
  { method: 'post', path: `/penalties/${DUMMY_UUID}/waive`, permission: 'penalty.waive', body: { reason: 'test' }, label: 'POST /penalties/:id/waive (penalty.waive)' },
  { method: 'get', path: `/penalties/loan/${DUMMY_UUID}`, permission: 'penalty.read', label: 'GET /penalties/loan/:loanId (penalty.read)' },

  // ── Foreclosure ──────────────────────────────────────────────────────────
  { method: 'post', path: '/foreclosures/quote', permission: 'foreclosure.quote', body: { loanId: DUMMY_UUID }, label: 'POST /foreclosures/quote (foreclosure.quote)' },
  { method: 'post', path: '/foreclosures', permission: 'foreclosure.execute', body: { foreclosureId: DUMMY_UUID }, label: 'POST /foreclosures (foreclosure.execute)' },
  { method: 'get', path: `/foreclosures/${DUMMY_UUID}`, permission: 'foreclosure.quote', label: 'GET /foreclosures/:id (foreclosure.quote)' },

  // ── Accounting ───────────────────────────────────────────────────────────
  { method: 'get', path: '/accounting/chart-of-accounts', permission: 'accounting.read', label: 'GET /accounting/chart-of-accounts (accounting.read)' },
  { method: 'get', path: '/accounting/daybook?startDate=2025-01-01&endDate=2025-01-31', permission: 'accounting.read', label: 'GET /accounting/daybook (accounting.read)' },
  { method: 'get', path: '/accounting/trial-balance?asOfDate=2025-01-31', permission: 'accounting.read', label: 'GET /accounting/trial-balance (accounting.read)' },
  { method: 'get', path: '/accounting/profit-loss?startDate=2025-01-01&endDate=2025-01-31', permission: 'accounting.read', label: 'GET /accounting/profit-loss (accounting.read)' },
  { method: 'get', path: '/accounting/balance-sheet?asOfDate=2025-01-31', permission: 'accounting.read', label: 'GET /accounting/balance-sheet (accounting.read)' },

  // ── Cashbook ─────────────────────────────────────────────────────────────
  { method: 'post', path: '/cashbook/expenses', permission: 'accounting.create_expense', body: { category: 'travel', amountPaise: 5000, description: 'test', date: '2025-01-15' }, label: 'POST /cashbook/expenses (accounting.create_expense)' },
  { method: 'get', path: '/cashbook/expenses', permission: 'accounting.create_expense', label: 'GET /cashbook/expenses (accounting.create_expense)' },
  { method: 'post', path: '/cashbook/handovers', permission: 'handover.create', body: { amountPaise: 10000, receiverId: DUMMY_UUID }, label: 'POST /cashbook/handovers (handover.create)' },
  { method: 'get', path: '/cashbook/handovers', permission: 'accounting.manage_cashbook', label: 'GET /cashbook/handovers (accounting.manage_cashbook)' },
  { method: 'patch', path: `/cashbook/handovers/${DUMMY_UUID}/verify`, permission: 'handover.verify', body: { status: 'verified' }, label: 'PATCH /cashbook/handovers/:id/verify (handover.verify)' },
  { method: 'get', path: '/cashbook/daily-summary?date=2025-01-15', permission: 'accounting.manage_cashbook', label: 'GET /cashbook/daily-summary (accounting.manage_cashbook)' },

  // ── Group ────────────────────────────────────────────────────────────────
  { method: 'post', path: '/groups', permission: 'group.create', body: { name: 'RBAC Test Group', leaderId: DUMMY_UUID, branchArea: 'test' }, label: 'POST /groups (group.create)' },
  { method: 'get', path: '/groups', permission: 'group.read', label: 'GET /groups (group.read)' },
  { method: 'get', path: `/groups/${DUMMY_UUID}`, permission: 'group.read', label: 'GET /groups/:id (group.read)' },
  { method: 'post', path: `/groups/${DUMMY_UUID}/members`, permission: 'group.manage_members', body: { customerId: DUMMY_UUID }, label: 'POST /groups/:id/members (group.manage_members)' },
  { method: 'delete', path: `/groups/${DUMMY_UUID}/members/${DUMMY_UUID}`, permission: 'group.manage_members', label: 'DELETE /groups/:id/members/:memberId (group.manage_members)' },
  { method: 'post', path: `/groups/${DUMMY_UUID}/collections`, permission: 'group.collect', body: { totalAmountPaise: 5000, paymentMode: 'cash', memberPayments: [], idempotencyKey: 'rbac-grp' }, label: 'POST /groups/:id/collections (group.collect)' },
  { method: 'get', path: `/groups/${DUMMY_UUID}/summary`, permission: 'group.read', label: 'GET /groups/:id/summary (group.read)' },

  // ── Report ───────────────────────────────────────────────────────────────
  { method: 'get', path: '/reports', permission: 'report.read', label: 'GET /reports (report.read)' },
  { method: 'get', path: '/reports/daily-collection/export?format=csv', permission: 'report.export', label: 'GET /reports/:type/export (report.export)' },

  // ── Audit ────────────────────────────────────────────────────────────────
  { method: 'get', path: '/audit-logs', permission: 'audit.read', label: 'GET /audit-logs (audit.read)' },

  // ── User ─────────────────────────────────────────────────────────────────
  { method: 'post', path: '/users', permission: 'user.create', body: { username: 'rbac_test_user', password: 'TestPass1', fullName: 'RBAC Test', mobile: '9111111111', role: 'viewer_auditor' }, label: 'POST /users (user.create)' },
  { method: 'get', path: '/users', permission: 'user.read', label: 'GET /users (user.read)' },
  { method: 'get', path: `/users/${DUMMY_UUID}`, permission: 'user.read', label: 'GET /users/:id (user.read)' },
  { method: 'patch', path: `/users/${DUMMY_UUID}`, permission: 'user.update', body: { fullName: 'Updated' }, label: 'PATCH /users/:id (user.update)' },

  // ── Settings ─────────────────────────────────────────────────────────────
  { method: 'get', path: '/settings', permission: 'settings.read', label: 'GET /settings (settings.read)' },
  { method: 'get', path: '/settings/holidays', permission: 'settings.read', label: 'GET /settings/holidays (settings.read)' },
  { method: 'patch', path: '/settings/some_key', permission: 'settings.update', body: { value: 'test' }, label: 'PATCH /settings/:key (settings.update)' },
  { method: 'put', path: '/settings/holidays', permission: 'settings.update', body: { holidays: ['2025-01-26'] }, label: 'PUT /settings/holidays (settings.update)' },

  // ── Notification ─────────────────────────────────────────────────────────
  { method: 'get', path: '/notifications', permission: 'notification.read', label: 'GET /notifications (notification.read)' },
  { method: 'post', path: `/notifications/${DUMMY_UUID}/retry`, permission: 'notification.retry', label: 'POST /notifications/:id/retry (notification.retry)' },
];

// ─── PERMISSIONS loaded dynamically to avoid CJS/ESM issues ─────────────────

let PERMISSIONS: Record<string, readonly string[]>;

// ─── Helper: check if a role is allowed for a permission ─────────────────────

function isRoleAllowed(roleEnum: string, permission: string): boolean {
  const allowedRoles = PERMISSIONS[permission];
  if (!allowedRoles) return false;
  return allowedRoles.includes(roleEnum as never);
}

// ─── Helper: make a request ──────────────────────────────────────────────────

function makeRequest(
  agent: supertest.Agent,
  method: HttpMethod,
  path: string,
  body?: Record<string, unknown>,
): supertest.Test {
  switch (method) {
    case 'get':
      return agent.get(path);
    case 'post':
      return body ? agent.post(path).send(body) : agent.post(path);
    case 'patch':
      return body ? agent.patch(path).send(body) : agent.patch(path);
    case 'put':
      return body ? agent.put(path).send(body) : agent.put(path);
    case 'delete':
      return agent.delete(path);
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('RBAC Matrix — Role × Endpoint Enforcement', () => {
  let clients: AuthClients;

  beforeAll(async () => {
    const shared = await import('@as-finance/shared');
    PERMISSIONS = shared.PERMISSIONS as Record<string, readonly string[]>;

    const apiBaseUrl = getApiBaseUrl();
    const tokens = getUserTokens();
    clients = createAuthClients(apiBaseUrl, tokens);
  });

  // ── 39.2: Unauthenticated requests → 401 ────────────────────────────────

  describe('unauthenticated requests → 401', () => {
    for (const ep of ENDPOINTS) {
      it(`${ep.label} → 401`, async () => {
        const res = await makeRequest(clients.unauthenticated, ep.method, ep.path, ep.body);
        expect(res.status).toBe(401);
      });
    }
  });

  // ── 39.1: All 7 roles against every endpoint ────────────────────────────

  describe('role-based access per endpoint', () => {
    for (const ep of ENDPOINTS) {
      describe(ep.label, () => {
        for (const roleKey of ROLE_KEYS) {
          const roleEnum = ROLE_KEY_TO_ENUM[roleKey];
          const allowed = isRoleAllowed(roleEnum, ep.permission);

          it(`${roleKey} (${roleEnum}) → ${allowed ? 'allowed (not 403)' : '403'}`, async () => {
            const agent = clients[roleKey];
            const res = await makeRequest(agent, ep.method, ep.path, ep.body);

            if (allowed) {
              // Allowed roles should NOT get 403. They may get 200, 201, 404, 422, 400, 409, etc.
              // depending on whether the entity exists or validation passes.
              // The key assertion: it must NOT be 403 (forbidden) or 401 (unauthorized).
              expect(res.status).not.toBe(403);
              expect(res.status).not.toBe(401);
            } else {
              expect(res.status).toBe(403);
            }
          });
        }
      });
    }
  });

  // ── 39.3: viewer_auditor cannot access write operations ──────────────────

  describe('viewer_auditor denied write operations', () => {
    const deniedPermissions = [
      'customer.create',
      'customer.update',
      'customer.blacklist',
      'customer.upload_doc',
      'loan.create',
      'loan.submit',
      'loan.approve',
      'loan.reject',
      'loan.disburse',
      'loan.close',
      'collection.create',
      'collection.reverse',
      'penalty.calculate',
      'penalty.waive',
      'foreclosure.quote',
      'foreclosure.execute',
      'user.create',
      'user.update',
      'user.change_role',
      'settings.update',
      'accounting.create_expense',
      'handover.create',
      'group.create',
      'group.manage_members',
      'group.collect',
      'notification.retry',
    ];

    for (const perm of deniedPermissions) {
      it(`viewer_auditor denied ${perm}`, () => {
        const allowed = isRoleAllowed('viewer_auditor', perm);
        expect(allowed).toBe(false);
      });
    }

    // Verify viewer_auditor has read access where expected
    const allowedReadPermissions = [
      'customer.read',
      'loan.read',
      'collection.read',
      'receipt.read',
      'penalty.read',
      'group.read',
      'accounting.read',
      'audit.read',
      'report.read',
    ];

    for (const perm of allowedReadPermissions) {
      it(`viewer_auditor allowed ${perm}`, () => {
        const allowed = isRoleAllowed('viewer_auditor', perm);
        expect(allowed).toBe(true);
      });
    }
  });

  // ── 39.4: collection_officer access scope ────────────────────────────────

  describe('collection_officer access scope', () => {
    const allowedPerms = [
      'collection.create',
      'collection.read',
      'handover.create',
      'group.collect',
      'receipt.print',
    ];

    const deniedPerms = [
      'loan.approve',
      'loan.disburse',
      'collection.reverse',
      'user.create',
      'user.read',
      'user.update',
      'settings.read',
      'settings.update',
      'accounting.create_expense',
      'accounting.manage_cashbook',
      'foreclosure.quote',
      'foreclosure.execute',
      'penalty.calculate',
      'penalty.waive',
    ];

    for (const perm of allowedPerms) {
      it(`collection_officer allowed ${perm}`, () => {
        expect(isRoleAllowed('collection_officer', perm)).toBe(true);
      });
    }

    for (const perm of deniedPerms) {
      it(`collection_officer denied ${perm}`, () => {
        expect(isRoleAllowed('collection_officer', perm)).toBe(false);
      });
    }
  });

  // ── 39.5: field_officer access scope ─────────────────────────────────────

  describe('field_officer access scope', () => {
    const allowedPerms = [
      'customer.create',
      'customer.read',
      'customer.update',
      'loan.create',
      'loan.read',
      'loan.submit',
      'group.create',
      'group.manage_members',
      'group.read',
      'customer.upload_doc',
      'report.read',
    ];

    const deniedPerms = [
      'loan.approve',
      'loan.reject',
      'loan.disburse',
      'loan.close',
      'collection.create',
      'collection.reverse',
      'accounting.read',
      'accounting.create_expense',
      'accounting.manage_cashbook',
      'user.create',
      'user.read',
      'user.update',
      'settings.read',
      'settings.update',
      'audit.read',
      'foreclosure.quote',
      'foreclosure.execute',
      'penalty.calculate',
      'penalty.waive',
      'handover.create',
      'handover.verify',
      'notification.read',
      'notification.retry',
    ];

    for (const perm of allowedPerms) {
      it(`field_officer allowed ${perm}`, () => {
        expect(isRoleAllowed('field_officer', perm)).toBe(true);
      });
    }

    for (const perm of deniedPerms) {
      it(`field_officer denied ${perm}`, () => {
        expect(isRoleAllowed('field_officer', perm)).toBe(false);
      });
    }
  });

  // ── 39.6: accountant access scope ────────────────────────────────────────

  describe('accountant access scope', () => {
    const allowedPerms = [
      'accounting.read',
      'accounting.create_expense',
      'accounting.manage_cashbook',
      'report.read',
      'report.export',
      'handover.verify',
    ];

    const deniedPerms = [
      'loan.create',
      'loan.approve',
      'loan.reject',
      'loan.disburse',
      'loan.close',
      'loan.submit',
      'customer.create',
      'customer.update',
      'customer.blacklist',
      'customer.upload_doc',
      'collection.create',
      'collection.reverse',
      'user.create',
      'user.read',
      'user.update',
      'settings.read',
      'settings.update',
      'group.create',
      'group.manage_members',
      'group.collect',
      'foreclosure.quote',
      'foreclosure.execute',
      'penalty.calculate',
      'penalty.waive',
      'notification.read',
      'notification.retry',
    ];

    for (const perm of allowedPerms) {
      it(`accountant allowed ${perm}`, () => {
        expect(isRoleAllowed('accountant', perm)).toBe(true);
      });
    }

    for (const perm of deniedPerms) {
      it(`accountant denied ${perm}`, () => {
        expect(isRoleAllowed('accountant', perm)).toBe(false);
      });
    }
  });
});
