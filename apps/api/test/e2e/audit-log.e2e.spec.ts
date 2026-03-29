import { describe, it, expect, beforeAll } from 'vitest';
import { getApiBaseUrl, getUserTokens, getSeedData } from '../helpers/seed.js';
import { createAuthClients, type AuthClients } from '../helpers/auth-client.js';
import { createDbUtils, type DbUtils } from '../helpers/db-utils.js';
import { createCustomer } from '../helpers/factories.js';
import type { SeedData } from '../setup/global-setup.js';

/**
 * Audit Log E2E Tests
 *
 * Verifies audit log querying (by target entity/ID, action type, actor, date range),
 * pagination with correct page size and ordering, append-only enforcement (no DELETE
 * or UPDATE via API), audit log entry structure completeness, and RBAC enforcement
 * (viewer_auditor can read, field_officer cannot).
 *
 * Validates: Design GAP 6; Property 28
 */

describe('Audit Log E2E', () => {
  let clients: AuthClients;
  let dbUtils: DbUtils;
  let seedData: SeedData;

  // We'll create a customer to generate a known audit log entry for query tests
  let testCustomerId: string;
  let testActorId: string;

  beforeAll(async () => {
    const apiBaseUrl = getApiBaseUrl();
    const tokens = getUserTokens();
    clients = createAuthClients(apiBaseUrl, tokens);
    dbUtils = createDbUtils();
    seedData = getSeedData();

    // Create a customer to produce a known audit log entry (customer_created)
    const customer = await createCustomer(clients.fieldOfficer);
    testCustomerId = customer.id;
    testActorId = seedData.users.fieldOfficer.id;
  });

  // ─── Query audit logs by target entity and ID ─────────────────────────

  describe('query audit logs by target entity and ID', () => {
    it('s