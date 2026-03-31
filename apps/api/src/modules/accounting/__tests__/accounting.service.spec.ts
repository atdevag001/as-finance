import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AccountingService } from '../accounting.service';
import { AccountingRepository } from '../accounting.repository';
import { CreateJournalEntryDto } from '../dto/create-journal-entry.dto';
import { JournalSourceType } from '@as-finance/shared';
import { BusinessRuleError } from '../../../common/errors';

function makeDto(overrides: Partial<CreateJournalEntryDto> = {}): CreateJournalEntryDto {
  const dto = new CreateJournalEntryDto();
  dto.date = '2024-06-15';
  dto.description = 'Test entry';
  dto.sourceType = JournalSourceType.DISBURSEMENT;
  dto.sourceId = '00000000-0000-0000-0000-000000000001';
  dto.createdBy = '00000000-0000-0000-0000-000000000099';
  dto.lines = [
    { accountId: 'acc-1', debitPaise: 100000, creditPaise: 0 },
    { accountId: 'acc-2', debitPaise: 0, creditPaise: 100000 },
  ];
  return Object.assign(dto, overrides);
}

function makeAccount(id: string, code: string, name: string, category: string) {
  return { id, code, name, category, parent_id: null, is_system: true, is_active: true, created_at: new Date() };
}

function makeBalance(account_id: string, debit: bigint, credit: bigint) {
  return { account_id, _sum: { debit_paise: debit, credit_paise: credit } } as never;
}

function makeLine(debit: bigint, credit: bigint, account: { id: string; code: string; name: string; category: string }) {
  return { debit_paise: debit, credit_paise: credit, account } as never;
}

describe('AccountingService', () => {
  let service: AccountingService;
  let repo: AccountingRepository;

  beforeEach(() => {
    repo = {
      createJournalEntry: vi.fn().mockResolvedValue({
        id: 'je-1',
        entry_date: new Date('2024-06-15'),
        description: 'Test entry',
        source_type: 'disbursement',
        source_id: '00000000-0000-0000-0000-000000000001',
        total_debit_paise: 100000n,
        total_credit_paise: 100000n,
        created_by: '00000000-0000-0000-0000-000000000099',
        created_at: new Date(),
        lines: [],
      }),
      findAllAccounts: vi.fn().mockResolvedValue([]),
      findAccountById: vi.fn(),
      findAccountByCode: vi.fn(),
      findJournalEntriesByDateRange: vi.fn().mockResolvedValue([]),
      findJournalEntries: vi.fn().mockResolvedValue({ data: [], total: 0 }),
      getAccountBalances: vi.fn().mockResolvedValue([]),
      getJournalLinesWithAccounts: vi.fn().mockResolvedValue([]),
      getJournalLinesUpTo: vi.fn().mockResolvedValue([]),
    } as unknown as AccountingRepository;

    service = new AccountingService(repo);
  });

  // --- Requirement 21.1 & 21.2: createJournalEntry balanced / unbalanced ---
  describe('createJournalEntry', () => {
    it('should create a balanced journal entry', async () => {
      const dto = makeDto();
      const result = await service.createJournalEntry(dto);
      expect(result.id).toBe('je-1');
      expect(repo.createJournalEntry).toHaveBeenCalledOnce();
    });

    it('should pass correct data shape to repository', async () => {
      const dto = makeDto();
      await service.createJournalEntry(dto);
      expect(repo.createJournalEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          entry_date: new Date('2024-06-15'),
          description: 'Test entry',
          source_type: JournalSourceType.DISBURSEMENT,
          source_id: '00000000-0000-0000-0000-000000000001',
          total_debit_paise: 100000n,
          total_credit_paise: 100000n,
          created_by: '00000000-0000-0000-0000-000000000099',
        }),
        undefined,
      );
    });

    it('should reject unbalanced entries (debits != credits)', async () => {
      const dto = makeDto({
        lines: [
          { accountId: 'acc-1', debitPaise: 100000, creditPaise: 0 },
          { accountId: 'acc-2', debitPaise: 0, creditPaise: 50000 },
        ],
      });
      await expect(service.createJournalEntry(dto)).rejects.toThrow(BusinessRuleError);
      await expect(service.createJournalEntry(dto)).rejects.toThrow(/unbalanced/i);
    });

    it('should reject entries with negative amounts', async () => {
      const dto = makeDto({
        lines: [
          { accountId: 'acc-1', debitPaise: -100, creditPaise: 0 },
          { accountId: 'acc-2', debitPaise: 0, creditPaise: -100 },
        ],
      });
      await expect(service.createJournalEntry(dto)).rejects.toThrow(BusinessRuleError);
      await expect(service.createJournalEntry(dto)).rejects.toThrow(/non-negative/i);
    });

    it('should reject lines with both debit and credit', async () => {
      const dto = makeDto({
        lines: [
          { accountId: 'acc-1', debitPaise: 100, creditPaise: 100 },
          { accountId: 'acc-2', debitPaise: 0, creditPaise: 0 },
        ],
      });
      await expect(service.createJournalEntry(dto)).rejects.toThrow(BusinessRuleError);
      await expect(service.createJournalEntry(dto)).rejects.toThrow(/both debit and credit/i);
    });

    it('should reject lines with zero debit and zero credit', async () => {
      const dto = makeDto({
        lines: [
          { accountId: 'acc-1', debitPaise: 0, creditPaise: 0 },
          { accountId: 'acc-2', debitPaise: 100, creditPaise: 0 },
        ],
      });
      await expect(service.createJournalEntry(dto)).rejects.toThrow(BusinessRuleError);
      await expect(service.createJournalEntry(dto)).rejects.toThrow(/non-zero/i);
    });

    it('should reject entries with zero totals', async () => {
      const dto = makeDto({
        lines: [
          { accountId: 'acc-1', debitPaise: 0, creditPaise: 0 },
          { accountId: 'acc-2', debitPaise: 0, creditPaise: 0 },
        ],
      });
      await expect(service.createJournalEntry(dto)).rejects.toThrow(BusinessRuleError);
    });

    it('should pass transaction client to repository', async () => {
      const dto = makeDto();
      const fakeTx = { journal_entries: { create: vi.fn() } };
      await service.createJournalEntry(dto, fakeTx as never);
      expect(repo.createJournalEntry).toHaveBeenCalledWith(expect.any(Object), fakeTx);
    });

    it('should handle multi-line balanced entries (3+ lines)', async () => {
      const dto = makeDto({
        lines: [
          { accountId: 'acc-1', debitPaise: 50000, creditPaise: 0 },
          { accountId: 'acc-2', debitPaise: 50000, creditPaise: 0 },
          { accountId: 'acc-3', debitPaise: 0, creditPaise: 100000 },
        ],
      });
      const result = await service.createJournalEntry(dto);
      expect(result.id).toBe('je-1');
    });

    it('should handle large BigInt amounts correctly', async () => {
      const dto = makeDto({
        lines: [
          { accountId: 'acc-1', debitPaise: 9_999_999_999, creditPaise: 0 },
          { accountId: 'acc-2', debitPaise: 0, creditPaise: 9_999_999_999 },
        ],
      });
      await service.createJournalEntry(dto);
      expect(repo.createJournalEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          total_debit_paise: 9_999_999_999n,
          total_credit_paise: 9_999_999_999n,
        }),
        undefined,
      );
    });

    it('should support all JournalSourceType values', async () => {
      for (const sourceType of Object.values(JournalSourceType)) {
        const dto = makeDto({ sourceType });
        await service.createJournalEntry(dto);
      }
      expect(repo.createJournalEntry).toHaveBeenCalledTimes(Object.values(JournalSourceType).length);
    });
  });

  // --- Requirement 21.3: getTrialBalance ---
  describe('getTrialBalance', () => {
    it('should return balanced trial balance with asset and income accounts', async () => {
      vi.mocked(repo.getAccountBalances).mockResolvedValue([
        makeBalance('a1', 500000n, 200000n),
        makeBalance('a2', 0n, 300000n),
      ]);
      vi.mocked(repo.findAllAccounts).mockResolvedValue([
        makeAccount('a1', '1100', 'Loans Receivable', 'asset'),
        makeAccount('a2', '4001', 'Interest Income', 'income'),
      ] as never);

      const result = await service.getTrialBalance('2024-06-30');
      expect(result.isBalanced).toBe(true);
      expect(result.rows).toHaveLength(2);
      expect(result.rows.find((r) => r.code === '1100')?.debitBalancePaise).toBe('300000');
      expect(result.rows.find((r) => r.code === '4001')?.creditBalancePaise).toBe('300000');
    });

    it('should return empty trial balance when no entries exist', async () => {
      const result = await service.getTrialBalance('2024-06-30');
      expect(result.rows).toHaveLength(0);
      expect(result.isBalanced).toBe(true);
      expect(result.totalDebitBalancePaise).toBe('0');
      expect(result.totalCreditBalancePaise).toBe('0');
    });

    it('should use current date when asOfDate is not provided', async () => {
      const result = await service.getTrialBalance();
      expect(result.asOfDate).toBe(new Date().toISOString().split('T')[0]);
    });

    it('should categorize all five account types correctly', async () => {
      vi.mocked(repo.getAccountBalances).mockResolvedValue([
        makeBalance('a1', 100000n, 0n),
        makeBalance('a2', 0n, 30000n),
        makeBalance('a3', 0n, 20000n),
        makeBalance('a4', 0n, 10000n),
        makeBalance('a5', 40000n, 0n),
      ]);
      vi.mocked(repo.findAllAccounts).mockResolvedValue([
        makeAccount('a1', '1100', 'Cash', 'asset'),
        makeAccount('a2', '2100', 'Payable', 'liability'),
        makeAccount('a3', '3100', 'Equity', 'equity'),
        makeAccount('a4', '4100', 'Income', 'income'),
        makeAccount('a5', '5100', 'Expense', 'expense'),
      ] as never);

      const result = await service.getTrialBalance('2024-12-31');
      // asset (debit-normal): 100000 - 0 = 100000 debit
      expect(result.rows.find((r) => r.code === '1100')?.debitBalancePaise).toBe('100000');
      // liability (credit-normal): 30000 - 0 = 30000 credit
      expect(result.rows.find((r) => r.code === '2100')?.creditBalancePaise).toBe('30000');
      // equity (credit-normal): 20000 - 0 = 20000 credit
      expect(result.rows.find((r) => r.code === '3100')?.creditBalancePaise).toBe('20000');
      // income (credit-normal): 10000 - 0 = 10000 credit
      expect(result.rows.find((r) => r.code === '4100')?.creditBalancePaise).toBe('10000');
      // expense (debit-normal): 40000 - 0 = 40000 debit
      expect(result.rows.find((r) => r.code === '5100')?.debitBalancePaise).toBe('40000');
      // Total debit = 100000 + 40000 = 140000, credit = 30000 + 20000 + 10000 = 60000
      expect(result.totalDebitBalancePaise).toBe('140000');
      expect(result.totalCreditBalancePaise).toBe('60000');
      expect(result.isBalanced).toBe(false);
    });

    it('should handle credit-normal account with negative balance (shows as debit)', async () => {
      // Liability account with more debits than credits → negative balance → shows as debit
      vi.mocked(repo.getAccountBalances).mockResolvedValue([
        makeBalance('a1', 50000n, 20000n),
      ]);
      vi.mocked(repo.findAllAccounts).mockResolvedValue([
        makeAccount('a1', '2100', 'Payable', 'liability'),
      ] as never);

      const result = await service.getTrialBalance('2024-06-30');
      // liability: credit-normal, balance = 20000 - 50000 = -30000 → shows as debit 30000
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]!.debitBalancePaise).toBe('30000');
      expect(result.rows[0]!.creditBalancePaise).toBe('0');
    });
  });

  // --- Requirement 21.4: getProfitAndLoss ---
  describe('getProfitAndLoss', () => {
    it('should calculate net profit as income minus expenses', async () => {
      vi.mocked(repo.getJournalLinesWithAccounts).mockResolvedValue([
        makeLine(0n, 50000n, { id: 'i1', code: '4001', name: 'Interest Income', category: 'income' }),
        makeLine(20000n, 0n, { id: 'e1', code: '5001', name: 'Salary Expense', category: 'expense' }),
      ]);

      const result = await service.getProfitAndLoss('2024-01-01', '2024-06-30');
      expect(result.totalIncomePaise).toBe('50000');
      expect(result.totalExpensePaise).toBe('20000');
      expect(result.netProfitPaise).toBe('30000');
      expect(result.startDate).toBe('2024-01-01');
      expect(result.endDate).toBe('2024-06-30');
    });

    it('should return zero when no income or expense lines exist', async () => {
      vi.mocked(repo.getJournalLinesWithAccounts).mockResolvedValue([]);

      const result = await service.getProfitAndLoss('2024-01-01', '2024-06-30');
      expect(result.totalIncomePaise).toBe('0');
      expect(result.totalExpensePaise).toBe('0');
      expect(result.netProfitPaise).toBe('0');
      expect(result.income).toHaveLength(0);
      expect(result.expenses).toHaveLength(0);
    });

    it('should aggregate multiple income and expense accounts', async () => {
      vi.mocked(repo.getJournalLinesWithAccounts).mockResolvedValue([
        makeLine(0n, 30000n, { id: 'i1', code: '4001', name: 'Interest Income', category: 'income' }),
        makeLine(0n, 20000n, { id: 'i2', code: '4002', name: 'Fee Income', category: 'income' }),
        makeLine(10000n, 0n, { id: 'e1', code: '5001', name: 'Salary', category: 'expense' }),
        makeLine(5000n, 0n, { id: 'e2', code: '5002', name: 'Rent', category: 'expense' }),
      ]);

      const result = await service.getProfitAndLoss('2024-01-01', '2024-12-31');
      expect(result.income).toHaveLength(2);
      expect(result.expenses).toHaveLength(2);
      expect(result.totalIncomePaise).toBe('50000');
      expect(result.totalExpensePaise).toBe('15000');
      expect(result.netProfitPaise).toBe('35000');
    });

    it('should show net loss when expenses exceed income', async () => {
      vi.mocked(repo.getJournalLinesWithAccounts).mockResolvedValue([
        makeLine(0n, 10000n, { id: 'i1', code: '4001', name: 'Income', category: 'income' }),
        makeLine(50000n, 0n, { id: 'e1', code: '5001', name: 'Expense', category: 'expense' }),
      ]);

      const result = await service.getProfitAndLoss('2024-01-01', '2024-06-30');
      expect(result.netProfitPaise).toBe('-40000');
    });

    it('should ignore non-income/non-expense accounts', async () => {
      vi.mocked(repo.getJournalLinesWithAccounts).mockResolvedValue([
        makeLine(100000n, 0n, { id: 'a1', code: '1100', name: 'Cash', category: 'asset' }),
        makeLine(0n, 100000n, { id: 'l1', code: '2100', name: 'Payable', category: 'liability' }),
        makeLine(0n, 50000n, { id: 'i1', code: '4001', name: 'Income', category: 'income' }),
      ]);

      const result = await service.getProfitAndLoss('2024-01-01', '2024-06-30');
      expect(result.income).toHaveLength(1);
      expect(result.expenses).toHaveLength(0);
      expect(result.totalIncomePaise).toBe('50000');
    });

    it('should accumulate multiple lines for the same account', async () => {
      vi.mocked(repo.getJournalLinesWithAccounts).mockResolvedValue([
        makeLine(0n, 30000n, { id: 'i1', code: '4001', name: 'Interest Income', category: 'income' }),
        makeLine(0n, 20000n, { id: 'i1', code: '4001', name: 'Interest Income', category: 'income' }),
      ]);

      const result = await service.getProfitAndLoss('2024-01-01', '2024-06-30');
      expect(result.income).toHaveLength(1);
      expect(result.totalIncomePaise).toBe('50000');
    });
  });

  // --- Requirement 21.5: getBalanceSheet ---
  describe('getBalanceSheet', () => {
    it('should satisfy assets = liabilities + equity + retained earnings', async () => {
      vi.mocked(repo.getJournalLinesUpTo).mockResolvedValue([
        makeLine(1000000n, 0n, { id: 'a1', code: '1100', name: 'Loans Receivable', category: 'asset' }),
        makeLine(0n, 500000n, { id: 'eq1', code: '3001', name: "Owner's Equity", category: 'equity' }),
        makeLine(0n, 600000n, { id: 'i1', code: '4001', name: 'Interest Income', category: 'income' }),
        makeLine(100000n, 0n, { id: 'e1', code: '5001', name: 'Salary Expense', category: 'expense' }),
      ]);

      const result = await service.getBalanceSheet('2024-06-30');
      expect(result.isBalanced).toBe(true);
      expect(result.totalAssetsPaise).toBe('1000000');
      expect(result.totalEquityPaise).toBe('500000');
      expect(result.retainedEarningsPaise).toBe('500000');
      expect(result.totalLiabilitiesAndEquityPaise).toBe('1000000');
    });

    it('should return empty balance sheet when no entries exist', async () => {
      vi.mocked(repo.getJournalLinesUpTo).mockResolvedValue([]);

      const result = await service.getBalanceSheet('2024-06-30');
      expect(result.isBalanced).toBe(true);
      expect(result.totalAssetsPaise).toBe('0');
      expect(result.totalLiabilitiesPaise).toBe('0');
      expect(result.totalEquityPaise).toBe('0');
      expect(result.retainedEarningsPaise).toBe('0');
      expect(result.assets).toHaveLength(0);
    });

    it('should use current date when asOfDate is not provided', async () => {
      vi.mocked(repo.getJournalLinesUpTo).mockResolvedValue([]);

      const result = await service.getBalanceSheet();
      expect(result.asOfDate).toBe(new Date().toISOString().split('T')[0]);
    });

    it('should include liabilities in the equation', async () => {
      vi.mocked(repo.getJournalLinesUpTo).mockResolvedValue([
        makeLine(200000n, 0n, { id: 'a1', code: '1100', name: 'Cash', category: 'asset' }),
        makeLine(0n, 100000n, { id: 'l1', code: '2100', name: 'Loan Payable', category: 'liability' }),
        makeLine(0n, 100000n, { id: 'eq1', code: '3001', name: 'Equity', category: 'equity' }),
      ]);

      const result = await service.getBalanceSheet('2024-12-31');
      expect(result.isBalanced).toBe(true);
      expect(result.totalAssetsPaise).toBe('200000');
      expect(result.totalLiabilitiesPaise).toBe('100000');
      expect(result.totalEquityPaise).toBe('100000');
      expect(result.retainedEarningsPaise).toBe('0');
      expect(result.liabilities).toHaveLength(1);
    });

    it('should detect unbalanced balance sheet', async () => {
      vi.mocked(repo.getJournalLinesUpTo).mockResolvedValue([
        makeLine(500000n, 0n, { id: 'a1', code: '1100', name: 'Cash', category: 'asset' }),
        makeLine(0n, 100000n, { id: 'eq1', code: '3001', name: 'Equity', category: 'equity' }),
      ]);

      const result = await service.getBalanceSheet('2024-06-30');
      // Assets = 500000, L+E+RE = 0 + 100000 + 0 = 100000 → unbalanced
      expect(result.isBalanced).toBe(false);
    });

    it('should accumulate multiple lines for the same account', async () => {
      vi.mocked(repo.getJournalLinesUpTo).mockResolvedValue([
        makeLine(100000n, 0n, { id: 'a1', code: '1100', name: 'Cash', category: 'asset' }),
        makeLine(200000n, 0n, { id: 'a1', code: '1100', name: 'Cash', category: 'asset' }),
        makeLine(0n, 300000n, { id: 'eq1', code: '3001', name: 'Equity', category: 'equity' }),
      ]);

      const result = await service.getBalanceSheet('2024-06-30');
      expect(result.isBalanced).toBe(true);
      expect(result.totalAssetsPaise).toBe('300000');
      expect(result.assets).toHaveLength(1);
    });
  });

  // --- Requirement 21.6: getDaybook ---
  describe('getDaybook', () => {
    it('should delegate to repository with parsed dates', async () => {
      await service.getDaybook('2024-01-01', '2024-06-30');
      expect(repo.findJournalEntriesByDateRange).toHaveBeenCalledWith(
        new Date('2024-01-01'),
        new Date('2024-06-30'),
      );
    });

    it('should return journal entries from repository', async () => {
      const entries = [
        { id: 'je-1', entry_date: new Date('2024-03-01'), description: 'Entry 1', lines: [] },
        { id: 'je-2', entry_date: new Date('2024-04-01'), description: 'Entry 2', lines: [] },
      ];
      vi.mocked(repo.findJournalEntriesByDateRange).mockResolvedValue(entries as never);

      const result = await service.getDaybook('2024-01-01', '2024-06-30');
      expect(result).toEqual(entries);
      expect(result).toHaveLength(2);
    });
  });

  // --- Requirement 21.7: getChartOfAccounts ---
  describe('getChartOfAccounts', () => {
    it('should delegate to repository', async () => {
      await service.getChartOfAccounts();
      expect(repo.findAllAccounts).toHaveBeenCalledOnce();
    });

    it('should return all accounts from repository', async () => {
      const accounts = [
        makeAccount('a1', '1100', 'Cash', 'asset'),
        makeAccount('a2', '2100', 'Payable', 'liability'),
        makeAccount('a3', '4001', 'Interest Income', 'income'),
      ];
      vi.mocked(repo.findAllAccounts).mockResolvedValue(accounts as never);

      const result = await service.getChartOfAccounts();
      expect(result).toHaveLength(3);
      expect(result).toEqual(accounts);
    });
  });

  // --- Additional: getJournalEntries with filtering/pagination ---
  describe('getJournalEntries', () => {
    it('should pass filter params to repository', async () => {
      await service.getJournalEntries({
        skip: 0,
        take: 10,
        sourceType: 'collection',
        sourceId: 'loan-1',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      });
      expect(repo.findJournalEntries).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        sourceType: 'collection',
        sourceId: 'loan-1',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
      });
    });

    it('should handle optional params gracefully', async () => {
      await service.getJournalEntries({});
      expect(repo.findJournalEntries).toHaveBeenCalledWith({
        skip: undefined,
        take: undefined,
        sourceType: undefined,
        sourceId: undefined,
        startDate: undefined,
        endDate: undefined,
      });
    });
  });

  // --- Immutability enforcement ---
  describe('immutability enforcement', () => {
    it('should not expose any update or delete methods for journal entries', () => {
      const svc = service as unknown as Record<string, unknown>;
      expect(svc['updateJournalEntry']).toBeUndefined();
      expect(svc['deleteJournalEntry']).toBeUndefined();
    });
  });
});
