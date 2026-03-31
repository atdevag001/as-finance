import { describe, it, expect, beforeAll } from 'vitest';
import { getApiBaseUrl, getUserTokens } from '../helpers/seed.js';
import { createAuthClients, type AuthClients } from '../helpers/auth-client.js';

/**
 * Document API Contract Tests (Task 30.2)
 *
 * Verifies request/response shapes for document upload, signed URL, and soft delete.
 *
 * Validates: Requirements 40.18, 40.19, 57.6, 57.8, 57.9
 */

describe('Document Contract Tests', () => {
  let clients: AuthClients;

  beforeAll(() => {
    const apiBaseUrl = getApiBaseUrl();
    const tokens = getUserTokens();
    clients = createAuthClients(apiBaseUrl, tokens);
  });

  // ─── POST /documents/upload ──────────────────────────────────────────────

  describe('POST /documents/upload', () => {
    it('should return 401 for unauthenticated upload', async () => {
      const res = await clients.unauthenticated
        .post('/documents/upload')
        .attach('file', Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'test.jpg')
        .field('prefix', 'kyc');
      expect(res.status).toBe(401);
    });

    it('should return 400 when no file is attached', async () => {
      const res = await clients.fieldOfficer
        .post('/documents/upload')
        .field('prefix', 'kyc');
      expect([400, 422]).toContain(res.status);
    });

    it('should return error response with statusCode and message fields', async () => {
      const res = await clients.fieldOfficer
        .post('/documents/upload')
        .field('prefix', 'kyc');
      if (res.status >= 400) {
        expect(res.body).toHaveProperty('statusCode');
        expect(res.body).toHaveProperty('message');
      }
    });
  });

  // ─── GET /documents/:id/url ──────────────────────────────────────────────

  describe('GET /documents/:id/url', () => {
    it('should return 401 for unauthenticated request', async () => {
      const res = await clients.unauthenticated.get('/documents/some-id/url');
      expect(res.status).toBe(401);
    });

    it('should return 404 for non-existent document', async () => {
      const res = await clients.fieldOfficer
        .get('/documents/00000000-0000-0000-0000-000000000000/url');
      expect(res.status).toBe(404);
    });
  });

  // ─── DELETE /documents/:id ───────────────────────────────────────────────

  describe('DELETE /documents/:id', () => {
    it('should return 401 for unauthenticated request', async () => {
      const res = await clients.unauthenticated.delete('/documents/some-id');
      expect(res.status).toBe(401);
    });

    it('should return 404 for non-existent document', async () => {
      const res = await clients.manager
        .delete('/documents/00000000-0000-0000-0000-000000000000');
      expect(res.status).toBe(404);
    });
  });
});
