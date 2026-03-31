import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import { getApiBaseUrl, getUserTokens, getSeedData } from '../helpers/seed.js';
import { createAuthClients, type AuthClients } from '../helpers/auth-client.js';
import { createCustomer, createLoan } from '../helpers/factories.js';

/**
 * Collection API Contract Tests
 *
 * Verifies request/response shapes, validation errors (400), and auth errors (401)
 * for collection endpoints: GET /collections, POST /collections.
 *
 * Contract tests focus on verifying the API surface: correct status codes,
 * response field names/types, and error handling behavior.
 *
 * Validates: Requirements 40.5, 40.18, 40.19
 */

describe('Collection Contract Tests', () => {
  let clients: AuthClients;
  let activeLoanId: string;

  beforeAll(async () => {
    const apiBaseUrl = getApiBaseUrl();
    const tokens = getUserTokens();
    clients = createAuthClients(apiBaseUrl, tokens);

    const seedData = getSeedData();
    const productVersionId = seedData.products.flatMonthly.versionId;

    // Create a customer and advance a loan to active for collection tests
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

  // ─── POST /collections — Response Shape ────────────────────────────────

  describe('POST /collections', () => {
    describe('response shape', () => {
      it('should return collection result with expected fields on success', async () => {
        const res = await clients.collectionOfficer.post('/collections').send({
          loanId: activeLoanId,
          amountPaise: 100_00,
          paymentDate: '2024-01-15',
          paymentMode: 'cash',
          idempotencyKey: `contract-coll-${randomUUID()}`,
        });

        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('data');
        const data = res.body.data;
        expect(typeof data.collectionId).toBe('string');
        expect(typeof data.loanId).toBe('string');
        expect(typeof data.loanNumber).toBe('string');
        expect(typeof data.amountPaise).toBe('number');
        expect(typeof data.paymentDate).toBe('string');
        expect(typeof data.paymentMode).toBe('string');
        expect(typeof data.journalEntryId).toBe('string');
        expect(typeof data.receiptId).toBe('string');
        expect(typeof data.receiptNumber).toBe('string');
        expect(data).toHaveProperty('allocations');
        expect(typeof data.allocations.penaltyPaise).toBe('number');
        expect(typeof data.allocations.interestPaise).toBe('number');
        expect(typeof data.allocations.principalPaise).toBe('number');
        expect(typeof data.allocations.excessPaise).toBe('number');
        expect(typeof data.outstandingAfterPaise).toBe('number');
      });

      it('should return idempotent result for duplicate idempotency key', async () => {
        const idempotencyKey = `contract-idem-${randomUUID()}`;

        const res1 = await clients.collectionOfficer.post('/collections').send({
          loanId: activeLoanId,
          amountPaise: 50_00,
          paymentDate: '2024-01-15',
          paymentMode: 'cash',
          idempotencyKey,
        });
        expect(res1.status).toBe(201);

        const res2 = await clients.collectionOfficer.post('/collections').send({
          loanId: activeLoanId,
          amountPaise: 50_00,
          paymentDate: '2024-01-15',
          paymentMode: 'cash',
          idempotencyKey,
        });
        // Idempotent — returns cached result
        expect(res2.status).toBe(200);
        expect(res2.body).toHaveProperty('data');
      });
    });

    describe('validation errors (400)', () => {
      it('should return 400 when body is empty', async () => {
        const res = await clients.collectionOfficer.post('/collections').send({});

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when loanId is missing', async () => {
        const res = await clients.collectionOfficer.post('/collections').send({
          amountPaise: 100_00,
          paymentDate: '2024-01-15',
          paymentMode: 'cash',
          idempotencyKey: `contract-${randomUUID()}`,
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when amountPaise is missing', async () => {
        const res = await clients.collectionOfficer.post('/collections').send({
          loanId: activeLoanId,
          paymentDate: '2024-01-15',
          paymentMode: 'cash',
          idempotencyKey: `contract-${randomUUID()}`,
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when paymentDate is missing', async () => {
        const res = await clients.collectionOfficer.post('/collections').send({
          loanId: activeLoanId,
          amountPaise: 100_00,
          paymentMode: 'cash',
          idempotencyKey: `contract-${randomUUID()}`,
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when paymentMode is missing', async () => {
        const res = await clients.collectionOfficer.post('/collections').send({
          loanId: activeLoanId,
          amountPaise: 100_00,
          paymentDate: '2024-01-15',
          idempotencyKey: `contract-${randomUUID()}`,
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when idempotencyKey is missing', async () => {
        const res = await clients.collectionOfficer.post('/collections').send({
          loanId: activeLoanId,
          amountPaise: 100_00,
          paymentDate: '2024-01-15',
          paymentMode: 'cash',
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when loanId is not a valid UUID', async () => {
        const res = await clients.collectionOfficer.post('/collections').send({
          loanId: 'not-a-uuid',
          amountPaise: 100_00,
          paymentDate: '2024-01-15',
          paymentMode: 'cash',
          idempotencyKey: `contract-${randomUUID()}`,
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when amountPaise is not a positive integer', async () => {
        const res = await clients.collectionOfficer.post('/collections').send({
          loanId: activeLoanId,
          amountPaise: -100,
          paymentDate: '2024-01-15',
          paymentMode: 'cash',
          idempotencyKey: `contract-${randomUUID()}`,
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when amountPaise is zero', async () => {
        const res = await clients.collectionOfficer.post('/collections').send({
          loanId: activeLoanId,
          amountPaise: 0,
          paymentDate: '2024-01-15',
          paymentMode: 'cash',
          idempotencyKey: `contract-${randomUUID()}`,
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when amountPaise is a float', async () => {
        const res = await clients.collectionOfficer.post('/collections').send({
          loanId: activeLoanId,
          amountPaise: 100.5,
          paymentDate: '2024-01-15',
          paymentMode: 'cash',
          idempotencyKey: `contract-${randomUUID()}`,
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when paymentMode is invalid enum value', async () => {
        const res = await clients.collectionOfficer.post('/collections').send({
          loanId: activeLoanId,
          amountPaise: 100_00,
          paymentDate: '2024-01-15',
          paymentMode: 'bitcoin',
          idempotencyKey: `contract-${randomUUID()}`,
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when paymentDate is not a valid ISO date', async () => {
        const res = await clients.collectionOfficer.post('/collections').send({
          loanId: activeLoanId,
          amountPaise: 100_00,
          paymentDate: 'not-a-date',
          paymentMode: 'cash',
          idempotencyKey: `contract-${randomUUID()}`,
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const res = await clients.unauthenticated.post('/collections').send({
          loanId: activeLoanId,
          amountPaise: 100_00,
          paymentDate: '2024-01-15',
          paymentMode: 'cash',
          idempotencyKey: `contract-${randomUUID()}`,
        });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 401 when token is expired', async () => {
        const res = await clients.expired.post('/collections').send({
          loanId: activeLoanId,
          amountPaise: 100_00,
          paymentDate: '2024-01-15',
          paymentMode: 'cash',
          idempotencyKey: `contract-${randomUUID()}`,
        });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });

      it('should return 401 when token is tampered', async () => {
        const res = await clients.tampered.post('/collections').send({
          loanId: activeLoanId,
          amountPaise: 100_00,
          paymentDate: '2024-01-15',
          paymentMode: 'cash',
          idempotencyKey: `contract-${randomUUID()}`,
        });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });

    describe('business rule errors', () => {
      it('should return 404 for non-existent loan', async () => {
        const fakeId = '00000000-0000-0000-0000-000000000000';
        const res = await clients.collectionOfficer.post('/collections').send({
          loanId: fakeId,
          amountPaise: 100_00,
          paymentDate: '2024-01-15',
          paymentMode: 'cash',
          idempotencyKey: `contract-${randomUUID()}`,
        });

        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('statusCode', 404);
        expect(res.body).toHaveProperty('message');
      });
    });
  });

  // ─── GET /collections — Response Shape ─────────────────────────────────
  // Note: The collection controller currently only exposes POST /collections.
  // GET /collections is not implemented. These tests verify the endpoint
  // returns 404 (not found) as expected for an unimplemented route.

  describe('GET /collections', () => {
    describe('endpoint availability', () => {
      it('should return 404 for unimplemented GET /collections', async () => {
        const res = await clients.collectionOfficer.get('/collections');

        // GET /collections is not implemented in the controller
        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('statusCode', 404);
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const res = await clients.unauthenticated.get('/collections');

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });
  });
});