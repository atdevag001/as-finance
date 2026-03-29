import { describe, it, expect, beforeAll } from 'vitest';
import { getApiBaseUrl, getUserTokens, getSeedData } from '../helpers/seed.js';
import { createAuthClients, type AuthClients } from '../helpers/auth-client.js';
import { createDbUtils, type DbUtils } from '../helpers/db-utils.js';
import { createCustomer, createLoan, postCollection } from '../helpers/factories.js';
import type { SeedData } from '../setup/global-setup.js';

/**
 * Loan Closure E2E Tests
 *
 * Verifies loan closure prerequisite checks (all installments paid, penalties
 * settled/waived, no pending reversals, outstanding=0 within 1 paisa tolerance),
 * the CLOSURE_PREREQUISITES_NOT_MET error with unmet prerequisite list,
 * successful closure updating status to closed with audit log, and prevention
 * of reopening a closed loan (INVALID_STATUS_TRANSITION).
 *
 * Validates: Requirements 10.1–10.4
 */

describe('Loan Closure E2E', () => {
  let clients: AuthClients;
  let dbUtils: DbUtils;
  let seedData: SeedData;

  beforeAll(() => {
    const apiBaseUrl = getApiBaseUrl();
    const tokens = getUserTokens();
    clients = createAuthClients(apiBaseUrl, tokens);
    dbUtils = createDbUtils();
    seedData = getSeedData();
  });

  /** Extract customer ID from factory response. */
  function custId(c: Record<string, unknown>): string {
    return (c['customer'] as Record<string, unknown>)?.['id'] as string ?? c['id'] as string;
  }

  /**
   * Helper: create a customer and loan, advance to 'active' status.
   * Returns { customerId, loanId }.
   */
  async function createActiveLoan() {
    const customer = await createCustomer(clients.fieldOfficer, {
      fullName: `Closure Test Customer ${Date.now()}`,
    });
    const cId = custId(customer);
    const pvId = seedData.products.flatMonthly.versionId;

    const loan = await createLoan(clients.fieldOfficer, {
      customerId: cId,
      productVersionId: pvId,
      advanceTo: 'active',
      clients,
    });

    const loanId = loan['id'] as string;
    return { customerId: cId, loanId };
  }

  /**
   * Helper: create an active loan and pay ALL installments so it's eligible for closure.
   * Returns { customerId, loanId }.
   */
  async function createFullyPaidLoan() {
    const { customerId, loanId } = await createActiveLoan();

    // Fetch all schedule installments and pay each one in full
    const schedules = await dbUtils.findSchedulesByLoanId(loanId);
    for (const inst of schedules) {
      const due = Number(inst.principal_paise) + Number(inst.interest_paise);
      await postCollection(clients.collectionOfficer, {
        loanId,
        amountPaise: due,
        overrides: { paymentDate: '2024-01-15' },
      });
    }

    return { customerId, loanId };
  }

  // ─── 10.1 Closure Verifies Prerequisites ────────────────────────────────

  describe('closure verifies prerequisites: all installments paid, penalties settled/waived, no pending reversals, outstanding=0', () => {
    it('should close a fully paid loan with zero outstanding', async () => {
      const { loanId } = await createFullyPaidLoan();

      // Verify outstanding is 0 (or within 1 paisa) before closure
      const loanBefore = await dbUtils.findLoanById(loanId);
      expect(Math.abs(Number(loanBefore!.cached_outstanding_paise))).toBeLessThanOrEqual(1);

      // Close the loan
      const res = await clients.manager.post(`/loans/${loanId}/close`);
      expect(res.status).toBe(200);

      // Verify loan status is now closed
      const loanAfter = await dbUtils.findLoanById(loanId);
      expect(loanAfter!.status).toBe('closed');
    });

    it('should reject closure when installments are unpaid', async () => {
      const { loanId } = await createActiveLoan();

      // Attempt closure without paying any installments
      const res = await clients.manager.post(`/loans/${loanId}/close`);

      expect([400, 422]).toContain(res.status);
      expect(res.body.code).toBe('CLOSURE_PREREQUISITES_NOT_MET');
    });

    it('should reject closure when outstanding balance is non-zero', async () => {
      const { loanId } = await createActiveLoan();

      // Pay only the first installment (partial repayment)
      const schedules = await dbUtils.findSchedulesByLoanId(loanId);
      const firstInst = schedules[0]!;
      const due = Number(firstInst.principal_paise) + Number(firstInst.interest_paise);
      await postCollection(clients.collectionOfficer, {
        loanId,
        amountPaise: due,
        overrides: { paymentDate: '2024-01-15' },
      });

      // Attempt closure — outstanding is still > 0
      const res = await clients.manager.post(`/loans/${loanId}/close`);

      expect([400, 422]).toContain(res.status);
      expect(res.body.code).toBe('CLOSURE_PREREQUISITES_NOT_MET');
    });

    it('should accept closure when outstanding is within 1 paisa tolerance', async () => {
      const { loanId } = await createFullyPaidLoan();

      // Manually set outstanding to 1 paisa (within tolerance)
      await dbUtils.prisma.loans.update({
        where: { id: loanId },
        data: { cached_outstanding_paise: 1 },
      });

      const res = await clients.manager.post(`/loans/${loanId}/close`);
      expect(res.status).toBe(200);

      const loanAfter = await dbUtils.findLoanById(loanId);
      expect(loanAfter!.status).toBe('closed');
    });
  });

  // ─── 10.2 Unmet Prerequisites Return CLOSURE_PREREQUISITES_NOT_MET ─────

  describe('unmet prerequisites return CLOSURE_PREREQUISITES_NOT_MET with list', () => {
    it('should list unpaid installments in the error response', async () => {
      const { loanId } = await createActiveLoan();

      const res = await clients.manager.post(`/loans/${loanId}/close`);

      expect([400, 422]).toContain(res.status);
      expect(res.body.code).toBe('CLOSURE_PREREQUISITES_NOT_MET');
      // The error message should mention unpaid installments
      expect(res.body.message).toMatch(/[Uu]npaid installment/i);
    });

    it('should list unsettled penalties in the error response', async () => {
      const { loanId } = await createFullyPaidLoan();

      const schedules = await dbUtils.findSchedulesByLoanId(loanId);
      const loan = await dbUtils.findLoanById(loanId);

      // Create a dummy journal entry for the penalty (required FK)
      const journalEntry = await dbUtils.prisma.journal_entries.create({
        data: {
          entry_date: new Date('2024-01-15'),
          description: 'Test penalty journal entry',
          source_type: 'penalty',
          source_id: loanId,
          total_debit_paise: 500,
          total_credit_paise: 500,
          created_by: loan!.created_by,
        },
      });

      // Insert an unsettled penalty (is_paid=false, is_waived=false)
      await dbUtils.prisma.penalties.create({
        data: {
          loan_id: loanId,
          installment_id: schedules[0]!.id,
          penalty_period: '2024-01',
          amount_paise: 500,
          calculation_details: { type: 'test', rate: 100 },
          is_paid: false,
          is_waived: false,
          journal_entry_id: journalEntry.id,
        },
      });

      // Also set outstanding > 1 paisa so the penalty is reflected
      await dbUtils.prisma.loans.update({
        where: { id: loanId },
        data: { cached_outstanding_paise: 500 },
      });

      const res = await clients.manager.post(`/loans/${loanId}/close`);

      expect([400, 422]).toContain(res.status);
      expect(res.body.code).toBe('CLOSURE_PREREQUISITES_NOT_MET');
      expect(res.body.message).toMatch(/[Uu]nsettled penalt/i);
    });

    it('should list pending reversals in the error response', async () => {
      const { loanId } = await createFullyPaidLoan();

      const collections = await dbUtils.findCollectionsByLoanId(loanId);
      const loan = await dbUtils.findLoanById(loanId);

      if (collections.length > 0) {
        const originalColl = collections[0]!;

        // Create a dummy journal entry for the reversal collection (required FK)
        const journalEntry = await dbUtils.prisma.journal_entries.create({
          data: {
            entry_date: new Date('2024-01-15'),
            description: 'Test reversal journal entry',
            source_type: 'reversal',
            source_id: originalColl.id,
            total_debit_paise: Number(originalColl.amount_paise),
            total_credit_paise: Number(originalColl.amount_paise),
            created_by: loan!.created_by,
          },
        });

        // Create a reversal collection that references the original (simulates pending reversal)
        await dbUtils.prisma.collections.create({
          data: {
            loan_id: loanId,
            amount_paise: originalColl.amount_paise,
            payment_date: new Date('2024-01-15'),
            payment_mode: 'cash',
            status: 'posted',
            is_reversal: true,
            original_collection_id: originalColl.id,
            reversal_reason: 'Test pending reversal',
            collected_by: loan!.created_by,
            journal_entry_id: journalEntry.id,
            idempotency_key: `e2e-pending-rev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          },
        });
      }

      const res = await clients.manager.post(`/loans/${loanId}/close`);

      expect([400, 422]).toContain(res.status);
      expect(res.body.code).toBe('CLOSURE_PREREQUISITES_NOT_MET');
      expect(res.body.message).toMatch(/[Pp]ending reversal/i);
    });
  });

  // ─── 10.3 Successful Closure Updates Status with Audit Log ──────────────

  describe('successful closure updates status to closed with audit log', () => {
    it('should update loan status to closed and create audit log entry', async () => {
      const { loanId } = await createFullyPaidLoan();

      const res = await clients.manager.post(`/loans/${loanId}/close`);
      expect(res.status).toBe(200);

      // Verify loan status in DB
      const loan = await dbUtils.findLoanById(loanId);
      expect(loan!.status).toBe('closed');

      // Verify audit log entry for loan closure
      const auditLogs = await dbUtils.findAuditLogsByTarget('loan', loanId);
      const closureLog = auditLogs.find(
        (log) => String(log.action_type) === 'loan_closed',
      );
      expect(closureLog).toBeDefined();
      expect(closureLog!.actor_id).toBeDefined();
      expect(closureLog!.actor_role).toBeDefined();
      expect(closureLog!.target_entity).toBe('loan');
      expect(closureLog!.target_id).toBe(loanId);

      // Verify before/after state in audit log
      const beforeState =
        typeof closureLog!.before_state === 'string'
          ? JSON.parse(closureLog!.before_state)
          : closureLog!.before_state;
      const afterState =
        typeof closureLog!.after_state === 'string'
          ? JSON.parse(closureLog!.after_state)
          : closureLog!.after_state;

      expect(beforeState).toBeDefined();
      expect(afterState).toBeDefined();
      expect(afterState.status).toBe('closed');
    });

    it('should record the final outstanding balance in the audit log', async () => {
      const { loanId } = await createFullyPaidLoan();

      const res = await clients.manager.post(`/loans/${loanId}/close`);
      expect(res.status).toBe(200);

      const auditLogs = await dbUtils.findAuditLogsByTarget('loan', loanId);
      const closureLog = auditLogs.find(
        (log) => String(log.action_type) === 'loan_closed',
      );
      expect(closureLog).toBeDefined();

      const afterState =
        typeof closureLog!.after_state === 'string'
          ? JSON.parse(closureLog!.after_state)
          : closureLog!.after_state;

      // Final outstanding should be 0
      expect(afterState.outstanding_paise).toBe(0);
    });
  });

  // ─── 10.4 Prevent Reopening Closed Loan ─────────────────────────────────

  describe('prevent reopening closed loan (INVALID_STATUS_TRANSITION)', () => {
    it('should reject submit on a closed loan', async () => {
      const { loanId } = await createFullyPaidLoan();

      // Close the loan first
      const closeRes = await clients.manager.post(`/loans/${loanId}/close`);
      expect(closeRes.status).toBe(200);

      // Attempt to submit the closed loan
      const submitRes = await clients.manager.post(`/loans/${loanId}/submit`);

      expect([400, 422]).toContain(submitRes.status);
      expect(submitRes.body.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('should reject close on an already closed loan', async () => {
      const { loanId } = await createFullyPaidLoan();

      // Close the loan
      const closeRes = await clients.manager.post(`/loans/${loanId}/close`);
      expect(closeRes.status).toBe(200);

      // Attempt to close again
      const closeAgainRes = await clients.manager.post(`/loans/${loanId}/close`);

      expect([400, 422]).toContain(closeAgainRes.status);
      expect(closeAgainRes.body.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('should reject any status transition attempt on a closed loan', async () => {
      const { loanId } = await createFullyPaidLoan();

      // Close the loan
      const closeRes = await clients.manager.post(`/loans/${loanId}/close`);
      expect(closeRes.status).toBe(200);

      // Attempt various transitions — all should fail
      const transitions = [
        { endpoint: `/loans/${loanId}/submit`, label: 'submit' },
        { endpoint: `/loans/${loanId}/review`, label: 'review' },
        { endpoint: `/loans/${loanId}/approve`, label: 'approve' },
      ];

      for (const { endpoint, label } of transitions) {
        const res = await clients.manager.post(endpoint).send({
          remarks: `Attempting ${label} on closed loan`,
        });

        expect(
          [400, 422].includes(res.status),
          `Expected ${label} on closed loan to return 400 or 422, got ${res.status}`,
        ).toBe(true);
        expect(res.body.code).toBe('INVALID_STATUS_TRANSITION');
      }
    });

    it('should reject collection posting against a closed loan', async () => {
      const { loanId } = await createFullyPaidLoan();

      // Close the loan
      const closeRes = await clients.manager.post(`/loans/${loanId}/close`);
      expect(closeRes.status).toBe(200);

      // Attempt to post a collection against the closed loan
      const collRes = await clients.collectionOfficer.post('/collections').send({
        loanId,
        amountPaise: 1000,
        paymentMode: 'cash',
        paymentDate: '2024-01-15',
        idempotencyKey: `e2e-closure-coll-${Date.now()}`,
      });

      expect([400, 422]).toContain(collRes.status);
      // Should indicate the loan is closed
      expect(collRes.body.code).toMatch(/LOAN_CLOSED|INVALID_LOAN_STATUS/);
    });
  });
});
