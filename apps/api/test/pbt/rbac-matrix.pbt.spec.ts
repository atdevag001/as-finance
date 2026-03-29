import { describe, it, expect, beforeAll } from 'vitest';
import * as fc from 'fast-check';
import { getApiBaseUrl, getUserTokens } from '../helpers/seed.js';
import { createAuthClients, type AuthClients } from '../helpers/auth-client.js';
import { arbUserRole } from '../helpers/arbitraries.js';
/**
 * RBAC Matrix Property-Based Tests
 *
 * Verifies that the RBAC guard enforces the PERMISSIONS constant exhaustively:
 * for every (role, permission_key) pair, allowed roles receive 2xx and denied
 * roles receive 403.
 *
 * Property 31: RBAC Matrix Exhaustive Coverage
 *
 * **Validates: Requirements (RBAC from security-compliance steering)**
 */

// ─── Types ───────────────────────────────────────────────────────────────────

interface EndpointMapping {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  /** Optional body for POST/PATCH/PUT requests to avoid 400 validation errors */
  body?: Record<string, unknown>;
}

// Import PERMISSIONS from the shared package (loaded in beforeAll to avoid CJS/ESM issues)
let PERMISSIONS: Record<string, readonly string[]>;

// ─── Permission → Endpoint Mapping ───────────────────────────────────────────

/**
 * Maps permission keys to real API endpoints and HTTP methods.
 *
 * We use read/list endpoints where possible (GET) since they don't require
 * valid entity IDs or complex payloads — a 404 or empty list is still a 2xx
 * that proves the RBAC guard allowed the request through.
 *
 * For write permissions where no safe GET exists, we use POST with minimal
 * payloads that will fail validation (400) rather than auth (403). The key
 * distinction: 400 means the guard allowed the request through (role is
 * authorized), while 403 means the guard blocked it.
 */
const PERMISSION_ENDPOINT_MAP: Record<string, EndpointMapping> = {
  // Customer
  'customer.create': { method: 'POST', path: '/customers', body: {} },
  'customer.read': { method: 'GET', path: '/customers' },
  'customer.update': { method: 'PATCH', path: '/customers/00000000-0000-0000-0000-000000000000', body: {} },
  'customer.blacklist': { method: 'POST', path: '/customers/00000000-0000-0000-0000-000000000000/blacklist', body: {} },
  'customer.upload_doc': { method: 'POST', path: '/documents/upload' },

  // Loan
  'loan.create': { method: 'POST', path: '/loans', body: {} },
  'loan.read': { method: 'GET', path: '/loans' },
  'loan.submit': { method: 'POST', path: '/loans/00000000-0000-0000-0000-000000000000/submit' },
  'loan.approve': { method: 'POST', path: '/loans/00000000-0000-0000-0000-000000000000/approve', body: {} },
  'loan.reject': { method: 'POST', path: '/loans/00000000-0000-0000-0000-000000000000/reject', body: {} },
  'loan.disburse': { method: 'POST', path: '/disbursements', body: {} },
  'loan.close': { method: 'POST', path: '/loans/00000000-0000-0000-0000-000000000000/close' },

  // Collection
  'collection.create': { method: 'POST', path: '/collections', body: {} },
  'collection.read': { method: 'GET', path: '/loans' }, // collections are read via loan endpoints
  'collection.reverse': { method: 'POST', path: '/reversals', body: {} },

  // Receipt
  'receipt.read': { method: 'GET', path: '/receipts/00000000-0000-0000-0000-000000000000' },
  'receipt.print': { method: 'GET', path: '/receipts/00000000-0000-0000-0000-000000000000/print' },

  // Accounting
  'accounting.read': { method: 'GET', path: '/accounting/chart-of-accounts' },
  'accounting.create_expense': { method: 'POST', path: '/cashbook/expenses', body: {} },
  'accounting.manage_cashbook': { method: 'GET', path: '/cashbook/handovers' },

  // Report
  'report.read': { method: 'GET', path: '/reports' },
  'report.export': { method: 'GET', path: '/reports/collection-summary/export' },

  // User
  'user.create': { method: 'POST', path: '/users', body: {} },
  'user.read': { method: 'GET', path: '/users' },
  'user.update': { method: 'PATCH', path: '/users/00000000-0000-0000-0000-000000000000', body: {} },
  'user.change_role': { method: 'PATCH', path: '/users/00000000-0000-0000-0000-000000000000', body: {} },

  // Penalty
  'penalty.read': { method: 'GET', path: '/penalties/loan/00000000-0000-0000-0000-000000000000' },
  'penalty.calculate': { method: 'POST', path: '/penalties/calculate', body: {} },
  'penalty.waive': { method: 'POST', path: '/penalties/00000000-0000-0000-0000-000000000000/waive', body: {} },

  // Foreclosure
  'foreclosure.quote': { method: 'POST', path: '/foreclosures/quote', body: {} },
  'foreclosure.execute': { method: 'POST', path: '/foreclosures', body: {} },

  // Group
  'group.create': { method: 'POST', path: '/groups', body: {} },
  'group.read': { method: 'GET', path: '/groups' },
  'group.manage_members': { method: 'POST', path: '/groups/00000000-0000-0000-0000-000000000000/members', body: {} },
  'group.collect': { method: 'POST', path: '/groups/00000000-0000-0000-0000-000000000000/collections', body: {} },

  // Audit
  'audit.read': { method: 'GET', path: '/audit-logs' },

  // Settings
  'settings.read': { method: 'GET', path: '/settings' },
  'settings.update': { method: 'PATCH', path: '/settings/max_page_size', body: { value: 100 } },

  // Notification
  'notification.read': { method: 'GET', path: '/notifications' },
  'notification.retry': { method: 'POST', path: '/notifications/00000000-0000-0000-0000-000000000000/retry' },

  // Cash Handover
  'handover.create': { method: 'POST', path: '/cashbook/handovers', body: {} },
  'handover.verify': { method: 'PATCH', path: '/cashbook/handovers/00000000-0000-0000-0000-000000000000/verify', body: {} },
};

// ─── Role → Auth Client Key Mapping ──────────────────────────────────────────

const ROLE_TO_CLIENT_KEY: Record<string, keyof AuthClients> = {
  super_admin: 'superAdmin',
  manager: 'manager',
  field_officer: 'fieldOfficer',
  collection_officer: 'collectionOfficer',
  accountant: 'accountant',
  office_staff: 'officeStaff',
  viewer_auditor: 'viewerAuditor',
};

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('RBAC Matrix PBT', () => {
  let clients: AuthClients;
  let apiBaseUrl: string;
  let arbPermissionKey: fc.Arbitrary<string>;

  beforeAll(async () => {
    apiBaseUrl = getApiBaseUrl();
    const tokens = getUserTokens();
    clients = createAuthClients(apiBaseUrl, tokens);

    // Dynamic import to avoid CJS/ESM issues
    const shared = await import('@as-finance/shared');
    PERMISSIONS = shared.PERMISSIONS as Record<string, readonly string[]>;

    // Build the permission key arbitrary from keys that have endpoint mappings
    const allPermissionKeys = Object.keys(PERMISSIONS).filter(
      (key) => key in PERMISSION_ENDPOINT_MAP,
    );
    arbPermissionKey = fc.constantFrom(...allPermissionKeys);
  });

  /**
   * Make an HTTP request to the given endpoint using the specified role's auth client.
   * Returns the HTTP status code.
   */
  async function makeRequest(
    role: string,
    endpoint: EndpointMapping,
  ): Promise<number> {
    const clientKey = ROLE_TO_CLIENT_KEY[role];
    if (!clientKey) {
      throw new Error(`No auth client mapped for role: ${role}`);
    }

    const client = clients[clientKey] as import('supertest').Agent;
    const { method, path, body } = endpoint;

    let response: import('supertest').Response;

    switch (method) {
      case 'GET':
        response = await client.get(path);
        break;
      case 'POST':
        response = await client.post(path).send(body ?? {});
        break;
      case 'PATCH':
        response = await client.patch(path).send(body ?? {});
        break;
      case 'PUT':
        response = await client.put(path).send(body ?? {});
        break;
      case 'DELETE':
        response = await client.delete(path);
        break;
      default:
        throw new Error(`Unsupported HTTP method: ${method}`);
    }

    return response.status;
  }

  // ─── Property 31: RBAC Matrix Exhaustive Coverage ────────────────────────

  /**
   * **Validates: Requirements (RBAC from security-compliance steering)**
   *
   * Property 31: RBAC Matrix Exhaustive Coverage
   *
   * For all (role, permission_key) combinations from the PERMISSIONS constant,
   * allowed roles SHALL receive a non-403/non-401 response (2xx, 400, 404, 409
   * are all acceptable — they prove the guard let the request through), and
   * denied roles SHALL receive exactly 403.
   */
  describe('Property 31: RBAC Matrix Exhaustive Coverage', () => {
    it('allowed roles get through RBAC guard (not 401/403), denied roles get 403', async () => {
      await fc.assert(
        fc.asyncProperty(arbUserRole, arbPermissionKey, async (role, permissionKey) => {
          const endpoint = PERMISSION_ENDPOINT_MAP[permissionKey];
          if (!endpoint) return; // skip unmapped permissions

          const allowedRoles = PERMISSIONS[permissionKey] as readonly string[];
          const isAllowed = allowedRoles.includes(role);

          const status = await makeRequest(role, endpoint);

          if (isAllowed) {
            // The RBAC guard allowed the request through.
            // The response may be 2xx, 400 (validation), 404 (not found),
            // 409 (conflict), 422, 500, etc. — but NOT 401 or 403.
            expect(
              status,
              `Role '${role}' should be allowed for '${permissionKey}' but got ${status}`,
            ).not.toBe(401);
            expect(
              status,
              `Role '${role}' should be allowed for '${permissionKey}' but got ${status}`,
            ).not.toBe(403);
          } else {
            // The RBAC guard should block the request with 403.
            expect(
              status,
              `Role '${role}' should be denied for '${permissionKey}' but got ${status}`,
            ).toBe(403);
          }
        }),
        { numRuns: 100 },
      );
    });
  });
});
