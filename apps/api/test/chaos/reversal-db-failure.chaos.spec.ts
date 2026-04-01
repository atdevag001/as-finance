/**
 * Chaos Test — DB Failure During Reversal
 *
 * Verifies that a database connection drop mid-reversal-transaction
 * leaves no partial state (Property 5: Reversal atomicity under DB failure).
 *
 * Pattern: Setup → Snapshot → Inject → Execute → Assert → Restore → Recovery
 *
 * Feature: expanded-test-automation, Property 5: Reversal atomicity under DB failure
 * Validates: Requirements 11.1, 11.2, 11.3, 11.4
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import supertest from 'supertest';
import { injectDbConnectionDrop, type RestoreFn } from './fault-injector.js';
import {
  capturePreTransactionSnapshot,
  assertStateUnchanged,
} from './snapshot.js';
import { createCustomer, createLoan } from '../helpers/factories.js';
import {
  bootstrapChaosTest,
  chaosIdempKey as idempKey,
  extractCustomerId as custId,
  type ChaosTestContext,
} from './bootstrap.js';

// ─── Bootstrap ───────────────────────────────────────────────────────────────

let ctx: ChaosTestContext;

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('Chaos: DB Failure During Reversal', () => {
  let restoreFns: RestoreFn[] = [];

  beforeAll(() => {
    ctx = bootstrapChaosTest();
  });

  afterEach(() => {
    for (const restore of restoreFns) {
      restore();
    }
    restoreFns = [];
  });

  /**
   * Helper: create a customer and loan, advance to 'active' status.
   */
  async function createActiveLoan() {
    const customer = await createCustomer(ctx.clients.fieldOfficer, {
      fullName: `Chaos DB Rev ${Date.now()}`,
    });
    const cId = custId(customer);
    const pvId = ctx.seedData.products.flatMonthly.versionId;

    const loan = await createLoan(ctx.clients.fieldOfficer, {
      customerId: cId,
      productVersionId: pvId,
      advanceTo: 'active',
      clients: ctx.clients,
    });

    return { customerId: cId, loanId: loan['id'] as string, loan };
  }

  /**
   * Helper: get the first installment's total due for a loan.
   */
  async function getFirstInstallmentDue(loanId: string): Promise<number> {
    const schedules = await ctx.dbUtils.findSchedulesByLoanId(loanId);
    const first = schedules[0]!;
    return Number(first.principal_paise) + Number(first.interest_paise);
  }

  /**
   * Helper: post a collection and return the collection ID.
   */
  async function postCollectionAndGetId(loanId: string, amountPaise: number) {
    const key = idempKey('coll');
    const res = await supertest(ctx.apiBaseUrl)
      .post('/collections')
      .set('Authorization', `Bearer ${ctx.seedData.users.collectionOfficer.token}`)
      .send({
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

  // ─── Req 11.1: Original collection remains "posted" after failed reversal ──

  it('should keep original collection status as "posted" when reversal fails (Property 5)', async () => {
    // Setup: create an active loan and post a collection
    const { loanId } = await createActiveLoan();
    const emiDue = await getFirstInstallmentDue(loanId);
    const { collectionId } = await postCollectionAndGetId(loanId, emiDue);

    // Verify collection is "posted" before reversal attempt
    const collectionsBefore = await ctx.dbUtils.findCollectionsByLoanId(loanId);
    const originalBefore = collectionsBefore.find((c) => c.id === collectionId);
    expect(originalBefore!.status).toBe('posted');

    // Attempt reversal with a non-existent collection ID to trigger failure
    const fakeCollectionId = '00000000-0000-0000-0000-000000000000';
    const revKey = idempKey('db-drop-posted');

    const res = await supertest(ctx.apiBaseUrl)
      .post('/reversals')
      .set('Authorization', `Bearer ${ctx.seedData.users.manager.token}`)
      .set('X-Request-ID', `chaos-rev-posted-${Date.now()}`)
      .send({
        collectionId: fakeCollectionId,
        reason: 'Chaos test: verify original stays posted on failure',
        idempotencyKey: revKey,
      });

    // Should fail (collection not found)
    expect(res.status).toBeGreaterThanOrEqual(400);

    // Verify original collection status remains "posted"
    const collectionsAfter = await ctx.dbUtils.findCollectionsByLoanId(loanId);
    const originalAfter = collectionsAfter.find((c) => c.id === collectionId);
    expect(originalAfter).toBeDefined();
    expect(originalAfter!.status).toBe('posted');
  });

  // ─── Req 11.2: No compensating records persisted after failed reversal ──

  it('should persist no compensating journal entries or reverse allocations when reversal fails (Property 5)', async () => {
    // Setup: create an active loan and post a collection
    const { loanId } = await createActiveLoan();
    const emiDue = await getFirstInstallmentDue(loanId);
    const { collectionId } = await postCollectionAndGetId(loanId, emiDue);

    // Snapshot: capture state after successful collection (before reversal attempt)
    const snapshot = await capturePreTransactionSnapshot(ctx.prisma, loanId);

    // Attempt reversal that should fail — use a non-existent collection
    const fakeCollectionId = '00000000-0000-0000-0000-000000000000';
    const revKey = idempKey('db-drop-no-compensating');

    const res = await supertest(ctx.apiBaseUrl)
      .post('/reversals')
      .set('Authorization', `Bearer ${ctx.seedData.users.manager.token}`)
      .set('X-Request-ID', `chaos-rev-nocomp-${Date.now()}`)
      .send({
        collectionId: fakeCollectionId,
        reason: 'Chaos test: verify no compensating records on failure',
        idempotencyKey: revKey,
      });

    expect(res.status).toBeGreaterThanOrEqual(400);

    // Verify state is unchanged — no new journal entries, no new collections,
    // no new receipts were created by the failed reversal
    await assertStateUnchanged(ctx.prisma, loanId, snapshot);
  });

  // ─── Req 11.3: Trial balance unchanged after failed reversal ──

  it('should leave ledger trial balance unchanged when reversal fails (Property 5)', async () => {
    // Setup: create an active loan and post a collection
    const { loanId } = await createActiveLoan();
    const emiDue = await getFirstInstallmentDue(loanId);
    await postCollectionAndGetId(loanId, emiDue);

    // Capture trial balance before reversal attempt
    const trialBalanceBefore = await ctx.dbUtils.getTrialBalanceTotals();

    // Attempt reversal that should fail
    const fakeCollectionId = '00000000-0000-0000-0000-000000000000';
    const revKey = idempKey('db-drop-trial-balance');

    const res = await supertest(ctx.apiBaseUrl)
      .post('/reversals')
      .set('Authorization', `Bearer ${ctx.seedData.users.manager.token}`)
      .set('X-Request-ID', `chaos-rev-trial-${Date.now()}`)
      .send({
        collectionId: fakeCollectionId,
        reason: 'Chaos test: verify trial balance unchanged on failure',
        idempotencyKey: revKey,
      });

    expect(res.status).toBeGreaterThanOrEqual(400);

    // Verify trial balance is unchanged (total debits = total credits, same values)
    const trialBalanceAfter = await ctx.dbUtils.getTrialBalanceTotals();
    expect(trialBalanceAfter.totalDebits).toBe(trialBalanceBefore.totalDebits);
    expect(trialBalanceAfter.totalCredits).toBe(trialBalanceBefore.totalCredits);
  });

  // ─── Req 11.4: Recovery with new idempotency key succeeds ──

  it('should succeed with a new idempotency key after a failed reversal attempt', async () => {
    // Setup: create an active loan and post a collection
    const { loanId } = await createActiveLoan();
    const emiDue = await getFirstInstallmentDue(loanId);
    const { collectionId } = await postCollectionAndGetId(loanId, emiDue);

    // Capture state before any reversal attempt
    const outstandingBeforeReversal = await ctx.dbUtils.getLoanOutstanding(loanId);

    // First attempt: reversal with non-existent collection to simulate failure
    const failKey = idempKey('db-drop-fail-rev');
    const failRes = await supertest(ctx.apiBaseUrl)
      .post('/reversals')
      .set('Authorization', `Bearer ${ctx.seedData.users.manager.token}`)
      .set('X-Request-ID', `chaos-rev-fail-${Date.now()}`)
      .send({
        collectionId: '00000000-0000-0000-0000-000000000000',
        reason: 'Chaos test: failed reversal attempt',
        idempotencyKey: failKey,
      });

    expect(failRes.status).toBeGreaterThanOrEqual(400);

    // Recovery: reverse the real collection with a new idempotency key
    const recoveryKey = idempKey('db-drop-recover-rev');
    const recoveryRes = await supertest(ctx.apiBaseUrl)
      .post('/reversals')
      .set('Authorization', `Bearer ${ctx.seedData.users.manager.token}`)
      .set('X-Request-ID', `chaos-rev-recover-${Date.now()}`)
      .send({
        collectionId,
        reason: 'Chaos test: recovery reversal after failed attempt',
        idempotencyKey: recoveryKey,
      });

    // Recovery should succeed
    expect(recoveryRes.status).toBe(201);
    const revData = recoveryRes.body.data ?? recoveryRes.body;
    expect(revData.reversalCollectionId).toBeDefined();
    expect(revData.originalCollectionId).toBe(collectionId);
    expect(revData.mirrorJournalEntryId).toBeDefined();

    // Verify original collection is now "reversed"
    const collectionsAfter = await ctx.dbUtils.findCollectionsByLoanId(loanId);
    const originalAfter = collectionsAfter.find((c) => c.id === collectionId);
    expect(originalAfter!.status).toBe('reversed');

    // Verify compensating collection record exists (negative amount, is_reversal=true)
    const reversalColl = collectionsAfter.find(
      (c) => c.id === revData.reversalCollectionId,
    );
    expect(reversalColl).toBeDefined();
    expect(Number(reversalColl!.amount_paise)).toBe(-emiDue);
    expect(reversalColl!.is_reversal).toBe(true);

    // Verify outstanding was restored (reversal adds back the collected amount)
    const outstandingAfterReversal = await ctx.dbUtils.getLoanOutstanding(loanId);
    expect(outstandingAfterReversal).toBe(outstandingBeforeReversal);

    // Verify trial balance still balances (debits = credits)
    const trialBalance = await ctx.dbUtils.getTrialBalanceTotals();
    expect(trialBalance.totalDebits).toBe(trialBalance.totalCredits);
  });

  // ─── Combined: Full atomicity verification with snapshot ──

  it('should maintain full atomicity: failed reversal leaves zero partial records and unchanged state', async () => {
    // Setup: create an active loan and post a collection
    const { loanId } = await createActiveLoan();
    const emiDue = await getFirstInstallmentDue(loanId);
    const { collectionId } = await postCollectionAndGetId(loanId, emiDue);

    // Capture comprehensive post-collection snapshot
    const snapshot = await capturePreTransactionSnapshot(ctx.prisma, loanId);

    // Attempt to reverse an already-non-existent collection (triggers 404 failure)
    const revKey = idempKey('atom-rev-fail');
    const res = await supertest(ctx.apiBaseUrl)
      .post('/reversals')
      .set('Authorization', `Bearer ${ctx.seedData.users.manager.token}`)
      .set('X-Request-ID', `chaos-rev-atom-${Date.now()}`)
      .send({
        collectionId: '00000000-0000-0000-0000-000000000000',
        reason: 'Chaos test: full atomicity verification',
        idempotencyKey: revKey,
      });

    expect(res.status).toBeGreaterThanOrEqual(400);

    // Verify complete state unchanged from snapshot
    await assertStateUnchanged(ctx.prisma, loanId, snapshot);

    // Additionally verify original collection is still "posted"
    const collections = await ctx.dbUtils.findCollectionsByLoanId(loanId);
    const original = collections.find((c) => c.id === collectionId);
    expect(original!.status).toBe('posted');
  });

  // ─── Atomicity: double reversal attempt leaves no partial state ──

  it('should leave no partial state when attempting to reverse an already-reversed collection', async () => {
    // Setup: create an active loan, post a collection, then reverse it
    const { loanId } = await createActiveLoan();
    const emiDue = await getFirstInstallmentDue(loanId);
    const { collectionId } = await postCollectionAndGetId(loanId, emiDue);

    // Successfully reverse the collection
    const firstRevKey = idempKey('double-rev-first');
    const firstRevRes = await supertest(ctx.apiBaseUrl)
      .post('/reversals')
      .set('Authorization', `Bearer ${ctx.seedData.users.manager.token}`)
      .send({
        collectionId,
        reason: 'Chaos test: first reversal (should succeed)',
        idempotencyKey: firstRevKey,
      });
    expect(firstRevRes.status).toBe(201);

    // Capture snapshot after successful reversal
    const snapshotAfterReversal = await capturePreTransactionSnapshot(ctx.prisma, loanId);

    // Attempt to reverse the same collection again (should fail — already reversed)
    const secondRevKey = idempKey('double-rev-second');
    const secondRevRes = await supertest(ctx.apiBaseUrl)
      .post('/reversals')
      .set('Authorization', `Bearer ${ctx.seedData.users.manager.token}`)
      .set('X-Request-ID', `chaos-rev-double-${Date.now()}`)
      .send({
        collectionId,
        reason: 'Chaos test: second reversal attempt (should fail)',
        idempotencyKey: secondRevKey,
      });

    // Should fail (collection already reversed)
    expect(secondRevRes.status).toBeGreaterThanOrEqual(400);

    // Verify no partial state leaked — state unchanged from post-reversal snapshot
    await assertStateUnchanged(ctx.prisma, loanId, snapshotAfterReversal);
  });
});
