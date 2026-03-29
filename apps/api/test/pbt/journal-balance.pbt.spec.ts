import { describe, it, expect, beforeAll } from 'vitest';
import * as fc from 'fast-check';
import { getApiBaseUrl, getUserTokens, getSeedData } from '../helpers/seed.js';
import { createAuthClients, type AuthClients } from '../helpers/auth-client.js';
import { createDbUtils, type DbUtils } from '../helpers/db-utils.js';
import { createCustomer, createLoan, postCollection } from '../helpers/factories.js';
import { arbPaiseAmount } from '../helpers/arbitraries.js';
import type { SeedData } from '../setup/global-setup.js';

/**
 * Journal Balance Property-Based Tests
 *
 * Verifies two accounting invariants against the real API and database:
 *
 * - Property 8: Journal Entry Balance — For all journal entries,
 *   sum(debit_paise) == sum(credit_paise)
 * - Property 9: Trial Balance Identity — sum(all_debit_balances) ==
 *   sum(all_credit_balances)
 *
 * Validates: Requirements 12.1, 12.6
 */

describe('Journal Balance PBT', () => {
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
      fullName: `PBT Journal Customer ${Date.now()}`,
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

  // ─── Property 8: Journal Entry Balance ──────────────────────────────────

  /**
   * **Validates: Requirements 12.1**
   *
   * Property 8: Journal Entry Balance
   *
   * For all journal entries created in the system (via disbursement, collection,
   * reversal, penalty, expense, or processing fee), sum(debit_paise) ==
   * sum(credit_paise) across all journal lines for each entry.
   */
  describe('Property 8: Journal Entry Balance', () => {
    it('sum(debit_paise) == sum(credit_paise) for every journal entry created by random collections', async () => {
      // Create a single active loan — disbursement itself creates a journal entry
      const { loanId, totalOutstandingPaise } = await createActiveLoanForPBT();

      // Collect all journal entry IDs created during this test for verification
      const journalEntryIds: string[] = [];

      // Capture the disbursement journal entry by querying entries linked to this loan
      const disbursementEntries = await dbUtils.prisma.journal_entries.findMany({
        where: { source_type: 'disbursement' },
        orderBy: { created_at: 'desc' },
        take: 1,
        select: { id: true },
      });
      if (disbursementEntries.length > 0) {
        journalEntryIds.push(disbursementEntries[0]!.id);
      }

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

          // Find journal entries created for this collection
          const collectionEntries = await dbUtils.prisma.journal_entries.findMany({
            where: { source_type: 'collection', source_id: collectionId },
            select: { id: true },
          });

          for (const entry of collectionEntries) {
            journalEntryIds.push(entry.id);

            // Fetch all lines for this journal entry
            const lines = await dbUtils.findJournalLinesByEntryId(entry.id);
            expect(lines.length).toBeGreaterThan(0);

            const totalDebits = lines.reduce(
              (acc, line) => acc + Number(line.debit_paise),
              0,
            );
            const totalCredits = lines.reduce(
              (acc, line) => acc + Number(line.credit_paise),
              0,
            );

            // Core invariant: every journal entry must balance
            expect(totalDebits).toBe(totalCredits);
          }

          remainingOutstanding -= effectiveAmount;
        }),
        { numRuns: 100 },
      );

      // Also verify the disbursement journal entry balance
      for (const entryId of journalEntryIds) {
        const lines = await dbUtils.findJournalLinesByEntryId(entryId);
        if (lines.length === 0) continue;

        const totalDebits = lines.reduce(
          (acc, line) => acc + Number(line.debit_paise),
          0,
        );
        const totalCredits = lines.reduce(
          (acc, line) => acc + Number(line.credit_paise),
          0,
        );

        expect(totalDebits).toBe(totalCredits);
      }
    });
  });

  // ─── Property 9: Trial Balance Identity ─────────────────────────────────

  /**
   * **Validates: Requirements 12.6**
   *
   * Property 9: Trial Balance Identity
   *
   * For all sequences of balanced journal entries posted to the system, the
   * trial balance SHALL satisfy: sum(all_debit_balances) ==
   * sum(all_credit_balances) across all accounts in the chart of accounts.
   */
  describe('Property 9: Trial Balance Identity', () => {
    it('sum(all_debit_balances) == sum(all_credit_balances) after random finance events', async () => {
      await fc.assert(
        fc.asyncProperty(arbPaiseAmount, async (_amountSeed) => {
          // Each iteration creates a fresh loan (disbursement) + a collection,
          // then verifies the global trial balance identity holds.

          const customer = await createCustomer(clients.fieldOfficer, {
            fullName: `PBT Trial Balance ${Date.now()}`,
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
          const outstanding = Number(loanRecord!.cached_outstanding_paise);

          // Post a collection with a random amount clamped to outstanding
          const collectionAmount = Math.min(_amountSeed, outstanding);
          if (collectionAmount >= 100) {
            await postCollection(clients.collectionOfficer, {
              loanId,
              amountPaise: collectionAmount,
            });
          }

          // Verify the global trial balance identity
          const trialBalance = await dbUtils.getTrialBalanceTotals();

          expect(trialBalance.totalDebits).toBe(trialBalance.totalCredits);
        }),
        { numRuns: 100 },
      );
    });
  });
});
