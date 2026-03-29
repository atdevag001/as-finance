import { describe, it, expect, beforeAll } from 'vitest';
import supertest from 'supertest';
import { randomUUID } from 'crypto';
import { getApiBaseUrl, getUserTokens } from '../helpers/seed.js';
import { createAuthClients, type AuthClients } from '../helpers/auth-client.js';
import { createDbUtils } from '../helpers/db-utils.js';

/**
 * Request ID Propagation E2E Tests
 *
 * Verifies that the x-request-id middleware correctly generates, propagates,
 * and echoes request IDs across all responses — including error responses
 * and audit log entries.
 *
 * Validates: Design GAP 22; Property 30
 */

/** UUID v4 pattern */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('Request ID Propagation E2E', () => {
  let apiBaseUrl: string;
  let clients: AuthClients;
  let dbUtils: ReturnType<typeof createDbUtils>;

  beforeAll(() => {
    apiBaseUrl = getApiBaseUrl();
    const tokens = getUserTokens();
    clients = createAuthClients(apiBaseUrl, tokens);
    dbUtils = createDbUtils();
  });

  describe('auto-generated request ID', () => {
    it('should generate a UUID x-request-id when none is provided', async () => {
      const res = await supertest(apiBaseUrl).get('/health/live');

      expect(res.status).toBe(200);
      const requestId = res.headers['x-request-id'];
      expect(requestId).toBeDefined();
      expect(requestId).toMatch(UUID_REGEX);
    });

    it('should generate unique request IDs for successive requests', async () => {
      const res1 = await supertest(apiBaseUrl).get('/health/live');
      const res2 = await supertest(apiBaseUrl).get('/health/live');

      const id1 = res1.headers['x-request-id'];
      const id2 = res2.headers['x-request-id'];

      expect(id1).toMatch(UUID_REGEX);
      expect(id2).toMatch(UUID_REGEX);
      expect(id1).not.toBe(id2);
    });
  });

  describe('echoed request ID', () => {
    it('should echo back the same x-request-id when provided', async () => {
      const customId = randomUUID();

      const res = await supertest(apiBaseUrl)
        .get('/health/live')
        .set('x-request-id', customId);

      expect(res.status).toBe(200);
      expect(res.headers['x-request-id']).toBe(customId);
    });

    it('should echo custom request ID on authenticated endpoints', async () => {
      const customId = randomUUID();

      const res = await clients.superAdmin
        .get('/customers')
        .set('x-request-id', customId);

      expect(res.headers['x-request-id']).toBe(customId);
    });
  });

  describe('error responses include requestId', () => {
    it('should include requestId in 401 error response body', async () => {
      const customId = randomUUID();

      const res = await supertest(apiBaseUrl)
        .get('/customers')
        .set('x-request-id', customId);

      // Unauthenticated request should get 401
      expect(res.status).toBe(401);
      expect(res.body.requestId).toBe(customId);
      expect(res.headers['x-request-id']).toBe(customId);
    });

    it('should include generated requestId in error response when no header sent', async () => {
      const res = await supertest(apiBaseUrl).get('/customers');

      expect(res.status).toBe(401);
      expect(res.body.requestId).toBeDefined();
      expect(res.body.requestId).toMatch(UUID_REGEX);
      // Header and body should match
      expect(res.headers['x-request-id']).toBe(res.body.requestId);
    });

    it('should include requestId in 404 error response', async () => {
      const customId = randomUUID();

      const res = await clients.superAdmin
        .get('/nonexistent-endpoint-xyz')
        .set('x-request-id', customId);

      // Should get 404 with the custom request ID
      expect(res.status).toBe(404);
      expect(res.body.requestId).toBe(customId);
      expect(res.headers['x-request-id']).toBe(customId);
    });
  });

  describe('audit log request_id correlation', () => {
    it('should store the same request_id in audit log entries', async () => {
      const customId = randomUUID();

      // Create a customer with a known request ID — this triggers an audit log entry
      const res = await clients.fieldOfficer
        .post('/customers')
        .set('x-request-id', customId)
        .send({
          fullName: 'ReqID Test Customer',
          fatherOrHusbandName: 'ReqID Test Father',
          mobile: `9${Date.now().toString().slice(-9)}`,
          aadhaarNumber: `2${Date.now().toString().slice(-11)}`,
          gender: 'male',
          addressLine1: '123 Request ID Test Street',
          city: 'TestCity',
          district: 'TestDistrict',
          state: 'TestState',
          pincode: '123456',
        });

      expect(res.status).toBe(201);
      const customerId = res.body.id;
      expect(customerId).toBeDefined();

      // Verify the audit log entry has the same request_id
      const auditLogs = await dbUtils.findAuditLogsByTarget('customer', customerId);
      expect(auditLogs.length).toBeGreaterThanOrEqual(1);

      // At least one audit log should have our custom request_id
      const matchingLogs = auditLogs.filter((log) => log.request_id === customId);
      expect(matchingLogs.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('concurrent request isolation', () => {
    it('should assign isolated request IDs to concurrent requests', async () => {
      const ids = Array.from({ length: 5 }, () => randomUUID());

      // Fire 5 concurrent requests, each with a unique x-request-id
      const results = await Promise.all(
        ids.map((id) =>
          supertest(apiBaseUrl)
            .get('/health/live')
            .set('x-request-id', id),
        ),
      );

      // Each response should echo back its own unique request ID
      for (let i = 0; i < ids.length; i++) {
        expect(results[i]!.status).toBe(200);
        expect(results[i]!.headers['x-request-id']).toBe(ids[i]);
      }

      // All returned IDs should be distinct
      const returnedIds = results.map((r) => r.headers['x-request-id']);
      expect(new Set(returnedIds).size).toBe(ids.length);
    });

    it('should not cross-contaminate request IDs between concurrent authenticated requests', async () => {
      const ids = Array.from({ length: 3 }, () => randomUUID());

      const results = await Promise.all([
        clients.superAdmin.get('/customers').set('x-request-id', ids[0]!),
        clients.manager.get('/customers').set('x-request-id', ids[1]!),
        clients.fieldOfficer.get('/customers').set('x-request-id', ids[2]!),
      ]);

      for (let i = 0; i < ids.length; i++) {
        expect(results[i]!.headers['x-request-id']).toBe(ids[i]);
      }
    });
  });
});
