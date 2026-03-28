import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../../common/errors';

/**
 * Integration tests for reversal flow.
 * Tests: collection reversal → compensating entries → schedule rollback → ledger mirror.
 *
 * Validates: Requirements 7.2, 7.4
 */

// We test the ReveralService by constructing it with mocked dependencies.
// Since the service uses prisma tx directly for some queries, we mock the tx object.

function createMockTx() {
  return {
    collections: {
      findUnique: vi.fn(),
      create: vi.fn().mockResolvedValue({ id: 'rev-col-1', loan_id: 'loan-1', amount_paise: -50000n, payment_date: new Date() }),
      update: vi.fn().mockResolvedValue({}),
    },
    collection_allocations: {
      findMany: vi.fn().mockResolvedValue([
        { id: 'alloc-1', installment_id: 's-1', penalty_paise: 0n, interest_paise: 10000n, principal_paise: 40000n, total_paise: 50000n },
      ]),
      create: vi.fn().mockResolvedValue({}),
    },
    journal_entries: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'je-1',
        lines: [
          { account_id: 'acc-cash', debit_paise: 50000n, credit_paise: 0n },
          { account_id: 'acc-lr', debit_paise: 0n, credit_paise: 40000n },
          { account_id: 'acc-int', debit_paise: 0n, credit_paise: 10000n },
        ],
      }),
    },
    receipts: {
      findMany: vi.fn().mockResolvedValue([{ id: 'rcp-1', amount_paise: 50000n, payment_mode: 'cash' }]),
    },
  };
}

function createMockDeps() {
  const tx = createMockTx();
  return {
    tx,
    prisma: { $transaction: vi.fn((fn: (t: unknown) => Promise<unknown>) => fn(tx)) },
    collectionRepo: {
      lockLoanForUpdate: vi.fn().mockResolvedValue({ id: 'loan-1', status: 'active', cached_outstanding_paise: 500000n }),
      getLoanForCollection: vi.fn().mockResolvedValue({
        id: 'loan-1', loan_number: 'LN-2024-00001', customer_id: 'cust-1', status: 'active',
        cached_outstanding_paise: 500000n, dpd: 0,
        customer: { id: 'cust-1', full_name: 'Test Customer', mobile: '9876543210' },
        schedules: [
          { id: 's-1', due_date: new Date('2024-01-15'), principal_paise: 500000n, interest_paise: 50000n, principal_paid_paise: 40000n, interest_paid_paise: 10000n, penalty_paid_paise: 0n },
        ],
      }),
      updateInstallment: vi.fn().mockResolvedValue(undefined),
      updateLoanOutstanding: vi.fn().mockResolvedValue(undefined),
      getOfficerName: vi.fn().mockResolvedValue('Officer Name'),
    },
    accounting: { createJournalEntry: vi.fn().mockResolvedValue({ id: 'je-mirror-1' }) },
    audit: { createAuditLog: vi.fn().mockResolvedValue({}) },
    idempotency: { find: vi.fn().mockResolvedValue(null), store: vi.fn().mockResolvedValue({}) },
    receipt: {
      generateReceipt: vi.fn().mockResolvedValue({ id: 'rcp-rev-1', receipt_number: 'RCP-2024-00002' }),
      markAsReversed: vi.fn().mockResolvedValue(undefined),
    },
  };
}

// We need to import the actual class. Since the service uses private methods
// that call tx directly, we construct it and let the mocked tx handle queries.
import { ReversalService } from '../reversal.service';

describe('Reversal Flow Integration', () => {
  let service: ReversalService;
  let deps: ReturnType<typeof createMockDeps>;

  beforeEach(() => {
    deps = createMockDeps();

    // Set up the original collection in the tx mock
    deps.tx.collections.findUnique.mockResolvedValue({
      id: 'col-1', loan_id: 'loan-1', amount_paise: 50000n,
      payment_date: new Date('2024-01-15'), payment_mode: 'cash',
      status: 'posted', is_reversal: false, journal_entry_id: 'je-1',
    });

    service = new ReversalService(
      deps.prisma as never, deps.collectionRepo as never, deps.accounting as never,
      deps.audit as never, deps.idempotency as never, deps.receipt as never,
    );
  });

  it('should complete full reversal flow: compensating entry → mirror journal → receipt → outstanding update', async () => {
    const result = await service.reverseCollection(
      { collectionId: 'col-1', reason: 'Incorrect amount', idempotencyKey: 'rev-key-1' },
      'manager-1', 'manager',
    );

    expect(result.statusCode).toBe(201);
    // Compensating collection created (negative amount)
    expect(deps.tx.collections.create).toHaveBeenCalled();
    // Reverse allocations created
    expect(deps.tx.collection_allocations.create).toHaveBeenCalled();
    // Mirror journal entry created (debits↔credits swapped)
    expect(deps.accounting.createJournalEntry).toHaveBeenCalled();
    const mirrorJe = deps.accounting.createJournalEntry.mock.calls[0]![0];
    // Original: DR Cash 50000, CR LR 40000, CR Int 10000
    // Mirror: DR LR 40000, DR Int 10000, CR Cash 50000
    expect(mirrorJe.lines).toEqual([
      { accountId: 'acc-cash', debitPaise: 0, creditPaise: 50000 },
      { accountId: 'acc-lr', debitPaise: 40000, creditPaise: 0 },
      { accountId: 'acc-int', debitPaise: 10000, creditPaise: 0 },
    ]);
    // Original receipt marked as reversed
    expect(deps.receipt.markAsReversed).toHaveBeenCalled();
    // Compensating receipt generated
    expect(deps.receipt.generateReceipt).toHaveBeenCalled();
    // Outstanding updated
    expect(deps.collectionRepo.updateLoanOutstanding).toHaveBeenCalled();
    // Audit log created
    expect(deps.audit.createAuditLog).toHaveBeenCalled();
  });

  it('should reject reversal of already-reversed collection', async () => {
    deps.tx.collections.findUnique.mockResolvedValue({
      id: 'col-1', loan_id: 'loan-1', amount_paise: 50000n,
      status: 'reversed', is_reversal: false, journal_entry_id: 'je-1',
    });

    await expect(
      service.reverseCollection(
        { collectionId: 'col-1', reason: 'Double reversal', idempotencyKey: 'rev-key-2' },
        'manager-1', 'manager',
      ),
    ).rejects.toThrow('already been reversed');
  });

  it('should reject reversal of a reversal (no chained reversals)', async () => {
    deps.tx.collections.findUnique.mockResolvedValue({
      id: 'col-rev', loan_id: 'loan-1', amount_paise: -50000n,
      status: 'posted', is_reversal: true, journal_entry_id: 'je-1',
    });

    await expect(
      service.reverseCollection(
        { collectionId: 'col-rev', reason: 'Chain attempt', idempotencyKey: 'rev-key-3' },
        'manager-1', 'manager',
      ),
    ).rejects.toThrow('Cannot reverse a reversal');
  });

  it('should return cached result for duplicate idempotency key', async () => {
    deps.idempotency.find.mockResolvedValue({ resultStatus: 201, resultBody: { reversalCollectionId: 'cached' } });

    const result = await service.reverseCollection(
      { collectionId: 'col-1', reason: 'Dup', idempotencyKey: 'dup-rev-key' },
      'manager-1', 'manager',
    );

    expect(result.data).toEqual({ reversalCollectionId: 'cached' });
    expect(deps.prisma.$transaction).not.toHaveBeenCalled();
  });
});
