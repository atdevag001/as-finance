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
    version: 1,
    total_payable_paise: 11200000n,
    created_by: 'user-creator',
    approved_by: 'user-approver',
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
    // Sprint 2: lockLoanForUpdate is now the first call in executeDisbursement.
    // Return a locked row shape compatible with the service's expectations.
    lockLoanForUpdate: vi.fn().mockResolvedValue({
      id: 'loan-1',
      status: 'approved',
      cached_outstanding_paise: null,
    }),
    findAccountByCode: vi.fn(),
    create: vi.fn(),
    updateLoanStatus: vi.fn(),
    updateLoanStatusWithVersion: vi.fn(),
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

    const settingsService = { getHolidays: vi.fn().mockResolvedValue([]) };
    service = new DisbursementService(
      prisma as never,
      repo as never,
      accountingService as never,
      auditService as never,
      idempotencyService as never,
      loanService as never,
      settingsService as never,
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

      // C6: Three status writes consolidated into ONE final transition.
      // We persist both edges of the state machine in loan_status_history
      // for audit traceability, but only write the row once (approved →
      // active) via updateLoanStatusWithVersion — no intermediate
      // 'disbursed' row ever lands in the loans table.
      expect(repo.updateLoanStatus).not.toHaveBeenCalled();
      expect(repo.updateLoanStatusWithVersion).toHaveBeenCalledTimes(1);
      const statusCall = repo.updateLoanStatusWithVersion.mock.calls[0]!;
      expect(statusCall[1]).toBe('active');
      // Version is passed for optimistic-lock check
      expect(statusCall[2]).toBe(1);

      // Two status history entries (audit trail for both edges)
      expect(repo.createStatusHistory).toHaveBeenCalledTimes(2);
      expect(repo.createStatusHistory.mock.calls[0]![0].to_status).toBe('disbursed');
      expect(repo.createStatusHistory.mock.calls[1]![0].to_status).toBe('active');
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

    it('should create disbursement record with amount matching loan principal (Req 14.7)', async () => {
      await service.disburse(dto, 'actor-1', 'manager');
      const createCall = repo.create.mock.calls[0]![0];
      expect(createCall.amount_paise).toBe(10000000n); // matches loan.principal_paise
      expect(createCall.loan_id).toBe('loan-1');
      expect(createCall.mode).toBe(PaymentMode.CASH);
      expect(createCall.idempotency_key).toBe('idem-key-1');
    });

    it('should return result body with correct disbursement fields (net disbursement)', async () => {
      const result = await service.disburse(dto, 'actor-1', 'manager');
      expect(result.statusCode).toBe(201);
      const data = result.data as Record<string, unknown>;
      expect(data).toMatchObject({
        disbursementId: 'disb-1',
        loanId: 'loan-1',
        loanNumber: 'LN-2024-00001',
        grossAmountPaise: '10000000',
        netAmountPaise: '10000000', // Same as gross when no processing fee
        processingFeePaise: '0',
        mode: PaymentMode.CASH,
        journalEntryId: 'je-1',
      });
      expect(data['disbursedAt']).toBeDefined();
    });

    it('should reject disbursement for non-approved loan via disburse() (Req 14.2)', async () => {
      repo.getLoanForDisbursement.mockResolvedValue(createMockLoan({ status: 'draft' }));
      await expect(service.disburse(dto, 'actor-1', 'manager')).rejects.toThrow(BusinessRuleError);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should reject disbursement when no schedule exists via disburse() (Req 14.3)', async () => {
      repo.hasSchedule.mockResolvedValue(false);
      await expect(service.disburse(dto, 'actor-1', 'manager')).rejects.toThrow(BusinessRuleError);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should reject disbursement when loan is already disbursed', async () => {
      repo.isAlreadyDisbursed.mockResolvedValue(true);
      await expect(service.disburse(dto, 'actor-1', 'manager')).rejects.toThrow(BusinessRuleError);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should throw NotFoundError when loan does not exist via disburse()', async () => {
      repo.getLoanForDisbursement.mockResolvedValue(null);
      await expect(service.disburse(dto, 'actor-1', 'manager')).rejects.toThrow(NotFoundError);
    });

    it('should throw BusinessRuleError when chart of accounts not configured', async () => {
      repo.findAccountByCode.mockResolvedValue(null);
      await expect(service.disburse(dto, 'actor-1', 'manager')).rejects.toThrow(BusinessRuleError);
    });

    it('should validate loan transition within transaction', async () => {
      await service.disburse(dto, 'actor-1', 'manager');
      expect(loanService.validateTransition).toHaveBeenCalledWith('approved', 'disbursed');
    });

    it('should use total_payable_paise for cached outstanding when available', async () => {
      await service.disburse(dto, 'actor-1', 'manager');
      const updateCall = repo.updateLoanForDisbursement.mock.calls[0]![1];
      // total_payable_paise (11200000n) is used, not principal_paise (10000000n)
      expect(updateCall.cached_outstanding_paise).toBe(11200000n);
    });

    it('should fall back to principal_paise when total_payable_paise is null', async () => {
      repo.getLoanForDisbursement.mockResolvedValue(
        createMockLoan({ total_payable_paise: null }),
      );
      await service.disburse(dto, 'actor-1', 'manager');
      const updateCall = repo.updateLoanForDisbursement.mock.calls[0]![1];
      expect(updateCall.cached_outstanding_paise).toBe(10000000n);
    });

    it('should handle loan with empty schedules gracefully', async () => {
      repo.getLoanForDisbursement.mockResolvedValue(
        createMockLoan({ schedules: [] }),
      );
      await service.disburse(dto, 'actor-1', 'manager');
      const updateCall = repo.updateLoanForDisbursement.mock.calls[0]![1];
      // When no schedules, dates fall back to disbursement date
      expect(updateCall.first_due_date).toBeInstanceOf(Date);
      expect(updateCall.last_due_date).toBeInstanceOf(Date);
    });
  });

  describe('processing fee', () => {
    const dto = {
      loanId: 'loan-1',
      mode: PaymentMode.CASH,
      idempotencyKey: 'idem-key-2',
    };

    it('should include processing fee in single journal entry for fixed fee (net disbursement)', async () => {
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

      // Single journal entry with 3 lines (net disbursement approach)
      expect(accountingService.createJournalEntry).toHaveBeenCalledTimes(1);
      const je = accountingService.createJournalEntry.mock.calls[0]![0];
      expect(je.sourceType).toBe('disbursement');
      expect(je.lines).toHaveLength(3);
      // DR Loans Receivable (full principal)
      expect(je.lines[0].debitPaise).toBe(10000000);
      // CR Cash (net = principal - fee = 10000000 - 50000)
      expect(je.lines[1].creditPaise).toBe(9950000);
      // CR Processing Fee Income
      expect(je.lines[2].creditPaise).toBe(50000);
      expect(je.lines[2].accountId).toBe('acc-pfi');
    });

    it('should calculate percentage-based processing fee correctly (net disbursement)', async () => {
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

      // Single journal entry with net disbursement
      expect(accountingService.createJournalEntry).toHaveBeenCalledTimes(1);
      const je = accountingService.createJournalEntry.mock.calls[0]![0];
      // 2% of 10000000 paise = 200000 paise fee
      // Net disbursement = 10000000 - 200000 = 9800000
      expect(je.lines[0].debitPaise).toBe(10000000); // DR Loans Receivable
      expect(je.lines[1].creditPaise).toBe(9800000); // CR Cash (net)
      expect(je.lines[2].creditPaise).toBe(200000);  // CR Fee Income
    });

    it('should create 2-line journal entry when no fee configured', async () => {
      await service.disburse(dto, 'actor-1', 'manager');
      // Single journal entry with 2 lines (no processing fee)
      expect(accountingService.createJournalEntry).toHaveBeenCalledTimes(1);
      const je = accountingService.createJournalEntry.mock.calls[0]![0];
      expect(je.lines).toHaveLength(2);
      // DR Loans Receivable = CR Cash (full principal, no fee deduction)
      expect(je.lines[0].debitPaise).toBe(10000000);
      expect(je.lines[1].creditPaise).toBe(10000000);
    });
  });

  /**
   * Dedicated unit tests for the private calculateProcessingFee() pure function.
   * Validates: Requirements 66.1, 66.2, 66.3, 66.4, 66.5, 66.6
   */
  describe('calculateProcessingFee()', () => {
    // Helper to call the private method directly
     
    function calcFee(principalPaise: bigint, feeType: string, feeValue: number): bigint {
      return (service as any)['calculateProcessingFee'](principalPaise, feeType, feeValue);
    }

    // 66.1 — fixed fee type returns feeValue directly as BigInt
    describe('fixed fee type', () => {
      it('should return feeValue as BigInt for fixed type', () => {
        expect(calcFee(10_000_00n, 'fixed', 50000)).toBe(50000n);
      });

      it('should return feeValue regardless of principal for fixed type', () => {
        expect(calcFee(0n, 'fixed', 25000)).toBe(25000n);
        expect(calcFee(1_000_000_000_00n, 'fixed', 25000)).toBe(25000n);
      });
    });

    // 66.2 — percentage fee type (bps) with ROUND_HALF_UP
    describe('percentage fee type', () => {
      it('should calculate 2% (200 bps) of principal correctly', () => {
        // 200 bps of 10,000,00 paise = 10,000,00 * 200 / 10000 = 20,000
        expect(calcFee(10_000_00n, 'percentage', 200)).toBe(20000n);
      });

      it('should calculate 1.5% (150 bps) of principal correctly', () => {
        // 150 bps of 10,000,00 paise = 10,000,00 * 150 / 10000 = 15,000
        expect(calcFee(10_000_00n, 'percentage', 150)).toBe(15000n);
      });

      it('should calculate 100% (10000 bps) of principal', () => {
        expect(calcFee(50000n, 'percentage', 10000)).toBe(50000n);
      });
    });

    // 66.3 — zero principal returns zero fee for both types
    describe('zero principal', () => {
      it('should return 0n for percentage type with zero principal', () => {
        expect(calcFee(0n, 'percentage', 200)).toBe(0n);
      });

      it('should return feeValue for fixed type with zero principal', () => {
        // Fixed fee is independent of principal
        expect(calcFee(0n, 'fixed', 50000)).toBe(50000n);
      });
    });

    // 66.4 — zero feeValue returns zero fee for percentage type
    describe('zero feeValue', () => {
      it('should return 0n for percentage type with zero feeValue', () => {
        expect(calcFee(10_000_00n, 'percentage', 0)).toBe(0n);
      });

      it('should return 0n for fixed type with zero feeValue', () => {
        expect(calcFee(10_000_00n, 'fixed', 0)).toBe(0n);
      });
    });

    // 66.5 — fractional paise rounding with ROUND_HALF_UP
    describe('fractional paise rounding', () => {
      it('should round up at 0.5 (ROUND_HALF_UP) for 150 bps on 100001 paise', () => {
        // 100001 * 150 / 10000 = 1500.015 → rounds to 1500
        expect(calcFee(100001n, 'percentage', 150)).toBe(1500n);
      });

      it('should round 0.5 up (ROUND_HALF_UP)', () => {
        // Need a case where result is exactly X.5
        // principal * bps / 10000 = X.5
        // 10005 * 100 / 10000 = 100.05 → 100
        // 50 * 100 / 10000 = 0.5 → rounds to 1 (ROUND_HALF_UP)
        expect(calcFee(50n, 'percentage', 100)).toBe(1n);
      });

      it('should round down below 0.5', () => {
        // 30 * 100 / 10000 = 0.3 → rounds to 0
        expect(calcFee(30n, 'percentage', 100)).toBe(0n);
      });

      it('should handle large principal with fractional result', () => {
        // 999_999_999n * 150 / 10000 = 14999999.985 → 15000000
        expect(calcFee(999_999_999n, 'percentage', 150)).toBe(15000000n);
      });
    });

    // 66.6 — unrecognized fee_type returns 0n
    describe('unrecognized fee_type', () => {
      it('should return 0n for unknown fee type', () => {
        expect(calcFee(10_000_00n, 'unknown', 500)).toBe(0n);
      });

      it('should return 0n for empty string fee type', () => {
        expect(calcFee(10_000_00n, '', 500)).toBe(0n);
      });

      it('should return 0n for arbitrary string fee type', () => {
        expect(calcFee(10_000_00n, 'flat_rate', 500)).toBe(0n);
      });
    });
  });

  describe('maker-checker enforcement', () => {
    const dto = {
      loanId: 'loan-1',
      mode: PaymentMode.CASH,
      idempotencyKey: 'idem-key-mc',
    };

    it('should reject disbursement when disbursing user is the same as approver (manager role)', async () => {
      repo.getLoanForDisbursement.mockResolvedValue(
        createMockLoan({ approved_by: 'user-approver' }),
      );

      await expect(
        service.disburse(dto, 'user-approver', 'manager'),
      ).rejects.toThrow(BusinessRuleError);

      try {
        await service.disburse(dto, 'user-approver', 'manager');
      } catch (err) {
        expect((err as BusinessRuleError).code).toBe('MAKER_CHECKER_VIOLATION');
      }
    });

    it('should allow super_admin to disburse their own approved loan (bypass maker-checker)', async () => {
      repo.getLoanForDisbursement.mockResolvedValue(
        createMockLoan({ approved_by: 'admin-user' }),
      );

      const result = await service.disburse(dto, 'admin-user', 'super_admin');
      expect(result.statusCode).toBe(201);
    });

    it('should allow different user to disburse regardless of role', async () => {
      repo.getLoanForDisbursement.mockResolvedValue(
        createMockLoan({ approved_by: 'user-approver' }),
      );

      const result = await service.disburse(dto, 'different-user', 'manager');
      expect(result.statusCode).toBe(201);
    });

    it('should reject disbursement for field_officer disbursing their own approval', async () => {
      repo.getLoanForDisbursement.mockResolvedValue(
        createMockLoan({ approved_by: 'field-officer-1' }),
      );

      await expect(
        service.disburse(dto, 'field-officer-1', 'field_officer'),
      ).rejects.toThrow(BusinessRuleError);
    });
  });
});
