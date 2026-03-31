import { describe, it, expect, beforeAll } from 'vitest';
import { getApiBaseUrl, getUserTokens } from '../helpers/seed.js';
import { createAuthClients, type AuthClients } from '../helpers/auth-client.js';

/**
 * Audit API Contract Tests
 *
 * Verifies request/response shapes, validation errors (400), and auth errors (401)
 * for the audit endpoint: GET /audit-logs.
 *
 * The response shape is { data: AuditLogEntry[], total: number } with pagination
 * via skip/take query params and filtering by targetEntity, targetId, actorId,
 * actionType, startDate, endDate.
 *
 * Validates: Requirements 40.15, 40.18, 40.19
 */

describe('Audit Contract Tests', () => {
  let clients: AuthClients;

  beforeAll(async () => {
    const apiBaseUrl = getApiBaseUrl();
    const tokens = getUserTokens();
    clients = createAuthClients(apiBaseUrl, tokens);
  });

  // ─── GET /audit-logs — Response Shape ──────────────────────────────────

  describe('GET /audit-logs', () => {
    describe('response shape', () => {
      it('should return data array and total count', async () => {
        const res = await clients.superAdmin.get('/audit-logs');

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('data');
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body).toHaveProperty('total');
        expect(typeof res.body.total).toBe('number');
        expect(res.body.total).toBeGreaterThanOrEqual(0);
      });

      it('should return audit log entries with correct field types', async () => {
        const res = await clients.superAdmin.get('/audit-logs');

        expect(res.status).toBe(200);

        // Global setup creates audit entries (login events), so we expect at least one
        if (res.body.data.length > 0) {
          const entry = res.body.data[0];
          expect(typeof entry.id).toBe('string');
          expect(typeof entry.action_type).toBe('string');
          expect(typeof entry.actor_id).toBe('string');
          expect(typeof entry.actor_role).toBe('string');
          expect(typeof entry.target_entity).toBe('string');
          expect(typeof entry.target_id).toBe('string');
          expect(typeof entry.ip_address).toBe('string');
          expect(typeof entry.request_id).toBe('string');
          expect(typeof entry.created_at).toBe('string');
        }
      });

      it('should respect take parameter for pagination', async () => {
        const res = await clients.superAdmin.get('/audit-logs?take=2');

        expect(res.status).toBe(200);
        expect(res.body.data.length).toBeLessThanOrEqual(2);
        expect(typeof res.body.total).toBe('number');
      });

      it('should respect skip parameter for pagination', async () => {
        const res = await clients.superAdmin.get('/audit-logs?skip=0&take=1');

        expect(res.status).toBe(200);
        expect(res.body.data.length).toBeLessThanOrEqual(1);
      });

      it('should filter by targetEntity', async () => {
        const res = await clients.superAdmin.get('/audit-logs?targetEntity=auth');

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.data)).toBe(true);
        for (const entry of res.body.data) {
          expect(entry.target_entity).toBe('auth');
        }
      });

      it('should filter by actionType', async () => {
        const res = await clients.superAdmin.get('/audit-logs?actionType=login_success');

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.data)).toBe(true);
        for (const entry of res.body.data) {
          expect(entry.action_type).toBe('login_success');
        }
      });

      it('should filter by date range', async () => {
        const startDate = '2020-01-01T00:00:00.000Z';
        const endDate = '2099-12-31T23:59:59.999Z';
        const res = await clients.superAdmin.get(
          `/audit-logs?startDate=${startDate}&endDate=${endDate}`,
        );

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(typeof res.body.total).toBe('number');
      });

      it('should allow viewer_auditor to access audit logs', async () => {
        const res = await clients.viewerAuditor.get('/audit-logs');

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('data');
        expect(res.body).toHaveProperty('total');
      });
    });

    describe('validation errors (400)', () => {
      it('should return 400 when take exceeds maximum (100)', async () => {
        const res = await clients.superAdmin.get('/audit-logs?take=200');

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when take is zero', async () => {
        const res = await clients.superAdmin.get('/audit-logs?take=0');

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when skip is negative', async () => {
        const res = await clients.superAdmin.get('/audit-logs?skip=-1');

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when targetId is not a valid UUID', async () => {
        const res = await clients.superAdmin.get('/audit-logs?targetId=not-a-uuid');

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when actorId is not a valid UUID', async () => {
        const res = await clients.superAdmin.get('/audit-logs?actorId=invalid');

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when actionType is not a valid enum value', async () => {
        const res = await clients.superAdmin.get('/audit-logs?actionType=invalid_action');

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when startDate is not a valid ISO date', async () => {
        const res = await clients.superAdmin.get('/audit-logs?startDate=not-a-date');

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when endDate is not a valid ISO date', async () => {
        const res = await clients.superAdmin.get('/audit-logs?endDate=bad-date');

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const res = await clients.unauthenticated.get('/audit-logs');

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 401 when token is expired', async () => {
        const res = await clients.expired.get('/audit-logs');

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });

      it('should return 401 when token is tampered', async () => {
        const res = await clients.tampered.get('/audit-logs');

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });
  });
});
