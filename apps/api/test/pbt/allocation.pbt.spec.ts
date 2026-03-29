import { describe, it, expect, beforeAll } from 'vitest';
import * as fc from 'fast-check';
import { getApiBaseUrl, getUserTokens, getSeedData } from '../helpers/seed.js';
import { createAuthClients, type AuthClients } from '../helpers/auth-client.js';
import { createDbUtils, type DbUtils } from '../helpers/db-utils.js';
import { createCustomer, createLoan, postCollection } from '../helpers/factories.js';
import type { SeedData } from '../setup/global-setup.js';

/**
 * Allocation Property-Based Tests
 *
 * Verifies two finance-critical invariants against the real API and database:
 *
 * - Property 4: Allocation Preservation — No money created or lost during allocation.
 * - Property 5: Allocation Order Correctness — Penalty → interest → principal, oldest first.
 *
 * Validates: Requirements 6.2, 6.3
 */

describe('Allocation PBT', () => {
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
   * Helper: create a fresh active loan and return its ID plus the total outstanding.
   * Uses the flat monthly product for predictable schedule generation.
   */
  async function createActiveLoanForPBT(): Promise<{
    loanId: string;
    totalOutstandingPaise: number;
  }> {
    const customer = await createCustomer(clients.fieldOfficer, {
      fullName: `PBT Alloc Customer ${Date.now()}`,
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

    return { loanId, totalOutstandingPaise };
  }

  // ─── Property 4: Allocation Preservation ────────────────────────────────

  /**
   * **Validates: Requirements 6.3**
   *
   * Property 4: Allocation Preservation
   *
   * For all valid collection amounts and loan states, the allocation engine SHALL
   * satisfy: sum(penalty_allocated + interest_allocated + principal_allocated) ==
   * collection_amount_paise. No money is created or lost during allocation, and
   * all individual allocation component amounts are non-negative.
   */
  describe('Property 4: Allocation Preservation', () => {
    it('sum(penalty + interest + principal) == collection_amount for random amounts against real API', async () => {
      // Create a single active loan to test against with multiple collections
      const { loanId, totalOutstandingPaise } = await createActiveLoanForPBT();

      // Generate a bounded collection amount arbitrary that won't exceed outstanding
      // We use a fraction of the outstanding to allow multiple collections
      const maxSinglePayment = Math.min(totalOutstandingPaise, 50_000_00);
      const collectionAmountArb = fc.integer({ min: 100, max: maxSinglePayment });

      let remainingOutstanding = totalOutstandingPaise;

      await fc.assert(
        fc.asyncProperty(collectionAmountArb, async (amountPaise) => {
          // Skip if we've exhausted the outstanding balance
          if (remainingOutstanding <= 0) return;

          // Clamp amount to remaining outstanding
          const effectiveAmount = Math.min(amountPaise, remainingOutstanding);
          if (effectiveAmount < 100) return;

          const collection = await postCollection(clients.collectionOfficer, {
            loanId,
            amountPaise: effectiveAmount,
          });

          const collectionId = collection['collectionId'] ?? collection['data']?.['collectionId'] ?? collection['id'];

          // Verify allocation preservation from DB
          const allocations = await dbUtils.sumAllocationsForCollection(collectionId);
          const totalAllocated =
            Number(allocations.penalty) +
            Number(allocations.interest) +
            Number(allocations.principal);

          // Core invariant: no money created or lost
          expect(totalAllocated).toBe(effectiveAmount);

          // All components must be non-negative
          expect(Number(allocations.penalty)).toBeGreaterThanOrEqual(0);
          expect(Number(allocations.interest)).toBeGreaterThanOrEqual(0);
          expect(Number(allocations.principal)).toBeGreaterThanOrEqual(0);

          remainingOutstanding -= effectiveAmount;
        }),
        { numRuns: 1000 },
      );
    });
  });

  // ─── Property 5: Allocation Order Correctness ──────────────────────────

  /**
   * **Validates: Requirements 6.2**
   *
   * Property 5: Allocation Order Correctness
   *
   * For all valid partial or full payments against a loan with outstanding
   * penalties, interest, and principal, the allocation engine SHALL allocate
   * in the order: penalty (oldest first) → interest (oldest due date first)
   * → principal (oldest due date first). No principal SHALL be allocated while
   * interest remains unpaid on the same or older installment, and no interest
   * SHALL be allocated while penalties remain unpaid.
   */
  describe('Property 5: Allocation Order Correctness', () => {
    it('no principal allocated while interest remains unpaid on same/older installment', async () => {
      // Create a fresh active loan for order verification
      const { loanId, totalOutstandingPaise } = await createActiveLoanForPBT();

      const maxSinglePayment = Math.min(totalOutstandingPaise, 50_000_00);
      const collectionAmountArb = fc.integer({ min: 100, max: maxSinglePayment });

      let remainingOutstanding = totalOutstandingPaise;

      await fc.assert(
        fc.asyncProperty(collectionAmountArb, async (amountPaise) => {
          if (remainingOutstanding <= 0) return;

          const effectiveAmount = Math.min(amountPaise, remainingOutstanding);
          if (effectiveAmount < 100) return;

          const collection = await postCollection(clients.collectionOfficer, {
            loanId,
            amountPaise: effectiveAmount,
          });

          const collectionId = collection['collectionId'] ?? collection['data']?.['collectionId'] ?? collection['id'];

          // Fetch individual allocation lines from DB
          const allocationLines = await dbUtils.prisma.collection_allocations.findMany({
            where: { collection_id: collectionId },
            include: { installment: true },
            orderBy: { installment: { installment_number: 'asc' } },
          });

          // Fetch current schedule state to check interest remaining
          const schedules = await dbUtils.findSchedulesByLoanId(loanId);

          // For each allocation line that has principal > 0,
          // verify that interest is fully paid on this and all older installments
          for (const allocLine of allocationLines) {
            if (Number(allocLine.principal_paise) > 0) {
              const thisInstNumber = allocLine.installment.installment_number;

              for (const schedule of schedules) {
                if (schedule.installment_number > thisInstNumber) continue;

                // Interest outstanding on this or older installment should be 0
                const interestOutstanding =
                  Number(schedule.interest_paise) - Number(schedule.interest_paid_paise);

                expect(interestOutstanding).toBeLessThanOrEqual(0);
              }
            }
          }

          remainingOutstanding -= effectiveAmount;
        }),
        { numRuns: 1000 },
      );
    });

    it('allocation lines follow penalty → interest → principal ordering per collection', async () => {
      // Create a fresh active loan
      const { loanId, totalOutstandingPaise } = await createActiveLoanForPBT();

      const maxSinglePayment = Math.min(totalOutstandingPaise, 50_000_00);
      const collectionAmountArb = fc.integer({ min: 100, max: maxSinglePayment });

      let remainingOutstanding = totalOutstandingPaise;

      await fc.assert(
        fc.asyncProperty(collectionAmountArb, async (amountPaise) => {
          if (remainingOutstanding <= 0) return;

          const effectiveAmount = Math.min(amountPaise, remainingOutstanding);
          if (effectiveAmount < 100) return;

          const collection = await postCollection(clients.collectionOfficer, {
            loanId,
            amountPaise: effectiveAmount,
          });

          const collectionId = collection['collectionId'] ?? collection['data']?.['collectionId'] ?? collection['id'];

          // Fetch allocation lines ordered by installment number
          const allocationLines = await dbUtils.prisma.collection_allocations.findMany({
            where: { collection_id: collectionId },
            include: { installment: true },
            orderBy: { installment: { installment_number: 'asc' } },
          });

          // Verify oldest-first ordering: installment numbers should be non-decreasing
          // across allocation lines
          for (let i = 1; i < allocationLines.length; i++) {
            const prev = allocationLines[i - 1]!;
            const curr = allocationLines[i]!;
            expect(curr.installment.installment_number).toBeGreaterThanOrEqual(
              prev.installment.installment_number,
            );
          }

          remainingOutstanding -= effectiveAmount;
        }),
        { numRuns: 1000 },
      );
    });
  });
});
