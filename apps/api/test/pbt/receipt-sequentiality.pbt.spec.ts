import { describe, it, expect, beforeAll } from 'vitest';
import * as fc from 'fast-check';
import { getApiBaseUrl, getUserTokens, getSeedData } from '../helpers/seed.js';
import { createAuthClients, type AuthClients } from '../helpers/auth-client.js';
import { createDbUtils, type DbUtils } from '../helpers/db-utils.js';
import { createCustomer, createLoan, postCollection } from '../helpers/factories.js';
import type { SeedData } from '../setup/global-setup.js';

/**
 * Receipt Sequentiality Property-Based Tests
 *
 * Verifies the finance-critical invariant for receipt number ordering:
 *
 * - Property 25: Receipt Number Sequentiality — For R1 created before R2,
 *   receipt_number(R1) < receipt_number(R2). No gaps in sequence within test run.
 *
 * **Validates: Requirements 6.6 (receipt sequencing)**
 */

describe('Receipt Sequentiality PBT', () => {
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

  /** Extract numeric portion from receipt number format RCP-YYYY-NNNNN. */
  function extractNumeric(receiptNumber: string): number {
    const parts = receiptNumber.split('-');
    return Number(parts[2]);
  }

  /**
   * Helper: create a fresh active loan and return its ID plus the total outstanding
   * and first EMI amount. Uses the flat monthly product for predictable schedules.
   */
  async function createActiveLoanForPBT(): Promise<{
    loanId: string;
    totalOutstandingPaise: number;
    firstEmiPaise: number;
  }> {
    const customer = await createCustomer(clients.fieldOfficer, {
      fullName: `PBT Receipt Seq Customer ${Date.now()}`,
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

    return { loanId, totalOutstandingPaise, firstEmiPaise };
  }

  // ─── Property 25: Receipt Number Sequentiality ──────────────────────────

  /**
   * **Validates: Requirements 6.6**
   *
   * Property 25: Receipt Number Sequentiality
   *
   * For R1 created before R2, receipt_number(R1) < receipt_number(R2).
   * No gaps in the sequence within the test run. Receipt numbers are
   * generated from a PostgreSQL sequence (receipt_number_seq) and follow
   * the format RCP-YYYY-NNNNN. Sequential collections against the same
   * loan must produce strictly increasing receipt numbers with no gaps.
   */
  describe('Property 25: Receipt Number Sequentiality', () => {
    it('sequential collections produce strictly increasing receipt numbers with no gaps', async () => {
      // Create a fresh active loan with enough outstanding for many small collections
      const { loanId, totalOutstandingPaise, firstEmiPaise } =
        await createActiveLoanForPBT();

      // Use a fraction of the first EMI to allow many collections within outstanding
      const maxPayment = Math.min(Math.floor(firstEmiPaise / 2), Math.floor(totalOutstandingPaise / 100));
      const collectionAmountArb = fc.integer({
        min: 100,
        max: Math.max(100, maxPayment),
      });

      // Track receipt numbers in order across iterations
      const receiptNumbers: number[] = [];
      let remainingOutstanding = totalOutstandingPaise;

      await fc.assert(
        fc.asyncProperty(collectionAmountArb, async (amountPaise) => {
          // Skip if we've exhausted the outstanding balance
          if (remainingOutstanding <= 0) return;

          // Clamp amount to remaining outstanding
          const effectiveAmount = Math.min(amountPaise, remainingOutstanding);
          if (effectiveAmount < 100) return;

          // Post collection
          const collection = await postCollection(clients.collectionOfficer, {
            loanId,
            amountPaise: effectiveAmount,
          });

          const collectionId =
            collection['collectionId'] ??
            collection['data']?.['collectionId'] ??
            collection['id'];

          // Fetch the receipt from DB
          const receipt = await dbUtils.findReceiptByCollectionId(collectionId);
          expect(receipt).not.toBeNull();
          expect(receipt!.receipt_number).toMatch(/^RCP-\d{4}-\d{5,}$/);

          const numericPart = extractNumeric(receipt!.receipt_number);
          receiptNumbers.push(numericPart);

          remainingOutstanding -= effectiveAmount;
        }),
        { numRuns: 100 },
      );

      // ── Post-loop verification ──────────────────────────────────────

      // Must have collected at least 2 receipts to verify sequentiality
      expect(receiptNumbers.length).toBeGreaterThanOrEqual(2);

      // 1. Receipt numbers are strictly increasing (R1 < R2 for R1 created before R2)
      for (let i = 1; i < receiptNumbers.length; i++) {
        expect(receiptNumbers[i]!).toBeGreaterThan(receiptNumbers[i - 1]!);
      }

      // 2. No gaps in the sequence within the test run
      //    (consecutive receipt numbers differ by exactly 1)
      for (let i = 1; i < receiptNumbers.length; i++) {
        expect(receiptNumbers[i]! - receiptNumbers[i - 1]!).toBe(1);
      }
    });
  });
});
