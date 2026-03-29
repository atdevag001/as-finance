import { describe, it, expect, beforeAll } from 'vitest';
import supertest from 'supertest';
import { getApiBaseUrl } from '../helpers/seed.js';

/**
 * Health Check E2E Tests
 *
 * Verifies /health/live and /health/ready endpoints work correctly
 * against the live NestJS API without requiring authentication.
 *
 * Validates: Requirements 15.1, 15.2, 15.3, 15.4, 15.5; Design GAP 7
 */

describe('Health Check E2E', () => {
  let apiBaseUrl: string;
  let request: supertest.Agent;

  beforeAll(() => {
    apiBaseUrl = getApiBaseUrl();
    request = supertest.agent(apiBaseUrl);
  });

  describe('GET /health/live', () => {
    it('should return 200 with { status: "ok" } without auth', async () => {
      const res = await request.get('/health/live');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });

    it('should respond within 500ms', async () => {
      const start = Date.now();
      const res = await request.get('/health/live');
      const elapsed = Date.now() - start;

      expect(res.status).toBe(200);
      expect(elapsed).toBeLessThan(500);
    });
  });

  describe('GET /health/ready', () => {
    it('should return 200 with database connected status when DB is available', async () => {
      const res = await request.get('/health/ready');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok', database: 'connected' });
    });

    it('should respond within 500ms', async () => {
      const start = Date.now();
      const res = await request.get('/health/ready');
      const elapsed = Date.now() - start;

      expect(res.status).toBe(200);
      expect(elapsed).toBeLessThan(500);
    });
  });

  describe('No JWT authentication required', () => {
    it('should allow /health/live without Authorization header', async () => {
      const res = await supertest(apiBaseUrl)
        .get('/health/live')
        .unset('Authorization');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });

    it('should allow /health/ready without Authorization header', async () => {
      const res = await supertest(apiBaseUrl)
        .get('/health/ready')
        .unset('Authorization');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });
});
