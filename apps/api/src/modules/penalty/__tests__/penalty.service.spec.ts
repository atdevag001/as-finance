import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PenaltyService,
  calculateDpd,
  classifyOverdueBucket,
  calculatePenaltyAmount,
} from '../penalty.service';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../../common/errors';

/**
 * Unit tests for PenaltyService.
 *
 * Tests calculateDpd(), classifyOverdueBucket(), calculatePenaltyAmount(),
 * calculateAndPost(), waivePenalty(), handleStatusTransition(), getLoanDpdInfo(),
 * findById(), findByLoanId().
 *
 * Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9
 */

// ─── Pure Function Tests ─────────────────────────────────────────────────────

describe('calculateDpd', () => {
  it('returns 0 when all installments are fully paid', () => {
    const schedules = [
      {
        due_date: new Date('2024-01-01'),
        principal_paise: 10000n,
        interest_paise: 1000n,
        principal_paid_paise: 10000n,
        interest_paid_paise: 1000n,
      },
    ];
    expect(calculateDpd(schedules, new Date('2024-02-01'))).toBe(0);
  });

  it('returns correct DPD for a single unpaid installment', () => {
    const schedules = [
      {
        due_date: new Date('2024-01-15'),
        principal_paise: 10000n,
        interest_paise: 1000n,
        principal_paid_paise: 0n,
        interest_paid_paise: 0n,
      },
    ];
    // 17 days past due (Jan 15 → Feb 1)
    expect(calculateDpd(schedules, new Date('2024-02-01'))).toBe(17);
  });

  it('returns DPD based on earliest unpaid installment', () => {
    const schedules = [
      {
        due_date: new Date('2024-01-01'),
        principal_paise: 10000n,
        interest_paise: 1000n,
        principal_paid_paise: 10000n,
        interest_paid_paise: 1000n,
      },
      {
        due_date: new Date('2024-02-01'),
        principal_paise: 10000n,
        interest_paise: 1000n,
        principal_paid_paise: 0n,
        interest_paid_paise: 0n,
      },
      {
        due_date: new Date('2024-03-01'),
        principal_paise: 10000n,
        interest_paise: 1000n,
        principal_paid_paise: 0n,
        interest_paid_paise: 0n,
      },
    ];
    // Feb 1 → Mar 15 = 43 days
    expect(calculateDpd(schedules, new Date('2024-03-15'))).toBe(43);
  });

  it('returns 0 when reference date is before due date', () => {
    const schedules = [
      {
        due_date: new Date('2024-03-01'),
        principal_paise: 10000n,
        interest_paise: 1000n,
        principal_paid_paise: 0n,
        interest_paid_paise: 0n,
      },
    ];
    expect(calculateDpd(schedules, new Date('2024-02-15'))).toBe(0);
  });

  it('returns 0 for empty schedules', () => {
    expect(calculateDpd([], new Date('2024-01-01'))).toBe(0);
  });

  it('counts partially paid installment as unpaid', () => {
    const schedules = [
      {
        due_date: new Date('2024-01-01'),
        principal_paise: 10000n,
        interest_paise: 1000n,
        principal_paid_paise: 5000n,
        interest_paid_paise: 1000n,
      },
    ];
    // 31 days past due
    expect(calculateDpd(schedules, new Date('2024-02-01'))).toBe(31);
  });

  it('works with number types (not just bigint)', () => {
    const schedules = [
      {
        due_date: new Date('2024-01-10'),
        principal_paise: 10000,
        interest_paise: 1000,
        principal_paid_paise: 0,
        interest_paid_paise: 0,
      },
    ];
    // Jan 10 → Jan 20 = 10 days
    expect(calculateDpd(schedules, new Date('2024-01-20'))).toBe(10);
  });

  it('returns 0 on the exact due date', () => {
    const schedules = [
      {
        due_date: new Date('2024-01-15'),
        principal_paise: 10000n,
        interest_paise: 1000n,
        principal_paid_paise: 0n,
        interest_paid_paise: 0n,
      },
    ];
    expect(calculateDpd(schedules, new Date('2024-01-15'))).toBe(0);
  });

  it('counts interest-only partial payment as unpaid', () => {
    const schedules = [
      {
        due_date: new Date('2024-01-01'),
        principal_paise: 10000n,
        interest_paise: 1000n,
        principal_paid_paise: 10000n,
        interest_paid_paise: 500n,
      },
    ];
    expect(calculateDpd(schedules, new Date('2024-02-01'))).toBe(31);
  });
});

describe('classifyOverdueBucket', () => {
  it('classifies DPD 0 as bucket_0', () => {
    expect(classifyOverdueBucket(0)).toBe('bucket_0');
  });

  it('classifies DPD 1 as bucket_1_30', () => {
    expect(classifyOverdueBucket(1)).toBe('bucket_1_30');
  });

  it('classifies DPD 30 as bucket_1_30', () => {
    expect(classifyOverdueBucket(30)).toBe('bucket_1_30');
  });

  it('classifies DPD 31 as bucket_31_60', () => {
    expect(classifyOverdueBucket(31)).toBe('bucket_31_60');
  });

  it('classifies DPD 60 as bucket_31_60', () => {
    expect(classifyOverdueBucket(60)).toBe('bucket_31_60');
  });

  it('classifies DPD 61 as bucket_61_90', () => {
    expect(classifyOverdueBucket(61)).toBe('bucket_61_90');
  });

  it('classifies DPD 90 as bucket_61_90', () => {
    expect(classifyOverdueBucket(90)).toBe('bucket_61_90');
  });

  it('classifies DPD 91 as bucket_90_plus', () => {
    expect(classifyOverdueBucket(91)).toBe('bucket_90_plus');
  });

  it('classifies DPD 365 as bucket_90_plus', () => {
    expect(classifyOverdueBucket(365)).toBe('bucket_90_plus');
  });

  it('classifies negative DPD as bucket_0', () => {
    expect(classifyOverdueBucket(-5)).toBe('bucket_0');
  });
});

describe('calculatePenaltyAmount', () => {
  it('returns flat amount for flat_per_period', () => {
    expect(calculatePenaltyAmount('flat_per_period', 500, 100000)).toBe(500);
  });

  it('calculates percentage of overdue for percentage_of_overdue', () => {
    // 200 bps = 2%, overdue = 100000 paise → penalty = 2000 paise
    expect(calculatePenaltyAmount('percentage_of_overdue', 200, 100000)).toBe(2000);
  });

  it('rounds HALF_UP for percentage calculation', () => {
    // 150 bps = 1.5%, overdue = 333 paise → 333 * 150 / 10000 = 4.995 → rounds to 5
    expect(calculatePenaltyAmount('percentage_of_overdue', 150, 333)).toBe(5);
  });

  it('returns 0 for unknown penalty type', () => {
    expect(calculatePenaltyAmount('unknown', 500, 100000)).toBe(0);
  });

  it('handles zero overdue amount for percentage', () => {
    expect(calculatePenaltyAmount('percentage_of_overdue', 200, 0)).toBe(0);
  });

  it('flat penalty ignores overdue amount', () => {
    // Flat penalty is always the penaltyValue regardless of overdue amount
    expect(calculatePenaltyAmount('flat_per_period', 1000, 0)).toBe(1000);
    expect(calculatePenaltyAmount('flat_per_period', 1000, 999999)).toBe(1000);
  });

  it('handles large overdue amounts for percentage', () => {
    // 100 bps = 1%, overdue = 10,000,000 paise → 100,000
    expect(calculatePenaltyAmount('percentage_of_overdue', 100, 10_000_000)).toBe(100_000);
  });

  it('rounds 0.5 up for percentage (HALF_UP)', () => {
    // 100 bps = 1%, overdue = 50 paise → 50 * 100 / 10000 = 0.5 → rounds to 1
    expect(calculatePenaltyAmount('percentage_of_overdue', 100, 50)).toBe(1);
  });
});

// ─── PenaltyService Tests (mocked dependencies) ─────────────────────────────

function createMockPenaltyRepo() {
  return {
    lockLoanForUpdate: vi.fn(),
    getLoanForPenalty: vi.fn(),
    getLoanById: vi.fn(),
    penaltyExists: vi.fn(),
    createPenalty: vi.fn(),
    findAccountByCode: vi.fn(),
    updateLoanOutstanding: vi.fn(),
    updateLoanStatus: vi.fn(),
    createStatusHistory: vi.fn(),
    findById: vi.fn(),
    findByIdTx: vi.fn(),
    findByLoanId: vi.fn(),
    waivePenalty: vi.fn(),
    getPendingPenalties: vi.fn(),
  };
}

function createMockAccountingService() {
  return { createJournalEntry: vi.fn() };
}

function createMockAuditService() {
  return { createAuditLog: vi.fn() };
}

function createMockLoanService() {
  return { validateTransition: vi.fn() };
}


describe('PenaltyService', () => {
  let service: PenaltyService;
  let mockPrisma: { $transaction: ReturnType<typeof vi.fn> };
  let mockPenaltyRepo: ReturnType<typeof createMockPenaltyRepo>;
  let mockAccountingService: ReturnType<typeof createMockAccountingService>;
  let mockAuditService: ReturnType<typeof createMockAuditService>;
  let mockLoanService: ReturnType<typeof createMockLoanService>;

  const baseLoan = {
    id: 'loan-1',
    loan_number: 'LN-2024-00001',
    customer_id: 'cust-1',
    principal_paise: 1000000n,
    status: 'active',
    total_payable_paise: 1100000n,
    cached_outstanding_paise: 500000n,
    dpd: 0,
    overdue_bucket: 'bucket_0',
    product_version: {
      id: 'pv-1',
      penalty_grace_days: 7,
      penalty_type: 'flat_per_period',
      penalty_value: 500,
      penalty_frequency: 'monthly',
    },
    schedules: [
      {
        id: 'inst-1',
        installment_number: 1,
        due_date: new Date('2024-01-01'),
        principal_paise: 100000n,
        interest_paise: 10000n,
        total_paise: 110000n,
        principal_paid_paise: 0n,
        interest_paid_paise: 0n,
        penalty_paid_paise: 0n,
        status: 'overdue',
      },
    ],
  };

  beforeEach(() => {
    mockPrisma = {
      $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({})),
    };

    mockPenaltyRepo = createMockPenaltyRepo();
    mockPenaltyRepo.lockLoanForUpdate.mockResolvedValue({
      id: 'loan-1',
      status: 'active',
      cached_outstanding_paise: 500000n,
    });
    mockPenaltyRepo.getLoanForPenalty.mockResolvedValue(baseLoan);
    mockPenaltyRepo.getLoanById.mockResolvedValue(baseLoan);
    mockPenaltyRepo.penaltyExists.mockResolvedValue(false);
    mockPenaltyRepo.createPenalty.mockResolvedValue({
      id: 'penalty-1',
      loan_id: 'loan-1',
      installment_id: 'inst-1',
      amount_paise: 500n,
      penalty_period: '2024-02',
      is_paid: false,
      is_waived: false,
    });
    mockPenaltyRepo.findAccountByCode.mockImplementation((code: string) => {
      if (code === '1100')
        return Promise.resolve({
          id: 'acc-1100',
          code: '1100',
          name: 'Loans Receivable',
          category: 'asset',
        });
      if (code === '4003')
        return Promise.resolve({
          id: 'acc-4003',
          code: '4003',
          name: 'Penalty Income',
          category: 'income',
        });
      return Promise.resolve(null);
    });
    mockPenaltyRepo.updateLoanOutstanding.mockResolvedValue({});
    mockPenaltyRepo.updateLoanStatus.mockResolvedValue({});
    mockPenaltyRepo.createStatusHistory.mockResolvedValue({});
    mockPenaltyRepo.findByLoanId.mockResolvedValue([]);
    mockPenaltyRepo.waivePenalty.mockResolvedValue({
      id: 'penalty-1',
      is_waived: true,
      waived_by: 'user-1',
      waiver_approved_by: 'user-2',
      waived_reason: 'Customer hardship',
    });

    mockAccountingService = createMockAccountingService();
    mockAccountingService.createJournalEntry.mockResolvedValue({ id: 'je-1' });

    mockAuditService = createMockAuditService();
    mockAuditService.createAuditLog.mockResolvedValue({ id: 'audit-1' });

    mockLoanService = createMockLoanService();

    service = new PenaltyService(
      mockPrisma as never,
      mockPenaltyRepo as never,
      mockAccountingService as never,
      mockAuditService as never,
      mockLoanService as never,
    );
  });

  // ── calculateAndPost ────────────────────────────────────────────────────

  describe('calculateAndPost', () => {
    const dto = {
      loanId: 'loan-1',
      installmentId: 'inst-1',
      penaltyPeriod: '2024-02',
      referenceDate: '2024-02-15',
    };

    it('posts a penalty successfully with journal entry', async () => {
      const result = await service.calculateAndPost(dto, 'user-1', 'manager');

      expect(result.penalty).toBeDefined();
      expect(result.journalEntry).toBeDefined();
      expect(result.dpd).toBeGreaterThan(0);
      expect(mockPenaltyRepo.createPenalty).toHaveBeenCalled();
      expect(mockAccountingService.createJournalEntry).toHaveBeenCalled();
      expect(mockAuditService.createAuditLog).toHaveBeenCalled();
    });

    it('creates journal entry with correct debit/credit accounts', async () => {
      await service.calculateAndPost(dto, 'user-1', 'manager');

      expect(mockAccountingService.createJournalEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: expect.arrayContaining([
            expect.objectContaining({ accountId: 'acc-1100', debitPaise: 500, creditPaise: 0 }),
            expect.objectContaining({ accountId: 'acc-4003', debitPaise: 0, creditPaise: 500 }),
          ]),
        }),
        expect.anything(),
      );
    });

    it('updates loan outstanding balance after posting', async () => {
      await service.calculateAndPost(dto, 'user-1', 'manager');

      expect(mockPenaltyRepo.updateLoanOutstanding).toHaveBeenCalledWith(
        'loan-1',
        expect.objectContaining({
          cached_outstanding_paise: 500000 + 500, // current + penalty
        }),
        expect.anything(),
      );
    });

    it('rejects penalty for loan not in active/overdue status', async () => {
      mockPenaltyRepo.lockLoanForUpdate.mockResolvedValue({
        id: 'loan-1',
        status: 'closed',
        cached_outstanding_paise: 0n,
      });

      await expect(service.calculateAndPost(dto, 'user-1', 'manager')).rejects.toThrow(
        BusinessRuleError,
      );
    });

    it('rejects penalty for loan in draft status', async () => {
      mockPenaltyRepo.lockLoanForUpdate.mockResolvedValue({
        id: 'loan-1',
        status: 'draft',
        cached_outstanding_paise: 0n,
      });

      await expect(service.calculateAndPost(dto, 'user-1', 'manager')).rejects.toThrow(
        BusinessRuleError,
      );
    });

    it('allows penalty for loan in overdue status', async () => {
      mockPenaltyRepo.lockLoanForUpdate.mockResolvedValue({
        id: 'loan-1',
        status: 'overdue',
        cached_outstanding_paise: 500000n,
      });
      const overdueLoan = { ...baseLoan, status: 'overdue' };
      mockPenaltyRepo.getLoanForPenalty.mockResolvedValue(overdueLoan);

      const result = await service.calculateAndPost(dto, 'user-1', 'manager');
      expect(result.penalty).toBeDefined();
    });

    it('rejects duplicate penalty for same period (Req 10.9)', async () => {
      mockPenaltyRepo.penaltyExists.mockResolvedValue(true);

      await expect(service.calculateAndPost(dto, 'user-1', 'manager')).rejects.toThrow(
        ConflictError,
      );
    });

    it('rejects penalty within grace period (Req 10.8)', async () => {
      // Set reference date to only 3 days after due date (grace = 7)
      const earlyDto = { ...dto, referenceDate: '2024-01-04' };

      await expect(service.calculateAndPost(earlyDto, 'user-1', 'manager')).rejects.toThrow(
        BusinessRuleError,
      );
    });

    it('rejects penalty exactly at grace period boundary', async () => {
      // 7 days past due, grace = 7 → daysPastDue <= graceDays → rejected
      const boundaryDto = { ...dto, referenceDate: '2024-01-08' };

      await expect(service.calculateAndPost(boundaryDto, 'user-1', 'manager')).rejects.toThrow(
        BusinessRuleError,
      );
    });

    it('accepts penalty one day past grace period', async () => {
      // 8 days past due, grace = 7 → daysPastDue > graceDays → accepted
      const pastGraceDto = { ...dto, referenceDate: '2024-01-09' };

      const result = await service.calculateAndPost(pastGraceDto, 'user-1', 'manager');
      expect(result.penalty).toBeDefined();
    });

    it('rejects penalty for fully paid installment', async () => {
      const paidLoan = {
        ...baseLoan,
        schedules: [
          {
            ...baseLoan.schedules[0],
            principal_paid_paise: 100000n,
            interest_paid_paise: 10000n,
          },
        ],
      };
      mockPenaltyRepo.getLoanForPenalty.mockResolvedValue(paidLoan);

      await expect(service.calculateAndPost(dto, 'user-1', 'manager')).rejects.toThrow(
        BusinessRuleError,
      );
    });

    it('rejects when penalty is not configured on product', async () => {
      const noPenaltyLoan = {
        ...baseLoan,
        product_version: {
          ...baseLoan.product_version,
          penalty_type: null,
          penalty_value: null,
        },
      };
      mockPenaltyRepo.getLoanForPenalty.mockResolvedValue(noPenaltyLoan);

      await expect(service.calculateAndPost(dto, 'user-1', 'manager')).rejects.toThrow(
        BusinessRuleError,
      );
    });

    it('throws NotFoundError when loan does not exist', async () => {
      mockPenaltyRepo.lockLoanForUpdate.mockResolvedValue(null);

      await expect(service.calculateAndPost(dto, 'user-1', 'manager')).rejects.toThrow(
        NotFoundError,
      );
    });

    it('throws NotFoundError when installment does not exist', async () => {
      const badDto = { ...dto, installmentId: 'nonexistent-inst' };

      await expect(service.calculateAndPost(badDto, 'user-1', 'manager')).rejects.toThrow(
        NotFoundError,
      );
    });

    it('throws BusinessRuleError when chart of accounts not configured', async () => {
      mockPenaltyRepo.findAccountByCode.mockResolvedValue(null);

      await expect(service.calculateAndPost(dto, 'user-1', 'manager')).rejects.toThrow(
        BusinessRuleError,
      );
    });

    it('calculates percentage penalty correctly', async () => {
      const percentLoan = {
        ...baseLoan,
        product_version: {
          ...baseLoan.product_version,
          penalty_type: 'percentage_of_overdue',
          penalty_value: 200, // 2%
        },
      };
      mockPenaltyRepo.getLoanForPenalty.mockResolvedValue(percentLoan);
      mockPenaltyRepo.createPenalty.mockResolvedValue({
        id: 'penalty-1',
        loan_id: 'loan-1',
        installment_id: 'inst-1',
        amount_paise: 2200n,
        penalty_period: '2024-02',
        is_paid: false,
        is_waived: false,
      });

      const result = await service.calculateAndPost(dto, 'user-1', 'manager');
      expect(result.penalty).toBeDefined();

      // Overdue = (100000 - 0) + (10000 - 0) = 110000 paise
      // 2% of 110000 = 2200 paise
      expect(mockPenaltyRepo.createPenalty).toHaveBeenCalledWith(
        expect.objectContaining({
          amount_paise: 2200,
        }),
        expect.anything(),
      );
    });

    it('uses current date when referenceDate is not provided', async () => {
      const noRefDto = { loanId: 'loan-1', installmentId: 'inst-1', penaltyPeriod: '2024-02' };

      // The loan due date is 2024-01-01, so current date should be well past grace
      const result = await service.calculateAndPost(noRefDto, 'user-1', 'manager');
      expect(result.penalty).toBeDefined();
    });

    it('transitions loan from active to overdue when DPD > 0 (Req 10.6)', async () => {
      await service.calculateAndPost(dto, 'user-1', 'manager');

      expect(mockPenaltyRepo.updateLoanStatus).toHaveBeenCalledWith(
        'loan-1',
        'overdue',
        expect.anything(),
      );
      expect(mockPenaltyRepo.createStatusHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          loan_id: 'loan-1',
          from_status: 'active',
          to_status: 'overdue',
        }),
        expect.anything(),
      );
    });

    it('creates audit log for penalty posting', async () => {
      await service.calculateAndPost(dto, 'user-1', 'manager');

      expect(mockAuditService.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action_type: 'penalty_posted',
          actor_id: 'user-1',
          actor_role: 'manager',
          target_entity: 'penalty',
        }),
        expect.anything(),
      );
    });
  });

  // ── waivePenalty ────────────────────────────────────────────────────────

  describe('waivePenalty', () => {
    const waiveDto = {
      reason: 'Customer hardship — documented',
      approverId: 'user-2',
    };

    beforeEach(() => {
      mockPenaltyRepo.findByIdTx.mockResolvedValue({
        id: 'penalty-1',
        loan_id: 'loan-1',
        amount_paise: 500n,
        is_waived: false,
        is_paid: false,
      });
    });

    it('waives a penalty successfully', async () => {
      const result = await service.waivePenalty('penalty-1', waiveDto, 'user-1', 'manager');

      expect(result.penalty.is_waived).toBe(true);
      expect(mockPenaltyRepo.waivePenalty).toHaveBeenCalled();
      expect(mockAuditService.createAuditLog).toHaveBeenCalled();
    });

    it('rejects waiver when requester equals approver (maker-checker)', async () => {
      const sameUserDto = { ...waiveDto, approverId: 'user-1' };

      await expect(
        service.waivePenalty('penalty-1', sameUserDto, 'user-1', 'manager'),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('rejects waiver for already waived penalty', async () => {
      mockPenaltyRepo.findByIdTx.mockResolvedValue({
        id: 'penalty-1',
        loan_id: 'loan-1',
        amount_paise: 500n,
        is_waived: true,
        is_paid: false,
      });

      await expect(
        service.waivePenalty('penalty-1', waiveDto, 'user-1', 'manager'),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('rejects waiver for already paid penalty', async () => {
      mockPenaltyRepo.findByIdTx.mockResolvedValue({
        id: 'penalty-1',
        loan_id: 'loan-1',
        amount_paise: 500n,
        is_waived: false,
        is_paid: true,
      });

      await expect(
        service.waivePenalty('penalty-1', waiveDto, 'user-1', 'manager'),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('rejects waiver for non-existent penalty', async () => {
      mockPenaltyRepo.findByIdTx.mockResolvedValue(null);

      await expect(
        service.waivePenalty('penalty-999', waiveDto, 'user-1', 'manager'),
      ).rejects.toThrow(NotFoundError);
    });

    it('reduces outstanding balance by penalty amount', async () => {
      await service.waivePenalty('penalty-1', waiveDto, 'user-1', 'manager');

      expect(mockPenaltyRepo.updateLoanOutstanding).toHaveBeenCalledWith(
        'loan-1',
        expect.objectContaining({
          cached_outstanding_paise: expect.any(Number),
        }),
        expect.anything(),
      );
    });

    it('recalculates DPD and overdue bucket after waiver', async () => {
      const result = await service.waivePenalty('penalty-1', waiveDto, 'user-1', 'manager');

      expect(result.dpd).toBeDefined();
      expect(result.overdueBucket).toBeDefined();
      expect(mockPenaltyRepo.updateLoanOutstanding).toHaveBeenCalledWith(
        'loan-1',
        expect.objectContaining({
          dpd: expect.any(Number),
          overdue_bucket: expect.any(String),
        }),
        expect.anything(),
      );
    });

    it('creates audit log with before/after state for waiver', async () => {
      await service.waivePenalty('penalty-1', waiveDto, 'user-1', 'manager');

      expect(mockAuditService.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action_type: 'penalty_waived',
          actor_id: 'user-1',
          before_state: expect.objectContaining({ is_waived: false }),
          after_state: expect.objectContaining({
            is_waived: true,
            waived_by: 'user-1',
            waiver_approved_by: 'user-2',
          }),
        }),
        expect.anything(),
      );
    });

    it('locks loan row before updating outstanding', async () => {
      await service.waivePenalty('penalty-1', waiveDto, 'user-1', 'manager');

      expect(mockPenaltyRepo.lockLoanForUpdate).toHaveBeenCalledWith('loan-1', expect.anything());
    });

    it('throws NotFoundError when loan not found during waiver', async () => {
      mockPenaltyRepo.lockLoanForUpdate.mockResolvedValue(null);

      await expect(
        service.waivePenalty('penalty-1', waiveDto, 'user-1', 'manager'),
      ).rejects.toThrow(NotFoundError);
    });

    it('ensures outstanding does not go below zero', async () => {
      // Penalty amount (500) > current outstanding (100)
      mockPenaltyRepo.findByIdTx.mockResolvedValue({
        id: 'penalty-1',
        loan_id: 'loan-1',
        amount_paise: 500n,
        is_waived: false,
        is_paid: false,
      });
      mockPenaltyRepo.lockLoanForUpdate.mockResolvedValue({
        id: 'loan-1',
        status: 'active',
        cached_outstanding_paise: 100n,
      });

      await service.waivePenalty('penalty-1', waiveDto, 'user-1', 'manager');

      expect(mockPenaltyRepo.updateLoanOutstanding).toHaveBeenCalledWith(
        'loan-1',
        expect.objectContaining({
          cached_outstanding_paise: 0, // Math.max(0, 100 - 500)
        }),
        expect.anything(),
      );
    });
  });

  // ── handleStatusTransition (tested via calculateAndPost / waivePenalty) ─

  describe('handleStatusTransition (Req 10.6)', () => {
    it('transitions active → overdue when DPD > 0', async () => {
      // baseLoan is active with unpaid installment due 2024-01-01
      const dto = {
        loanId: 'loan-1',
        installmentId: 'inst-1',
        penaltyPeriod: '2024-02',
        referenceDate: '2024-02-15',
      };

      await service.calculateAndPost(dto, 'user-1', 'manager');

      expect(mockPenaltyRepo.updateLoanStatus).toHaveBeenCalledWith(
        'loan-1',
        'overdue',
        expect.anything(),
      );
      expect(mockAuditService.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action_type: 'loan_overdue',
          target_entity: 'loan',
          before_state: { status: 'active' },
          after_state: expect.objectContaining({ status: 'overdue' }),
        }),
        expect.anything(),
      );
    });

    it('transitions overdue → active when DPD returns to 0', async () => {
      // Loan is overdue but all installments are now paid
      const paidLoan = {
        ...baseLoan,
        status: 'overdue',
        schedules: [
          {
            ...baseLoan.schedules[0],
            principal_paid_paise: 100000n,
            interest_paid_paise: 10000n,
          },
        ],
      };
      mockPenaltyRepo.getLoanForPenalty.mockResolvedValue(paidLoan);
      mockPenaltyRepo.lockLoanForUpdate.mockResolvedValue({
        id: 'loan-1',
        status: 'overdue',
        cached_outstanding_paise: 500n,
      });
      mockPenaltyRepo.findByIdTx.mockResolvedValue({
        id: 'penalty-1',
        loan_id: 'loan-1',
        amount_paise: 500n,
        is_waived: false,
        is_paid: false,
      });

      await service.waivePenalty(
        'penalty-1',
        { reason: 'Customer hardship', approverId: 'user-2' },
        'user-1',
        'manager',
      );

      expect(mockPenaltyRepo.updateLoanStatus).toHaveBeenCalledWith(
        'loan-1',
        'active',
        expect.anything(),
      );
      expect(mockPenaltyRepo.createStatusHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          from_status: 'overdue',
          to_status: 'active',
        }),
        expect.anything(),
      );
    });

    it('does not transition when active and DPD is 0', async () => {
      // All installments paid, loan is active → no transition
      const paidLoan = {
        ...baseLoan,
        status: 'active',
        schedules: [
          {
            ...baseLoan.schedules[0],
            principal_paid_paise: 100000n,
            interest_paid_paise: 10000n,
          },
        ],
      };
      mockPenaltyRepo.getLoanForPenalty.mockResolvedValue(paidLoan);
      mockPenaltyRepo.findByIdTx.mockResolvedValue({
        id: 'penalty-1',
        loan_id: 'loan-1',
        amount_paise: 500n,
        is_waived: false,
        is_paid: false,
      });

      await service.waivePenalty(
        'penalty-1',
        { reason: 'Customer hardship', approverId: 'user-2' },
        'user-1',
        'manager',
      );

      // updateLoanStatus should NOT be called for status transition
      // (it may be called for outstanding update, but not for status change)
      expect(mockPenaltyRepo.updateLoanStatus).not.toHaveBeenCalled();
    });

    it('does not transition when overdue and DPD > 0', async () => {
      // Loan is overdue with unpaid installments → stays overdue
      const overdueLoan = { ...baseLoan, status: 'overdue' };
      mockPenaltyRepo.lockLoanForUpdate.mockResolvedValue({
        id: 'loan-1',
        status: 'overdue',
        cached_outstanding_paise: 500000n,
      });
      mockPenaltyRepo.getLoanForPenalty.mockResolvedValue(overdueLoan);

      const dto = {
        loanId: 'loan-1',
        installmentId: 'inst-1',
        penaltyPeriod: '2024-02',
        referenceDate: '2024-02-15',
      };

      await service.calculateAndPost(dto, 'user-1', 'manager');

      // Should NOT call updateLoanStatus since it's already overdue and DPD > 0
      expect(mockPenaltyRepo.updateLoanStatus).not.toHaveBeenCalled();
    });
  });

  // ── getLoanDpdInfo ──────────────────────────────────────────────────────

  describe('getLoanDpdInfo (Req 10.7)', () => {
    it('returns DPD, overdue bucket, and loan status', async () => {
      const result = await service.getLoanDpdInfo('loan-1');

      expect(result).toEqual(
        expect.objectContaining({
          dpd: expect.any(Number),
          overdueBucket: expect.any(String),
          loanStatus: 'active',
        }),
      );
    });

    it('returns DPD 0 when all installments are paid', async () => {
      const paidLoan = {
        ...baseLoan,
        schedules: [
          {
            ...baseLoan.schedules[0],
            principal_paid_paise: 100000n,
            interest_paid_paise: 10000n,
          },
        ],
      };
      mockPenaltyRepo.getLoanById.mockResolvedValue(paidLoan);

      const result = await service.getLoanDpdInfo('loan-1');
      expect(result.dpd).toBe(0);
      expect(result.overdueBucket).toBe('bucket_0');
    });

    it('throws NotFoundError for non-existent loan', async () => {
      mockPenaltyRepo.getLoanById.mockResolvedValue(null);

      await expect(service.getLoanDpdInfo('nonexistent')).rejects.toThrow(NotFoundError);
    });

    it('computes correct bucket for overdue loan', async () => {
      // Due date 2024-01-01, reference = now (well past 90 days)
      const result = await service.getLoanDpdInfo('loan-1');

      // DPD should be > 0 since installment is unpaid and due date is in the past
      expect(result.dpd).toBeGreaterThan(0);
      expect(['bucket_1_30', 'bucket_31_60', 'bucket_61_90', 'bucket_90_plus']).toContain(
        result.overdueBucket,
      );
    });
  });

  // ── findById / findByLoanId ─────────────────────────────────────────────

  describe('findById', () => {
    it('returns penalty when found', async () => {
      const penalty = { id: 'penalty-1', loan_id: 'loan-1', amount_paise: 500n };
      mockPenaltyRepo.findById.mockResolvedValue(penalty);

      const result = await service.findById('penalty-1');
      expect(result).toEqual(penalty);
    });

    it('throws NotFoundError when penalty not found', async () => {
      mockPenaltyRepo.findById.mockResolvedValue(null);

      await expect(service.findById('nonexistent')).rejects.toThrow(NotFoundError);
    });
  });

  describe('findByLoanId', () => {
    it('returns penalties for a loan', async () => {
      const penalties = [
        { id: 'p-1', loan_id: 'loan-1', amount_paise: 500n },
        { id: 'p-2', loan_id: 'loan-1', amount_paise: 1000n },
      ];
      mockPenaltyRepo.findByLoanId.mockResolvedValue(penalties);

      const result = await service.findByLoanId('loan-1');
      expect(result).toHaveLength(2);
    });

    it('returns empty array when no penalties exist', async () => {
      mockPenaltyRepo.findByLoanId.mockResolvedValue([]);

      const result = await service.findByLoanId('loan-1');
      expect(result).toEqual([]);
    });
  });
});
