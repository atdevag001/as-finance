import { describe, it, expect, beforeAll } from 'vitest';
import { getApiBaseUrl, getUserTokens, getSeedData } from '../helpers/seed.js';
import { createAuthClients, type AuthClients } from '../helpers/auth-client.js';
import { recordExpense, createHandover, createUser } from '../helpers/factories.js';

/**
 * Cashbook API Contract Tests
 *
 * Verifies request/response shapes, validation errors (400), and auth errors (401)
 * for all cashbook endpoints: GET /cashbook/daily-summary, POST /cashbook/expenses,
 * GET /cashbook/expenses, POST /cashbook/handovers, PATCH /cashbook/handovers/:id/verify.
 *
 * Contract tests focus on verifying the API surface: correct status codes,
 * response field names/types, and error handling behavior.
 *
 * Validates: Requirements 40.12, 40.18, 40.19
 */

describe('Cashbook Contract Tests', () => {
  let clients: AuthClients;
  let receivingOfficerId: string;

  beforeAll(async () => {
    const apiBaseUrl = getApiBaseUrl();
    const tokens = getUserTokens();
    clients = createAuthClients(apiBaseUrl, tokens);

    // Get a receiving officer ID from seed data for handover tests
    const seedData = getSeedData();
    receivingOfficerId = seedData.users.manager.id;
  });

  // ─── GET /cashbook/daily-summary — Response Shape ────────────────────────

  describe('GET /cashbook/daily-summary', () => {
    describe('response shape', () => {
      it('should return daily summary with expected fields', async () => {
        const res = await clients.accountant.get('/cashbook/daily-summary');

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('date');
        expect(typeof res.body.date).toBe('string');
        expect(res.body).toHaveProperty('openingBalancePaise');
        expect(res.body).toHaveProperty('cashInflowsPaise');
        expect(res.body).toHaveProperty('cashOutflowsPaise');
        expect(res.body).toHaveProperty('closingBalancePaise');
        expect(res.body).toHaveProperty('hasDiscrepancy');
        expect(typeof res.body.hasDiscrepancy).toBe('boolean');
        expect(res.body).toHaveProperty('incomeBySource');
        expect(Array.isArray(res.body.incomeBySource)).toBe(true);
        expect(res.body).toHaveProperty('transactionCount');
        expect(typeof res.body.transactionCount).toBe('number');
      });

      it('should accept optional date query parameter', async () => {
        const res = await clients.accountant.get('/cashbook/daily-summary?date=2024-01-15');

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('date');
        expect(res.body.date).toBe('2024-01-15');
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const res = await clients.unauthenticated.get('/cashbook/daily-summary');

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 401 when token is expired', async () => {
        const res = await clients.expired.get('/cashbook/daily-summary');

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });

      it('should return 401 when token is tampered', async () => {
        const res = await clients.tampered.get('/cashbook/daily-summary');

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });
  });

  // ─── POST /cashbook/expenses — Response Shape ────────────────────────────

  describe('POST /cashbook/expenses', () => {
    describe('response shape', () => {
      it('should return expense and journal entry on success', async () => {
        const res = await clients.accountant.post('/cashbook/expenses').send({
          category: 'travel',
          amountPaise: 500_00,
          date: '2024-06-15',
          description: 'Contract test expense',
        });

        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('expense');
        expect(res.body).toHaveProperty('journalEntry');

        const expense = res.body.expense;
        expect(typeof expense.id).toBe('string');
        expect(expense).toHaveProperty('category');
        expect(expense).toHaveProperty('amount_paise');
        expect(expense).toHaveProperty('description');

        const journal = res.body.journalEntry;
        expect(typeof journal.id).toBe('string');
      });
    });

    describe('validation errors (400)', () => {
      it('should return 400 when body is empty', async () => {
        const res = await clients.accountant.post('/cashbook/expenses').send({});

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when category is missing', async () => {
        const res = await clients.accountant.post('/cashbook/expenses').send({
          amountPaise: 500_00,
          date: '2024-06-15',
          description: 'Missing category',
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
      });

      it('should return 400 when amountPaise is missing', async () => {
        const res = await clients.accountant.post('/cashbook/expenses').send({
          category: 'travel',
          date: '2024-06-15',
          description: 'Missing amount',
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
      });

      it('should return 400 when amountPaise is zero', async () => {
        const res = await clients.accountant.post('/cashbook/expenses').send({
          category: 'travel',
          amountPaise: 0,
          date: '2024-06-15',
          description: 'Zero amount',
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
      });

      it('should return 400 when amountPaise is negative', async () => {
        const res = await clients.accountant.post('/cashbook/expenses').send({
          category: 'travel',
          amountPaise: -100,
          date: '2024-06-15',
          description: 'Negative amount',
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
      });

      it('should return 400 when date is missing', async () => {
        const res = await clients.accountant.post('/cashbook/expenses').send({
          category: 'travel',
          amountPaise: 500_00,
          description: 'Missing date',
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
      });

      it('should return 400 when date is not a valid ISO date', async () => {
        const res = await clients.accountant.post('/cashbook/expenses').send({
          category: 'travel',
          amountPaise: 500_00,
          date: 'not-a-date',
          description: 'Invalid date',
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
      });

      it('should return 400 when description is missing', async () => {
        const res = await clients.accountant.post('/cashbook/expenses').send({
          category: 'travel',
          amountPaise: 500_00,
          date: '2024-06-15',
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const res = await clients.unauthenticated.post('/cashbook/expenses').send({
          category: 'travel',
          amountPaise: 500_00,
          date: '2024-06-15',
          description: 'Unauth test',
        });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 401 when token is expired', async () => {
        const res = await clients.expired.post('/cashbook/expenses').send({
          category: 'travel',
          amountPaise: 500_00,
          date: '2024-06-15',
          description: 'Expired token test',
        });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });

      it('should return 401 when token is tampered', async () => {
        const res = await clients.tampered.post('/cashbook/expenses').send({
          category: 'travel',
          amountPaise: 500_00,
          date: '2024-06-15',
          description: 'Tampered token test',
        });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });
  });

  // ─── GET /cashbook/expenses — Response Shape ─────────────────────────────

  describe('GET /cashbook/expenses', () => {
    describe('response shape', () => {
      it('should return paginated expense list', async () => {
        // Ensure at least one expense exists
        await recordExpense(clients.accountant, {
          category: 'office',
          amountPaise: 200_00,
          description: 'Contract list test expense',
        });

        const res = await clients.accountant.get('/cashbook/expenses');

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('data');
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body).toHaveProperty('total');
        expect(typeof res.body.total).toBe('number');
      });

      it('should accept pagination query parameters', async () => {
        const res = await clients.accountant.get('/cashbook/expenses?skip=0&take=5');

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('data');
        expect(Array.isArray(res.body.data)).toBe(true);
      });

      it('should accept category filter', async () => {
        const res = await clients.accountant.get('/cashbook/expenses?category=travel');

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('data');
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const res = await clients.unauthenticated.get('/cashbook/expenses');

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 401 when token is expired', async () => {
        const res = await clients.expired.get('/cashbook/expenses');

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });
  });

  // ─── POST /cashbook/handovers — Response Shape ───────────────────────────

  describe('POST /cashbook/handovers', () => {
    describe('response shape', () => {
      it('should return handover record on success', async () => {
        const res = await clients.collectionOfficer.post('/cashbook/handovers').send({
          totalAmountPaise: 10_000_00,
          receivingOfficerId: receivingOfficerId,
          handoverDate: '2024-06-15',
        });

        expect(res.status).toBe(201);
        expect(typeof res.body.id).toBe('string');
        expect(res.body).toHaveProperty('collection_officer_id');
        expect(res.body).toHaveProperty('receiving_officer_id');
        expect(res.body).toHaveProperty('total_amount_paise');
        expect(res.body).toHaveProperty('handover_date');
      });
    });

    describe('validation errors (400)', () => {
      it('should return 400 when body is empty', async () => {
        const res = await clients.collectionOfficer.post('/cashbook/handovers').send({});

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when totalAmountPaise is missing', async () => {
        const res = await clients.collectionOfficer.post('/cashbook/handovers').send({
          receivingOfficerId: receivingOfficerId,
          handoverDate: '2024-06-15',
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
      });

      it('should return 400 when totalAmountPaise is zero', async () => {
        const res = await clients.collectionOfficer.post('/cashbook/handovers').send({
          totalAmountPaise: 0,
          receivingOfficerId: receivingOfficerId,
          handoverDate: '2024-06-15',
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
      });

      it('should return 400 when receivingOfficerId is missing', async () => {
        const res = await clients.collectionOfficer.post('/cashbook/handovers').send({
          totalAmountPaise: 10_000_00,
          handoverDate: '2024-06-15',
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
      });

      it('should return 400 when receivingOfficerId is not a valid UUID', async () => {
        const res = await clients.collectionOfficer.post('/cashbook/handovers').send({
          totalAmountPaise: 10_000_00,
          receivingOfficerId: 'not-a-uuid',
          handoverDate: '2024-06-15',
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
      });

      it('should return 400 when handoverDate is missing', async () => {
        const res = await clients.collectionOfficer.post('/cashbook/handovers').send({
          totalAmountPaise: 10_000_00,
          receivingOfficerId: receivingOfficerId,
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
      });

      it('should return 400 when handoverDate is not a valid ISO date', async () => {
        const res = await clients.collectionOfficer.post('/cashbook/handovers').send({
          totalAmountPaise: 10_000_00,
          receivingOfficerId: receivingOfficerId,
          handoverDate: 'invalid-date',
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const res = await clients.unauthenticated.post('/cashbook/handovers').send({
          totalAmountPaise: 10_000_00,
          receivingOfficerId: receivingOfficerId,
          handoverDate: '2024-06-15',
        });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 401 when token is expired', async () => {
        const res = await clients.expired.post('/cashbook/handovers').send({
          totalAmountPaise: 10_000_00,
          receivingOfficerId: receivingOfficerId,
          handoverDate: '2024-06-15',
        });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });

      it('should return 401 when token is tampered', async () => {
        const res = await clients.tampered.post('/cashbook/handovers').send({
          totalAmountPaise: 10_000_00,
          receivingOfficerId: receivingOfficerId,
          handoverDate: '2024-06-15',
        });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });
  });

  // ─── PATCH /cashbook/handovers/:id/verify — Response Shape ───────────────

  describe('PATCH /cashbook/handovers/:id/verify', () => {
    let handoverId: string;

    beforeAll(async () => {
      // Create a handover to verify
      const handover = await createHandover(clients.collectionOfficer, {
        totalAmountPaise: 5_000_00,
        receivingOfficerId: receivingOfficerId,
        handoverDate: '2024-06-16',
      });
      handoverId = handover['id'];
    });

    describe('response shape', () => {
      it('should return updated handover on successful verification', async () => {
        const res = await clients.manager.patch(`/cashbook/handovers/${handoverId}/verify`).send({
          verificationStatus: 'verified',
        });

        expect(res.status).toBe(200);
        expect(typeof res.body.id).toBe('string');
        expect(res.body).toHaveProperty('verification_status');
        expect(res.body.verification_status).toBe('verified');
      });
    });

    describe('validation errors (400)', () => {
      it('should return 400 when body is empty', async () => {
        const res = await clients.manager
          .patch(`/cashbook/handovers/${handoverId}/verify`)
          .send({});

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when verificationStatus is invalid', async () => {
        const res = await clients.manager
          .patch(`/cashbook/handovers/${handoverId}/verify`)
          .send({ verificationStatus: 'invalid_status' });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
      });
    });

    describe('not found errors (404)', () => {
      it('should return 404 for non-existent handover', async () => {
        const fakeId = '00000000-0000-0000-0000-000000000000';
        const res = await clients.manager
          .patch(`/cashbook/handovers/${fakeId}/verify`)
          .send({ verificationStatus: 'verified' });

        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('statusCode', 404);
        expect(res.body).toHaveProperty('message');
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const res = await clients.unauthenticated
          .patch(`/cashbook/handovers/${handoverId}/verify`)
          .send({ verificationStatus: 'verified' });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 401 when token is expired', async () => {
        const res = await clients.expired
          .patch(`/cashbook/handovers/${handoverId}/verify`)
          .send({ verificationStatus: 'verified' });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });

      it('should return 401 when token is tampered', async () => {
        const res = await clients.tampered
          .patch(`/cashbook/handovers/${handoverId}/verify`)
          .send({ verificationStatus: 'verified' });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });
  });
});
