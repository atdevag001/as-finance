import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import { getApiBaseUrl, getUserTokens, getSeedData } from '../helpers/seed.js';
import { createAuthClients, type AuthClients } from '../helpers/auth-client.js';
import { createCustomer, createLoan } from '../helpers/factories.js';

/**
 * Foreclosure API Contract Tests
 *
 * Verifies request/response shapes, validation errors (400), and auth errors (401)
 * for foreclosure endpoints: POST /foreclosures/quote, POST /foreclosures, GET /foreclosures/:id.
 *
 * Contract tests focus on verifying the API surface: correct status codes,
 * response field names/types, and error handling behavior.
 *
 * Validates: Requirements 40.9, 40.18, 40.19
 */

describe('Foreclosure Contract Tests', () => {
  let clients: AuthClients;
  let activeLoanId: string;

  beforeAll(async () => {
    const apiBaseUrl = getApiBaseUrl();
    const tokens = getUserTokens();
    clients = createAuthClients(apiBaseUrl, tokens);

    const seedData = getSeedData();
    const productVersionId = seedData.products.flatMonthly.versionId;

    // Create a customer and advance a loan to active for foreclosure tests
    const customer = await createCustomer(clients.fieldOfficer);
    const customerId = customer['customer']?.['id'] ?? customer['id'];

    const loan = await createLoan(clients.fieldOfficer, {
      customerId,
      productVersionId,
      advanceTo: 'active',
      clients,
    });
    activeLoanId = loan['id'];
  });

  // ─── POST /foreclosures/quote — Response Shape ─────────────────────────

  describe('POST /foreclosures/quote', () => {
    describe('response shape', () => {
      it('should return foreclosure quote with expected fields on success', async () => {
        const res = await clients.manager.post('/foreclosures/quote').send({
          loanId: activeLoanId,
        });

        expect(res.status).toBe(201);
        expect(typeof res.body.foreclosureId).toBe('string');
        expect(typeof res.body.loanId).toBe('string');
        expect(typeof res.body.loanNumber).toBe('string');
        expect(typeof res.body.outstandingPrincipalPaise).toBe('number');
        expect(typeof res.body.accruedInterestPaise).toBe('number');
        expect(typeof res.body.pendingPenaltiesPaise).toBe('number');
        expect(typeof res.body.rebatePaise).toBe('number');
        expect(typeof res.body.settlementAmountPaise).toBe('number');
        expect(typeof res.body.quoteExpiresAt).toBe('string');
        expect(res.body.status).toBe('quote');
      });

      it('should accept optional rebate fields', async () => {
        const res = await clients.manager.post('/foreclosures/quote').send({
          loanId: activeLoanId,
          rebatePaise: 500,
          rebateReason: 'Contract test rebate',
        });

        expect(res.status).toBe(201);
        expect(res.body.rebatePaise).toBe(500);
        expect(typeof res.body.settlementAmountPaise).toBe('number');
      });
    });

    describe('validation errors (400)', () => {
      it('should return 400 when body is empty', async () => {
        const res = await clients.manager.post('/foreclosures/quote').send({});

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when loanId is missing', async () => {
        const res = await clients.manager.post('/foreclosures/quote').send({
          rebatePaise: 0,
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when loanId is not a valid UUID', async () => {
        const res = await clients.manager.post('/foreclosures/quote').send({
          loanId: 'not-a-uuid',
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when rebatePaise is negative', async () => {
        const res = await clients.manager.post('/foreclosures/quote').send({
          loanId: activeLoanId,
          rebatePaise: -100,
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when rebatePaise is a float', async () => {
        const res = await clients.manager.post('/foreclosures/quote').send({
          loanId: activeLoanId,
          rebatePaise: 100.5,
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const res = await clients.unauthenticated.post('/foreclosures/quote').send({
          loanId: activeLoanId,
        });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 401 when token is expired', async () => {
        const res = await clients.expired.post('/foreclosures/quote').send({
          loanId: activeLoanId,
        });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });

      it('should return 401 when token is tampered', async () => {
        const res = await clients.tampered.post('/foreclosures/quote').send({
          loanId: activeLoanId,
        });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });

    describe('business rule errors', () => {
      it('should return 404 for non-existent loan', async () => {
        const fakeId = '00000000-0000-0000-0000-000000000000';
        const res = await clients.manager.post('/foreclosures/quote').send({
          loanId: fakeId,
        });

        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('statusCode', 404);
        expect(res.body).toHaveProperty('message');
      });
    });
  });


  // ─── POST /foreclosures — Execute Foreclosure ──────────────────────────

  describe('POST /foreclosures (execute)', () => {
    describe('validation errors (400)', () => {
      it('should return 400 when body is empty', async () => {
        const res = await clients.manager.post('/foreclosures').send({});

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when foreclosureId is missing', async () => {
        const res = await clients.manager.post('/foreclosures').send({
          paymentMode: 'cash',
          idempotencyKey: `contract-${randomUUID()}`,
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when foreclosureId is not a valid UUID', async () => {
        const res = await clients.manager.post('/foreclosures').send({
          foreclosureId: 'not-a-uuid',
          paymentMode: 'cash',
          idempotencyKey: `contract-${randomUUID()}`,
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when paymentMode is missing', async () => {
        const res = await clients.manager.post('/foreclosures').send({
          foreclosureId: randomUUID(),
          idempotencyKey: `contract-${randomUUID()}`,
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when idempotencyKey is missing', async () => {
        const res = await clients.manager.post('/foreclosures').send({
          foreclosureId: randomUUID(),
          paymentMode: 'cash',
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when rebatePaise is negative', async () => {
        const res = await clients.manager.post('/foreclosures').send({
          foreclosureId: randomUUID(),
          paymentMode: 'cash',
          idempotencyKey: `contract-${randomUUID()}`,
          rebatePaise: -100,
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const res = await clients.unauthenticated.post('/foreclosures').send({
          foreclosureId: randomUUID(),
          paymentMode: 'cash',
          idempotencyKey: `contract-${randomUUID()}`,
        });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 401 when token is expired', async () => {
        const res = await clients.expired.post('/foreclosures').send({
          foreclosureId: randomUUID(),
          paymentMode: 'cash',
          idempotencyKey: `contract-${randomUUID()}`,
        });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });

      it('should return 401 when token is tampered', async () => {
        const res = await clients.tampered.post('/foreclosures').send({
          foreclosureId: randomUUID(),
          paymentMode: 'cash',
          idempotencyKey: `contract-${randomUUID()}`,
        });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });

    describe('business rule errors', () => {
      it('should return 404 for non-existent foreclosure', async () => {
        const fakeId = '00000000-0000-0000-0000-000000000000';
        const res = await clients.manager.post('/foreclosures').send({
          foreclosureId: fakeId,
          paymentMode: 'cash',
          idempotencyKey: `contract-${randomUUID()}`,
        });

        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('statusCode', 404);
        expect(res.body).toHaveProperty('message');
      });
    });
  });

  // ─── GET /foreclosures/:id — Response Shape ────────────────────────────

  describe('GET /foreclosures/:id', () => {
    let foreclosureId: string;

    beforeAll(async () => {
      // Create a quote to have a valid foreclosure ID for GET tests
      const res = await clients.manager.post('/foreclosures/quote').send({
        loanId: activeLoanId,
      });
      foreclosureId = res.body.foreclosureId;
    });

    describe('response shape', () => {
      it('should return foreclosure details with expected fields', async () => {
        const res = await clients.manager.get(`/foreclosures/${foreclosureId}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('id');
        expect(typeof res.body.id).toBe('string');
        expect(res.body).toHaveProperty('loan_id');
        expect(typeof res.body.loan_id).toBe('string');
        expect(res.body).toHaveProperty('status');
        expect(typeof res.body.status).toBe('string');
        expect(res.body).toHaveProperty('settlement_amount_paise');
        expect(res.body).toHaveProperty('outstanding_principal_paise');
        expect(res.body).toHaveProperty('accrued_interest_paise');
        expect(res.body).toHaveProperty('pending_penalties_paise');
        expect(res.body).toHaveProperty('rebate_paise');
        expect(res.body).toHaveProperty('quote_expires_at');
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const res = await clients.unauthenticated.get(`/foreclosures/${foreclosureId}`);

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 401 when token is expired', async () => {
        const res = await clients.expired.get(`/foreclosures/${foreclosureId}`);

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });

      it('should return 401 when token is tampered', async () => {
        const res = await clients.tampered.get(`/foreclosures/${foreclosureId}`);

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });

    describe('business rule errors', () => {
      it('should return 404 for non-existent foreclosure', async () => {
        const fakeId = '00000000-0000-0000-0000-000000000000';
        const res = await clients.manager.get(`/foreclosures/${fakeId}`);

        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('statusCode', 404);
        expect(res.body).toHaveProperty('message');
      });
    });
  });
});
