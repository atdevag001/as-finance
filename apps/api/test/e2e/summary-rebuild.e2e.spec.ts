import { describe, it, expect, beforeAll } from 'vitest';
import { getApiBaseUrl, getUserTokens, getSeedData } from '../helpers/seed.js';
import { createAuthClients, type AuthClients } from '../helpers/auth-client.js';
import { createDbUtils, type DbUtils } from '../helpers/db-utils.js';
import { createCustomer, createLoan, postCollection } from '../helpers/factories.js';
import type { SeedData } from '../setup/global-setup.js';

/**
 * Summary Rebuildability E2E Tests
 *
 * Validates Financial Invariant FI-10: all summary/derived fields must be
 * rebuildable from source-of-truth events. Specifically verifies that
 * cached_outstanding_paise matches the value recomputed from raw schedule
 * data and allocation records after complex operation sequences.
 *
 * Addresses traceability gap: FI-10 was PARTIAL, now FULL.
 * Validates: FI-10, Requirements 25.10
 */

describe('Summary Rebuildability E2E', () => {
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

  /**
   * Recompute outstanding from raw schedule data:
   * outstanding = sum(principal_paise - principal_paid_paise + interest_paise - interest_paid_paise)
   * for all installments, plus any unpaid penalties.
   */
  async function recomputeOutstanding(loanId: string): Promise<bigint> {
    const schedules = await dbUtils.findSchedulesByLoanId(loanId);
    let outstanding = BigInt(0);

    for (const inst of schedules) {
      const principalRemaining = inst.principal_paise - inst.principal_paid_paise;
      const interestRemaining = inst.interest_paise - inst.interest_paid_paise;
      outstanding += principalRemaining + interestRemaining;
    }

    // Add unpaid penalties
    const penalties = await dbUtils.findPenaltiesByLoanId(loanId);
    for (const pen of penalties) {
      if (!pen.is_paid && !pen.is_waived) {
        outstanding += pen.amount_paise;
      }
    }

    return outstanding;
  }

  async function createActiveLoan() {
    const customer = await createCustomer(clients.fieldOfficer, {
      fullName: `Rebuild Test ${Date.now()}`,
    });
    const cId = (customer as Record<string, unknown>)['id'] as string;
    const pvId = seedData.products.flatMonthly.versionId;

    const loan = await createLoan(clients.fieldOfficer, {
      customerId: cId,
      productVersionId: pvId,
      advanceTo: 'active',
      clients,
    });

    return { customerId: cId, loanId: loan['id'] as string };
  }

  // ── FI-10: Cached outstanding matches recomputed after single payment ──

  it('should have cached outstanding equal to recomputed outstanding after a single collection', async () => {
    const { loanId } = await createActiveLoan();

    // Get first installment amount
    const schedules = await dbUtils.findSchedulesByLoanId(loanId);
    const firstEmi = Number(schedules[0]!.principal_paise + schedules[0]!.interest_paise);

    // Post one collection
    await postCollection(clients.collectionOfficer, {
      loanId,
      amountPaise: firstEmi,
    });

    // Compare cached vs recomputed
    const cachedOutstanding = await dbUtils.getLoanOutstanding(loanId);
    const recomputed = await recomputeOutstanding(loanId);

    expect(cachedOutstanding).toBe(recomputed);
  });

  // ── FI-10: Cached outstanding matches after multiple sequential payments ──

  it('should have cached outstanding equal to recomputed outstanding after multiple sequential collections', async () => {
    const { loanId } = await createActiveLoan();

    const schedules = await dbUtils.findSchedulesByLoanId(loanId);
    const firstEmi = Number(schedules[0]!.principal_paise + schedules[0]!.interest_paise);

    // Post 3 sequential collections
    for (let i = 0; i < 3; i++) {
      await postCollection(clients.collectionOfficer, {
        loanId,
        amountPaise: firstEmi,
      });
    }

    const cachedOutstanding = await dbUtils.getLoanOutstanding(loanId);
    const recomputed = await recomputeOutstanding(loanId);

    expect(cachedOutstanding).toBe(recomputed);
    // Outstanding should have decreased by 3 EMIs
    expect(cachedOutstanding).toBeLessThan(
      schedules.reduce((s, inst) => s + inst.principal_paise + inst.interest_paise, BigInt(0)),
    );
  });

  // ── FI-10: Cached outstanding matches after partial payment ──

  it('should have cached outstanding equal to recomputed outstanding after a partial payment', async () => {
    const { loanId } = await createActiveLoan();

    // Post a partial payment (half of first EMI)
    const schedules = await dbUtils.findSchedulesByLoanId(loanId);
    const halfEmi = Math.floor(Number(schedules[0]!.principal_paise + schedules[0]!.interest_paise) / 2);

    await postCollection(clients.collectionOfficer, {
      loanId,
      amountPaise: halfEmi,
    });

    const cachedOutstanding = await dbUtils.getLoanOutstanding(loanId);
    const recomputed = await recomputeOutstanding(loanId);

    expect(cachedOutstanding).toBe(recomputed);
  });

  // ── FI-10: Cached outstanding matches after collection + reversal ──

  it('should have cached outstanding equal to recomputed outstanding after collection then reversal', async () => {
    const { loanId } = await createActiveLoan();

    const schedules = await dbUtils.findSchedulesByLoanId(loanId);
    const firstEmi = Number(schedules[0]!.principal_paise + schedules[0]!.interest_paise);

    // Capture outstanding before
    const outstandingBefore = await dbUtils.getLoanOutstanding(loanId);

    // Post collection
    const collRes = await clients.collectionOfficer.post('/collections').send({
      loanId,
      amountPaise: firstEmi,
      paymentMode: 'cash',
      paymentDate: '2024-01-15',
      idempotencyKey: `rebuild-rev-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    });
    const collectionId = (collRes.body.data ?? collRes.body).collectionId;

    // Reverse the collection
    await clients.manager.post('/reversals').send({
      collectionId,
      reason: 'E2E rebuild test reversal',
      idempotencyKey: `rebuild-rev-r-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    });

    // After reversal, outstanding should be back to original
    const cachedOutstanding = await dbUtils.getLoanOutstanding(loanId);
    const recomputed = await recomputeOutstanding(loanId);

    expect(cachedOutstanding).toBe(recomputed);
    expect(cachedOutstanding).toBe(outstandingBefore);
  });

  // ── FI-10: Trial balance remains balanced after complex sequence ──

  it('should maintain trial balance equality after collection + reversal sequence', async () => {
    const { loanId } = await createActiveLoan();

    const schedules = await dbUtils.findSchedulesByLoanId(loanId);
    const firstEmi = Number(schedules[0]!.principal_paise + schedules[0]!.interest_paise);

    // Post collection
    const collRes = await clients.collectionOfficer.post('/collections').send({
      loanId,
      amountPaise: firstEmi,
      paymentMode: 'cash',
      paymentDate: '2024-01-15',
      idempotencyKey: `rebuild-tb-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    });
    const collectionId = (collRes.body.data ?? collRes.body).collectionId;

    // Reverse
    await clients.manager.post('/reversals').send({
      collectionId,
      reason: 'Trial balance test',
      idempotencyKey: `rebuild-tb-r-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    });

    // Post another collection
    await postCollection(clients.collectionOfficer, {
      loanId,
      amountPaise: firstEmi,
    });

    // Trial balance must remain balanced
    const { totalDebits, totalCredits } = await dbUtils.getTrialBalanceTotals();
    expect(totalDebits).toBe(totalCredits);
  });
});
