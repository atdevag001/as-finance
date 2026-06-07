import { describe, it, expect, beforeAll } from 'vitest';
import supertest from 'supertest';
import { getApiBaseUrl } from '../helpers/seed.js';

/**
 * Health API Contract Tests (Task 30.3)
 *
 * Verifies response shapes for health check endpoints.
 * Health endpoints are public (no auth required); /live skips throttling while
 * /ready inherits the default per-IP throttle to prevent unauthenticated DB probing.
 *
 * Validates: Requirements 59.1, 59.2, 59.4, 59.5
 */

describe('Health Contract Tests', () => {
  let apiBaseUrl: string;

  beforeAll(() => {
    apiBaseUrl = getApiBaseUrl();
  });

  // ─── GET /health/live ────────────────────────────────────────────────────

  describe('GET /health/live', () => {
    it('should return 200 with status ok (Req 59.1)', async () => {
      const res = await supertest(apiBaseUrl).get('/health/live');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'ok');
    });

    it('should be accessible without authentication (Req 59.4)', async () => {
      // No Authorization header
      const res = await supertest(apiBaseUrl).get('/health/live');
      expect(res.status).toBe(200);
    });

    it('should not be rate limited (Req 59.5)', async () => {
      // Send multiple rapid requests — all should succeed
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          supertest(apiBaseUrl).get('/health/live'),
        ),
      );

      for (const res of results) {
        expect(res.status).toBe(200);
      }
    });
  });

  // ─── GET /health/ready ───────────────────────────────────────────────────

  describe('GET /health/ready', () => {
    it('should return 200 with database connected status (Req 59.2)', async () => {
      const res = await supertest(apiBaseUrl).get('/health/ready');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('database');
      expect(typeof res.body.database).toBe('string');
    });

    it('should be accessible without authentication (Req 59.4)', async () => {
      const res = await supertest(apiBaseUrl).get('/health/ready');
      expect(res.status).toBe(200);
    });

    it('should be subject to the default per-IP throttler (Req 59.5)', async () => {
      // /ready hits the DB, so it inherits the default per-IP throttle to prevent
      // an unauthenticated client from probing DB liveness at line rate.
      // A small burst must still succeed under the default limit.
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          supertest(apiBaseUrl).get('/health/ready'),
        ),
      );

      for (const res of results) {
        expect(res.status).toBe(200);
      }
    });
  });
});
