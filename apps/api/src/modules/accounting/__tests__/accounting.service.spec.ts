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

  describe('createJournalEntry', () => {
    it('should create a balanced journal entry', async () => {
      const dto = makeDto();
      const result = await service.createJournalEntry(dto);
      expect(result.id).toBe('je-1');
      expect(repo.createJournalEntry).toHaveBeenCalledOnce();
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
      // This case is caught by the zero-line check first, but let's verify
      // the zero-total check works if somehow all lines pass individual checks
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
      expect(repo.createJournalEntry).toHaveBeenCalledWith(
        expect.any(Object),
        fakeTx,
      );
    });
  });

  describe('getTrialBalance', () => {
    it('should return balanced trial balance with correct categorization', async () => {
      vi.mocked(repo.getAccountBalances).mockResolvedValue([
        { account_id: 'a1', _sum: { debit_paise: 500000n, credit_paise: 200000n }, _count: {}, _avg: {}, _min: {}, _max: {} },
        { account_id: 'a2', _sum: { debit_paise: 0n, credit_paise: 300000n }, _count: {}, _avg: {}, _min: {}, _max: {} },
      ] as never);
      vi.mocked(repo.findAllAccounts).mockResolvedValue([
        { id: 'a1', code: '1100', name: 'Loans Receivable', category: 'asset', parent_id: null, is_system: true, is_active: true, created_at: new Date() },
        { id: 'a2', code: '4001', name: 'Interest Income', category: 'income', parent_id: null, is_system: true, is_active: true, created_at: new Date() },
      ] as never);

      const result = await service.getTrialBalance('2024-06-30');
      expect(result.isBalanced).toBe(true);
      expect(result.rows).toHaveLength(2);
      // Asset a1: debit balance = 500000 - 200000 = 300000
      expect(result.rows.find((r) => r.code === '1100')?.debitBalancePaise).toBe('300000');
      // Income a2: credit balance = 300000 - 0 = 300000
      expect(result.rows.find((r) => r.code === '4001')?.creditBalancePaise).toBe('300000');
    });
  });

  describe('getProfitAndLoss', () => {
    it('should calculate net profit as income minus expenses', async () => {
      vi.mocked(repo.getJournalLinesWithAccounts).mockResolvedValue([
        { debit_paise: 0n, credit_paise: 50000n, account: { id: 'i1', code: '4001', name: 'Interest Income', category: 'income' } },
        { debit_paise: 20000n, credit_paise: 0n, account: { id: 'e1', code: '5001', name: 'Salary Expense', category: 'expense' } },
      ] as never);

      const result = await service.getProfitAndLoss('2024-01-01', '2024-06-30');
      expect(result.totalIncomePaise).toBe('50000');
      expect(result.totalExpensePaise).toBe('20000');
      expect(result.netProfitPaise).toBe('30000');
    });
  });

  describe('getBalanceSheet', () => {
    it('should satisfy assets = liabilities + equity + retained earnings', async () => {
      vi.mocked(repo.getJournalLinesUpTo).mockResolvedValue([
        // Asset: DR 1000000, CR 0 → balance 1000000
        { debit_paise: 1000000n, credit_paise: 0n, account: { id: 'a1', code: '1100', name: 'Loans Receivable', category: 'asset' } },
        // Equity: DR 0, CR 500000 → balance 500000
        { debit_paise: 0n, credit_paise: 500000n, account: { id: 'eq1', code: '3001', name: "Owner's Equity", category: 'equity' } },
        // Income: DR 0, CR 600000 → retained earnings contribution +600000
        { debit_paise: 0n, credit_paise: 600000n, account: { id: 'i1', code: '4001', name: 'Interest Income', category: 'income' } },
        // Expense: DR 100000, CR 0 → retained earnings contribution -100000
        { debit_paise: 100000n, credit_paise: 0n, account: { id: 'e1', code: '5001', name: 'Salary Expense', category: 'expense' } },
      ] as never);

      const result = await service.getBalanceSheet('2024-06-30');
      // Assets = 1000000
      // Liabilities = 0
      // Equity = 500000
      // Retained earnings = 600000 - 100000 = 500000
      // L + E + RE = 0 + 500000 + 500000 = 1000000
      expect(result.isBalanced).toBe(true);
      expect(result.totalAssetsPaise).toBe('1000000');
      expect(result.retainedEarningsPaise).toBe('500000');
    });
  });

  describe('getDaybook', () => {
    it('should delegate to repository with parsed dates', async () => {
      await service.getDaybook('2024-01-01', '2024-06-30');
      expect(repo.findJournalEntriesByDateRange).toHaveBeenCalledWith(
        new Date('2024-01-01'),
        new Date('2024-06-30'),
      );
    });
  });

  describe('getChartOfAccounts', () => {
    it('should delegate to repository', async () => {
      await service.getChartOfAccounts();
      expect(repo.findAllAccounts).toHaveBeenCalledOnce();
    });
  });

  describe('immutability enforcement', () => {
    it('should not expose any update or delete methods', () => {
      // The service intentionally has no update/delete methods for journal entries
      expect((service as unknown as Record<string, unknown>)['updateJournalEntry']).toBeUndefined();
      expect((service as unknown as Record<string, unknown>)['deleteJournalEntry']).toBeUndefined();
    });
  });
});
