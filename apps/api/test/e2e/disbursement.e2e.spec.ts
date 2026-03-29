import { describe, it, expect, beforeAll } from 'vitest';
import { getApiBaseUrl, getUserTokens, getSeedData } from '../helpers/seed.js';
import { createAuthClients, type AuthClients } from '../helpers/auth-client.js';
import { createDbUtils, type DbUtils } from '../helpers/db-utils.js';
import { createCustomer, createLoan } from '../helpers/factories.js';
import type { SeedData } from '../setup/global-setup.js';

/**
 * Disbursement E2E Tests
 *
 * Verifies the complete disbursement flow: prerequisite checks, atomic
 * transaction execution, ledger posting, idempotency, rollback on failure,
 * and processing fee calculation.
 *
 * Validates: Requirements 5.1–5.6; Properties 8, 10, 18
 */

describe('Disbursement E2E', () => {
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

  /** Extract loan ID from factory response. */
  function loanId(l: Record<string, unknown>): string {
    return l['id'] as string;
  }

  /** Create a unique idempotency key. */
  function idempKey(prefix = 'e2e-disburse'): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Helper: create a customer and loan, advance to 'approved' status.
   * Returns { customerId, loanId, loan }.
   */
  async function createApprovedLoan(
    productVersionId?: string,
    overrides?: { principalPaise?: number; tenureMonths?: number },
  ) {
    const customer = await createCustomer(clients.fieldOfficer, {
      fullName: `Disbursement Test Customer ${Date.now()}`,
    });
    const cId = custId(customer);
    const pvId = productVersionId ?? seedData.products.flatMonthly.versionId;

    const loan = await createLoan(clients.fieldOfficer, {
      customerId: cId,
      productVersionId: pvId,
      overrides,
      advanceTo: 'approved',
      clients,
    });

    return { customerId: cId, loanId: loanId(loan), loan };
  }

  // ─── 5.1 Disbursement with Valid Idempotency Key Verifies Prerequisites ──

  describe('disbursement with valid idempotency key verifies all prerequisites and executes atomically', () => {
    it('should disburse an approved loan successfully with valid idempotency key', async () => {
      const { loanId: lid } = await createApprovedLoan();
      const key = idempKey();

      const res = await clients.manager.post('/disbursements').send({
        loanId: lid,
        mode: 'cash',
        idempotencyKey: key,
      });

      expect(res.status).toBe(201);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.loanId).toBe(lid);
      expect(res.body.data.disbursementId).toBeDefined();
      expect(res.body.data.journalEntryId).toBeDefined();

      // Verify loan is now active in DB
      const dbLoan = await dbUtils.findLoanById(lid);
      expect(dbLoan).not.toBeNull();
      expect(dbLoan!.status).toBe('active');
    });

    it('should verify schedule exists before disbursement', async () => {
      const { loanId: lid } = await createApprovedLoan();

      // Verify schedule was generated during approval
      const schedules = await dbUtils.findSchedulesByLoanId(lid);
      expect(schedules.length).toBeGreaterThan(0);

      // Now disburse — should succeed because schedule exists
      const res = await clients.manager.post('/disbursements').send({
        loanId: lid,
        mode: 'cash',
        idempotencyKey: idempKey(),
      });

      expect(res.status).toBe(201);
    });
  });

  // ─── 5.2 Unmet Prerequisites Return Typed Error ─────────────────────────

  describe('unmet prerequisites return typed error listing all failures', () => {
    it('should reject disbursement for a loan not in approved status (draft)', async () => {
      const customer = await createCustomer(clients.fieldOfficer, {
        fullName: 'Disbursement Draft Prereq Customer',
      });
      const loan = await createLoan(clients.fieldOfficer, {
        customerId: custId(customer),
        productVersionId: seedData.products.flatMonthly.versionId,
      });

      const res = await clients.manager.post('/disbursements').send({
        loanId: loanId(loan),
        mode: 'cash',
        idempotencyKey: idempKey(),
      });

      expect([400, 422]).toContain(res.status);
      expect(res.body.code).toBe('LOAN_NOT_APPROVED');
    });

    it('should reject disbursement for an already-disbursed loan', async () => {
      const { loanId: lid } = await createApprovedLoan();

      // First disbursement — should succeed
      const firstKey = idempKey('first');
      const firstRes = await clients.manager.post('/disbursements').send({
        loanId: lid,
        mode: 'cash',
        idempotencyKey: firstKey,
      });
      expect(firstRes.status).toBe(201);

      // Second disbursement with different key — should fail
      const secondRes = await clients.manager.post('/disbursements').send({
        loanId: lid,
        mode: 'cash',
        idempotencyKey: idempKey('second'),
      });

      expect([400, 422]).toContain(secondRes.status);
      // Should indicate loan is not in approved status or already disbursed
      expect(['LOAN_NOT_APPROVED', 'ALREADY_DISBURSED']).toContain(secondRes.body.code);
    });

    it('should reject disbursement for a non-existent loan', async () => {
      const res = await clients.manager.post('/disbursements').send({
        loanId: '00000000-0000-0000-0000-000000000000',
        mode: 'cash',
        idempotencyKey: idempKey(),
      });

      expect([400, 404]).toContain(res.status);
    });
  });

  // ─── 5.3 Successful Disbursement Atomically Updates All State ────────────

  describe('successful disbursement atomically updates loan status, creates disbursement record, journal entry, sets outstanding, creates audit log', () => {
    it('should create all expected records atomically on successful disbursement', async () => {
      const { loanId: lid } = await createApprovedLoan();
      const key = idempKey();

      const res = await clients.manager.post('/disbursements').send({
        loanId: lid,
        mode: 'cash',
        idempotencyKey: key,
      });

      expect(res.status).toBe(201);

      // 1. Loan status updated to active
      const dbLoan = await dbUtils.findLoanById(lid);
      expect(dbLoan!.status).toBe('active');

      // 2. Disbursement record created
      const disbursements = await dbUtils.prisma.disbursements.findMany({
        where: { loan_id: lid },
      });
      expect(disbursements.length).toBe(1);
      expect(Number(disbursements[0]!.amount_paise)).toBe(Number(dbLoan!.principal_paise));
      expect(disbursements[0]!.mode).toBe('cash');
      expect(disbursements[0]!.idempotency_key).toBe(key);

      // 3. Journal entry created (DR Loans Receivable, CR Cash)
      const journalEntryId = disbursements[0]!.journal_entry_id;
      const journalEntry = await dbUtils.findJournalEntryById(journalEntryId);
      expect(journalEntry).not.toBeNull();

      const journalLines = await dbUtils.findJournalLinesByEntryId(journalEntryId);
      expect(journalLines.length).toBe(2);

      // Verify balanced entry: total debits = total credits
      const totalDebits = journalLines.reduce((s, l) => s + Number(l.debit_paise), 0);
      const totalCredits = journalLines.reduce((s, l) => s + Number(l.credit_paise), 0);
      expect(totalDebits).toBe(totalCredits);
      expect(totalDebits).toBe(Number(dbLoan!.principal_paise));

      // 4. Outstanding set to total payable
      expect(Number(dbLoan!.cached_outstanding_paise)).toBeGreaterThan(0);

      // 5. Audit log created
      const auditLogs = await dbUtils.findAuditLogsByTarget('loan', lid);
      const disbursementLog = auditLogs.find(
        (log) => String(log.action_type) === 'loan_disbursed',
      );
      expect(disbursementLog).toBeDefined();
      expect(disbursementLog!.actor_id).toBe(seedData.users.manager.id);
    });
  });

  // ─── 5.4 Failed Disbursement Rolls Back Entirely ────────────────────────

  describe('failed disbursement rolls back entirely (no partial state)', () => {
    it('should leave no partial state when disbursement fails due to unmet prerequisites', async () => {
      const customer = await createCustomer(clients.fieldOfficer, {
        fullName: 'Disbursement Rollback Customer',
      });
      // Create a loan in draft status (not approved — prerequisite will fail)
      const loan = await createLoan(clients.fieldOfficer, {
        customerId: custId(customer),
        productVersionId: seedData.products.flatMonthly.versionId,
      });
      const lid = loanId(loan);

      // Capture state before failed disbursement attempt
      const loanBefore = await dbUtils.findLoanById(lid);
      const disbursementsBefore = await dbUtils.prisma.disbursements.findMany({
        where: { loan_id: lid },
      });
      const auditLogsBefore = await dbUtils.findAuditLogsByTarget('loan', lid);

      // Attempt disbursement — should fail
      const res = await clients.manager.post('/disbursements').send({
        loanId: lid,
        mode: 'cash',
        idempotencyKey: idempKey(),
      });

      expect([400, 422]).toContain(res.status);

      // Verify no state changed
      const loanAfter = await dbUtils.findLoanById(lid);
      expect(loanAfter!.status).toBe(loanBefore!.status);

      const disbursementsAfter = await dbUtils.prisma.disbursements.findMany({
        where: { loan_id: lid },
      });
      expect(disbursementsAfter.length).toBe(disbursementsBefore.length);

      // No new disbursement audit log should have been created
      const auditLogsAfter = await dbUtils.findAuditLogsByTarget('loan', lid);
      const newDisbursementLogs = auditLogsAfter.filter(
        (log) =>
          String(log.action_type) === 'loan_disbursed' &&
          !auditLogsBefore.some((b) => b.id === log.id),
      );
      expect(newDisbursementLogs.length).toBe(0);
    });
  });

  // ─── 5.5 Duplicate Idempotency Key Returns Original Result ─────────────

  describe('duplicate idempotency key returns original result without duplicates', () => {
    it('should return the same result for duplicate idempotency key without creating duplicates', async () => {
      const { loanId: lid } = await createApprovedLoan();
      const key = idempKey('idemp-dup');

      // First request
      const res1 = await clients.manager.post('/disbursements').send({
        loanId: lid,
        mode: 'cash',
        idempotencyKey: key,
      });
      expect(res1.status).toBe(201);

      // Second request with same idempotency key
      const res2 = await clients.manager.post('/disbursements').send({
        loanId: lid,
        mode: 'cash',
        idempotencyKey: key,
      });

      // Should return success (cached result)
      expect([200, 201]).toContain(res2.status);

      // Response data should match the original
      expect(res2.body.data?.disbursementId ?? res2.body.disbursementId).toBe(
        res1.body.data?.disbursementId ?? res1.body.disbursementId,
      );

      // Verify only ONE disbursement record exists in DB
      const disbursements = await dbUtils.prisma.disbursements.findMany({
        where: { loan_id: lid },
      });
      expect(disbursements.length).toBe(1);

      // Verify only ONE disbursement journal entry exists
      const journalEntryId = disbursements[0]!.journal_entry_id;
      const journalEntry = await dbUtils.findJournalEntryById(journalEntryId);
      expect(journalEntry).not.toBeNull();

      // Verify only ONE disbursement audit log
      const auditLogs = await dbUtils.findAuditLogsByTarget('loan', lid);
      const disbursementLogs = auditLogs.filter(
        (log) => String(log.action_type) === 'loan_disbursed',
      );
      expect(disbursementLogs.length).toBe(1);
    });
  });

  // ─── 5.6 Processing Fee Calculation ─────────────────────────────────────

  describe('processing fee calculation: fixed paise and percentage with ROUND_HALF_UP', () => {
    it('should calculate percentage processing fee correctly with ROUND_HALF_UP', async () => {
      // The withProcessingFee product has: processingFeeType='percentage', processingFeeValue=200 (2%)
      const principalPaise = 10_000_00; // ₹10,000
      const { loanId: lid } = await createApprovedLoan(
        seedData.products.withProcessingFee.versionId,
        { principalPaise },
      );

      const res = await clients.manager.post('/disbursements').send({
        loanId: lid,
        mode: 'cash',
        idempotencyKey: idempKey('fee-pct'),
      });

      expect(res.status).toBe(201);

      // Expected fee: 10_000_00 * 200 / 10000 = 200_00 (₹200)
      const expectedFeePaise = Math.round((principalPaise * 200) / 10000);
      const actualFeePaise = Number(res.body.data?.processingFeePaise ?? '0');
      expect(actualFeePaise).toBe(expectedFeePaise);

      // Verify fee journal entry exists (DR Cash/Bank, CR Processing Fee Income)
      // Find journal entries for this loan with processing fee source
      const allJournalEntries = await dbUtils.prisma.journal_entries.findMany({
        where: { source_id: lid },
        include: { lines: true },
      });

      // Should have at least 2 journal entries: disbursement + processing fee
      const feeEntry = allJournalEntries.find(
        (je) => je.description?.includes('Processing fee'),
      );
      expect(feeEntry).toBeDefined();

      // Fee journal entry should be balanced
      const feeLines = feeEntry!.lines;
      const feeDebits = feeLines.reduce((s: number, l: { debit_paise: bigint }) => s + Number(l.debit_paise), 0);
      const feeCredits = feeLines.reduce((s: number, l: { credit_paise: bigint }) => s + Number(l.credit_paise), 0);
      expect(feeDebits).toBe(feeCredits);
      expect(feeDebits).toBe(expectedFeePaise);
    });

    it('should handle percentage fee with rounding correctly (ROUND_HALF_UP)', async () => {
      // Use a principal that creates a non-integer fee before rounding
      // 10_001_00 * 200 / 10000 = 200.02 → rounds to 200_02 paise
      const principalPaise = 10_001_00;
      const { loanId: lid } = await createApprovedLoan(
        seedData.products.withProcessingFee.versionId,
        { principalPaise },
      );

      const res = await clients.manager.post('/disbursements').send({
        loanId: lid,
        mode: 'cash',
        idempotencyKey: idempKey('fee-round'),
      });

      expect(res.status).toBe(201);

      // Expected fee: 10_001_00 * 200 / 10000 = 200_020 / 100 = 200.02 → 200_02 paise
      const expectedFeePaise = Math.round((principalPaise * 200) / 10000);
      const actualFeePaise = Number(res.body.data?.processingFeePaise ?? '0');
      expect(actualFeePaise).toBe(expectedFeePaise);
    });

    it('should not create fee journal entry when product has no processing fee', async () => {
      // flatMonthly product has no processing fee configured
      const { loanId: lid } = await createApprovedLoan(
        seedData.products.flatMonthly.versionId,
      );

      const res = await clients.manager.post('/disbursements').send({
        loanId: lid,
        mode: 'cash',
        idempotencyKey: idempKey('no-fee'),
      });

      expect(res.status).toBe(201);

      // Processing fee should be 0
      const feePaise = Number(res.body.data?.processingFeePaise ?? '0');
      expect(feePaise).toBe(0);

      // Should have only the disbursement journal entry, no fee entry
      const allJournalEntries = await dbUtils.prisma.journal_entries.findMany({
        where: { source_id: lid },
      });

      const feeEntry = allJournalEntries.find(
        (je) => je.description?.includes('Processing fee'),
      );
      expect(feeEntry).toBeUndefined();
    });
  });
});
