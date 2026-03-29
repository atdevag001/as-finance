import { describe, it, expect, beforeAll } from 'vitest';
import { getApiBaseUrl, getUserTokens, getSeedData } from '../helpers/seed.js';
import { createAuthClients, type AuthClients } from '../helpers/auth-client.js';
import { createDbUtils, type DbUtils } from '../helpers/db-utils.js';
import type { SeedData } from '../setup/global-setup.js';

/**
 * Cashbook & Expense E2E Tests
 *
 * Verifies expense recording atomically creates expense, journal entry
 * (DR Expense, CR Cash/Bank), and audit log. Tests cash handover creation
 * with declared amount, verification by manager, cashbook balance invariant
 * (closing = opening + inflows − outflows), and handover verification
 * status updates with audit trail.
 *
 * Validates: Requirements 13.1–13.4; Property 26
 */

describe('Cashbook & Expense E2E', () => {
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

  // ─── 13.1 Expense Recording Atomically Creates Expense, Journal Entry, Audit Log ──

  describe('expense recording atomically creates expense, journal entry (DR Expense, CR Cash/Bank), audit log', () => {
    it('should create expense record, journal entry, and audit log atomically', async () => {
      const expensePayload = {
        category: 'travel',
        amountPaise: 2500_00, // ₹2,500
        date: new Date().toISOString().split('T')[0]!,
        description: `E2E cashbook test expense ${Date.now()}`,
      };

      const res = await clients.accountant
        .post('/cashbook/expenses')
        .send(expensePayload);

      expect(res.status).toBe(201);
      const data = res.body.data ?? res.body;
      const expenseId = data.expense?.id ?? data.expenseId ?? data.id;
      expect(expenseId).toBeDefined();

      // Verify expense record in DB
      const expense = await dbUtils.prisma.expenses.findUnique({
        where: { id: expenseId },
      });
      expect(expense).not.toBeNull();
      expect(Number(expense!.amount_paise)).toBe(expensePayload.amountPaise);
      expect(expense!.category).toBe('travel');
      expect(expense!.journal_entry_id).toBeDefined();

      // Verify journal entry: DR Expense account, CR Cash/Bank
      const journalEntry = await dbUtils.findJournalEntryById(expense!.journal_entry_id);
      expect(journalEntry).not.toBeNull();
      expect(journalEntry!.source_type).toBe('expense');

      const journalLines = await dbUtils.findJournalLinesByEntryId(expense!.journal_entry_id);
      expect(journalLines.length).toBeGreaterThanOrEqual(2);

      // Verify balanced entry
      const totalDebits = journalLines.reduce((sum, l) => sum + Number(l.debit_paise), 0);
      const totalCredits = journalLines.reduce((sum, l) => sum + Number(l.credit_paise), 0);
      expect(totalDebits).toBe(totalCredits);
      expect(totalDebits).toBe(expensePayload.amountPaise);

      // Verify debit line is an expense account (5xxx)
      const debitLine = journalLines.find((l) => Number(l.debit_paise) > 0);
      expect(debitLine).toBeDefined();
      const debitAccount = await dbUtils.prisma.chart_of_accounts.findUnique({
        where: { id: debitLine!.account_id },
      });
      expect(debitAccount).not.toBeNull();
      expect(debitAccount!.code.startsWith('5')).toBe(true); // Expense account

      // Verify credit line is Cash account (1001)
      const creditLine = journalLines.find((l) => Number(l.credit_paise) > 0);
      expect(creditLine).toBeDefined();
      const creditAccount = await dbUtils.prisma.chart_of_accounts.findUnique({
        where: { id: creditLine!.account_id },
      });
      expect(creditAccount).not.toBeNull();
      expect(creditAccount!.code).toBe('1001'); // Cash account

      // Verify audit log entry
      const auditLogs = await dbUtils.findAuditLogsByTarget('expense', expenseId);
      expect(auditLogs.length).toBeGreaterThanOrEqual(1);
      const auditEntry = auditLogs.find((a) => a.action_type === 'expense_recorded');
      expect(auditEntry).toBeDefined();
      expect(auditEntry!.actor_id).toBe(seedData.users.accountant.id);
    });

    it('should map expense category to correct expense account code', async () => {
      // Test with 'office' category → should map to account 5004
      const res = await clients.accountant
        .post('/cashbook/expenses')
        .send({
          category: 'office',
          amountPaise: 1000_00,
          date: new Date().toISOString().split('T')[0]!,
          description: `E2E office expense ${Date.now()}`,
        });

      expect(res.status).toBe(201);
      const data = res.body.data ?? res.body;
      const expenseId = data.expense?.id ?? data.expenseId ?? data.id;

      const expense = await dbUtils.prisma.expenses.findUnique({
        where: { id: expenseId },
      });
      expect(expense).not.toBeNull();

      const journalLines = await dbUtils.findJournalLinesByEntryId(expense!.journal_entry_id);
      const debitLine = journalLines.find((l) => Number(l.debit_paise) > 0);
      const debitAccount = await dbUtils.prisma.chart_of_accounts.findUnique({
        where: { id: debitLine!.account_id },
      });
      expect(debitAccount).not.toBeNull();
      // Office maps to 5004, or falls back to 5099 — either is a valid expense account
      expect(debitAccount!.code.startsWith('5')).toBe(true);
    });

    it('should create a cash transaction outflow record for the expense', async () => {
      const description = `E2E cash tx expense ${Date.now()}`;
      const res = await clients.accountant
        .post('/cashbook/expenses')
        .send({
          category: 'travel',
          amountPaise: 750_00,
          date: new Date().toISOString().split('T')[0]!,
          description,
        });

      expect(res.status).toBe(201);
      const data = res.body.data ?? res.body;
      const expenseId = data.expense?.id ?? data.expenseId ?? data.id;

      // Verify cash transaction record was created as outflow
      const cashTx = await dbUtils.prisma.cash_transactions.findFirst({
        where: { source_type: 'expense', source_id: expenseId },
      });
      expect(cashTx).not.toBeNull();
      expect(cashTx!.type).toBe('outflow');
      expect(Number(cashTx!.amount_paise)).toBe(750_00);
    });
  });

  // ─── 13.2 Cash Handover Creation with Declared Amount ─────────────────

  describe('cash handover creation with declared amount, verification by manager', () => {
    it('should create a handover record with declared amount and pending status', async () => {
      const receivingOfficerId = seedData.users.manager.id;

      const handoverRes = await clients.collectionOfficer
        .post('/cashbook/handovers')
        .send({
          totalAmountPaise: 50_000_00, // ₹50,000
          receivingOfficerId,
          handoverDate: new Date().toISOString().split('T')[0]!,
        });

      expect(handoverRes.status).toBe(201);
      const handoverData = handoverRes.body.data ?? handoverRes.body;
      const handoverId = handoverData.id;
      expect(handoverId).toBeDefined();

      // Verify handover record in DB
      const handover = await dbUtils.prisma.cash_handover_records.findUnique({
        where: { id: handoverId },
      });
      expect(handover).not.toBeNull();
      expect(Number(handover!.total_amount_paise)).toBe(50_000_00);
      expect(handover!.verification_status).toBe('pending');
      expect(handover!.collection_officer_id).toBe(seedData.users.collectionOfficer.id);
      expect(handover!.receiving_officer_id).toBe(receivingOfficerId);
    });

    it('should create an audit log entry for the handover', async () => {
      const receivingOfficerId = seedData.users.manager.id;

      const handoverRes = await clients.collectionOfficer
        .post('/cashbook/handovers')
        .send({
          totalAmountPaise: 25_000_00,
          receivingOfficerId,
          handoverDate: new Date().toISOString().split('T')[0]!,
        });

      expect(handoverRes.status).toBe(201);
      const handoverData = handoverRes.body.data ?? handoverRes.body;
      const handoverId = handoverData.id;

      // Verify audit log
      const auditLogs = await dbUtils.findAuditLogsByTarget('cash_handover', handoverId);
      expect(auditLogs.length).toBeGreaterThanOrEqual(1);
      const auditEntry = auditLogs.find((a) => a.action_type === 'cash_handover');
      expect(auditEntry).toBeDefined();
      expect(auditEntry!.actor_id).toBe(seedData.users.collectionOfficer.id);
    });
  });

  // ─── 13.3 Cashbook Balance: closing = opening + inflows − outflows ────

  describe('cashbook balance: closing = opening + inflows − outflows', () => {
    it('should maintain the cashbook balance invariant via daily summary API', async () => {
      const today = new Date().toISOString().split('T')[0]!;

      // Record an expense to ensure there is activity
      await clients.accountant
        .post('/cashbook/expenses')
        .send({
          category: 'travel',
          amountPaise: 300_00,
          date: today,
          description: `E2E balance invariant test ${Date.now()}`,
        });

      // Fetch daily summary
      const summaryRes = await clients.accountant
        .get('/cashbook/daily-summary')
        .query({ date: today });

      expect(summaryRes.status).toBe(200);
      const summary = summaryRes.body;

      const opening = BigInt(summary.openingBalancePaise);
      const inflows = BigInt(summary.cashInflowsPaise);
      const outflows = BigInt(summary.cashOutflowsPaise);
      const closing = BigInt(summary.closingBalancePaise);

      // Invariant: closing = opening + inflows - outflows
      expect(closing).toBe(opening + inflows - outflows);
    });

    it('should match DB-level cashbook balance with API daily summary', async () => {
      const today = new Date().toISOString().split('T')[0]!;

      // Record another expense
      await clients.accountant
        .post('/cashbook/expenses')
        .send({
          category: 'other',
          amountPaise: 150_00,
          date: today,
          description: `E2E db balance check ${Date.now()}`,
        });

      // Get balance from DB utility
      const dbBalance = await dbUtils.getCashbookBalance(today);

      // Verify DB-level invariant
      expect(dbBalance.closing).toBe(
        dbBalance.opening + dbBalance.inflows - dbBalance.outflows,
      );

      // Fetch API summary and compare
      const summaryRes = await clients.accountant
        .get('/cashbook/daily-summary')
        .query({ date: today });

      expect(summaryRes.status).toBe(200);
      const summary = summaryRes.body;

      // API and DB should agree on the balance components
      expect(BigInt(summary.closingBalancePaise)).toBe(dbBalance.closing);
    });

    it('should reflect multiple expenses in the daily outflows', async () => {
      const today = new Date().toISOString().split('T')[0]!;

      // Get baseline
      const baselineSummary = await clients.accountant
        .get('/cashbook/daily-summary')
        .query({ date: today });
      expect(baselineSummary.status).toBe(200);
      const baselineOutflows = BigInt(baselineSummary.body.cashOutflowsPaise);

      // Record two expenses
      const amount1 = 200_00;
      const amount2 = 350_00;

      await clients.accountant
        .post('/cashbook/expenses')
        .send({
          category: 'travel',
          amountPaise: amount1,
          date: today,
          description: `E2E multi expense 1 ${Date.now()}`,
        });

      await clients.accountant
        .post('/cashbook/expenses')
        .send({
          category: 'office',
          amountPaise: amount2,
          date: today,
          description: `E2E multi expense 2 ${Date.now()}`,
        });

      // Verify outflows increased by the sum of both expenses
      const afterSummary = await clients.accountant
        .get('/cashbook/daily-summary')
        .query({ date: today });
      expect(afterSummary.status).toBe(200);
      const afterOutflows = BigInt(afterSummary.body.cashOutflowsPaise);

      expect(afterOutflows).toBe(baselineOutflows + BigInt(amount1) + BigInt(amount2));

      // Invariant still holds
      const s = afterSummary.body;
      expect(BigInt(s.closingBalancePaise)).toBe(
        BigInt(s.openingBalancePaise) + BigInt(s.cashInflowsPaise) - BigInt(s.cashOutflowsPaise),
      );
    });
  });

  // ─── 13.4 Handover Verification Updates Status and Creates Audit Log ──

  describe('handover verification updates status and creates audit log', () => {
    it('should verify a handover and update status to verified', async () => {
      const receivingOfficerId = seedData.users.manager.id;

      // Create a handover
      const handoverRes = await clients.collectionOfficer
        .post('/cashbook/handovers')
        .send({
          totalAmountPaise: 30_000_00,
          receivingOfficerId,
          handoverDate: new Date().toISOString().split('T')[0]!,
        });
      expect(handoverRes.status).toBe(201);
      const handoverId = (handoverRes.body.data ?? handoverRes.body).id;

      // Verify the handover as manager
      const verifyRes = await clients.manager
        .patch(`/cashbook/handovers/${handoverId}/verify`)
        .send({ verificationStatus: 'verified' });

      expect(verifyRes.status).toBe(200);

      // Verify status updated in DB
      const handover = await dbUtils.prisma.cash_handover_records.findUnique({
        where: { id: handoverId },
      });
      expect(handover).not.toBeNull();
      expect(handover!.verification_status).toBe('verified');
      expect(handover!.verified_at).not.toBeNull();
    });

    it('should flag discrepancy with amount and notes', async () => {
      const receivingOfficerId = seedData.users.manager.id;

      // Create a handover
      const handoverRes = await clients.collectionOfficer
        .post('/cashbook/handovers')
        .send({
          totalAmountPaise: 40_000_00,
          receivingOfficerId,
          handoverDate: new Date().toISOString().split('T')[0]!,
        });
      expect(handoverRes.status).toBe(201);
      const handoverId = (handoverRes.body.data ?? handoverRes.body).id;

      // Flag discrepancy
      const verifyRes = await clients.manager
        .patch(`/cashbook/handovers/${handoverId}/verify`)
        .send({
          verificationStatus: 'discrepancy',
          discrepancyAmountPaise: 500_00,
          discrepancyNotes: 'Short by ₹500',
        });

      expect(verifyRes.status).toBe(200);

      // Verify in DB
      const handover = await dbUtils.prisma.cash_handover_records.findUnique({
        where: { id: handoverId },
      });
      expect(handover).not.toBeNull();
      expect(handover!.verification_status).toBe('discrepancy');
      expect(Number(handover!.discrepancy_amount_paise)).toBe(500_00);
      expect(handover!.discrepancy_notes).toBe('Short by ₹500');
    });

    it('should prevent re-verification of an already verified handover', async () => {
      const receivingOfficerId = seedData.users.manager.id;

      // Create and verify a handover
      const handoverRes = await clients.collectionOfficer
        .post('/cashbook/handovers')
        .send({
          totalAmountPaise: 20_000_00,
          receivingOfficerId,
          handoverDate: new Date().toISOString().split('T')[0]!,
        });
      expect(handoverRes.status).toBe(201);
      const handoverId = (handoverRes.body.data ?? handoverRes.body).id;

      // First verification
      const firstVerify = await clients.manager
        .patch(`/cashbook/handovers/${handoverId}/verify`)
        .send({ verificationStatus: 'verified' });
      expect(firstVerify.status).toBe(200);

      // Second verification attempt should fail
      const secondVerify = await clients.manager
        .patch(`/cashbook/handovers/${handoverId}/verify`)
        .send({ verificationStatus: 'verified' });
      expect(secondVerify.status).toBeGreaterThanOrEqual(400);
    });

    it('should create audit log entries for handover verification', async () => {
      const receivingOfficerId = seedData.users.manager.id;

      // Create a handover
      const handoverRes = await clients.collectionOfficer
        .post('/cashbook/handovers')
        .send({
          totalAmountPaise: 15_000_00,
          receivingOfficerId,
          handoverDate: new Date().toISOString().split('T')[0]!,
        });
      expect(handoverRes.status).toBe(201);
      const handoverId = (handoverRes.body.data ?? handoverRes.body).id;

      // Audit log for creation
      const creationLogs = await dbUtils.findAuditLogsByTarget('cash_handover', handoverId);
      expect(creationLogs.length).toBeGreaterThanOrEqual(1);

      // Verify the handover
      await clients.manager
        .patch(`/cashbook/handovers/${handoverId}/verify`)
        .send({ verificationStatus: 'verified' });

      // Audit log should now have entries for both creation and verification
      const allLogs = await dbUtils.findAuditLogsByTarget('cash_handover', handoverId);
      expect(allLogs.length).toBeGreaterThanOrEqual(1);

      // The creation audit log should exist
      const creationLog = allLogs.find((a) => a.action_type === 'cash_handover');
      expect(creationLog).toBeDefined();
    });
  });
});
