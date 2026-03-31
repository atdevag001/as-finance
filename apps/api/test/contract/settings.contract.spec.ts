import { describe, it, expect, beforeAll } from 'vitest';
import { getApiBaseUrl, getUserTokens } from '../helpers/seed.js';
import { createAuthClients, type AuthClients } from '../helpers/auth-client.js';

/**
 * Settings API Contract Tests
 *
 * Verifies request/response shapes, validation errors (400), and auth errors (401)
 * for settings endpoints: GET /settings, PATCH /settings/:key,
 * GET /settings/holidays, PUT /settings/holidays.
 *
 * Permissions:
 *   settings.read  → super_admin, manager
 *   settings.update → super_admin only
 *
 * Validates: Requirements 40.17, 40.18, 40.19
 */

describe('Settings Contract Tests', () => {
  let clients: AuthClients;

  beforeAll(async () => {
    const apiBaseUrl = getApiBaseUrl();
    const tokens = getUserTokens();
    clients = createAuthClients(apiBaseUrl, tokens);
  });

  // ─── GET /settings — Response Shape ────────────────────────────────────

  describe('GET /settings', () => {
    describe('response shape', () => {
      it('should return an array of setting objects', async () => {
        const res = await clients.superAdmin.get('/settings');

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
      });

      it('should return setting objects with correct field types', async () => {
        const res = await clients.superAdmin.get('/settings');

        expect(res.status).toBe(200);

        if (res.body.length > 0) {
          const setting = res.body[0];
          expect(typeof setting.id).toBe('string');
          expect(typeof setting.key).toBe('string');
          expect(setting).toHaveProperty('value');
          expect(typeof setting.updated_at).toBe('string');
        }
      });

      it('should allow manager to read settings', async () => {
        const res = await clients.manager.get('/settings');

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const res = await clients.unauthenticated.get('/settings');

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 401 when token is expired', async () => {
        const res = await clients.expired.get('/settings');

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });

      it('should return 401 when token is tampered', async () => {
        const res = await clients.tampered.get('/settings');

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });

    describe('authorization errors (403)', () => {
      it('should return 403 when field_officer tries to read settings', async () => {
        const res = await clients.fieldOfficer.get('/settings');

        expect(res.status).toBe(403);
        expect(res.body).toHaveProperty('statusCode', 403);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 403 when collection_officer tries to read settings', async () => {
        const res = await clients.collectionOfficer.get('/settings');

        expect(res.status).toBe(403);
        expect(res.body).toHaveProperty('statusCode', 403);
      });

      it('should return 403 when viewer_auditor tries to read settings', async () => {
        const res = await clients.viewerAuditor.get('/settings');

        expect(res.status).toBe(403);
        expect(res.body).toHaveProperty('statusCode', 403);
      });
    });
  });

  // ─── PATCH /settings/:key — Response Shape ─────────────────────────────

  describe('PATCH /settings/:key', () => {
    describe('response shape', () => {
      it('should return the updated setting object on success', async () => {
        const res = await clients.superAdmin
          .patch('/settings/test_contract_key')
          .send({ value: 'contract_test_value' });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('id');
        expect(typeof res.body.id).toBe('string');
        expect(res.body).toHaveProperty('key', 'test_contract_key');
        expect(res.body).toHaveProperty('value', 'contract_test_value');
        expect(typeof res.body.updated_at).toBe('string');
      });

      it('should accept optional description field', async () => {
        const res = await clients.superAdmin
          .patch('/settings/test_contract_key')
          .send({ value: 'updated_value', description: 'Test description' });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('description', 'Test description');
      });
    });

    describe('validation errors (400)', () => {
      it('should return 400 when value is missing', async () => {
        const res = await clients.superAdmin
          .patch('/settings/some_key')
          .send({});

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when body is empty', async () => {
        const res = await clients.superAdmin
          .patch('/settings/some_key')
          .send();

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const res = await clients.unauthenticated
          .patch('/settings/some_key')
          .send({ value: 'test' });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 401 when token is expired', async () => {
        const res = await clients.expired
          .patch('/settings/some_key')
          .send({ value: 'test' });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });

      it('should return 401 when token is tampered', async () => {
        const res = await clients.tampered
          .patch('/settings/some_key')
          .send({ value: 'test' });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });

    describe('authorization errors (403)', () => {
      it('should return 403 when manager tries to update settings', async () => {
        const res = await clients.manager
          .patch('/settings/some_key')
          .send({ value: 'test' });

        expect(res.status).toBe(403);
        expect(res.body).toHaveProperty('statusCode', 403);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 403 when field_officer tries to update settings', async () => {
        const res = await clients.fieldOfficer
          .patch('/settings/some_key')
          .send({ value: 'test' });

        expect(res.status).toBe(403);
        expect(res.body).toHaveProperty('statusCode', 403);
      });
    });
  });

  // ─── GET /settings/holidays — Response Shape ───────────────────────────

  describe('GET /settings/holidays', () => {
    describe('response shape', () => {
      it('should return an array of date strings', async () => {
        const res = await clients.superAdmin.get('/settings/holidays');

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        for (const entry of res.body) {
          expect(typeof entry).toBe('string');
        }
      });

      it('should allow manager to read holidays', async () => {
        const res = await clients.manager.get('/settings/holidays');

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const res = await clients.unauthenticated.get('/settings/holidays');

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });
  });

  // ─── PUT /settings/holidays — Response Shape ───────────────────────────

  describe('PUT /settings/holidays', () => {
    describe('response shape', () => {
      it('should return sorted deduplicated array of date strings', async () => {
        const holidays = ['2025-12-25', '2025-01-26', '2025-08-15', '2025-01-26'];

        const res = await clients.superAdmin
          .put('/settings/holidays')
          .send({ holidays });

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        // Should be deduplicated (3 unique) and sorted
        expect(res.body).toHaveLength(3);
        expect(res.body[0]).toBe('2025-01-26');
        expect(res.body[1]).toBe('2025-08-15');
        expect(res.body[2]).toBe('2025-12-25');
      });
    });

    describe('validation errors (400)', () => {
      it('should return 400 when holidays is missing', async () => {
        const res = await clients.superAdmin
          .put('/settings/holidays')
          .send({});

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 422 when holidays contains invalid date strings', async () => {
        const res = await clients.superAdmin
          .put('/settings/holidays')
          .send({ holidays: ['not-a-date'] });

        // ValidationError from service maps to 422
        expect(res.status).toBe(422);
        expect(res.body).toHaveProperty('statusCode', 422);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when holidays is not an array', async () => {
        const res = await clients.superAdmin
          .put('/settings/holidays')
          .send({ holidays: 'not-an-array' });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const res = await clients.unauthenticated
          .put('/settings/holidays')
          .send({ holidays: ['2025-01-01'] });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });

    describe('authorization errors (403)', () => {
      it('should return 403 when manager tries to update holidays', async () => {
        const res = await clients.manager
          .put('/settings/holidays')
          .send({ holidays: ['2025-01-01'] });

        expect(res.status).toBe(403);
        expect(res.body).toHaveProperty('statusCode', 403);
      });
    });
  });
});
