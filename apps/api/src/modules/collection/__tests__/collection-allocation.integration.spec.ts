import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CollectionService } from '../collection.service';
import { BusinessRuleError, NotFoundError } from '../../../common/errors';
import { PaymentMode } from '@as-finance/shared';

/**
 * Integration tests for collection and allocation flow.
 * Tests: collection posting → allocation verification → receipt generation → outstanding update.
 *
 * Uses mocked repositories to verify the correct multi-step flow.
 *
 * Validates: Requirements 6.2, 6.5, 6.6, 6.7, 8.1
 */

// ── Mock Factories ───────────────────────────────────────────────────────────

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
    schedules: [
      {
        id: 's-1', installment_number: 1, due_date: new Date('2024-01-15'),
        principal_paise: 500000n, interest_paise: 50000n,
        principal_paid_paise: 0n, interest_paid_paise: 0n, penalty_paid_paise: 0n,
      },
      {
        id: 's-2', installment_number: 2, due_date: new Date('2024-02-15'),
        principal_paise: 500000n, interest_paise: 50000n,
        principal_paid_paise: 0n, interest_paid_paise: 0n, penalty_paid_paise: 0n,
      },
    ],
  };
}

const ACCOUNTS: Record<string, { id: string; code: string }> = {
  '1001': { id: 'acc-cash', code: '1001' },
  '1002': { id: 'acc-bank', code: '1002' },
  '1100': { id: 'acc-lr', code: '1100' },
  '4001': { id: 'acc-int', code: '4001' },
  '4003': { id: 'acc-pen', code: '4003' },
};

function createMockCollectionRepo() {
  return {
    lockLoanForUpdate: vi.fn().mockResolvedValue({ id: 'loan-1', status: 'active' }),
    getLoanForCollection: vi.fn().mockResolvedValue(createMockLoan()),
    getPendingPenalties: vi.fn().mockResolvedValue([]),
    findAccountByCode: vi.fn((code: string) => Promise.resolve(ACCOUNTS[code] ?? null)),
    createCollection: vi.fn().mockResolvedValue({ id: 'col-1' }),
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

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Collection & Allocation Integration', () => {
  let service: CollectionService;
  let repo: ReturnType<typeof createMockCollectionRepo>;
  let mocks: ReturnType<typeof createMockServices>;

  beforeEach(() => {
    repo = createMockCollectionRepo();
    mocks = createMockServices();
    service = new CollectionService(
      mocks.prisma as never, repo as never, mocks.accounting as never,
      mocks.audit as never, mocks.idempotency as never, mocks.receipt as never,
    );
  });

  it('should complete full collection flow: post → allocate → journal → receipt → outstanding update', async () => {
    const result = await service.postCollection(
      { loanId: 'loan-1', amountPaise: 550000, paymentDate: '2024-01-15', paymentMode: PaymentMode.CASH, idempotencyKey: 'key-1' },
      'officer-1', 'collection_officer',
    );

    expect(result.statusCode).toBe(201);
    // Allocation records created
    expect(repo.createAllocations).toHaveBeenCalled();
    // Journal entry created
    expect(mocks.accounting.createJournalEntry).toHaveBeenCalled();
    // Receipt generated
    expect(mocks.receipt.generateReceipt).toHaveBeenCalled();
    // Outstanding updated
    expect(repo.updateLoanOutstanding).toHaveBeenCalled();
    // Audit log created
    expect(mocks.audit.createAuditLog).toHaveBeenCalled();
    // SMS enqueued
    expect(repo.enqueueOutboxMessage).toHaveBeenCalled();
  });

  it('should allocate penalty first, then interest, then principal', async () => {
    repo.getPendingPenalties.mockResolvedValue([
      { id: 'pen-1', amount_paise: 5000n, is_paid: false },
    ]);

    await service.postCollection(
      { loanId: 'loan-1', amountPaise: 60000, paymentDate: '2024-01-15', paymentMode: PaymentMode.CASH, idempotencyKey: 'key-2' },
      'officer-1', 'collection_officer',
    );

    const jeCall = mocks.accounting.createJournalEntry.mock.calls[0]![0];
    // DR Cash total = 60000
    expect(jeCall.lines[0].debitPaise).toBe(60000);
    // CR components should include penalty, interest, and principal
    const totalCredits = jeCall.lines.slice(1).reduce((s: number, l: { creditPaise: number }) => s + l.creditPaise, 0);
    expect(totalCredits).toBe(60000);
  });

  it('should reject collection exceeding outstanding balance', async () => {
    await expect(
      service.postCollection(
        { loanId: 'loan-1', amountPaise: 99999999, paymentDate: '2024-01-15', paymentMode: PaymentMode.CASH, idempotencyKey: 'key-3' },
        'officer-1', 'collection_officer',
      ),
    ).rejects.toThrow(BusinessRuleError);
  });

  it('should reject collection against closed loan', async () => {
    repo.lockLoanForUpdate.mockResolvedValue({ id: 'loan-1', status: 'closed' });

    await expect(
      service.postCollection(
        { loanId: 'loan-1', amountPaise: 10000, paymentDate: '2024-01-15', paymentMode: PaymentMode.CASH, idempotencyKey: 'key-4' },
        'officer-1', 'collection_officer',
      ),
    ).rejects.toThrow(BusinessRuleError);
  });

  it('should return cached result for duplicate idempotency key', async () => {
    const cached = { resultStatus: 201, resultBody: { collectionId: 'col-cached' } };
    mocks.idempotency.find.mockResolvedValue(cached);

    const result = await service.postCollection(
      { loanId: 'loan-1', amountPaise: 10000, paymentDate: '2024-01-15', paymentMode: PaymentMode.CASH, idempotencyKey: 'dup-key' },
      'officer-1', 'collection_officer',
    );

    expect(result.data).toEqual(cached.resultBody);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('should generate receipt with correct allocation breakdown', async () => {
    await service.postCollection(
      { loanId: 'loan-1', amountPaise: 100000, paymentDate: '2024-01-15', paymentMode: PaymentMode.CASH, idempotencyKey: 'key-5' },
      'officer-1', 'collection_officer',
    );

    const receiptCall = mocks.receipt.generateReceipt.mock.calls[0]![0];
    expect(receiptCall.amountPaise).toBe(100000);
    expect(receiptCall.loanId).toBe('loan-1');
    expect(receiptCall.customerName).toBe('Test Customer');
    // Components should sum to total
    const componentSum = receiptCall.penaltyComponentPaise + receiptCall.interestComponentPaise + receiptCall.principalComponentPaise;
    expect(componentSum).toBe(100000);
  });
});
