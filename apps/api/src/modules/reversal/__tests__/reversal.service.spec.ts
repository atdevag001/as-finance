import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReversalService } from '../reversal.service';
import { NotFoundError } from '../../../common/errors';

/**
 * Unit tests for ReversalService.
 *
 * Validates:
 * - Compensating collection creation with is_reversal=true (Req 7.1)
 * - Original collection retrieval and validation (Req 7.2)
 * - Original allocation retrieval (Req 7.3)
 * - Original journal entry retrieval (Req 7.4)
 * - Installment restoration to pre-collection state (Req 7.5)
 * - Double reversal prevention — COLLECTION_ALREADY_REVERSED (Req 7.6)
 * - Mandatory reason/remarks field (Req 7.7)
 * - DPD recalculation after reversal (Req 7.8)
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8
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

// ── Sample data ──

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

// Multi-installment allocation data for restoreInstallments tests
const MULTI_ALLOCATIONS = [
  {
    id: 'alloc-001',
    installment_id: 'sched-001',
    penalty_paise: 500n,
    interest_paise: 6000n,
    principal_paise: 10000n,
    total_paise: 16500n,
  },
  {
    id: 'alloc-002',
    installment_id: 'sched-002',
    penalty_paise: 0n,
    interest_paise: 3500n,
    principal_paise: 0n,
    total_paise: 3500n,
  },
];

const MULTI_LOAN = {
  ...SAMPLE_LOAN,
  cached_outstanding_paise: 92000n,
  schedules: [
    {
      id: 'sched-001',
      installment_number: 1,
      due_date: new Date('2024-07-15'),
      principal_paise: 50000n,
      interest_paise: 6000n,
      total_paise: 56000n,
      principal_paid_paise: 10000n,
      interest_paid_paise: 6000n,
      penalty_paid_paise: 500n,
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
      interest_paid_paise: 3500n,
      penalty_paid_paise: 0n,
      status: 'partial',
    },
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

  function setupMultiAllocationPath() {
    mockPrisma._tx.collections.findUnique.mockResolvedValue({
      ...SAMPLE_COLLECTION,
      amount_paise: 20000n,
    });
    mockPrisma._tx.collection_allocations.findMany.mockResolvedValue(MULTI_ALLOCATIONS);
    mockPrisma._tx.journal_entries.findUnique.mockResolvedValue({
      id: 'je-001',
      lines: [
        { account_id: 'acc-cash', debit_paise: 20000n, credit_paise: 0n },
        { account_id: 'acc-recv', debit_paise: 0n, credit_paise: 10000n },
        { account_id: 'acc-int', debit_paise: 0n, credit_paise: 9500n },
        { account_id: 'acc-pen', debit_paise: 0n, credit_paise: 500n },
      ],
    });
    mockPrisma._tx.collections.create.mockResolvedValue({
      id: 'rev-coll-002',
      loan_id: 'loan-001',
      amount_paise: -20000n,
      payment_date: new Date(),
    });
    mockPrisma._tx.collections.update.mockResolvedValue({});
    mockPrisma._tx.receipts.findMany.mockResolvedValue([
      { id: 'orig-receipt-002', amount_paise: 20000n, payment_mode: 'cash' },
    ]);
    mockCollectionRepo.lockLoanForUpdate.mockResolvedValue({
      id: 'loan-001',
      status: 'active',
      cached_outstanding_paise: 92000n,
    });
    mockCollectionRepo.getLoanForCollection.mockResolvedValue(MULTI_LOAN);
  }

  // ── Req 7.1: reverseCollection() — compensating collection with is_reversal=true ──

  describe('reverseCollection()', () => {
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

    it('should create compensating collection with negative amount and is_reversal=true', async () => {
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
    });

    it('should create reverse allocation records with negated amounts', async () => {
      setupHappyPath();

      await service.reverseCollection(
        { collectionId: 'coll-001', reason: 'test', idempotencyKey: 'key-alloc' },
        'actor-001',
        'manager',
      );

      const allocCreateCall = mockPrisma._tx.collection_allocations.create.mock.calls[0]![0] as {
        data: { collection_id: string; penalty_paise: number; interest_paise: number; principal_paise: number; total_paise: number };
      };
      expect(allocCreateCall.data.collection_id).toBe('rev-coll-001');
      expect(allocCreateCall.data.interest_paise).toBe(-6000);
      expect(allocCreateCall.data.principal_paise).toBe(-4000);
      expect(allocCreateCall.data.total_paise).toBe(-10000);
    });

    it('should create mirror journal entry (debits→credits, credits→debits)', async () => {
      setupHappyPath();

      await service.reverseCollection(
        { collectionId: 'coll-001', reason: 'test', idempotencyKey: 'key-je' },
        'actor-001',
        'manager',
      );

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
    });

    it('should mark original collection as reversed', async () => {
      setupHappyPath();

      await service.reverseCollection(
        { collectionId: 'coll-001', reason: 'test', idempotencyKey: 'key-mark' },
        'actor-001',
        'manager',
      );

      expect(mockPrisma._tx.collections.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'coll-001' },
          data: { status: 'reversed' },
        }),
      );
    });

    it('should handle receipt reversal and compensating receipt generation', async () => {
      setupHappyPath();

      await service.reverseCollection(
        { collectionId: 'coll-001', reason: 'test', idempotencyKey: 'key-rcpt' },
        'actor-001',
        'manager',
      );

      expect(mockReceiptService.generateReceipt).toHaveBeenCalledWith(
        expect.objectContaining({
          isReversal: true,
          originalReceiptId: 'orig-receipt-001',
          amountPaise: -10000,
        }),
        expect.anything(),
      );
      expect(mockReceiptService.markAsReversed).toHaveBeenCalledWith(
        'orig-receipt-001',
        'comp-receipt-id',
        expect.anything(),
      );
    });

    it('should skip receipt handling when no original receipts exist', async () => {
      setupHappyPath();
      mockPrisma._tx.receipts.findMany.mockResolvedValue([]);

      await service.reverseCollection(
        { collectionId: 'coll-001', reason: 'test', idempotencyKey: 'key-no-rcpt' },
        'actor-001',
        'manager',
      );

      expect(mockReceiptService.generateReceipt).not.toHaveBeenCalled();
      expect(mockReceiptService.markAsReversed).not.toHaveBeenCalled();
    });

    it('should create audit log with reversal reason', async () => {
      setupHappyPath();

      await service.reverseCollection(
        { collectionId: 'coll-001', reason: 'Customer dispute', idempotencyKey: 'key-audit' },
        'actor-001',
        'manager',
      );

      expect(mockAuditService.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action_type: 'collection_reversed',
          actor_id: 'actor-001',
          actor_role: 'manager',
          target_entity: 'collection',
          target_id: 'coll-001',
          remarks: 'Customer dispute',
        }),
        expect.anything(),
      );
    });

    it('should store idempotency result after successful reversal', async () => {
      setupHappyPath();

      await service.reverseCollection(
        { collectionId: 'coll-001', reason: 'test', idempotencyKey: 'key-idemp' },
        'actor-001',
        'manager',
      );

      expect(mockIdempotencyService.store).toHaveBeenCalledWith(
        'key-idemp',
        'reversal',
        201,
        expect.objectContaining({
          reversalCollectionId: 'rev-coll-001',
          originalCollectionId: 'coll-001',
        }),
        expect.anything(),
      );
    });

    it('should throw NotFoundError when loan is not found via lockLoanForUpdate', async () => {
      mockPrisma._tx.collections.findUnique.mockResolvedValue(SAMPLE_COLLECTION);
      mockCollectionRepo.lockLoanForUpdate.mockResolvedValue(null);

      await expect(
        service.reverseCollection(
          { collectionId: 'coll-001', reason: 'test', idempotencyKey: 'key-no-loan' },
          'actor-001',
          'manager',
        ),
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError when loan is not found via getLoanForCollection', async () => {
      mockPrisma._tx.collections.findUnique.mockResolvedValue(SAMPLE_COLLECTION);
      mockCollectionRepo.lockLoanForUpdate.mockResolvedValue({
        id: 'loan-001',
        status: 'active',
        cached_outstanding_paise: 102000n,
      });
      mockCollectionRepo.getLoanForCollection.mockResolvedValue(null);

      await expect(
        service.reverseCollection(
          { collectionId: 'coll-001', reason: 'test', idempotencyKey: 'key-no-loan2' },
          'actor-001',
          'manager',
        ),
      ).rejects.toThrow(NotFoundError);
    });

    it('should update loan outstanding, DPD, and overdue bucket', async () => {
      setupHappyPath();

      await service.reverseCollection(
        { collectionId: 'coll-001', reason: 'test', idempotencyKey: 'key-outstanding' },
        'actor-001',
        'manager',
      );

      expect(mockCollectionRepo.updateLoanOutstanding).toHaveBeenCalledWith(
        'loan-001',
        expect.objectContaining({
          cached_outstanding_paise: expect.any(BigInt),
          dpd: expect.any(Number),
          overdue_bucket: expect.any(String),
        }),
        expect.anything(),
      );
    });

    it('should handle multi-installment allocations correctly', async () => {
      setupMultiAllocationPath();

      const result = await service.reverseCollection(
        { collectionId: 'coll-001', reason: 'test', idempotencyKey: 'key-multi' },
        'actor-001',
        'manager',
      );

      expect(result.statusCode).toBe(201);
      // Two reverse allocations should be created
      expect(mockPrisma._tx.collection_allocations.create).toHaveBeenCalledTimes(2);

      // First allocation reversal (sched-001)
      const call1 = mockPrisma._tx.collection_allocations.create.mock.calls[0]![0] as {
        data: { installment_id: string; penalty_paise: number; interest_paise: number; principal_paise: number };
      };
      expect(call1.data.installment_id).toBe('sched-001');
      expect(call1.data.penalty_paise).toBe(-500);
      expect(call1.data.interest_paise).toBe(-6000);
      expect(call1.data.principal_paise).toBe(-10000);

      // Second allocation reversal (sched-002)
      const call2 = mockPrisma._tx.collection_allocations.create.mock.calls[1]![0] as {
        data: { installment_id: string; penalty_paise: number; interest_paise: number; principal_paise: number };
      };
      expect(call2.data.installment_id).toBe('sched-002');
      expect(call2.data.penalty_paise).toBe(-0);
      expect(call2.data.interest_paise).toBe(-3500);
      expect(call2.data.principal_paise).toBe(-0);
    });
  });

  // ── Req 7.2: getOriginalCollection() — retrieval and validation ──

  describe('getOriginalCollection() validation', () => {
    it('should reject when collection is not found', async () => {
      mockPrisma._tx.collections.findUnique.mockResolvedValue(null);
      mockCollectionRepo.lockLoanForUpdate.mockResolvedValue({
        id: 'loan-001', status: 'active', cached_outstanding_paise: 102000n,
      });
      mockCollectionRepo.getLoanForCollection.mockResolvedValue(SAMPLE_LOAN);

      await expect(
        service.reverseCollection(
          { collectionId: 'nonexistent', reason: 'test', idempotencyKey: 'key-nf' },
          'actor-001',
          'manager',
        ),
      ).rejects.toThrow(NotFoundError);
    });

    it('should reject reversal of a reversal (CANNOT_REVERSE_REVERSAL)', async () => {
      mockPrisma._tx.collections.findUnique.mockResolvedValue({
        ...SAMPLE_COLLECTION,
        is_reversal: true,
      });
      mockCollectionRepo.lockLoanForUpdate.mockResolvedValue({
        id: 'loan-001', status: 'active', cached_outstanding_paise: 102000n,
      });
      mockCollectionRepo.getLoanForCollection.mockResolvedValue(SAMPLE_LOAN);

      await expect(
        service.reverseCollection(
          { collectionId: 'coll-001', reason: 'test', idempotencyKey: 'key-rev-rev' },
          'actor-001',
          'manager',
        ),
      ).rejects.toThrow('Cannot reverse a reversal');
    });

    // ── Req 7.6: Double reversal prevention ──
    it('should reject reversal of already-reversed collection (COLLECTION_ALREADY_REVERSED)', async () => {
      mockPrisma._tx.collections.findUnique.mockResolvedValue({
        ...SAMPLE_COLLECTION,
        status: 'reversed',
      });
      mockCollectionRepo.lockLoanForUpdate.mockResolvedValue({
        id: 'loan-001', status: 'active', cached_outstanding_paise: 102000n,
      });
      mockCollectionRepo.getLoanForCollection.mockResolvedValue(SAMPLE_LOAN);

      await expect(
        service.reverseCollection(
          { collectionId: 'coll-001', reason: 'test', idempotencyKey: 'key-double' },
          'actor-001',
          'manager',
        ),
      ).rejects.toThrow('Collection has already been reversed');
    });
  });

  // ── Req 7.3: getOriginalAllocations() ──

  describe('getOriginalAllocations()', () => {
    it('should retrieve allocation records for the collection', async () => {
      setupHappyPath();

      await service.reverseCollection(
        { collectionId: 'coll-001', reason: 'test', idempotencyKey: 'key-allocs' },
        'actor-001',
        'manager',
      );

      expect(mockPrisma._tx.collection_allocations.findMany).toHaveBeenCalledWith({
        where: { collection_id: 'coll-001' },
        select: {
          id: true,
          installment_id: true,
          penalty_paise: true,
          interest_paise: true,
          principal_paise: true,
          total_paise: true,
        },
      });
    });
  });

  // ── Req 7.4: getOriginalJournalEntry() ──

  describe('getOriginalJournalEntry()', () => {
    it('should retrieve journal entry with lines for mirroring', async () => {
      setupHappyPath();

      await service.reverseCollection(
        { collectionId: 'coll-001', reason: 'test', idempotencyKey: 'key-je-fetch' },
        'actor-001',
        'manager',
      );

      expect(mockPrisma._tx.journal_entries.findUnique).toHaveBeenCalledWith({
        where: { id: 'je-001' },
        select: {
          id: true,
          lines: {
            select: {
              account_id: true,
              debit_paise: true,
              credit_paise: true,
            },
          },
        },
      });
    });

    it('should throw NotFoundError when journal entry is not found', async () => {
      mockPrisma._tx.collections.findUnique.mockResolvedValue(SAMPLE_COLLECTION);
      mockPrisma._tx.collection_allocations.findMany.mockResolvedValue(SAMPLE_ALLOCATIONS);
      mockPrisma._tx.journal_entries.findUnique.mockResolvedValue(null);
      mockCollectionRepo.lockLoanForUpdate.mockResolvedValue({
        id: 'loan-001', status: 'active', cached_outstanding_paise: 102000n,
      });
      mockCollectionRepo.getLoanForCollection.mockResolvedValue(SAMPLE_LOAN);

      await expect(
        service.reverseCollection(
          { collectionId: 'coll-001', reason: 'test', idempotencyKey: 'key-no-je' },
          'actor-001',
          'manager',
        ),
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ── Req 7.5: restoreInstallments() ──

  describe('restoreInstallments()', () => {
    it('should restore single installment to pre-collection state', async () => {
      setupHappyPath();

      await service.reverseCollection(
        { collectionId: 'coll-001', reason: 'test', idempotencyKey: 'key-restore' },
        'actor-001',
        'manager',
      );

      // sched-001 had principal_paid=4000, interest_paid=6000, penalty_paid=0
      // Allocation was principal=4000, interest=6000, penalty=0
      // After reversal: principal_paid=0, interest_paid=0, penalty_paid=0 → status=pending
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
    });

    it('should restore multiple installments across multi-allocation reversal', async () => {
      setupMultiAllocationPath();

      await service.reverseCollection(
        { collectionId: 'coll-001', reason: 'test', idempotencyKey: 'key-multi-restore' },
        'actor-001',
        'manager',
      );

      // sched-001: paid(10000,6000,500) - alloc(10000,6000,500) = (0,0,0) → pending
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

      // sched-002: paid(0,3500,0) - alloc(0,3500,0) = (0,0,0) → pending
      expect(mockCollectionRepo.updateInstallment).toHaveBeenCalledWith(
        'sched-002',
        expect.objectContaining({
          principal_paid_paise: 0,
          interest_paid_paise: 0,
          penalty_paid_paise: 0,
          status: 'pending',
        }),
        expect.anything(),
      );
    });

    it('should restore to partial status when only part of payment is reversed', async () => {
      // Scenario: installment had prior payments beyond what this collection added
      const partialLoan = {
        ...SAMPLE_LOAN,
        schedules: [
          {
            id: 'sched-001',
            installment_number: 1,
            due_date: new Date('2024-07-15'),
            principal_paise: 50000n,
            interest_paise: 6000n,
            total_paise: 56000n,
            // Had 30000 principal paid (20000 from prior + 4000 from this collection)
            principal_paid_paise: 24000n,
            interest_paid_paise: 6000n,
            penalty_paid_paise: 0n,
            status: 'partial',
          },
          { ...SAMPLE_LOAN.schedules[1]! },
        ],
      };

      mockPrisma._tx.collections.findUnique.mockResolvedValue(SAMPLE_COLLECTION);
      mockPrisma._tx.collection_allocations.findMany.mockResolvedValue(SAMPLE_ALLOCATIONS);
      mockPrisma._tx.journal_entries.findUnique.mockResolvedValue(SAMPLE_JOURNAL);
      mockPrisma._tx.collections.create.mockResolvedValue({
        id: 'rev-coll-003', loan_id: 'loan-001', amount_paise: -10000n, payment_date: new Date(),
      });
      mockPrisma._tx.collections.update.mockResolvedValue({});
      mockPrisma._tx.receipts.findMany.mockResolvedValue([]);
      mockCollectionRepo.lockLoanForUpdate.mockResolvedValue({
        id: 'loan-001', status: 'active', cached_outstanding_paise: 102000n,
      });
      mockCollectionRepo.getLoanForCollection.mockResolvedValue(partialLoan);

      await service.reverseCollection(
        { collectionId: 'coll-001', reason: 'test', idempotencyKey: 'key-partial-restore' },
        'actor-001',
        'manager',
      );

      // After reversal: principal_paid = 24000 - 4000 = 20000, interest_paid = 6000 - 6000 = 0
      // 20000 > 0 so partiallyPaid = true, but 20000 < 50000 so not fullyPaid → partial
      expect(mockCollectionRepo.updateInstallment).toHaveBeenCalledWith(
        'sched-001',
        expect.objectContaining({
          principal_paid_paise: 20000,
          interest_paid_paise: 0,
          penalty_paid_paise: 0,
          status: 'partial',
        }),
        expect.anything(),
      );
    });

    it('should not produce negative paid amounts (clamps to zero)', async () => {
      // Edge case: allocation amounts exceed current paid amounts (shouldn't happen normally)
      const edgeLoan = {
        ...SAMPLE_LOAN,
        schedules: [
          {
            id: 'sched-001',
            installment_number: 1,
            due_date: new Date('2024-07-15'),
            principal_paise: 50000n,
            interest_paise: 6000n
,
            total_paise: 56000n,
            // Paid amounts are less than allocation amounts (edge case)
            principal_paid_paise: 2000n,
            interest_paid_paise: 3000n,
            penalty_paid_paise: 0n,
            status: 'partial',
          },
          { ...SAMPLE_LOAN.schedules[1]! },
        ],
      };

      mockPrisma._tx.collections.findUnique.mockResolvedValue(SAMPLE_COLLECTION);
      mockPrisma._tx.collection_allocations.findMany.mockResolvedValue(SAMPLE_ALLOCATIONS);
      mockPrisma._tx.journal_entries.findUnique.mockResolvedValue(SAMPLE_JOURNAL);
      mockPrisma._tx.collections.create.mockResolvedValue({
        id: 'rev-coll-004', loan_id: 'loan-001', amount_paise: -10000n, payment_date: new Date(),
      });
      mockPrisma._tx.collections.update.mockResolvedValue({});
      mockPrisma._tx.receipts.findMany.mockResolvedValue([]);
      mockCollectionRepo.lockLoanForUpdate.mockResolvedValue({
        id: 'loan-001', status: 'active', cached_outstanding_paise: 102000n,
      });
      mockCollectionRepo.getLoanForCollection.mockResolvedValue(edgeLoan);

      await service.reverseCollection(
        { collectionId: 'coll-001', reason: 'test', idempotencyKey: 'key-clamp' },
        'actor-001',
        'manager',
      );

      // Math.max(0, 2000 - 4000) = 0, Math.max(0, 3000 - 6000) = 0
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
    });
  });

  // ── Req 7.7: Mandatory reason/remarks ──

  describe('mandatory reason/remarks', () => {
    it('should pass reason through to compensating collection record', async () => {
      setupHappyPath();

      await service.reverseCollection(
        { collectionId: 'coll-001', reason: 'Customer paid wrong loan', idempotencyKey: 'key-reason' },
        'actor-001',
        'manager',
      );

      expect(mockPrisma._tx.collections.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reversal_reason: 'Customer paid wrong loan',
          }),
        }),
      );
    });

    it('should pass reason through to audit log remarks', async () => {
      setupHappyPath();

      await service.reverseCollection(
        { collectionId: 'coll-001', reason: 'Duplicate payment', idempotencyKey: 'key-reason2' },
        'actor-001',
        'manager',
      );

      expect(mockAuditService.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          remarks: 'Duplicate payment',
        }),
        expect.anything(),
      );
    });

    it('should include reason in the result body', async () => {
      setupHappyPath();

      const result = await service.reverseCollection(
        { collectionId: 'coll-001', reason: 'Amount error', idempotencyKey: 'key-reason3' },
        'actor-001',
        'manager',
      );

      expect((result.data as Record<string, unknown>)['reason']).toBe('Amount error');
    });
  });

  // ── Req 7.8: computeDpdAndBucket() — DPD recalculation after reversal ──

  describe('computeDpdAndBucket() after reversal', () => {
    it('should compute DPD=0 and bucket_0 when all installments are fully paid after reversal', async () => {
      // All installments remain fully paid after reversal (reversal of a small amount)
      const fullyPaidLoan = {
        ...SAMPLE_LOAN,
        schedules: [
          {
            id: 'sched-001',
            installment_number: 1,
            due_date: new Date('2024-07-15'),
            principal_paise: 50000n,
            interest_paise: 6000n,
            total_paise: 56000n,
            principal_paid_paise: 54000n,
            interest_paid_paise: 6000n,
            penalty_paid_paise: 0n,
            status: 'paid',
          },
          {
            id: 'sched-002',
            installment_number: 2,
            due_date: new Date('2024-08-15'),
            principal_paise: 50000n,
            interest_paise: 6000n,
            total_paise: 56000n,
            principal_paid_paise: 50000n,
            interest_paid_paise: 6000n,
            penalty_paid_paise: 0n,
            status: 'paid',
          },
        ],
      };

      // Allocation only on sched-001 for 4000 principal
      const smallAlloc = [{
        id: 'alloc-small',
        installment_id: 'sched-001',
        penalty_paise: 0n,
        interest_paise: 0n,
        principal_paise: 4000n,
        total_paise: 4000n,
      }];

      mockPrisma._tx.collections.findUnique.mockResolvedValue({
        ...SAMPLE_COLLECTION, amount_paise: 4000n,
      });
      mockPrisma._tx.collection_allocations.findMany.mockResolvedValue(smallAlloc);
      mockPrisma._tx.journal_entries.findUnique.mockResolvedValue({
        id: 'je-001',
        lines: [
          { account_id: 'acc-cash', debit_paise: 4000n, credit_paise: 0n },
          { account_id: 'acc-recv', debit_paise: 0n, credit_paise: 4000n },
        ],
      });
      mockPrisma._tx.collections.create.mockResolvedValue({
        id: 'rev-coll-dpd', loan_id: 'loan-001', amount_paise: -4000n, payment_date: new Date(),
      });
      mockPrisma._tx.collections.update.mockResolvedValue({});
      mockPrisma._tx.receipts.findMany.mockResolvedValue([]);
      mockCollectionRepo.lockLoanForUpdate.mockResolvedValue({
        id: 'loan-001', status: 'active', cached_outstanding_paise: 0n,
      });
      mockCollectionRepo.getLoanForCollection.mockResolvedValue(fullyPaidLoan);

      await service.reverseCollection(
        { collectionId: 'coll-001', reason: 'test', idempotencyKey: 'key-dpd-0' },
        'actor-001',
        'manager',
      );

      // After reversal: sched-001 principal_paid = 54000-4000 = 50000 >= 50000 → still fully paid
      // All installments still fully paid → DPD=0, bucket_0
      expect(mockCollectionRepo.updateLoanOutstanding).toHaveBeenCalledWith(
        'loan-001',
        expect.objectContaining({
          dpd: 0,
          overdue_bucket: 'bucket_0',
        }),
        expect.anything(),
      );
    });

    it('should compute positive DPD when reversal makes an installment unpaid and overdue', async () => {
      // Installment due date is far in the past → reversal creates overdue
      const pastDueDate = new Date();
      pastDueDate.setDate(pastDueDate.getDate() - 45); // 45 days ago

      const overdueLoan = {
        ...SAMPLE_LOAN,
        schedules: [
          {
            id: 'sched-001',
            installment_number: 1,
            due_date: pastDueDate,
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
            due_date: new Date('2099-08-15'),
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

      mockPrisma._tx.collections.findUnique.mockResolvedValue(SAMPLE_COLLECTION);
      mockPrisma._tx.collection_allocations.findMany.mockResolvedValue(SAMPLE_ALLOCATIONS);
      mockPrisma._tx.journal_entries.findUnique.mockResolvedValue(SAMPLE_JOURNAL);
      mockPrisma._tx.collections.create.mockResolvedValue({
        id: 'rev-coll-dpd2', loan_id: 'loan-001', amount_paise: -10000n, payment_date: new Date(),
      });
      mockPrisma._tx.collections.update.mockResolvedValue({});
      mockPrisma._tx.receipts.findMany.mockResolvedValue([]);
      mockCollectionRepo.lockLoanForUpdate.mockResolvedValue({
        id: 'loan-001', status: 'active', cached_outstanding_paise: 102000n,
      });
      mockCollectionRepo.getLoanForCollection.mockResolvedValue(overdueLoan);

      await service.reverseCollection(
        { collectionId: 'coll-001', reason: 'test', idempotencyKey: 'key-dpd-overdue' },
        'actor-001',
        'manager',
      );

      // After reversal: sched-001 becomes fully unpaid, due 45 days ago
      // DPD should be ~45, bucket should be bucket_31_60
      const outstandingCall = mockCollectionRepo.updateLoanOutstanding.mock.calls[0]!;
      const dpdData = outstandingCall[1] as { dpd: number; overdue_bucket: string };
      expect(dpdData.dpd).toBeGreaterThanOrEqual(44);
      expect(dpdData.dpd).toBeLessThanOrEqual(46);
      expect(dpdData.overdue_bucket).toBe('bucket_31_60');
    });

    it('should classify bucket_1_30 for DPD between 1 and 30', async () => {
      const recentDueDate = new Date();
      recentDueDate.setDate(recentDueDate.getDate() - 15); // 15 days ago

      const recentOverdueLoan = {
        ...SAMPLE_LOAN,
        schedules: [
          {
            id: 'sched-001',
            installment_number: 1,
            due_date: recentDueDate,
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
            due_date: new Date('2099-08-15'),
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

      mockPrisma._tx.collections.findUnique.mockResolvedValue(SAMPLE_COLLECTION);
      mockPrisma._tx.collection_allocations.findMany.mockResolvedValue(SAMPLE_ALLOCATIONS);
      mockPrisma._tx.journal_entries.findUnique.mockResolvedValue(SAMPLE_JOURNAL);
      mockPrisma._tx.collections.create.mockResolvedValue({
        id: 'rev-coll-dpd3', loan_id: 'loan-001', amount_paise: -10000n, payment_date: new Date(),
      });
      mockPrisma._tx.collections.update.mockResolvedValue({});
      mockPrisma._tx.receipts.findMany.mockResolvedValue([]);
      mockCollectionRepo.lockLoanForUpdate.mockResolvedValue({
        id: 'loan-001', status: 'active', cached_outstanding_paise: 102000n,
      });
      mockCollectionRepo.getLoanForCollection.mockResolvedValue(recentOverdueLoan);

      await service.reverseCollection(
        { collectionId: 'coll-001', reason: 'test', idempotencyKey: 'key-dpd-1-30' },
        'actor-001',
        'manager',
      );

      const outstandingCall = mockCollectionRepo.updateLoanOutstanding.mock.calls[0]!;
      const dpdData = outstandingCall[1] as { dpd: number; overdue_bucket: string };
      expect(dpdData.dpd).toBeGreaterThanOrEqual(14);
      expect(dpdData.dpd).toBeLessThanOrEqual(16);
      expect(dpdData.overdue_bucket).toBe('bucket_1_30');
    });

    it('should classify bucket_90_plus for DPD > 90', async () => {
      const oldDueDate = new Date();
      oldDueDate.setDate(oldDueDate.getDate() - 120); // 120 days ago

      const severeOverdueLoan = {
        ...SAMPLE_LOAN,
        schedules: [
          {
            id: 'sched-001',
            installment_number: 1,
            due_date: oldDueDate,
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
            due_date: new Date('2099-08-15'),
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

      mockPrisma._tx.collections.findUnique.mockResolvedValue(SAMPLE_COLLECTION);
      mockPrisma._tx.collection_allocations.findMany.mockResolvedValue(SAMPLE_ALLOCATIONS);
      mockPrisma._tx.journal_entries.findUnique.mockResolvedValue(SAMPLE_JOURNAL);
      mockPrisma._tx.collections.create.mockResolvedValue({
        id: 'rev-coll-dpd4', loan_id: 'loan-001', amount_paise: -10000n, payment_date: new Date(),
      });
      mockPrisma._tx.collections.update.mockResolvedValue({});
      mockPrisma._tx.receipts.findMany.mockResolvedValue([]);
      mockCollectionRepo.lockLoanForUpdate.mockResolvedValue({
        id: 'loan-001', status: 'active', cached_outstanding_paise: 102000n,
      });
      mockCollectionRepo.getLoanForCollection.mockResolvedValue(severeOverdueLoan);

      await service.reverseCollection(
        { collectionId: 'coll-001', reason: 'test', idempotencyKey: 'key-dpd-90plus' },
        'actor-001',
        'manager',
      );

      const outstandingCall = mockCollectionRepo.updateLoanOutstanding.mock.calls[0]!;
      const dpdData = outstandingCall[1] as { dpd: number; overdue_bucket: string };
      expect(dpdData.dpd).toBeGreaterThanOrEqual(119);
      expect(dpdData.overdue_bucket).toBe('bucket_90_plus');
    });

    it('should classify bucket_61_90 for DPD between 61 and 90', async () => {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() - 75); // 75 days ago

      const overdueLoan = {
        ...SAMPLE_LOAN,
        schedules: [
          {
            id: 'sched-001',
            installment_number: 1,
            due_date: dueDate,
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
            due_date: new Date('2099-08-15'),
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

      mockPrisma._tx.collections.findUnique.mockResolvedValue(SAMPLE_COLLECTION);
      mockPrisma._tx.collection_allocations.findMany.mockResolvedValue(SAMPLE_ALLOCATIONS);
      mockPrisma._tx.journal_entries.findUnique.mockResolvedValue(SAMPLE_JOURNAL);
      mockPrisma._tx.collections.create.mockResolvedValue({
        id: 'rev-coll-dpd5', loan_id: 'loan-001', amount_paise: -10000n, payment_date: new Date(),
      });
      mockPrisma._tx.collections.update.mockResolvedValue({});
      mockPrisma._tx.receipts.findMany.mockResolvedValue([]);
      mockCollectionRepo.lockLoanForUpdate.mockResolvedValue({
        id: 'loan-001', status: 'active', cached_outstanding_paise: 102000n,
      });
      mockCollectionRepo.getLoanForCollection.mockResolvedValue(overdueLoan);

      await service.reverseCollection(
        { collectionId: 'coll-001', reason: 'test', idempotencyKey: 'key-dpd-61-90' },
        'actor-001',
        'manager',
      );

      const outstandingCall = mockCollectionRepo.updateLoanOutstanding.mock.calls[0]!;
      const dpdData = outstandingCall[1] as { dpd: number; overdue_bucket: string };
      expect(dpdData.dpd).toBeGreaterThanOrEqual(74);
      expect(dpdData.dpd).toBeLessThanOrEqual(76);
      expect(dpdData.overdue_bucket).toBe('bucket_61_90');
    });

    it('should compute new outstanding as current + reversed amount', async () => {
      setupHappyPath();

      await service.reverseCollection(
        { collectionId: 'coll-001', reason: 'test', idempotencyKey: 'key-outstanding-calc' },
        'actor-001',
        'manager',
      );

      // current outstanding = 102000, reversed amount = 10000
      // new outstanding = 102000 + 10000 = 112000
      const outstandingCall = mockCollectionRepo.updateLoanOutstanding.mock.calls[0]!;
      const data = outstandingCall[1] as { cached_outstanding_paise: bigint };
      expect(data.cached_outstanding_paise).toBe(BigInt(112000));
    });
  });
});
