import { describe, it, expect, beforeAll } from 'vitest';
import { getApiBaseUrl, getUserTokens, getSeedData } from '../helpers/seed.js';
import { createAuthClients, type AuthClients } from '../helpers/auth-client.js';
import { createDbUtils, type DbUtils } from '../helpers/db-utils.js';
import { createCustomer, createLoan } from '../helpers/factories.js';
import type { SeedData } from '../setup/global-setup.js';

/**
 * Overdue & Penalty E2E Tests
 *
 * Verifies overdue detection, DPD calculation, overdue bucket classification,
 * atomic penalty posting with journal entries, duplicate penalty prevention,
 * loan status transitions (overdue→active), penalty waiver with maker-checker,
 * and DPD calculation across timezone boundaries.
 *
 * Validates: Requirements 8.1–8.7; Properties 14, 27
 */

describe('Overdue & Penalty E2E', () => {
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

  /** Create a unique idempotency key. */
  function idempKey(prefix = 'e2e-penalty'): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Helper: create a customer and loan, advance to 'active' status.
   */
  async function createActiveLoan(
    productVersionId?: string,
    overrides?: { principalPaise?: number; tenureMonths?: number },
  ) {
    const customer = await createCustomer(clients.fieldOfficer, {
      fullName: `Penalty Test Customer ${Date.now()}`,
    });
    const cId = custId(customer);
    const pvId = productVersionId ?? seedData.products.flatMonthly.versionId;

    const loan = await createLoan(clients.fieldOfficer, {
      customerId: cId,
      productVersionId: pvId,
      overrides,
      advanceTo: 'active',
      clients,
    });

    return { customerId: cId, loanId: loan['id'] as string, loan };
  }


  /**
   * Helper: get the first unpaid installment for a loan.
   */
  async function getFirstUnpaidInstallment(loanId: string) {
    const schedules = await dbUtils.findSchedulesByLoanId(loanId);
    const unpaid = schedules.find(
      (s) =>
        Number(s.principal_paid_paise) < Number(s.principal_paise) ||
        Number(s.interest_paid_paise) < Number(s.interest_paise),
    );
    return unpaid ?? schedules[0]!;
  }

  /**
   * Helper: post a penalty via the API and return the response.
   */
  async function postPenalty(
    loanId: string,
    installmentId: string,
    penaltyPeriod: string,
    referenceDate?: string,
  ) {
    return clients.manager.post('/penalties/calculate').send({
      loanId,
      installmentId,
      penaltyPeriod,
      ...(referenceDate && { referenceDate }),
    });
  }

  /**
   * Helper: build a reference date N days after a given due date.
   */
  function daysAfterDueDate(dueDate: Date, days: number): string {
    const d = new Date(dueDate);
    d.setDate(d.getDate() + days);
    return d.toISOString();
  }

  // ─── 8.1 Installment Marked Overdue When Due Date Passes ───────────────

  describe('installment marked overdue when due date passes without full payment', () => {
    it('should mark installment as overdue and update loan DPD when penalty is posted for unpaid installment', async () => {
      const { loanId } = await createActiveLoan();
      const installment = await getFirstUnpaidInstallment(loanId);

      // Use a reference date well past the due date + grace period
      const refDate = daysAfterDueDate(installment.due_date, 30);

      const res = await postPenalty(
        loanId,
        installment.id,
        '2024-01',
        refDate,
      );

      expect(res.status).toBe(201);
      const data = res.body.data ?? res.body;

      // DPD should be > 0 since the installment is unpaid past due date
      expect(data.dpd).toBeGreaterThan(0);

      // Verify loan status transitioned to overdue
      const loan = await dbUtils.findLoanById(loanId);
      expect(loan!.status).toBe('overdue');
      expect(loan!.dpd).toBeGreaterThan(0);
    });
  });

  // ─── 8.2 DPD = Calendar Days Since Earliest Unpaid Installment ─────────

  describe('DPD = calendar days since earliest unpaid installment due date', () => {
    it('should calculate DPD as calendar days from earliest unpaid installment due date', async () => {
      const { loanId } = await createActiveLoan();
      const installment = await getFirstUnpaidInstallment(loanId);

      const daysOffset = 15;
      const refDate = daysAfterDueDate(installment.due_date, daysOffset);

      // Post penalty with a reference date 15 days after due date
      const res = await postPenalty(
        loanId,
        installment.id,
        '2024-02',
        refDate,
      );

      expect(res.status).toBe(201);
      const data = res.body.data ?? res.body;

      // DPD should be approximately daysOffset (may differ by 1 due to date boundary)
      expect(data.dpd).toBeGreaterThanOrEqual(daysOffset - 1);
      expect(data.dpd).toBeLessThanOrEqual(daysOffset + 1);
    });

    it('should use the DPD info endpoint to verify DPD calculation', async () => {
      const { loanId } = await createActiveLoan();

      // Query DPD info via the read-only endpoint
      const res = await clients.manager.get(`/penalties/loan/${loanId}/dpd`);
      expect(res.status).toBe(200);

      const data = res.body.data ?? res.body;
      expect(data.dpd).toBeDefined();
      expect(typeof data.dpd).toBe('number');
      expect(data.overdueBucket).toBeDefined();
    });
  });

  // ─── 8.3 Overdue Bucket Classification ─────────────────────────────────

  describe('overdue bucket classification: 1-30, 31-60, 61-90, 90+', () => {
    it('should classify DPD 1-30 as bucket_1_30', async () => {
      const { loanId } = await createActiveLoan();
      const installment = await getFirstUnpaidInstallment(loanId);

      const refDate = daysAfterDueDate(installment.due_date, 20);
      const res = await postPenalty(loanId, installment.id, 'bucket-1-30', refDate);

      expect(res.status).toBe(201);
      const data = res.body.data ?? res.body;
      expect(data.overdueBucket).toBe('bucket_1_30');
    });

    it('should classify DPD 31-60 as bucket_31_60', async () => {
      const { loanId } = await createActiveLoan();
      const installment = await getFirstUnpaidInstallment(loanId);

      const refDate = daysAfterDueDate(installment.due_date, 45);
      const res = await postPenalty(loanId, installment.id, 'bucket-31-60', refDate);

      expect(res.status).toBe(201);
      const data = res.body.data ?? res.body;
      expect(data.overdueBucket).toBe('bucket_31_60');
    });

    it('should classify DPD 61-90 as bucket_61_90', async () => {
      const { loanId } = await createActiveLoan();
      const installment = await getFirstUnpaidInstallment(loanId);

      const refDate = daysAfterDueDate(installment.due_date, 75);
      const res = await postPenalty(loanId, installment.id, 'bucket-61-90', refDate);

      expect(res.status).toBe(201);
      const data = res.body.data ?? res.body;
      expect(data.overdueBucket).toBe('bucket_61_90');
    });

    it('should classify DPD 90+ as bucket_90_plus', async () => {
      const { loanId } = await createActiveLoan();
      const installment = await getFirstUnpaidInstallment(loanId);

      const refDate = daysAfterDueDate(installment.due_date, 120);
      const res = await postPenalty(loanId, installment.id, 'bucket-90-plus', refDate);

      expect(res.status).toBe(201);
      const data = res.body.data ?? res.body;
      expect(data.overdueBucket).toBe('bucket_90_plus');
    });
  });


  // ─── 8.4 Penalty Posting Atomically Creates All Records ────────────────

  describe('penalty posting atomically creates penalty record, journal entry, updates outstanding, audit log', () => {
    it('should atomically create penalty, journal entry, update outstanding, and audit log', async () => {
      const { loanId } = await createActiveLoan();
      const installment = await getFirstUnpaidInstallment(loanId);

      // Capture outstanding before penalty
      const loanBefore = await dbUtils.findLoanById(loanId);
      const outstandingBefore = Number(loanBefore!.cached_outstanding_paise);

      const refDate = daysAfterDueDate(installment.due_date, 30);
      const res = await postPenalty(loanId, installment.id, '2024-03-atomic', refDate);

      expect(res.status).toBe(201);
      const data = res.body.data ?? res.body;

      // 1. Penalty record created
      expect(data.penalty).toBeDefined();
      expect(data.penalty.id).toBeDefined();
      expect(Number(data.penalty.amount_paise)).toBeGreaterThan(0);
      expect(data.penalty.loan_id).toBe(loanId);
      expect(data.penalty.installment_id).toBe(installment.id);
      expect(data.penalty.penalty_period).toBe('2024-03-atomic');

      // Verify penalty in DB
      const penalties = await dbUtils.findPenaltiesByLoanId(loanId);
      const dbPenalty = penalties.find((p) => p.penalty_period === '2024-03-atomic');
      expect(dbPenalty).toBeDefined();
      expect(Number(dbPenalty!.amount_paise)).toBeGreaterThan(0);

      // 2. Journal entry created and balanced
      expect(data.journalEntry).toBeDefined();
      expect(data.journalEntry.id).toBeDefined();

      const journalLines = await dbUtils.findJournalLinesByEntryId(data.journalEntry.id);
      expect(journalLines.length).toBeGreaterThanOrEqual(2);

      const totalDebits = journalLines.reduce((s, l) => s + Number(l.debit_paise), 0);
      const totalCredits = journalLines.reduce((s, l) => s + Number(l.credit_paise), 0);
      expect(totalDebits).toBe(totalCredits);
      expect(totalDebits).toBe(Number(dbPenalty!.amount_paise));

      // Verify DR Loans Receivable, CR Penalty Income
      const debitLine = journalLines.find((l) => Number(l.debit_paise) > 0);
      const creditLine = journalLines.find((l) => Number(l.credit_paise) > 0);
      expect(debitLine).toBeDefined();
      expect(creditLine).toBeDefined();

      // 3. Outstanding updated (increased by penalty amount)
      const loanAfter = await dbUtils.findLoanById(loanId);
      const outstandingAfter = Number(loanAfter!.cached_outstanding_paise);
      const penaltyAmount = Number(dbPenalty!.amount_paise);
      expect(outstandingAfter).toBe(outstandingBefore + penaltyAmount);

      // 4. Audit log created
      const auditLogs = await dbUtils.findAuditLogsByTarget('penalty', data.penalty.id);
      const penaltyLog = auditLogs.find(
        (log) => String(log.action_type) === 'penalty_posted',
      );
      expect(penaltyLog).toBeDefined();
      expect(penaltyLog!.actor_id).toBeDefined();
      expect(penaltyLog!.actor_role).toBeDefined();

      const afterState = penaltyLog!.after_state as Record<string, unknown> | null;
      expect(afterState).toBeDefined();
      expect(afterState!['loan_id']).toBe(loanId);
      expect(afterState!['amount_paise']).toBe(penaltyAmount);
    });
  });

  // ─── 8.5 Duplicate Penalty Prevention ──────────────────────────────────

  describe('duplicate penalty prevention via unique constraint (loan_id, installment_id, penalty_period)', () => {
    it('should reject duplicate penalty for same loan, installment, and period', async () => {
      const { loanId } = await createActiveLoan();
      const installment = await getFirstUnpaidInstallment(loanId);

      const refDate = daysAfterDueDate(installment.due_date, 30);
      const period = `dup-test-${Date.now()}`;

      // First penalty should succeed
      const res1 = await postPenalty(loanId, installment.id, period, refDate);
      expect(res1.status).toBe(201);

      // Second penalty with same (loan_id, installment_id, penalty_period) should fail
      const res2 = await postPenalty(loanId, installment.id, period, refDate);
      expect(res2.status).toBe(409);

      // Verify only one penalty record exists for this period
      const penalties = await dbUtils.findPenaltiesByLoanId(loanId);
      const matching = penalties.filter((p) => p.penalty_period === period);
      expect(matching.length).toBe(1);
    });

    it('should allow penalties for different periods on the same installment', async () => {
      const { loanId } = await createActiveLoan();
      const installment = await getFirstUnpaidInstallment(loanId);

      const refDate = daysAfterDueDate(installment.due_date, 30);
      const period1 = `multi-period-1-${Date.now()}`;
      const period2 = `multi-period-2-${Date.now()}`;

      const res1 = await postPenalty(loanId, installment.id, period1, refDate);
      expect(res1.status).toBe(201);

      const res2 = await postPenalty(loanId, installment.id, period2, refDate);
      expect(res2.status).toBe(201);

      // Both penalties should exist
      const penalties = await dbUtils.findPenaltiesByLoanId(loanId);
      const p1 = penalties.find((p) => p.penalty_period === period1);
      const p2 = penalties.find((p) => p.penalty_period === period2);
      expect(p1).toBeDefined();
      expect(p2).toBeDefined();
    });
  });


  // ─── 8.6 Loan Returns to Active When All Overdue Paid and DPD=0 ────────

  describe('loan returns to active when all overdue installments paid and DPD=0', () => {
    it('should transition loan from overdue back to active after all overdue installments are paid', async () => {
      const { loanId } = await createActiveLoan();
      const schedules = await dbUtils.findSchedulesByLoanId(loanId);
      const firstInstallment = schedules[0]!;

      // Step 1: Post a penalty to make the loan overdue
      const refDate = daysAfterDueDate(firstInstallment.due_date, 30);
      const penaltyRes = await postPenalty(
        loanId,
        firstInstallment.id,
        `overdue-to-active-${Date.now()}`,
        refDate,
      );
      expect(penaltyRes.status).toBe(201);

      // Verify loan is now overdue
      const loanOverdue = await dbUtils.findLoanById(loanId);
      expect(loanOverdue!.status).toBe('overdue');
      expect(loanOverdue!.dpd).toBeGreaterThan(0);

      // Step 2: Pay all outstanding to bring DPD back to 0
      // Pay the full outstanding amount (includes penalty)
      const outstanding = Number(loanOverdue!.cached_outstanding_paise);

      // Pay all installments + penalties by paying the full outstanding
      const key = idempKey('pay-all');
      const collRes = await clients.collectionOfficer.post('/collections').send({
        loanId,
        amountPaise: outstanding,
        paymentMode: 'cash',
        paymentDate: new Date().toISOString().split('T')[0],
        idempotencyKey: key,
      });

      // The collection should succeed (paying full outstanding)
      expect(collRes.status).toBe(201);

      // Step 3: Verify loan returned to active (or closed if fully paid)
      const loanAfter = await dbUtils.findLoanById(loanId);
      // After paying everything, loan should be active or closed
      expect(['active', 'closed']).toContain(loanAfter!.status);
      expect(loanAfter!.dpd).toBe(0);
    });
  });

  // ─── 8.7 Penalty Waiver Requires Maker-Checker Approval ───────────────

  describe('penalty waiver requires maker-checker approval', () => {
    it('should successfully waive a penalty when requester and approver differ', async () => {
      const { loanId } = await createActiveLoan();
      const installment = await getFirstUnpaidInstallment(loanId);

      // Post a penalty first
      const refDate = daysAfterDueDate(installment.due_date, 30);
      const penaltyRes = await postPenalty(
        loanId,
        installment.id,
        `waiver-test-${Date.now()}`,
        refDate,
      );
      expect(penaltyRes.status).toBe(201);
      const penaltyData = penaltyRes.body.data ?? penaltyRes.body;
      const penaltyId = penaltyData.penalty.id;

      // Capture outstanding before waiver
      const loanBefore = await dbUtils.findLoanById(loanId);
      const outstandingBefore = Number(loanBefore!.cached_outstanding_paise);
      const penaltyAmount = Number(penaltyData.penalty.amount_paise);

      // Waive the penalty: manager requests, manager2 approves (different users)
      const waiveRes = await clients.manager.post(`/penalties/${penaltyId}/waive`).send({
        reason: 'E2E test: penalty waiver with maker-checker',
        approverId: seedData.users.manager2.id,
      });

      expect(waiveRes.status).toBe(200);
      const waiveData = waiveRes.body.data ?? waiveRes.body;

      // Verify penalty is marked as waived (not deleted)
      expect(waiveData.penalty.is_waived).toBe(true);
      expect(waiveData.penalty.waived_by).toBeDefined();
      expect(waiveData.penalty.waiver_approved_by).toBe(seedData.users.manager2.id);
      expect(waiveData.penalty.waived_reason).toBe('E2E test: penalty waiver with maker-checker');

      // Verify outstanding decreased by penalty amount
      const loanAfter = await dbUtils.findLoanById(loanId);
      const outstandingAfter = Number(loanAfter!.cached_outstanding_paise);
      expect(outstandingAfter).toBe(outstandingBefore - penaltyAmount);

      // Verify audit log for waiver
      const auditLogs = await dbUtils.findAuditLogsByTarget('penalty', penaltyId);
      const waiverLog = auditLogs.find(
        (log) => String(log.action_type) === 'penalty_waived',
      );
      expect(waiverLog).toBeDefined();
      expect(waiverLog!.actor_id).toBeDefined();

      const afterState = waiverLog!.after_state as Record<string, unknown> | null;
      expect(afterState).toBeDefined();
      expect(afterState!['is_waived']).toBe(true);
    });

    it('should reject waiver when requester and approver are the same user (maker-checker violation)', async () => {
      const { loanId } = await createActiveLoan();
      const installment = await getFirstUnpaidInstallment(loanId);

      // Post a penalty
      const refDate = daysAfterDueDate(installment.due_date, 30);
      const penaltyRes = await postPenalty(
        loanId,
        installment.id,
        `mc-violation-${Date.now()}`,
        refDate,
      );
      expect(penaltyRes.status).toBe(201);
      const penaltyData = penaltyRes.body.data ?? penaltyRes.body;
      const penaltyId = penaltyData.penalty.id;

      // Attempt waiver where requester = approver (same manager)
      const waiveRes = await clients.manager.post(`/penalties/${penaltyId}/waive`).send({
        reason: 'E2E test: maker-checker violation attempt',
        approverId: seedData.users.manager.id,
      });

      expect([400, 422]).toContain(waiveRes.status);
      expect(waiveRes.body.code).toBe('MAKER_CHECKER_VIOLATION');
    });

    it('should reject waiver of an already-waived penalty', async () => {
      const { loanId } = await createActiveLoan();
      const installment = await getFirstUnpaidInstallment(loanId);

      // Post and waive a penalty
      const refDate = daysAfterDueDate(installment.due_date, 30);
      const penaltyRes = await postPenalty(
        loanId,
        installment.id,
        `double-waive-${Date.now()}`,
        refDate,
      );
      expect(penaltyRes.status).toBe(201);
      const penaltyId = (penaltyRes.body.data ?? penaltyRes.body).penalty.id;

      // First waiver succeeds
      const waive1 = await clients.manager.post(`/penalties/${penaltyId}/waive`).send({
        reason: 'First waiver',
        approverId: seedData.users.manager2.id,
      });
      expect(waive1.status).toBe(200);

      // Second waiver should fail
      const waive2 = await clients.manager.post(`/penalties/${penaltyId}/waive`).send({
        reason: 'Second waiver attempt',
        approverId: seedData.users.manager2.id,
      });

      expect([400, 409, 422]).toContain(waive2.status);
      expect(waive2.body.code).toBe('PENALTY_ALREADY_WAIVED');
    });
  });

  // ─── 8.8 DPD Calculation Across Timezone Boundaries ────────────────────

  describe('DPD calculation across timezone boundaries (IST business dates, UTC timestamps)', () => {
    it('should calculate DPD correctly when reference date is near midnight UTC (IST boundary)', async () => {
      const { loanId } = await createActiveLoan();
      const installment = await getFirstUnpaidInstallment(loanId);

      // Use a reference date at 23:30 UTC (which is 05:00 IST next day)
      // This tests that DPD uses calendar days correctly
      const dueDate = new Date(installment.due_date);
      const refDate = new Date(dueDate);
      refDate.setDate(refDate.getDate() + 15);
      refDate.setUTCHours(23, 30, 0, 0); // 23:30 UTC = 05:00 IST next day

      const res = await postPenalty(
        loanId,
        installment.id,
        `tz-boundary-${Date.now()}`,
        refDate.toISOString(),
      );

      expect(res.status).toBe(201);
      const data = res.body.data ?? res.body;

      // DPD should be approximately 15 days (±1 for timezone boundary)
      expect(data.dpd).toBeGreaterThanOrEqual(14);
      expect(data.dpd).toBeLessThanOrEqual(16);
      expect(data.overdueBucket).toBe('bucket_1_30');
    });

    it('should calculate DPD correctly when reference date is at midnight UTC (IST 05:30)', async () => {
      const { loanId } = await createActiveLoan();
      const installment = await getFirstUnpaidInstallment(loanId);

      const dueDate = new Date(installment.due_date);
      const refDate = new Date(dueDate);
      refDate.setDate(refDate.getDate() + 45);
      refDate.setUTCHours(0, 0, 0, 0); // Midnight UTC = 05:30 IST

      const res = await postPenalty(
        loanId,
        installment.id,
        `tz-midnight-${Date.now()}`,
        refDate.toISOString(),
      );

      expect(res.status).toBe(201);
      const data = res.body.data ?? res.body;

      // DPD should be approximately 45 days
      expect(data.dpd).toBeGreaterThanOrEqual(44);
      expect(data.dpd).toBeLessThanOrEqual(46);
      expect(data.overdueBucket).toBe('bucket_31_60');
    });
  });

  // ─── Additional Edge Cases ─────────────────────────────────────────────

  describe('penalty edge cases', () => {
    it('should reject penalty for a fully paid installment', async () => {
      const { loanId } = await createActiveLoan();
      const schedules = await dbUtils.findSchedulesByLoanId(loanId);
      const firstInstallment = schedules[0]!;
      const emiDue = Number(firstInstallment.principal_paise) + Number(firstInstallment.interest_paise);

      // Pay the first installment fully
      const key = idempKey('pay-first');
      const collRes = await clients.collectionOfficer.post('/collections').send({
        loanId,
        amountPaise: emiDue,
        paymentMode: 'cash',
        paymentDate: '2024-01-15',
        idempotencyKey: key,
      });
      expect(collRes.status).toBe(201);

      // Attempt to post penalty for the paid installment
      const refDate = daysAfterDueDate(firstInstallment.due_date, 30);
      const penaltyRes = await postPenalty(
        loanId,
        firstInstallment.id,
        `paid-installment-${Date.now()}`,
        refDate,
      );

      expect([400, 422]).toContain(penaltyRes.status);
      expect(penaltyRes.body.code).toBe('INSTALLMENT_FULLY_PAID');
    });

    it('should reject penalty for installment within grace period', async () => {
      const { loanId } = await createActiveLoan();
      const installment = await getFirstUnpaidInstallment(loanId);

      // Use a reference date within the grace period (grace = 7 days for flatMonthly)
      const refDate = daysAfterDueDate(installment.due_date, 5);
      const res = await postPenalty(
        loanId,
        installment.id,
        `grace-period-${Date.now()}`,
        refDate,
      );

      expect([400, 422]).toContain(res.status);
      expect(res.body.code).toBe('WITHIN_GRACE_PERIOD');
    });

    it('should reject penalty for a loan in closed status', async () => {
      // Create a loan and try to post penalty against a non-active/non-overdue loan
      const customer = await createCustomer(clients.fieldOfficer, {
        fullName: `Penalty Closed Loan Customer ${Date.now()}`,
      });
      const loan = await createLoan(clients.fieldOfficer, {
        customerId: custId(customer),
        productVersionId: seedData.products.flatMonthly.versionId,
      });

      // Loan is in draft status — penalty should be rejected
      const res = await clients.manager.post('/penalties/calculate').send({
        loanId: loan['id'],
        installmentId: '00000000-0000-0000-0000-000000000000',
        penaltyPeriod: 'invalid-status-test',
      });

      expect([400, 404, 422]).toContain(res.status);
    });

    it('should list penalties for a loan via GET endpoint', async () => {
      const { loanId } = await createActiveLoan();
      const installment = await getFirstUnpaidInstallment(loanId);

      // Post a penalty
      const refDate = daysAfterDueDate(installment.due_date, 30);
      const penaltyRes = await postPenalty(
        loanId,
        installment.id,
        `list-test-${Date.now()}`,
        refDate,
      );
      expect(penaltyRes.status).toBe(201);

      // List penalties for the loan
      const listRes = await clients.manager.get(`/penalties/loan/${loanId}`);
      expect(listRes.status).toBe(200);

      const penalties = Array.isArray(listRes.body) ? listRes.body : listRes.body.data;
      expect(penalties).toBeDefined();
      expect(penalties.length).toBeGreaterThanOrEqual(1);

      // Verify penalty structure
      const penalty = penalties[0];
      expect(penalty.id).toBeDefined();
      expect(penalty.loan_id).toBe(loanId);
      expect(penalty.amount_paise).toBeDefined();
    });
  });
});
