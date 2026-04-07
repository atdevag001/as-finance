import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useChartOfAccounts,
  useDaybook,
  useTrialBalance,
  useProfitLoss,
  useBalanceSheet,
} from '../useAccounting';
import type { ReactNode } from 'react';

// Mock the API client
const mockGet = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
  },
}));

/**
 * useAccounting Hook Tests
 *
 * Tests the accounting hooks for:
 * - Chart of accounts query
 * - Daybook journal entries with date filtering
 * - Trial balance (debits == credits)
 * - Profit & Loss statement
 * - Balance Sheet (assets == liabilities + equity)
 *
 * **Validates: Accounting module queries and financial reporting**
 */

describe('useAccounting Hook', () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
        },
      },
    });
  });

  describe('useChartOfAccounts', () => {
    const mockChartOfAccounts = [
      { id: 'acc-1', code: '1000', name: 'Cash', category: 'asset' },
      { id: 'acc-2', code: '1100', name: 'Bank', category: 'asset' },
      { id: 'acc-3', code: '2000', name: 'Accounts Payable', category: 'liability' },
      { id: 'acc-4', code: '3000', name: 'Capital', category: 'equity' },
      { id: 'acc-5', code: '4000', name: 'Interest Income', category: 'income' },
      { id: 'acc-6', code: '5000', name: 'Salaries', category: 'expense' },
    ];

    it('fetches chart of accounts', async () => {
      mockGet.mockResolvedValueOnce(mockChartOfAccounts);

      const { result } = renderHook(() => useChartOfAccounts(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith('/accounting/chart-of-accounts');
      expect(result.current.data).toEqual(mockChartOfAccounts);
    });

    it('returns all account categories', async () => {
      mockGet.mockResolvedValueOnce(mockChartOfAccounts);

      const { result } = renderHook(() => useChartOfAccounts(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const categories = new Set(result.current.data?.map(a => a.category));
      expect(categories).toContain('asset');
      expect(categories).toContain('liability');
      expect(categories).toContain('income');
      expect(categories).toContain('expense');
      expect(categories).toContain('equity');
    });

    it('returns loading state initially', () => {
      mockGet.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useChartOfAccounts(), { wrapper });

      expect(result.current.isLoading).toBe(true);
    });

    it('handles error state', async () => {
      mockGet.mockRejectedValueOnce(new Error('Server Error'));

      const { result } = renderHook(() => useChartOfAccounts(), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });

    const categoryTests = [
      { category: 'asset', count: 2 },
      { category: 'liability', count: 1 },
      { category: 'equity', count: 1 },
      { category: 'income', count: 1 },
      { category: 'expense', count: 1 },
    ];

    it.each(categoryTests)('returns $count accounts for $category category', async ({ category, count }) => {
      mockGet.mockResolvedValueOnce(mockChartOfAccounts);

      const { result } = renderHook(() => useChartOfAccounts(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const matchingAccounts = result.current.data?.filter(a => a.category === category);
      expect(matchingAccounts?.length).toBe(count);
    });
  });

  describe('useDaybook', () => {
    const mockJournalEntries = [
      {
        id: 'je-1',
        date: '2024-01-15',
        description: 'Loan disbursement',
        sourceType: 'loan_disbursement',
        lines: [
          { accountName: 'Loan Receivable', debitPaise: 5000000, creditPaise: 0 },
          { accountName: 'Cash', debitPaise: 0, creditPaise: 5000000 },
        ],
      },
      {
        id: 'je-2',
        date: '2024-01-16',
        description: 'Collection received',
        sourceType: 'collection',
        lines: [
          { accountName: 'Cash', debitPaise: 466666, creditPaise: 0 },
          { accountName: 'Loan Receivable', debitPaise: 0, creditPaise: 416666 },
          { accountName: 'Interest Income', debitPaise: 0, creditPaise: 50000 },
        ],
      },
    ];

    it('fetches daybook entries without date filter', async () => {
      mockGet.mockResolvedValueOnce(mockJournalEntries);

      const { result } = renderHook(() => useDaybook(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith('/accounting/daybook');
      expect(result.current.data).toEqual(mockJournalEntries);
    });

    it('fetches daybook with date range', async () => {
      mockGet.mockResolvedValueOnce(mockJournalEntries);

      const { result } = renderHook(
        () => useDaybook({ startDate: '2024-01-01', endDate: '2024-01-31' }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith(
        '/accounting/daybook?startDate=2024-01-01&endDate=2024-01-31'
      );
    });

    it('fetches daybook with only startDate', async () => {
      mockGet.mockResolvedValueOnce(mockJournalEntries);

      const { result } = renderHook(
        () => useDaybook({ startDate: '2024-01-01' }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith('/accounting/daybook?startDate=2024-01-01');
    });

    it('fetches daybook with only endDate', async () => {
      mockGet.mockResolvedValueOnce(mockJournalEntries);

      const { result } = renderHook(
        () => useDaybook({ endDate: '2024-01-31' }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith('/accounting/daybook?endDate=2024-01-31');
    });

    it('journal entries have balanced debits and credits', async () => {
      mockGet.mockResolvedValueOnce(mockJournalEntries);

      const { result } = renderHook(() => useDaybook(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      result.current.data?.forEach(entry => {
        const totalDebits = entry.lines.reduce((sum, line) => sum + line.debitPaise, 0);
        const totalCredits = entry.lines.reduce((sum, line) => sum + line.creditPaise, 0);
        expect(totalDebits).toBe(totalCredits);
      });
    });

    it('returns loading state initially', () => {
      mockGet.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useDaybook(), { wrapper });

      expect(result.current.isLoading).toBe(true);
    });

    it('handles error state', async () => {
      mockGet.mockRejectedValueOnce(new Error('Server Error'));

      const { result } = renderHook(() => useDaybook(), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe('useTrialBalance', () => {
    const mockTrialBalance = [
      { accountCode: '1000', accountName: 'Cash', debitPaise: 1000000, creditPaise: 0 },
      { accountCode: '1100', accountName: 'Bank', debitPaise: 5000000, creditPaise: 0 },
      { accountCode: '1200', accountName: 'Loan Receivable', debitPaise: 10000000, creditPaise: 0 },
      { accountCode: '2000', accountName: 'Accounts Payable', debitPaise: 0, creditPaise: 500000 },
      { accountCode: '3000', accountName: 'Capital', debitPaise: 0, creditPaise: 10000000 },
      { accountCode: '4000', accountName: 'Interest Income', debitPaise: 0, creditPaise: 5500000 },
    ];

    it('fetches trial balance', async () => {
      mockGet.mockResolvedValueOnce(mockTrialBalance);

      const { result } = renderHook(() => useTrialBalance(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith('/accounting/trial-balance');
      expect(result.current.data).toEqual(mockTrialBalance);
    });

    it('fetches trial balance with date range', async () => {
      mockGet.mockResolvedValueOnce(mockTrialBalance);

      const { result } = renderHook(
        () => useTrialBalance({ startDate: '2024-01-01', endDate: '2024-01-31' }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith(
        '/accounting/trial-balance?startDate=2024-01-01&endDate=2024-01-31'
      );
    });

    it('total debits equal total credits', async () => {
      mockGet.mockResolvedValueOnce(mockTrialBalance);

      const { result } = renderHook(() => useTrialBalance(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const totalDebits = result.current.data!.reduce((sum, row) => sum + row.debitPaise, 0);
      const totalCredits = result.current.data!.reduce((sum, row) => sum + row.creditPaise, 0);
      expect(totalDebits).toBe(totalCredits);
    });

    it('amounts are in paise (integers)', async () => {
      mockGet.mockResolvedValueOnce(mockTrialBalance);

      const { result } = renderHook(() => useTrialBalance(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      result.current.data?.forEach(row => {
        expect(Number.isInteger(row.debitPaise)).toBe(true);
        expect(Number.isInteger(row.creditPaise)).toBe(true);
      });
    });

    it('returns loading state initially', () => {
      mockGet.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useTrialBalance(), { wrapper });

      expect(result.current.isLoading).toBe(true);
    });

    it('handles error state', async () => {
      mockGet.mockRejectedValueOnce(new Error('Server Error'));

      const { result } = renderHook(() => useTrialBalance(), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe('useProfitLoss', () => {
    const mockProfitLoss = {
      income: [
        { category: 'Interest Income', totalPaise: 5000000 },
        { category: 'Processing Fees', totalPaise: 500000 },
        { category: 'Penalty Income', totalPaise: 200000 },
      ],
      expenses: [
        { category: 'Salaries', totalPaise: 2000000 },
        { category: 'Rent', totalPaise: 300000 },
        { category: 'Utilities', totalPaise: 100000 },
      ],
      netProfitPaise: 3300000,
    };

    it('fetches profit & loss report', async () => {
      mockGet.mockResolvedValueOnce(mockProfitLoss);

      const { result } = renderHook(() => useProfitLoss(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith('/accounting/profit-loss');
      expect(result.current.data).toEqual(mockProfitLoss);
    });

    it('fetches profit & loss with date range', async () => {
      mockGet.mockResolvedValueOnce(mockProfitLoss);

      const { result } = renderHook(
        () => useProfitLoss({ startDate: '2024-01-01', endDate: '2024-01-31' }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith(
        '/accounting/profit-loss?startDate=2024-01-01&endDate=2024-01-31'
      );
    });

    it('net profit = total income - total expenses', async () => {
      mockGet.mockResolvedValueOnce(mockProfitLoss);

      const { result } = renderHook(() => useProfitLoss(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const pl = result.current.data!;
      const totalIncome = pl.income.reduce((sum, i) => sum + i.totalPaise, 0);
      const totalExpenses = pl.expenses.reduce((sum, e) => sum + e.totalPaise, 0);
      expect(pl.netProfitPaise).toBe(totalIncome - totalExpenses);
    });

    it('returns income categories', async () => {
      mockGet.mockResolvedValueOnce(mockProfitLoss);

      const { result } = renderHook(() => useProfitLoss(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.income.length).toBeGreaterThan(0);
      result.current.data?.income.forEach(item => {
        expect(item.category).toBeDefined();
        expect(item.totalPaise).toBeDefined();
      });
    });

    it('returns expense categories', async () => {
      mockGet.mockResolvedValueOnce(mockProfitLoss);

      const { result } = renderHook(() => useProfitLoss(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.expenses.length).toBeGreaterThan(0);
      result.current.data?.expenses.forEach(item => {
        expect(item.category).toBeDefined();
        expect(item.totalPaise).toBeDefined();
      });
    });

    it('amounts are in paise (integers)', async () => {
      mockGet.mockResolvedValueOnce(mockProfitLoss);

      const { result } = renderHook(() => useProfitLoss(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const pl = result.current.data!;
      expect(Number.isInteger(pl.netProfitPaise)).toBe(true);
      pl.income.forEach(i => expect(Number.isInteger(i.totalPaise)).toBe(true));
      pl.expenses.forEach(e => expect(Number.isInteger(e.totalPaise)).toBe(true));
    });

    it('returns loading state initially', () => {
      mockGet.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useProfitLoss(), { wrapper });

      expect(result.current.isLoading).toBe(true);
    });

    it('handles error state', async () => {
      mockGet.mockRejectedValueOnce(new Error('Server Error'));

      const { result } = renderHook(() => useProfitLoss(), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe('useBalanceSheet', () => {
    const mockBalanceSheet = {
      assets: [
        { name: 'Cash', totalPaise: 1000000 },
        { name: 'Bank', totalPaise: 5000000 },
        { name: 'Loan Receivable', totalPaise: 10000000 },
      ],
      liabilities: [
        { name: 'Accounts Payable', totalPaise: 500000 },
        { name: 'Borrowings', totalPaise: 5500000 },
      ],
      equity: [
        { name: 'Capital', totalPaise: 7000000 },
        { name: 'Retained Earnings', totalPaise: 3000000 },
      ],
    };

    it('fetches balance sheet', async () => {
      mockGet.mockResolvedValueOnce(mockBalanceSheet);

      const { result } = renderHook(() => useBalanceSheet(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith('/accounting/balance-sheet');
      expect(result.current.data).toEqual(mockBalanceSheet);
    });

    it('fetches balance sheet with date range', async () => {
      mockGet.mockResolvedValueOnce(mockBalanceSheet);

      const { result } = renderHook(
        () => useBalanceSheet({ startDate: '2024-01-01', endDate: '2024-01-31' }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith(
        '/accounting/balance-sheet?startDate=2024-01-01&endDate=2024-01-31'
      );
    });

    it('assets = liabilities + equity', async () => {
      mockGet.mockResolvedValueOnce(mockBalanceSheet);

      const { result } = renderHook(() => useBalanceSheet(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const bs = result.current.data!;
      const totalAssets = bs.assets.reduce((sum, a) => sum + a.totalPaise, 0);
      const totalLiabilities = bs.liabilities.reduce((sum, l) => sum + l.totalPaise, 0);
      const totalEquity = bs.equity.reduce((sum, e) => sum + e.totalPaise, 0);
      expect(totalAssets).toBe(totalLiabilities + totalEquity);
    });

    it('returns assets list', async () => {
      mockGet.mockResolvedValueOnce(mockBalanceSheet);

      const { result } = renderHook(() => useBalanceSheet(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.assets.length).toBeGreaterThan(0);
      result.current.data?.assets.forEach(item => {
        expect(item.name).toBeDefined();
        expect(item.totalPaise).toBeDefined();
      });
    });

    it('returns liabilities list', async () => {
      mockGet.mockResolvedValueOnce(mockBalanceSheet);

      const { result } = renderHook(() => useBalanceSheet(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.liabilities.length).toBeGreaterThan(0);
      result.current.data?.liabilities.forEach(item => {
        expect(item.name).toBeDefined();
        expect(item.totalPaise).toBeDefined();
      });
    });

    it('returns equity list', async () => {
      mockGet.mockResolvedValueOnce(mockBalanceSheet);

      const { result } = renderHook(() => useBalanceSheet(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.equity.length).toBeGreaterThan(0);
      result.current.data?.equity.forEach(item => {
        expect(item.name).toBeDefined();
        expect(item.totalPaise).toBeDefined();
      });
    });

    it('amounts are in paise (integers)', async () => {
      mockGet.mockResolvedValueOnce(mockBalanceSheet);

      const { result } = renderHook(() => useBalanceSheet(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const bs = result.current.data!;
      bs.assets.forEach(a => expect(Number.isInteger(a.totalPaise)).toBe(true));
      bs.liabilities.forEach(l => expect(Number.isInteger(l.totalPaise)).toBe(true));
      bs.equity.forEach(e => expect(Number.isInteger(e.totalPaise)).toBe(true));
    });

    it('returns loading state initially', () => {
      mockGet.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useBalanceSheet(), { wrapper });

      expect(result.current.isLoading).toBe(true);
    });

    it('handles error state', async () => {
      mockGet.mockRejectedValueOnce(new Error('Server Error'));

      const { result } = renderHook(() => useBalanceSheet(), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });
});
