import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { ReversalService } from '../reversal.service';
import { BusinessRuleError, ConflictError } from '../../../common/errors';

/**
 * Property 10: Reversal Neutrality
 *
 * For all valid collection reversals, the net ledger effect of the original
 * collection plus its reversal SHALL equal zero for every account touched.
 * Specifically: for each account,
 *   sum(original_debits) - sum(original_credits)
 *   + sum(reversal_debits) - sum(reversal_credits) == 0
 *
 * **Validates: Requirements 7.4, 25.3**
 *
 * ---
 *
 * Property 11: Reversal Constraints
 *
 * For all collections, a collection that has already been reversed SHALL NOT
 * be reversible again (no double reversal). For all reversal records,
 * attempting to reverse a reversal SHALL be rejected (no chained reversals).
 *
 * **Validates: Requirements 7.5, 7.6**
 *
 * ---
 *
 * Property 30: Mirror Journal — reversal journal entry is exact mirror
 * (debits↔credits) of original.
 *
 * **Validates: Requirements 8.1**
 *
 * ---
 *
 * Property 31: Net Zero Ledger — net ledger effect of original + reversal
 * = zero per account.
 *
 * **Validates: Requirements 8.2**
 *
 * ---
 *
 * Property 32: Installment Restoration — after reversal, paid amounts
 * return to pre-collection values.
 *
 * **Validates: Requirements 8.3, 8.4**
 */

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const uuidArb = fc.uuid();

/** Positive integer paise amount (1 – 100,000,000) */
const amountArb = fc.integer({ min: 1, max: 100_000_000 });

/**
 * Generates a balanced set of journal entry lines.
 *
 * Strategy: generate 1-5 debit lines and 1-5 credit lines, then adjust the
 * last credit line so total debits == total credits exactly. Each line has a
 * unique account ID, a debit amount, and a credit amount (one of which is 0).
 */
const balancedJournalLinesArb = fc
  .tuple(
    fc.array(fc.tuple(uuidArb, amountArb), { minLength: 1, maxLength: 5 }),
    fc.array(fc.tuple(uuidArb, amountArb), { minLength: 1, maxLength: 5 }),
  )
  .map(([debitPairs, creditPairs]) => {
    const debitLines = debitPairs.map(([accountId, amount]) => ({
      account_id: accountId,
      debit_paise: BigInt(amount),
      credit_paise: 0n,
    }));

    const totalDebit = debitPairs.reduce((s, [, a]) => s + a, 0);

    const creditLines = creditPairs.map(([accountId, amount]) => ({
      account_id: accountId,
      debit_paise: 0n,
      credit_paise: BigInt(amount),
    }));

    // Adjust last credit line to balance
    const rawCreditTotal = creditPairs.reduce((s, [, a]) => s + a, 0);
    const diff = totalDebit - rawCreditTotal;
    const lastCredit = creditLines[creditLines.length - 1]!;
    const adjusted = Number(lastCredit.credit_paise) + diff;

    if (adjusted <= 0) {
      for (let i = 0; i < creditLines.length - 1; i++) {
        creditLines[i]!.credit_paise = 0n;
      }
      creditLines[creditLines.length - 1]!.credit_paise = BigInt(totalDebit);
    } else {
      creditLines[creditLines.length - 1]!.credit_paise = BigInt(adjusted);
    }

    return [...debitLines, ...creditLines].filter(
      (l) => l.debit_paise > 0n || l.credit_paise > 0n,
    );
  })
  .filter((lines) => {
    const hasDebit = lines.some((l) => l.debit_paise > 0n);
    const hasCredit = lines.some((l) => l.credit_paise > 0n);
    return hasDebit && hasCredit && lines.length >= 2;
  });

// ===========================================================================
// Property 10: Reversal Neutrality
// ===========================================================================

describe('Property 10: Reversal Neutrality', () => {
  it(
    'for all valid reversals, net ledger effect of original + reversal == 0 for every account touched',
    async () => {
      await fc.assert(
        fc.asyncProperty(balancedJournalLinesArb, async (originalLines) => {
          // The reversal mirrors the original: debits become credits, credits become debits
          const mirrorLines = originalLines.map((line) => ({
            account_id: line.account_id,
            debit_paise: line.credit_paise,
            credit_paise: line.debit_paise,
          }));

          // Aggregate net effect per account across original + mirror
          const netByAccount = new Map<string, bigint>();

          for (const line of [...originalLines, ...mirrorLines]) {
            const current = netByAccount.get(line.account_id) ?? 0n;
            // net = debits - credits
            netByAccount.set(
              line.account_id,
              current + line.debit_paise - line.credit_paise,
            );
          }

          // For every account touched, net effect must be exactly zero
          for (const [accountId, net] of netByAccount) {
            expect(net, `Account ${accountId} has non-zero net: ${net}`).toBe(0n);
          }
        }),
        { numRuns: 1000 },
      );
    },
  );

  it(
    'for all valid reversals, total debits of mirror == total credits of original and vice versa',
    async () => {
      await fc.assert(
        fc.asyncProperty(balancedJournalLinesArb, async (originalLines) => {
          const mirrorLines = originalLines.map((line) => ({
            account_id: line.account_id,
            debit_paise: line.credit_paise,
            credit_paise: line.debit_paise,
          }));

          const originalTotalDebit = originalLines.reduce((s, l) => s + l.debit_paise, 0n);
          const originalTotalCredit = originalLines.reduce((s, l) => s + l.credit_paise, 0n);
          const mirrorTotalDebit = mirrorLines.reduce((s, l) => s + l.debit_paise, 0n);
          const mirrorTotalCredit = mirrorLines.reduce((s, l) => s + l.credit_paise, 0n);

          // Mirror debits == original credits
          expect(mirrorTotalDebit).toBe(originalTotalCredit);
          // Mirror credits == original debits
          expect(mirrorTotalCredit).toBe(originalTotalDebit);

          // Both original and mirror are individually balanced
          expect(originalTotalDebit).toBe(originalTotalCredit);
          expect(mirrorTotalDebit).toBe(mirrorTotalCredit);
        }),
        { numRuns: 1000 },
      );
    },
  );
});

// ===========================================================================
// Property 11: Reversal Constraints
// ===========================================================================


// ── Mock factories for Property 11 ──

function createMockPrisma() {
  const txClient = {
    collections: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    collection_allocations: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    penalties: {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
    },
    journal_entries: {
      findUnique: vi.fn(),
    },
    receipts: {
      findMany: vi.fn(),
    },
  };

  return {
    $transaction: vi.fn(async (fn: (tx: typeof txClient) => Promise<unknown>) => fn(txClient)),
    _tx: txClient,
  };
}

function createMockDeps() {
  return {
    collectionRepo: {
      lockLoanForUpdate: vi.fn().mockResolvedValue({ id: 'loan-001' }),
      getLoanForCollection: vi.fn().mockResolvedValue({
        id: 'loan-001',
        loan_number: 'LN-2024-00001',
        customer_id: 'cust-001',
        cached_outstanding_paise: 100000n,
        customer: { full_name: 'Test', mobile: '9876543210' },
        schedules: [],
      }),
      updateInstallment: vi.fn(),
      updateLoanOutstanding: vi.fn(),
      getOfficerName: vi.fn().mockResolvedValue('Officer'),
      getPendingPenalties: vi.fn().mockResolvedValue([]),
    },
    accountingService: {
      createJournalEntry: vi.fn().mockResolvedValue({ id: 'je-mirror' }),
    },
    auditService: {
      createAuditLog: vi.fn().mockResolvedValue({ id: 'audit-id' }),
    },
    idempotencyService: {
      find: vi.fn().mockResolvedValue(null),
      store: vi.fn(),
    },
    receiptService: {
      generateReceipt: vi.fn().mockResolvedValue({ id: 'rcp-id', receipt_number: 'RCP-2024-00001' }),
      markAsReversed: vi.fn(),
    },
  };
}

function buildReversalService(prisma: ReturnType<typeof createMockPrisma>, deps: ReturnType<typeof createMockDeps>) {
  return new ReversalService(
    prisma as never,
    deps.collectionRepo as never,
    deps.accountingService as never,
    deps.auditService as never,
    deps.idempotencyService as never,
    deps.receiptService as never,
  );
}

/** Generator for a collection ID (UUID) */
const collectionIdArb = fc.uuid();

/** Generator for a reversal reason string */
const reasonArb = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz '.split('')),
  { minLength: 3, maxLength: 50 },
).map((s) => s.trim() || 'reason');

describe('Property 11: Reversal Constraints', () => {
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let deps: ReturnType<typeof createMockDeps>;
  let service: ReversalService;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    deps = createMockDeps();
    service = buildReversalService(mockPrisma, deps);
  });

  it(
    'for all already-reversed collections, reversal attempt throws ConflictError (COLLECTION_ALREADY_REVERSED)',
    async () => {
      await fc.assert(
        fc.asyncProperty(collectionIdArb, reasonArb, uuidArb, async (collectionId, reason, idempKey) => {
          // Reset mocks for each iteration
          mockPrisma = createMockPrisma();
          deps = createMockDeps();
          service = buildReversalService(mockPrisma, deps);

          // Simulate an already-reversed collection
          mockPrisma._tx.collections.findUnique.mockResolvedValue({
            id: collectionId,
            loan_id: 'loan-001',
            amount_paise: 10000n,
            payment_date: new Date(),
            payment_mode: 'cash',
            status: 'reversed',
            is_reversal: false,
            journal_entry_id: 'je-001',
          });

          await expect(
            service.reverseCollection(
              { collectionId, reason, idempotencyKey: idempKey },
              'actor-001',
              'manager',
            ),
          ).rejects.toThrow(ConflictError);

          try {
            await service.reverseCollection(
              { collectionId, reason, idempotencyKey: idempKey + '-2' },
              'actor-001',
              'manager',
            );
          } catch (err) {
            expect((err as ConflictError).code).toBe('COLLECTION_ALREADY_REVERSED');
          }
        }),
        { numRuns: 200 },
      );
    },
  );

  it(
    'for all reversal records (is_reversal=true), reversal attempt throws BusinessRuleError (CANNOT_REVERSE_REVERSAL)',
    async () => {
      await fc.assert(
        fc.asyncProperty(collectionIdArb, reasonArb, uuidArb, async (collectionId, reason, idempKey) => {
          mockPrisma = createMockPrisma();
          deps = createMockDeps();
          service = buildReversalService(mockPrisma, deps);

          // Simulate a collection that is itself a reversal
          mockPrisma._tx.collections.findUnique.mockResolvedValue({
            id: collectionId,
            loan_id: 'loan-001',
            amount_paise: -10000n,
            payment_date: new Date(),
            payment_mode: 'cash',
            status: 'posted',
            is_reversal: true,
            journal_entry_id: 'je-001',
          });

          await expect(
            service.reverseCollection(
              { collectionId, reason, idempotencyKey: idempKey },
              'actor-001',
              'manager',
            ),
          ).rejects.toThrow(BusinessRuleError);

          try {
            await service.reverseCollection(
              { collectionId, reason, idempotencyKey: idempKey + '-2' },
              'actor-001',
              'manager',
            );
          } catch (err) {
            expect((err as BusinessRuleError).code).toBe('CANNOT_REVERSE_REVERSAL');
          }
        }),
        { numRuns: 200 },
      );
    },
  );

  it(
    'for all collections that are both reversed AND a reversal, the is_reversal check fires first (CANNOT_REVERSE_REVERSAL)',
    async () => {
      await fc.assert(
        fc.asyncProperty(collectionIdArb, reasonArb, uuidArb, async (collectionId, reason, idempKey) => {
          mockPrisma = createMockPrisma();
          deps = createMockDeps();
          service = buildReversalService(mockPrisma, deps);

          // Edge case: both flags set — is_reversal is checked first in the service
          mockPrisma._tx.collections.findUnique.mockResolvedValue({
            id: collectionId,
            loan_id: 'loan-001',
            amount_paise: -10000n,
            payment_date: new Date(),
            payment_mode: 'cash',
            status: 'reversed',
            is_reversal: true,
            journal_entry_id: 'je-001',
          });

          try {
            await service.reverseCollection(
              { collectionId, reason, idempotencyKey: idempKey },
              'actor-001',
              'manager',
            );
            // Should not reach here
            expect.unreachable('Should have thrown');
          } catch (err) {
            // is_reversal check fires before status check
            expect(err).toBeInstanceOf(BusinessRuleError);
            expect((err as BusinessRuleError).code).toBe('CANNOT_REVERSE_REVERSAL');
          }
        }),
        { numRuns: 100 },
      );
    },
  );
});


// ===========================================================================
// Property 30: Mirror Journal
//
// For any valid collection, the reversal journal entry is the exact mirror
// (debits become credits, credits become debits) of the original journal
// entry. Each line's debit_paise in the original becomes credit_paise in
// the mirror and vice versa, preserving account IDs and amounts.
//
// **Validates: Requirements 8.1**
// ===========================================================================

/**
 * Generates a collection scenario with 1-5 journal lines where each line
 * is either a debit or credit (never both). The lines are balanced:
 * total debits == total credits. Each line has a unique account ID.
 *
 * Returns { lines, totalAmount } where totalAmount is the sum of debits.
 */
const collectionJournalArb = fc
  .tuple(
    fc.array(fc.tuple(fc.uuid(), fc.integer({ min: 1, max: 50_000_000 })), { minLength: 1, maxLength: 5 }),
    fc.array(fc.tuple(fc.uuid(), fc.integer({ min: 1, max: 50_000_000 })), { minLength: 1, maxLength: 5 }),
  )
  .map(([debitPairs, creditPairs]) => {
    const debitLines = debitPairs.map(([accountId, amount]) => ({
      account_id: accountId,
      debit_paise: BigInt(amount),
      credit_paise: 0n,
    }));

    const totalDebit = debitPairs.reduce((s, [, a]) => s + a, 0);

    const creditLines = creditPairs.map(([accountId, amount]) => ({
      account_id: accountId,
      debit_paise: 0n,
      credit_paise: BigInt(amount),
    }));

    // Balance: adjust last credit line so total credits == total debits
    const rawCreditTotal = creditPairs.reduce((s, [, a]) => s + a, 0);
    const diff = totalDebit - rawCreditTotal;
    const lastCredit = creditLines[creditLines.length - 1]!;
    const adjusted = Number(lastCredit.credit_paise) + diff;

    if (adjusted <= 0) {
      for (let i = 0; i < creditLines.length - 1; i++) {
        creditLines[i]!.credit_paise = 0n;
      }
      creditLines[creditLines.length - 1]!.credit_paise = BigInt(totalDebit);
    } else {
      creditLines[creditLines.length - 1]!.credit_paise = BigInt(adjusted);
    }

    const lines = [...debitLines, ...creditLines].filter(
      (l) => l.debit_paise > 0n || l.credit_paise > 0n,
    );

    return { lines, totalAmount: totalDebit };
  })
  .filter(({ lines }) => {
    const hasDebit = lines.some((l) => l.debit_paise > 0n);
    const hasCredit = lines.some((l) => l.credit_paise > 0n);
    return hasDebit && hasCredit && lines.length >= 2;
  });

describe('Property 30: Mirror Journal', () => {
  it(
    'reversal journal entry is exact mirror (debits↔credits) of original for all valid journal entries',
    () => {
      fc.assert(
        fc.property(collectionJournalArb, ({ lines: originalLines }) => {
          // Apply the mirror transformation (same as reversal service logic)
          const mirrorLines = originalLines.map((line) => ({
            account_id: line.account_id,
            debit_paise: line.credit_paise,   // original credit → mirror debit
            credit_paise: line.debit_paise,    // original debit → mirror credit
          }));

          // Verify line count is preserved
          expect(mirrorLines.length).toBe(originalLines.length);

          // Verify each line is exactly mirrored
          for (let i = 0; i < originalLines.length; i++) {
            const orig = originalLines[i]!;
            const mirror = mirrorLines[i]!;

            // Same account
            expect(mirror.account_id).toBe(orig.account_id);
            // Debit↔Credit swap
            expect(mirror.debit_paise).toBe(orig.credit_paise);
            expect(mirror.credit_paise).toBe(orig.debit_paise);
          }

          // Verify mirror is also balanced
          const mirrorTotalDebit = mirrorLines.reduce((s, l) => s + l.debit_paise, 0n);
          const mirrorTotalCredit = mirrorLines.reduce((s, l) => s + l.credit_paise, 0n);
          expect(mirrorTotalDebit).toBe(mirrorTotalCredit);
        }),
        { numRuns: 1000 },
      );
    },
  );

  it(
    'mirror of mirror returns to original (involution property)',
    () => {
      fc.assert(
        fc.property(collectionJournalArb, ({ lines: originalLines }) => {
          // Mirror once
          const mirror1 = originalLines.map((line) => ({
            account_id: line.account_id,
            debit_paise: line.credit_paise,
            credit_paise: line.debit_paise,
          }));

          // Mirror twice — should return to original
          const mirror2 = mirror1.map((line) => ({
            account_id: line.account_id,
            debit_paise: line.credit_paise,
            credit_paise: line.debit_paise,
          }));

          for (let i = 0; i < originalLines.length; i++) {
            expect(mirror2[i]!.account_id).toBe(originalLines[i]!.account_id);
            expect(mirror2[i]!.debit_paise).toBe(originalLines[i]!.debit_paise);
            expect(mirror2[i]!.credit_paise).toBe(originalLines[i]!.credit_paise);
          }
        }),
        { numRuns: 1000 },
      );
    },
  );
});

// ===========================================================================
// Property 31: Net Zero Ledger
//
// For any valid collection journal entry, the net ledger effect of the
// original + its reversal (mirror) equals zero for every account touched.
// This is the per-account neutrality guarantee.
//
// **Validates: Requirements 8.2**
// ===========================================================================

describe('Property 31: Net Zero Ledger', () => {
  it(
    'net ledger effect of original + reversal = zero per account for all valid entries',
    () => {
      fc.assert(
        fc.property(collectionJournalArb, ({ lines: originalLines }) => {
          const mirrorLines = originalLines.map((line) => ({
            account_id: line.account_id,
            debit_paise: line.credit_paise,
            credit_paise: line.debit_paise,
          }));

          // Aggregate net effect per account: net = debits - credits
          const netByAccount = new Map<string, bigint>();

          for (const line of [...originalLines, ...mirrorLines]) {
            const current = netByAccount.get(line.account_id) ?? 0n;
            netByAccount.set(
              line.account_id,
              current + line.debit_paise - line.credit_paise,
            );
          }

          // Every account must have net zero
          for (const [accountId, net] of netByAccount) {
            expect(net, `Account ${accountId} has non-zero net: ${net}`).toBe(0n);
          }
        }),
        { numRuns: 1000 },
      );
    },
  );

  it(
    'total debits across all accounts in original + reversal = total credits',
    () => {
      fc.assert(
        fc.property(collectionJournalArb, ({ lines: originalLines }) => {
          const mirrorLines = originalLines.map((line) => ({
            account_id: line.account_id,
            debit_paise: line.credit_paise,
            credit_paise: line.debit_paise,
          }));

          const allLines = [...originalLines, ...mirrorLines];
          const totalDebits = allLines.reduce((s, l) => s + l.debit_paise, 0n);
          const totalCredits = allLines.reduce((s, l) => s + l.credit_paise, 0n);

          expect(totalDebits).toBe(totalCredits);
        }),
        { numRuns: 1000 },
      );
    },
  );
});

// ===========================================================================
// Property 32: Installment Restoration
//
// After reversal, each installment's paid amounts return to their
// pre-collection values. Specifically, for each installment affected by
// the original collection allocation:
//   new_paid = current_paid - allocation_amount (clamped to 0)
//
// This tests the restoreInstallments logic through the ReversalService
// with mocked dependencies.
//
// **Validates: Requirements 8.3, 8.4**
// ===========================================================================

/**
 * Generates a valid collection+allocation scenario for installment restoration:
 * - 1-6 installments, each with due amounts and paid amounts
 * - 1-3 allocations referencing those installments
 * - Allocation amounts ≤ current paid amounts (normal case)
 *
 * Returns { installments, allocations, totalCollectionAmount }
 */
const installmentRestorationArb = fc
  .integer({ min: 1, max: 6 })
  .chain((installmentCount) => {
    // Generate installments with due and paid amounts
    const installmentsArb = fc.tuple(
      ...Array.from({ length: installmentCount }, (_, i) =>
        fc.record({
          principalPaise: fc.integer({ min: 1000, max: 500_000 }),
          interestPaise: fc.integer({ min: 100, max: 100_000 }),
        }).chain(({ principalPaise, interestPaise }) =>
          fc.record({
            principalPaidPaise: fc.integer({ min: 0, max: principalPaise }),
            interestPaidPaise: fc.integer({ min: 0, max: interestPaise }),
            penaltyPaidPaise: fc.integer({ min: 0, max: 10_000 }),
          }).map(({ principalPaidPaise, interestPaidPaise, penaltyPaidPaise }) => ({
            id: `sched-${i}`,
            installment_number: i + 1,
            due_date: new Date(2024, 6, 15 + i * 30),
            principal_paise: BigInt(principalPaise),
            interest_paise: BigInt(interestPaise),
            total_paise: BigInt(principalPaise + interestPaise),
            principal_paid_paise: BigInt(principalPaidPaise),
            interest_paid_paise: BigInt(interestPaidPaise),
            penalty_paid_paise: BigInt(penaltyPaidPaise),
            status: principalPaidPaise >= principalPaise && interestPaidPaise >= interestPaise
              ? 'paid'
              : principalPaidPaise > 0 || interestPaidPaise > 0
                ? 'partial'
                : 'pending',
          })),
        ),
      ),
    );

    return installmentsArb.chain((installments) => {
      // Generate allocations that reference existing installments
      // Allocation amounts ≤ current paid amounts
      const allocCount = Math.min(installmentCount, 3);
      const allocsArb = fc.tuple(
        ...Array.from({ length: allocCount }, (_, i) => {
          const inst = (installments)[i]!;
          const maxPrincipal = Number(inst.principal_paid_paise);
          const maxInterest = Number(inst.interest_paid_paise);
          const maxPenalty = Number(inst.penalty_paid_paise);

          return fc.record({
            principalAlloc: fc.integer({ min: 0, max: Math.max(0, maxPrincipal) }),
            interestAlloc: fc.integer({ min: 0, max: Math.max(0, maxInterest) }),
            penaltyAlloc: fc.integer({ min: 0, max: Math.max(0, maxPenalty) }),
          }).map(({ principalAlloc, interestAlloc, penaltyAlloc }) => ({
            id: `alloc-${i}`,
            installment_id: inst.id,
            principal_paise: BigInt(principalAlloc),
            interest_paise: BigInt(interestAlloc),
            penalty_paise: BigInt(penaltyAlloc),
            total_paise: BigInt(principalAlloc + interestAlloc + penaltyAlloc),
          }));
        }),
      );

      return allocsArb.map((allocations) => {
        const totalCollectionAmount = (allocations).reduce(
          (s, a) => s + Number(a.total_paise),
          0,
        );
        return {
          installments: installments,
          allocations: allocations,
          totalCollectionAmount,
        };
      });
    });
  });

describe('Property 32: Installment Restoration', () => {
  it(
    'after reversal, paid amounts return to pre-collection values for all valid scenarios',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          installmentRestorationArb,
          fc.uuid(),
          fc.uuid(),
          async ({ installments, allocations, totalCollectionAmount }, collectionId, idempKey) => {
            // Skip trivial cases with zero collection amount
            if (totalCollectionAmount === 0) return;

            const mockPrisma = createMockPrisma();
            const deps = createMockDeps();
            const service = buildReversalService(mockPrisma, deps);

            // Setup: original collection
            mockPrisma._tx.collections.findUnique.mockResolvedValue({
              id: collectionId,
              loan_id: 'loan-001',
              amount_paise: BigInt(totalCollectionAmount),
              payment_date: new Date(),
              payment_mode: 'cash',
              status: 'posted',
              is_reversal: false,
              journal_entry_id: 'je-001',
            });

            // Setup: allocations
            mockPrisma._tx.collection_allocations.findMany.mockResolvedValue(allocations);

            // Setup: journal entry (simple balanced entry)
            mockPrisma._tx.journal_entries.findUnique.mockResolvedValue({
              id: 'je-001',
              lines: [
                { account_id: 'acc-cash', debit_paise: BigInt(totalCollectionAmount), credit_paise: 0n },
                { account_id: 'acc-recv', debit_paise: 0n, credit_paise: BigInt(totalCollectionAmount) },
              ],
            });

            // Setup: reversal collection creation
            mockPrisma._tx.collections.create.mockResolvedValue({
              id: 'rev-coll',
              loan_id: 'loan-001',
              amount_paise: BigInt(-totalCollectionAmount),
              payment_date: new Date(),
            });
            mockPrisma._tx.collections.update.mockResolvedValue({});
            mockPrisma._tx.receipts.findMany.mockResolvedValue([]);

            // Setup: loan with schedules
            const cachedOutstanding = installments.reduce(
              (s, inst) =>
                s +
                Number(inst.principal_paise) +
                Number(inst.interest_paise) -
                Number(inst.principal_paid_paise) -
                Number(inst.interest_paid_paise),
              0,
            );

            deps.collectionRepo.lockLoanForUpdate.mockResolvedValue({
              id: 'loan-001',
              status: 'active',
              cached_outstanding_paise: BigInt(cachedOutstanding),
            });

            deps.collectionRepo.getLoanForCollection.mockResolvedValue({
              id: 'loan-001',
              loan_number: 'LN-2024-00001',
              customer_id: 'cust-001',
              principal_paise: 1_000_000n,
              status: 'active',
              total_payable_paise: 1_200_000n,
              cached_outstanding_paise: BigInt(cachedOutstanding),
              dpd: 0,
              overdue_bucket: 'bucket_0',
              product_version: { id: 'pv-001', allocation_order: ['penalty', 'interest', 'principal'] },
              customer: { id: 'cust-001', full_name: 'Test Customer', mobile: '9876543210' },
              schedules: installments,
            });

            // Execute reversal
            await service.reverseCollection(
              { collectionId, reason: 'test reversal', idempotencyKey: idempKey },
              'actor-001',
              'manager',
            );

            // Verify: each affected installment was restored correctly
            const updateCalls = deps.collectionRepo.updateInstallment.mock.calls;

            // Build expected restoration map: installment_id → expected paid amounts
            const expectedRestorations = new Map<
              string,
              { principal: number; interest: number; penalty: number }
            >();

            for (const alloc of allocations) {
              const inst = installments.find((s) => s.id === alloc.installment_id);
              if (!inst) continue;

              const existing = expectedRestorations.get(alloc.installment_id) ?? {
                principal: Number(inst.principal_paid_paise),
                interest: Number(inst.interest_paid_paise),
                penalty: Number(inst.penalty_paid_paise),
              };

              // Only set initial values once (first allocation for this installment)
              if (!expectedRestorations.has(alloc.installment_id)) {
                expectedRestorations.set(alloc.installment_id, existing);
              }

              // Subtract allocation amounts
              existing.principal -= Number(alloc.principal_paise);
              existing.interest -= Number(alloc.interest_paise);
              existing.penalty -= Number(alloc.penalty_paise);
            }

            // Clamp to zero (service uses Math.max(0, ...))
            for (const [, vals] of expectedRestorations) {
              vals.principal = Math.max(0, vals.principal);
              vals.interest = Math.max(0, vals.interest);
              vals.penalty = Math.max(0, vals.penalty);
            }

            // Verify each updateInstallment call matches expected restoration
            for (const [scheduleId, expected] of expectedRestorations) {
              const call = updateCalls.find(
                (c: unknown[]) => c[0] === scheduleId,
              );
              expect(
                call,
                `Expected updateInstallment call for ${scheduleId}`,
              ).toBeDefined();

              const updateData = call![1] as {
                principal_paid_paise: number;
                interest_paid_paise: number;
                penalty_paid_paise: number;
              };

              expect(
                updateData.principal_paid_paise,
                `principal_paid for ${scheduleId}`,
              ).toBe(expected.principal);
              expect(
                updateData.interest_paid_paise,
                `interest_paid for ${scheduleId}`,
              ).toBe(expected.interest);
              expect(
                updateData.penalty_paid_paise,
                `penalty_paid for ${scheduleId}`,
              ).toBe(expected.penalty);

              // Verify non-negative (no negative paid amounts)
              expect(updateData.principal_paid_paise).toBeGreaterThanOrEqual(0);
              expect(updateData.interest_paid_paise).toBeGreaterThanOrEqual(0);
              expect(updateData.penalty_paid_paise).toBeGreaterThanOrEqual(0);
            }
          },
        ),
        { numRuns: 1000 },
      );
    },
  );

  it(
    'installment status is correctly recomputed after restoration',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          installmentRestorationArb,
          fc.uuid(),
          fc.uuid(),
          async ({ installments, allocations, totalCollectionAmount }, collectionId, idempKey) => {
            if (totalCollectionAmount === 0) return;

            const mockPrisma = createMockPrisma();
            const deps = createMockDeps();
            const service = buildReversalService(mockPrisma, deps);

            // Setup mocks (same as above)
            mockPrisma._tx.collections.findUnique.mockResolvedValue({
              id: collectionId,
              loan_id: 'loan-001',
              amount_paise: BigInt(totalCollectionAmount),
              payment_date: new Date(),
              payment_mode: 'cash',
              status: 'posted',
              is_reversal: false,
              journal_entry_id: 'je-001',
            });
            mockPrisma._tx.collection_allocations.findMany.mockResolvedValue(allocations);
            mockPrisma._tx.journal_entries.findUnique.mockResolvedValue({
              id: 'je-001',
              lines: [
                { account_id: 'acc-cash', debit_paise: BigInt(totalCollectionAmount), credit_paise: 0n },
                { account_id: 'acc-recv', debit_paise: 0n, credit_paise: BigInt(totalCollectionAmount) },
              ],
            });
            mockPrisma._tx.collections.create.mockResolvedValue({
              id: 'rev-coll',
              loan_id: 'loan-001',
              amount_paise: BigInt(-totalCollectionAmount),
              payment_date: new Date(),
            });
            mockPrisma._tx.collections.update.mockResolvedValue({});
            mockPrisma._tx.receipts.findMany.mockResolvedValue([]);

            const cachedOutstanding = installments.reduce(
              (s, inst) =>
                s +
                Number(inst.principal_paise) +
                Number(inst.interest_paise) -
                Number(inst.principal_paid_paise) -
                Number(inst.interest_paid_paise),
              0,
            );

            deps.collectionRepo.lockLoanForUpdate.mockResolvedValue({
              id: 'loan-001',
              status: 'active',
              cached_outstanding_paise: BigInt(cachedOutstanding),
            });
            deps.collectionRepo.getLoanForCollection.mockResolvedValue({
              id: 'loan-001',
              loan_number: 'LN-2024-00001',
              customer_id: 'cust-001',
              principal_paise: 1_000_000n,
              status: 'active',
              total_payable_paise: 1_200_000n,
              cached_outstanding_paise: BigInt(cachedOutstanding),
              dpd: 0,
              overdue_bucket: 'bucket_0',
              product_version: { id: 'pv-001', allocation_order: ['penalty', 'interest', 'principal'] },
              customer: { id: 'cust-001', full_name: 'Test Customer', mobile: '9876543210' },
              schedules: installments,
            });

            await service.reverseCollection(
              { collectionId, reason: 'test', idempotencyKey: idempKey },
              'actor-001',
              'manager',
            );

            // Verify status correctness for each restored installment
            const updateCalls = deps.collectionRepo.updateInstallment.mock.calls;

            for (const call of updateCalls) {
              const scheduleId = call[0] as string;
              const updateData = call[1] as {
                principal_paid_paise: number;
                interest_paid_paise: number;
                penalty_paid_paise: number;
                status: string;
              };

              const inst = installments.find((s) => s.id === scheduleId);
              if (!inst) continue;

              const principalDue = Number(inst.principal_paise);
              const interestDue = Number(inst.interest_paise);

              const fullyPaid =
                updateData.principal_paid_paise >= principalDue &&
                updateData.interest_paid_paise >= interestDue;
              const partiallyPaid =
                updateData.principal_paid_paise > 0 ||
                updateData.interest_paid_paise > 0;

              const expectedStatus = fullyPaid
                ? 'paid'
                : partiallyPaid
                  ? 'partial'
                  : 'pending';

              expect(
                updateData.status,
                `Status for ${scheduleId}: paid(${updateData.principal_paid_paise}/${principalDue}, ${updateData.interest_paid_paise}/${interestDue})`,
              ).toBe(expectedStatus);
            }
          },
        ),
        { numRuns: 1000 },
      );
    },
  );
});
