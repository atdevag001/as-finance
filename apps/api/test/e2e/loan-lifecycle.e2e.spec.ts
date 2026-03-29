import { describe, it, expect, beforeAll } from 'vitest';
import { getApiBaseUrl, getUserTokens, getSeedData } from '../helpers/seed.js';
import { createAuthClients, type AuthClients } from '../helpers/auth-client.js';
import { createDbUtils, type DbUtils } from '../helpers/db-utils.js';
import { createCustomer, createLoan } from '../helpers/factories.js';

/**
 * Loan Lifecycle E2E Tests
 *
 * Verifies the complete loan application lifecycle: creation in draft status
 * with sequential loan numbers, submission validation, full status transition
 * chain, maker-checker enforcement, invalid transition rejection, approved
 * loan immutability, and concurrent loan number uniqueness.
 *
 * Validates: Requirements 3.1–3.7; Properties 11, 19, 23
 */

describe('Loan Lifecycle E2E', () => {
  let clients: AuthClients;
  let dbUtils: DbUtils;
  let seedData: ReturnType<typeof getSeedData>;

  beforeAll(() => {
    const apiBaseUrl = getApiBaseUrl();
    const tokens = getUserTokens();
    clients = createAuthClients(apiBaseUrl, tokens);
    dbUtils = createDbUtils();
    seedData = getSeedData();
  });

  /** Helper to extract customer ID from factory response. */
  function custId(c: Record<string, unknown>): string {
    return (c['customer'] as Record<string, unknown>)?.['id'] as string ?? c['id'] as string;
  }

  /** Helper to extract loan ID from factory response. */
  function loanId(l: Record<string, unknown>): string {
    return l['id'] as string;
  }

  // ─── 3.1 Loan Creation in Draft Status with Sequential Loan Number ────

  describe('loan creation in draft status with sequential loan number LN-YYYY-NNNNN', () => {
    it('should create a loan in draft status with a valid loan number format', async () => {
      const customer = await createCustomer(clients.fieldOfficer, {
        fullName: 'Lifecycle Draft Customer',
      });
      const productVersionId = seedData.products.flatMonthly.versionId;

      const res = await clients.fieldOfficer.post('/loans').send({
        customerId: custId(customer),
        productVersionId,
        principalPaise: 10_000_00,
        tenureMonths: 12,
        purpose: 'E2E lifecycle test loan',
      });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.status).toBe('draft');

      // Verify loan number format: LN-YYYY-NNNNN
      const loanNumber: string = res.body.loan_number;
      expect(loanNumber).toBeDefined();
      const currentYear = new Date().getFullYear();
      expect(loanNumber).toMatch(new RegExp(`^LN-${currentYear}-\\d{5,}$`));

      // Verify DB persistence
      const dbLoan = await dbUtils.findLoanById(res.body.id);
      expect(dbLoan).not.toBeNull();
      expect(dbLoan!.status).toBe('draft');
      expect(dbLoan!.loan_number).toBe(loanNumber);
      expect(Number(dbLoan!.principal_paise)).toBe(10_000_00);
      expect(dbLoan!.tenure_months).toBe(12);
    });

    it('should generate sequential loan numbers for consecutive creations', async () => {
      const customer = await createCustomer(clients.fieldOfficer, {
        fullName: 'Sequential LN Customer',
      });
      const cId = custId(customer);
      const productVersionId = seedData.products.flatMonthly.versionId;

      const res1 = await clients.fieldOfficer.post('/loans').send({
        customerId: cId,
        productVersionId,
        principalPaise: 10_000_00,
        tenureMonths: 6,
        purpose: 'Sequential loan 1',
      });

      const res2 = await clients.fieldOfficer.post('/loans').send({
        customerId: cId,
        productVersionId,
        principalPaise: 15_000_00,
        tenureMonths: 12,
        purpose: 'Sequential loan 2',
      });

      expect(res1.status).toBe(201);
      expect(res2.status).toBe(201);

      const num1: string = res1.body.loan_number;
      const num2: string = res2.body.loan_number;

      const currentYear = new Date().getFullYear();
      const pattern = new RegExp(`^LN-${currentYear}-\\d{5,}$`);
      expect(num1).toMatch(pattern);
      expect(num2).toMatch(pattern);

      // Second loan number should be greater than first
      expect(num2 > num1).toBe(true);
    });
  });

  // ─── 3.2 Loan Submission Validates Principal/Tenure and Customer ───────

  describe('loan submission validates principal/tenure within product ranges, customer not blacklisted', () => {
    it('should reject when principal is below product minimum', async () => {
      const customer = await createCustomer(clients.fieldOfficer, {
        fullName: 'Below Min Principal Customer',
      });
      const productVersionId = seedData.products.flatMonthly.versionId;
      const minPrincipal = seedData.products.flatMonthly.config.minPrincipalPaise;

      const res = await clients.fieldOfficer.post('/loans').send({
        customerId: custId(customer),
        productVersionId,
        principalPaise: minPrincipal - 100,
        tenureMonths: 6,
        purpose: 'Below min principal test',
      });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('PRINCIPAL_OUT_OF_RANGE');
    });

    it('should reject when principal is above product maximum', async () => {
      const customer = await createCustomer(clients.fieldOfficer, {
        fullName: 'Above Max Principal Customer',
      });
      const productVersionId = seedData.products.flatMonthly.versionId;
      const maxPrincipal = seedData.products.flatMonthly.config.maxPrincipalPaise;

      const res = await clients.fieldOfficer.post('/loans').send({
        customerId: custId(customer),
        productVersionId,
        principalPaise: maxPrincipal + 100,
        tenureMonths: 6,
        purpose: 'Above max principal test',
      });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('PRINCIPAL_OUT_OF_RANGE');
    });

    it('should reject when tenure is outside product range', async () => {
      const customer = await createCustomer(clients.fieldOfficer, {
        fullName: 'Bad Tenure Customer',
      });
      const productVersionId = seedData.products.flatMonthly.versionId;
      const maxTenure = seedData.products.flatMonthly.config.maxTenureMonths;

      const res = await clients.fieldOfficer.post('/loans').send({
        customerId: custId(customer),
        productVersionId,
        principalPaise: 10_000_00,
        tenureMonths: maxTenure + 1,
        purpose: 'Bad tenure test',
      });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('TENURE_OUT_OF_RANGE');
    });

    it('should reject loan creation for a blacklisted customer', async () => {
      const customer = await createCustomer(clients.fieldOfficer, {
        fullName: 'Blacklisted Lifecycle Customer',
      });
      const cId = custId(customer);

      await clients.manager
        .post(`/customers/${cId}/blacklist`)
        .send({ reason: 'E2E lifecycle blacklist test' });

      const res = await clients.fieldOfficer.post('/loans').send({
        customerId: cId,
        productVersionId: seedData.products.flatMonthly.versionId,
        principalPaise: 10_000_00,
        tenureMonths: 12,
        purpose: 'Loan for blacklisted customer',
      });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('CUSTOMER_BLACKLISTED');
    });

    it('should successfully submit a valid draft loan', async () => {
      const customer = await createCustomer(clients.fieldOfficer, {
        fullName: 'Valid Submit Customer',
      });
      const loan = await createLoan(clients.fieldOfficer, {
        customerId: custId(customer),
        productVersionId: seedData.products.flatMonthly.versionId,
      });

      const submitRes = await clients.fieldOfficer
        .post(`/loans/${loanId(loan)}/submit`)
        .send();

      expect(submitRes.status).toBe(200);
      expect(submitRes.body.status).toBe('submitted');

      const dbLoan = await dbUtils.findLoanById(loanId(loan));
      expect(dbLoan!.status).toBe('submitted');
    });
  });

  // ─── 3.3 Complete Status Transition Chain ──────────────────────────────

  describe('complete status transition chain: draft→submitted→under_review→approved→disbursed→active→closed', () => {
    it('should advance a loan through the full lifecycle to active', async () => {
      const customer = await createCustomer(clients.fieldOfficer, {
        fullName: 'Full Lifecycle Customer',
      });
      const cId = custId(customer);
      const pvId = seedData.products.flatMonthly.versionId;

      // Create loan in draft
      const loan = await createLoan(clients.fieldOfficer, {
        customerId: cId,
        productVersionId: pvId,
      });
      const id = loanId(loan);
      expect(loan['status']).toBe('draft');

      // draft → submitted
      const submitRes = await clients.fieldOfficer.post(`/loans/${id}/submit`).send();
      expect(submitRes.status).toBe(200);
      expect(submitRes.body.status).toBe('submitted');

      // submitted → under_review
      const reviewRes = await clients.manager.post(`/loans/${id}/review`).send();
      expect(reviewRes.status).toBe(200);
      expect(reviewRes.body.status).toBe('under_review');

      // under_review → approved (by manager, different from fieldOfficer creator)
      const approveRes = await clients.manager
        .post(`/loans/${id}/approve`)
        .send({ remarks: 'E2E full lifecycle approval' });
      expect(approveRes.status).toBe(200);
      expect(approveRes.body.status).toBe('approved');

      // approved → disbursed → active (via disbursement endpoint)
      const disburseRes = await clients.manager
        .post('/disbursements')
        .send({
          loanId: id,
          mode: 'cash',
          idempotencyKey: `e2e-lifecycle-disburse-${id}-${Date.now()}`,
        });
      expect(disburseRes.status).toBe(201);

      // Verify loan is now active
      const activeRes = await clients.fieldOfficer.get(`/loans/${id}`);
      expect(activeRes.status).toBe(200);
      expect(activeRes.body.status).toBe('active');

      // Verify DB state
      const dbLoan = await dbUtils.findLoanById(id);
      expect(dbLoan!.status).toBe('active');
      expect(Number(dbLoan!.cached_outstanding_paise)).toBeGreaterThan(0);

      // Verify schedule was generated
      const schedules = await dbUtils.findSchedulesByLoanId(id);
      expect(schedules.length).toBeGreaterThan(0);
    });
  });

  // ─── 3.4 Maker-Checker Enforcement on Approval ─────────────────────────

  describe('maker-checker enforcement on approval (different user than creator)', () => {
    it('should reject approval when approver is the same as loan creator', async () => {
      const customer = await createCustomer(clients.fieldOfficer, {
        fullName: 'Maker-Checker Same User Customer',
      });
      const cId = custId(customer);
      const pvId = seedData.products.flatMonthly.versionId;

      // Create loan as manager (so manager is the creator)
      const loanRes = await clients.manager.post('/loans').send({
        customerId: cId,
        productVersionId: pvId,
        principalPaise: 10_000_00,
        tenureMonths: 12,
        purpose: 'Maker-checker test loan',
      });
      expect(loanRes.status).toBe(201);
      const id = loanRes.body.id as string;

      // Advance to under_review
      await clients.fieldOfficer.post(`/loans/${id}/submit`).send();
      await clients.manager.post(`/loans/${id}/review`).send();

      // Attempt approval by the same manager who created the loan
      const approveRes = await clients.manager
        .post(`/loans/${id}/approve`)
        .send({ remarks: 'Self-approval attempt' });

      expect(approveRes.status).toBe(422);
      expect(approveRes.body.code).toBe('MAKER_CHECKER_VIOLATION');
    });

    it('should allow approval when approver differs from loan creator', async () => {
      const customer = await createCustomer(clients.fieldOfficer, {
        fullName: 'Maker-Checker Different User Customer',
      });
      const loan = await createLoan(clients.fieldOfficer, {
        customerId: custId(customer),
        productVersionId: seedData.products.flatMonthly.versionId,
      });
      const id = loanId(loan);

      // Advance to under_review
      await clients.fieldOfficer.post(`/loans/${id}/submit`).send();
      await clients.manager.post(`/loans/${id}/review`).send();

      // Approve by manager (different from fieldOfficer creator)
      const approveRes = await clients.manager
        .post(`/loans/${id}/approve`)
        .send({ remarks: 'Approved by different user' });

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.status).toBe('approved');

      // Verify audit log records the approval
      const auditLogs = await dbUtils.findAuditLogsByTarget('loan', id);
      const approvalLog = auditLogs.find(
        (log) => String(log.action_type) === 'loan_approved',
      );
      expect(approvalLog).toBeDefined();
      expect(approvalLog!.actor_id).toBe(seedData.users.manager.id);
    });
  });

  // ─── 3.5 Invalid Status Transitions Return INVALID_STATUS_TRANSITION ───

  describe('invalid status transitions return INVALID_STATUS_TRANSITION', () => {
    it('should reject draft → approved (skipping submitted and under_review)', async () => {
      const customer = await createCustomer(clients.fieldOfficer, {
        fullName: 'Invalid Transition Customer 1',
      });
      const loan = await createLoan(clients.fieldOfficer, {
        customerId: custId(customer),
        productVersionId: seedData.products.flatMonthly.versionId,
      });

      const res = await clients.manager
        .post(`/loans/${loanId(loan)}/approve`)
        .send({ remarks: 'Skip to approve' });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('should reject rejected → disbursed', async () => {
      const customer = await createCustomer(clients.fieldOfficer, {
        fullName: 'Invalid Transition Customer 2',
      });
      const loan = await createLoan(clients.fieldOfficer, {
        customerId: custId(customer),
        productVersionId: seedData.products.flatMonthly.versionId,
      });
      const id = loanId(loan);

      await clients.fieldOfficer.post(`/loans/${id}/submit`).send();
      await clients.manager.post(`/loans/${id}/review`).send();
      await clients.manager
        .post(`/loans/${id}/reject`)
        .send({ reason: 'E2E rejection test' });

      // Verify loan is rejected
      const getRes = await clients.fieldOfficer.get(`/loans/${id}`);
      expect(getRes.body.status).toBe('rejected');

      // Attempt to disburse a rejected loan
      const disburseRes = await clients.manager
        .post('/disbursements')
        .send({
          loanId: id,
          mode: 'cash',
          idempotencyKey: `e2e-invalid-disburse-${id}-${Date.now()}`,
        });

      expect([422, 400]).toContain(disburseRes.status);
    });

    it('should reject submitted → approved (must go through under_review)', async () => {
      const customer = await createCustomer(clients.fieldOfficer, {
        fullName: 'Invalid Transition Customer 3',
      });
      const loan = await createLoan(clients.fieldOfficer, {
        customerId: custId(customer),
        productVersionId: seedData.products.flatMonthly.versionId,
      });
      const id = loanId(loan);

      await clients.fieldOfficer.post(`/loans/${id}/submit`).send();

      const res = await clients.manager
        .post(`/loans/${id}/approve`)
        .send({ remarks: 'Skip review' });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('should reject active → submitted (invalid transition)', async () => {
      const customer = await createCustomer(clients.fieldOfficer, {
        fullName: 'Active Transition Customer',
      });
      const loan = await createLoan(clients.fieldOfficer, {
        customerId: custId(customer),
        productVersionId: seedData.products.flatMonthly.versionId,
        advanceTo: 'active',
        clients,
      });

      const res = await clients.fieldOfficer
        .post(`/loans/${loanId(loan)}/submit`)
        .send();

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('INVALID_STATUS_TRANSITION');
    });
  });

  // ─── 3.6 Approved Loan Terms Immutable via PATCH ───────────────────────

  describe('approved loan terms immutable via PATCH', () => {
    it('should reject PATCH on an approved loan', async () => {
      const customer = await createCustomer(clients.fieldOfficer, {
        fullName: 'Immutable Loan Customer',
      });
      const loan = await createLoan(clients.fieldOfficer, {
        customerId: custId(customer),
        productVersionId: seedData.products.flatMonthly.versionId,
        advanceTo: 'approved',
        clients,
      });
      const id = loanId(loan);

      // Verify loan is approved
      const getRes = await clients.fieldOfficer.get(`/loans/${id}`);
      expect(getRes.body.status).toBe('approved');

      // Attempt to PATCH loan terms — should be rejected
      const patchRes = await clients.manager
        .patch(`/loans/${id}`)
        .send({ principalPaise: 20_000_00 });

      // The API either returns 404 (no PATCH route), 405 (method not allowed),
      // or 422 (immutable after approval). Any of these is acceptable.
      expect([404, 405, 422]).toContain(patchRes.status);
    });

    it('should reject PATCH on an active loan', async () => {
      const customer = await createCustomer(clients.fieldOfficer, {
        fullName: 'Immutable Active Loan Customer',
      });
      const loan = await createLoan(clients.fieldOfficer, {
        customerId: custId(customer),
        productVersionId: seedData.products.flatMonthly.versionId,
        advanceTo: 'active',
        clients,
      });

      const patchRes = await clients.manager
        .patch(`/loans/${loanId(loan)}`)
        .send({ tenureMonths: 24 });

      expect([404, 405, 422]).toContain(patchRes.status);
    });
  });

  // ─── 3.7 Concurrent Loan Creation Produces Unique Loan Numbers ─────────

  describe('concurrent loan creation produces unique loan numbers', () => {
    it('should generate unique loan numbers for concurrent POST /loans requests', async () => {
      const customer = await createCustomer(clients.fieldOfficer, {
        fullName: 'Concurrent LN Customer',
      });
      const cId = custId(customer);
      const pvId = seedData.products.flatMonthly.versionId;

      // Fire 5 concurrent loan creation requests
      const concurrentRequests = Array.from({ length: 5 }, (_, i) =>
        clients.fieldOfficer.post('/loans').send({
          customerId: cId,
          productVersionId: pvId,
          principalPaise: 10_000_00,
          tenureMonths: 6,
          purpose: `Concurrent loan ${i + 1}`,
        }),
      );

      const results = await Promise.all(concurrentRequests);

      // Filter successful creations (some may fail due to concurrent loan limit)
      const successful = results.filter((r) => r.status === 201);
      expect(successful.length).toBeGreaterThanOrEqual(1);

      const loanNumbers = successful.map((r) => r.body.loan_number as string);
      const uniqueNumbers = new Set(loanNumbers);

      // All loan numbers must be unique
      expect(uniqueNumbers.size).toBe(loanNumbers.length);

      // All should follow the LN-YYYY-NNNNN format
      const currentYear = new Date().getFullYear();
      const pattern = new RegExp(`^LN-${currentYear}-\\d{5,}$`);
      for (const num of loanNumbers) {
        expect(num).toMatch(pattern);
      }
    });
  });
});
