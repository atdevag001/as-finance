import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CollectionService } from '../collection.service';
import { BusinessRuleError, NotFoundError } from '../../../common/errors';
import { PaymentMode, JournalSourceType } from '@as-finance/shared';
import type { AllocationResult, AllocationLine } from '../allocation-engine';

/**
 * Unit tests for CollectionService.
 *
 * Tests postCollection(), validateLoanStatus(), computeOutstanding(),
 * buildJournalLines(), buildAllocationRecords(), updateInstallments(),
 * computeDpdAndBucket().
 *
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9
 */

// ── Mock factories ───────────────────────────────────────────────────────────

function createMockSchedule(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inst-1',
    installment_number: 1,
    due_date: new Date('2024-02-01'),
    principal_paise: 833333n,
    interest_paise: 100000n,
    total_paise: 933333n,
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
    principal_paise: 10000000n,
    status: 'active',
    total_payable_paise: 11200000n,
    cached_outstanding_paise: 11200000n,
    dpd: 0,
    overdue_bucket: 'bucket_0',
    product_version: {
      id: 'pv-1',
      allocation_order: ['penalty', 'interest', 'principal'],
    },
    customer: { id: 'cust-1', full_name: 'Test Customer', mobile: '9876543210' },
    schedules: [
      createMockSchedule({ id: 'inst-1', installment_number: 1, due_date: new Date('2024-02-01') }),
      createMockSchedule({ id: 'inst-2', installment_number: 2, due_date: new Date('2024-03-01') }),
    ],
    ...overrides,
  };
}

function createMockRepo() {
  return {
    lockLoanForUpdate: vi.fn(),
    getLoanForCollection: vi.fn(),
    getPendingPenalties: vi.fn().mockResolvedValue([]),
    createCollection: vi.fn(),
    createAllocations: vi.fn().mockResolvedValue([]),
    updateInstallment: vi.fn().mockResolvedValue({}),
    updateLoanOutstanding: vi.fn().mockResolvedValue({}),
    findAccountByCode: vi.fn(),
    getOfficerName: vi.fn().mockResolvedValue('Officer Name'),
    enqueueOutboxMessage: vi.fn().mockResolvedValue({}),
    getPenaltyPaidTotal: vi.fn().mockResolvedValue(0n),
  };
}

function createMockAccountingService() {
  return {
    createJournalEntry: vi.fn().mockResolvedValue({ id: 'je-1' }),
  };
}

function createMockAuditService() {
  return {
    createAuditLog: vi.fn().mockResolvedValue({ id: 'audit-1' }),
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
    generateReceipt: vi.fn().mockResolvedValue({
      id: 'receipt-1',
      receipt_number: 'REC-00001',
    }),
  };
}

function createMockPrisma() {
  // Tx client mock used by the auto-status-transition path inside the
  // collection transaction (Sprint 4 added loans.update + loan_status_history.create).
  // Also penalties.update is invoked when penalty payments are persisted —
  // but in unit tests, no penalty allocations are produced, so the mock is silent.
  const txMock = {
    loans: { update: vi.fn() },
    loan_status_history: { create: vi.fn() },
    penalties: { update: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    $executeRaw: vi.fn().mockResolvedValue(1),
  };
  return {
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn(txMock)),
    _tx: txMock,
  };
}

function setupAccountLookup(repo: ReturnType<typeof createMockRepo>) {
  const accounts: Record<string, { id: string; code: string; name: string; category: string }> = {
    '1001': { id: 'acc-cash', code: '1001', name: 'Cash', category: 'asset' },
    '1002': { id: 'acc-bank', code: '1002', name: 'Bank', category: 'asset' },
    '1100': { id: 'acc-lr', code: '1100', name: 'Loans Receivable', category: 'asset' },
    '4001': { id: 'acc-ii', code: '4001', name: 'Interest Income', category: 'income' },
    '4003': { id: 'acc-pi', code: '4003', name: 'Penalty Income', category: 'income' },
  };
  repo.findAccountByCode.mockImplementation((code: string) =>
    Promise.resolve(accounts[code] ?? null),
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('CollectionService', () => {
  let service: CollectionService;
  let repo: ReturnType<typeof createMockRepo>;
  let accountingService: ReturnType<typeof createMockAccountingService>;
  let auditService: ReturnType<typeof createMockAuditService>;
  let idempotencyService: ReturnType<typeof createMockIdempotencyService>;
  let receiptService: ReturnType<typeof createMockReceiptService>;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    repo = createMockRepo();
    accountingService = createMockAccountingService();
    auditService = createMockAuditService();
    idempotencyService = createMockIdempotencyService();
    receiptService = createMockReceiptService();
    prisma = createMockPrisma();

    const mockLoan = createMockLoan();
    repo.lockLoanForUpdate.mockResolvedValue({
      id: 'loan-1',
      status: 'active',
      cached_outstanding_paise: 11200000n,
    });
    repo.getLoanForCollection.mockResolvedValue(mockLoan);
    setupAccountLookup(repo);
    repo.createCollection.mockResolvedValue({
      id: 'coll-1',
      loan_id: 'loan-1',
      amount_paise: 933333n,
      payment_date: new Date('2024-02-01'),
      payment_mode: 'cash',
      status: 'posted',
      is_reversal: false,
      collected_by: 'actor-1',
      journal_entry_id: 'je-1',
      receipt_id: null,
      idempotency_key: 'idem-1',
      created_at: new Date(),
    });

    service = new CollectionService(
      prisma as never,
      repo as never,
      accountingService as never,
      auditService as never,
      idempotencyService as never,
      receiptService as never,
    );
  });

  // ── 5.1 postCollection() ─────────────────────────────────────────────────

  describe('postCollection()', () => {
    const dto = {
      loanId: 'loan-1',
      amountPaise: 933333,
      paymentDate: '2024-02-01',
      paymentMode: PaymentMode.CASH,
      idempotencyKey: 'idem-1',
    };

    it('should return cached result for duplicate idempotency key', async () => {
      const cached = { resultStatus: 201, resultBody: { collectionId: 'coll-cached' } };
      idempotencyService.find.mockResolvedValue(cached);

      const result = await service.postCollection(dto, 'actor-1', 'manager');
      expect(result.statusCode).toBe(201);
      expect(result.data).toEqual(cached.resultBody);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should execute collection within a transaction', async () => {
      const result = await service.postCollection(dto, 'actor-1', 'manager');
      expect(result.statusCode).toBe(201);
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should lock loan row with SELECT FOR UPDATE', async () => {
      await service.postCollection(dto, 'actor-1', 'manager');
      expect(repo.lockLoanForUpdate).toHaveBeenCalledWith('loan-1', expect.anything());
    });

    it('should throw NotFoundError when loan does not exist', async () => {
      repo.lockLoanForUpdate.mockResolvedValue(null);
      await expect(service.postCollection(dto, 'actor-1', 'manager')).rejects.toThrow(NotFoundError);
    });

    it('should create collection record', async () => {
      await service.postCollection(dto, 'actor-1', 'manager');
      expect(repo.createCollection).toHaveBeenCalledTimes(1);
      const createCall = repo.createCollection.mock.calls[0]![0];
      expect(createCall.loan_id).toBe('loan-1');
      expect(createCall.payment_mode).toBe('cash');
      expect(createCall.collected_by).toBe('actor-1');
    });

    it('should create journal entry with correct source type', async () => {
      await service.postCollection(dto, 'actor-1', 'manager');
      expect(accountingService.createJournalEntry).toHaveBeenCalledTimes(1);
      const jeDto = accountingService.createJournalEntry.mock.calls[0]![0];
      expect(jeDto.sourceType).toBe(JournalSourceType.COLLECTION);
      expect(jeDto.sourceId).toBe('loan-1');
    });

    it('should generate receipt', async () => {
      await service.postCollection(dto, 'actor-1', 'manager');
      expect(receiptService.generateReceipt).toHaveBeenCalledTimes(1);
      const receiptInput = receiptService.generateReceipt.mock.calls[0]![0];
      expect(receiptInput.collectionId).toBe('coll-1');
      expect(receiptInput.loanId).toBe('loan-1');
      expect(receiptInput.customerName).toBe('Test Customer');
    });

    it('should create audit log entry', async () => {
      await service.postCollection(dto, 'actor-1', 'manager');
      expect(auditService.createAuditLog).toHaveBeenCalledTimes(1);
      const auditCall = auditService.createAuditLog.mock.calls[0]![0];
      expect(auditCall.action_type).toBe('collection_posted');
      expect(auditCall.actor_id).toBe('actor-1');
      expect(auditCall.target_entity).toBe('collection');
    });

    it('should enqueue SMS notification', async () => {
      await service.postCollection(dto, 'actor-1', 'manager');
      expect(repo.enqueueOutboxMessage).toHaveBeenCalledTimes(1);
      const smsCall = repo.enqueueOutboxMessage.mock.calls[0]![0];
      expect(smsCall.event_type).toBe('collection_receipt');
      expect(smsCall.recipient_mobile).toBe('9876543210');
    });

    it('should store idempotency result', async () => {
      await service.postCollection(dto, 'actor-1', 'manager');
      expect(idempotencyService.store).toHaveBeenCalledTimes(1);
      expect(idempotencyService.store.mock.calls[0]![0]).toBe('idem-1');
      expect(idempotencyService.store.mock.calls[0]![1]).toBe('collection');
      expect(idempotencyService.store.mock.calls[0]![2]).toBe(201);
    });

    it('should update loan outstanding after collection', async () => {
      await service.postCollection(dto, 'actor-1', 'manager');
      expect(repo.updateLoanOutstanding).toHaveBeenCalledTimes(1);
    });

    it('should use bank account code 1002 for bank_transfer mode', async () => {
      const bankDto = { ...dto, paymentMode: PaymentMode.BANK_TRANSFER };
      await service.postCollection(bankDto, 'actor-1', 'manager');
      // The first findAccountByCode call should be for '1002' (bank)
      const calls = repo.findAccountByCode.mock.calls;
      const firstCode = calls[0]![0];
      expect(firstCode).toBe('1002');
    });
  });

  // ── 5.2 validateLoanStatus() ─────────────────────────────────────────────

  describe('validateLoanStatus()', () => {
    // Access private method for direct testing
     
    function callValidate(status: string) {
      return (service as any)['validateLoanStatus'](status);
    }

    it('should accept active status', () => {
      expect(() => callValidate('active')).not.toThrow();
    });

    it('should accept overdue status', () => {
      expect(() => callValidate('overdue')).not.toThrow();
    });

    it('should reject closed loan with LOAN_CLOSED code', () => {
      expect(() => callValidate('closed')).toThrow(BusinessRuleError);
      try { callValidate('closed'); } catch (e: unknown) {
        expect((e as BusinessRuleError).code).toBe('LOAN_CLOSED');
      }
    });

    it('should reject defaulted loan with LOAN_DEFAULTED code', () => {
      expect(() => callValidate('defaulted')).toThrow(BusinessRuleError);
      try { callValidate('defaulted'); } catch (e: unknown) {
        expect((e as BusinessRuleError).code).toBe('LOAN_DEFAULTED');
      }
    });

    it('should reject draft loan with LOAN_NOT_ACTIVE code', () => {
      expect(() => callValidate('draft')).toThrow(BusinessRuleError);
      try { callValidate('draft'); } catch (e: unknown) {
        expect((e as BusinessRuleError).code).toBe('LOAN_NOT_ACTIVE');
      }
    });

    it('should reject submitted loan with LOAN_NOT_ACTIVE code', () => {
      expect(() => callValidate('submitted')).toThrow(BusinessRuleError);
      try { callValidate('submitted'); } catch (e: unknown) {
        expect((e as BusinessRuleError).code).toBe('LOAN_NOT_ACTIVE');
      }
    });

    it('should reject foreclosed loan with LOAN_FORECLOSED code', () => {
      expect(() => callValidate('foreclosed')).toThrow(BusinessRuleError);
      try { callValidate('foreclosed'); } catch (e: unknown) {
        expect((e as BusinessRuleError).code).toBe('LOAN_FORECLOSED');
      }
    });

    it('should reject rejected loan with LOAN_REJECTED code', () => {
      expect(() => callValidate('rejected')).toThrow(BusinessRuleError);
      try { callValidate('rejected'); } catch (e: unknown) {
        expect((e as BusinessRuleError).code).toBe('LOAN_REJECTED');
      }
    });

    it('should reject unknown status with LOAN_NOT_COLLECTABLE code', () => {
      expect(() => callValidate('unknown_status')).toThrow(BusinessRuleError);
      try { callValidate('unknown_status'); } catch (e: unknown) {
        expect((e as BusinessRuleError).code).toBe('LOAN_NOT_COLLECTABLE');
      }
    });
  });

  // ── 5.3 computeOutstanding() ─────────────────────────────────────────────

  describe('computeOutstanding()', () => {
     
    function callCompute(schedules: Array<{
      principal_paise: bigint;
      interest_paise: bigint;
      principal_paid_paise: bigint;
      interest_paid_paise: bigint;
    }>) {
      return (service as any)['computeOutstanding'](schedules);
    }

    it('should compute outstanding for fully unpaid schedules', () => {
      const schedules = [
        { principal_paise: 500000n, interest_paise: 50000n, principal_paid_paise: 0n, interest_paid_paise: 0n },
        { principal_paise: 500000n, interest_paise: 50000n, principal_paid_paise: 0n, interest_paid_paise: 0n },
      ];
      expect(callCompute(schedules)).toBe(1100000);
    });

    it('should compute outstanding for partially paid schedules', () => {
      const schedules = [
        { principal_paise: 500000n, interest_paise: 50000n, principal_paid_paise: 200000n, interest_paid_paise: 50000n },
        { principal_paise: 500000n, interest_paise: 50000n, principal_paid_paise: 0n, interest_paid_paise: 0n },
      ];
      // (500000-200000) + (50000-50000) + (500000-0) + (50000-0) = 300000 + 0 + 500000 + 50000 = 850000
      expect(callCompute(schedules)).toBe(850000);
    });

    it('should return 0 for fully paid schedules', () => {
      const schedules = [
        { principal_paise: 500000n, interest_paise: 50000n, principal_paid_paise: 500000n, interest_paid_paise: 50000n },
      ];
      expect(callCompute(schedules)).toBe(0);
    });

    it('should return 0 for empty schedules', () => {
      expect(callCompute([])).toBe(0);
    });
  });

  // ── 5.4 buildJournalLines() ──────────────────────────────────────────────

  describe('buildJournalLines()', () => {
     
    function callBuildJournalLines(
      allocationResult: AllocationResult,
      cashAccountId = 'acc-cash',
      loansReceivableAccountId = 'acc-lr',
      interestIncomeAccountId = 'acc-ii',
      penaltyIncomeAccountId = 'acc-pi',
    ) {
      return (service as any)['buildJournalLines'](
        allocationResult,
        cashAccountId,
        loansReceivableAccountId,
        interestIncomeAccountId,
        penaltyIncomeAccountId,
      );
    }

    it('should create DR Cash and CR entries for all components', () => {
      const result: AllocationResult = {
        allocations: [],
        totalPenaltyAllocated: 5000,
        totalInterestAllocated: 100000,
        totalPrincipalAllocated: 833333,
        excessAmount: 0,
      };
      const lines = callBuildJournalLines(result);

      // DR Cash = total
      expect(lines[0]).toEqual({ accountId: 'acc-cash', debitPaise: 938333, creditPaise: 0 });
      // CR Loans Receivable = principal
      expect(lines[1]).toEqual({ accountId: 'acc-lr', debitPaise: 0, creditPaise: 833333 });
      // CR Interest Income = interest
      expect(lines[2]).toEqual({ accountId: 'acc-ii', debitPaise: 0, creditPaise: 100000 });
      // CR Penalty Income = penalty
      expect(lines[3]).toEqual({ accountId: 'acc-pi', debitPaise: 0, creditPaise: 5000 });
    });

    it('should omit zero-amount credit lines', () => {
      const result: AllocationResult = {
        allocations: [],
        totalPenaltyAllocated: 0,
        totalInterestAllocated: 100000,
        totalPrincipalAllocated: 0,
        excessAmount: 0,
      };
      const lines = callBuildJournalLines(result);

      // DR Cash + CR Interest Income only
      expect(lines).toHaveLength(2);
      expect(lines[0]!.debitPaise).toBe(100000);
      expect(lines[1]!.creditPaise).toBe(100000);
      expect(lines[1]!.accountId).toBe('acc-ii');
    });

    it('should produce balanced journal lines (total debit = total credit)', () => {
      const result: AllocationResult = {
        allocations: [],
        totalPenaltyAllocated: 1000,
        totalInterestAllocated: 2000,
        totalPrincipalAllocated: 3000,
        excessAmount: 0,
      };
      const lines = callBuildJournalLines(result);

      const totalDebit = lines.reduce((s: number, l: { debitPaise: number }) => s + l.debitPaise, 0);
      const totalCredit = lines.reduce((s: number, l: { creditPaise: number }) => s + l.creditPaise, 0);
      expect(totalDebit).toBe(totalCredit);
    });

    it('should handle principal-only allocation', () => {
      const result: AllocationResult = {
        allocations: [],
        totalPenaltyAllocated: 0,
        totalInterestAllocated: 0,
        totalPrincipalAllocated: 500000,
        excessAmount: 0,
      };
      const lines = callBuildJournalLines(result);

      expect(lines).toHaveLength(2);
      expect(lines[0]!.debitPaise).toBe(500000);
      expect(lines[1]!.accountId).toBe('acc-lr');
      expect(lines[1]!.creditPaise).toBe(500000);
    });
  });

  // ── 5.5 buildAllocationRecords() ────────────────────────────────────────

  describe('buildAllocationRecords()', () => {
     
    function callBuildAllocationRecords(collectionId: string, allocationResult: AllocationResult) {
      return (service as any)['buildAllocationRecords'](collectionId, allocationResult);
    }

    it('should group allocations by installment', () => {
      const result: AllocationResult = {
        allocations: [
          { installmentId: 'inst-1', component: 'interest', amountPaise: 100000 },
          { installmentId: 'inst-1', component: 'principal', amountPaise: 833333 },
          { installmentId: 'inst-2', component: 'interest', amountPaise: 50000 },
        ],
        totalPenaltyAllocated: 0,
        totalInterestAllocated: 150000,
        totalPrincipalAllocated: 833333,
        excessAmount: 0,
      };
      const records = callBuildAllocationRecords('coll-1', result);

      expect(records).toHaveLength(2);
      const inst1 = records.find((r: { installment_id: string }) => r.installment_id === 'inst-1');
      expect(inst1).toEqual({
        collection_id: 'coll-1',
        installment_id: 'inst-1',
        penalty_id: null,
        penalty_paise: 0,
        interest_paise: 100000,
        principal_paise: 833333,
        total_paise: 933333,
      });
    });

    it('should emit a separate penalty row when penalty has both penaltyId and installmentId', () => {
      // After the H4 fix, penalty allocations are persisted on their own row
      // (carrying both installment_id and penalty_id) — not merged into the
      // interest/principal row for the same installment.
      const result: AllocationResult = {
        allocations: [
          { installmentId: 'inst-1', penaltyId: 'pen-1', component: 'penalty', amountPaise: 5000 },
          { installmentId: 'inst-1', component: 'interest', amountPaise: 100000 },
        ],
        totalPenaltyAllocated: 5000,
        totalInterestAllocated: 100000,
        totalPrincipalAllocated: 0,
        excessAmount: 0,
      };
      const records = callBuildAllocationRecords('coll-1', result);

      // One installment row (interest) + one penalty row (penalty)
      expect(records).toHaveLength(2);
      const instRow = records.find((r: { penalty_id: string | null }) => r.penalty_id === null);
      const penRow = records.find((r: { penalty_id: string | null }) => r.penalty_id === 'pen-1');
      expect(instRow).toBeDefined();
      expect(instRow!.installment_id).toBe('inst-1');
      expect(instRow!.interest_paise).toBe(100000);
      expect(instRow!.penalty_paise).toBe(0);
      expect(instRow!.total_paise).toBe(100000);
      expect(penRow).toBeDefined();
      expect(penRow!.installment_id).toBe('inst-1');
      expect(penRow!.penalty_paise).toBe(5000);
      expect(penRow!.total_paise).toBe(5000);
    });

    it('should skip penalty allocations missing installmentId (NOT NULL constraint)', () => {
      // collection_allocations.installment_id is NOT NULL in the schema, so a
      // penalty allocation that arrived without a known parent installment
      // (legacy/orphaned data) cannot be persisted. The penalties.paid_paise
      // bookkeeping still records the payment.
      const result: AllocationResult = {
        allocations: [
          { penaltyId: 'pen-1', component: 'penalty', amountPaise: 5000 } as AllocationLine,
          { installmentId: 'inst-1', component: 'interest', amountPaise: 100000 },
        ],
        totalPenaltyAllocated: 5000,
        totalInterestAllocated: 100000,
        totalPrincipalAllocated: 0,
        excessAmount: 0,
      };
      const records = callBuildAllocationRecords('coll-1', result);

      // One installment row (interest only). The orphaned penalty row is dropped.
      expect(records).toHaveLength(1);
      expect(records[0]!.penalty_paise).toBe(0);
      expect(records[0]!.interest_paise).toBe(100000);
    });

    it('should return empty array for empty allocations', () => {
      const result: AllocationResult = {
        allocations: [],
        totalPenaltyAllocated: 0,
        totalInterestAllocated: 0,
        totalPrincipalAllocated: 0,
        excessAmount: 0,
      };
      const records = callBuildAllocationRecords('coll-1', result);
      expect(records).toHaveLength(0);
    });
  });

  // ── 5.6 updateInstallments() ─────────────────────────────────────────────

  describe('updateInstallments()', () => {
     
    async function callUpdateInstallments(
      schedules: Array<{
        id: string;
        principal_paise: bigint;
        interest_paise: bigint;
        principal_paid_paise: bigint;
        interest_paid_paise: bigint;
        penalty_paid_paise: bigint;
      }>,
      allocationResult: AllocationResult,
    ) {
      return (service as any)['updateInstallments'](schedules, allocationResult, {});
    }

    it('should update installment to paid when fully paid', async () => {
      const schedules = [
        { id: 'inst-1', principal_paise: 500000n, interest_paise: 50000n, principal_paid_paise: 0n, interest_paid_paise: 0n, penalty_paid_paise: 0n },
      ];
      const result: AllocationResult = {
        allocations: [
          { installmentId: 'inst-1', component: 'interest', amountPaise: 50000 },
          { installmentId: 'inst-1', component: 'principal', amountPaise: 500000 },
        ],
        totalPenaltyAllocated: 0,
        totalInterestAllocated: 50000,
        totalPrincipalAllocated: 500000,
        excessAmount: 0,
      };

      await callUpdateInstallments(schedules, result);

      expect(repo.updateInstallment).toHaveBeenCalledWith(
        'inst-1',
        {
          principal_paid_paise: 500000,
          interest_paid_paise: 50000,
          penalty_paid_paise: 0,
          status: 'paid',
        },
        expect.anything(),
      );
    });

    it('should update installment to partial when partially paid', async () => {
      const schedules = [
        { id: 'inst-1', principal_paise: 500000n, interest_paise: 50000n, principal_paid_paise: 0n, interest_paid_paise: 0n, penalty_paid_paise: 0n },
      ];
      const result: AllocationResult = {
        allocations: [
          { installmentId: 'inst-1', component: 'interest', amountPaise: 50000 },
          { installmentId: 'inst-1', component: 'principal', amountPaise: 200000 },
        ],
        totalPenaltyAllocated: 0,
        totalInterestAllocated: 50000,
        totalPrincipalAllocated: 200000,
        excessAmount: 0,
      };

      await callUpdateInstallments(schedules, result);

      expect(repo.updateInstallment).toHaveBeenCalledWith(
        'inst-1',
        expect.objectContaining({ status: 'partial' }),
        expect.anything(),
      );
    });

    it('should accumulate with existing paid amounts', async () => {
      const schedules = [
        { id: 'inst-1', principal_paise: 500000n, interest_paise: 50000n, principal_paid_paise: 200000n, interest_paid_paise: 50000n, penalty_paid_paise: 0n },
      ];
      const result: AllocationResult = {
        allocations: [
          { installmentId: 'inst-1', component: 'principal', amountPaise: 300000 },
        ],
        totalPenaltyAllocated: 0,
        totalInterestAllocated: 0,
        totalPrincipalAllocated: 300000,
        excessAmount: 0,
      };

      await callUpdateInstallments(schedules, result);

      expect(repo.updateInstallment).toHaveBeenCalledWith(
        'inst-1',
        expect.objectContaining({
          principal_paid_paise: 500000, // 200000 + 300000
          interest_paid_paise: 50000,   // unchanged
          status: 'paid',
        }),
        expect.anything(),
      );
    });

    it('should not update installments with no allocations', async () => {
      const schedules = [
        { id: 'inst-1', principal_paise: 500000n, interest_paise: 50000n, principal_paid_paise: 0n, interest_paid_paise: 0n, penalty_paid_paise: 0n },
        { id: 'inst-2', principal_paise: 500000n, interest_paise: 50000n, principal_paid_paise: 0n, interest_paid_paise: 0n, penalty_paid_paise: 0n },
      ];
      const result: AllocationResult = {
        allocations: [
          { installmentId: 'inst-1', component: 'interest', amountPaise: 50000 },
        ],
        totalPenaltyAllocated: 0,
        totalInterestAllocated: 50000,
        totalPrincipalAllocated: 0,
        excessAmount: 0,
      };

      await callUpdateInstallments(schedules, result);

      // Only inst-1 should be updated
      expect(repo.updateInstallment).toHaveBeenCalledTimes(1);
      expect(repo.updateInstallment.mock.calls[0]![0]).toBe('inst-1');
    });

    it('should include penalty paid amounts', async () => {
      const schedules = [
        { id: 'inst-1', principal_paise: 500000n, interest_paise: 50000n, principal_paid_paise: 0n, interest_paid_paise: 0n, penalty_paid_paise: 0n },
      ];
      const result: AllocationResult = {
        allocations: [
          { installmentId: 'inst-1', component: 'penalty', amountPaise: 3000 },
          { installmentId: 'inst-1', component: 'interest', amountPaise: 50000 },
          { installmentId: 'inst-1', component: 'principal', amountPaise: 500000 },
        ],
        totalPenaltyAllocated: 3000,
        totalInterestAllocated: 50000,
        totalPrincipalAllocated: 500000,
        excessAmount: 0,
      };

      await callUpdateInstallments(schedules, result);

      expect(repo.updateInstallment).toHaveBeenCalledWith(
        'inst-1',
        expect.objectContaining({
          penalty_paid_paise: 3000,
          status: 'paid',
        }),
        expect.anything(),
      );
    });
  });

  // ── 5.7 computeDpdAndBucket() ────────────────────────────────────────────

  describe('computeDpdAndBucket()', () => {
     
    function callComputeDpd(
      schedules: Array<{
        id: string;
        due_date: Date;
        principal_paise: bigint;
        interest_paise: bigint;
        principal_paid_paise: bigint;
        interest_paid_paise: bigint;
      }>,
      allocationResult: AllocationResult,
      paymentDate: Date,
    ) {
      return (service as any)['computeDpdAndBucket'](schedules, allocationResult, paymentDate);
    }

    const emptyResult: AllocationResult = {
      allocations: [],
      totalPenaltyAllocated: 0,
      totalInterestAllocated: 0,
      totalPrincipalAllocated: 0,
      excessAmount: 0,
    };

    it('should return dpd=0 and bucket_0 when all installments are paid', () => {
      const schedules = [
        { id: 'inst-1', due_date: new Date('2024-01-15'), principal_paise: 500000n, interest_paise: 50000n, principal_paid_paise: 500000n, interest_paid_paise: 50000n },
      ];
      const { dpd, overdueBucket } = callComputeDpd(schedules, emptyResult, new Date('2024-02-15'));
      expect(dpd).toBe(0);
      expect(overdueBucket).toBe('bucket_0');
    });

    it('should compute correct DPD for unpaid installment', () => {
      const schedules = [
        { id: 'inst-1', due_date: new Date('2024-01-15'), principal_paise: 500000n, interest_paise: 50000n, principal_paid_paise: 0n, interest_paid_paise: 0n },
      ];
      // 31 days past due
      const { dpd, overdueBucket } = callComputeDpd(schedules, emptyResult, new Date('2024-02-15'));
      expect(dpd).toBe(31);
      expect(overdueBucket).toBe('bucket_31_60');
    });

    it('should use earliest unpaid installment for DPD', () => {
      const schedules = [
        { id: 'inst-1', due_date: new Date('2024-01-15'), principal_paise: 500000n, interest_paise: 50000n, principal_paid_paise: 500000n, interest_paid_paise: 50000n },
        { id: 'inst-2', due_date: new Date('2024-02-15'), principal_paise: 500000n, interest_paise: 50000n, principal_paid_paise: 0n, interest_paid_paise: 0n },
      ];
      // inst-1 paid, inst-2 unpaid, 15 days past due
      const { dpd, overdueBucket } = callComputeDpd(schedules, emptyResult, new Date('2024-03-01'));
      expect(dpd).toBe(15);
      expect(overdueBucket).toBe('bucket_1_30');
    });

    it('should classify bucket_0 for dpd=0', () => {
      const schedules = [
        { id: 'inst-1', due_date: new Date('2024-03-15'), principal_paise: 500000n, interest_paise: 50000n, principal_paid_paise: 0n, interest_paid_paise: 0n },
      ];
      // Due date is in the future
      const { dpd, overdueBucket } = callComputeDpd(schedules, emptyResult, new Date('2024-03-01'));
      expect(dpd).toBe(0);
      expect(overdueBucket).toBe('bucket_0');
    });

    it('should classify bucket_61_90 for dpd=75', () => {
      const schedules = [
        { id: 'inst-1', due_date: new Date('2024-01-01'), principal_paise: 500000n, interest_paise: 50000n, principal_paid_paise: 0n, interest_paid_paise: 0n },
      ];
      // 75 days past due
      const { dpd, overdueBucket } = callComputeDpd(schedules, emptyResult, new Date('2024-03-16'));
      expect(dpd).toBe(75);
      expect(overdueBucket).toBe('bucket_61_90');
    });

    it('should classify bucket_90_plus for dpd>90', () => {
      const schedules = [
        { id: 'inst-1', due_date: new Date('2024-01-01'), principal_paise: 500000n, interest_paise: 50000n, principal_paid_paise: 0n, interest_paid_paise: 0n },
      ];
      // 100 days past due
      const { dpd, overdueBucket } = callComputeDpd(schedules, emptyResult, new Date('2024-04-10'));
      expect(dpd).toBe(100);
      expect(overdueBucket).toBe('bucket_90_plus');
    });

    it('should account for allocations from current collection', () => {
      const schedules = [
        { id: 'inst-1', due_date: new Date('2024-01-15'), principal_paise: 500000n, interest_paise: 50000n, principal_paid_paise: 0n, interest_paid_paise: 0n },
      ];
      // This collection pays off inst-1 fully
      const result: AllocationResult = {
        allocations: [
          { installmentId: 'inst-1', component: 'interest', amountPaise: 50000 },
          { installmentId: 'inst-1', component: 'principal', amountPaise: 500000 },
        ],
        totalPenaltyAllocated: 0,
        totalInterestAllocated: 50000,
        totalPrincipalAllocated: 500000,
        excessAmount: 0,
      };
      const { dpd, overdueBucket } = callComputeDpd(schedules, result, new Date('2024-02-15'));
      expect(dpd).toBe(0);
      expect(overdueBucket).toBe('bucket_0');
    });
  });

  // ── 5.8 Rejection for non-active/non-overdue loans ──────────────────────

  describe('rejection for invalid loan status', () => {
    const dto = {
      loanId: 'loan-1',
      amountPaise: 100000,
      paymentDate: '2024-02-01',
      paymentMode: PaymentMode.CASH,
      idempotencyKey: 'idem-reject',
    };

    it('should reject collection on closed loan', async () => {
      repo.lockLoanForUpdate.mockResolvedValue({ id: 'loan-1', status: 'closed', cached_outstanding_paise: 0n });
      await expect(service.postCollection(dto, 'actor-1', 'manager')).rejects.toThrow(BusinessRuleError);
    });

    it('should reject collection on draft loan', async () => {
      repo.lockLoanForUpdate.mockResolvedValue({ id: 'loan-1', status: 'draft', cached_outstanding_paise: 0n });
      await expect(service.postCollection(dto, 'actor-1', 'manager')).rejects.toThrow(BusinessRuleError);
    });

    it('should reject collection on defaulted loan', async () => {
      repo.lockLoanForUpdate.mockResolvedValue({ id: 'loan-1', status: 'defaulted', cached_outstanding_paise: 0n });
      await expect(service.postCollection(dto, 'actor-1', 'manager')).rejects.toThrow(BusinessRuleError);
    });
  });

  // ── 5.9 Excess amount handling ──────────────────────────────────────────

  describe('excess amount handling', () => {
    const dto = {
      loanId: 'loan-1',
      amountPaise: 99999999, // Way more than outstanding
      paymentDate: '2024-02-01',
      paymentMode: PaymentMode.CASH,
      idempotencyKey: 'idem-excess',
    };

    it('should throw BusinessRuleError when amount exceeds outstanding', async () => {
      // Outstanding from 2 schedules: (833333+100000)*2 = 1866666
      // No penalties
      await expect(service.postCollection(dto, 'actor-1', 'manager')).rejects.toThrow(BusinessRuleError);
      try {
        await service.postCollection(dto, 'actor-1', 'manager');
      } catch (e: unknown) {
        expect((e as BusinessRuleError).code).toBe('COLLECTION_EXCEEDS_OUTSTANDING');
      }
    });
  });
});
