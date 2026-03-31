import { describe, it, expect, beforeAll } from 'vitest';
import { getApiBaseUrl, getUserTokens } from '../helpers/seed.js';
import { createAuthClients, type AuthClients } from '../helpers/auth-client.js';

/**
 * Report API Contract Tests
 *
 * Verifies request/response shapes, validation errors (400/404), and auth errors (401)
 * for report endpoints: GET /reports, GET /reports/:reportType,
 * GET /reports/:reportType/export.
 *
 * Validates: Requirements 40.14, 40.18, 40.19
 */

describe('Report Contract Tests', () => {
  let clients: AuthClients;

  beforeAll(async () => {
    const apiBaseUrl = getApiBaseUrl();
    const tokens = getUserTokens();
    clients = createAuthClients(apiBaseUrl, tokens);
  });

  // ─── GET /reports — List Report Types ──────────────────────────────────

  describe('GET /reports', () => {
    describe('response shape', () => {
      it('should return reportTypes array with id and name fields', async () => {
        const res = await clients.manager.get('/reports');

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('reportTypes');
        expect(Array.isArray(res.body.reportTypes)).toBe(true);
        expect(res.body.reportTypes.length).toBeGreaterThan(0);

        const first = res.body.reportTypes[0];
        expect(typeof first.id).toBe('string');
        expect(typeof first.name).toBe('string');
      });

      it('should include known report type identifiers', async () => {
        const res = await clients.manager.get('/reports');

        expect(res.status).toBe(200);
        const ids = res.body.reportTypes.map((r: { id: string }) => r.id);
        expect(ids).toContain('daily-collection');
        expect(ids).toContain('overdue');
        expect(ids).toContain('loan-portfolio');
        expect(ids).toContain('trial-balance');
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const res = await clients.unauthenticated.get('/reports');

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 401 when token is expired', async () => {
        const res = await clients.expired.get('/reports');

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });

      it('should return 401 when token is tampered', async () => {
        const res = await clients.tampered.get('/reports');

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });
  });

  // ─── GET /reports/:reportType — Generate Report ────────────────────────

  describe('GET /reports/:reportType', () => {
    describe('response shape', () => {
      it('should return report with reportType, generatedAt, summary, and data', async () => {
        const res = await clients.manager.get('/reports/daily-collection');

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('reportType', 'daily-collection');
        expect(typeof res.body.generatedAt).toBe('string');
        expect(res.body).toHaveProperty('summary');
        expect(res.body).toHaveProperty('data');
      });

      it('should return stubbed report shape for unimplemented types', async () => {
        const res = await clients.manager.get('/reports/customer');

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('reportType', 'customer');
        expect(typeof res.body.generatedAt).toBe('string');
        expect(res.body).toHaveProperty('summary');
        expect(res.body).toHaveProperty('data');
        expect(Array.isArray(res.body.data)).toBe(true);
      });

      it('should accept date range query params', async () => {
        const res = await clients.manager.get(
          '/reports/daily-collection?startDate=2024-01-01&endDate=2024-12-31',
        );

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('reportType', 'daily-collection');
        expect(res.body).toHaveProperty('filters');
      });
    });

    describe('validation errors (404)', () => {
      it('should return 404 for unknown report type', async () => {
        const res = await clients.manager.get('/reports/nonexistent-report');

        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('statusCode', 404);
        expect(res.body).toHaveProperty('message');
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const res = await clients.unauthenticated.get('/reports/daily-collection');

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 401 when token is expired', async () => {
        const res = await clients.expired.get('/reports/daily-collection');

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });

      it('should return 401 when token is tampered', async () => {
        const res = await clients.tampered.get('/reports/daily-collection');

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });
  });

  // ─── GET /reports/:reportType/export — Export Report ───────────────────

  describe('GET /reports/:reportType/export', () => {
    describe('response shape', () => {
      it('should return export metadata with reportType, format, and metadata fields', async () => {
        const res = await clients.manager.get(
          '/reports/daily-collection/export?format=csv',
        );

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('reportType', 'daily-collection');
        expect(res.body).toHaveProperty('format', 'csv');
        expect(typeof res.body.generatedAt).toBe('string');
        expect(res.body).toHaveProperty('metadata');
        expect(typeof res.body.metadata.format).toBe('string');
        expect(typeof res.body.metadata.mimeType).toBe('string');
        expect(typeof res.body.metadata.filename).toBe('string');
        expect(res.body).toHaveProperty('data');
      });

      it('should accept pdf format', async () => {
        const res = await clients.manager.get(
          '/reports/daily-collection/export?format=pdf',
        );

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('format', 'pdf');
        expect(res.body.metadata.mimeType).toBe('application/pdf');
      });

      it('should accept xlsx format', async () => {
        const res = await clients.manager.get(
          '/reports/daily-collection/export?format=xlsx',
        );

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('format', 'xlsx');
        expect(res.body.metadata.mimeType).toBe(
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
      });
    });

    describe('validation errors (404)', () => {
      it('should return 404 for unsupported export format', async () => {
        const res = await clients.manager.get(
          '/reports/daily-collection/export?format=html',
        );

        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('statusCode', 404);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 404 for unknown report type in export', async () => {
        const res = await clients.manager.get(
          '/reports/nonexistent-report/export?format=csv',
        );

        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('statusCode', 404);
        expect(res.body).toHaveProperty('message');
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const res = await clients.unauthenticated.get(
          '/reports/daily-collection/export?format=csv',
        );

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 401 when token is expired', async () => {
        const res = await clients.expired.get(
          '/reports/daily-collection/export?format=csv',
        );

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });

      it('should return 401 when token is tampered', async () => {
        const res = await clients.tampered.get(
          '/reports/daily-collection/export?format=csv',
        );

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });
  });
});
