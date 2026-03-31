import { describe, it, expect, beforeAll } from 'vitest';
import { getApiBaseUrl, getUserTokens, getSeedData } from '../helpers/seed.js';
import { createAuthClients, type AuthClients } from '../helpers/auth-client.js';
import { createCustomer, createLoan } from '../helpers/factories.js';

/**
 * Loan API Contract Tests
 *
 * Verifies request/response shapes, validation errors (400), and auth errors (401)
 * for all loan endpoints: GET /loans, POST /loans, GET /loans/:id,
 * POST /loans/:id/submit, POST /loans/:id/approve, POST /loans/:id/reject,
 * POST /loans/:id/close.
 *
 * Contract tests focus on verifying the API surface: correct status codes,
 * response field names/types, and error handling behavior.
 *
 * Validates: Requirements 40.4, 40.18, 40.19
 */

describe('Loan Contract Tests', () => {
  let clients: AuthClients;
  let testCustomerId: string;
  let testProductVersionId: string;
  let testLoanId: string;

  beforeAll(async () => {
    const apiBaseUrl = getApiBaseUrl();
    const tokens = getUserTokens();
    clients = createAuthClients(apiBaseUrl, tokens);

    const seedData = getSeedData();
    testProductVersionId = seedData.products.flatMonthly.versionId;

    // Create a customer for loan tests
    const customerRes = await createCustomer(clients.fieldOfficer);
    testCustomerId = customerRes['customer']?.['id'] ?? customerRes['id'];

    // Create a loan for read tests
    const loanRes = await createLoan(clients.fieldOfficer, {
      customerId: testCustomerId,
      productVersionId: testProductVersionId,
    });
    testLoanId = loanRes['id'];
  });

  // ─── POST /loans — Response Shape ──────────────────────────────────────

  describe('POST /loans', () => {
    describe('response shape', () => {
      it('should return loan object with expected fields on success', async () => {
        const customer = await createCustomer(clients.fieldOfficer);
        const customerId = customer['customer']?.['id'] ?? customer['id'];

        const res = await clients.fieldOfficer.post('/loans').send({
          customerId,
          productVersionId: testProductVersionId,
          principalPaise: 100_000_00,
          tenureMonths: 12,
          purpose: 'Contract test loan',
        });

        expect(res.status).toBe(201);
        expect(typeof res.body.id).toBe('string');
        expect(typeof res.body.loan_number).toBe('string');
        expect(res.body.status).toBe('draft');
        expect(typeof res.body.principal_paise).toBe('number');
        expect(typeof res.body.tenure_months).toBe('number');
        expect(res.body).toHaveProperty('customer_id');
        expect(res.body).toHaveProperty('product_version_id');
        expect(res.body).toHaveProperty('created_at');
        expect(res.body).toHaveProperty('created_by');
      });
    });

    describe('validation errors (400)', () => {
      it('should return 400 when body is empty', async () => {
        const res = await clients.fieldOfficer.post('/loans').send({});

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when customerId is missing', async () => {
        const res = await clients.fieldOfficer.post('/loans').send({
          productVersionId: testProductVersionId,
          principalPaise: 100_000_00,
          tenureMonths: 12,
          purpose: 'Missing customer',
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when productVersionId is missing', async () => {
        const res = await clients.fieldOfficer.post('/loans').send({
          customerId: testCustomerId,
          principalPaise: 100_000_00,
          tenureMonths: 12,
          purpose: 'Missing product',
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when principalPaise is missing', async () => {
        const res = await clients.fieldOfficer.post('/loans').send({
          customerId: testCustomerId,
          productVersionId: testProductVersionId,
          tenureMonths: 12,
          purpose: 'Missing principal',
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when tenureMonths is missing', async () => {
        const res = await clients.fieldOfficer.post('/loans').send({
          customerId: testCustomerId,
          productVersionId: testProductVersionId,
          principalPaise: 100_000_00,
          purpose: 'Missing tenure',
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when purpose is missing', async () => {
        const res = await clients.fieldOfficer.post('/loans').send({
          customerId: testCustomerId,
          productVersionId: testProductVersionId,
          principalPaise: 100_000_00,
          tenureMonths: 12,
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when customerId is not a valid UUID', async () => {
        const res = await clients.fieldOfficer.post('/loans').send({
          customerId: 'not-a-uuid',
          productVersionId: testProductVersionId,
          principalPaise: 100_000_00,
          tenureMonths: 12,
          purpose: 'Invalid UUID',
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when principalPaise is not an integer', async () => {
        const res = await clients.fieldOfficer.post('/loans').send({
          customerId: testCustomerId,
          productVersionId: testProductVersionId,
          principalPaise: 100.5,
          tenureMonths: 12,
          purpose: 'Non-integer principal',
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when principalPaise is zero or negative', async () => {
        const res = await clients.fieldOfficer.post('/loans').send({
          customerId: testCustomerId,
          productVersionId: testProductVersionId,
          principalPaise: 0,
          tenureMonths: 12,
          purpose: 'Zero principal',
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when tenureMonths is zero or negative', async () => {
        const res = await clients.fieldOfficer.post('/loans').send({
          customerId: testCustomerId,
          productVersionId: testProductVersionId,
          principalPaise: 100_000_00,
          tenureMonths: 0,
          purpose: 'Zero tenure',
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const res = await clients.unauthenticated.post('/loans').send({
          customerId: testCustomerId,
          productVersionId: testProductVersionId,
          principalPaise: 100_000_00,
          tenureMonths: 12,
          purpose: 'Unauth loan',
        });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 401 when token is expired', async () => {
        const res = await clients.expired.post('/loans').send({
          customerId: testCustomerId,
          productVersionId: testProductVersionId,
          principalPaise: 100_000_00,
          tenureMonths: 12,
          purpose: 'Expired token loan',
        });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });

      it('should return 401 when token is tampered', async () => {
        const res = await clients.tampered.post('/loans').send({
          customerId: testCustomerId,
          productVersionId: testProductVersionId,
          principalPaise: 100_000_00,
          tenureMonths: 12,
          purpose: 'Tampered token loan',
        });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });
  });


  // ─── GET /loans — Response Shape ───────────────────────────────────────

  describe('GET /loans', () => {
    describe('response shape', () => {
      it('should return paginated list with data array and total', async () => {
        const res = await clients.fieldOfficer.get('/loans');

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('data');
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body).toHaveProperty('total');
        expect(typeof res.body.total).toBe('number');
      });

      it('should accept pagination query params', async () => {
        const res = await clients.fieldOfficer.get('/loans?skip=0&take=5');

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('data');
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.data.length).toBeLessThanOrEqual(5);
      });

      it('should accept status filter', async () => {
        const res = await clients.fieldOfficer.get('/loans?status=draft');

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('data');
        expect(Array.isArray(res.body.data)).toBe(true);
      });

      it('should accept customerId filter', async () => {
        const res = await clients.fieldOfficer.get(`/loans?customerId=${testCustomerId}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('data');
        expect(Array.isArray(res.body.data)).toBe(true);
      });

      it('should include loan fields in list items', async () => {
        const res = await clients.fieldOfficer.get('/loans?take=1');

        expect(res.status).toBe(200);
        if (res.body.data.length > 0) {
          const loan = res.body.data[0];
          expect(typeof loan.id).toBe('string');
          expect(typeof loan.loan_number).toBe('string');
          expect(typeof loan.status).toBe('string');
          expect(loan).toHaveProperty('principal_paise');
          expect(loan).toHaveProperty('tenure_months');
          expect(loan).toHaveProperty('created_at');
        }
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const res = await clients.unauthenticated.get('/loans');

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });
  });

  // ─── GET /loans/:id — Response Shape ───────────────────────────────────

  describe('GET /loans/:id', () => {
    describe('response shape', () => {
      it('should return loan object with full details', async () => {
        const res = await clients.fieldOfficer.get(`/loans/${testLoanId}`);

        expect(res.status).toBe(200);
        expect(typeof res.body.id).toBe('string');
        expect(typeof res.body.loan_number).toBe('string');
        expect(typeof res.body.status).toBe('string');
        expect(res.body).toHaveProperty('principal_paise');
        expect(res.body).toHaveProperty('tenure_months');
        expect(res.body).toHaveProperty('customer_id');
        expect(res.body).toHaveProperty('product_version_id');
        expect(res.body).toHaveProperty('created_at');
        expect(res.body).toHaveProperty('created_by');
      });

      it('should include nested customer data', async () => {
        const res = await clients.fieldOfficer.get(`/loans/${testLoanId}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('customer');
        expect(typeof res.body.customer.id).toBe('string');
        expect(typeof res.body.customer.full_name).toBe('string');
      });

      it('should include nested product_version data', async () => {
        const res = await clients.fieldOfficer.get(`/loans/${testLoanId}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('product_version');
        expect(typeof res.body.product_version.id).toBe('string');
        expect(res.body.product_version).toHaveProperty('interest_type');
        expect(res.body.product_version).toHaveProperty('annual_rate_bps');
      });

      it('should include schedules array', async () => {
        const res = await clients.fieldOfficer.get(`/loans/${testLoanId}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('schedules');
        expect(Array.isArray(res.body.schedules)).toBe(true);
      });

      it('should include status_history array', async () => {
        const res = await clients.fieldOfficer.get(`/loans/${testLoanId}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('status_history');
        expect(Array.isArray(res.body.status_history)).toBe(true);
        if (res.body.status_history.length > 0) {
          const entry = res.body.status_history[0];
          expect(entry).toHaveProperty('to_status');
          expect(entry).toHaveProperty('changed_by');
          expect(entry).toHaveProperty('created_at');
        }
      });

      it('should return 404 for non-existent loan', async () => {
        const fakeId = '00000000-0000-0000-0000-000000000000';
        const res = await clients.fieldOfficer.get(`/loans/${fakeId}`);

        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('statusCode', 404);
        expect(res.body).toHaveProperty('message');
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const res = await clients.unauthenticated.get(`/loans/${testLoanId}`);

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });
  });


  // ─── POST /loans/:id/submit — Response Shape ──────────────────────────

  describe('POST /loans/:id/submit', () => {
    let submitLoanId: string;

    beforeAll(async () => {
      const customer = await createCustomer(clients.fieldOfficer);
      const customerId = customer['customer']?.['id'] ?? customer['id'];
      const loan = await createLoan(clients.fieldOfficer, {
        customerId,
        productVersionId: testProductVersionId,
      });
      submitLoanId = loan['id'];
    });

    describe('response shape', () => {
      it('should return loan with submitted status on success', async () => {
        const res = await clients.fieldOfficer
          .post(`/loans/${submitLoanId}/submit`)
          .send();

        expect(res.status).toBe(200);
        expect(typeof res.body.id).toBe('string');
        expect(res.body.status).toBe('submitted');
        expect(res.body).toHaveProperty('loan_number');
      });
    });

    describe('error responses', () => {
      it('should return 404 for non-existent loan', async () => {
        const fakeId = '00000000-0000-0000-0000-000000000000';
        const res = await clients.fieldOfficer
          .post(`/loans/${fakeId}/submit`)
          .send();

        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('statusCode', 404);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 422 for invalid status transition', async () => {
        // submitLoanId is already submitted, submitting again should fail
        const res = await clients.fieldOfficer
          .post(`/loans/${submitLoanId}/submit`)
          .send();

        expect(res.status).toBe(422);
        expect(res.body).toHaveProperty('statusCode', 422);
        expect(res.body).toHaveProperty('message');
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const res = await clients.unauthenticated
          .post(`/loans/${submitLoanId}/submit`)
          .send();

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });
  });

  // ─── POST /loans/:id/approve — Response Shape ─────────────────────────

  describe('POST /loans/:id/approve', () => {
    let approveLoanId: string;

    beforeAll(async () => {
      const customer = await createCustomer(clients.fieldOfficer);
      const customerId = customer['customer']?.['id'] ?? customer['id'];
      const loan = await createLoan(clients.fieldOfficer, {
        customerId,
        productVersionId: testProductVersionId,
        advanceTo: 'under_review',
        clients,
      });
      approveLoanId = loan['id'];
    });

    describe('response shape', () => {
      it('should return loan with approved status on success', async () => {
        const res = await clients.manager
          .post(`/loans/${approveLoanId}/approve`)
          .send({ remarks: 'Contract test approval' });

        expect(res.status).toBe(200);
        expect(typeof res.body.id).toBe('string');
        expect(res.body.status).toBe('approved');
        expect(res.body).toHaveProperty('loan_number');
        expect(res.body).toHaveProperty('approved_by');
      });
    });

    describe('error responses', () => {
      it('should return 404 for non-existent loan', async () => {
        const fakeId = '00000000-0000-0000-0000-000000000000';
        const res = await clients.manager
          .post(`/loans/${fakeId}/approve`)
          .send({ remarks: 'Approve non-existent' });

        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('statusCode', 404);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 422 for invalid status transition', async () => {
        // approveLoanId is already approved, approving again should fail
        const res = await clients.manager
          .post(`/loans/${approveLoanId}/approve`)
          .send({ remarks: 'Double approve' });

        expect(res.status).toBe(422);
        expect(res.body).toHaveProperty('statusCode', 422);
        expect(res.body).toHaveProperty('message');
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const res = await clients.unauthenticated
          .post(`/loans/${approveLoanId}/approve`)
          .send({ remarks: 'Unauth approve' });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });
  });

  // ─── POST /loans/:id/reject — Response Shape ──────────────────────────

  describe('POST /loans/:id/reject', () => {
    let rejectLoanId: string;

    beforeAll(async () => {
      const customer = await createCustomer(clients.fieldOfficer);
      const customerId = customer['customer']?.['id'] ?? customer['id'];
      const loan = await createLoan(clients.fieldOfficer, {
        customerId,
        productVersionId: testProductVersionId,
        advanceTo: 'under_review',
        clients,
      });
      rejectLoanId = loan['id'];
    });

    describe('response shape', () => {
      it('should return loan with rejected status on success', async () => {
        const res = await clients.manager
          .post(`/loans/${rejectLoanId}/reject`)
          .send({ reason: 'Contract test rejection' });

        expect(res.status).toBe(200);
        expect(typeof res.body.id).toBe('string');
        expect(res.body.status).toBe('rejected');
        expect(res.body).toHaveProperty('loan_number');
      });
    });

    describe('validation errors (400)', () => {
      it('should return 400 when reason is missing', async () => {
        const customer = await createCustomer(clients.fieldOfficer);
        const customerId = customer['customer']?.['id'] ?? customer['id'];
        const loan = await createLoan(clients.fieldOfficer, {
          customerId,
          productVersionId: testProductVersionId,
          advanceTo: 'under_review',
          clients,
        });

        const res = await clients.manager
          .post(`/loans/${loan['id']}/reject`)
          .send({});

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when reason is empty string', async () => {
        const customer = await createCustomer(clients.fieldOfficer);
        const customerId = customer['customer']?.['id'] ?? customer['id'];
        const loan = await createLoan(clients.fieldOfficer, {
          customerId,
          productVersionId: testProductVersionId,
          advanceTo: 'under_review',
          clients,
        });

        const res = await clients.manager
          .post(`/loans/${loan['id']}/reject`)
          .send({ reason: '' });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });
    });

    describe('error responses', () => {
      it('should return 404 for non-existent loan', async () => {
        const fakeId = '00000000-0000-0000-0000-000000000000';
        const res = await clients.manager
          .post(`/loans/${fakeId}/reject`)
          .send({ reason: 'Reject non-existent' });

        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('statusCode', 404);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 422 for invalid status transition', async () => {
        // rejectLoanId is already rejected, rejecting again should fail
        const res = await clients.manager
          .post(`/loans/${rejectLoanId}/reject`)
          .send({ reason: 'Double reject' });

        expect(res.status).toBe(422);
        expect(res.body).toHaveProperty('statusCode', 422);
        expect(res.body).toHaveProperty('message');
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const res = await clients.unauthenticated
          .post(`/loans/${rejectLoanId}/reject`)
          .send({ reason: 'Unauth reject' });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });
  });

  // ─── POST /loans/:id/close — Response Shape ───────────────────────────

  describe('POST /loans/:id/close', () => {
    describe('error responses', () => {
      it('should return 404 for non-existent loan', async () => {
        const fakeId = '00000000-0000-0000-0000-000000000000';
        const res = await clients.manager
          .post(`/loans/${fakeId}/close`)
          .send();

        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('statusCode', 404);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 422 when closing a draft loan (prerequisites not met)', async () => {
        const res = await clients.manager
          .post(`/loans/${testLoanId}/close`)
          .send();

        expect(res.status).toBe(422);
        expect(res.body).toHaveProperty('statusCode', 422);
        expect(res.body).toHaveProperty('message');
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const res = await clients.unauthenticated
          .post(`/loans/${testLoanId}/close`)
          .send();

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });
  });
});
