import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PenaltyService, calculateDpd, classifyOverdueBucket, calculatePenaltyAmount } from '../penalty.service';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../../common/errors';

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
});

// ─── PenaltyService Integration Tests (mocked dependencies) ──────────────────

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
      if (code === '1100') return Promise.resolve({ id: 'acc-1100', code: '1100', name: 'Loans Receivable', category: 'asset' });
      if (code === '4003') return Promise.resolve({ id: 'acc-4003', code: '4003', name: 'Penalty Income', category: 'income' });
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

  describe('calculateAndPost', () => {
    const dto = {
      loanId: 'loan-1',
      installmentId: 'inst-1',
      penaltyPeriod: '2024-02',
      referenceDate: '2024-02-15',
    };

    it('posts a penalty successfully', async () => {
      const result = await service.calculateAndPost(dto, 'user-1', 'manager');

      expect(result.penalty).toBeDefined();
      expect(result.journalEntry).toBeDefined();
      expect(result.dpd).toBeGreaterThan(0);
      expect(mockPenaltyRepo.createPenalty).toHaveBeenCalled();
      expect(mockAccountingService.createJournalEntry).toHaveBeenCalled();
      expect(mockAuditService.createAuditLog).toHaveBeenCalled();
    });

    it('rejects penalty for loan not in active/overdue status', async () => {
      (mockPenaltyRepo.lockLoanForUpdate).mockResolvedValue({
        id: 'loan-1',
        status: 'closed',
        cached_outstanding_paise: 0n,
      });

      await expect(service.calculateAndPost(dto, 'user-1', 'manager'))
        .rejects.toThrow(BusinessRuleError);
    });

    it('rejects duplicate penalty for same period', async () => {
      (mockPenaltyRepo.penaltyExists).mockResolvedValue(true);

      await expect(service.calculateAndPost(dto, 'user-1', 'manager'))
        .rejects.toThrow(ConflictError);
    });

    it('rejects penalty within grace period', async () => {
      // Set reference date to only 3 days after due date (grace = 7)
      const earlyDto = { ...dto, referenceDate: '2024-01-04' };

      await expect(service.calculateAndPost(earlyDto, 'user-1', 'manager'))
        .rejects.toThrow(BusinessRuleError);
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

      await expect(service.calculateAndPost(dto, 'user-1', 'manager'))
        .rejects.toThrow(BusinessRuleError);
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

      await expect(service.calculateAndPost(dto, 'user-1', 'manager'))
        .rejects.toThrow(BusinessRuleError);
    });

    it('transitions loan from active to overdue when DPD > 0', async () => {
      await service.calculateAndPost(dto, 'user-1', 'manager');

      expect(mockPenaltyRepo.updateLoanStatus).toHaveBeenCalledWith(
        'loan-1',
        'overdue',
        expect.anything(),
      );
    });
  });

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

      await expect(service.waivePenalty('penalty-1', sameUserDto, 'user-1', 'manager'))
        .rejects.toThrow(BusinessRuleError);
    });

    it('rejects waiver for already waived penalty', async () => {
      mockPenaltyRepo.findByIdTx.mockResolvedValue({
        id: 'penalty-1',
        loan_id: 'loan-1',
        amount_paise: 500n,
        is_waived: true,
        is_paid: false,
      });

      await expect(service.waivePenalty('penalty-1', waiveDto, 'user-1', 'manager'))
        .rejects.toThrow(BusinessRuleError);
    });

    it('rejects waiver for already paid penalty', async () => {
      mockPenaltyRepo.findByIdTx.mockResolvedValue({
        id: 'penalty-1',
        loan_id: 'loan-1',
        amount_paise: 500n,
        is_waived: false,
        is_paid: true,
      });

      await expect(service.waivePenalty('penalty-1', waiveDto, 'user-1', 'manager'))
        .rejects.toThrow(BusinessRuleError);
    });

    it('rejects waiver for non-existent penalty', async () => {
      mockPenaltyRepo.findByIdTx.mockResolvedValue(null);

      await expect(service.waivePenalty('penalty-999', waiveDto, 'user-1', 'manager'))
        .rejects.toThrow(NotFoundError);
    });
  });
});
