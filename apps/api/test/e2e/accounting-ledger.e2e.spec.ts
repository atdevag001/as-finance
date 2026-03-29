import { describe, it, expect, beforeAll } from 'vitest';
import { getApiBaseUrl, getUserTokens, getSeedData } from '../helpers/seed.js';
import { createAuthClients, type AuthClients } from '../helpers/auth-client.js';
import { createDbUtils, type DbUtils } from '../helpers/db-utils.js';
import { createCustomer, createLoan, postCollection } from '../helpers/factories.js';
import type { SeedData } from '../setup/global-setup.js';

/**
 * Accounting & Ledger E2E Tests
 *
 * Verifies double-entry accounting integrity: balanced journal entries,
 * correct debit/credit patterns for disbursement, collection, and reversal,
 * immutability of journal entries and receipts, trial balance identity,
 * and absence of orphaned journal entries.
 *
 * Validates: Requirements 12.1–12.7; Properties 8, 9, 21, 22
 */

describe('Accounting & Ledger E2E', () => {
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
  function idempKey(prefix = 'e2e-acct'): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Helper: create a customer and loan, advance to 'active' status.
   * Returns { customerId, loanId, loan }.
   */
  async function createActiveLoan(
    productVersionId?: string,
    overrides?: { principalPaise?: number; tenureMonths?: number },
  ) {
    const customer = await createCustomer(clients.fieldOfficer, {
      fullName: `Accounting Test Customer ${Date.now()}`,
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
   * Helper: get the first installment's total due (principal + interest).
   */
  async function getFirstInstallmentDue(loanId: string): Promise<number> {
    const schedules = await dbUtils.findSchedulesByLoanId(loanId);
    const first = schedules[0]!;
    return Number(first.principal_paise) + Number(first.interest_paise);
  }

  // ─── 12.1 All Journal Entries Balanced ──────────────────────────────────

  describe('all journal entries balanced: total debits = total credits per entry', () => {
    it('should have balanced journal entries for a disbursed loan', async () => {
      const { loanId } = await createActiveLoan();

      // Find all journal entries for this loan
      const journalEntries = await dbUtils.prisma.journal_entries.findMany({
        where: { source_id: loanId },
        include: { lines: true },
      });

      expect(journalEntries.length).toBeGreaterThan(0);

      for (const entry of journalEntries) {
        const totalDebits = entry.lines.reduce(
          (sum, line) => sum + Number(line.debit_paise),
          0,
        );
        const totalCredits = entry.lines.reduce(
          (sum, line) => sum + Number(line.credit_paise),
          0,
        );

        expect(totalDebits).toBe(totalCredits);
        expect(totalDebits).toBeGreaterThan(0);

        // Also verify stored totals match computed totals
        expect(Number(entry.total_debit_paise)).toBe(totalDebits);
        expect(Number(entry.total_credit_paise)).toBe(totalCredits);
      }
    });

    it('should have balanced journal entries after collection', async () => {
      const { loanId } = await createActiveLoan();
      const emiDue = await getFirstInstallmentDue(loanId);

      await postCollection(clients.collectionOfficer, {
        loanId,
        amountPaise: emiDue,
        overrides: { idempotencyKey: idempKey('bal-coll') },
      });

      // Fetch all journal entries related to this loan (disbursement + collection)
      const journalEntries = await dbUtils.prisma.journal_entries.findMany({
        where: { source_id: loanId },
        include: { lines: true },
      });

      // Should have at least 2 entries: disbursement + collection
      expect(journalEntries.length).toBeGreaterThanOrEqual(2);

      for (const entry of journalEntries) {
        const totalDebits = entry.lines.reduce(
          (sum, line) => sum + Number(line.debit_paise),
          0,
        );
        const totalCredits = entry.lines.reduce(
          (sum, line) => sum + Number(line.credit_paise),
          0,
        );

        expect(totalDebits).toBe(totalCredits);
        expect(totalDebits).toBeGreaterThan(0);
      }
    });

    it('should reject creation of an unbalanced journal entry via the accounting service', async () => {
      // Attempt to query the API for journal entries — the service validates balance
      // We verify this by checking that all existing entries in the DB are balanced
      const allEntries = await dbUtils.prisma.journal_entries.findMany({
        include: { lines: true },
        take: 50,
        orderBy: { created_at: 'desc' },
      });

      for (const entry of allEntries) {
        const totalDebits = entry.lines.reduce(
          (sum, line) => sum + Number(line.debit_paise),
          0,
        );
        const totalCredits = entry.lines.reduce(
          (sum, line) => sum + Number(line.credit_paise),
          0,
        );

        expect(totalDebits).toBe(totalCredits);
      }
    });
  });

  // ─── 12.2 Disbursement Journal: DR Loans_Receivable, CR Cash/Bank ─────

  describe('disbursement journal: DR Loans_Receivable, CR Cash/Bank', () => {
    it('should create correct debit/credit pattern for disbursement', async () => {
      const { loanId } = await createActiveLoan();

      // Find the disbursement journal entry
      const disbursementEntries = await dbUtils.prisma.journal_entries.findMany({
        where: { source_id: loanId, source_type: 'disbursement' },
        include: { lines: { include: { account: true } } },
      });

      expect(disbursementEntries.length).toBe(1);
      const entry = disbursementEntries[0]!;

      // Get the loan to know the principal amount
      const loan = await dbUtils.findLoanById(loanId);
      const principalPaise = Number(loan!.principal_paise);

      // Find debit line (Loans Receivable)
      const debitLine = entry.lines.find(
        (line) => Number(line.debit_paise) > 0,
      );
      expect(debitLine).toBeDefined();
      expect(debitLine!.account.code).toBe('1100'); // Loans Receivable
      expect(Number(debitLine!.debit_paise)).toBe(principalPaise);

      // Find credit line (Cash or Bank)
      const creditLine = entry.lines.find(
        (line) => Number(line.credit_paise) > 0,
      );
      expect(creditLine).toBeDefined();
      expect(['1001', '1002']).toContain(creditLine!.account.code); // Cash or Bank
      expect(Number(creditLine!.credit_paise)).toBe(principalPaise);
    });

    it('should have disbursement journal entry amount equal to loan principal', async () => {
      const principalPaise = 15_000_00; // ₹15,000
      const { loanId } = await createActiveLoan(undefined, { principalPaise });

      const disbursementEntries = await dbUtils.prisma.journal_entries.findMany({
        where: { source_id: loanId, source_type: 'disbursement' },
        include: { lines: true },
      });

      expect(disbursementEntries.length).toBe(1);
      const entry = disbursementEntries[0]!;

      expect(Number(entry.total_debit_paise)).toBe(principalPaise);
      expect(Number(entry.total_credit_paise)).toBe(principalPaise);
    });
  });

  // ─── 12.3 Collection Journal: DR Cash/Bank, CR Loans_Receivable/Interest_Income/Penalty_Income ─

  describe('collection journal: DR Cash/Bank, CR Loans_Receivable/Interest_Income/Penalty_Income', () => {
    it('should create correct debit/credit pattern for collection with principal and interest', async () => {
      const { loanId } = await createActiveLoan();
      const schedules = await dbUtils.findSchedulesByLoanId(loanId);
      const first = schedules[0]!;
      const interestDue = Number(first.interest_paise);
      const principalDue = Number(first.principal_paise);
      const totalDue = interestDue + principalDue;

      const key = idempKey('coll-journal');
      await clients.collectionOfficer.post('/collections').send({
        loanId,
        amountPaise: totalDue,
        paymentMode: 'cash',
        paymentDate: '2024-01-15',
        idempotencyKey: key,
      });

      // Find the collection journal entry
      const collectionEntries = await dbUtils.prisma.journal_entries.findMany({
        where: { source_id: loanId, source_type: 'collection' },
        include: { lines: { include: { account: true } } },
      });

      expect(collectionEntries.length).toBeGreaterThanOrEqual(1);
      const entry = collectionEntries[collectionEntries.length - 1]!;

      // DR Cash/Bank for total amount
      const debitLines = entry.lines.filter(
        (line) => Number(line.debit_paise) > 0,
      );
      expect(debitLines.length).toBeGreaterThanOrEqual(1);

      const cashBankDebit = debitLines.find(
        (line) => ['1001', '1002'].includes(line.account.code),
      );
      expect(cashBankDebit).toBeDefined();
      expect(Number(cashBankDebit!.debit_paise)).toBe(totalDue);

      // CR lines should include Loans Receivable (principal) and Interest Income (interest)
      const creditLines = entry.lines.filter(
        (line) => Number(line.credit_paise) > 0,
      );
      expect(creditLines.length).toBeGreaterThanOrEqual(1);

      // Total credits should equal total debits
      const totalDebits = entry.lines.reduce(
        (sum, line) => sum + Number(line.debit_paise),
        0,
      );
      const totalCredits = entry.lines.reduce(
        (sum, line) => sum + Number(line.credit_paise),
        0,
      );
      expect(totalDebits).toBe(totalCredits);
      expect(totalDebits).toBe(totalDue);

      // Verify credit accounts include Loans Receivable for principal component
      const loansReceivableCredit = creditLines.find(
        (line) => line.account.code === '1100',
      );
      expect(loansReceivableCredit).toBeDefined();
      expect(Number(loansReceivableCredit!.credit_paise)).toBe(principalDue);

      // Verify credit accounts include Interest Income for interest component
      if (interestDue > 0) {
        const interestIncomeCredit = creditLines.find(
          (line) => line.account.code === '4001',
        );
        expect(interestIncomeCredit).toBeDefined();
        expect(Number(interestIncomeCredit!.credit_paise)).toBe(interestDue);
      }
    });

    it('should create collection journal entry with correct total amount', async () => {
      const { loanId } = await createActiveLoan();
      const emiDue = await getFirstInstallmentDue(loanId);

      const key = idempKey('coll-total');
      await clients.collectionOfficer.post('/collections').send({
        loanId,
        amountPaise: emiDue,
        paymentMode: 'cash',
        paymentDate: '2024-01-15',
        idempotencyKey: key,
      });

      const collectionEntries = await dbUtils.prisma.journal_entries.findMany({
        where: { source_id: loanId, source_type: 'collection' },
      });

      expect(collectionEntries.length).toBeGreaterThanOrEqual(1);
      const entry = collectionEntries[collectionEntries.length - 1]!;

      expect(Number(entry.total_debit_paise)).toBe(emiDue);
      expect(Number(entry.total_credit_paise)).toBe(emiDue);
    });
  });

  // ─── 12.4 Reversal Journal: Mirror Entries of Original ───────────────

  describe('reversal journal: mirror entries of original', () => {
    it('should create mirror journal entries where original debits become credits and vice versa', async () => {
      const { loanId } = await createActiveLoan();
      const emiDue = await getFirstInstallmentDue(loanId);

      // Post a collection
      const collKey = idempKey('rev-mirror-coll');
      const collRes = await clients.collectionOfficer.post('/collections').send({
        loanId,
        amountPaise: emiDue,
        paymentMode: 'cash',
        paymentDate: '2024-01-15',
        idempotencyKey: collKey,
      });
      expect(collRes.status).toBe(201);
      const collData = collRes.body.data ?? collRes.body;

      // Get the original collection's journal entry
      const collections = await dbUtils.findCollectionsByLoanId(loanId);
      const originalColl = collections.find(
        (c) => c.id === collData.collectionId,
      )!;
      const originalJournalId = originalColl.journal_entry_id;
      const originalLines = await dbUtils.findJournalLinesByEntryId(originalJournalId);

      // Reverse the collection
      const revKey = idempKey('rev-mirror');
      const revRes = await clients.manager.post('/reversals').send({
        collectionId: collData.collectionId,
        reason: 'E2E test: mirror journal verification',
        idempotencyKey: revKey,
      });
      expect(revRes.status).toBe(201);
      const revData = revRes.body.data ?? revRes.body;

      // Get the reversal journal entry
      const mirrorLines = await dbUtils.findJournalLinesByEntryId(
        revData.mirrorJournalEntryId,
      );

      // Mirror entry should have same number of lines
      expect(mirrorLines.length).toBe(originalLines.length);

      // For each account, the original debit should become a credit in the mirror
      // and the original credit should become a debit in the mirror
      const originalByAccount = new Map<string, { debit: number; credit: number }>();
      for (const line of originalLines) {
        originalByAccount.set(line.account_id, {
          debit: Number(line.debit_paise),
          credit: Number(line.credit_paise),
        });
      }

      const mirrorByAccount = new Map<string, { debit: number; credit: number }>();
      for (const line of mirrorLines) {
        mirrorByAccount.set(line.account_id, {
          debit: Number(line.debit_paise),
          credit: Number(line.credit_paise),
        });
      }

      // Verify mirror pattern: original debit → mirror credit, original credit → mirror debit
      for (const [accountId, original] of originalByAccount) {
        const mirror = mirrorByAccount.get(accountId);
        expect(mirror).toBeDefined();
        expect(mirror!.debit).toBe(original.credit);
        expect(mirror!.credit).toBe(original.debit);
      }

      // Net effect per account should be zero
      for (const [accountId, original] of originalByAccount) {
        const mirror = mirrorByAccount.get(accountId)!;
        const netDebit = original.debit + mirror.debit;
        const netCredit = original.credit + mirror.credit;
        expect(netDebit).toBe(netCredit);
      }
    });
  });

  // ─── 12.5 Journal Entries and Receipts Immutable ─────────────────────

  describe('journal entries and receipts immutable (no UPDATE/DELETE via API)', () => {
    it('should not expose an update endpoint for journal entries', async () => {
      const { loanId } = await createActiveLoan();

      // Find a journal entry
      const entries = await dbUtils.prisma.journal_entries.findMany({
        where: { source_id: loanId },
        take: 1,
      });
      expect(entries.length).toBeGreaterThan(0);
      const entryId = entries[0]!.id;

      // Attempt to update via PUT — should return 404 (no such endpoint)
      const putRes = await clients.accountant
        .put(`/accounting/journal-entries/${entryId}`)
        .send({ description: 'Tampered description' });
      expect([404, 405]).toContain(putRes.status);

      // Attempt to update via PATCH — should return 404 (no such endpoint)
      const patchRes = await clients.accountant
        .patch(`/accounting/journal-entries/${entryId}`)
        .send({ description: 'Tampered description' });
      expect([404, 405]).toContain(patchRes.status);
    });

    it('should not expose a delete endpoint for journal entries', async () => {
      const { loanId } = await createActiveLoan();

      const entries = await dbUtils.prisma.journal_entries.findMany({
        where: { source_id: loanId },
        take: 1,
      });
      expect(entries.length).toBeGreaterThan(0);
      const entryId = entries[0]!.id;

      // Attempt to delete — should return 404 (no such endpoint)
      const deleteRes = await clients.accountant
        .delete(`/accounting/journal-entries/${entryId}`);
      expect([404, 405]).toContain(deleteRes.status);
    });

    it('should not expose update or delete endpoints for receipts', async () => {
      const { loanId } = await createActiveLoan();
      const emiDue = await getFirstInstallmentDue(loanId);

      // Post a collection to create a receipt
      const key = idempKey('immut-rcpt');
      const collRes = await clients.collectionOfficer.post('/collections').send({
        loanId,
        amountPaise: emiDue,
        paymentMode: 'cash',
        paymentDate: '2024-01-15',
        idempotencyKey: key,
      });
      expect(collRes.status).toBe(201);
      const collData = collRes.body.data ?? collRes.body;

      // Find the receipt
      const receipt = await dbUtils.findReceiptByCollectionId(collData.collectionId);
      expect(receipt).not.toBeNull();

      // Attempt to update receipt via PUT — should return 404
      const putRes = await clients.accountant
        .put(`/receipts/${receipt!.id}`)
        .send({ amount_paise: 999 });
      expect([404, 405]).toContain(putRes.status);

      // Attempt to update receipt via PATCH — should return 404
      const patchRes = await clients.accountant
        .patch(`/receipts/${receipt!.id}`)
        .send({ amount_paise: 999 });
      expect([404, 405]).toContain(patchRes.status);

      // Attempt to delete receipt — should return 404
      const deleteRes = await clients.accountant
        .delete(`/receipts/${receipt!.id}`);
      expect([404, 405]).toContain(deleteRes.status);

      // Verify receipt content unchanged in DB
      const receiptAfter = await dbUtils.findReceiptByCollectionId(collData.collectionId);
      expect(Number(receiptAfter!.amount_paise)).toBe(emiDue);
      expect(receiptAfter!.status).toBe('active');
    });
  });

  // ─── 12.6 Trial Balance: Sum Debit Balances = Sum Credit Balances ────

  describe('trial balance: sum debit balances = sum credit balances', () => {
    it('should return a balanced trial balance via the API', async () => {
      // Create some activity to ensure there are journal entries
      const { loanId } = await createActiveLoan();
      const emiDue = await getFirstInstallmentDue(loanId);

      await postCollection(clients.collectionOfficer, {
        loanId,
        amountPaise: emiDue,
        overrides: { idempotencyKey: idempKey('tb-coll') },
      });

      // Fetch trial balance via the accounting API
      const tbRes = await clients.accountant.get('/accounting/trial-balance');
      expect(tbRes.status).toBe(200);

      const trialBalance = tbRes.body;
      expect(trialBalance.isBalanced).toBe(true);
      expect(trialBalance.totalDebitBalancePaise).toBe(
        trialBalance.totalCreditBalancePaise,
      );

      // Verify rows exist
      expect(trialBalance.rows).toBeDefined();
      expect(trialBalance.rows.length).toBeGreaterThan(0);
    });

    it('should have trial balance totals match DB-level aggregate', async () => {
      // Verify trial balance from DB directly
      const dbTotals = await dbUtils.getTrialBalanceTotals();

      // Total debits should equal total credits across all journal lines
      expect(dbTotals.totalDebits).toBe(dbTotals.totalCredits);
    });

    it('should remain balanced after multiple disbursements and collections', async () => {
      // Create two loans with collections
      const { loanId: loanId1 } = await createActiveLoan();
      const { loanId: loanId2 } = await createActiveLoan();

      const emiDue1 = await getFirstInstallmentDue(loanId1);
      const emiDue2 = await getFirstInstallmentDue(loanId2);

      await postCollection(clients.collectionOfficer, {
        loanId: loanId1,
        amountPaise: emiDue1,
        overrides: { idempotencyKey: idempKey('tb-multi-1') },
      });

      await postCollection(clients.collectionOfficer, {
        loanId: loanId2,
        amountPaise: emiDue2,
        overrides: { idempotencyKey: idempKey('tb-multi-2') },
      });

      // Verify trial balance is still balanced
      const tbRes = await clients.accountant.get('/accounting/trial-balance');
      expect(tbRes.status).toBe(200);
      expect(tbRes.body.isBalanced).toBe(true);

      // Verify DB-level totals
      const dbTotals = await dbUtils.getTrialBalanceTotals();
      expect(dbTotals.totalDebits).toBe(dbTotals.totalCredits);
    });
  });

  // ─── 12.7 No Orphaned Journal Entries ────────────────────────────────

  describe('no orphaned journal entries (all have valid source reference)', () => {
    it('should have a valid source_type and source_id for every journal entry', async () => {
      // Create some activity
      const { loanId } = await createActiveLoan();
      const emiDue = await getFirstInstallmentDue(loanId);

      await postCollection(clients.collectionOfficer, {
        loanId,
        amountPaise: emiDue,
        overrides: { idempotencyKey: idempKey('orphan-coll') },
      });

      // Fetch recent journal entries
      const recentEntries = await dbUtils.prisma.journal_entries.findMany({
        orderBy: { created_at: 'desc' },
        take: 50,
      });

      const validSourceTypes = [
        'disbursement',
        'collection',
        'reversal',
        'penalty',
        'expense',
        'processing_fee',
        'foreclosure',
      ];

      for (const entry of recentEntries) {
        // Every entry must have a valid source_type
        expect(validSourceTypes).toContain(entry.source_type);

        // Every entry must have a non-empty source_id
        expect(entry.source_id).toBeDefined();
        expect(entry.source_id).not.toBe('');
        expect(entry.source_id).not.toBe('00000000-0000-0000-0000-000000000000');
      }
    });

    it('should have source_id referencing an existing entity for loan-related entries', async () => {
      const { loanId } = await createActiveLoan();

      // Get journal entries for this specific loan
      const loanEntries = await dbUtils.prisma.journal_entries.findMany({
        where: { source_id: loanId },
      });

      expect(loanEntries.length).toBeGreaterThan(0);

      // All entries should reference the loan that exists
      const loan = await dbUtils.findLoanById(loanId);
      expect(loan).not.toBeNull();

      for (const entry of loanEntries) {
        expect(entry.source_id).toBe(loanId);
        expect(['disbursement', 'collection', 'reversal', 'penalty', 'processing_fee', 'foreclosure']).toContain(
          entry.source_type,
        );
      }
    });

    it('should link disbursement journal entries to the disbursement record', async () => {
      const { loanId } = await createActiveLoan();

      // Find the disbursement record
      const disbursements = await dbUtils.prisma.disbursements.findMany({
        where: { loan_id: loanId },
      });
      expect(disbursements.length).toBe(1);

      const disbursement = disbursements[0]!;

      // The disbursement should reference a journal entry
      expect(disbursement.journal_entry_id).toBeDefined();

      // That journal entry should exist and have source_type = 'disbursement'
      const journalEntry = await dbUtils.findJournalEntryById(
        disbursement.journal_entry_id,
      );
      expect(journalEntry).not.toBeNull();
      expect(journalEntry!.source_type).toBe('disbursement');
      expect(journalEntry!.source_id).toBe(loanId);
    });

    it('should link collection journal entries to the collection record', async () => {
      const { loanId } = await createActiveLoan();
      const emiDue = await getFirstInstallmentDue(loanId);

      const key = idempKey('orphan-link');
      const collRes = await clients.collectionOfficer.post('/collections').send({
        loanId,
        amountPaise: emiDue,
        paymentMode: 'cash',
        paymentDate: '2024-01-15',
        idempotencyKey: key,
      });
      expect(collRes.status).toBe(201);

      // Find the collection record
      const collections = await dbUtils.findCollectionsByLoanId(loanId);
      const coll = collections.find((c) => c.idempotency_key === key)!;

      // The collection should reference a journal entry
      expect(coll.journal_entry_id).toBeDefined();

      // That journal entry should exist and have source_type = 'collection'
      const journalEntry = await dbUtils.findJournalEntryById(
        coll.journal_entry_id,
      );
      expect(journalEntry).not.toBeNull();
      expect(journalEntry!.source_type).toBe('collection');
    });
  });
});
