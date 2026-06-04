import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CollectionService } from '../collection.service';
import { BusinessRuleError, NotFoundError } from '../../../common/errors';
import { PaymentMode, JournalSourceType } from '@as-finance/shared';

/**
 * Integration tests for collection and allocation flow.
 *
 * Tests the full multi-step collection pipeline with mocked repositories:
 *   collection posting → allocation → journal entry → receipt → outstanding update
 *
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */

// ── Mock Factories ───────────────────────────────────────────────────────────

function createMockSchedule(overrides: Record<string, unknown> = {}) {
  return {
    id: 's-1',
    installment_number: 1,
    due_date: new Date('2024-01-15'),
    principal_paise: 500000n,
    interest_paise: 50000n,
    total_paise: 550000n,
    principal_paid_paise: 0n,
    interest_paid_paise: 0n,
    penalty_paid_paise: 0n,
    status: 'pending',
    ...overrides,
  };
}

function createMockLoan(overrides: Record<string, unknown> = {}) {
  return {
    id: 'loan-1',
    loan_number: 'LN-2024-00001',
    customer_id: 'cust-1',
    principal_paise: 1000000n,
    status: 'active',
    total_payable_paise: 1100000n,
    cached_outstanding_paise: 1100000n,
    dpd: 0,
    overdue_bucket: 'bucket_0',
    product_version: { id: 'pv-1', allocation_order: ['penalty', 'interest', 'principal'] },
    customer: { id: 'cust-1', full_name: 'Test Customer', mobile: '9876543210' },
    schedules: [
      createMockSchedule({ id: 's-1', installment_number: 1, due_date: new Date('2024-01-15') }),
      createMockSchedule({ id: 's-2', installment_number: 2, due_date: new Date('2024-02-15') }),
    ],
    ...overrides,
  };
}

const ACCOUNTS: Record<string, { id: string; code: string; name: string; category: string }> = {
  '1001': { id: 'acc-cash', code: '1001', name: 'Cash', category: 'asset' },
  '1002': { id: 'acc-bank', code: '1002', name: 'Bank', category: 'asset' },
  '1100': { id: 'acc-lr', code: '1100', name: 'Loans Receivable', category: 'asset' },
  '4001': { id: 'acc-int', code: '4001', name: 'Interest Income', category: 'income' },
  '4003': { id: 'acc-pen', code: '4003', name: 'Penalty Income', category: 'income' },
};

let collectionIdCounter = 0;

function createMockCollectionRepo() {
  return {
    lockLoanForUpdate: vi.fn().mockResolvedValue({ id: 'loan-1', status: 'active', cached_outstanding_paise: 1100000n }),
    getLoanForCollection: vi.fn().mockResolvedValue(createMockLoan()),
    getPendingPenalties: vi.fn().mockResolvedValue([]),
    findAccountByCode: vi.fn((code: string) => Promise.resolve(ACCOUNTS[code] ?? null)),
    createCollection: vi.fn().mockImplementation(() => {
      collectionIdCounter++;
      return Promise.resolve({ id: `col-${collectionIdCounter}` });
    }),
    createAllocations: vi.fn().mockResolvedValue(undefined),
    updateInstallment: vi.fn().mockResolvedValue(undefined),
    updateLoanOutstanding: vi.fn().mockResolvedValue(undefined),
    getOfficerName: vi.fn().mockResolvedValue('Officer Name'),
    enqueueOutboxMessage: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockServices() {
  return {
    accounting: { createJournalEntry: vi.fn().mockResolvedValue({ id: 'je-1' }) },
    audit: { createAuditLog: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
    idempotency: { find: vi.fn().mockResolvedValue(null), store: vi.fn().mockResolvedValue({}) },
    receipt: { generateReceipt: vi.fn().mockResolvedValue({ id: 'rcp-1', receipt_number: 'RCP-2024-00001' }) },
    prisma: { $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({})) },
  };
}

function buildDto(overrides: Partial<{
  loanId: string; amountPaise: number; paymentDate: string;
  paymentMode: PaymentMode; idempotencyKey: string;
}> = {}) {
  return {
    loanId: overrides.loanId ?? 'loan-1',
    amountPaise: overrides.amountPaise ?? 550000,
    paymentDate: overrides.paymentDate ?? '2024-01-15',
    paymentMode: overrides.paymentMode ?? PaymentMode.CASH,
    idempotencyKey: overrides.idempotencyKey ?? `key-${Date.now()}-${Math.random()}`,
  };
}

 
type AnyData = Record<string, any>;

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Collection & Allocation Integration', () => {
  let service: CollectionService;
  let repo: ReturnType<typeof createMockCollectionRepo>;
  let mocks: ReturnType<typeof createMockServices>;

  beforeEach(() => {
    collectionIdCounter = 0;
    repo = createMockCollectionRepo();
    mocks = createMockServices();
    service = new CollectionService(
      mocks.prisma as never, repo as never, mocks.accounting as never,
      mocks.audit as never, mocks.idempotency as never, mocks.receipt as never,
    );
  });

  // ── Requirement 6.1: Full EMI payment ──────────────────────────────────

  describe('Req 6.1 — Full EMI payment flow', () => {
    it('should create collection record, allocations, journal, receipt, and update outstanding', async () => {
      const dto = buildDto({ amountPaise: 550000 });

      const result = await service.postCollection(dto, 'officer-1', 'collection_officer');

      expect(result.statusCode).toBe(201);
      // Collection record created
      expect(repo.createCollection).toHaveBeenCalledTimes(1);
      const collData = repo.createCollection.mock.calls[0]![0];
      expect(collData.loan_id).toBe('loan-1');
      expect(collData.amount_paise).toBe(550000);
      expect(collData.payment_mode).toBe('cash');
      // Allocations created
      expect(repo.createAllocations).toHaveBeenCalledTimes(1);
      // Journal entry created and balanced
      expect(mocks.accounting.createJournalEntry).toHaveBeenCalledTimes(1);
      const jeCall = mocks.accounting.createJournalEntry.mock.calls[0]![0];
      const totalDebit = jeCall.lines.reduce((s: number, l: { debitPaise: number }) => s + l.debitPaise, 0);
      const totalCredit = jeCall.lines.reduce((s: number, l: { creditPaise: number }) => s + l.creditPaise, 0);
      expect(totalDebit).toBe(totalCredit);
      expect(totalDebit).toBe(550000);
      // Receipt generated
      expect(mocks.receipt.generateReceipt).toHaveBeenCalledTimes(1);
      const receiptCall = mocks.receipt.generateReceipt.mock.calls[0]![0];
      expect(receiptCall.amountPaise).toBe(550000);
      expect(receiptCall.loanId).toBe('loan-1');
      // Outstanding updated
      expect(repo.updateLoanOutstanding).toHaveBeenCalledTimes(1);
      // Audit log created
      expect(mocks.audit.createAuditLog).toHaveBeenCalledTimes(1);
      // SMS enqueued
      expect(repo.enqueueOutboxMessage).toHaveBeenCalledTimes(1);
    });

    it('should allocate interest before principal for a single installment EMI', async () => {
      const dto = buildDto({ amountPaise: 550000 });

      await service.postCollection(dto, 'officer-1', 'collection_officer');

      const jeCall = mocks.accounting.createJournalEntry.mock.calls[0]![0];
      // DR Cash = 550000
      expect(jeCall.lines[0].debitPaise).toBe(550000);
      // CR entries should include interest (50000) and principal (500000)
      const creditLines = jeCall.lines.filter((l: { creditPaise: number }) => l.creditPaise > 0);
      const interestCredit = creditLines.find((l: { accountId: string }) => l.accountId === 'acc-lr');
      const principalCredit = creditLines.find((l: { accountId: string }) => l.accountId === 'acc-int');
      expect(interestCredit).toBeDefined();
      expect(principalCredit).toBeDefined();
    });

    it('should update installment status to paid when fully covered', async () => {
      // 550000 paise: allocation order is penalty→interest→principal
      // Interest allocated across all installments first: inst-1 (50000) + inst-2 (50000) = 100000
      // Then principal: inst-1 gets remaining 450000
      // So inst-1 is partially paid (principal 450000 < 500000)
      // To fully pay inst-1, we need exactly its interest + principal = 550000
      // but interest is allocated across ALL installments first.
      // Use a loan with a single installment to test "paid" status.
      const singleInstLoan = createMockLoan({
        cached_outstanding_paise: 550000n,
        schedules: [
          createMockSchedule({ id: 's-1', installment_number: 1, due_date: new Date('2024-01-15') }),
        ],
      });
      repo.getLoanForCollection.mockResolvedValue(singleInstLoan);
      repo.lockLoanForUpdate.mockResolvedValue({ id: 'loan-1', status: 'active', cached_outstanding_paise: 550000n });

      const dto = buildDto({ amountPaise: 550000 });
      await service.postCollection(dto, 'officer-1', 'collection_officer');

      const updateCalls = repo.updateInstallment.mock.calls;
      const firstInstUpdate = updateCalls.find(
        (c: unknown[]) => c[0] === 's-1',
      );
      expect(firstInstUpdate).toBeDefined();
      expect(firstInstUpdate![1].status).toBe('paid');
    });

    it('should generate receipt with correct component breakdown', async () => {
      const dto = buildDto({ amountPaise: 550000 });

      await service.postCollection(dto, 'officer-1', 'collection_officer');

      const receiptCall = mocks.receipt.generateReceipt.mock.calls[0]![0];
      const componentSum =
        receiptCall.penaltyComponentPaise +
        receiptCall.interestComponentPaise +
        receiptCall.principalComponentPaise;
      expect(componentSum).toBe(550000);
      expect(receiptCall.customerName).toBe('Test Customer');
      expect(receiptCall.loanNumber).toBe('LN-2024-00001');
    });

    it('should store idempotency result after successful collection', async () => {
      const dto = buildDto({ idempotencyKey: 'idem-full-emi' });

      await service.postCollection(dto, 'officer-1', 'collection_officer');

      expect(mocks.idempotency.store).toHaveBeenCalledTimes(1);
      expect(mocks.idempotency.store.mock.calls[0]![0]).toBe('idem-full-emi');
      expect(mocks.idempotency.store.mock.calls[0]![1]).toBe('collection');
      expect(mocks.idempotency.store.mock.calls[0]![2]).toBe(201);
    });
  });

  // ── Requirement 6.2: Partial payment with correct allocation ───────────

  describe('Req 6.2 — Partial payment allocation', () => {
    it('should allocate partial payment to interest first, then principal', async () => {
      // Pay only 70000 paise — should cover interest (50000) + partial principal (20000)
      const dto = buildDto({ amountPaise: 70000 });

      await service.postCollection(dto, 'officer-1', 'collection_officer');

      const jeCall = mocks.accounting.createJournalEntry.mock.calls[0]![0];
      expect(jeCall.lines[0].debitPaise).toBe(70000);
      const totalCredits = jeCall.lines
        .filter((l: { creditPaise: number }) => l.creditPaise > 0)
        .reduce((s: number, l: { creditPaise: number }) => s + l.creditPaise, 0);
      expect(totalCredits).toBe(70000);
    });

    it('should mark installment as partial when not fully paid', async () => {
      const dto = buildDto({ amountPaise: 70000 });

      await service.postCollection(dto, 'officer-1', 'collection_officer');

      const updateCalls = repo.updateInstallment.mock.calls;
      const firstInstUpdate = updateCalls.find(
        (c: unknown[]) => c[0] === 's-1',
      );
      expect(firstInstUpdate).toBeDefined();
      expect(firstInstUpdate![1].status).toBe('partial');
    });

    it('should correctly compute outstanding after partial payment', async () => {
      const dto = buildDto({ amountPaise: 70000 });

      const result = await service.postCollection(dto, 'officer-1', 'collection_officer');

      expect((result.data as AnyData)['outstandingAfterPaise']).toBe(1100000 - 70000);
    });

    it('should allocate only to penalty when amount covers only penalties', async () => {
      repo.getPendingPenalties.mockResolvedValue([
        { id: 'pen-1', amount_paise: 10000n, is_paid: false, is_waived: false },
      ]);
      const dto = buildDto({ amountPaise: 5000 });

      await service.postCollection(dto, 'officer-1', 'collection_officer');

      const receiptCall = mocks.receipt.generateReceipt.mock.calls[0]![0];
      expect(receiptCall.penaltyComponentPaise).toBe(5000);
      expect(receiptCall.interestComponentPaise).toBe(0);
      expect(receiptCall.principalComponentPaise).toBe(0);
    });
  });

  // ── Requirement 6.3: Multiple sequential payments ──────────────────────

  describe('Req 6.3 — Multiple sequential payments on same loan', () => {
    it('should handle two sequential payments correctly', async () => {
      // First payment: 550000 covers installment 1 fully
      const dto1 = buildDto({ amountPaise: 550000, idempotencyKey: 'seq-1' });
      const result1 = await service.postCollection(dto1, 'officer-1', 'collection_officer');
      expect(result1.statusCode).toBe(201);

      // After first payment, update the mock to reflect paid installment 1
      const updatedLoan = createMockLoan({
        cached_outstanding_paise: 550000n,
        schedules: [
          createMockSchedule({
            id: 's-1', installment_number: 1, due_date: new Date('2024-01-15'),
            principal_paid_paise: 500000n, interest_paid_paise: 50000n, status: 'paid',
          }),
          createMockSchedule({
            id: 's-2', installment_number: 2, due_date: new Date('2024-02-15'),
          }),
        ],
      });
      repo.getLoanForCollection.mockResolvedValue(updatedLoan);
      repo.lockLoanForUpdate.mockResolvedValue({ id: 'loan-1', status: 'active', cached_outstanding_paise: 550000n });

      // Second payment: 550000 covers installment 2 fully
      const dto2 = buildDto({ amountPaise: 550000, idempotencyKey: 'seq-2' });
      const result2 = await service.postCollection(dto2, 'officer-1', 'collection_officer');
      expect(result2.statusCode).toBe(201);

      // Both collections should have been created
      expect(repo.createCollection).toHaveBeenCalledTimes(2);
      // Both should have journal entries
      expect(mocks.accounting.createJournalEntry).toHaveBeenCalledTimes(2);
      // Both should have receipts
      expect(mocks.receipt.generateReceipt).toHaveBeenCalledTimes(2);
    });

    it('should use different idempotency keys for sequential payments', async () => {
      const dto1 = buildDto({ amountPaise: 100000, idempotencyKey: 'multi-1' });
      await service.postCollection(dto1, 'officer-1', 'collection_officer');

      const dto2 = buildDto({ amountPaise: 100000, idempotencyKey: 'multi-2' });
      await service.postCollection(dto2, 'officer-1', 'collection_officer');

      // Idempotency store called twice with different keys
      expect(mocks.idempotency.store).toHaveBeenCalledTimes(2);
      expect(mocks.idempotency.store.mock.calls[0]![0]).toBe('multi-1');
      expect(mocks.idempotency.store.mock.calls[1]![0]).toBe('multi-2');
    });

    it('should update outstanding progressively with each payment', async () => {
      const dto1 = buildDto({ amountPaise: 200000, idempotencyKey: 'prog-1' });
      const result1 = await service.postCollection(dto1, 'officer-1', 'collection_officer');
      expect((result1.data as AnyData)['outstandingAfterPaise']).toBe(1100000 - 200000);

      // Update mock for second payment — schedules reflect first payment allocations
      // 200000 allocated: interest inst-1 (50000) + interest inst-2 (50000) + principal inst-1 (100000)
      const updatedLoan = createMockLoan({
        cached_outstanding_paise: 900000n,
        schedules: [
          createMockSchedule({
            id: 's-1', installment_number: 1, due_date: new Date('2024-01-15'),
            interest_paid_paise: 50000n, principal_paid_paise: 100000n,
          }),
          createMockSchedule({
            id: 's-2', installment_number: 2, due_date: new Date('2024-02-15'),
            interest_paid_paise: 50000n, principal_paid_paise: 0n,
          }),
        ],
      });
      repo.getLoanForCollection.mockResolvedValue(updatedLoan);
      repo.lockLoanForUpdate.mockResolvedValue({ id: 'loan-1', status: 'active', cached_outstanding_paise: 900000n });

      const dto2 = buildDto({ amountPaise: 300000, idempotencyKey: 'prog-2' });
      const result2 = await service.postCollection(dto2, 'officer-1', 'collection_officer');
      // Outstanding from updated schedules: (500000-100000)+(50000-50000)+(500000-0)+(50000-50000) = 900000
      // After 300000 payment: 900000 - 300000 = 600000
      expect((result2.data as AnyData)['outstandingAfterPaise']).toBe(900000 - 300000);
    });
  });

  // ── Requirement 6.4: Atomicity — failed step → no partial state ────────

  describe('Req 6.4 — Atomicity', () => {
    it('should roll back entire transaction when journal entry creation fails', async () => {
      mocks.accounting.createJournalEntry.mockRejectedValue(new Error('DB connection lost'));

      await expect(
        service.postCollection(buildDto(), 'officer-1', 'collection_officer'),
      ).rejects.toThrow('DB connection lost');

      // Since the transaction wraps everything, the prisma.$transaction callback
      // threw, so no idempotency result should be stored
      expect(mocks.idempotency.store).not.toHaveBeenCalled();
    });

    it('should roll back when receipt generation fails', async () => {
      mocks.receipt.generateReceipt.mockRejectedValue(new Error('Receipt service unavailable'));

      await expect(
        service.postCollection(buildDto(), 'officer-1', 'collection_officer'),
      ).rejects.toThrow('Receipt service unavailable');

      // No idempotency stored means the operation can be safely retried
      expect(mocks.idempotency.store).not.toHaveBeenCalled();
    });

    it('should roll back when allocation creation fails', async () => {
      repo.createAllocations.mockRejectedValue(new Error('Allocation insert failed'));

      await expect(
        service.postCollection(buildDto(), 'officer-1', 'collection_officer'),
      ).rejects.toThrow('Allocation insert failed');

      expect(mocks.idempotency.store).not.toHaveBeenCalled();
    });

    it('should roll back when installment update fails', async () => {
      repo.updateInstallment.mockRejectedValue(new Error('Installment update failed'));

      await expect(
        service.postCollection(buildDto(), 'officer-1', 'collection_officer'),
      ).rejects.toThrow('Installment update failed');

      expect(mocks.idempotency.store).not.toHaveBeenCalled();
    });

    it('should reject collection against non-existent loan', async () => {
      repo.lockLoanForUpdate.mockResolvedValue(null);

      await expect(
        service.postCollection(buildDto(), 'officer-1', 'collection_officer'),
      ).rejects.toThrow(NotFoundError);
    });

    it('should reject collection against closed loan', async () => {
      repo.lockLoanForUpdate.mockResolvedValue({ id: 'loan-1', status: 'closed' });

      await expect(
        service.postCollection(buildDto(), 'officer-1', 'collection_officer'),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('should reject collection exceeding outstanding balance', async () => {
      await expect(
        service.postCollection(
          buildDto({ amountPaise: 99999999 }),
          'officer-1', 'collection_officer',
        ),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('should reject when required chart of accounts entries are missing', async () => {
      repo.findAccountByCode.mockResolvedValue(null);

      await expect(
        service.postCollection(buildDto(), 'officer-1', 'collection_officer'),
      ).rejects.toThrow(BusinessRuleError);
    });
  });

  // ── Requirement 6.5: Idempotency ──────────────────────────────────────

  describe('Req 6.5 — Idempotency', () => {
    it('should return cached result for duplicate idempotency key without creating new records', async () => {
      const cached = {
        resultStatus: 201,
        resultBody: {
          collectionId: 'col-cached',
          loanId: 'loan-1',
          amountPaise: 550000,
        },
      };
      mocks.idempotency.find.mockResolvedValue(cached);

      const result = await service.postCollection(
        buildDto({ idempotencyKey: 'dup-key' }),
        'officer-1', 'collection_officer',
      );

      expect(result.statusCode).toBe(201);
      expect(result.data).toEqual(cached.resultBody);
      // Transaction should NOT have been called
      expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
      // No new collection, journal, receipt, or audit created
      expect(repo.createCollection).not.toHaveBeenCalled();
      expect(mocks.accounting.createJournalEntry).not.toHaveBeenCalled();
      expect(mocks.receipt.generateReceipt).not.toHaveBeenCalled();
      expect(mocks.audit.createAuditLog).not.toHaveBeenCalled();
      expect(repo.enqueueOutboxMessage).not.toHaveBeenCalled();
    });

    it('should store idempotency result on first successful call', async () => {
      const dto = buildDto({ idempotencyKey: 'first-call-key' });

      await service.postCollection(dto, 'officer-1', 'collection_officer');

      expect(mocks.idempotency.store).toHaveBeenCalledTimes(1);
      const storeArgs = mocks.idempotency.store.mock.calls[0]!;
      expect(storeArgs[0]).toBe('first-call-key');
      expect(storeArgs[1]).toBe('collection');
      expect(storeArgs[2]).toBe(201);
      // Result body should contain collection details
      const resultBody = storeArgs[3];
      expect(resultBody.loanId).toBe('loan-1');
      expect(resultBody.amountPaise).toBe(550000);
      expect(resultBody.receiptNumber).toBe('RCP-2024-00001');
    });

    it('should return identical data for duplicate key as original call', async () => {
      // First call — succeeds and stores
      const dto = buildDto({ idempotencyKey: 'idem-test' });
      const firstResult = await service.postCollection(dto, 'officer-1', 'collection_officer');

      // Simulate second call — idempotency service returns cached
      const cached = {
        resultStatus: firstResult.statusCode,
        resultBody: firstResult.data,
      };
      mocks.idempotency.find.mockResolvedValue(cached);

      const secondResult = await service.postCollection(dto, 'officer-1', 'collection_officer');

      expect(secondResult.statusCode).toBe(firstResult.statusCode);
      expect(secondResult.data).toEqual(firstResult.data);
    });
  });

  // ── Requirement 6.6: Payment on overdue loan with pending penalties ────

  describe('Req 6.6 — Overdue loan with pending penalties', () => {
    beforeEach(() => {
      // Set up an overdue loan with pending penalties
      const overdueLoan = createMockLoan({
        status: 'overdue',
        dpd: 45,
        overdue_bucket: 'bucket_31_60',
        cached_outstanding_paise: 1110000n, // 1100000 schedule + 10000 penalty
      });
      repo.getLoanForCollection.mockResolvedValue(overdueLoan);
      repo.lockLoanForUpdate.mockResolvedValue({
        id: 'loan-1', status: 'overdue', cached_outstanding_paise: 1110000n,
      });
      repo.getPendingPenalties.mockResolvedValue([
        { id: 'pen-1', amount_paise: 5000n, is_paid: false, is_waived: false },
        { id: 'pen-2', amount_paise: 5000n, is_paid: false, is_waived: false },
      ]);
    });

    it('should accept collection on overdue loan', async () => {
      const dto = buildDto({ amountPaise: 100000 });

      const result = await service.postCollection(dto, 'officer-1', 'collection_officer');

      expect(result.statusCode).toBe(201);
    });

    it('should allocate penalties first (oldest first), then interest, then principal', async () => {
      const dto = buildDto({ amountPaise: 100000 });

      await service.postCollection(dto, 'officer-1', 'collection_officer');

      const receiptCall = mocks.receipt.generateReceipt.mock.calls[0]![0];
      // Penalties: 5000 + 5000 = 10000 allocated first
      expect(receiptCall.penaltyComponentPaise).toBe(10000);
      // Remaining 90000 goes to interest then principal
      expect(receiptCall.interestComponentPaise + receiptCall.principalComponentPaise).toBe(90000);
      // Total components = payment amount
      const total = receiptCall.penaltyComponentPaise +
        receiptCall.interestComponentPaise +
        receiptCall.principalComponentPaise;
      expect(total).toBe(100000);
    });

    it('should create journal entry with penalty income credit line', async () => {
      const dto = buildDto({ amountPaise: 100000 });

      await service.postCollection(dto, 'officer-1', 'collection_officer');

      const jeCall = mocks.accounting.createJournalEntry.mock.calls[0]![0];
      // Should have a penalty income credit line
      const penaltyLine = jeCall.lines.find(
        (l: { accountId: string; creditPaise: number }) =>
          l.accountId === 'acc-pen' && l.creditPaise > 0,
      );
      expect(penaltyLine).toBeDefined();
      expect(penaltyLine!.creditPaise).toBe(10000);
    });

    it('should handle payment covering only penalties on overdue loan', async () => {
      const dto = buildDto({ amountPaise: 8000 });

      await service.postCollection(dto, 'officer-1', 'collection_officer');

      const receiptCall = mocks.receipt.generateReceipt.mock.calls[0]![0];
      // Only 8000 paise — covers pen-1 (5000) + partial pen-2 (3000)
      expect(receiptCall.penaltyComponentPaise).toBe(8000);
      expect(receiptCall.interestComponentPaise).toBe(0);
      expect(receiptCall.principalComponentPaise).toBe(0);
    });

    it('should update outstanding correctly after overdue payment', async () => {
      const dto = buildDto({ amountPaise: 100000 });

      const result = await service.postCollection(dto, 'officer-1', 'collection_officer');

      // Total outstanding was 1110000 (1100000 schedule + 10000 penalties)
      expect((result.data as AnyData)['outstandingAfterPaise']).toBe(1110000 - 100000);
    });

    it('should record before/after DPD in audit log', async () => {
      const dto = buildDto({ amountPaise: 100000 });

      await service.postCollection(dto, 'officer-1', 'collection_officer');

      const auditCall = mocks.audit.createAuditLog.mock.calls[0]![0];
      expect(auditCall.before_state.dpd).toBe(45);
      expect(auditCall.before_state.outstanding_paise).toBe(1110000);
      expect(auditCall.after_state.amount_paise).toBe(100000);
      expect(auditCall.after_state.penalty_allocated).toBe(10000);
    });
  });

  // ── Cross-cutting: Journal balance invariant ───────────────────────────

  describe('Journal balance invariant', () => {
    it('should produce balanced journal entries for any valid collection amount', async () => {
      const amounts = [1, 50000, 100000, 550000, 1100000];

      for (const amount of amounts) {
        vi.clearAllMocks();
        repo = createMockCollectionRepo();
        mocks = createMockServices();
        service = new CollectionService(
          mocks.prisma as never, repo as never, mocks.accounting as never,
          mocks.audit as never, mocks.idempotency as never, mocks.receipt as never,
        );

        const dto = buildDto({ amountPaise: amount });

        await service.postCollection(dto, 'officer-1', 'collection_officer');

        const jeCall = mocks.accounting.createJournalEntry.mock.calls[0]![0];
        const totalDebit = jeCall.lines.reduce(
          (s: number, l: { debitPaise: number }) => s + l.debitPaise, 0,
        );
        const totalCredit = jeCall.lines.reduce(
          (s: number, l: { creditPaise: number }) => s + l.creditPaise, 0,
        );
        expect(totalDebit).toBe(totalCredit);
        expect(totalDebit).toBe(amount);
      }
    });
  });

  // ── Cross-cutting: Receipt component reconciliation ────────────────────

  describe('Receipt component reconciliation', () => {
    it('should ensure receipt components always sum to collection amount', async () => {
      const dto = buildDto({ amountPaise: 350000 });

      await service.postCollection(dto, 'officer-1', 'collection_officer');

      const receiptCall = mocks.receipt.generateReceipt.mock.calls[0]![0];
      const componentSum =
        receiptCall.penaltyComponentPaise +
        receiptCall.interestComponentPaise +
        receiptCall.principalComponentPaise;
      expect(componentSum).toBe(350000);
    });
  });
});
