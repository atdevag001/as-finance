import { describe, it, expect, beforeAll } from 'vitest';
import * as fc from 'fast-check';
import { getApiBaseUrl, getUserTokens, getSeedData } from '../helpers/seed.js';
import { createAuthClients, type AuthClients } from '../helpers/auth-client.js';
import { createDbUtils, type DbUtils } from '../helpers/db-utils.js';
import { createCustomer, createLoan, postCollection } from '../helpers/factories.js';
import type { SeedData } from '../setup/global-setup.js';

/**
 * Reversal Ledger Neutrality Property-Based Tests
 *
 * Verifies the finance-critical reversal neutrality invariant against the real
 * API and database:
 *
 * - Property 7: Reversal Ledger Neutrality — For all valid collection reversals,
 *   the net ledger effect of the original collection's journal entry plus the
 *   reversal's compensating journal entry SHALL be zero for each account.
 *
 * Validates: Requirements 7.2, 12.4
 */

describe('Reversal Ledger Neutrality PBT', () => {
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
  function idempKey(prefix = 'pbt-rev'): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Helper: create a fresh active loan and return its ID plus total outstanding.
   * Each iteration needs a fresh loan since reversal restores outstanding.
   */
  async function createActiveLoanForPBT(): Promise<{
    loanId: string;
    totalOutstandingPaise: number;
  }> {
    const customer = await createCustomer(clients.fieldOfficer, {
      fullName: `PBT RevNeutrality Customer ${Date.now()}`,
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

  // ─── Property 7: Reversal Ledger Neutrality ─────────────────────────────

  /**
   * **Validates: Requirements 7.2, 12.4**
   *
   * Property 7: Reversal Ledger Neutrality
   *
   * For all valid collection reversals executed via the live API, the net ledger
   * effect of the original collection's journal entry plus the reversal's
   * compensating journal entry SHALL be zero. For each account touched by the
   * original and reversal journal entries, sum(debit_paise) - sum(credit_paise)
   * SHALL equal zero. Additionally, the loan's outstanding balance SHALL return
   * to its pre-collection value after the reversal.
   */
  describe('Property 7: Reversal Ledger Neutrality', () => {
    it('net ledger effect of original + reversal == zero for each account, outstanding restored', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 100, max: 50_000_00 }),
          async (rawAmountPaise) => {
            // Each iteration gets a fresh loan since reversal restores outstanding
            const { loanId, totalOutstandingPaise } = await createActiveLoanForPBT();

            // Clamp collection amount to remaining outstanding
            const effectiveAmount = Math.min(rawAmountPaise, totalOutstandingPaise);
            if (effectiveAmount < 100) return;

            // Record outstanding before collection
            const outstandingBeforeCollection = Number(
              await dbUtils.getLoanOutstanding(loanId),
            );

            // ── Step 1: Post a collection ──
            const collection = await postCollection(clients.collectionOfficer, {
              loanId,
              amountPaise: effectiveAmount,
            });

            const collectionId =
              collection['collectionId'] ??
              collection['data']?.['collectionId'] ??
              collection['id'];

            // Get the original collection's journal entry ID
            const collectionRecord = (await dbUtils.findCollectionsByLoanId(loanId))
              .find((c) => c.id === collectionId)!;
            const originalJournalEntryId = collectionRecord.journal_entry_id;

            // ── Step 2: Reverse the collection ──
            const revRes = await clients.manager.post('/reversals').send({
              collectionId,
              reason: 'PBT reversal neutrality verification',
              idempotencyKey: idempKey(),
            });

            expect(revRes.status).toBe(201);
            const revData = revRes.body.data ?? revRes.body;
            const mirrorJournalEntryId = revData.mirrorJournalEntryId;

            // ── Step 3: Verify net ledger effect is zero per account ──

            // Fetch original journal lines
            const originalLines = await dbUtils.findJournalLinesByEntryId(
              originalJournalEntryId,
            );

            // Fetch reversal (mirror) journal lines
            const mirrorLines = await dbUtils.findJournalLinesByEntryId(
              mirrorJournalEntryId,
            );

            // Build per-account net map: sum(debit - credit) across both entries
            const accountNetMap = new Map<string, number>();
            for (const line of [...originalLines, ...mirrorLines]) {
              const current = accountNetMap.get(line.account_id) ?? 0;
              accountNetMap.set(
                line.account_id,
                current + Number(line.debit_paise) - Number(line.credit_paise),
              );
            }

            // Core invariant: net effect is zero for every account
            for (const [accountId, netAmount] of accountNetMap) {
              expect(netAmount, `Account ${accountId} has non-zero net effect`).toBe(0);
            }

            // Also verify total debits == total credits across both entries
            let totalDebits = 0;
            let totalCredits = 0;
            for (const line of [...originalLines, ...mirrorLines]) {
              totalDebits += Number(line.debit_paise);
              totalCredits += Number(line.credit_paise);
            }
            expect(totalDebits).toBe(totalCredits);

            // ── Step 4: Verify outstanding returns to pre-collection value ──
            const outstandingAfterReversal = Number(
              await dbUtils.getLoanOutstanding(loanId),
            );
            expect(outstandingAfterReversal).toBe(outstandingBeforeCollection);
          },
        ),
        { numRuns: 1000 },
      );
    });
  });
});
