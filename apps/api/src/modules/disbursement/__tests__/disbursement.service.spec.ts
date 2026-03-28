import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DisbursementService } from '../disbursement.service';
import { BusinessRuleError, NotFoundError } from '../../../common/errors';
import { PaymentMode } from '@as-finance/shared';

/**
 * Unit tests for DisbursementService.
 *
 * Tests prerequisite verification, idempotency, processing fee calculation,
 * and atomic transaction orchestration.
 */

// ── Mock factories ───────────────────────────────────────────────────────────

function createMockLoan(overrides: Record<string, unknown> = {}) {
  return {
    id: 'loan-1',
    loan_number: 'LN-2024-00001',
    customer_id: 'cust-1',
    principal_paise: 10000000n, // ₹1,00,000
    tenure_months: 12,
    status: 'approved',
    total_payable_paise: 11200000n,
    created_by: 'user-creator',
    product_version: {
      id: 'pv-1',
      interest_type: 'flat',
      annual_rate_bps: 1200,
      repayment_frequency: 'monthly',
      processing_fee_type: null as string | null,
      processing_fee_value: null as number | null,
      product: { id: 'prod-1', name: 'Test Product' },
    },
    customer: { id: 'cust-1', full_name: 'Test Customer', mobile: '9876543210' },
    schedules: [
      { id: 's-1', installment_number: 1, due_date: new Date('2024-02-01'), principal_paise: 833333n, interest_paise: 100000n, total_paise: 933333n },
      { id: 's-12', installment_number: 12, due_date: new Date('2025-01-01'), principal_paise: 833337n, interest_paise: 100000n, total_paise: 933337n },
    ],
    ...overrides,
  };
}

function createMockRepo() {
  return {
    getLoanForDisbursement: vi.fn(),
    hasSchedule: vi.fn().mockResolvedValue(true),
    hasKycDocuments: vi.fn().mockResolvedValue(true),
    isAlreadyDisbursed: vi.fn().mockResolvedValue(false),
    findAccountByCode: vi.fn(),
    create: vi.fn(),
    updateLoanStatus: vi.fn(),
    createStatusHistory: vi.fn(),
    updateLoanForDisbursement: vi.fn(),
    enqueueOutboxMessage: vi.fn(),
    findByLoanId: vi.fn(),
    findById: vi.fn(),
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

function createMockLoanService() {
  return {
    validateTransition: vi.fn(),
  };
}

function createMockPrisma() {
  return {
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('DisbursementService', () => {
  let service: DisbursementService;
  let repo: ReturnType<typeof createMockRepo>;
  let accountingService: ReturnType<typeof createMockAccountingService>;
  let auditService: ReturnType<typeof createMockAuditService>;
  let idempotencyService: ReturnType<typeof createMockIdempotencyService>;
  let loanService: ReturnType<typeof createMockLoanService>;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    repo = createMockRepo();
    accountingService = createMockAccountingService();
    auditService = createMockAuditService();
    idempotencyService = createMockIdempotencyService();
    loanService = createMockLoanService();
    prisma = createMockPrisma();

    const mockLoan = createMockLoan();
    repo.getLoanForDisbursement.mockResolvedValue(mockLoan);
    repo.findAccountByCode.mockImplementation((code: string) => {
      const accounts: Record<string, { id: string; code: string; name: string; category: string }> = {
        '1001': { id: 'acc-cash', code: '1001', name: 'Cash', category: 'asset' },
        '1002': { id: 'acc-bank', code: '1002', name: 'Bank', category: 'asset' },
        '1100': { id: 'acc-lr', code: '1100', name: 'Loans Receivable', category: 'asset' },
        '4002': { id: 'acc-pfi', code: '4002', name: 'Processing Fee Income', category: 'income' },
      };
      return Promise.resolve(accounts[code] ?? null);
    });
    repo.create.mockResolvedValue({ id: 'disb-1' });

    service = new DisbursementService(
      prisma as never,
      repo as never,
      accountingService as never,
      auditService as never,
      idempotencyService as never,
      loanService as never,
    );
  });

  describe('verifyPrerequisites', () => {
    it('should pass when all prerequisites are met', async () => {
      const result = await service.verifyPrerequisites('loan-1');
      expect(result.valid).toBe(true);
    });

    it('should throw NotFoundError when loan does not exist', async () => {
      repo.getLoanForDisbursement.mockResolvedValue(null);
      await expect(service.verifyPrerequisites('nonexistent')).rejects.toThrow(NotFoundError);
    });

    it('should throw BusinessRuleError when loan is not approved', async () => {
      repo.getLoanForDisbursement.mockResolvedValue(createMockLoan({ status: 'draft' }));
      await expect(service.verifyPrerequisites('loan-1')).rejects.toThrow(BusinessRuleError);
    });

    it('should throw BusinessRuleError when schedule is not generated', async () => {
      repo.hasSchedule.mockResolvedValue(false);
      await expect(service.verifyPrerequisites('loan-1')).rejects.toThrow(BusinessRuleError);
    });

    it('should throw BusinessRuleError when KYC docs are missing', async () => {
      repo.hasKycDocuments.mockResolvedValue(false);
      await expect(service.verifyPrerequisites('loan-1')).rejects.toThrow(BusinessRuleError);
    });

    it('should throw BusinessRuleError when already disbursed', async () => {
      repo.isAlreadyDisbursed.mockResolvedValue(true);
      await expect(service.verifyPrerequisites('loan-1')).rejects.toThrow(BusinessRuleError);
    });
  });

  describe('disburse', () => {
    const dto = {
      loanId: 'loan-1',
      mode: PaymentMode.CASH,
      idempotencyKey: 'idem-key-1',
    };

    it('should return cached result for duplicate idempotency key', async () => {
      const cachedResult = { resultStatus: 201, resultBody: { disbursementId: 'disb-cached' } };
      idempotencyService.find.mockResolvedValue(cachedResult);

      const result = await service.disburse(dto, 'actor-1', 'manager');
      expect(result.statusCode).toBe(201);
      expect(result.data).toEqual(cachedResult.resultBody);
      // Should not have called the transaction
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should create disbursement record within transaction', async () => {
      const result = await service.disburse(dto, 'actor-1', 'manager');
      expect(result.statusCode).toBe(201);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(repo.create).toHaveBeenCalled();
    });

    it('should create journal entry with DR Loans Receivable, CR Cash for cash mode', async () => {
      await service.disburse(dto, 'actor-1', 'manager');

      const jeCall = accountingService.createJournalEntry.mock.calls[0]!;
      const jeDto = jeCall[0];
      expect(jeDto.sourceType).toBe('disbursement');
      expect(jeDto.lines).toHaveLength(2);
      // DR Loans Receivable
      expect(jeDto.lines[0].accountId).toBe('acc-lr');
      expect(jeDto.lines[0].debitPaise).toBe(10000000);
      // CR Cash
      expect(jeDto.lines[1].accountId).toBe('acc-cash');
      expect(jeDto.lines[1].creditPaise).toBe(10000000);
    });

    it('should use Bank account for bank_transfer mode', async () => {
      const bankDto = { ...dto, mode: PaymentMode.BANK_TRANSFER };
      await service.disburse(bankDto, 'actor-1', 'manager');

      const jeCall = accountingService.createJournalEntry.mock.calls[0]!;
      const jeDto = jeCall[0];
      // CR Bank
      expect(jeDto.lines[1].accountId).toBe('acc-bank');
    });

    it('should transition loan status approved → disbursed → active', async () => {
      await service.disburse(dto, 'actor-1', 'manager');

      // Two status updates: approved→disbursed, disbursed→active
      expect(repo.updateLoanStatus).toHaveBeenCalledTimes(2);
      expect(repo.updateLoanStatus.mock.calls[0]![1]).toBe('disbursed');
      expect(repo.updateLoanStatus.mock.calls[1]![1]).toBe('active');

      // Two status history entries
      expect(repo.createStatusHistory).toHaveBeenCalledTimes(2);
    });

    it('should create audit log entry', async () => {
      await service.disburse(dto, 'actor-1', 'manager');
      expect(auditService.createAuditLog).toHaveBeenCalledTimes(1);
      const auditCall = auditService.createAuditLog.mock.calls[0]![0];
      expect(auditCall.action_type).toBe('loan_disbursed');
      expect(auditCall.target_entity).toBe('loan');
    });

    it('should enqueue SMS notification', async () => {
      await service.disburse(dto, 'actor-1', 'manager');
      expect(repo.enqueueOutboxMessage).toHaveBeenCalledTimes(1);
      const smsCall = repo.enqueueOutboxMessage.mock.calls[0]![0];
      expect(smsCall.event_type).toBe('disbursed');
      expect(smsCall.recipient_mobile).toBe('9876543210');
    });

    it('should store idempotency result', async () => {
      await service.disburse(dto, 'actor-1', 'manager');
      expect(idempotencyService.store).toHaveBeenCalledTimes(1);
      expect(idempotencyService.store.mock.calls[0]![0]).toBe('idem-key-1');
      expect(idempotencyService.store.mock.calls[0]![1]).toBe('disbursement');
      expect(idempotencyService.store.mock.calls[0]![2]).toBe(201);
    });

    it('should set loan dates and cached outstanding', async () => {
      await service.disburse(dto, 'actor-1', 'manager');
      expect(repo.updateLoanForDisbursement).toHaveBeenCalledTimes(1);
      const updateCall = repo.updateLoanForDisbursement.mock.calls[0]![1];
      expect(updateCall.cached_outstanding_paise).toBe(11200000n);
      expect(updateCall.first_due_date).toEqual(new Date('2024-02-01'));
      expect(updateCall.last_due_date).toEqual(new Date('2025-01-01'));
    });
  });

  describe('processing fee', () => {
    const dto = {
      loanId: 'loan-1',
      mode: PaymentMode.CASH,
      idempotencyKey: 'idem-key-2',
    };

    it('should create processing fee journal entry for fixed fee', async () => {
      const loanWithFee = createMockLoan({
        product_version: {
          id: 'pv-1',
          interest_type: 'flat',
          annual_rate_bps: 1200,
          repayment_frequency: 'monthly',
          processing_fee_type: 'fixed',
          processing_fee_value: 50000, // ₹500 in paise
          product: { id: 'prod-1', name: 'Test Product' },
        },
      });
      repo.getLoanForDisbursement.mockResolvedValue(loanWithFee);

      await service.disburse(dto, 'actor-1', 'manager');

      // Two journal entries: disbursement + processing fee
      expect(accountingService.createJournalEntry).toHaveBeenCalledTimes(2);
      const feeJe = accountingService.createJournalEntry.mock.calls[1]![0];
      expect(feeJe.sourceType).toBe('processing_fee');
      // DR Cash, CR Processing Fee Income
      expect(feeJe.lines[0].debitPaise).toBe(50000);
      expect(feeJe.lines[1].creditPaise).toBe(50000);
      expect(feeJe.lines[1].accountId).toBe('acc-pfi');
    });

    it('should calculate percentage-based processing fee correctly', async () => {
      const loanWithFee = createMockLoan({
        product_version: {
          id: 'pv-1',
          interest_type: 'flat',
          annual_rate_bps: 1200,
          repayment_frequency: 'monthly',
          processing_fee_type: 'percentage',
          processing_fee_value: 200, // 2% in bps
          product: { id: 'prod-1', name: 'Test Product' },
        },
      });
      repo.getLoanForDisbursement.mockResolvedValue(loanWithFee);

      await service.disburse(dto, 'actor-1', 'manager');

      // 2% of 10000000 paise = 200000 paise
      const feeJe = accountingService.createJournalEntry.mock.calls[1]![0];
      expect(feeJe.lines[0].debitPaise).toBe(200000);
      expect(feeJe.lines[1].creditPaise).toBe(200000);
    });

    it('should not create processing fee entry when no fee configured', async () => {
      await service.disburse(dto, 'actor-1', 'manager');
      // Only one journal entry (disbursement, no processing fee)
      expect(accountingService.createJournalEntry).toHaveBeenCalledTimes(1);
    });
  });
});
