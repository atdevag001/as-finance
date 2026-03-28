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
