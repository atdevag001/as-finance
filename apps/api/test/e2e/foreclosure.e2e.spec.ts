import { describe, it, expect, beforeAll } from 'vitest';
import { getApiBaseUrl, getUserTokens, getSeedData } from '../helpers/seed.js';
import { createAuthClients, type AuthClients } from '../helpers/auth-client.js';
import { createDbUtils, type DbUtils } from '../helpers/db-utils.js';
import { createCustomer, createLoan, postCollection } from '../helpers/factories.js';
import type { SeedData } from '../setup/global-setup.js';

/**
 * Foreclosure E2E Tests
 *
 * Verifies the complete foreclosure flow: quote generation with itemized
 * settlement calculation, 24-hour quote validity, atomic settlement execution,
 * transaction rollback on failure, and maker-checker enforcement.
 *
 * Validates: Requirements 9.1–9.5; Property 15
 */

describe('Foreclosure E2E', () => {
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
  function idempKey(prefix = 'e2e-fc'): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Helper: create a customer and loan, advance to 'active' status,
   * optionally pay some EMIs. Returns { customerId, loanId }.
   */
  async function createActiveLoan(opts?: { payEmiCount?: number }) {
    const customer = await createCustomer(clients.fieldOfficer, {
      fullName: `Foreclosure Test Customer ${Date.now()}`,
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

    // Optionally pay some EMIs
    if (opts?.payEmiCount) {
      const schedules = await dbUtils.findSchedulesByLoanId(loanId);
      for (let i = 0; i < opts.payEmiCount && i < schedules.length; i++) {
        const inst = schedules[i]!;
        const due = Number(inst.principal_paise) + Number(inst.interest_paise);
        await postCollection(clients.collectionOfficer, {
          loanId,
          amountPaise: due,
          overrides: { paymentDate: '2024-01-15' },
        });
      }
    }

    return { customerId: cId, loanId, loan };
  }


  // ─── 9.1 Foreclosure Quote Calculation ──────────────────────────────────

  describe('foreclosure quote calculates: outstanding principal + accrued interest + pending penalties − rebate', () => {
    it('should return an itemized quote with all settlement components', async () => {
      const { loanId } = await createActiveLoan({ payEmiCount: 2 });

      const res = await clients.manager.post('/foreclosures/quote').send({
        loanId,
      });

      expect(res.status).toBe(201);
      const data = res.body;

      // All components must be present and non-negative
      expect(data.outstandingPrincipalPaise).toBeDefined();
      expect(data.outstandingPrincipalPaise).toBeGreaterThan(0);
      expect(data.accruedInterestPaise).toBeDefined();
      expect(data.accruedInterestPaise).toBeGreaterThanOrEqual(0);
      expect(data.pendingPenaltiesPaise).toBeDefined();
      expect(data.pendingPenaltiesPaise).toBeGreaterThanOrEqual(0);
      expect(data.rebatePaise).toBeDefined();
      expect(data.rebatePaise).toBeGreaterThanOrEqual(0);
      expect(data.settlementAmountPaise).toBeDefined();
      expect(data.settlementAmountPaise).toBeGreaterThan(0);

      // Verify formula: settlement = principal + interest + penalties - rebate
      const expectedSettlement =
        data.outstandingPrincipalPaise +
        data.accruedInterestPaise +
        data.pendingPenaltiesPaise -
        data.rebatePaise;
      expect(data.settlementAmountPaise).toBe(Math.max(0, expectedSettlement));

      // Quote metadata
      expect(data.foreclosureId).toBeDefined();
      expect(data.loanId).toBe(loanId);
      expect(data.quoteExpiresAt).toBeDefined();
      expect(data.status).toBe('quote');
    });

    it('should apply rebate and reduce settlement amount', async () => {
      const { loanId } = await createActiveLoan({ payEmiCount: 1 });
      const rebateAmount = 500; // 5 INR rebate

      const res = await clients.manager.post('/foreclosures/quote').send({
        loanId,
        rebatePaise: rebateAmount,
        rebateReason: 'Good repayment history',
      });

      expect(res.status).toBe(201);
      const data = res.body;

      expect(data.rebatePaise).toBe(rebateAmount);

      // Settlement should be reduced by the rebate
      const grossTotal =
        data.outstandingPrincipalPaise +
        data.accruedInterestPaise +
        data.pendingPenaltiesPaise;
      expect(data.settlementAmountPaise).toBe(Math.max(0, grossTotal - rebateAmount));
    });

    it('should reject quote for a loan not in active/overdue status', async () => {
      // Create a loan in draft status (not advanced)
      const customer = await createCustomer(clients.fieldOfficer, {
        fullName: `FC Draft Status ${Date.now()}`,
      });
      const loan = await createLoan(clients.fieldOfficer, {
        customerId: custId(customer),
        productVersionId: seedData.products.flatMonthly.versionId,
      });

      const res = await clients.manager.post('/foreclosures/quote').send({
        loanId: loan['id'],
      });

      expect([400, 422]).toContain(res.status);
      expect(res.body.code).toBe('INVALID_LOAN_STATUS_FOR_FORECLOSURE');
    });
  });

  // ─── 9.2 Quote 24-Hour Validity ────────────────────────────────────────

  describe('quote has 24-hour validity, expired quote rejected', () => {
    it('should set quote expiry to 24 hours from creation', async () => {
      const { loanId } = await createActiveLoan({ payEmiCount: 1 });
      const beforeCreate = Date.now();

      const res = await clients.manager.post('/foreclosures/quote').send({
        loanId,
      });

      expect(res.status).toBe(201);
      const data = res.body;

      const expiresAt = new Date(data.quoteExpiresAt).getTime();
      const afterCreate = Date.now();

      // Expiry should be approximately 24 hours from now (within 5 seconds tolerance)
      const twentyFourHoursMs = 24 * 60 * 60 * 1000;
      expect(expiresAt).toBeGreaterThanOrEqual(beforeCreate + twentyFourHoursMs - 5000);
      expect(expiresAt).toBeLessThanOrEqual(afterCreate + twentyFourHoursMs + 5000);
    });

    it('should reject execution of an expired quote via direct DB manipulation', async () => {
      const { loanId } = await createActiveLoan({ payEmiCount: 1 });

      // Create a valid quote
      const quoteRes = await clients.manager.post('/foreclosures/quote').send({
        loanId,
      });
      expect(quoteRes.status).toBe(201);
      const foreclosureId = quoteRes.body.foreclosureId;

      // Expire the quote by updating quote_expires_at in the DB
      await dbUtils.prisma.foreclosures.update({
        where: { id: foreclosureId },
        data: { quote_expires_at: new Date(Date.now() - 1000) },
      });

      // Attempt to execute the expired quote (manager2 for maker-checker)
      const execRes = await clients.manager2.post('/foreclosures').send({
        foreclosureId,
        paymentMode: 'cash',
        idempotencyKey: idempKey('expired-quote'),
      });

      expect([400, 422]).toContain(execRes.status);
      expect(execRes.body.code).toBe('FORECLOSURE_QUOTE_EXPIRED');
    });
  });


  // ─── 9.3 Settlement Payment Atomic Execution ───────────────────────────

  describe('settlement payment atomically: final collection, close installments, journal entries, status=foreclosed, audit log', () => {
    it('should execute foreclosure settlement atomically with all expected side effects', async () => {
      const { loanId } = await createActiveLoan({ payEmiCount: 3 });

      // Step 1: Generate quote (manager is the requester)
      const quoteRes = await clients.manager.post('/foreclosures/quote').send({
        loanId,
      });
      expect(quoteRes.status).toBe(201);
      const foreclosureId = quoteRes.body.foreclosureId;
      const settlementAmount = quoteRes.body.settlementAmountPaise;

      // Capture state before settlement
      const loanBefore = await dbUtils.findLoanById(loanId);
      expect(loanBefore!.status).not.toBe('foreclosed');

      // Step 2: Execute settlement (manager2 for maker-checker)
      const key = idempKey('settle');
      const execRes = await clients.manager2.post('/foreclosures').send({
        foreclosureId,
        paymentMode: 'cash',
        idempotencyKey: key,
      });

      expect(execRes.status).toBe(201);
      const result = execRes.body.data ?? execRes.body;

      expect(result.foreclosureId).toBe(foreclosureId);
      expect(result.loanId).toBe(loanId);
      expect(result.collectionId).toBeDefined();
      expect(result.journalEntryId).toBeDefined();
      expect(result.receiptId).toBeDefined();
      expect(result.receiptNumber).toBeDefined();
      expect(result.settlementAmountPaise).toBe(settlementAmount);
      expect(result.finalOutstandingPaise).toBe(0);
      expect(result.status).toBe('settled');

      // Verify 1: Loan status is foreclosed with outstanding = 0
      const loanAfter = await dbUtils.findLoanById(loanId);
      expect(loanAfter!.status).toBe('foreclosed');
      expect(Number(loanAfter!.cached_outstanding_paise)).toBe(0);

      // Verify 2: Settlement collection record exists
      const collections = await dbUtils.findCollectionsByLoanId(loanId);
      const settlementColl = collections.find((c) => c.id === result.collectionId);
      expect(settlementColl).toBeDefined();
      expect(Number(settlementColl!.amount_paise)).toBe(settlementAmount);

      // Verify 3: Journal entry is balanced
      const journalLines = await dbUtils.findJournalLinesByEntryId(result.journalEntryId);
      expect(journalLines.length).toBeGreaterThanOrEqual(2);
      const totalDebits = journalLines.reduce((s, l) => s + Number(l.debit_paise), 0);
      const totalCredits = journalLines.reduce((s, l) => s + Number(l.credit_paise), 0);
      expect(totalDebits).toBe(totalCredits);
      expect(totalDebits).toBe(settlementAmount);

      // Verify 4: All remaining installments are closed
      const schedules = await dbUtils.findSchedulesByLoanId(loanId);
      for (const inst of schedules) {
        expect(['paid', 'closed']).toContain(inst.status);
      }

      // Verify 5: Receipt generated
      const receipt = await dbUtils.findReceiptByCollectionId(result.collectionId);
      expect(receipt).not.toBeNull();
      expect(Number(receipt!.amount_paise)).toBe(settlementAmount);

      // Verify 6: Audit log entry exists for the foreclosure
      const auditLogs = await dbUtils.findAuditLogsByTarget('loan', loanId);
      const foreclosureLog = auditLogs.find(
        (log) => String(log.action_type) === 'loan_foreclosed',
      );
      expect(foreclosureLog).toBeDefined();
    });

    it('should handle idempotency: duplicate execution returns same result', async () => {
      const { loanId } = await createActiveLoan({ payEmiCount: 2 });

      // Generate quote
      const quoteRes = await clients.manager.post('/foreclosures/quote').send({
        loanId,
      });
      expect(quoteRes.status).toBe(201);
      const foreclosureId = quoteRes.body.foreclosureId;

      const key = idempKey('idemp-fc');

      // First execution
      const res1 = await clients.manager2.post('/foreclosures').send({
        foreclosureId,
        paymentMode: 'cash',
        idempotencyKey: key,
      });
      expect(res1.status).toBe(201);

      // Second execution with same idempotency key
      const res2 = await clients.manager2.post('/foreclosures').send({
        foreclosureId,
        paymentMode: 'cash',
        idempotencyKey: key,
      });

      expect([200, 201]).toContain(res2.status);

      const data1 = res1.body.data ?? res1.body;
      const data2 = res2.body.data ?? res2.body;

      // Should return the same result
      expect(data2.foreclosureId).toBe(data1.foreclosureId);
      expect(data2.collectionId).toBe(data1.collectionId);
      expect(data2.receiptNumber).toBe(data1.receiptNumber);

      // Verify only one settlement collection exists
      const collections = await dbUtils.findCollectionsByLoanId(loanId);
      const settlementColls = collections.filter(
        (c) => c.idempotency_key === key,
      );
      expect(settlementColls.length).toBe(1);
    });
  });


  // ─── 9.4 Failed Foreclosure Transaction Rolls Back ─────────────────────

  describe('failed foreclosure transaction rolls back entirely', () => {
    it('should not leave partial state when execution fails due to expired quote', async () => {
      const { loanId } = await createActiveLoan({ payEmiCount: 1 });

      // Create a valid quote
      const quoteRes = await clients.manager.post('/foreclosures/quote').send({
        loanId,
      });
      expect(quoteRes.status).toBe(201);
      const foreclosureId = quoteRes.body.foreclosureId;

      // Capture state before failed attempt
      const loanBefore = await dbUtils.findLoanById(loanId);
      const outstandingBefore = Number(loanBefore!.cached_outstanding_paise);
      const statusBefore = loanBefore!.status;
      const schedulesBefore = await dbUtils.findSchedulesByLoanId(loanId);
      const collectionsBefore = await dbUtils.findCollectionsByLoanId(loanId);

      // Expire the quote
      await dbUtils.prisma.foreclosures.update({
        where: { id: foreclosureId },
        data: { quote_expires_at: new Date(Date.now() - 1000) },
      });

      // Attempt execution — should fail
      const execRes = await clients.manager2.post('/foreclosures').send({
        foreclosureId,
        paymentMode: 'cash',
        idempotencyKey: idempKey('rollback-test'),
      });

      expect([400, 422]).toContain(execRes.status);

      // Verify no partial state changes
      const loanAfter = await dbUtils.findLoanById(loanId);
      expect(loanAfter!.status).toBe(statusBefore);
      expect(Number(loanAfter!.cached_outstanding_paise)).toBe(outstandingBefore);

      // Schedules unchanged
      const schedulesAfter = await dbUtils.findSchedulesByLoanId(loanId);
      expect(schedulesAfter.length).toBe(schedulesBefore.length);
      for (let i = 0; i < schedulesBefore.length; i++) {
        expect(schedulesAfter[i]!.status).toBe(schedulesBefore[i]!.status);
      }

      // No new collections created
      const collectionsAfter = await dbUtils.findCollectionsByLoanId(loanId);
      expect(collectionsAfter.length).toBe(collectionsBefore.length);
    });

    it('should not leave partial state when execution fails due to invalid loan status', async () => {
      const { loanId } = await createActiveLoan({ payEmiCount: 1 });

      // Create a valid quote
      const quoteRes = await clients.manager.post('/foreclosures/quote').send({
        loanId,
      });
      expect(quoteRes.status).toBe(201);
      const foreclosureId = quoteRes.body.foreclosureId;

      // Capture state before
      const collectionsBefore = await dbUtils.findCollectionsByLoanId(loanId);

      // Manually change loan status to 'closed' to trigger failure during execution
      await dbUtils.prisma.loans.update({
        where: { id: loanId },
        data: { status: 'closed' as never },
      });

      // Attempt execution — should fail because loan is no longer foreclosable
      const execRes = await clients.manager2.post('/foreclosures').send({
        foreclosureId,
        paymentMode: 'cash',
        idempotencyKey: idempKey('rollback-status'),
      });

      expect([400, 422]).toContain(execRes.status);

      // Verify no new collections were created
      const collectionsAfter = await dbUtils.findCollectionsByLoanId(loanId);
      expect(collectionsAfter.length).toBe(collectionsBefore.length);

      // Loan status should still be 'closed' (not partially changed)
      const loanAfter = await dbUtils.findLoanById(loanId);
      expect(loanAfter!.status).toBe('closed');
    });
  });

  // ─── 9.5 Maker-Checker Enforcement ─────────────────────────────────────

  describe('maker-checker enforcement on foreclosure approval', () => {
    it('should reject execution when approver is the same user who requested the quote', async () => {
      const { loanId } = await createActiveLoan({ payEmiCount: 2 });

      // Manager creates the quote (manager is the requester)
      const quoteRes = await clients.manager.post('/foreclosures/quote').send({
        loanId,
      });
      expect(quoteRes.status).toBe(201);
      const foreclosureId = quoteRes.body.foreclosureId;

      // Same manager tries to execute — should be rejected
      const execRes = await clients.manager.post('/foreclosures').send({
        foreclosureId,
        paymentMode: 'cash',
        idempotencyKey: idempKey('maker-checker-same'),
      });

      expect([400, 422]).toContain(execRes.status);
      expect(execRes.body.code).toBe('MAKER_CHECKER_VIOLATION');
    });

    it('should allow execution when approver is a different user than the requester', async () => {
      const { loanId } = await createActiveLoan({ payEmiCount: 2 });

      // Manager creates the quote
      const quoteRes = await clients.manager.post('/foreclosures/quote').send({
        loanId,
      });
      expect(quoteRes.status).toBe(201);
      const foreclosureId = quoteRes.body.foreclosureId;

      // Manager2 (different user) executes — should succeed
      const execRes = await clients.manager2.post('/foreclosures').send({
        foreclosureId,
        paymentMode: 'cash',
        idempotencyKey: idempKey('maker-checker-diff'),
      });

      expect(execRes.status).toBe(201);
      const result = execRes.body.data ?? execRes.body;
      expect(result.status).toBe('settled');

      // Verify loan is foreclosed
      const loan = await dbUtils.findLoanById(loanId);
      expect(loan!.status).toBe('foreclosed');
    });

    it('should allow super admin to execute a quote created by manager', async () => {
      const { loanId } = await createActiveLoan({ payEmiCount: 1 });

      // Manager creates the quote
      const quoteRes = await clients.manager.post('/foreclosures/quote').send({
        loanId,
      });
      expect(quoteRes.status).toBe(201);
      const foreclosureId = quoteRes.body.foreclosureId;

      // Super admin executes — different user, should succeed
      const execRes = await clients.superAdmin.post('/foreclosures').send({
        foreclosureId,
        paymentMode: 'cash',
        idempotencyKey: idempKey('maker-checker-sa'),
      });

      expect(execRes.status).toBe(201);
      const result = execRes.body.data ?? execRes.body;
      expect(result.status).toBe('settled');
    });
  });
});
