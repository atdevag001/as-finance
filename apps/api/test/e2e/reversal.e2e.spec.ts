import { describe, it, expect, beforeAll } from 'vitest';
import { getApiBaseUrl, getUserTokens, getSeedData } from '../helpers/seed.js';
import { createAuthClients, type AuthClients } from '../helpers/auth-client.js';
import { createDbUtils, type DbUtils } from '../helpers/db-utils.js';
import { createCustomer, createLoan } from '../helpers/factories.js';
import type { SeedData } from '../setup/global-setup.js';

/**
 * Reversal E2E Tests
 *
 * Verifies the complete collection reversal flow: atomic execution with
 * compensating entries, ledger neutrality, schedule rollback, receipt
 * management, DPD recalculation, and error handling for invalid reversals.
 *
 * Validates: Requirements 7.1–7.6; Properties 7, 17
 */

describe('Reversal E2E', () => {
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
  function idempKey(prefix = 'e2e-rev'): string {
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
      fullName: `Reversal Test Customer ${Date.now()}`,
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

  /**
   * Helper: post a collection and return the collection ID + response data.
   */
  async function postCollectionAndGetId(loanId: string, amountPaise: number) {
    const key = idempKey('coll');
    const res = await clients.collectionOfficer.post('/collections').send({
      loanId,
      amountPaise,
      paymentMode: 'cash',
      paymentDate: '2024-01-15',
      idempotencyKey: key,
    });
    expect(res.status).toBe(201);
    const data = res.body.data ?? res.body;
    return { collectionId: data.collectionId as string, data, idempotencyKey: key };
  }

  // ─── 7.1 Reversal Executes Atomically ──────────────────────────────────

  describe('reversal executes atomically: compensating collection, reverse allocations, restore installment statuses, compensating journal entries, mark receipt reversed, issue compensating receipt, audit log', () => {
    it('should create all expected compensating records atomically on successful reversal', async () => {
      const { loanId } = await createActiveLoan();
      const emiDue = await getFirstInstallmentDue(loanId);

      // Post a collection first
      const { collectionId } = await postCollectionAndGetId(loanId, emiDue);

      // Capture state before reversal
      const loanBeforeReversal = await dbUtils.findLoanById(loanId);
      const outstandingBeforeReversal = Number(loanBeforeReversal!.cached_outstanding_paise);

      // Execute reversal
      const revKey = idempKey('atomic-rev');
      const revRes = await clients.manager.post('/reversals').send({
        collectionId,
        reason: 'E2E test: atomic reversal verification',
        idempotencyKey: revKey,
      });

      expect(revRes.status).toBe(201);
      const revData = revRes.body.data ?? revRes.body;
      expect(revData.reversalCollectionId).toBeDefined();
      expect(revData.originalCollectionId).toBe(collectionId);
      expect(revData.mirrorJournalEntryId).toBeDefined();
      expect(revData.compensatingReceiptId).toBeDefined();

      // 1. Compensating collection record created (negative amount, is_reversal=true)
      const collections = await dbUtils.findCollectionsByLoanId(loanId);
      const reversalColl = collections.find(
        (c) => c.id === revData.reversalCollectionId,
      );
      expect(reversalColl).toBeDefined();
      expect(Number(reversalColl!.amount_paise)).toBe(-emiDue);
      expect(reversalColl!.is_reversal).toBe(true);

      // 2. Reverse allocation records created (negative amounts)
      const revAllocations = await dbUtils.sumAllocationsForCollection(
        revData.reversalCollectionId,
      );
      const totalRevAllocated =
        Number(revAllocations.penalty) +
        Number(revAllocations.interest) +
        Number(revAllocations.principal);
      expect(totalRevAllocated).toBe(-emiDue);

      // 3. Installment statuses restored (first installment back to pending)
      const schedulesAfter = await dbUtils.findSchedulesByLoanId(loanId);
      const firstAfter = schedulesAfter[0]!;
      expect(firstAfter.status).toBe('pending');
      expect(Number(firstAfter.principal_paid_paise)).toBe(0);
      expect(Number(firstAfter.interest_paid_paise)).toBe(0);

      // 4. Compensating journal entry created and balanced
      const mirrorLines = await dbUtils.findJournalLinesByEntryId(
        revData.mirrorJournalEntryId,
      );
      expect(mirrorLines.length).toBeGreaterThanOrEqual(2);
      const mirrorDebits = mirrorLines.reduce(
        (s, l) => s + Number(l.debit_paise),
        0,
      );
      const mirrorCredits = mirrorLines.reduce(
        (s, l) => s + Number(l.credit_paise),
        0,
      );
      expect(mirrorDebits).toBe(mirrorCredits);
      expect(mirrorDebits).toBe(emiDue);

      // 5. Original receipt marked as reversed
      const originalReceipt = await dbUtils.findReceiptByCollectionId(collectionId);
      expect(originalReceipt).not.toBeNull();
      expect(originalReceipt!.status).toBe('reversed');

      // 6. Compensating receipt issued
      const compensatingReceipt = await dbUtils.findReceiptByCollectionId(
        revData.reversalCollectionId,
      );
      expect(compensatingReceipt).not.toBeNull();

      // 7. Outstanding restored (increased by the reversed amount)
      const loanAfterReversal = await dbUtils.findLoanById(loanId);
      const outstandingAfterReversal = Number(
        loanAfterReversal!.cached_outstanding_paise,
      );
      expect(outstandingAfterReversal).toBe(outstandingBeforeReversal + emiDue);

      // 8. Audit log created for the reversal
      const auditLogs = await dbUtils.findAuditLogsByTarget(
        'collection',
        collectionId,
      );
      const reversalLog = auditLogs.find(
        (log) => String(log.action_type) === 'collection_reversed',
      );
      expect(reversalLog).toBeDefined();
      expect(reversalLog!.actor_id).toBeDefined();
      expect(reversalLog!.remarks).toBe(
        'E2E test: atomic reversal verification',
      );
    });
  });

  // ─── 7.2 Net Ledger Effect of Original + Reversal = Zero ───────────────

  describe('net ledger effect of original + reversal = zero', () => {
    it('should produce zero net ledger effect when original and reversal journal entries are summed', async () => {
      const { loanId } = await createActiveLoan();
      const emiDue = await getFirstInstallmentDue(loanId);

      // Post collection
      const { collectionId } = await postCollectionAndGetId(loanId, emiDue);

      // Get original journal entry ID
      const collectionsBefore = await dbUtils.findCollectionsByLoanId(loanId);
      const originalColl = collectionsBefore.find((c) => c.id === collectionId)!;
      const originalJournalId = originalColl.journal_entry_id;

      // Execute reversal
      const revKey = idempKey('ledger-zero');
      const revRes = await clients.manager.post('/reversals').send({
        collectionId,
        reason: 'E2E test: ledger neutrality verification',
        idempotencyKey: revKey,
      });
      expect(revRes.status).toBe(201);
      const revData = revRes.body.data ?? revRes.body;

      // Fetch original journal lines
      const originalLines = await dbUtils.findJournalLinesByEntryId(originalJournalId);

      // Fetch mirror journal lines
      const mirrorLines = await dbUtils.findJournalLinesByEntryId(
        revData.mirrorJournalEntryId,
      );

      // Sum all debits and credits across both entries
      let totalDebits = 0;
      let totalCredits = 0;

      for (const line of [...originalLines, ...mirrorLines]) {
        totalDebits += Number(line.debit_paise);
        totalCredits += Number(line.credit_paise);
      }

      // Net effect should be zero: total debits == total credits
      expect(totalDebits).toBe(totalCredits);

      // Per-account verification: for each account, net debit-credit should be zero
      const accountNetMap = new Map<string, number>();
      for (const line of [...originalLines, ...mirrorLines]) {
        const current = accountNetMap.get(line.account_id) ?? 0;
        accountNetMap.set(
          line.account_id,
          current + Number(line.debit_paise) - Number(line.credit_paise),
        );
      }

      for (const [, netAmount] of accountNetMap) {
        expect(netAmount).toBe(0);
      }
    });
  });

  // ─── 7.3 Prevent Reversal of Already-Reversed Collection ───────────────

  describe('prevent reversal of already-reversed collection', () => {
    it('should reject reversal of a collection that has already been reversed', async () => {
      const { loanId } = await createActiveLoan();
      const emiDue = await getFirstInstallmentDue(loanId);

      // Post and reverse a collection
      const { collectionId } = await postCollectionAndGetId(loanId, emiDue);

      const revKey1 = idempKey('double-rev-1');
      const revRes1 = await clients.manager.post('/reversals').send({
        collectionId,
        reason: 'First reversal',
        idempotencyKey: revKey1,
      });
      expect(revRes1.status).toBe(201);

      // Attempt to reverse the same collection again
      const revKey2 = idempKey('double-rev-2');
      const revRes2 = await clients.manager.post('/reversals').send({
        collectionId,
        reason: 'Second reversal attempt',
        idempotencyKey: revKey2,
      });

      expect([400, 409, 422]).toContain(revRes2.status);
      expect(revRes2.body.code).toBe('COLLECTION_ALREADY_REVERSED');
    });
  });

  // ─── 7.4 Prevent Reversal of a Reversal (No Chained Reversals) ────────

  describe('prevent reversal of a reversal (no chained reversals)', () => {
    it('should reject reversal of a collection that is itself a reversal', async () => {
      const { loanId } = await createActiveLoan();
      const emiDue = await getFirstInstallmentDue(loanId);

      // Post a collection and reverse it
      const { collectionId } = await postCollectionAndGetId(loanId, emiDue);

      const revKey1 = idempKey('chain-rev-1');
      const revRes1 = await clients.manager.post('/reversals').send({
        collectionId,
        reason: 'Original reversal',
        idempotencyKey: revKey1,
      });
      expect(revRes1.status).toBe(201);
      const revData = revRes1.body.data ?? revRes1.body;

      // Attempt to reverse the reversal itself
      const revKey2 = idempKey('chain-rev-2');
      const revRes2 = await clients.manager.post('/reversals').send({
        collectionId: revData.reversalCollectionId,
        reason: 'Attempt to reverse a reversal',
        idempotencyKey: revKey2,
      });

      expect([400, 422]).toContain(revRes2.status);
      expect(revRes2.body.code).toBe('CANNOT_REVERSE_REVERSAL');
    });
  });

  // ─── 7.5 Reversal Recalculates DPD and overdue_bucket ─────────────────

  describe('reversal recalculates DPD and overdue_bucket', () => {
    it('should recalculate DPD and overdue_bucket after reversal', async () => {
      const { loanId } = await createActiveLoan();
      const emiDue = await getFirstInstallmentDue(loanId);

      // Post a collection (pays first installment)
      const { collectionId } = await postCollectionAndGetId(loanId, emiDue);

      // Capture loan state after collection
      const loanAfterCollection = await dbUtils.findLoanById(loanId);
      const dpdAfterCollection = loanAfterCollection!.dpd;

      // Reverse the collection
      const revKey = idempKey('dpd-rev');
      const revRes = await clients.manager.post('/reversals').send({
        collectionId,
        reason: 'E2E test: DPD recalculation after reversal',
        idempotencyKey: revKey,
      });
      expect(revRes.status).toBe(201);

      // Verify DPD and overdue_bucket were recalculated
      const loanAfterReversal = await dbUtils.findLoanById(loanId);
      expect(loanAfterReversal!.dpd).toBeDefined();
      expect(loanAfterReversal!.overdue_bucket).toBeDefined();

      // After reversal, the first installment is unpaid again, so DPD should
      // be >= what it was after collection (since the payment was undone)
      expect(loanAfterReversal!.dpd).toBeGreaterThanOrEqual(dpdAfterCollection ?? 0);
    });
  });

  // ─── 7.6 Reversal Recorded in Audit Logs ──────────────────────────────

  describe('reversal recorded in audit_logs with actor, reason, timestamp', () => {
    it('should create an audit log entry with actor identity, reason, and timestamp', async () => {
      const { loanId } = await createActiveLoan();
      const emiDue = await getFirstInstallmentDue(loanId);

      // Post a collection
      const { collectionId } = await postCollectionAndGetId(loanId, emiDue);

      // Reverse the collection
      const revKey = idempKey('audit-rev');
      const reason = 'E2E test: audit log verification for reversal';
      const revRes = await clients.manager.post('/reversals').send({
        collectionId,
        reason,
        idempotencyKey: revKey,
      });
      expect(revRes.status).toBe(201);

      // Verify audit log entry
      const auditLogs = await dbUtils.findAuditLogsByTarget(
        'collection',
        collectionId,
      );
      const reversalLog = auditLogs.find(
        (log) => String(log.action_type) === 'collection_reversed',
      );

      expect(reversalLog).toBeDefined();

      // Actor identity
      expect(reversalLog!.actor_id).toBeDefined();
      expect(reversalLog!.actor_role).toBeDefined();

      // Reason
      expect(reversalLog!.remarks).toBe(reason);

      // Timestamp
      expect(reversalLog!.created_at).toBeDefined();
      expect(new Date(reversalLog!.created_at).getTime()).toBeGreaterThan(0);

      // Before/after state captured
      const beforeState = reversalLog!.before_state as Record<string, unknown> | null;
      const afterState = reversalLog!.after_state as Record<string, unknown> | null;
      expect(beforeState).toBeDefined();
      expect(afterState).toBeDefined();
      expect(beforeState!['collection_id']).toBe(collectionId);
      expect(afterState!['reversal_collection_id']).toBeDefined();
    });
  });

  // ─── Original Collection Status After Reversal ─────────────────────────

  describe('original collection marked as reversed after reversal', () => {
    it('should mark the original collection status as reversed', async () => {
      const { loanId } = await createActiveLoan();
      const emiDue = await getFirstInstallmentDue(loanId);

      const { collectionId } = await postCollectionAndGetId(loanId, emiDue);

      // Verify original collection is 'posted' before reversal
      const collsBefore = await dbUtils.findCollectionsByLoanId(loanId);
      const origBefore = collsBefore.find((c) => c.id === collectionId)!;
      expect(origBefore.status).toBe('posted');

      // Reverse
      const revKey = idempKey('status-rev');
      const revRes = await clients.manager.post('/reversals').send({
        collectionId,
        reason: 'E2E test: verify original status change',
        idempotencyKey: revKey,
      });
      expect(revRes.status).toBe(201);

      // Verify original collection is now 'reversed'
      const collsAfter = await dbUtils.findCollectionsByLoanId(loanId);
      const origAfter = collsAfter.find((c) => c.id === collectionId)!;
      expect(origAfter.status).toBe('reversed');
    });
  });
});
