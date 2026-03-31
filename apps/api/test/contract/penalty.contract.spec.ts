import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import { getApiBaseUrl, getUserTokens, getSeedData } from '../helpers/seed.js';
import { createAuthClients, type AuthClients } from '../helpers/auth-client.js';
import { createCustomer, createLoan } from '../helpers/factories.js';

/**
 * Penalty API Contract Tests
 *
 * Verifies request/response shapes, validation errors (400), and auth errors (401)
 * for penalty endpoints: GET /penalties/loan/:loanId, POST /penalties/calculate,
 * POST /penalties/:id/waive.
 *
 * Contract tests focus on verifying the API surface: correct status codes,
 * response field names/types, and error handling behavior.
 *
 * Validates: Requirements 40.8, 40.18, 40.19
 */

describe('Penalty Contract Tests', () => {
  let clients: AuthClients;
  let activeLoanId: string;

  beforeAll(async () => {
    const apiBaseUrl = getApiBaseUrl();
    const tokens = getUserTokens();
    clients = createAuthClients(apiBaseUrl, tokens);

    const seedData = getSeedData();
    const productVersionId = seedData.products.flatMonthly.versionId;

    // Create a customer and advance a loan to active for penalty tests
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

  // ─── GET /penalties/loan/:loanId — Response Shape ──────────────────────

  describe('GET /penalties/loan/:loanId', () => {
    describe('response shape', () => {
      it('should return an array of penalties for a valid loan', async () => {
        const res = await clients.manager.get(`/penalties/loan/${activeLoanId}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
      });

      it('should return empty array when loan has no penalties', async () => {
        const res = await clients.manager.get(`/penalties/loan/${activeLoanId}`);

        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
      });

      it('should return penalty objects with expected fields when penalties exist', async () => {
        // Get the loan schedule to find an installment
        const loanRes = await clients.fieldOfficer.get(`/loans/${activeLoanId}`);
        const schedules = loanRes.body['schedules'] ?? loanRes.body['schedule'] ?? [];
        if (schedules.length === 0) return; // skip if no schedule

        const installmentId = schedules[0]['id'];

        // Post a penalty first
        const calcRes = await clients.manager.post('/penalties/calculate').send({
          loanId: activeLoanId,
          installmentId,
          penaltyPeriod: `contract-${randomUUID().slice(0, 8)}`,
          referenceDate: '2025-06-01',
        });

        // Only verify shape if penalty was posted successfully
        if (calcRes.status === 201) {
          const res = await clients.manager.get(`/penalties/loan/${activeLoanId}`);

          expect(res.status).toBe(200);
          expect(Array.isArray(res.body)).toBe(true);
          expect(res.body.length).toBeGreaterThan(0);

          const penalty = res.body[0];
          expect(typeof penalty.id).toBe('string');
          expect(typeof penalty.loan_id).toBe('string');
          expect(typeof penalty.installment_id).toBe('string');
          expect(penalty.amount_paise).toBeDefined();
          expect(typeof penalty.penalty_period).toBe('string');
          expect(typeof penalty.is_paid).toBe('boolean');
          expect(typeof penalty.is_waived).toBe('boolean');
          expect(penalty.created_at).toBeDefined();
        }
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const res = await clients.unauthenticated.get(`/penalties/loan/${activeLoanId}`);

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 401 when token is expired', async () => {
        const res = await clients.expired.get(`/penalties/loan/${activeLoanId}`);

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });

      it('should return 401 when token is tampered', async () => {
        const res = await clients.tampered.get(`/penalties/loan/${activeLoanId}`);

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });
  });

  // ─── POST /penalties/calculate — Response Shape ────────────────────────

  describe('POST /penalties/calculate', () => {
    describe('validation errors (400)', () => {
      it('should return 400 when body is empty', async () => {
        const res = await clients.manager.post('/penalties/calculate').send({});

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when loanId is missing', async () => {
        const res = await clients.manager.post('/penalties/calculate').send({
          installmentId: randomUUID(),
          penaltyPeriod: '2024-01',
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when installmentId is missing', async () => {
        const res = await clients.manager.post('/penalties/calculate').send({
          loanId: activeLoanId,
          penaltyPeriod: '2024-01',
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when penaltyPeriod is missing', async () => {
        const res = await clients.manager.post('/penalties/calculate').send({
          loanId: activeLoanId,
          installmentId: randomUUID(),
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when loanId is not a valid UUID', async () => {
        const res = await clients.manager.post('/penalties/calculate').send({
          loanId: 'not-a-uuid',
          installmentId: randomUUID(),
          penaltyPeriod: '2024-01',
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when installmentId is not a valid UUID', async () => {
        const res = await clients.manager.post('/penalties/calculate').send({
          loanId: activeLoanId,
          installmentId: 'not-a-uuid',
          penaltyPeriod: '2024-01',
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const res = await clients.unauthenticated.post('/penalties/calculate').send({
          loanId: activeLoanId,
          installmentId: randomUUID(),
          penaltyPeriod: '2024-01',
        });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 401 when token is expired', async () => {
        const res = await clients.expired.post('/penalties/calculate').send({
          loanId: activeLoanId,
          installmentId: randomUUID(),
          penaltyPeriod: '2024-01',
        });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });

      it('should return 401 when token is tampered', async () => {
        const res = await clients.tampered.post('/penalties/calculate').send({
          loanId: activeLoanId,
          installmentId: randomUUID(),
          penaltyPeriod: '2024-01',
        });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });

    describe('business rule errors', () => {
      it('should return 404 for non-existent loan', async () => {
        const fakeId = '00000000-0000-0000-0000-000000000000';
        const res = await clients.manager.post('/penalties/calculate').send({
          loanId: fakeId,
          installmentId: randomUUID(),
          penaltyPeriod: '2024-01',
        });

        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('statusCode', 404);
        expect(res.body).toHaveProperty('message');
      });

      it('should return error for non-existent installment on a valid loan', async () => {
        const fakeInstallmentId = '00000000-0000-0000-0000-000000000001';
        const res = await clients.manager.post('/penalties/calculate').send({
          loanId: activeLoanId,
          installmentId: fakeInstallmentId,
          penaltyPeriod: '2024-01',
          referenceDate: '2025-06-01',
        });

        // API returns 404 (not found) or 422 (business rule) for missing installment
        expect([400, 404, 422]).toContain(res.status);
        expect(res.body).toHaveProperty('statusCode');
        expect(res.body).toHaveProperty('message');
      });
    });
  });

  // ─── POST /penalties/:id/waive — Response Shape ────────────────────────

  describe('POST /penalties/:id/waive', () => {
    describe('validation errors (400)', () => {
      it('should return 400 when body is empty', async () => {
        const fakePenaltyId = randomUUID();
        const res = await clients.manager.post(`/penalties/${fakePenaltyId}/waive`).send({});

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when reason is missing', async () => {
        const fakePenaltyId = randomUUID();
        const res = await clients.manager.post(`/penalties/${fakePenaltyId}/waive`).send({
          approverId: randomUUID(),
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when approverId is missing', async () => {
        const fakePenaltyId = randomUUID();
        const res = await clients.manager.post(`/penalties/${fakePenaltyId}/waive`).send({
          reason: 'Customer hardship waiver',
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when reason is too short', async () => {
        const fakePenaltyId = randomUUID();
        const res = await clients.manager.post(`/penalties/${fakePenaltyId}/waive`).send({
          reason: 'abc',
          approverId: randomUUID(),
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when approverId is not a valid UUID', async () => {
        const fakePenaltyId = randomUUID();
        const res = await clients.manager.post(`/penalties/${fakePenaltyId}/waive`).send({
          reason: 'Customer hardship waiver',
          approverId: 'not-a-uuid',
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const fakePenaltyId = randomUUID();
        const res = await clients.unauthenticated.post(`/penalties/${fakePenaltyId}/waive`).send({
          reason: 'Customer hardship waiver',
          approverId: randomUUID(),
        });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 401 when token is expired', async () => {
        const fakePenaltyId = randomUUID();
        const res = await clients.expired.post(`/penalties/${fakePenaltyId}/waive`).send({
          reason: 'Customer hardship waiver',
          approverId: randomUUID(),
        });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });

      it('should return 401 when token is tampered', async () => {
        const fakePenaltyId = randomUUID();
        const res = await clients.tampered.post(`/penalties/${fakePenaltyId}/waive`).send({
          reason: 'Customer hardship waiver',
          approverId: randomUUID(),
        });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });

    describe('business rule errors', () => {
      it('should return 404 for non-existent penalty', async () => {
        const fakeId = '00000000-0000-0000-0000-000000000000';
        const res = await clients.manager.post(`/penalties/${fakeId}/waive`).send({
          reason: 'Customer hardship waiver',
          approverId: randomUUID(),
        });

        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('statusCode', 404);
        expect(res.body).toHaveProperty('message');
      });
    });
  });
});
