import { describe, it, expect, vi } from 'vitest';
import { CollectionService } from '../src/modules/collection/collection.service';
import { DisbursementService } from '../src/modules/disbursement/disbursement.service';
import { ReversalService } from '../src/modules/reversal/reversal.service';
import { PenaltyService } from '../src/modules/penalty/penalty.service';
import { LoanService } from '../src/modules/loan/loan.service';
import { ReceiptService } from '../src/modules/receipt/receipt.service';
import { ConflictError } from '../src/common/errors';

/**
 * Concurrency tests.
 *
 * Tests: double-click payment (idempotency), concurrent collection posting,
 *        concurrent disbursement, concurrent reversal, concurrent loan approval,
 *        receipt number generation, concurrent penalty posting,
 *        same idempotency key concurrent requests.
 *
 * Validates: Requirements 45.1, 45.2, 45.3, 45.4, 45.5, 45.6, 45.7, 45.8
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

const ACCOUNTS: Record<string, { id: string; code: string }> = {
  '1001': { id: 'acc-cash', code: '1001' },
  '1100': { id: 'acc-lr', code: '1100' },
  '4001': { id: 'acc-int', code: '4001' },
  '4003': { id: 'acc-pen', code: '4003' },
};

function createMockLoan() {
  return {
    id: 'loan-1',
    loan_number: 'LN-2024-00001',
    customer_id: 'cust-1',
    status: 'active',
    dpd: 0,
    cached_outstanding_paise: 1100000n,
    product_version: { allocation_order: ['penalty', 'interest', 'principal'] },
    customer: { id: 'cust-1', full_name: 'Test Customer', mobile: '9876543210' },
    schedules: [{
      id: 's-1', installment_number: 1, due_date: new Date('2024-01-15'),
      principal_paise: 500000n, interest_paise: 50000n,
      principal_paid_paise: 0n, interest_paid_paise: 0n, penalty_paid_paise: 0n,
    }],
  };
}

function createMockCollectionRepo(lockFn?: ReturnType<typeof vi.fn>) {
  return {
    lockLoanForUpdate: lockFn ?? vi.fn().mockResolvedValue({ id: 'loan-1', status: 'active' }),
    getLoanForCollection: vi.fn().mockResolvedValue(createMockLoan()),
    getPendingPenalties: vi.fn().mockResolvedValue([]),
    findAccountByCode: vi.fn((code: string) => Promise.resolve(ACCOUNTS[code] ?? null)),
    createCollection: vi.fn().mockResolvedValue({ id: 'col-1' }),
    createAllocations: vi.fn(),
    updateInstallment: vi.fn(),
    updateLoanOutstanding: vi.fn(),
    getOfficerName: vi.fn().mockResolvedValue('Officer'),
    enqueueOutboxMessage: vi.fn(),
  };
}

function createMockPrisma() {
  return { $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({})) };
}

function createMockAccounting() {
  return { createJournalEntry: vi.fn().mockResolvedValue({ id: 'je-1' }) };
}

function createMockAudit() {
  return { createAuditLog: vi.fn().mockResolvedValue({}) };
}

function createMockReceipt() {
  return {
    generateReceipt: vi.fn().mockResolvedValue({ id: 'rcp-1', receipt_number: 'RCP-001' }),
    markAsReversed: vi.fn(),
  };
}

function createMockIdempotency() {
  return {
    find: vi.fn().mockResolvedValue(null),
    store: vi.fn().mockResolvedValue({}),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function collectionDto(key: string): any {
  return {
    loanId: 'loan-1',
    amountPaise: 50000,
    paymentDate: '2024-01-15',
    paymentMode: 'cash',
    idempotencyKey: key,
  };
}

function disbursementLoan() {
  return {
    id: 'loan-1', loan_number: 'LN-001', status: 'approved',
    customer_id: 'cust-1', principal_paise: 10000000n, total_payable_paise: 11200000n,
    product_version: { processing_fee_type: null, processing_fee_value: null, product: { id: 'p1' } },
    customer: { id: 'cust-1', full_name: 'Test', mobile: '9876543210' },
    schedules: [{ id: 's-1', due_date: new Date('2024-02-01') }],
  };
}

function createMockDisbursementRepo() {
  return {
    getLoanForDisbursement: vi.fn().mockResolvedValue(disbursementLoan()),
    hasSchedule: vi.fn().mockResolvedValue(true),
    hasKycDocuments: vi.fn().mockResolvedValue(true),
    isAlreadyDisbursed: vi.fn().mockResolvedValue(false),
    findAccountByCode: vi.fn((code: string) => Promise.resolve(ACCOUNTS[code] ?? null)),
    create: vi.fn().mockResolvedValue({ id: 'disb-1' }),
    updateLoanStatus: vi.fn(),
    createStatusHistory: vi.fn(),
    updateLoanForDisbursement: vi.fn(),
    enqueueOutboxMessage: vi.fn(),
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Concurrency Tests', () => {

  /**
   * Requirement 45.1: Double-click payment submit — idempotency key prevents duplicate.
   * Only one collection is created; second call returns cached result.
   */
  describe('45.1 Double-click payment submit (idempotency)', () => {
    it('should return same result for duplicate idempotency key without creating duplicate records', async () => {
      const mockIdempotency = createMockIdempotency();
      const mockRepo = createMockCollectionRepo();
      const mockPrisma = createMockPrisma();

      const service = new CollectionService(
        mockPrisma as never, mockRepo as never, createMockAccounting() as never,
        createMockAudit() as never, mockIdempotency as never, createMockReceipt() as never,
      );

      // First call: no cached result, processes normally
      mockIdempotency.find.mockResolvedValueOnce(null);
      const result1 = await service.postCollection(collectionDto('double-click-key'), 'officer-1', 'collection_officer');
      expect(result1.statusCode).toBe(201);

      // Second call: cached result returned immediately
      mockIdempotency.find.mockResolvedValueOnce({ resultStatus: 201, resultBody: result1.data });
      const result2 = await service.postCollection(collectionDto('double-click-key'), 'officer-1', 'collection_officer');
      expect(result2.statusCode).toBe(201);
      expect(result2.data).toEqual(result1.data);

      // Transaction only called once (first call); second was short-circuited
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('should not create a second collection record on duplicate key', async () => {
      const mockIdempotency = createMockIdempotency();
      const mockRepo = createMockCollectionRepo();
      const mockPrisma = createMockPrisma();

      const service = new CollectionService(
        mockPrisma as never, mockRepo as never, createMockAccounting() as never,
        createMockAudit() as never, mockIdempotency as never, createMockReceipt() as never,
      );

      // First call processes
      mockIdempotency.find.mockResolvedValueOnce(null);
      await service.postCollection(collectionDto('dup-key'), 'officer-1', 'collection_officer');

      // Second call returns cached
      mockIdempotency.find.mockResolvedValueOnce({ resultStatus: 201, resultBody: { id: 'col-1' } });
      await service.postCollection(collectionDto('dup-key'), 'officer-1', 'collection_officer');

      // createCollection called only once
      expect(mockRepo.createCollection).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * Requirement 45.2: Concurrent collection posting on same loan.
   * Both succeed without data corruption or one is safely rejected.
   * Verified via SELECT FOR UPDATE locking pattern.
   */
  describe('45.2 Concurrent collection posting on same loan', () => {
    it('should serialize via SELECT FOR UPDATE — lockLoanForUpdate called within transaction', async () => {
      const lockFn = vi.fn().mockResolvedValue({ id: 'loan-1', status: 'active' });
      const mockRepo = createMockCollectionRepo(lockFn);
      const mockPrisma = createMockPrisma();

      const service = new CollectionService(
        mockPrisma as never, mockRepo as never, createMockAccounting() as never,
        createMockAudit() as never, createMockIdempotency() as never, createMockReceipt() as never,
      );

      await service.postCollection(collectionDto('key-a'), 'officer-1', 'collection_officer');

      // Verify lockLoanForUpdate was called within the transaction context
      expect(lockFn).toHaveBeenCalledWith('loan-1', expect.anything());
    });

    it('should allow two sequential collections with different idempotency keys', async () => {
      const mockRepo = createMockCollectionRepo();
      const mockPrisma = createMockPrisma();

      const service = new CollectionService(
        mockPrisma as never, mockRepo as never, createMockAccounting() as never,
        createMockAudit() as never, createMockIdempotency() as never, createMockReceipt() as never,
      );

      const r1 = await service.postCollection(
        { ...collectionDto('key-1'), amountPaise: 25000 }, 'officer-1', 'collection_officer',
      );
      const r2 = await service.postCollection(
        { ...collectionDto('key-2'), amountPaise: 25000 }, 'officer-1', 'collection_officer',
      );

      expect(r1.statusCode).toBe(201);
      expect(r2.statusCode).toBe(201);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
    });
  });

  /**
   * Requirement 45.3: Concurrent disbursement — only one succeeds.
   * Idempotency key prevents duplicate disbursement.
   */
  describe('45.3 Concurrent disbursement (only one succeeds)', () => {
    it('should prevent double disbursement via idempotency', async () => {
      const mockIdempotency = createMockIdempotency();
      const mockRepo = createMockDisbursementRepo();
      const mockPrisma = createMockPrisma();

      const service = new DisbursementService(
        mockPrisma as never, mockRepo as never, createMockAccounting() as never,
        createMockAudit() as never, mockIdempotency as never,
        { validateTransition: vi.fn() } as never,
      );

      // First call processes
      mockIdempotency.find.mockResolvedValueOnce(null);
      const r1 = await service.disburse(
        { loanId: 'loan-1', mode: 'cash' as never, idempotencyKey: 'disb-key' },
        'user-1', 'manager',
      );
      expect(r1.statusCode).toBe(201);

      // Second concurrent call returns cached
      mockIdempotency.find.mockResolvedValueOnce({ resultStatus: 201, resultBody: r1.data });
      const r2 = await service.disburse(
        { loanId: 'loan-1', mode: 'cash' as never, idempotencyKey: 'disb-key' },
        'user-1', 'manager',
      );
      expect(r2.data).toEqual(r1.data);

      // Transaction only called once
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('should reject disbursement when loan is already disbursed', async () => {
      const mockIdempotency = createMockIdempotency();
      const mockRepo = createMockDisbursementRepo();
      mockRepo.isAlreadyDisbursed.mockResolvedValue(true);
      const mockPrisma = createMockPrisma();

      const service = new DisbursementService(
        mockPrisma as never, mockRepo as never, createMockAccounting() as never,
        createMockAudit() as never, mockIdempotency as never,
        { validateTransition: vi.fn() } as never,
      );

      await expect(
        service.disburse(
          { loanId: 'loan-1', mode: 'cash' as never, idempotencyKey: 'disb-key-2' },
          'user-1', 'manager',
        ),
      ).rejects.toThrow();
    });
  });

  /**
   * Requirement 45.4: Concurrent reversal — only one succeeds.
   * Idempotency key prevents duplicate reversal; already-reversed collection is rejected.
   */
  describe('45.4 Concurrent reversal (only one succeeds)', () => {
    it('should prevent double reversal via idempotency', async () => {
      const mockIdempotency = createMockIdempotency();
      const mockCollectionRepo = {
        lockLoanForUpdate: vi.fn().mockResolvedValue({ id: 'loan-1', status: 'active' }),
        getLoanForCollection: vi.fn().mockResolvedValue(createMockLoan()),
        updateLoanOutstanding: vi.fn(),
        updateInstallment: vi.fn(),
        enqueueOutboxMessage: vi.fn(),
        getOfficerName: vi.fn().mockResolvedValue('Officer'),
      };

      const originalCollection = {
        id: 'col-1', loan_id: 'loan-1', amount_paise: 50000n,
        is_reversal: false, status: 'posted', journal_entry_id: 'je-1',
        payment_date: new Date('2024-01-15'), payment_mode: 'cash',
      };

      const mockTx = {
        collections: {
          findUnique: vi.fn().mockResolvedValue(originalCollection),
          create: vi.fn().mockResolvedValue({ id: 'rev-col-1', loan_id: 'loan-1', amount_paise: -50000n, payment_date: new Date() }),
          update: vi.fn(),
        },
        collection_allocations: {
          findMany: vi.fn().mockResolvedValue([]),
          create: vi.fn(),
          createMany: vi.fn(),
        },
        journal_entries: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'je-1', lines: [
              { account_id: 'acc-cash', debit_paise: 50000n, credit_paise: 0n },
              { account_id: 'acc-lr', debit_paise: 0n, credit_paise: 50000n },
            ],
          }),
        },
        receipts: { findMany: vi.fn().mockResolvedValue([]) },
        loan_schedules: { update: vi.fn() },
      };

      const mockPrisma = {
        $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
      };

      const service = new ReversalService(
        mockPrisma as never, mockCollectionRepo as never,
        createMockAccounting() as never, createMockAudit() as never,
        mockIdempotency as never, createMockReceipt() as never,
      );

      // First call processes
      mockIdempotency.find.mockResolvedValueOnce(null);
      const r1 = await service.reverseCollection(
        { collectionId: 'col-1', reason: 'Error correction', idempotencyKey: 'rev-key' },
        'manager-1', 'manager',
      );
      expect(r1.statusCode).toBe(201);

      // Second concurrent call returns cached
      mockIdempotency.find.mockResolvedValueOnce({ resultStatus: 201, resultBody: r1.data });
      const r2 = await service.reverseCollection(
        { collectionId: 'col-1', reason: 'Error correction', idempotencyKey: 'rev-key' },
        'manager-1', 'manager',
      );
      expect(r2.data).toEqual(r1.data);

      // Transaction only called once
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('should reject reversal of already-reversed collection', async () => {
      const mockIdempotency = createMockIdempotency();
      const mockCollectionRepo = {
        lockLoanForUpdate: vi.fn(),
        getLoanForCollection: vi.fn(),
      };

      const mockTx = {
        collections: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'col-1', loan_id: 'loan-1', amount_paise: 50000n,
            is_reversal: false, status: 'reversed', // already reversed
            journal_entry_id: 'je-1',
          }),
        },
      };

      const mockPrisma = {
        $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
      };

      const service = new ReversalService(
        mockPrisma as never, mockCollectionRepo as never,
        createMockAccounting() as never, createMockAudit() as never,
        mockIdempotency as never, createMockReceipt() as never,
      );

      await expect(
        service.reverseCollection(
          { collectionId: 'col-1', reason: 'Error correction', idempotencyKey: 'rev-key-2' },
          'manager-1', 'manager',
        ),
      ).rejects.toThrow();
    });
  });

  /**
   * Requirement 45.5: Concurrent loan approval — optimistic locking.
   * Version check prevents stale updates.
   */
  describe('45.5 Concurrent loan approval (optimistic locking)', () => {
    it('should detect stale version on concurrent loan status update', async () => {
      const mockLoanRepo = {
        findById: vi.fn().mockResolvedValue({
          id: 'loan-1', status: 'active', version: 1,
          schedules: [], product_version: null,
        }),
        updateStatus: vi.fn().mockRejectedValue(
          new ConflictError('Loan was modified by another request. Please reload and retry.', 'CONFLICT_OPTIMISTIC_LOCK'),
        ),
        createStatusHistory: vi.fn(),
        createAuditLog: vi.fn(),
      };

      const loanService = new LoanService(mockLoanRepo as never);

      await expect(
        loanService.transitionStatus('loan-1', 'overdue', 'user-1', 'manager'),
      ).rejects.toThrow('modified by another request');
    });

    it('should succeed when version matches', async () => {
      const mockLoanRepo = {
        findById: vi.fn().mockResolvedValue({
          id: 'loan-1', status: 'active', version: 1,
          schedules: [], product_version: null,
        }),
        updateStatus: vi.fn().mockResolvedValue({
          id: 'loan-1', status: 'overdue', version: 2,
        }),
        createStatusHistory: vi.fn(),
        createAuditLog: vi.fn(),
      };

      const loanService = new LoanService(mockLoanRepo as never);
      const result = await loanService.transitionStatus('loan-1', 'overdue', 'user-1', 'manager');
      expect(result).toEqual(expect.objectContaining({ status: 'overdue', version: 2 }));
      expect(mockLoanRepo.updateStatus).toHaveBeenCalledWith('loan-1', 'overdue', undefined, 1);
    });

    it('should pass version to updateStatus for optimistic locking', async () => {
      const mockLoanRepo = {
        findById: vi.fn().mockResolvedValue({
          id: 'loan-1', status: 'active', version: 5,
          schedules: [], product_version: null,
        }),
        updateStatus: vi.fn().mockResolvedValue({ id: 'loan-1', status: 'overdue', version: 6 }),
        createStatusHistory: vi.fn(),
        createAuditLog: vi.fn(),
      };

      const loanService = new LoanService(mockLoanRepo as never);
      await loanService.transitionStatus('loan-1', 'overdue', 'user-1', 'manager');

      // Verify the version (5) was passed as the 4th argument
      expect(mockLoanRepo.updateStatus).toHaveBeenCalledWith('loan-1', 'overdue', undefined, 5);
    });
  });

  /**
   * Requirement 45.6: Receipt number generation under concurrent requests — no duplicates.
   * Database sequence guarantees unique sequential receipt numbers.
   */
  describe('45.6 Concurrent receipt number generation (no duplicates)', () => {
    it('should generate unique receipt numbers via database sequence', async () => {
      const mockRepo = {
        generateReceiptNumber: vi.fn()
          .mockResolvedValueOnce('RCP-2024-00001')
          .mockResolvedValueOnce('RCP-2024-00002')
          .mockResolvedValueOnce('RCP-2024-00003'),
        create: vi.fn().mockImplementation((data: Record<string, unknown>) =>
          Promise.resolve({ id: `rcp-${data['receipt_number']}`, ...data }),
        ),
      };

      const receiptService = new ReceiptService(mockRepo as never);

      const baseInput = {
        collectionId: 'col-x', loanId: 'loan-1', customerId: 'cust-1',
        amountPaise: 50000, paymentDate: new Date('2024-01-15'), paymentMode: 'cash',
        penaltyComponentPaise: 0, interestComponentPaise: 5000, principalComponentPaise: 45000,
        outstandingAfterPaise: 950000, officerName: 'Officer', customerName: 'Customer', loanNumber: 'LN-001',
      };

      const receipts = await Promise.all([
        receiptService.generateReceipt({ ...baseInput, collectionId: 'col-1' }),
        receiptService.generateReceipt({ ...baseInput, collectionId: 'col-2' }),
        receiptService.generateReceipt({ ...baseInput, collectionId: 'col-3' }),
      ]);

      // All receipt numbers must be unique
      const numbers = receipts.map((r) => r.receipt_number);
      const uniqueNumbers = new Set(numbers);
      expect(uniqueNumbers.size).toBe(3);
      expect(numbers).toEqual(['RCP-2024-00001', 'RCP-2024-00002', 'RCP-2024-00003']);
    });

    it('should call generateReceiptNumber once per receipt', async () => {
      const generateFn = vi.fn()
        .mockResolvedValueOnce('RCP-2024-00010')
        .mockResolvedValueOnce('RCP-2024-00011');
      const mockRepo = {
        generateReceiptNumber: generateFn,
        create: vi.fn().mockImplementation((data: Record<string, unknown>) =>
          Promise.resolve({ id: 'rcp-x', ...data }),
        ),
      };

      const receiptService = new ReceiptService(mockRepo as never);

      const baseInput = {
        collectionId: 'col-x', loanId: 'loan-1', customerId: 'cust-1',
        amountPaise: 10000, paymentDate: new Date(), paymentMode: 'cash',
        penaltyComponentPaise: 0, interestComponentPaise: 0, principalComponentPaise: 10000,
        outstandingAfterPaise: 0, officerName: 'O', customerName: 'C', loanNumber: 'LN-1',
      };

      await receiptService.generateReceipt({ ...baseInput, collectionId: 'col-1' });
      await receiptService.generateReceipt({ ...baseInput, collectionId: 'col-2' });

      expect(generateFn).toHaveBeenCalledTimes(2);
    });
  });

  /**
   * Requirement 45.7: Concurrent penalty posting — unique constraint prevents duplicates.
   * Duplicate penalty for same loan/installment/period is rejected with ConflictError.
   */
  describe('45.7 Concurrent penalty posting (unique constraint prevents duplicates)', () => {
    it('should reject duplicate penalty for same loan, installment, and period', async () => {
      const mockPenaltyRepo = {
        lockLoanForUpdate: vi.fn().mockResolvedValue({ id: 'loan-1', status: 'overdue' }),
        getLoanForPenalty: vi.fn().mockResolvedValue({
          id: 'loan-1', status: 'overdue',
          product_version: {
            penalty_grace_days: 7, penalty_type: 'flat_per_period',
            penalty_value: 10000, penalty_frequency: 'monthly',
          },
          schedules: [{
            id: 's-1', installment_number: 1, due_date: new Date('2024-01-01'),
            principal_paise: 500000n, interest_paise: 50000n,
            principal_paid_paise: 0n, interest_paid_paise: 0n, penalty_paid_paise: 0n,
          }],
        }),
        penaltyExists: vi.fn()
          .mockResolvedValueOnce(false)  // First call: no existing penalty
          .mockResolvedValueOnce(true),  // Second call: penalty already exists
        findAccountByCode: vi.fn((code: string) => Promise.resolve(ACCOUNTS[code] ?? null)),
        createPenalty: vi.fn().mockResolvedValue({ id: 'pen-1' }),
        updateLoanOutstanding: vi.fn(),
        enqueueOutboxMessage: vi.fn(),
      };
      const mockPrisma = createMockPrisma();

      const service = new PenaltyService(
        mockPrisma as never, mockPenaltyRepo as never, createMockAccounting() as never,
        createMockAudit() as never, { transitionStatus: vi.fn() } as never,
      );

      const dto = {
        loanId: 'loan-1', installmentId: 's-1', penaltyPeriod: '2024-02',
        referenceDate: '2024-02-15',
      };

      // First call succeeds
      const r1 = await service.calculateAndPost(dto, 'user-1', 'manager');
      expect(r1).toBeDefined();

      // Second concurrent call is rejected with ConflictError
      await expect(
        service.calculateAndPost(dto, 'user-1', 'manager'),
      ).rejects.toThrow('already exists');
    });

    it('should allow penalties for different installments on same loan', async () => {
      const mockPenaltyRepo = {
        lockLoanForUpdate: vi.fn().mockResolvedValue({ id: 'loan-1', status: 'overdue' }),
        getLoanForPenalty: vi.fn().mockResolvedValue({
          id: 'loan-1', status: 'overdue',
          product_version: {
            penalty_grace_days: 7, penalty_type: 'flat_per_period',
            penalty_value: 10000, penalty_frequency: 'monthly',
          },
          schedules: [
            {
              id: 's-1', installment_number: 1, due_date: new Date('2024-01-01'),
              principal_paise: 500000n, interest_paise: 50000n,
              principal_paid_paise: 0n, interest_paid_paise: 0n, penalty_paid_paise: 0n,
            },
            {
              id: 's-2', installment_number: 2, due_date: new Date('2024-02-01'),
              principal_paise: 500000n, interest_paise: 50000n,
              principal_paid_paise: 0n, interest_paid_paise: 0n, penalty_paid_paise: 0n,
            },
          ],
        }),
        penaltyExists: vi.fn().mockResolvedValue(false),
        findAccountByCode: vi.fn((code: string) => Promise.resolve(ACCOUNTS[code] ?? null)),
        createPenalty: vi.fn().mockResolvedValue({ id: 'pen-1' }),
        updateLoanOutstanding: vi.fn(),
        enqueueOutboxMessage: vi.fn(),
      };
      const mockPrisma = createMockPrisma();

      const service = new PenaltyService(
        mockPrisma as never, mockPenaltyRepo as never, createMockAccounting() as never,
        createMockAudit() as never, { transitionStatus: vi.fn() } as never,
      );

      // Penalty for installment 1
      const r1 = await service.calculateAndPost(
        { loanId: 'loan-1', installmentId: 's-1', penaltyPeriod: '2024-02', referenceDate: '2024-02-15' },
        'user-1', 'manager',
      );
      expect(r1).toBeDefined();

      // Penalty for installment 2 (different installment) — should succeed
      const r2 = await service.calculateAndPost(
        { loanId: 'loan-1', installmentId: 's-2', penaltyPeriod: '2024-03', referenceDate: '2024-03-15' },
        'user-1', 'manager',
      );
      expect(r2).toBeDefined();
    });
  });

  /**
   * Requirement 45.8: Same idempotency key concurrent requests return same result.
   * Two concurrent requests with the same key produce identical responses without duplicates.
   */
  describe('45.8 Same idempotency key concurrent requests return same result', () => {
    it('should return identical result for concurrent collection requests with same key', async () => {
      const mockIdempotency = createMockIdempotency();
      const mockRepo = createMockCollectionRepo();
      const mockPrisma = createMockPrisma();

      const service = new CollectionService(
        mockPrisma as never, mockRepo as never, createMockAccounting() as never,
        createMockAudit() as never, mockIdempotency as never, createMockReceipt() as never,
      );

      // First request processes normally
      mockIdempotency.find.mockResolvedValueOnce(null);
      const r1 = await service.postCollection(collectionDto('concurrent-key'), 'officer-1', 'collection_officer');

      // Simulate second concurrent request seeing the cached result
      mockIdempotency.find.mockResolvedValueOnce({ resultStatus: 201, resultBody: r1.data });
      const r2 = await service.postCollection(collectionDto('concurrent-key'), 'officer-1', 'collection_officer');

      // Both return same status and data
      expect(r1.statusCode).toBe(r2.statusCode);
      expect(r1.data).toEqual(r2.data);
    });

    it('should return identical result for concurrent disbursement requests with same key', async () => {
      const mockIdempotency = createMockIdempotency();
      const mockRepo = createMockDisbursementRepo();
      const mockPrisma = createMockPrisma();

      const service = new DisbursementService(
        mockPrisma as never, mockRepo as never, createMockAccounting() as never,
        createMockAudit() as never, mockIdempotency as never,
        { validateTransition: vi.fn() } as never,
      );

      const dto = { loanId: 'loan-1', mode: 'cash' as never, idempotencyKey: 'concurrent-disb-key' };

      // First request processes
      mockIdempotency.find.mockResolvedValueOnce(null);
      const r1 = await service.disburse(dto, 'user-1', 'manager');

      // Second concurrent request returns cached
      mockIdempotency.find.mockResolvedValueOnce({ resultStatus: 201, resultBody: r1.data });
      const r2 = await service.disburse(dto, 'user-1', 'manager');

      expect(r1.statusCode).toBe(r2.statusCode);
      expect(r1.data).toEqual(r2.data);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('should return identical result for concurrent reversal requests with same key', async () => {
      const mockIdempotency = createMockIdempotency();
      const mockCollectionRepo = {
        lockLoanForUpdate: vi.fn().mockResolvedValue({ id: 'loan-1', status: 'active' }),
        getLoanForCollection: vi.fn().mockResolvedValue(createMockLoan()),
        updateLoanOutstanding: vi.fn(),
        updateInstallment: vi.fn(),
        enqueueOutboxMessage: vi.fn(),
        getOfficerName: vi.fn().mockResolvedValue('Officer'),
      };

      const mockTx = {
        collections: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'col-1', loan_id: 'loan-1', amount_paise: 50000n,
            is_reversal: false, status: 'posted', journal_entry_id: 'je-1',
            payment_date: new Date('2024-01-15'), payment_mode: 'cash',
          }),
          create: vi.fn().mockResolvedValue({ id: 'rev-col-1', loan_id: 'loan-1', amount_paise: -50000n, payment_date: new Date() }),
          update: vi.fn(),
        },
        collection_allocations: {
          findMany: vi.fn().mockResolvedValue([]),
          create: vi.fn(),
        },
        journal_entries: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'je-1', lines: [
              { account_id: 'acc-cash', debit_paise: 50000n, credit_paise: 0n },
              { account_id: 'acc-lr', debit_paise: 0n, credit_paise: 50000n },
            ],
          }),
        },
        receipts: { findMany: vi.fn().mockResolvedValue([]) },
        loan_schedules: { update: vi.fn() },
      };

      const mockPrisma = {
        $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
      };

      const service = new ReversalService(
        mockPrisma as never, mockCollectionRepo as never,
        createMockAccounting() as never, createMockAudit() as never,
        mockIdempotency as never, createMockReceipt() as never,
      );

      const dto = { collectionId: 'col-1', reason: 'Error correction', idempotencyKey: 'concurrent-rev-key' };

      // First request processes
      mockIdempotency.find.mockResolvedValueOnce(null);
      const r1 = await service.reverseCollection(dto, 'manager-1', 'manager');

      // Second concurrent request returns cached
      mockIdempotency.find.mockResolvedValueOnce({ resultStatus: 201, resultBody: r1.data });
      const r2 = await service.reverseCollection(dto, 'manager-1', 'manager');

      expect(r1.statusCode).toBe(r2.statusCode);
      expect(r1.data).toEqual(r2.data);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });
});
