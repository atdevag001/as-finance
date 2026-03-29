import { describe, it, expect, beforeAll } from 'vitest';
import * as fc from 'fast-check';
import { getApiBaseUrl, getUserTokens, getSeedData } from '../helpers/seed.js';
import { createAuthClients, type AuthClients } from '../helpers/auth-client.js';
import { createDbUtils, type DbUtils } from '../helpers/db-utils.js';
import { createCustomer, createLoan, postCollection } from '../helpers/factories.js';
import type { SeedData } from '../setup/global-setup.js';

/**
 * Outstanding Balance Property-Based Tests
 *
 * Verifies the finance-critical outstanding balance invariant against the real
 * API and database:
 *
 * - Property 6: Outstanding Balance Invariant — cached_outstanding_paise ==
 *   total_payable_paise − sum_of_all_valid_allocated_payments. Never negative.
 *
 * Validates: Requirements 6.9, 6.10
 */

describe('Outstanding Balance PBT', () => {
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
   * Helper: create a fresh active loan and return its ID plus total payable.
   * Uses the flat monthly product for predictable schedule generation.
   */
  async function createActiveLoanForPBT(): Promise<{
    loanId: string;
    totalPayablePaise: number;
    initialOutstandingPaise: number;
  }> {
    const customer = await createCustomer(clients.fieldOfficer, {
      fullName: `PBT Outstanding Customer ${Date.now()}`,
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
    const totalPayablePaise = Number(loanRecord!.total_payable_paise);
    const initialOutstandingPaise = Number(loanRecord!.cached_outstanding_paise);

    return { loanId, totalPayablePaise, initialOutstandingPaise };
  }

  // ─── Property 6: Outstanding Balance Invariant ──────────────────────────

  /**
   * **Validates: Requirements 6.9, 6.10**
   *
   * Property 6: Outstanding Balance Invariant
   *
   * For all valid payment sequences applied to a loan via the live API, the
   * loan's cached_outstanding_paise SHALL equal total_payable_paise minus the
   * sum of all valid allocated payments after each collection. Outstanding
   * SHALL never become negative.
   */
  describe('Property 6: Outstanding Balance Invariant', () => {
    it('cached_outstanding_paise == total_payable_paise - sum(all allocated payments) after each collection, never negative', async () => {
      // Create a single active loan to test against with multiple collections
      const { loanId, totalPayablePaise, initialOutstandingPaise } =
        await createActiveLoanForPBT();

      // After disbursement, outstanding should equal total payable
      expect(initialOutstandingPaise).toBe(totalPayablePaise);

      const maxSinglePayment = Math.min(totalPayablePaise, 50_000_00);
      const collectionAmountArb = fc.integer({ min: 100, max: maxSinglePayment });

      let remainingOutstanding = totalPayablePaise;

      await fc.assert(
        fc.asyncProperty(collectionAmountArb, async (amountPaise) => {
          // Skip if we've exhausted the outstanding balance
          if (remainingOutstanding <= 0) return;

          // Clamp amount to remaining outstanding
          const effectiveAmount = Math.min(amountPaise, remainingOutstanding);
          if (effectiveAmount < 100) return;

          await postCollection(clients.collectionOfficer, {
            loanId,
            amountPaise: effectiveAmount,
          });

          // ── Verify outstanding invariant from DB ──

          // 1. Get the cached outstanding from the loan record
          const cachedOutstanding = Number(await dbUtils.getLoanOutstanding(loanId));

          // 2. Compute sum of all valid allocated payments for this loan
          const collections = await dbUtils.findCollectionsByLoanId(loanId);
          let totalAllocated = 0;
          for (const coll of collections) {
            // Only count non-reversed collections
            if ((coll as Record<string, unknown>)['is_reversed']) continue;

            const allocations = await dbUtils.sumAllocationsForCollection(coll.id);
            totalAllocated +=
              Number(allocations.penalty) +
              Number(allocations.interest) +
              Number(allocations.principal);
          }

          // 3. Core invariant: cached_outstanding == total_payable - sum(allocated)
          const expectedOutstanding = totalPayablePaise - totalAllocated;
          expect(cachedOutstanding).toBe(expectedOutstanding);

          // 4. Outstanding must never be negative
          expect(cachedOutstanding).toBeGreaterThanOrEqual(0);

          remainingOutstanding -= effectiveAmount;
        }),
        { numRuns: 1000 },
      );
    });
  });
});
