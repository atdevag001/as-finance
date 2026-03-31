import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import { getApiBaseUrl, getUserTokens, getSeedData } from '../helpers/seed.js';
import { createAuthClients, type AuthClients } from '../helpers/auth-client.js';
import { createCustomer, createLoan, postCollection } from '../helpers/factories.js';

/**
 * Reversal API Contract Tests
 *
 * Verifies request/response shapes, validation errors (400), and auth errors (401)
 * for the reversal endpoint: POST /reversals.
 *
 * Contract tests focus on verifying the API surface: correct status codes,
 * response field names/types, and error handling behavior.
 *
 * Validates: Requirements 40.7, 40.18, 40.19
 */

describe('Reversal Contract Tests', () => {
  let clients: AuthClients;
  let collectionId: string;

  beforeAll(async () => {
    const apiBaseUrl = getApiBaseUrl();
    const tokens = getUserTokens();
    clients = createAuthClients(apiBaseUrl, tokens);

    const seedData = getSeedData();
    const productVersionId = seedData.products.flatMonthly.versionId;

    // Create a customer, advance a loan to active, and post a collection
    const customer = await createCustomer(clients.fieldOfficer);
    const customerId = customer['customer']?.['id'] ?? customer['id'];

    const loan = await createLoan(clients.fieldOfficer, {
      customerId,
      productVersionId,
      advanceTo: 'active',
      clients,
    });

    const collection = await postCollection(clients.collectionOfficer, {
      loanId: loan['id'],
      amountPaise: 100_00,
    });
    collectionId = collection['data']?.['collectionId'] ?? collection['collectionId'] ?? collection['id'];
  });

  // ─── POST /reversals — Response Shape ──────────────────────────────────

  describe('POST /reversals', () => {
    describe('response shape', () => {
      it('should return reversal result with expected fields on success', async () => {
        const res = await clients.manager.post('/reversals').send({
          collectionId,
          reason: 'Contract test reversal',
          idempotencyKey: `contract-rev-${randomUUID()}`,
        });

        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('data');
        const data = res.body.data;
        expect(typeof data.reversalCollectionId).toBe('string');
        expect(typeof data.originalCollectionId).toBe('string');
        expect(typeof data.loanId).toBe('string');
        expect(typeof data.loanNumber).toBe('string');
        expect(typeof data.reversedAmountPaise).toBe('number');
        expect(typeof data.mirrorJournalEntryId).toBe('string');
        expect(typeof data.outstandingAfterPaise).toBe('number');
        expect(typeof data.reason).toBe('string');
      });

      it('should return idempotent result for duplicate idempotency key', async () => {
        // First, create a new collection to reverse
        const seedData = getSeedData();
        const productVersionId = seedData.products.flatMonthly.versionId;
        const customer = await createCustomer(clients.fieldOfficer);
        const customerId = customer['customer']?.['id'] ?? customer['id'];
        const loan = await createLoan(clients.fieldOfficer, {
          customerId,
          productVersionId,
          advanceTo: 'active',
          clients,
        });
        const coll = await postCollection(clients.collectionOfficer, {
          loanId: loan['id'],
          amountPaise: 100_00,
        });
        const collId = coll['data']?.['collectionId'] ?? coll['collectionId'] ?? coll['id'];

        const idempotencyKey = `contract-rev-idem-${randomUUID()}`;

        const res1 = await clients.manager.post('/reversals').send({
          collectionId: collId,
          reason: 'Idempotency test reversal',
          idempotencyKey,
        });
        expect(res1.status).toBe(201);

        const res2 = await clients.manager.post('/reversals').send({
          collectionId: collId,
          reason: 'Idempotency test reversal',
          idempotencyKey,
        });
        // Idempotent — returns cached result
        expect(res2.status).toBe(200);
        expect(res2.body).toHaveProperty('data');
      });
    });

    describe('validation errors (400)', () => {
      it('should return 400 when body is empty', async () => {
        const res = await clients.manager.post('/reversals').send({});

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when collectionId is missing', async () => {
        const res = await clients.manager.post('/reversals').send({
          reason: 'Test reversal',
          idempotencyKey: `contract-${randomUUID()}`,
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when reason is missing', async () => {
        const res = await clients.manager.post('/reversals').send({
          collectionId: randomUUID(),
          idempotencyKey: `contract-${randomUUID()}`,
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when idempotencyKey is missing', async () => {
        const res = await clients.manager.post('/reversals').send({
          collectionId: randomUUID(),
          reason: 'Test reversal',
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when collectionId is not a valid UUID', async () => {
        const res = await clients.manager.post('/reversals').send({
          collectionId: 'not-a-uuid',
          reason: 'Test reversal',
          idempotencyKey: `contract-${randomUUID()}`,
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when reason is empty string', async () => {
        const res = await clients.manager.post('/reversals').send({
          collectionId: randomUUID(),
          reason: '',
          idempotencyKey: `contract-${randomUUID()}`,
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const res = await clients.unauthenticated.post('/reversals').send({
          collectionId: randomUUID(),
          reason: 'Test reversal',
          idempotencyKey: `contract-${randomUUID()}`,
        });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 401 when token is expired', async () => {
        const res = await clients.expired.post('/reversals').send({
          collectionId: randomUUID(),
          reason: 'Test reversal',
          idempotencyKey: `contract-${randomUUID()}`,
        });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });

      it('should return 401 when token is tampered', async () => {
        const res = await clients.tampered.post('/reversals').send({
          collectionId: randomUUID(),
          reason: 'Test reversal',
          idempotencyKey: `contract-${randomUUID()}`,
        });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });

    describe('business rule errors', () => {
      it('should return 404 for non-existent collection', async () => {
        const fakeId = '00000000-0000-0000-0000-000000000000';
        const res = await clients.manager.post('/reversals').send({
          collectionId: fakeId,
          reason: 'Test reversal of non-existent collection',
          idempotencyKey: `contract-${randomUUID()}`,
        });

        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('statusCode', 404);
        expect(res.body).toHaveProperty('message');
      });
    });
  });
});
