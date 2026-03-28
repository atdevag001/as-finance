import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CashbookService, computeDailySummary } from '../cashbook.service';

/**
 * Unit tests for CashbookService and the pure computeDailySummary function.
 */

describe('computeDailySummary (pure function)', () => {
  it('should compute closing balance = opening + inflows - outflows', () => {
    const result = computeDailySummary({
      openingBalancePaise: 100000n, // ₹1000
      transactions: [
        { type: 'inflow', amountPaise: 50000n, category: 'collection' },
        { type: 'outflow', amountPaise: 20000n, category: 'expense' },
      ],
    });

    expect(result.openingBalancePaise).toBe('100000');
    expect(result.cashInflowsPaise).toBe('50000');
    expect(result.cashOutflowsPaise).toBe('20000');
    expect(result.closingBalancePaise).toBe('130000');
    expect(result.hasDiscrepancy).toBe(false);
  });

  it('should handle zero transactions', () => {
    const result = computeDailySummary({
      openingBalancePaise: 50000n,
      transactions: [],
    });

    expect(result.closingBalancePaise).toBe('50000');
    expect(result.cashInflowsPaise).toBe('0');
    expect(result.cashOutflowsPaise).toBe('0');
    expect(result.hasDiscrepancy).toBe(false);
  });

  it('should flag discrepancy when closing balance is negative', () => {
    const result = computeDailySummary({
      openingBalancePaise: 10000n,
      transactions: [
        { type: 'outflow', amountPaise: 20000n, category: 'expense' },
      ],
    });

    expect(result.closingBalancePaise).toBe('-10000');
    expect(result.hasDiscrepancy).toBe(true);
  });

  it('should handle multiple inflows and outflows', () => {
    const result = computeDailySummary({
      openingBalancePaise: 0n,
      transactions: [
        { type: 'inflow', amountPaise: 10000n, category: 'collection' },
        { type: 'inflow', amountPaise: 5000n, category: 'handover_in' },
        { type: 'outflow', amountPaise: 3000n, category: 'expense' },
        { type: 'outflow', amountPaise: 2000n, category: 'handover_out' },
      ],
    });

    expect(result.cashInflowsPaise).toBe('15000');
    expect(result.cashOutflowsPaise).toBe('5000');
    expect(result.closingBalancePaise).toBe('10000');
    expect(result.hasDiscrepancy).toBe(false);
  });

  it('should handle zero opening balance', () => {
    const result = computeDailySummary({
      openingBalancePaise: 0n,
      transactions: [
        { type: 'inflow', amountPaise: 100n, category: 'collection' },
      ],
    });

    expect(result.openingBalancePaise).toBe('0');
    expect(result.closingBalancePaise).toBe('100');
  });
});

describe('CashbookService', () => {
  function createMocks() {
    const prisma = {
      $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({})),
    };

    const cashbookRepository = {
      createExpense: vi.fn().mockResolvedValue({ id: 'exp-1', category: 'office', amount_paise: 5000n }),
      findExpenseById: vi.fn(),
      findExpenses: vi.fn().mockResolvedValue({ data: [], total: 0 }),
      createHandover: vi.fn().mockResolvedValue({
        id: 'hnd-1',
        collection_officer_id: 'user-1',
        receiving_officer_id: 'user-2',
        total_amount_paise: 100000n,
        verification_status: 'pending',
      }),
      findHandoverById: vi.fn(),
      updateHandoverVerification: vi.fn(),
      findHandovers: vi.fn().mockResolvedValue({ data: [], total: 0 }),
      createCashTransaction: vi.fn().mockResolvedValue({ id: 'ctx-1' }),
      getCashTransactionsForDate: vi.fn().mockResolvedValue([]),
      getBalanceBeforeDate: vi.fn().mockResolvedValue({ totalInflows: 0n, totalOutflows: 0n }),
      getIncomeBySourceForDate: vi.fn().mockResolvedValue([]),
    };

    const accountingService = {
      createJournalEntry: vi.fn().mockResolvedValue({ id: 'je-1' }),
    };

    const accountingRepository = {
      findAccountByCode: vi.fn().mockImplementation((code: string) => {
        if (code === '1001') return Promise.resolve({ id: 'acc-cash', code: '1001', name: 'Cash' });
        if (code === '5004') return Promise.resolve({ id: 'acc-office', code: '5004', name: 'Office Expense' });
        if (code === '5099') return Promise.resolve({ id: 'acc-other', code: '5099', name: 'Other Expense' });
        return Promise.resolve(null);
      }),
    };

    const auditService = {
      createAuditLog: vi.fn().mockResolvedValue({ id: 'audit-1' }),
    };

    const service = new CashbookService(
      prisma as never,
      cashbookRepository as never,
      accountingService as never,
      accountingRepository as never,
      auditService as never,
    );

    return { service, prisma, cashbookRepository, accountingService, accountingRepository, auditService };
  }

  describe('createExpense', () => {
    it('should create expense with journal entry atomically', async () => {
      const { service, accountingService, cashbookRepository, auditService } = createMocks();

      const result = await service.createExpense(
        {
          category: 'office',
          amountPaise: 5000,
          date: '2024-01-15',
          description: 'Stationery purchase',
        },
        'user-1',
        'accountant',
      );

      expect(result.expense).toBeDefined();
      expect(result.journalEntry).toBeDefined();
      expect(accountingService.createJournalEntry).toHaveBeenCalledOnce();
      expect(cashbookRepository.createExpense).toHaveBeenCalledOnce();
      expect(cashbookRepository.createCashTransaction).toHaveBeenCalledOnce();
      expect(auditService.createAuditLog).toHaveBeenCalledOnce();
    });

    it('should reject unknown expense category without matching account', async () => {
      const { service, accountingRepository } = createMocks();
      // Override to return null for the fallback code too
      accountingRepository.findAccountByCode.mockResolvedValue(null);

      await expect(
        service.createExpense(
          { category: 'unknown', amountPaise: 1000, date: '2024-01-15', description: 'test' },
          'user-1',
          'accountant',
        ),
      ).rejects.toThrow('No expense account found');
    });
  });

  describe('createHandover', () => {
    it('should create handover and audit log', async () => {
      const { service, cashbookRepository, auditService } = createMocks();

      const result = await service.createHandover(
        { totalAmountPaise: 100000, receivingOfficerId: 'user-2', handoverDate: '2024-01-15' },
        'user-1',
        'collection_officer',
      );

      expect(result.id).toBe('hnd-1');
      expect(cashbookRepository.createHandover).toHaveBeenCalledOnce();
      expect(auditService.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action_type: 'cash_handover' }),
      );
    });
  });

  describe('verifyHandover', () => {
    it('should verify a pending handover', async () => {
      const { service, cashbookRepository } = createMocks();
      cashbookRepository.findHandoverById.mockResolvedValue({
        id: 'hnd-1',
        verification_status: 'pending',
      });
      cashbookRepository.updateHandoverVerification.mockResolvedValue({
        id: 'hnd-1',
        verification_status: 'verified',
      });

      const result = await service.verifyHandover(
        'hnd-1',
        { verificationStatus: 'verified' },
        'user-3',
        'accountant',
      );

      expect(result.verification_status).toBe('verified');
    });

    it('should reject verification of already verified handover', async () => {
      const { service, cashbookRepository } = createMocks();
      cashbookRepository.findHandoverById.mockResolvedValue({
        id: 'hnd-1',
        verification_status: 'verified',
      });

      await expect(
        service.verifyHandover('hnd-1', { verificationStatus: 'verified' }, 'user-3', 'accountant'),
      ).rejects.toThrow('Handover already verified');
    });

    it('should reject discrepancy without amount', async () => {
      const { service, cashbookRepository } = createMocks();
      cashbookRepository.findHandoverById.mockResolvedValue({
        id: 'hnd-1',
        verification_status: 'pending',
      });

      await expect(
        service.verifyHandover(
          'hnd-1',
          { verificationStatus: 'discrepancy' },
          'user-3',
          'accountant',
        ),
      ).rejects.toThrow('Discrepancy amount is required');
    });

    it('should throw not found for missing handover', async () => {
      const { service, cashbookRepository } = createMocks();
      cashbookRepository.findHandoverById.mockResolvedValue(null);

      await expect(
        service.verifyHandover('missing', { verificationStatus: 'verified' }, 'user-3', 'accountant'),
      ).rejects.toThrow('Cash handover not found');
    });
  });

  describe('getDailySummary', () => {
    it('should return daily summary with income classification', async () => {
      const { service, cashbookRepository } = createMocks();
      cashbookRepository.getBalanceBeforeDate.mockResolvedValue({
        totalInflows: 500000n,
        totalOutflows: 200000n,
      });
      cashbookRepository.getCashTransactionsForDate.mockResolvedValue([
        { type: 'inflow', amount_paise: 10000n, category: 'collection' },
        { type: 'outflow', amount_paise: 3000n, category: 'expense' },
      ]);
      cashbookRepository.getIncomeBySourceForDate.mockResolvedValue([
        { credit_paise: 8000n, account: { id: 'a1', code: '4001', name: 'Interest Income' } },
        { credit_paise: 2000n, account: { id: 'a2', code: '4002', name: 'Processing Fee Income' } },
      ]);

      const result = await service.getDailySummary('2024-01-15');

      expect(result.openingBalancePaise).toBe('300000');
      expect(result.cashInflowsPaise).toBe('10000');
      expect(result.cashOutflowsPaise).toBe('3000');
      expect(result.closingBalancePaise).toBe('307000');
      expect(result.incomeBySource).toHaveLength(2);
      expect(result.transactionCount).toBe(2);
    });
  });
});
