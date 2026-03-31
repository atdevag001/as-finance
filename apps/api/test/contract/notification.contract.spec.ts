import { describe, it, expect, beforeAll } from 'vitest';
import { getApiBaseUrl, getUserTokens } from '../helpers/seed.js';
import { createAuthClients, type AuthClients } from '../helpers/auth-client.js';

/**
 * Notification API Contract Tests
 *
 * Verifies request/response shapes, validation errors (400), and auth errors (401)
 * for notification endpoints: GET /notifications, POST /notifications/:id/retry.
 *
 * GET /notifications returns { data: OutboxMessage[], total: number } with pagination
 * via skip/take query params and filtering by status and eventType.
 *
 * POST /notifications/:id/retry resets a failed/dead_letter message to pending.
 *
 * Validates: Requirements 40.16, 40.18, 40.19
 */

describe('Notification Contract Tests', () => {
  let clients: AuthClients;

  beforeAll(async () => {
    const apiBaseUrl = getApiBaseUrl();
    const tokens = getUserTokens();
    clients = createAuthClients(apiBaseUrl, tokens);
  });

  // ─── GET /notifications — Response Shape ─────────────────────────────────

  describe('GET /notifications', () => {
    describe('response shape', () => {
      it('should return data array and total count', async () => {
        const res = await clients.superAdmin.get('/notifications');

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('data');
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body).toHaveProperty('total');
        expect(typeof res.body.total).toBe('number');
        expect(res.body.total).toBeGreaterThanOrEqual(0);
      });

      it('should return outbox message entries with correct field types when data exists', async () => {
        const res = await clients.superAdmin.get('/notifications');

        expect(res.status).toBe(200);

        if (res.body.data.length > 0) {
          const entry = res.body.data[0];
          expect(typeof entry.id).toBe('string');
          expect(typeof entry.event_type).toBe('string');
          expect(typeof entry.recipient_mobile).toBe('string');
          expect(typeof entry.message_body).toBe('string');
          expect(typeof entry.status).toBe('string');
          expect(typeof entry.retry_count).toBe('number');
          expect(typeof entry.max_retries).toBe('number');
          expect(typeof entry.source_type).toBe('string');
          expect(typeof entry.source_id).toBe('string');
          expect(typeof entry.created_at).toBe('string');
        }
      });

      it('should respect take parameter for pagination', async () => {
        const res = await clients.superAdmin.get('/notifications?take=2');

        expect(res.status).toBe(200);
        expect(res.body.data.length).toBeLessThanOrEqual(2);
        expect(typeof res.body.total).toBe('number');
      });

      it('should respect skip parameter for pagination', async () => {
        const res = await clients.superAdmin.get('/notifications?skip=0&take=1');

        expect(res.status).toBe(200);
        expect(res.body.data.length).toBeLessThanOrEqual(1);
      });

      it('should filter by status', async () => {
        const res = await clients.superAdmin.get('/notifications?status=pending');

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.data)).toBe(true);
        for (const entry of res.body.data) {
          expect(entry.status).toBe('pending');
        }
      });

      it('should filter by eventType', async () => {
        const res = await clients.superAdmin.get('/notifications?eventType=collection_receipt');

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.data)).toBe(true);
        for (const entry of res.body.data) {
          expect(entry.event_type).toBe('collection_receipt');
        }
      });

      it('should allow manager to access notifications', async () => {
        const res = await clients.manager.get('/notifications');

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('data');
        expect(res.body).toHaveProperty('total');
      });
    });

    describe('validation errors (400)', () => {
      it('should return 400 when take exceeds maximum (100)', async () => {
        const res = await clients.superAdmin.get('/notifications?take=200');

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when take is zero', async () => {
        const res = await clients.superAdmin.get('/notifications?take=0');

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when skip is negative', async () => {
        const res = await clients.superAdmin.get('/notifications?skip=-1');

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const res = await clients.unauthenticated.get('/notifications');

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 401 when token is expired', async () => {
        const res = await clients.expired.get('/notifications');

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });

      it('should return 401 when token is tampered', async () => {
        const res = await clients.tampered.get('/notifications');

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });

    describe('authorization errors (403)', () => {
      it('should return 403 for field_officer (not in allowed roles)', async () => {
        const res = await clients.fieldOfficer.get('/notifications');

        expect(res.status).toBe(403);
        expect(res.body).toHaveProperty('statusCode', 403);
      });

      it('should return 403 for collection_officer', async () => {
        const res = await clients.collectionOfficer.get('/notifications');

        expect(res.status).toBe(403);
        expect(res.body).toHaveProperty('statusCode', 403);
      });

      it('should return 403 for viewer_auditor', async () => {
        const res = await clients.viewerAuditor.get('/notifications');

        expect(res.status).toBe(403);
        expect(res.body).toHaveProperty('statusCode', 403);
      });
    });
  });

  // ─── POST /notifications/:id/retry — Response Shape ─────────────────────

  describe('POST /notifications/:id/retry', () => {
    describe('response shape', () => {
      it('should return 404 for non-existent message ID', async () => {
        const fakeId = '00000000-0000-0000-0000-000000000000';
        const res = await clients.superAdmin.post(`/notifications/${fakeId}/retry`);

        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('statusCode', 404);
        expect(res.body).toHaveProperty('message');
        expect(typeof res.body.message).toBe('string');
      });
    });

    describe('validation errors (400)', () => {
      it('should return 400 when id is not a valid UUID', async () => {
        const res = await clients.superAdmin.post('/notifications/not-a-uuid/retry');

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const fakeId = '00000000-0000-0000-0000-000000000000';
        const res = await clients.unauthenticated.post(`/notifications/${fakeId}/retry`);

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 401 when token is expired', async () => {
        const fakeId = '00000000-0000-0000-0000-000000000000';
        const res = await clients.expired.post(`/notifications/${fakeId}/retry`);

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });

      it('should return 401 when token is tampered', async () => {
        const fakeId = '00000000-0000-0000-0000-000000000000';
        const res = await clients.tampered.post(`/notifications/${fakeId}/retry`);

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });

    describe('authorization errors (403)', () => {
      it('should return 403 for field_officer', async () => {
        const fakeId = '00000000-0000-0000-0000-000000000000';
        const res = await clients.fieldOfficer.post(`/notifications/${fakeId}/retry`);

        expect(res.status).toBe(403);
        expect(res.body).toHaveProperty('statusCode', 403);
      });

      it('should return 403 for collection_officer', async () => {
        const fakeId = '00000000-0000-0000-0000-000000000000';
        const res = await clients.collectionOfficer.post(`/notifications/${fakeId}/retry`);

        expect(res.status).toBe(403);
        expect(res.body).toHaveProperty('statusCode', 403);
      });

      it('should return 403 for viewer_auditor', async () => {
        const fakeId = '00000000-0000-0000-0000-000000000000';
        const res = await clients.viewerAuditor.post(`/notifications/${fakeId}/retry`);

        expect(res.status).toBe(403);
        expect(res.body).toHaveProperty('statusCode', 403);
      });
    });
  });
});
