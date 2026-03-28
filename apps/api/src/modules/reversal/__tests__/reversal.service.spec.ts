import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReversalService } from '../reversal.service';

/**
 * Unit tests for ReversalService.
 *
 * Validates:
 * - Double reversal prevention (COLLECTION_ALREADY_REVERSED)
 * - Reversal of reversal prevention (CANNOT_REVERSE_REVERSAL)
 * - Idempotency (cached result returned for duplicate key)
 * - Atomic execution flow (compensating entries, schedule rollback, ledger mirror)
 *
 * Requirements: 7.1, 7.2, 7.5, 7.6
 */

// ── Mock factories ──

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

function createMockCollectionRepository() {
  return {
    lockLoanForUpdate: vi.fn(),
    getLoanForCollection: vi.fn(),
    updateInstallment: vi.fn(),
    updateLoanOutstanding: vi.fn(),
    getOfficerName: vi.fn().mockResolvedValue('Test Officer'),
    findAccountByCode: vi.fn(),
  };
}

function createMockAccountingService() {
  return {
    createJournalEntry: vi.fn().mockResolvedValue({ id: 'mirror-je-id' }),
  };
}

function createMockAuditService() {
  return {
    createAuditLog: vi.fn().mockResolvedValue({ id: 'audit-id' }),
  };
}

function createMockIdempotencyService() {
  return {
    find: vi.fn().mockResolvedValue(null),
    store: vi.fn().mockResolvedValue({ resultStatus: 201, resultBody: {} }),
  };
}

function createMockReceiptService() {
  return {
    generateReceipt: vi.fn().mockResolvedValue({ id: 'comp-receipt-id', receipt_number: 'RCP-2024-00099' }),
    markAsReversed: vi.fn().mockResolvedValue({}),
  };
}

const SAMPLE_COLLECTION = {
  id: 'coll-001',
  loan_id: 'loan-001',
  amount_paise: 10000n,
  payment_date: new Date('2024-06-15'),
  payment_mode: 'cash',
  status: 'posted',
  is_reversal: false,
  journal_entry_id: 'je-001',
};

const SAMPLE_LOAN = {
  id: 'loan-001',
  loan_number: 'LN-2024-00001',
  customer_id: 'cust-001',
  principal_paise: 100000n,
  status: 'active',
  total_payable_paise: 112000n,
  cached_outstanding_paise: 102000n,
  dpd: 0,
  overdue_bucket: 'bucket_0',
  product_version: { id: 'pv-001', allocation_order: ['penalty', 'interest', 'principal'] },
  customer: { id: 'cust-001', full_name: 'Test Customer', mobile: '9876543210' },
  schedules: [
    {
      id: 'sched-001',
      installment_number: 1,
      due_date: new Date('2024-07-15'),
      principal_paise: 50000n,
      interest_paise: 6000n,
      total_paise: 56000n,
      principal_paid_paise: 4000n,
      interest_paid_paise: 6000n,
      penalty_paid_paise: 0n,
      status: 'partial',
    },
    {
      id: 'sched-002',
      installment_number: 2,
      due_date: new Date('2024-08-15'),
      principal_paise: 50000n,
      interest_paise: 6000n,
      total_paise: 56000n,
      principal_paid_paise: 0n,
      interest_paid_paise: 0n,
      penalty_paid_paise: 0n,
      status: 'pending',
    },
  ],
};

const SAMPLE_ALLOCATIONS = [
  {
    id: 'alloc-001',
    installment_id: 'sched-001',
    penalty_paise: 0n,
    interest_paise: 6000n,
    principal_paise: 4000n,
    total_paise: 10000n,
  },
];

const SAMPLE_JOURNAL = {
  id: 'je-001',
  lines: [
    { account_id: 'acc-cash', debit_paise: 10000n, credit_paise: 0n },
    { account_id: 'acc-recv', debit_paise: 0n, credit_paise: 4000n },
    { account_id: 'acc-int', debit_paise: 0n, credit_paise: 6000n },
  ],
};

describe('ReversalService', () => {
  let service: ReversalService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockCollectionRepo: ReturnType<typeof createMockCollectionRepository>;
  let mockAccountingService: ReturnType<typeof createMockAccountingService>;
  let mockAuditService: ReturnType<typeof createMockAuditService>;
  let mockIdempotencyService: ReturnType<typeof createMockIdempotencyService>;
  let mockReceiptService: ReturnType<typeof createMockReceiptService>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    mockCollectionRepo = createMockCollectionRepository();
    mockAccountingService = createMockAccountingService();
    mockAuditService = createMockAuditService();
    mockIdempotencyService = createMockIdempotencyService();
    mockReceiptService = createMockReceiptService();

    service = new ReversalService(
      mockPrisma as never,
      mockCollectionRepo as never,
      mockAccountingService as never,
      mockAuditService as never,
      mockIdempotencyService as never,
      mockReceiptService as never,
    );
  });

  function setupHappyPath() {
    mockPrisma._tx.collections.findUnique.mockResolvedValue(SAMPLE_COLLECTION);
    mockPrisma._tx.collection_allocations.findMany.mockResolvedValue(SAMPLE_ALLOCATIONS);
    mockPrisma._tx.journal_entries.findUnique.mockResolvedValue(SAMPLE_JOURNAL);
    mockPrisma._tx.collections.create.mockResolvedValue({
      id: 'rev-coll-001',
      loan_id: 'loan-001',
      amount_paise: -10000n,
      payment_date: new Date(),
    });
    mockPrisma._tx.collections.update.mockResolvedValue({});
    mockPrisma._tx.receipts.findMany.mockResolvedValue([
      { id: 'orig-receipt-001', amount_paise: 10000n, payment_mode: 'cash' },
    ]);
    mockCollectionRepo.lockLoanForUpdate.mockResolvedValue({
      id: 'loan-001',
      status: 'active',
      cached_outstanding_paise: 102000n,
    });
    mockCollectionRepo.getLoanForCollection.mockResolvedValue(SAMPLE_LOAN);
  }

  it('should return cached result for duplicate idempotency key', async () => {
    const cachedResult = { resultStatus: 201, resultBody: { reversalCollectionId: 'cached-id' } };
    mockIdempotencyService.find.mockResolvedValue(cachedResult);

    const result = await service.reverseCollection(
      { collectionId: 'coll-001', reason: 'test', idempotencyKey: 'dup-key' },
      'actor-001',
      'manager',
    );

    expect(result.statusCode).toBe(201);
    expect(result.data).toEqual(cachedResult.resultBody);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('should reject reversal of an already-reversed collection', async () => {
    mockPrisma._tx.collections.findUnique.mockResolvedValue({
      ...SAMPLE_COLLECTION,
      status: 'reversed',
    });
    mockCollectionRepo.lockLoanForUpdate.mockResolvedValue({
      id: 'loan-001',
      status: 'active',
      cached_outstanding_paise: 102000n,
    });
    mockCollectionRepo.getLoanForCollection.mockResolvedValue(SAMPLE_LOAN);

    await expect(
      service.reverseCollection(
        { collectionId: 'coll-001', reason: 'test', idempotencyKey: 'key-1' },
        'actor-001',
        'manager',
      ),
    ).rejects.toThrow('Collection has already been reversed');
  });

  it('should reject reversal of a reversal (no chained reversals)', async () => {
    mockPrisma._tx.collections.findUnique.mockResolvedValue({
      ...SAMPLE_COLLECTION,
      is_reversal: true,
    });
    mockCollectionRepo.lockLoanForUpdate.mockResolvedValue({
      id: 'loan-001',
      status: 'active',
      cached_outstanding_paise: 102000n,
    });
    mockCollectionRepo.getLoanForCollection.mockResolvedValue(SAMPLE_LOAN);

    await expect(
      service.reverseCollection(
        { collectionId: 'coll-001', reason: 'test', idempotencyKey: 'key-2' },
        'actor-001',
        'manager',
      ),
    ).rejects.toThrow('Cannot reverse a reversal');
  });

  it('should reject when collection is not found', async () => {
    mockPrisma._tx.collections.findUnique.mockResolvedValue(null);
    mockCollectionRepo.lockLoanForUpdate.mockResolvedValue({
      id: 'loan-001',
      status: 'active',
      cached_outstanding_paise: 102000n,
    });
    mockCollectionRepo.getLoanForCollection.mockResolvedValue(SAMPLE_LOAN);

    await expect(
      service.reverseCollection(
        { collectionId: 'nonexistent', reason: 'test', idempotencyKey: 'key-3' },
        'actor-001',
        'manager',
      ),
    ).rejects.toThrow('Collection not found');
  });

  it('should execute full reversal flow successfully', async () => {
    setupHappyPath();

    const result = await service.reverseCollection(
      { collectionId: 'coll-001', reason: 'Incorrect amount', idempotencyKey: 'key-4' },
      'actor-001',
      'manager',
    );

    expect(result.statusCode).toBe(201);
    expect(result.data).toMatchObject({
      originalCollectionId: 'coll-001',
      reversalCollectionId: 'rev-coll-001',
      loanId: 'loan-001',
      loanNumber: 'LN-2024-00001',
      reversedAmountPaise: 10000,
      reason: 'Incorrect amount',
    });

    // Verify compensating collection was created with negative amount
    expect(mockPrisma._tx.collections.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount_paise: -10000,
          is_reversal: true,
          original_collection_id: 'coll-001',
          reversal_reason: 'Incorrect amount',
        }),
      }),
    );

    // Verify reverse allocation was created
    const allocCreateCall = mockPrisma._tx.collection_allocations.create.mock.calls[0]![0] as {
      data: { collection_id: string; penalty_paise: number; interest_paise: number; principal_paise: number; total_paise: number };
    };
    expect(allocCreateCall.data.collection_id).toBe('rev-coll-001');
    expect(allocCreateCall.data.interest_paise).toBe(-6000);
    expect(allocCreateCall.data.principal_paise).toBe(-4000);
    expect(allocCreateCall.data.total_paise).toBe(-10000);
    // penalty_paise is -0 (negation of 0n), which is equivalent to 0
    expect(allocCreateCall.data.penalty_paise).toBe(-0);

    // Verify mirror journal entry was created (debits→credits, credits→debits)
    expect(mockAccountingService.createJournalEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: 'reversal',
        lines: [
          { accountId: 'acc-cash', debitPaise: 0, creditPaise: 10000 },
          { accountId: 'acc-recv', debitPaise: 4000, creditPaise: 0 },
          { accountId: 'acc-int', debitPaise: 6000, creditPaise: 0 },
        ],
      }),
      expect.anything(),
    );

    // Verify original collection marked as reversed
    expect(mockPrisma._tx.collections.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'coll-001' },
        data: { status: 'reversed' },
      }),
    );

    // Verify receipt handling
    expect(mockReceiptService.generateReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        isReversal: true,
        originalReceiptId: 'orig-receipt-001',
      }),
      expect.anything(),
    );
    expect(mockReceiptService.markAsReversed).toHaveBeenCalledWith(
      'orig-receipt-001',
      'comp-receipt-id',
      expect.anything(),
    );

    // Verify installment restoration
    expect(mockCollectionRepo.updateInstallment).toHaveBeenCalledWith(
      'sched-001',
      expect.objectContaining({
        principal_paid_paise: 0,
        interest_paid_paise: 0,
        penalty_paid_paise: 0,
        status: 'pending',
      }),
      expect.anything(),
    );

    // Verify loan outstanding updated
    expect(mockCollectionRepo.updateLoanOutstanding).toHaveBeenCalled();

    // Verify audit log created
    expect(mockAuditService.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action_type: 'collection_reversed',
        target_entity: 'collection',
        target_id: 'coll-001',
        remarks: 'Incorrect amount',
      }),
      expect.anything(),
    );

    // Verify idempotency stored
    expect(mockIdempotencyService.store).toHaveBeenCalledWith(
      'key-4',
      'reversal',
      201,
      expect.anything(),
      expect.anything(),
    );
  });
});
