/**
 * Chaos Test Snapshot Helpers
 *
 * Captures pre-transaction database state and asserts it remains unchanged
 * after a failed/faulted operation. Used to verify that no partial state
 * leaked during infrastructure failures.
 *
 * Uses the existing createDbUtils helper from test/helpers/db-utils.ts.
 */

/// <reference types="vitest/globals" />

import { PrismaClient } from '@prisma/client';
import { createDbUtils, type DbUtils } from '../helpers/db-utils';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Snapshot of database state captured before a chaos test transaction.
 * Compared after fault injection to verify no partial state persisted.
 */
export interface PreTransactionSnapshot {
  loanOutstandingPaise: bigint;
  collectionCount: number;
  journalEntryCount: number;
  receiptCount: number;
  trialBalance: { totalDebits: bigint; totalCredits: bigint };
}

// ─── Snapshot Capture ────────────────────────────────────────────────────────

/**
 * Capture a snapshot of the current database state for a given loan.
 *
 * This captures:
 * - The loan's outstanding balance
 * - Number of collections for the loan
 * - Total journal entry count (global)
 * - Number of receipts for the loan
 * - Global trial balance (total debits and credits)
 *
 * @param prisma - PrismaClient instance for direct DB queries
 * @param loanId - The loan ID to snapshot state for
 * @returns PreTransactionSnapshot for later comparison
 */
export async function capturePreTransactionSnapshot(
  prisma: PrismaClient,
  loanId: string,
): Promise<PreTransactionSnapshot> {
  const db: DbUtils = createDbUtils(prisma);

  const [outstanding, collections, journalEntryCount, receiptCount, trialBalance] =
    await Promise.all([
      db.getLoanOutstanding(loanId),
      db.findCollectionsByLoanId(loanId),
      prisma.journal_entries.count(),
      db.countReceiptsForLoan(loanId),
      db.getTrialBalanceTotals(),
    ]);

  return {
    loanOutstandingPaise: outstanding,
    collectionCount: collections.length,
    journalEntryCount,
    receiptCount,
    trialBalance,
  };
}

// ─── Snapshot Assertion ──────────────────────────────────────────────────────

/**
 * Assert that the current database state matches a previously captured snapshot.
 *
 * Used after a faulted operation to verify that no partial state leaked.
 * Throws an assertion error (via expect) if any value has changed.
 *
 * @param prisma - PrismaClient instance for direct DB queries
 * @param loanId - The loan ID to check state for
 * @param snapshot - The previously captured PreTransactionSnapshot
 */
export async function assertStateUnchanged(
  prisma: PrismaClient,
  loanId: string,
  snapshot: PreTransactionSnapshot,
): Promise<void> {
  const current = await capturePreTransactionSnapshot(prisma, loanId);

  expect(current.loanOutstandingPaise).toBe(snapshot.loanOutstandingPaise);
  expect(current.collectionCount).toBe(snapshot.collectionCount);
  expect(current.journalEntryCount).toBe(snapshot.journalEntryCount);
  expect(current.receiptCount).toBe(snapshot.receiptCount);
  expect(current.trialBalance.totalDebits).toBe(snapshot.trialBalance.totalDebits);
  expect(current.trialBalance.totalCredits).toBe(snapshot.trialBalance.totalCredits);
}
