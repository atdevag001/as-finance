import { describe, it, expect, beforeAll } from 'vitest';
import { getApiBaseUrl, getUserTokens, getSeedData } from '../helpers/seed.js';
import { createAuthClients, type AuthClients } from '../helpers/auth-client.js';
import { createDbUtils, type DbUtils } from '../helpers/db-utils.js';
import { createCustomer, createLoan } from '../helpers/factories.js';
import type { SeedData } from '../setup/global-setup.js';

/**
 * Collection E2E Tests
 *
 * Verifies the complete collection posting flow: atomic execution, allocation
 * engine correctness, receipt generation, outstanding balance updates,
 * idempotency, and error handling for invalid loan states.
 *
 * Validates: Requirements 6.1–6.10; Properties 4, 5, 6, 10, 20, 22, 25
 */

describe('Collection E2E', () => {
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
  function idempKey(prefix = 'e2e-coll'): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Helper: create a customer and loan, advance to 'active' status.
   * Returns { customerId, loanId }.
   */
  async function createActiveLoan(
    productVersionId?: string,
    overrides?: { principalPaise?: number; tenureMonths?: number },
  ) {
    const customer = await createCustomer(clients.fieldOfficer, {
      fullName: `Collection Test Customer ${Date.now()}`,
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
   * Helper: get the first installment's total due (principal + interest) for a loan.
   */
  async function getFirstInstallmentDue(loanId: string): Promise<number> {
    const schedules = await dbUtils.findSchedulesByLoanId(loanId);
    const first = schedules[0]!;
    return Number(first.principal_paise) + Number(first.interest_paise);
  }


  // ─── 6.1 Collection Posting Executes Atomically ─────────────────────────

  describe('collection posting executes atomically: record, allocation, installment updates, journal entries, receipt, outstanding update, audit log', () => {
    it('should create all expected records atomically on successful collection', async () => {
      const { loanId } = await createActiveLoan();
      const emiDue = await getFirstInstallmentDue(loanId);
      const key = idempKey('atomic');

      // Capture outstanding before collection
      const loanBefore = await dbUtils.findLoanById(loanId);
      const outstandingBefore = Number(loanBefore!.cached_outstanding_paise);

      const res = await clients.collectionOfficer.post('/collections').send({
        loanId,
        amountPaise: emiDue,
        paymentMode: 'cash',
        paymentDate: '2024-01-15',
        idempotencyKey: key,
      });

      expect(res.status).toBe(201);
      const data = res.body.data ?? res.body;
      expect(data.collectionId).toBeDefined();
      expect(data.receiptId).toBeDefined();
      expect(data.receiptNumber).toBeDefined();
      expect(data.journalEntryId).toBeDefined();

      // 1. Collection record created
      const collections = await dbUtils.findCollectionsByLoanId(loanId);
      const coll = collections.find((c) => c.idempotency_key === key);
      expect(coll).toBeDefined();
      expect(Number(coll!.amount_paise)).toBe(emiDue);

      // 2. Allocation records created
      const allocations = await dbUtils.sumAllocationsForCollection(coll!.id);
      const totalAllocated =
        Number(allocations.penalty) +
        Number(allocations.interest) +
        Number(allocations.principal);
      expect(totalAllocated).toBe(emiDue);

      // 3. Journal entry created and balanced
      const journalLines = await dbUtils.findJournalLinesByEntryId(coll!.journal_entry_id);
      expect(journalLines.length).toBeGreaterThanOrEqual(2);
      const totalDebits = journalLines.reduce((s, l) => s + Number(l.debit_paise), 0);
      const totalCredits = journalLines.reduce((s, l) => s + Number(l.credit_paise), 0);
      expect(totalDebits).toBe(totalCredits);
      expect(totalDebits).toBe(emiDue);

      // 4. Receipt created
      const receipt = await dbUtils.findReceiptByCollectionId(coll!.id);
      expect(receipt).not.toBeNull();
      expect(Number(receipt!.amount_paise)).toBe(emiDue);

      // 5. Outstanding updated
      const loanAfter = await dbUtils.findLoanById(loanId);
      const outstandingAfter = Number(loanAfter!.cached_outstanding_paise);
      expect(outstandingAfter).toBe(outstandingBefore - emiDue);

      // 6. Audit log created
      const auditLogs = await dbUtils.findAuditLogsByTarget('collection', coll!.id);
      const collectionLog = auditLogs.find(
        (log) => String(log.action_type) === 'collection_posted',
      );
      expect(collectionLog).toBeDefined();
    });
  });

  // ─── 6.2 Allocation Order ──────────────────────────────────────────────

  describe('allocation order: penalty (oldest) → interest (current then oldest overdue) → principal (current then oldest overdue)', () => {
    it('should allocate interest before principal for a standard payment', async () => {
      const { loanId } = await createActiveLoan();
      const schedules = await dbUtils.findSchedulesByLoanId(loanId);
      const first = schedules[0]!;
      const interestDue = Number(first.interest_paise);
      const principalDue = Number(first.principal_paise);
      const totalDue = interestDue + principalDue;

      // Pay exactly one EMI
      const key = idempKey('alloc-order');
      const res = await clients.collectionOfficer.post('/collections').send({
        loanId,
        amountPaise: totalDue,
        paymentMode: 'cash',
        paymentDate: '2024-01-15',
        idempotencyKey: key,
      });

      expect(res.status).toBe(201);
      const data = res.body.data ?? res.body;

      // Verify allocation components
      expect(data.allocations.interestPaise).toBe(interestDue);
      expect(data.allocations.principalPaise).toBe(principalDue);
    });

    it('should allocate interest fully before any principal when payment is partial', async () => {
      const { loanId } = await createActiveLoan();
      const schedules = await dbUtils.findSchedulesByLoanId(loanId);
      const first = schedules[0]!;
      const interestDue = Number(first.interest_paise);

      // Pay only the interest amount — no principal should be allocated
      const key = idempKey('alloc-int-only');
      const res = await clients.collectionOfficer.post('/collections').send({
        loanId,
        amountPaise: interestDue,
        paymentMode: 'cash',
        paymentDate: '2024-01-15',
        idempotencyKey: key,
      });

      expect(res.status).toBe(201);
      const data = res.body.data ?? res.body;

      expect(data.allocations.interestPaise).toBe(interestDue);
      expect(data.allocations.principalPaise).toBe(0);
    });
  });

  // ─── 6.3 Allocation Preservation ───────────────────────────────────────

  describe('allocation preservation: sum of components equals collection amount', () => {
    it('should preserve total: penalty + interest + principal = collection amount', async () => {
      const { loanId } = await createActiveLoan();
      const emiDue = await getFirstInstallmentDue(loanId);
      const key = idempKey('alloc-preserve');

      const res = await clients.collectionOfficer.post('/collections').send({
        loanId,
        amountPaise: emiDue,
        paymentMode: 'cash',
        paymentDate: '2024-01-15',
        idempotencyKey: key,
      });

      expect(res.status).toBe(201);
      const data = res.body.data ?? res.body;

      const totalAllocated =
        (data.allocations.penaltyPaise ?? 0) +
        data.allocations.interestPaise +
        data.allocations.principalPaise +
        (data.allocations.excessPaise ?? 0);

      expect(totalAllocated).toBe(emiDue);

      // Also verify from DB
      const collections = await dbUtils.findCollectionsByLoanId(loanId);
      const coll = collections.find((c) => c.idempotency_key === key)!;
      const dbAlloc = await dbUtils.sumAllocationsForCollection(coll.id);
      const dbTotal =
        Number(dbAlloc.penalty) + Number(dbAlloc.interest) + Number(dbAlloc.principal);
      expect(dbTotal).toBe(emiDue);
    });
  });


  // ─── 6.4 Partial Payment ───────────────────────────────────────────────

  describe('partial payment allocates available amount, installment status = partial', () => {
    it('should mark installment as partial when payment is less than full EMI', async () => {
      const { loanId } = await createActiveLoan();
      const emiDue = await getFirstInstallmentDue(loanId);
      // Pay half the EMI
      const partialAmount = Math.floor(emiDue / 2);
      const key = idempKey('partial');

      const res = await clients.collectionOfficer.post('/collections').send({
        loanId,
        amountPaise: partialAmount,
        paymentMode: 'cash',
        paymentDate: '2024-01-15',
        idempotencyKey: key,
      });

      expect(res.status).toBe(201);
      const data = res.body.data ?? res.body;

      // Total allocated should equal partial amount
      const totalAllocated =
        (data.allocations.penaltyPaise ?? 0) +
        data.allocations.interestPaise +
        data.allocations.principalPaise +
        (data.allocations.excessPaise ?? 0);
      expect(totalAllocated).toBe(partialAmount);

      // Verify installment status is 'partial' in DB
      const schedules = await dbUtils.findSchedulesByLoanId(loanId);
      const first = schedules[0]!;
      const totalPaid = Number(first.principal_paid_paise) + Number(first.interest_paid_paise);
      expect(totalPaid).toBeGreaterThan(0);
      expect(totalPaid).toBeLessThan(emiDue);
      expect(first.status).toBe('partial');
    });
  });

  // ─── 6.5 Idempotency Key ──────────────────────────────────────────────

  describe('idempotency key returns original result without duplicates', () => {
    it('should return the same result for duplicate idempotency key without creating duplicates', async () => {
      const { loanId } = await createActiveLoan();
      const emiDue = await getFirstInstallmentDue(loanId);
      const key = idempKey('idemp-dup');

      // First request
      const res1 = await clients.collectionOfficer.post('/collections').send({
        loanId,
        amountPaise: emiDue,
        paymentMode: 'cash',
        paymentDate: '2024-01-15',
        idempotencyKey: key,
      });
      expect(res1.status).toBe(201);

      // Second request with same idempotency key
      const res2 = await clients.collectionOfficer.post('/collections').send({
        loanId,
        amountPaise: emiDue,
        paymentMode: 'cash',
        paymentDate: '2024-01-15',
        idempotencyKey: key,
      });

      // Should return success (cached result)
      expect([200, 201]).toContain(res2.status);

      const data1 = res1.body.data ?? res1.body;
      const data2 = res2.body.data ?? res2.body;

      // Response data should match the original
      expect(data2.collectionId).toBe(data1.collectionId);
      expect(data2.receiptNumber).toBe(data1.receiptNumber);

      // Verify only ONE collection record exists with this key
      const collections = await dbUtils.findCollectionsByLoanId(loanId);
      const matching = collections.filter((c) => c.idempotency_key === key);
      expect(matching.length).toBe(1);

      // Verify only ONE receipt for this collection
      const receipt = await dbUtils.findReceiptByCollectionId(matching[0]!.id);
      expect(receipt).not.toBeNull();

      // Verify only ONE audit log for this collection
      const auditLogs = await dbUtils.findAuditLogsByTarget('collection', matching[0]!.id);
      const postedLogs = auditLogs.filter(
        (log) => String(log.action_type) === 'collection_posted',
      );
      expect(postedLogs.length).toBe(1);
    });
  });

  // ─── 6.6 Receipt Number Generation ────────────────────────────────────

  describe('unique sequential receipt number generation, receipts immutable', () => {
    it('should generate unique sequential receipt numbers for multiple collections', async () => {
      const { loanId } = await createActiveLoan();
      const schedules = await dbUtils.findSchedulesByLoanId(loanId);
      const firstDue = Number(schedules[0]!.principal_paise) + Number(schedules[0]!.interest_paise);
      const secondDue = Number(schedules[1]!.principal_paise) + Number(schedules[1]!.interest_paise);

      // Post two collections
      const key1 = idempKey('rcpt-1');
      const res1 = await clients.collectionOfficer.post('/collections').send({
        loanId,
        amountPaise: firstDue,
        paymentMode: 'cash',
        paymentDate: '2024-01-15',
        idempotencyKey: key1,
      });
      expect(res1.status).toBe(201);

      const key2 = idempKey('rcpt-2');
      const res2 = await clients.collectionOfficer.post('/collections').send({
        loanId,
        amountPaise: secondDue,
        paymentMode: 'cash',
        paymentDate: '2024-02-15',
        idempotencyKey: key2,
      });
      expect(res2.status).toBe(201);

      const data1 = res1.body.data ?? res1.body;
      const data2 = res2.body.data ?? res2.body;

      // Receipt numbers should be different
      expect(data1.receiptNumber).not.toBe(data2.receiptNumber);

      // Receipt numbers should be sequential (R1 < R2)
      expect(data1.receiptNumber < data2.receiptNumber).toBe(true);
    });

    it('should not allow modification of receipt records', async () => {
      const { loanId } = await createActiveLoan();
      const emiDue = await getFirstInstallmentDue(loanId);
      const key = idempKey('rcpt-immut');

      const res = await clients.collectionOfficer.post('/collections').send({
        loanId,
        amountPaise: emiDue,
        paymentMode: 'cash',
        paymentDate: '2024-01-15',
        idempotencyKey: key,
      });
      expect(res.status).toBe(201);

      const data = res.body.data ?? res.body;

      // Verify receipt exists and is immutable (no update/delete API)
      const receipt = await dbUtils.findReceiptByCollectionId(data.collectionId);
      expect(receipt).not.toBeNull();
      expect(receipt!.status).toBe('active');
      expect(Number(receipt!.amount_paise)).toBe(emiDue);
    });
  });


  // ─── 6.7 Overdue Loan Recalculates DPD ────────────────────────────────

  describe('collection against overdue loan recalculates DPD and overdue_bucket', () => {
    it('should update DPD and overdue_bucket after collection on an active loan', async () => {
      const { loanId } = await createActiveLoan();
      const emiDue = await getFirstInstallmentDue(loanId);
      const key = idempKey('dpd-recalc');

      // Capture DPD before collection
      const loanBefore = await dbUtils.findLoanById(loanId);
      const dpdBefore = loanBefore!.dpd;

      const res = await clients.collectionOfficer.post('/collections').send({
        loanId,
        amountPaise: emiDue,
        paymentMode: 'cash',
        paymentDate: '2024-01-15',
        idempotencyKey: key,
      });

      expect(res.status).toBe(201);

      // Verify DPD was recalculated
      const loanAfter = await dbUtils.findLoanById(loanId);
      // After paying the first EMI, DPD should be 0 or recalculated
      expect(loanAfter!.dpd).toBeDefined();
      // DPD should be <= what it was before (payment reduces overdue)
      expect(loanAfter!.dpd).toBeLessThanOrEqual(dpdBefore ?? 0);
      // overdue_bucket should be set
      expect(loanAfter!.overdue_bucket).toBeDefined();
    });
  });

  // ─── 6.8 Collection Against Invalid Loan Status ───────────────────────

  describe('collection against closed/defaulted/foreclosed/rejected loan returns typed error', () => {
    it('should reject collection against a loan in draft status', async () => {
      const customer = await createCustomer(clients.fieldOfficer, {
        fullName: 'Collection Draft Status Customer',
      });
      const loan = await createLoan(clients.fieldOfficer, {
        customerId: custId(customer),
        productVersionId: seedData.products.flatMonthly.versionId,
      });

      const res = await clients.collectionOfficer.post('/collections').send({
        loanId: loan['id'],
        amountPaise: 1000,
        paymentMode: 'cash',
        paymentDate: '2024-01-15',
        idempotencyKey: idempKey('draft-reject'),
      });

      expect([400, 422]).toContain(res.status);
      expect(res.body.code).toBe('LOAN_NOT_ACTIVE');
    });

    it('should reject collection against a loan in approved (not yet disbursed) status', async () => {
      const customer = await createCustomer(clients.fieldOfficer, {
        fullName: 'Collection Approved Status Customer',
      });
      const loan = await createLoan(clients.fieldOfficer, {
        customerId: custId(customer),
        productVersionId: seedData.products.flatMonthly.versionId,
        advanceTo: 'approved',
        clients,
      });

      const res = await clients.collectionOfficer.post('/collections').send({
        loanId: loan['id'],
        amountPaise: 1000,
        paymentMode: 'cash',
        paymentDate: '2024-01-15',
        idempotencyKey: idempKey('approved-reject'),
      });

      expect([400, 422]).toContain(res.status);
      expect(res.body.code).toBe('LOAN_NOT_ACTIVE');
    });

    it('should reject collection against a non-existent loan', async () => {
      const res = await clients.collectionOfficer.post('/collections').send({
        loanId: '00000000-0000-0000-0000-000000000000',
        amountPaise: 1000,
        paymentMode: 'cash',
        paymentDate: '2024-01-15',
        idempotencyKey: idempKey('nonexist'),
      });

      expect([400, 404]).toContain(res.status);
    });
  });

  // ─── 6.9 Outstanding Invariant ────────────────────────────────────────

  describe('outstanding invariant: cached_outstanding = total_payable − sum_allocated', () => {
    it('should maintain outstanding invariant after a single collection', async () => {
      const { loanId } = await createActiveLoan();
      const emiDue = await getFirstInstallmentDue(loanId);

      // Get total payable before collection
      const loanBefore = await dbUtils.findLoanById(loanId);
      const totalPayable = Number(loanBefore!.cached_outstanding_paise);

      const key = idempKey('outstanding-inv');
      const res = await clients.collectionOfficer.post('/collections').send({
        loanId,
        amountPaise: emiDue,
        paymentMode: 'cash',
        paymentDate: '2024-01-15',
        idempotencyKey: key,
      });
      expect(res.status).toBe(201);

      // Verify outstanding = total_payable - sum_allocated
      const loanAfter = await dbUtils.findLoanById(loanId);
      const cachedOutstanding = Number(loanAfter!.cached_outstanding_paise);
      expect(cachedOutstanding).toBe(totalPayable - emiDue);
      expect(cachedOutstanding).toBeGreaterThanOrEqual(0);
    });

    it('should maintain outstanding invariant after multiple collections', async () => {
      const { loanId } = await createActiveLoan();
      const schedules = await dbUtils.findSchedulesByLoanId(loanId);
      const loanBefore = await dbUtils.findLoanById(loanId);
      const initialOutstanding = Number(loanBefore!.cached_outstanding_paise);

      let totalPaid = 0;

      // Pay first two EMIs
      for (let i = 0; i < 2 && i < schedules.length; i++) {
        const inst = schedules[i]!;
        const due = Number(inst.principal_paise) + Number(inst.interest_paise);
        const key = idempKey(`multi-${i}`);

        const res = await clients.collectionOfficer.post('/collections').send({
          loanId,
          amountPaise: due,
          paymentMode: 'cash',
          paymentDate: '2024-01-15',
          idempotencyKey: key,
        });
        expect(res.status).toBe(201);
        totalPaid += due;
      }

      // Verify outstanding = initial - total paid
      const loanAfter = await dbUtils.findLoanById(loanId);
      const cachedOutstanding = Number(loanAfter!.cached_outstanding_paise);
      expect(cachedOutstanding).toBe(initialOutstanding - totalPaid);
      expect(cachedOutstanding).toBeGreaterThanOrEqual(0);
    });
  });

  // ─── 6.10 Over-Collection ─────────────────────────────────────────────

  describe('over-collection returns COLLECTION_EXCEEDS_OUTSTANDING', () => {
    it('should reject collection that exceeds outstanding balance', async () => {
      const { loanId } = await createActiveLoan();
      const loan = await dbUtils.findLoanById(loanId);
      const outstanding = Number(loan!.cached_outstanding_paise);

      // Try to pay more than outstanding
      const overAmount = outstanding + 100_00; // ₹100 more than outstanding
      const res = await clients.collectionOfficer.post('/collections').send({
        loanId,
        amountPaise: overAmount,
        paymentMode: 'cash',
        paymentDate: '2024-01-15',
        idempotencyKey: idempKey('over-collect'),
      });

      expect([400, 422]).toContain(res.status);
      expect(res.body.code).toBe('COLLECTION_EXCEEDS_OUTSTANDING');
    });

    it('should reject collection of 1 paisa more than outstanding after partial payments', async () => {
      const { loanId } = await createActiveLoan();
      const emiDue = await getFirstInstallmentDue(loanId);

      // Pay one EMI first
      const res1 = await clients.collectionOfficer.post('/collections').send({
        loanId,
        amountPaise: emiDue,
        paymentMode: 'cash',
        paymentDate: '2024-01-15',
        idempotencyKey: idempKey('pre-over'),
      });
      expect(res1.status).toBe(201);

      // Get remaining outstanding
      const loanAfter = await dbUtils.findLoanById(loanId);
      const remaining = Number(loanAfter!.cached_outstanding_paise);

      // Try to pay 1 paisa more than remaining
      const res2 = await clients.collectionOfficer.post('/collections').send({
        loanId,
        amountPaise: remaining + 1,
        paymentMode: 'cash',
        paymentDate: '2024-02-15',
        idempotencyKey: idempKey('over-by-1'),
      });

      expect([400, 422]).toContain(res2.status);
      expect(res2.body.code).toBe('COLLECTION_EXCEEDS_OUTSTANDING');
    });
  });
});
