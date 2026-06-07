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
    const mockBackendJournalEntries = [
      {
        id: 'je-1',
        entry_date: '2024-01-15',
        description: 'Loan disbursement',
        source_type: 'loan_disbursement',
        source_id: 'loan-1',
        total_debit_paise: '5000000',
        total_credit_paise: '5000000',
        created_by: 'user-1',
        created_at: '2024-01-15T10:00:00.000Z',
        lines: [
          { id: 'line-1', account_id: 'acc-1', debit_paise: '5000000', credit_paise: '0', account: { id: 'acc-1', code: '1200', name: 'Loan Receivable', category: 'asset' } },
          { id: 'line-2', account_id: 'acc-2', debit_paise: '0', credit_paise: '5000000', account: { id: 'acc-2', code: '1000', name: 'Cash', category: 'asset' } },
        ],
      },
      {
        id: 'je-2',
        entry_date: '2024-01-16',
        description: 'Collection received',
        source_type: 'collection',
        source_id: 'coll-1',
        total_debit_paise: '466666',
        total_credit_paise: '466666',
        created_by: 'user-1',
        created_at: '2024-01-16T10:00:00.000Z',
        lines: [
          { id: 'line-3', account_id: 'acc-2', debit_paise: '466666', credit_paise: '0', account: { id: 'acc-2', code: '1000', name: 'Cash', category: 'asset' } },
          { id: 'line-4', account_id: 'acc-1', debit_paise: '0', credit_paise: '416666', account: { id: 'acc-1', code: '1200', name: 'Loan Receivable', category: 'asset' } },
          { id: 'line-5', account_id: 'acc-3', debit_paise: '0', credit_paise: '50000', account: { id: 'acc-3', code: '4000', name: 'Interest Income', category: 'income' } },
        ],
      },
    ];

    it('fetches daybook entries without date filter', async () => {
      mockGet.mockResolvedValueOnce(mockBackendJournalEntries);

      const { result } = renderHook(() => useDaybook(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith('/accounting/daybook');
      expect(result.current.data).toHaveLength(2);
      expect(result.current.data?.[0].total_debit_paise).toBe(5000000);
      expect(result.current.data?.[0].lines[0].debit_paise).toBe(5000000);
    });

    it('fetches daybook with date range', async () => {
      mockGet.mockResolvedValueOnce(mockBackendJournalEntries);

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
      mockGet.mockResolvedValueOnce(mockBackendJournalEntries);

      const { result } = renderHook(
        () => useDaybook({ startDate: '2024-01-01' }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith('/accounting/daybook?startDate=2024-01-01');
    });

    it('fetches daybook with only endDate', async () => {
      mockGet.mockResolvedValueOnce(mockBackendJournalEntries);

      const { result } = renderHook(
        () => useDaybook({ endDate: '2024-01-31' }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith('/accounting/daybook?endDate=2024-01-31');
    });

    it('journal entries have balanced debits and credits', async () => {
      mockGet.mockResolvedValueOnce(mockBackendJournalEntries);

      const { result } = renderHook(() => useDaybook(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      result.current.data?.forEach(entry => {
        const totalDebits = entry.lines.reduce((sum, line) => sum + line.debit_paise, 0);
        const totalCredits = entry.lines.reduce((sum, line) => sum + line.credit_paise, 0);
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
    // Backend format mock data
    const mockBackendTrialBalance = {
      asOfDate: '2024-01-31',
      rows: [
        { code: '1000', name: 'Cash', debitBalancePaise: '1000000', creditBalancePaise: '0' },
        { code: '1100', name: 'Bank', debitBalancePaise: '5000000', creditBalancePaise: '0' },
        { code: '1200', name: 'Loan Receivable', debitBalancePaise: '10000000', creditBalancePaise: '0' },
        { code: '2000', name: 'Accounts Payable', debitBalancePaise: '0', creditBalancePaise: '500000' },
        { code: '3000', name: 'Capital', debitBalancePaise: '0', creditBalancePaise: '10000000' },
        { code: '4000', name: 'Interest Income', debitBalancePaise: '0', creditBalancePaise: '5500000' },
      ],
      totalDebitBalancePaise: '16000000',
      totalCreditBalancePaise: '16000000',
      isBalanced: true,
    };

    it('fetches trial balance', async () => {
      mockGet.mockResolvedValueOnce(mockBackendTrialBalance);

      const { result } = renderHook(() => useTrialBalance(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith('/accounting/trial-balance');
      expect(result.current.data?.rows).toHaveLength(6);
      expect(result.current.data?.rows[0].accountCode).toBe('1000');
      expect(result.current.data?.isBalanced).toBe(true);
      expect(result.current.data?.totalDebitPaise).toBe(16000000);
      expect(result.current.data?.totalCreditPaise).toBe(16000000);
    });

    it('fetches trial balance with asOfDate', async () => {
      mockGet.mockResolvedValueOnce(mockBackendTrialBalance);

      const { result } = renderHook(
        () => useTrialBalance({ asOfDate: '2024-01-31' }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith('/accounting/trial-balance?asOfDate=2024-01-31');
    });

    it('total debits equal total credits', async () => {
      mockGet.mockResolvedValueOnce(mockBackendTrialBalance);

      const { result } = renderHook(() => useTrialBalance(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const totalDebits = result.current.data!.rows.reduce((sum, row) => sum + row.debitPaise, 0);
      const totalCredits = result.current.data!.rows.reduce((sum, row) => sum + row.creditPaise, 0);
      expect(totalDebits).toBe(totalCredits);
    });

    it('amounts are in paise (integers)', async () => {
      mockGet.mockResolvedValueOnce(mockBackendTrialBalance);

      const { result } = renderHook(() => useTrialBalance(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      result.current.data?.rows.forEach(row => {
        expect(Number.isInteger(row.debitPaise)).toBe(true);
        expect(Number.isInteger(row.creditPaise)).toBe(true);
      });
    });

    it('surfaces backend isBalanced=false flag', async () => {
      mockGet.mockResolvedValueOnce({
        ...mockBackendTrialBalance,
        totalDebitBalancePaise: '16000000',
        totalCreditBalancePaise: '15999999',
        isBalanced: false,
      });

      const { result } = renderHook(() => useTrialBalance(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.isBalanced).toBe(false);
      expect(result.current.data?.totalDebitPaise).toBe(16000000);
      expect(result.current.data?.totalCreditPaise).toBe(15999999);
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
    // Backend format mock data
    const mockBackendProfitLoss = {
      startDate: '2024-01-01',
      endDate: '2024-01-31',
      income: [
        { name: 'Interest Income', amountPaise: '5000000' },
        { name: 'Processing Fees', amountPaise: '500000' },
        { name: 'Penalty Income', amountPaise: '200000' },
      ],
      expenses: [
        { name: 'Salaries', amountPaise: '2000000' },
        { name: 'Rent', amountPaise: '300000' },
        { name: 'Utilities', amountPaise: '100000' },
      ],
      netProfitPaise: '3300000',
    };

    it('fetches profit & loss report', async () => {
      mockGet.mockResolvedValueOnce(mockBackendProfitLoss);

      const { result } = renderHook(() => useProfitLoss(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith('/accounting/profit-loss');
      expect(result.current.data?.income).toHaveLength(3);
      expect(result.current.data?.income[0].category).toBe('Interest Income');
    });

    it('fetches profit & loss with date range', async () => {
      mockGet.mockResolvedValueOnce(mockBackendProfitLoss);

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
      mockGet.mockResolvedValueOnce(mockBackendProfitLoss);

      const { result } = renderHook(() => useProfitLoss(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const pl = result.current.data!;
      const totalIncome = pl.income.reduce((sum, i) => sum + i.totalPaise, 0);
      const totalExpenses = pl.expenses.reduce((sum, e) => sum + e.totalPaise, 0);
      expect(pl.netProfitPaise).toBe(totalIncome - totalExpenses);
    });

    it('returns income categories', async () => {
      mockGet.mockResolvedValueOnce(mockBackendProfitLoss);

      const { result } = renderHook(() => useProfitLoss(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.income.length).toBeGreaterThan(0);
      result.current.data?.income.forEach(item => {
        expect(item.category).toBeDefined();
        expect(item.totalPaise).toBeDefined();
      });
    });

    it('returns expense categories', async () => {
      mockGet.mockResolvedValueOnce(mockBackendProfitLoss);

      const { result } = renderHook(() => useProfitLoss(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.expenses.length).toBeGreaterThan(0);
      result.current.data?.expenses.forEach(item => {
        expect(item.category).toBeDefined();
        expect(item.totalPaise).toBeDefined();
      });
    });

    it('amounts are in paise (integers)', async () => {
      mockGet.mockResolvedValueOnce(mockBackendProfitLoss);

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
    // Backend format mock data
    const mockBackendBalanceSheet = {
      asOfDate: '2024-01-31',
      assets: [
        { name: 'Cash', balancePaise: '1000000' },
        { name: 'Bank', balancePaise: '5000000' },
        { name: 'Loan Receivable', balancePaise: '10000000' },
      ],
      liabilities: [
        { name: 'Accounts Payable', balancePaise: '500000' },
        { name: 'Borrowings', balancePaise: '5500000' },
      ],
      equity: [
        { name: 'Capital', balancePaise: '7000000' },
        { name: 'Retained Earnings', balancePaise: '3000000' },
      ],
      retainedEarningsPaise: '0',
      totalAssetsPaise: '16000000',
      totalLiabilitiesPaise: '6000000',
      totalEquityPaise: '10000000',
      totalLiabilitiesAndEquityPaise: '16000000',
      isBalanced: true,
    };

    it('fetches balance sheet', async () => {
      mockGet.mockResolvedValueOnce(mockBackendBalanceSheet);

      const { result } = renderHook(() => useBalanceSheet(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith('/accounting/balance-sheet');
      expect(result.current.data?.assets).toHaveLength(3);
      expect(result.current.data?.assets[0].name).toBe('Cash');
    });

    it('fetches balance sheet with date range', async () => {
      mockGet.mockResolvedValueOnce(mockBackendBalanceSheet);

      const { result } = renderHook(
        () => useBalanceSheet({ endDate: '2024-01-31' }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith('/accounting/balance-sheet?asOfDate=2024-01-31');
    });

    it('assets = liabilities + equity + retained earnings', async () => {
      mockGet.mockResolvedValueOnce(mockBackendBalanceSheet);

      const { result } = renderHook(() => useBalanceSheet(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const bs = result.current.data!;
      expect(bs.totalAssetsPaise).toBe(bs.totalLiabilitiesAndEquityPaise);
      expect(bs.totalAssetsPaise).toBe(bs.totalLiabilitiesPaise + bs.totalEquityPaise + bs.retainedEarningsPaise);
      expect(bs.isBalanced).toBe(true);
    });

    it('returns assets list', async () => {
      mockGet.mockResolvedValueOnce(mockBackendBalanceSheet);

      const { result } = renderHook(() => useBalanceSheet(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.assets.length).toBeGreaterThan(0);
      result.current.data?.assets.forEach(item => {
        expect(item.name).toBeDefined();
        expect(item.totalPaise).toBeDefined();
      });
    });

    it('returns liabilities list', async () => {
      mockGet.mockResolvedValueOnce(mockBackendBalanceSheet);

      const { result } = renderHook(() => useBalanceSheet(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.liabilities.length).toBeGreaterThan(0);
      result.current.data?.liabilities.forEach(item => {
        expect(item.name).toBeDefined();
        expect(item.totalPaise).toBeDefined();
      });
    });

    it('returns equity list', async () => {
      mockGet.mockResolvedValueOnce(mockBackendBalanceSheet);

      const { result } = renderHook(() => useBalanceSheet(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.equity.length).toBeGreaterThan(0);
      result.current.data?.equity.forEach(item => {
        expect(item.name).toBeDefined();
        expect(item.totalPaise).toBeDefined();
      });
    });

    it('amounts are in paise (integers)', async () => {
      mockGet.mockResolvedValueOnce(mockBackendBalanceSheet);

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
