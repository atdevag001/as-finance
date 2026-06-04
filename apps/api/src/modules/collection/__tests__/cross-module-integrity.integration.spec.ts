import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CollectionService } from '../collection.service';
import { ReversalService } from '../../reversal/reversal.service';
import { PaymentMode, JournalSourceType } from '@as-finance/shared';

/**
 * Cross-module data integrity integration tests.
 *
 * Verifies that derived totals and summary fields reconcile with their
 * source records across module boundaries (collection, allocation, journal,
 * receipt, audit, schedule).
 *
 * Validates: Requirements 71.1, 71.2, 71.3, 71.4, 71.5, 71.6, 71.7
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
    total_interest_paise: 100000n,
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

describe('Cross-Module Data Integrity', () => {
  let collectionService: CollectionService;
  let repo: ReturnType<typeof createMockCollectionRepo>;
  let mocks: ReturnType<typeof createMockServices>;

  beforeEach(() => {
    collectionIdCounter = 0;
    repo = createMockCollectionRepo();
    mocks = createMockServices();
    collectionService = new CollectionService(
      mocks.prisma as never, repo as never, mocks.accounting as never,
      mocks.audit as never, mocks.idempotency as never, mocks.receipt as never,
    );
  });

  // ── Requirement 71.1: cached_outstanding = total_payable - sum of valid allocations ──

  describe('Req 71.1 — cached_outstanding_paise = total_payable - sum of valid allocations', () => {
    it('should have outstanding equal to total_payable minus collection amount after single payment', async () => {
      const amountPaise = 550000;
      const totalPayable = 1100000;
      const dto = buildDto({ amountPaise });

      const result = await collectionService.postCollection(dto, 'officer-1', 'collection_officer');

      // Outstanding after payment should be total_payable - allocated amount
      expect((result.data as AnyData)['outstandingAfterPaise']).toBe(totalPayable - amountPaise);

      // updateLoanOutstanding should be called with the correct derived value
      expect(repo.updateLoanOutstanding).toHaveBeenCalledTimes(1);
      const [, updateData] = repo.updateLoanOutstanding.mock.calls[0]!;
      expect(Number(updateData.cached_outstanding_paise)).toBe(totalPayable - amountPaise);
    });

    it('should have outstanding equal to total_payable minus cumulative allocations after two payments', async () => {
      const totalPayable = 1100000;
      const firstPayment = 300000;
      const secondPayment = 400000;

      // First payment
      const dto1 = buildDto({ amountPaise: firstPayment, idempotencyKey: 'integrity-1' });
      const result1 = await collectionService.postCollection(dto1, 'officer-1', 'collection_officer');
      expect((result1.data as AnyData)['outstandingAfterPaise']).toBe(totalPayable - firstPayment);

      // Update mock to reflect first payment
      const updatedLoan = createMockLoan({
        cached_outstanding_paise: BigInt(totalPayable - firstPayment),
        schedules: [
          createMockSchedule({
            id: 's-1', installment_number: 1, due_date: new Date('2024-01-15'),
            interest_paid_paise: 50000n, principal_paid_paise: 150000n,
          }),
          createMockSchedule({
            id: 's-2', installment_number: 2, due_date: new Date('2024-02-15'),
            interest_paid_paise: 50000n, principal_paid_paise: 50000n,
          }),
        ],
      });
      repo.getLoanForCollection.mockResolvedValue(updatedLoan);
      repo.lockLoanForUpdate.mockResolvedValue({
        id: 'loan-1', status: 'active',
        cached_outstanding_paise: BigInt(totalPayable - firstPayment),
      });

      // Second payment
      const dto2 = buildDto({ amountPaise: secondPayment, idempotencyKey: 'integrity-2' });
      const result2 = await collectionService.postCollection(dto2, 'officer-1', 'collection_officer');
      expect((result2.data as AnyData)['outstandingAfterPaise']).toBe(
        totalPayable - firstPayment - secondPayment,
      );
    });

    it('should have outstanding equal to zero when full amount is paid', async () => {
      const totalPayable = 1100000;
      const dto = buildDto({ amountPaise: totalPayable });

      const result = await collectionService.postCollection(dto, 'officer-1', 'collection_officer');

      expect((result.data as AnyData)['outstandingAfterPaise']).toBe(0);
    });
  });

  // ── Requirement 71.2: journal entry totals match collection amount ─────

  describe('Req 71.2 — journal entry totals match collection amount', () => {
    it('should have journal total debits = total credits = collection amount for full EMI', async () => {
      const amountPaise = 550000;
      const dto = buildDto({ amountPaise });

      await collectionService.postCollection(dto, 'officer-1', 'collection_officer');

      const jeCall = mocks.accounting.createJournalEntry.mock.calls[0]![0];
      const totalDebit = jeCall.lines.reduce(
        (s: number, l: { debitPaise: number }) => s + l.debitPaise, 0,
      );
      const totalCredit = jeCall.lines.reduce(
        (s: number, l: { creditPaise: number }) => s + l.creditPaise, 0,
      );
      expect(totalDebit).toBe(amountPaise);
      expect(totalCredit).toBe(amountPaise);
      expect(totalDebit).toBe(totalCredit);
    });

    it('should have journal total debits = total credits = collection amount for partial payment', async () => {
      const amountPaise = 75000;
      const dto = buildDto({ amountPaise });

      await collectionService.postCollection(dto, 'officer-1', 'collection_officer');

      const jeCall = mocks.accounting.createJournalEntry.mock.calls[0]![0];
      const totalDebit = jeCall.lines.reduce(
        (s: number, l: { debitPaise: number }) => s + l.debitPaise, 0,
      );
      const totalCredit = jeCall.lines.reduce(
        (s: number, l: { creditPaise: number }) => s + l.creditPaise, 0,
      );
      expect(totalDebit).toBe(amountPaise);
      expect(totalCredit).toBe(amountPaise);
    });

    it('should have journal total debits = total credits = collection amount with penalties', async () => {
      repo.getPendingPenalties.mockResolvedValue([
        { id: 'pen-1', amount_paise: 5000n, is_paid: false, is_waived: false },
      ]);
      const overdueLoan = createMockLoan({
        status: 'overdue',
        cached_outstanding_paise: 1105000n,
      });
      repo.getLoanForCollection.mockResolvedValue(overdueLoan);
      repo.lockLoanForUpdate.mockResolvedValue({
        id: 'loan-1', status: 'overdue', cached_outstanding_paise: 1105000n,
      });

      const amountPaise = 200000;
      const dto = buildDto({ amountPaise });

      await collectionService.postCollection(dto, 'officer-1', 'collection_officer');

      const jeCall = mocks.accounting.createJournalEntry.mock.calls[0]![0];
      const totalDebit = jeCall.lines.reduce(
        (s: number, l: { debitPaise: number }) => s + l.debitPaise, 0,
      );
      const totalCredit = jeCall.lines.reduce(
        (s: number, l: { creditPaise: number }) => s + l.creditPaise, 0,
      );
      expect(totalDebit).toBe(amountPaise);
      expect(totalCredit).toBe(amountPaise);
    });

    it('should have balanced journal for multiple collection amounts', async () => {
      const amounts = [1, 10000, 100000, 550000, 1100000];

      for (const amount of amounts) {
        vi.clearAllMocks();
        repo = createMockCollectionRepo();
        mocks = createMockServices();
        collectionService = new CollectionService(
          mocks.prisma as never, repo as never, mocks.accounting as never,
          mocks.audit as never, mocks.idempotency as never, mocks.receipt as never,
        );

        const dto = buildDto({ amountPaise: amount });
        await collectionService.postCollection(dto, 'officer-1', 'collection_officer');

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

  // ── Requirement 71.3: receipt amount matches collection amount ──────────

  describe('Req 71.3 — receipt amount matches collection amount', () => {
    it('should generate receipt with amount equal to collection amount', async () => {
      const amountPaise = 550000;
      const dto = buildDto({ amountPaise });

      await collectionService.postCollection(dto, 'officer-1', 'collection_officer');

      expect(mocks.receipt.generateReceipt).toHaveBeenCalledTimes(1);
      const receiptCall = mocks.receipt.generateReceipt.mock.calls[0]![0];
      expect(receiptCall.amountPaise).toBe(amountPaise);
    });

    it('should have receipt component sum equal to collection amount', async () => {
      const amountPaise = 350000;
      const dto = buildDto({ amountPaise });

      await collectionService.postCollection(dto, 'officer-1', 'collection_officer');

      const receiptCall = mocks.receipt.generateReceipt.mock.calls[0]![0];
      const componentSum =
        receiptCall.penaltyComponentPaise +
        receiptCall.interestComponentPaise +
        receiptCall.principalComponentPaise;
      expect(componentSum).toBe(amountPaise);
    });

    it('should have receipt amount match collection amount for partial payment', async () => {
      const amountPaise = 25000;
      const dto = buildDto({ amountPaise });

      await collectionService.postCollection(dto, 'officer-1', 'collection_officer');

      const receiptCall = mocks.receipt.generateReceipt.mock.calls[0]![0];
      expect(receiptCall.amountPaise).toBe(amountPaise);
      const componentSum =
        receiptCall.penaltyComponentPaise +
        receiptCall.interestComponentPaise +
        receiptCall.principalComponentPaise;
      expect(componentSum).toBe(amountPaise);
    });

    it('should have receipt amount match collection amount with penalties', async () => {
      repo.getPendingPenalties.mockResolvedValue([
        { id: 'pen-1', amount_paise: 10000n, is_paid: false, is_waived: false },
      ]);
      const overdueLoan = createMockLoan({
        status: 'overdue',
        cached_outstanding_paise: 1110000n,
      });
      repo.getLoanForCollection.mockResolvedValue(overdueLoan);
      repo.lockLoanForUpdate.mockResolvedValue({
        id: 'loan-1', status: 'overdue', cached_outstanding_paise: 1110000n,
      });

      const amountPaise = 150000;
      const dto = buildDto({ amountPaise });

      await collectionService.postCollection(dto, 'officer-1', 'collection_officer');

      const receiptCall = mocks.receipt.generateReceipt.mock.calls[0]![0];
      expect(receiptCall.amountPaise).toBe(amountPaise);
      const componentSum =
        receiptCall.penaltyComponentPaise +
        receiptCall.interestComponentPaise +
        receiptCall.principalComponentPaise;
      expect(componentSum).toBe(amountPaise);
    });
  });

  // ── Requirement 71.4: audit log count matches state-changing operations ─

  describe('Req 71.4 — audit log count matches state-changing operations', () => {
    it('should create exactly one audit log per collection posting', async () => {
      const dto = buildDto({ amountPaise: 550000 });

      await collectionService.postCollection(dto, 'officer-1', 'collection_officer');

      expect(mocks.audit.createAuditLog).toHaveBeenCalledTimes(1);
    });

    it('should create one audit log per sequential collection posting', async () => {
      // First collection
      const dto1 = buildDto({ amountPaise: 200000, idempotencyKey: 'audit-seq-1' });
      await collectionService.postCollection(dto1, 'officer-1', 'collection_officer');

      // Update mock for second payment
      const updatedLoan = createMockLoan({ cached_outstanding_paise: 900000n });
      repo.getLoanForCollection.mockResolvedValue(updatedLoan);
      repo.lockLoanForUpdate.mockResolvedValue({
        id: 'loan-1', status: 'active', cached_outstanding_paise: 900000n,
      });

      // Second collection
      const dto2 = buildDto({ amountPaise: 300000, idempotencyKey: 'audit-seq-2' });
      await collectionService.postCollection(dto2, 'officer-1', 'collection_officer');

      // Two state-changing operations → two audit logs
      expect(mocks.audit.createAuditLog).toHaveBeenCalledTimes(2);
    });

    it('should not create audit log for idempotent duplicate request', async () => {
      // First call succeeds
      const dto = buildDto({ idempotencyKey: 'audit-idem' });
      await collectionService.postCollection(dto, 'officer-1', 'collection_officer');
      expect(mocks.audit.createAuditLog).toHaveBeenCalledTimes(1);

      // Simulate duplicate — idempotency returns cached result
      mocks.idempotency.find.mockResolvedValue({
        resultStatus: 201,
        resultBody: { collectionId: 'col-cached' },
      });

      await collectionService.postCollection(dto, 'officer-1', 'collection_officer');

      // Still only 1 audit log — duplicate did not create a new one
      expect(mocks.audit.createAuditLog).toHaveBeenCalledTimes(1);
    });

    it('should include correct actor and target in audit log', async () => {
      const dto = buildDto({ amountPaise: 550000 });

      await collectionService.postCollection(dto, 'officer-1', 'collection_officer');

      const auditCall = mocks.audit.createAuditLog.mock.calls[0]![0];
      expect(auditCall.actor_id).toBe('officer-1');
      expect(auditCall.actor_role).toBe('collection_officer');
      expect(auditCall.target_entity).toBe('collection');
    });
  });

  // ── Requirement 71.5: sum of allocation principal never exceeds loan principal ──

  describe('Req 71.5 — sum of allocation principal never exceeds loan principal', () => {
    it('should have allocation principal ≤ loan principal for single full payment', async () => {
      const loanPrincipal = 1000000; // 10,000.00 INR
      const dto = buildDto({ amountPaise: 1100000 }); // full payment

      await collectionService.postCollection(dto, 'officer-1', 'collection_officer');

      const receiptCall = mocks.receipt.generateReceipt.mock.calls[0]![0];
      expect(receiptCall.principalComponentPaise).toBeLessThanOrEqual(loanPrincipal);
    });

    it('should have cumulative allocation principal ≤ loan principal after two payments', async () => {
      const loanPrincipal = 1000000;

      // First payment
      const dto1 = buildDto({ amountPaise: 300000, idempotencyKey: 'alloc-p-1' });
      await collectionService.postCollection(dto1, 'officer-1', 'collection_officer');
      const receipt1 = mocks.receipt.generateReceipt.mock.calls[0]![0];
      const firstPrincipal = receipt1.principalComponentPaise;

      // Update mock for second payment — reflect first payment allocations
      const updatedLoan = createMockLoan({
        cached_outstanding_paise: 800000n,
        schedules: [
          createMockSchedule({
            id: 's-1', installment_number: 1, due_date: new Date('2024-01-15'),
            interest_paid_paise: 50000n,
            principal_paid_paise: BigInt(firstPrincipal > 50000 ? firstPrincipal - 50000 : 0),
          }),
          createMockSchedule({
            id: 's-2', installment_number: 2, due_date: new Date('2024-02-15'),
            interest_paid_paise: 50000n,
          }),
        ],
      });
      repo.getLoanForCollection.mockResolvedValue(updatedLoan);
      repo.lockLoanForUpdate.mockResolvedValue({
        id: 'loan-1', status: 'active', cached_outstanding_paise: 800000n,
      });

      // Second payment
      const dto2 = buildDto({ amountPaise: 300000, idempotencyKey: 'alloc-p-2' });
      await collectionService.postCollection(dto2, 'officer-1', 'collection_officer');
      const receipt2 = mocks.receipt.generateReceipt.mock.calls[1]![0];
      const secondPrincipal = receipt2.principalComponentPaise;

      // Cumulative principal allocated must not exceed loan principal
      expect(firstPrincipal + secondPrincipal).toBeLessThanOrEqual(loanPrincipal);
    });

    it('should allocate zero principal when payment covers only interest', async () => {
      // Pay exactly the interest portion (100000 = 50000 × 2 installments)
      const dto = buildDto({ amountPaise: 100000 });

      await collectionService.postCollection(dto, 'officer-1', 'collection_officer');

      const receiptCall = mocks.receipt.generateReceipt.mock.calls[0]![0];
      expect(receiptCall.principalComponentPaise).toBe(0);
      expect(receiptCall.principalComponentPaise).toBeLessThanOrEqual(1000000);
    });
  });

  // ── Requirement 71.6: sum of allocation interest never exceeds total interest ──

  describe('Req 71.6 — sum of allocation interest never exceeds total interest', () => {
    it('should have allocation interest ≤ total interest for single payment', async () => {
      const totalInterest = 100000; // 50000 × 2 installments
      const dto = buildDto({ amountPaise: 1100000 }); // full payment

      await collectionService.postCollection(dto, 'officer-1', 'collection_officer');

      const receiptCall = mocks.receipt.generateReceipt.mock.calls[0]![0];
      expect(receiptCall.interestComponentPaise).toBeLessThanOrEqual(totalInterest);
    });

    it('should have cumulative allocation interest ≤ total interest after two payments', async () => {
      const totalInterest = 100000;

      // First payment — covers all interest (100000) + some principal
      const dto1 = buildDto({ amountPaise: 300000, idempotencyKey: 'alloc-i-1' });
      await collectionService.postCollection(dto1, 'officer-1', 'collection_officer');
      const receipt1 = mocks.receipt.generateReceipt.mock.calls[0]![0];
      const firstInterest = receipt1.interestComponentPaise;

      // Update mock — all interest already paid
      const updatedLoan = createMockLoan({
        cached_outstanding_paise: 800000n,
        schedules: [
          createMockSchedule({
            id: 's-1', installment_number: 1, due_date: new Date('2024-01-15'),
            interest_paid_paise: 50000n,
            principal_paid_paise: BigInt(300000 - firstInterest),
          }),
          createMockSchedule({
            id: 's-2', installment_number: 2, due_date: new Date('2024-02-15'),
            interest_paid_paise: 50000n,
          }),
        ],
      });
      repo.getLoanForCollection.mockResolvedValue(updatedLoan);
      repo.lockLoanForUpdate.mockResolvedValue({
        id: 'loan-1', status: 'active', cached_outstanding_paise: 800000n,
      });

      // Second payment — should allocate to principal only (interest already paid)
      const dto2 = buildDto({ amountPaise: 200000, idempotencyKey: 'alloc-i-2' });
      await collectionService.postCollection(dto2, 'officer-1', 'collection_officer');
      const receipt2 = mocks.receipt.generateReceipt.mock.calls[1]![0];
      const secondInterest = receipt2.interestComponentPaise;

      // Cumulative interest allocated must not exceed total interest
      expect(firstInterest + secondInterest).toBeLessThanOrEqual(totalInterest);
    });

    it('should allocate zero interest when all interest is already paid', async () => {
      // Loan with all interest already paid
      const paidLoan = createMockLoan({
        cached_outstanding_paise: 800000n,
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
      repo.getLoanForCollection.mockResolvedValue(paidLoan);
      repo.lockLoanForUpdate.mockResolvedValue({
        id: 'loan-1', status: 'active', cached_outstanding_paise: 800000n,
      });

      const dto = buildDto({ amountPaise: 200000 });
      await collectionService.postCollection(dto, 'officer-1', 'collection_officer');

      const receiptCall = mocks.receipt.generateReceipt.mock.calls[0]![0];
      expect(receiptCall.interestComponentPaise).toBe(0);
    });
  });

  // ── Requirement 71.7: collection + reversal net effect on outstanding = zero ──

  describe('Req 71.7 — collection + reversal net effect on outstanding = zero', () => {
    it('should restore outstanding to original value after collection + reversal', async () => {
      const originalOutstanding = 1100000;
      const collectionAmount = 550000;

      // Step 1: Post collection
      const dto = buildDto({ amountPaise: collectionAmount, idempotencyKey: 'net-zero-1' });
      const collectionResult = await collectionService.postCollection(dto, 'officer-1', 'collection_officer');
      const outstandingAfterCollection = (collectionResult.data as AnyData)['outstandingAfterPaise'];
      expect(outstandingAfterCollection).toBe(originalOutstanding - collectionAmount);

      // Step 2: Set up reversal service with matching mocks
      const reversalTx = {
        collections: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'col-1', loan_id: 'loan-1', amount_paise: BigInt(collectionAmount),
            payment_date: new Date('2024-01-15'), payment_mode: 'cash',
            status: 'posted', is_reversal: false, journal_entry_id: 'je-1',
          }),
          create: vi.fn().mockResolvedValue({
            id: 'rev-col-1', loan_id: 'loan-1',
            amount_paise: BigInt(-collectionAmount),
          }),
          update: vi.fn().mockResolvedValue({}),
        },
        collection_allocations: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 'alloc-1', installment_id: 's-1',
              penalty_paise: 0n, interest_paise: 50000n,
              principal_paise: 200000n, total_paise: 250000n,
            },
            {
              id: 'alloc-2', installment_id: 's-2',
              penalty_paise: 0n, interest_paise: 50000n,
              principal_paise: 200000n, total_paise: 250000n,
            },
          ]),
          create: vi.fn().mockResolvedValue({}),
        },
        journal_entries: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'je-1',
            lines: [
              { account_id: 'acc-cash', debit_paise: BigInt(collectionAmount), credit_paise: 0n },
              { account_id: 'acc-lr', debit_paise: 0n, credit_paise: 400000n },
              { account_id: 'acc-int', debit_paise: 0n, credit_paise: 100000n },
            ],
          }),
        },
        receipts: {
          findMany: vi.fn().mockResolvedValue([
            { id: 'rcp-1', amount_paise: BigInt(collectionAmount), payment_mode: 'cash' },
          ]),
        },
      };

      const reversalPrisma = {
        $transaction: vi.fn((fn: (t: unknown) => Promise<unknown>) => fn(reversalTx)),
      };

      // Loan state after collection (outstanding reduced)
      const postCollectionRepo = {
        lockLoanForUpdate: vi.fn().mockResolvedValue({
          id: 'loan-1', status: 'active',
          cached_outstanding_paise: BigInt(outstandingAfterCollection),
        }),
        getLoanForCollection: vi.fn().mockResolvedValue(createMockLoan({
          cached_outstanding_paise: BigInt(outstandingAfterCollection),
          schedules: [
            createMockSchedule({
              id: 's-1', installment_number: 1, due_date: new Date('2024-01-15'),
              principal_paid_paise: 200000n, interest_paid_paise: 50000n,
            }),
            createMockSchedule({
              id: 's-2', installment_number: 2, due_date: new Date('2024-02-15'),
              principal_paid_paise: 200000n, interest_paid_paise: 50000n,
            }),
          ],
        })),
        updateInstallment: vi.fn().mockResolvedValue(undefined),
        updateLoanOutstanding: vi.fn().mockResolvedValue(undefined),
        getOfficerName: vi.fn().mockResolvedValue('Officer Name'),
      };

      const reversalMocks = {
        accounting: { createJournalEntry: vi.fn().mockResolvedValue({ id: 'je-mirror-1' }) },
        audit: { createAuditLog: vi.fn().mockResolvedValue({}) },
        idempotency: { find: vi.fn().mockResolvedValue(null), store: vi.fn().mockResolvedValue({}) },
        receipt: {
          generateReceipt: vi.fn().mockResolvedValue({ id: 'rcp-rev-1', receipt_number: 'RCP-2024-00002' }),
          markAsReversed: vi.fn().mockResolvedValue(undefined),
        },
      };

      const reversalService = new ReversalService(
        reversalPrisma as never, postCollectionRepo as never,
        reversalMocks.accounting as never, reversalMocks.audit as never,
        reversalMocks.idempotency as never, reversalMocks.receipt as never,
      );

      // Execute reversal
      await reversalService.reverseCollection(
        { collectionId: 'col-1', reason: 'Net zero test', idempotencyKey: 'rev-net-zero' },
        'manager-1', 'manager',
      );

      // Verify outstanding was restored to original value
      expect(postCollectionRepo.updateLoanOutstanding).toHaveBeenCalledTimes(1);
      const [, reversalUpdateData] = postCollectionRepo.updateLoanOutstanding.mock.calls[0]!;
      const restoredOutstanding = Number(reversalUpdateData.cached_outstanding_paise);

      // Net effect: original outstanding → (outstanding - collection) → (outstanding - collection + collection) = original
      expect(restoredOutstanding).toBe(originalOutstanding);
    });

    it('should have mirror journal that exactly offsets original journal', async () => {
      const collectionAmount = 550000;

      // Post collection and capture journal
      const dto = buildDto({ amountPaise: collectionAmount });
      await collectionService.postCollection(dto, 'officer-1', 'collection_officer');

      const originalJeCall = mocks.accounting.createJournalEntry.mock.calls[0]![0];
      const originalLines = originalJeCall.lines;

      // Set up reversal with the same journal structure
      const reversalTx = {
        collections: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'col-1', loan_id: 'loan-1', amount_paise: BigInt(collectionAmount),
            payment_date: new Date('2024-01-15'), payment_mode: 'cash',
            status: 'posted', is_reversal: false, journal_entry_id: 'je-1',
          }),
          create: vi.fn().mockResolvedValue({ id: 'rev-col-1', loan_id: 'loan-1' }),
          update: vi.fn().mockResolvedValue({}),
        },
        collection_allocations: {
          findMany: vi.fn().mockResolvedValue([
            { id: 'alloc-1', installment_id: 's-1', penalty_paise: 0n, interest_paise: 50000n, principal_paise: 200000n, total_paise: 250000n },
            { id: 'alloc-2', installment_id: 's-2', penalty_paise: 0n, interest_paise: 50000n, principal_paise: 200000n, total_paise: 250000n },
          ]),
          create: vi.fn().mockResolvedValue({}),
        },
        journal_entries: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'je-1',
            lines: originalLines.map((l: { accountId: string; debitPaise: number; creditPaise: number }) => ({
              account_id: l.accountId,
              debit_paise: BigInt(l.debitPaise),
              credit_paise: BigInt(l.creditPaise),
            })),
          }),
        },
        receipts: {
          findMany: vi.fn().mockResolvedValue([
            { id: 'rcp-1', amount_paise: BigInt(collectionAmount), payment_mode: 'cash' },
          ]),
        },
      };

      const reversalPrisma = {
        $transaction: vi.fn((fn: (t: unknown) => Promise<unknown>) => fn(reversalTx)),
      };

      const postCollectionRepo = {
        lockLoanForUpdate: vi.fn().mockResolvedValue({ id: 'loan-1', status: 'active', cached_outstanding_paise: 550000n }),
        getLoanForCollection: vi.fn().mockResolvedValue(createMockLoan({ cached_outstanding_paise: 550000n })),
        updateInstallment: vi.fn().mockResolvedValue(undefined),
        updateLoanOutstanding: vi.fn().mockResolvedValue(undefined),
        getOfficerName: vi.fn().mockResolvedValue('Officer Name'),
      };

      const reversalMocks = {
        accounting: { createJournalEntry: vi.fn().mockResolvedValue({ id: 'je-mirror-1' }) },
        audit: { createAuditLog: vi.fn().mockResolvedValue({}) },
        idempotency: { find: vi.fn().mockResolvedValue(null), store: vi.fn().mockResolvedValue({}) },
        receipt: {
          generateReceipt: vi.fn().mockResolvedValue({ id: 'rcp-rev-1', receipt_number: 'RCP-2024-00002' }),
          markAsReversed: vi.fn().mockResolvedValue(undefined),
        },
      };

      const reversalService = new ReversalService(
        reversalPrisma as never, postCollectionRepo as never,
        reversalMocks.accounting as never, reversalMocks.audit as never,
        reversalMocks.idempotency as never, reversalMocks.receipt as never,
      );

      await reversalService.reverseCollection(
        { collectionId: 'col-1', reason: 'Mirror test', idempotencyKey: 'rev-mirror-net' },
        'manager-1', 'manager',
      );

      // Verify mirror journal: for each original line, debit↔credit are swapped
      const mirrorJeCall = reversalMocks.accounting.createJournalEntry.mock.calls[0]![0];
      const mirrorLines = mirrorJeCall.lines;

      // Net effect per account should be zero
      for (let i = 0; i < originalLines.length; i++) {
        const orig = originalLines[i];
        const mirror = mirrorLines[i];
        // Original debit becomes mirror credit and vice versa
        const netDebit = orig.debitPaise + mirror.debitPaise;
        const netCredit = orig.creditPaise + mirror.creditPaise;
        expect(netDebit).toBe(netCredit);
      }

      // Total mirror debits = total mirror credits
      const mirrorTotalDebit = mirrorLines.reduce(
        (s: number, l: { debitPaise: number }) => s + l.debitPaise, 0,
      );
      const mirrorTotalCredit = mirrorLines.reduce(
        (s: number, l: { creditPaise: number }) => s + l.creditPaise, 0,
      );
      expect(mirrorTotalDebit).toBe(mirrorTotalCredit);
      expect(mirrorTotalDebit).toBe(collectionAmount);
    });

    it('should restore installment paid amounts to pre-collection values after reversal', async () => {
      const collectionAmount = 550000;

      // Set up reversal
      const reversalTx = {
        collections: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'col-1', loan_id: 'loan-1', amount_paise: BigInt(collectionAmount),
            payment_date: new Date('2024-01-15'), payment_mode: 'cash',
            status: 'posted', is_reversal: false, journal_entry_id: 'je-1',
          }),
          create: vi.fn().mockResolvedValue({ id: 'rev-col-1', loan_id: 'loan-1' }),
          update: vi.fn().mockResolvedValue({}),
        },
        collection_allocations: {
          findMany: vi.fn().mockResolvedValue([
            { id: 'alloc-1', installment_id: 's-1', penalty_paise: 0n, interest_paise: 50000n, principal_paise: 500000n, total_paise: 550000n },
          ]),
          create: vi.fn().mockResolvedValue({}),
        },
        journal_entries: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'je-1',
            lines: [
              { account_id: 'acc-cash', debit_paise: BigInt(collectionAmount), credit_paise: 0n },
              { account_id: 'acc-lr', debit_paise: 0n, credit_paise: 500000n },
              { account_id: 'acc-int', debit_paise: 0n, credit_paise: 50000n },
            ],
          }),
        },
        receipts: {
          findMany: vi.fn().mockResolvedValue([
            { id: 'rcp-1', amount_paise: BigInt(collectionAmount), payment_mode: 'cash' },
          ]),
        },
      };

      const reversalPrisma = {
        $transaction: vi.fn((fn: (t: unknown) => Promise<unknown>) => fn(reversalTx)),
      };

      const postCollectionRepo = {
        lockLoanForUpdate: vi.fn().mockResolvedValue({ id: 'loan-1', status: 'active', cached_outstanding_paise: 550000n }),
        getLoanForCollection: vi.fn().mockResolvedValue(createMockLoan({
          cached_outstanding_paise: 550000n,
          schedules: [
            createMockSchedule({
              id: 's-1', installment_number: 1, due_date: new Date('2024-01-15'),
              principal_paid_paise: 500000n, interest_paid_paise: 50000n, status: 'paid',
            }),
            createMockSchedule({ id: 's-2', installment_number: 2, due_date: new Date('2024-02-15') }),
          ],
        })),
        updateInstallment: vi.fn().mockResolvedValue(undefined),
        updateLoanOutstanding: vi.fn().mockResolvedValue(undefined),
        getOfficerName: vi.fn().mockResolvedValue('Officer Name'),
      };

      const reversalMocks = {
        accounting: { createJournalEntry: vi.fn().mockResolvedValue({ id: 'je-mirror-1' }) },
        audit: { createAuditLog: vi.fn().mockResolvedValue({}) },
        idempotency: { find: vi.fn().mockResolvedValue(null), store: vi.fn().mockResolvedValue({}) },
        receipt: {
          generateReceipt: vi.fn().mockResolvedValue({ id: 'rcp-rev-1', receipt_number: 'RCP-2024-00002' }),
          markAsReversed: vi.fn().mockResolvedValue(undefined),
        },
      };

      const reversalService = new ReversalService(
        reversalPrisma as never, postCollectionRepo as never,
        reversalMocks.accounting as never, reversalMocks.audit as never,
        reversalMocks.idempotency as never, reversalMocks.receipt as never,
      );

      await reversalService.reverseCollection(
        { collectionId: 'col-1', reason: 'Restore test', idempotencyKey: 'rev-restore-net' },
        'manager-1', 'manager',
      );

      // Installment s-1 should be restored to pre-collection state (0 paid)
      const instCall = postCollectionRepo.updateInstallment.mock.calls.find(
        (c: unknown[]) => c[0] === 's-1',
      );
      expect(instCall).toBeDefined();
      expect(instCall![1].principal_paid_paise).toBe(0);
      expect(instCall![1].interest_paid_paise).toBe(0);
      expect(instCall![1].status).toBe('pending');
    });
  });
});
