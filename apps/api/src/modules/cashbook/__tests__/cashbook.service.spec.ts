import { describe, it, expect, vi } from 'vitest';
import { CashbookService, computeDailySummary } from '../cashbook.service';
import { buildDailySummaryInput } from '@as-finance/testing';

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

  it('should satisfy invariant: opening + inflows - outflows = closing (factory defaults)', () => {
    const input = buildDailySummaryInput();
    const result = computeDailySummary(input);

    const opening = input.openingBalancePaise;
    let inflows = 0n;
    let outflows = 0n;
    for (const tx of input.transactions) {
      if (tx.type === 'inflow') inflows += tx.amountPaise;
      else outflows += tx.amountPaise;
    }

    expect(BigInt(result.closingBalancePaise)).toBe(opening + inflows - outflows);
    expect(BigInt(result.cashInflowsPaise)).toBe(inflows);
    expect(BigInt(result.cashOutflowsPaise)).toBe(outflows);
  });

  it('should satisfy invariant with custom factory overrides', () => {
    const input = buildDailySummaryInput({
      openingBalancePaise: 500_000n,
      transactions: [
        { type: 'inflow', amountPaise: 200_000n, category: 'collection' },
        { type: 'inflow', amountPaise: 100_000n, category: 'handover_in' },
        { type: 'outflow', amountPaise: 75_000n, category: 'salary' },
        { type: 'outflow', amountPaise: 25_000n, category: 'travel' },
      ],
    });
    const result = computeDailySummary(input);

    // 500000 + 300000 - 100000 = 700000
    expect(BigInt(result.closingBalancePaise)).toBe(700_000n);
    expect(result.hasDiscrepancy).toBe(false);
  });

  it('should handle only inflows (no outflows)', () => {
    const input = buildDailySummaryInput({
      openingBalancePaise: 1000n,
      transactions: [
        { type: 'inflow', amountPaise: 500n, category: 'collection' },
        { type: 'inflow', amountPaise: 300n, category: 'collection' },
      ],
    });
    const result = computeDailySummary(input);

    expect(BigInt(result.closingBalancePaise)).toBe(1800n);
    expect(BigInt(result.cashOutflowsPaise)).toBe(0n);
  });

  it('should handle only outflows (no inflows)', () => {
    const input = buildDailySummaryInput({
      openingBalancePaise: 10_000n,
      transactions: [
        { type: 'outflow', amountPaise: 3_000n, category: 'expense' },
        { type: 'outflow', amountPaise: 2_000n, category: 'expense' },
      ],
    });
    const result = computeDailySummary(input);

    expect(BigInt(result.closingBalancePaise)).toBe(5_000n);
    expect(BigInt(result.cashInflowsPaise)).toBe(0n);
    expect(result.hasDiscrepancy).toBe(false);
  });

  it('should handle large bigint values without overflow', () => {
    const input = buildDailySummaryInput({
      openingBalancePaise: 10_000_000_000n, // ₹10 crore
      transactions: [
        { type: 'inflow', amountPaise: 5_000_000_000n, category: 'collection' },
        { type: 'outflow', amountPaise: 3_000_000_000n, category: 'expense' },
      ],
    });
    const result = computeDailySummary(input);

    expect(BigInt(result.closingBalancePaise)).toBe(12_000_000_000n);
  });

  it('should return all values as strings', () => {
    const result = computeDailySummary(buildDailySummaryInput());

    expect(typeof result.openingBalancePaise).toBe('string');
    expect(typeof result.cashInflowsPaise).toBe('string');
    expect(typeof result.cashOutflowsPaise).toBe('string');
    expect(typeof result.closingBalancePaise).toBe('string');
    expect(typeof result.hasDiscrepancy).toBe('boolean');
  });
});

describe('CashbookService', () => {
  function createMocks() {
    const prisma = {
      $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({})),
      // Default receiving officer is active accountant — service now validates this
      // before creating a handover (Bug fix: loose FK validation).
      users: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'user-2',
          is_active: true,
          role: 'accountant',
        }),
      },
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
      // cashbook NO LONGER writes cash_transactions directly — accounting
      // mirrors it automatically inside createJournalEntry, so an explicit
      // write here would double-count the outflow.
      expect(cashbookRepository.createCashTransaction).not.toHaveBeenCalled();
      expect(auditService.createAuditLog).toHaveBeenCalledOnce();
    });

    it('should create journal entry with DR Expense, CR Cash lines', async () => {
      const { service, accountingService } = createMocks();

      await service.createExpense(
        { category: 'office', amountPaise: 5000, date: '2024-01-15', description: 'Stationery' },
        'user-1',
        'accountant',
      );

      const journalCall = accountingService.createJournalEntry.mock.calls[0]![0];
      expect(journalCall.lines).toHaveLength(2);
      // DR Expense account
      expect(journalCall.lines[0]).toEqual(
        expect.objectContaining({ accountId: 'acc-office', debitPaise: 5000, creditPaise: 0 }),
      );
      // CR Cash account
      expect(journalCall.lines[1]).toEqual(
        expect.objectContaining({ accountId: 'acc-cash', debitPaise: 0, creditPaise: 5000 }),
      );
    });

    it('should send the journal entry with sourceType=EXPENSE so the accounting layer auto-mirrors a single outflow', async () => {
      const { service, accountingService, cashbookRepository } = createMocks();

      await service.createExpense(
        { category: 'office', amountPaise: 7500, date: '2024-02-01', description: 'Supplies' },
        'user-1',
        'accountant',
      );

      // sourceType must be uppercase to match AccountingService.maybeWriteCashTransaction's
      // categoryMap; otherwise the auto-write falls back to 'collection' and the
      // cashbook miscounts the expense.
      const jeArg = accountingService.createJournalEntry.mock.calls[0]![0];
      expect(jeArg.sourceType).toBe('EXPENSE');
      // sourceId must be a real UUID (was 'pending' before — would have thrown
      // on the @db.Uuid cast in production).
      expect(jeArg.sourceId).toMatch(/^[0-9a-f-]{36}$/);

      // Cashbook no longer writes cash_transactions explicitly.
      expect(cashbookRepository.createCashTransaction).not.toHaveBeenCalled();
    });

    it('should create audit log with expense details', async () => {
      const { service, auditService } = createMocks();

      await service.createExpense(
        { category: 'office', amountPaise: 3000, date: '2024-01-20', description: 'Bus fare' },
        'user-1',
        'accountant',
      );

      expect(auditService.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action_type: 'expense_recorded',
          actor_id: 'user-1',
          actor_role: 'accountant',
          target_entity: 'expense',
          after_state: expect.objectContaining({
            category: 'office',
            amountPaise: 3000,
            date: '2024-01-20',
          }),
        }),
        expect.anything(),
      );
    });

    it('should reject unknown expense category without matching account', async () => {
      const { service, accountingRepository } = createMocks();
      accountingRepository.findAccountByCode.mockResolvedValue(null);

      await expect(
        service.createExpense(
          { category: 'unknown', amountPaise: 1000, date: '2024-01-15', description: 'test' },
          'user-1',
          'accountant',
        ),
      ).rejects.toThrow('No expense account found');
    });

    it('should reject when cash account (1001) is missing', async () => {
      const { service, accountingRepository } = createMocks();
      accountingRepository.findAccountByCode.mockImplementation((code: string) => {
        if (code === '1001') return Promise.resolve(null);
        return Promise.resolve({ id: 'acc-x', code, name: `Account ${code}` });
      });

      await expect(
        service.createExpense(
          { category: 'office', amountPaise: 1000, date: '2024-01-15', description: 'test' },
          'user-1',
          'accountant',
        ),
      ).rejects.toThrow('Cash account (1001) not found');
    });

    it('should pass optional documentFileId to expense record', async () => {
      const { service, cashbookRepository } = createMocks();

      await service.createExpense(
        {
          category: 'office',
          amountPaise: 2000,
          date: '2024-01-15',
          description: 'Receipt scan',
          documentFileId: 'doc-uuid-1',
        },
        'user-1',
        'accountant',
      );

      expect(cashbookRepository.createExpense).toHaveBeenCalledWith(
        expect.objectContaining({ document_file_id: 'doc-uuid-1' }),
        expect.anything(),
      );
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

    it('should pass correct data to repository', async () => {
      const { service, cashbookRepository } = createMocks();

      await service.createHandover(
        { totalAmountPaise: 250000, receivingOfficerId: 'user-5', handoverDate: '2024-03-10' },
        'user-3',
        'collection_officer',
      );

      expect(cashbookRepository.createHandover).toHaveBeenCalledWith(
        expect.objectContaining({
          collection_officer_id: 'user-3',
          receiving_officer_id: 'user-5',
          total_amount_paise: 250000n,
        }),
      );
    });

    it('should record actor details in audit log', async () => {
      const { service, auditService } = createMocks();

      await service.createHandover(
        { totalAmountPaise: 50000, receivingOfficerId: 'user-2', handoverDate: '2024-01-15' },
        'user-1',
        'collection_officer',
      );

      expect(auditService.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actor_id: 'user-1',
          actor_role: 'collection_officer',
          target_entity: 'cash_handover',
          after_state: expect.objectContaining({
            totalAmountPaise: 50000,
            receivingOfficerId: 'user-2',
          }),
        }),
      );
    });

    it('should reject when receiving officer does not exist', async () => {
      const { service, prisma, cashbookRepository } = createMocks();
      prisma.users.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.createHandover(
          { totalAmountPaise: 50000, receivingOfficerId: 'missing-uuid', handoverDate: '2024-01-15' },
          'user-1',
          'collection_officer',
        ),
      ).rejects.toThrow('Receiving officer not found');
      expect(cashbookRepository.createHandover).not.toHaveBeenCalled();
    });

    it('should reject when receiving officer is inactive', async () => {
      const { service, prisma, cashbookRepository } = createMocks();
      prisma.users.findUnique.mockResolvedValueOnce({
        id: 'user-2',
        is_active: false,
        role: 'accountant',
      });

      await expect(
        service.createHandover(
          { totalAmountPaise: 50000, receivingOfficerId: 'user-2', handoverDate: '2024-01-15' },
          'user-1',
          'collection_officer',
        ),
      ).rejects.toThrow('not active');
      expect(cashbookRepository.createHandover).not.toHaveBeenCalled();
    });

    it('should reject when receiving officer role is not permitted', async () => {
      const { service, prisma, cashbookRepository } = createMocks();
      prisma.users.findUnique.mockResolvedValueOnce({
        id: 'user-2',
        is_active: true,
        role: 'field_officer',
      });

      await expect(
        service.createHandover(
          { totalAmountPaise: 50000, receivingOfficerId: 'user-2', handoverDate: '2024-01-15' },
          'user-1',
          'collection_officer',
        ),
      ).rejects.toThrow('not permitted to receive cash handovers');
      expect(cashbookRepository.createHandover).not.toHaveBeenCalled();
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

    it('should accept discrepancy with amount and notes', async () => {
      const { service, cashbookRepository } = createMocks();
      cashbookRepository.findHandoverById.mockResolvedValue({
        id: 'hnd-1',
        verification_status: 'pending',
      });
      cashbookRepository.updateHandoverVerification.mockResolvedValue({
        id: 'hnd-1',
        verification_status: 'discrepancy',
        discrepancy_amount_paise: 5000n,
        discrepancy_notes: 'Short by ₹50',
      });

      const result = await service.verifyHandover(
        'hnd-1',
        {
          verificationStatus: 'discrepancy',
          discrepancyAmountPaise: 5000,
          discrepancyNotes: 'Short by ₹50',
        },
        'user-3',
        'accountant',
      );

      expect(result.verification_status).toBe('discrepancy');
      expect(cashbookRepository.updateHandoverVerification).toHaveBeenCalledWith(
        'hnd-1',
        expect.objectContaining({
          verification_status: 'discrepancy',
          discrepancy_amount_paise: 5000n,
          discrepancy_notes: 'Short by ₹50',
        }),
        expect.anything(),
      );
    });

    it('should pass null for discrepancy fields when verifying normally', async () => {
      const { service, cashbookRepository } = createMocks();
      cashbookRepository.findHandoverById.mockResolvedValue({
        id: 'hnd-1',
        verification_status: 'pending',
      });
      cashbookRepository.updateHandoverVerification.mockResolvedValue({
        id: 'hnd-1',
        verification_status: 'verified',
      });

      await service.verifyHandover(
        'hnd-1',
        { verificationStatus: 'verified' },
        'user-3',
        'accountant',
      );

      expect(cashbookRepository.updateHandoverVerification).toHaveBeenCalledWith(
        'hnd-1',
        expect.objectContaining({
          discrepancy_amount_paise: null,
          discrepancy_notes: null,
        }),
        expect.anything(),
      );
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

    it('should use current date when no date parameter provided', async () => {
      const { service, cashbookRepository } = createMocks();

      await service.getDailySummary();

      expect(cashbookRepository.getBalanceBeforeDate).toHaveBeenCalledOnce();
      expect(cashbookRepository.getCashTransactionsForDate).toHaveBeenCalledOnce();
      // The date passed should be a Date object (today, normalized)
      const dateArg = cashbookRepository.getBalanceBeforeDate.mock.calls[0]![0] as Date;
      expect(dateArg).toBeInstanceOf(Date);
    });

    it('should return date string in the result', async () => {
      const { service } = createMocks();

      const result = await service.getDailySummary('2024-06-15');

      expect(result.date).toBe('2024-06-15');
    });

    it('should aggregate income lines for the same account', async () => {
      const { service, cashbookRepository } = createMocks();
      cashbookRepository.getIncomeBySourceForDate.mockResolvedValue([
        { credit_paise: 5000n, account: { id: 'a1', code: '4001', name: 'Interest Income' } },
        { credit_paise: 3000n, account: { id: 'a1', code: '4001', name: 'Interest Income' } },
      ]);

      const result = await service.getDailySummary('2024-01-15');

      expect(result.incomeBySource).toHaveLength(1);
      expect(result.incomeBySource[0]!.amountPaise).toBe('8000');
      expect(result.incomeBySource[0]!.accountCode).toBe('4001');
    });

    it('should return empty incomeBySource when no income lines exist', async () => {
      const { service } = createMocks();

      const result = await service.getDailySummary('2024-01-15');

      expect(result.incomeBySource).toEqual([]);
      expect(result.transactionCount).toBe(0);
    });

    it('should compute opening balance as prior inflows minus prior outflows', async () => {
      const { service, cashbookRepository } = createMocks();
      cashbookRepository.getBalanceBeforeDate.mockResolvedValue({
        totalInflows: 1_000_000n,
        totalOutflows: 400_000n,
      });
      cashbookRepository.getCashTransactionsForDate.mockResolvedValue([]);

      const result = await service.getDailySummary('2024-01-15');

      // Opening = 1000000 - 400000 = 600000, no transactions → closing = opening
      expect(result.openingBalancePaise).toBe('600000');
      expect(result.closingBalancePaise).toBe('600000');
    });
  });

  describe('mapCategoryToAccountCode (via createExpense)', () => {
    const categoryToCode: [string, string][] = [
      ['salary', '5001'],
      ['rent', '5002'],
      ['travel', '5003'],
      ['office', '5004'],
      ['other', '5099'],
    ];

    it.each(categoryToCode)(
      'should map category "%s" to account code "%s"',
      async (category, expectedCode) => {
        const { service, accountingRepository } = createMocks();
        // Return a valid account for any code so createExpense succeeds
        accountingRepository.findAccountByCode.mockImplementation((code: string) =>
          Promise.resolve({ id: `acc-${code}`, code, name: `Account ${code}` }),
        );

        await service.createExpense(
          { category, amountPaise: 1000, date: '2024-01-15', description: 'test' },
          'user-1',
          'accountant',
        );

        // First call is for the expense account code, second is for cash (1001)
        const calls = accountingRepository.findAccountByCode.mock.calls;
        const expenseCodeCall = calls.find((c: string[]) => c[0] !== '1001');
        expect(expenseCodeCall?.[0]).toBe(expectedCode);
      },
    );

    it('should fall back to "5099" for unknown categories', async () => {
      const { service, accountingRepository } = createMocks();
      accountingRepository.findAccountByCode.mockImplementation((code: string) =>
        Promise.resolve({ id: `acc-${code}`, code, name: `Account ${code}` }),
      );

      await service.createExpense(
        { category: 'marketing', amountPaise: 1000, date: '2024-01-15', description: 'test' },
        'user-1',
        'accountant',
      );

      const calls = accountingRepository.findAccountByCode.mock.calls;
      const expenseCodeCall = calls.find((c: string[]) => c[0] !== '1001');
      expect(expenseCodeCall?.[0]).toBe('5099');
    });

    it('should be case-insensitive for category mapping', async () => {
      const { service, accountingRepository } = createMocks();
      accountingRepository.findAccountByCode.mockImplementation((code: string) =>
        Promise.resolve({ id: `acc-${code}`, code, name: `Account ${code}` }),
      );

      await service.createExpense(
        { category: 'SALARY', amountPaise: 1000, date: '2024-01-15', description: 'test' },
        'user-1',
        'accountant',
      );

      const calls = accountingRepository.findAccountByCode.mock.calls;
      const expenseCodeCall = calls.find((c: string[]) => c[0] !== '1001');
      expect(expenseCodeCall?.[0]).toBe('5001');
    });
  });
});
