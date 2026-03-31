import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import { getApiBaseUrl, getUserTokens, getSeedData } from '../helpers/seed.js';
import { createAuthClients, type AuthClients } from '../helpers/auth-client.js';
import { createCustomer, createLoan } from '../helpers/factories.js';

/**
 * Disbursement API Contract Tests
 *
 * Verifies request/response shapes, validation errors (400), and auth errors (401)
 * for the disbursement endpoint: POST /disbursements.
 *
 * Contract tests focus on verifying the API surface: correct status codes,
 * response field names/types, and error handling behavior.
 *
 * Validates: Requirements 40.6, 40.18, 40.19
 */

describe('Disbursement Contract Tests', () => {
  let clients: AuthClients;
  let approvedLoanId: string;

  beforeAll(async () => {
    const apiBaseUrl = getApiBaseUrl();
    const tokens = getUserTokens();
    clients = createAuthClients(apiBaseUrl, tokens);

    const seedData = getSeedData();
    const productVersionId = seedData.products.flatMonthly.versionId;

    // Create a customer and advance a loan to 'approved' for disbursement tests
    const customer = await createCustomer(clients.fieldOfficer);
    const customerId = customer['customer']?.['id'] ?? customer['id'];

    const loan = await createLoan(clients.fieldOfficer, {
      customerId,
      productVersionId,
      advanceTo: 'approved',
      clients,
    });
    approvedLoanId = loan['id'];
  });

  // ─── POST /disbursements — Response Shape ──────────────────────────────

  describe('POST /disbursements', () => {
    describe('response shape', () => {
      it('should return disbursement result with expected fields on success', async () => {
        const res = await clients.manager.post('/disbursements').send({
          loanId: approvedLoanId,
          mode: 'cash',
          idempotencyKey: `contract-disb-${randomUUID()}`,
        });

        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('data');
        const data = res.body.data;
        expect(typeof data.disbursementId).toBe('string');
        expect(typeof data.loanId).toBe('string');
        expect(typeof data.loanNumber).toBe('string');
        expect(typeof data.amountPaise).toBe('string');
        expect(typeof data.mode).toBe('string');
        expect(typeof data.journalEntryId).toBe('string');
        expect(typeof data.disbursedAt).toBe('string');
        expect(typeof data.processingFeePaise).toBe('string');
      });

      it('should return idempotent result for duplicate idempotency key', async () => {
        // The first disbursement already consumed the approved loan above.
        // Create a new approved loan for this test.
        const seedData = getSeedData();
        const productVersionId = seedData.products.flatMonthly.versionId;
        const customer = await createCustomer(clients.fieldOfficer);
        const customerId = customer['customer']?.['id'] ?? customer['id'];
        const loan = await createLoan(clients.fieldOfficer, {
          customerId,
          productVersionId,
          advanceTo: 'approved',
          clients,
        });

        const idempotencyKey = `contract-idem-disb-${randomUUID()}`;

        const res1 = await clients.manager.post('/disbursements').send({
          loanId: loan['id'],
          mode: 'cash',
          idempotencyKey,
        });
        expect(res1.status).toBe(201);

        const res2 = await clients.manager.post('/disbursements').send({
          loanId: loan['id'],
          mode: 'cash',
          idempotencyKey,
        });
        // Idempotent — returns cached result
        expect(res2.status).toBe(200);
        expect(res2.body).toHaveProperty('data');
      });
    });

    describe('validation errors (400)', () => {
      it('should return 400 when body is empty', async () => {
        const res = await clients.manager.post('/disbursements').send({});

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when loanId is missing', async () => {
        const res = await clients.manager.post('/disbursements').send({
          mode: 'cash',
          idempotencyKey: `contract-${randomUUID()}`,
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when mode is missing', async () => {
        const res = await clients.manager.post('/disbursements').send({
          loanId: approvedLoanId,
          idempotencyKey: `contract-${randomUUID()}`,
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when idempotencyKey is missing', async () => {
        const res = await clients.manager.post('/disbursements').send({
          loanId: approvedLoanId,
          mode: 'cash',
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when loanId is not a valid UUID', async () => {
        const res = await clients.manager.post('/disbursements').send({
          loanId: 'not-a-uuid',
          mode: 'cash',
          idempotencyKey: `contract-${randomUUID()}`,
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when mode is an invalid enum value', async () => {
        const res = await clients.manager.post('/disbursements').send({
          loanId: approvedLoanId,
          mode: 'bitcoin',
          idempotencyKey: `contract-${randomUUID()}`,
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const res = await clients.unauthenticated.post('/disbursements').send({
          loanId: approvedLoanId,
          mode: 'cash',
          idempotencyKey: `contract-${randomUUID()}`,
        });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 401 when token is expired', async () => {
        const res = await clients.expired.post('/disbursements').send({
          loanId: approvedLoanId,
          mode: 'cash',
          idempotencyKey: `contract-${randomUUID()}`,
        });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });

      it('should return 401 when token is tampered', async () => {
        const res = await clients.tampered.post('/disbursements').send({
          loanId: approvedLoanId,
          mode: 'cash',
          idempotencyKey: `contract-${randomUUID()}`,
        });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });

    describe('business rule errors', () => {
      it('should return 404 for non-existent loan', async () => {
        const fakeId = '00000000-0000-0000-0000-000000000000';
        const res = await clients.manager.post('/disbursements').send({
          loanId: fakeId,
          mode: 'cash',
          idempotencyKey: `contract-${randomUUID()}`,
        });

        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('statusCode', 404);
        expect(res.body).toHaveProperty('message');
      });
    });
  });
});
