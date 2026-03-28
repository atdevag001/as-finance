import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calculateForeclosureSettlement,
  calculateFlatAccruedInterest,
  calculateReducingBalanceAccruedInterest,
  ForeclosureService,
} from '../foreclosure.service';

// ─── Pure Function Tests ─────────────────────────────────────────────────────

describe('calculateForeclosureSettlement', () => {
  it('calculates settlement as principal + interest + penalties - rebate', () => {
    const result = calculateForeclosureSettlement({
      outstandingPrincipalPaise: 100000,
      accruedInterestPaise: 5000,
      pendingPenaltiesPaise: 2000,
      rebatePaise: 1000,
    });

    expect(result.settlementAmountPaise).toBe(106000);
    expect(result.outstandingPrincipalPaise).toBe(100000);
    expect(result.accruedInterestPaise).toBe(5000);
    expect(result.pendingPenaltiesPaise).toBe(2000);
    expect(result.rebatePaise).toBe(1000);
  });

  it('returns zero when rebate exceeds total', () => {
    const result = calculateForeclosureSettlement({
      outstandingPrincipalPaise: 1000,
      accruedInterestPaise: 500,
      pendingPenaltiesPaise: 200,
      rebatePaise: 5000,
    });

    expect(result.settlementAmountPaise).toBe(0);
  });

  it('handles zero rebate', () => {
    const result = calculateForeclosureSettlement({
      outstandingPrincipalPaise: 50000,
      accruedInterestPaise: 3000,
      pendingPenaltiesPaise: 1000,
      rebatePaise: 0,
    });

    expect(result.settlementAmountPaise).toBe(54000);
  });

  it('handles zero penalties', () => {
    const result = calculateForeclosureSettlement({
      outstandingPrincipalPaise: 50000,
      accruedInterestPaise: 3000,
      pendingPenaltiesPaise: 0,
      rebatePaise: 0,
    });

    expect(result.settlementAmountPaise).toBe(53000);
  });

  it('handles all zeros', () => {
    const result = calculateForeclosureSettlement({
      outstandingPrincipalPaise: 0,
      accruedInterestPaise: 0,
      pendingPenaltiesPaise: 0,
      rebatePaise: 0,
    });

    expect(result.settlementAmountPaise).toBe(0);
  });
});

describe('calculateFlatAccruedInterest', () => {
  it('calculates pro-rata interest for flat loans', () => {
    const disbursement = new Date('2024-01-01');
    const lastDue = new Date('2025-01-01'); // 366 days total (2024 is leap year)
    const settlement = new Date('2024-07-01'); // ~182 days elapsed

    const totalInterest = 120000; // 1200 INR total interest
    const accrued = calculateFlatAccruedInterest(
      totalInterest,
      disbursement,
      lastDue,
      settlement,
    );

    // Pro-rata: 120000 * 182 / 366 ≈ 59672
    expect(accrued).toBeGreaterThan(0);
    expect(accrued).toBeLessThan(totalInterest);
  });

  it('returns 0 when settlement is at disbursement date', () => {
    const disbursement = new Date('2024-01-01');
    const lastDue = new Date('2025-01-01');
    const settlement = new Date('2024-01-01');

    const accrued = calculateFlatAccruedInterest(100000, disbursement, lastDue, settlement);
    expect(accrued).toBe(0);
  });

  it('returns full interest when settlement is at last due date', () => {
    const disbursement = new Date('2024-01-01');
    const lastDue = new Date('2025-01-01');
    const settlement = new Date('2025-01-01');

    const accrued = calculateFlatAccruedInterest(100000, disbursement, lastDue, settlement);
    expect(accrued).toBe(100000);
  });
});

describe('calculateReducingBalanceAccruedInterest', () => {
  it('calculates daily accrual on outstanding principal', () => {
    const lastPayment = new Date('2024-06-01');
    const settlement = new Date('2024-07-01'); // 30 days

    // 12% annual rate = 1200 bps, outstanding = 100000 paise
    // daily rate = 1200 / 10000 / 365 ≈ 0.000328767
    // accrued = 100000 * 0.000328767 * 30 ≈ 986
    const accrued = calculateReducingBalanceAccruedInterest(
      100000,
      1200,
      lastPayment,
      settlement,
    );

    expect(accrued).toBeGreaterThan(0);
    expect(accrued).toBeLessThan(100000);
  });

  it('returns 0 when settlement is same day as last payment', () => {
    const date = new Date('2024-06-01');
    const accrued = calculateReducingBalanceAccruedInterest(100000, 1200, date, date);
    expect(accrued).toBe(0);
  });

  it('returns 0 when outstanding principal is 0', () => {
    const lastPayment = new Date('2024-06-01');
    const settlement = new Date('2024-07-01');
    const accrued = calculateReducingBalanceAccruedInterest(0, 1200, lastPayment, settlement);
    expect(accrued).toBe(0);
  });
});

// ─── ForeclosureService Tests ────────────────────────────────────────────────

describe('ForeclosureService', () => {
  let service: ForeclosureService;
  let mockPrisma: any;
  let mockForeclosureRepo: any;
  let mockAccountingService: any;
  let mockAuditService: any;
  let mockIdempotencyService: any;
  let mockReceiptService: any;

  beforeEach(() => {
    mockPrisma = {
      $transaction: vi.fn((fn: any) => fn(mockPrisma)),
    };

    mockForeclosureRepo = {
      getLoanForForeclosure: vi.fn(),
      getPendingPenalties: vi.fn().mockResolvedValue([]),
      createForeclosure: vi.fn().mockResolvedValue({ id: 'fc-1' }),
      findById: vi.fn(),
      lockLoanForUpdate: vi.fn(),
      updateForeclosure: vi.fn(),
      closeAllInstallments: vi.fn(),
      updateLoan: vi.fn(),
      createStatusHistory: vi.fn(),
      findAccountByCode: vi.fn(),
      getOfficerName: vi.fn().mockResolvedValue('Test Officer'),
      markPenaltiesAsPaid: vi.fn(),
    };

    mockAccountingService = {
      createJournalEntry: vi.fn().mockResolvedValue({ id: 'je-1' }),
    };

    mockAuditService = {
      createAuditLog: vi.fn().mockResolvedValue({ id: 'al-1' }),
    };

    mockIdempotencyService = {
      find: vi.fn().mockResolvedValue(null),
      store: vi.fn(),
    };

    mockReceiptService = {
      generateReceipt: vi.fn().mockResolvedValue({ id: 'rcp-1', receipt_number: 'RCP-2024-001' }),
    };

    service = new ForeclosureService(
      mockPrisma,
      mockForeclosureRepo,
      mockAccountingService,
      mockAuditService,
      mockIdempotencyService,
      mockReceiptService,
    );
  });

  describe('createQuote', () => {
    it('creates a foreclosure quote for an active loan', async () => {
      mockForeclosureRepo.getLoanForForeclosure.mockResolvedValue({
        id: 'loan-1',
        loan_number: 'LN-2024-001',
        customer_id: 'cust-1',
        principal_paise: 100000n,
        status: 'active',
        total_interest_paise: 12000n,
        disbursement_date: new Date('2024-01-01'),
        last_due_date: new Date('2025-01-01'),
        product_version: {
          interest_type: 'flat',
          annual_rate_bps: 1200,
          allocation_order: ['penalty', 'interest', 'principal'],
        },
        customer: { id: 'cust-1', full_name: 'Test Customer', mobile: '9876543210' },
        schedules: [
          {
            id: 's-1',
            principal_paise: 50000n,
            interest_paise: 6000n,
            principal_paid_paise: 0n,
            interest_paid_paise: 0n,
          },
          {
            id: 's-2',
            principal_paise: 50000n,
            interest_paise: 6000n,
            principal_paid_paise: 0n,
            interest_paid_paise: 0n,
          },
        ],
      });

      const result = await service.createQuote(
        { loanId: 'loan-1' },
        'user-1',
        'manager',
      );

      expect(result.loanId).toBe('loan-1');
      expect(result.status).toBe('quote');
      expect(result.outstandingPrincipalPaise).toBe(100000);
      expect(result.settlementAmountPaise).toBeGreaterThan(0);
      expect(result.quoteExpiresAt).toBeDefined();
      expect(mockForeclosureRepo.createForeclosure).toHaveBeenCalled();
      expect(mockAuditService.createAuditLog).toHaveBeenCalled();
    });

    it('rejects foreclosure for non-active/overdue loans', async () => {
      mockForeclosureRepo.getLoanForForeclosure.mockResolvedValue({
        id: 'loan-1',
        status: 'closed',
        schedules: [],
        product_version: { interest_type: 'flat', annual_rate_bps: 1200 },
        customer: { id: 'cust-1', full_name: 'Test', mobile: '9876543210' },
      });

      await expect(
        service.createQuote({ loanId: 'loan-1' }, 'user-1', 'manager'),
      ).rejects.toThrow('Cannot foreclose a loan with status');
    });

    it('throws NotFoundError for non-existent loan', async () => {
      mockForeclosureRepo.getLoanForForeclosure.mockResolvedValue(null);

      await expect(
        service.createQuote({ loanId: 'nonexistent' }, 'user-1', 'manager'),
      ).rejects.toThrow('Loan not found');
    });
  });

  describe('executeForeclosure', () => {
    it('returns cached result for duplicate idempotency key', async () => {
      mockIdempotencyService.find.mockResolvedValue({
        resultStatus: 201,
        resultBody: { foreclosureId: 'fc-1' },
      });

      const result = await service.executeForeclosure(
        {
          foreclosureId: 'fc-1',
          paymentMode: 'cash',
          idempotencyKey: 'dup-key',
        },
        'user-2',
        'manager',
      );

      expect(result.statusCode).toBe(201);
      expect(result.data).toEqual({ foreclosureId: 'fc-1' });
    });

    it('rejects expired quotes', async () => {
      const expiredDate = new Date(Date.now() - 1000);
      mockForeclosureRepo.findById.mockResolvedValue({
        id: 'fc-1',
        loan_id: 'loan-1',
        status: 'quote',
        requested_by: 'user-1',
        quote_expires_at: expiredDate,
        outstanding_principal_paise: 100000n,
        accrued_interest_paise: 5000n,
        pending_penalties_paise: 0n,
        rebate_paise: 0n,
      });

      await expect(
        service.executeForeclosure(
          { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'key-1' },
          'user-2',
          'manager',
        ),
      ).rejects.toThrow('Foreclosure quote has expired');
    });

    it('enforces maker-checker (approver ≠ requester)', async () => {
      const futureDate = new Date(Date.now() + 86400000);
      mockForeclosureRepo.findById.mockResolvedValue({
        id: 'fc-1',
        loan_id: 'loan-1',
        status: 'quote',
        requested_by: 'user-1',
        quote_expires_at: futureDate,
        outstanding_principal_paise: 100000n,
        accrued_interest_paise: 5000n,
        pending_penalties_paise: 0n,
        rebate_paise: 0n,
      });

      mockForeclosureRepo.lockLoanForUpdate.mockResolvedValue({
        id: 'loan-1',
        status: 'active',
        cached_outstanding_paise: 105000n,
      });

      await expect(
        service.executeForeclosure(
          { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'key-1' },
          'user-1', // same as requester
          'manager',
        ),
      ).rejects.toThrow('Maker-checker violation');
    });
  });
});
