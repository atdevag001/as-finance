import { describe, it, expect, beforeAll } from 'vitest';
import * as fc from 'fast-check';
import { getApiBaseUrl, getUserTokens, getSeedData } from '../helpers/seed.js';
import { createAuthClients, type AuthClients } from '../helpers/auth-client.js';
import { createDbUtils, type DbUtils } from '../helpers/db-utils.js';
import { createCustomer, createLoan, postCollection } from '../helpers/factories.js';
import { arbPaiseAmount } from '../helpers/arbitraries.js';
import type { SeedData } from '../setup/global-setup.js';

/**
 * Advance Payment Property-Based Tests
 *
 * Verifies the finance-critical invariant for advance (excess) payments:
 *
 * - Property 24: Advance Payment Allocation to Future Installments —
 *   Excess allocated to future installments in chronological order;
 *   paid amounts don't exceed due amounts; total allocated == collection amount.
 *
 * **Validates: Requirements 6.6 (advance payments)**
 */

describe('Advance Payment PBT', () => {
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
   * Helper: create a fresh active loan and return its ID, schedule info,
   * and the first EMI amount for computing advance payment multiples.
   */
  async function createActiveLoanForAdvancePBT(): Promise<{
    loanId: string;
    totalOutstandingPaise: number;
    firstEmiPaise: number;
    installmentCount: number;
  }> {
    const customer = await createCustomer(clients.fieldOfficer, {
      fullName: `PBT Advance Customer ${Date.now()}`,
    });
    const cId = custId(customer);

    const loan = await createLoan(clients.fieldOfficer, {
      customerId: cId,
      productVersionId: seedData.products.flatMonthly.versionId,
      advanceTo: 'active',
      clients,
    });

    const loanId = loan['id'] as string;
    const loanRecord = await dbUtils.findLoanById(loanId);
    const totalOutstandingPaise = Number(loanRecord!.cached_outstanding_paise);

    const schedules = await dbUtils.findSchedulesByLoanId(loanId);
    const firstEmiPaise = Number(schedules[0]!.total_paise);
    const installmentCount = schedules.length;

    return { loanId, totalOutstandingPaise, firstEmiPaise, installmentCount };
  }

  // ─── Property 24: Advance Payment Allocation to Future Installments ────

  /**
   * **Validates: Requirements 6.6**
   *
   * Property 24: Advance Payment Allocation to Future Installments
   *
   * For all collection amounts that exceed the total current and overdue dues
   * on a loan, the allocation engine SHALL allocate the excess to future
   * installments in strict chronological order (earliest due date first).
   * After allocation, each future installment's paid amounts SHALL not exceed
   * its due amounts, and the total allocated across all installments SHALL
   * equal the collection amount.
   */
  describe('Property 24: Advance Payment Allocation to Future Installments', () => {
    it('excess is allocated to future installments in chronological order, paid <= due, total allocated == collection amount', async () => {
      // Create a fresh active loan for advance payment testing
      const { loanId, totalOutstandingPaise, firstEmiPaise, installmentCount } =
        await createActiveLoanForAdvancePBT();

      // Generate a random multiplier (2-5) to cover multiple EMIs as an advance payment
      const emiMultiplierArb = fc.integer({ min: 2, max: Math.min(5, installmentCount) });

      let remainingOutstanding = totalOutstandingPaise;

      await fc.assert(
        fc.asyncProperty(emiMultiplierArb, async (multiplier) => {
          // Skip if we've exhausted the outstanding balance
          if (remainingOutstanding <= 0) return;

          // Compute advance amount as multiplier × first EMI, clamped to remaining outstanding
          const advanceAmount = Math.min(firstEmiPaise * multiplier, remainingOutstanding);
          if (advanceAmount < 100) return;

          // Post the advance collection
          const collection = await postCollection(clients.collectionOfficer, {
            loanId,
            amountPaise: advanceAmount,
          });

          const collectionId =
            collection['collectionId'] ??
            collection['data']?.['collectionId'] ??
            collection['id'];

          // ── Invariant 1: Total allocated == collection amount ──────────

          const allocations = await dbUtils.sumAllocationsForCollection(collectionId);
          const totalAllocated =
            Number(allocations.penalty) +
            Number(allocations.interest) +
            Number(allocations.principal);

          expect(totalAllocated).toBe(advanceAmount);

          // ── Invariant 2: Installments paid in chronological order ─────
          //    (no skipping — if installment N has any payment, all
          //     installments < N must be fully paid or also have payments)

          const schedules = await dbUtils.findSchedulesByLoanId(loanId);

          // Find the last installment that has received any payment
          let lastPaidIndex = -1;
          for (let i = 0; i < schedules.length; i++) {
            const s = schedules[i]!;
            const hasPaid =
              Number(s.principal_paid_paise) > 0 ||
              Number(s.interest_paid_paise) > 0 ||
              Number(s.penalty_paid_paise) > 0;
            if (hasPaid) lastPaidIndex = i;
          }

          // All installments before the last paid one must also have payments
          for (let i = 0; i < lastPaidIndex; i++) {
            const s = schedules[i]!;
            const totalPaid =
              Number(s.principal_paid_paise) +
              Number(s.interest_paid_paise) +
              Number(s.penalty_paid_paise);
            expect(totalPaid).toBeGreaterThan(0);
          }

          // ── Invariant 3: Paid amounts don't exceed due amounts ────────

          for (const s of schedules) {
            expect(Number(s.principal_paid_paise)).toBeLessThanOrEqual(
              Number(s.principal_paise),
            );
            expect(Number(s.interest_paid_paise)).toBeLessThanOrEqual(
              Number(s.interest_paise),
            );
          }

          // ── Invariant 4: Future installments beyond advance are pending ─

          if (lastPaidIndex < schedules.length - 1) {
            for (let i = lastPaidIndex + 1; i < schedules.length; i++) {
              const s = schedules[i]!;
              const totalPaid =
                Number(s.principal_paid_paise) +
                Number(s.interest_paid_paise) +
                Number(s.penalty_paid_paise);
              expect(totalPaid).toBe(0);
              expect(s.status).toBe('pending');
            }
          }

          remainingOutstanding -= advanceAmount;
        }),
        { numRuns: 100 },
      );
    });
  });
});
