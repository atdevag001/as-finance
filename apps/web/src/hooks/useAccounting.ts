'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface ChartAccount {
  id: string;
  code: string;
  name: string;
  category: 'asset' | 'liability' | 'income' | 'expense' | 'equity';
}

export interface JournalEntry {
  id: string;
  entry_date: string;
  description: string;
  source_type: string;
  source_id: string;
  total_debit_paise: number;
  total_credit_paise: number;
  created_by: string;
  created_at: string;
  lines: {
    id: string;
    account_id: string;
    debit_paise: number;
    credit_paise: number;
    account: { id: string; code: string; name: string; category: string };
  }[];
}

export interface TrialBalanceRow {
  accountCode: string;
  accountName: string;
  debitPaise: number;
  creditPaise: number;
}

export interface ProfitLossReport {
  income: { category: string; totalPaise: number }[];
  expenses: { category: string; totalPaise: number }[];
  netProfitPaise: number;
}

export interface BalanceSheet {
  assets: { name: string; totalPaise: number }[];
  liabilities: { name: string; totalPaise: number }[];
  equity: { name: string; totalPaise: number }[];
}

interface DateRangeParams {
  startDate?: string;
  endDate?: string;
}

function buildDateQuery(params: DateRangeParams): string {
  const query = new URLSearchParams();
  if (params.startDate) query.set('startDate', params.startDate);
  if (params.endDate) query.set('endDate', params.endDate);
  const qs = query.toString();
  return qs ? `?${qs}` : '';
}

export function useChartOfAccounts() {
  return useQuery<ChartAccount[]>({
    queryKey: ['accounting', 'chart-of-accounts'],
    queryFn: () => apiClient.get('/accounting/chart-of-accounts'),
  });
}

export function useDaybook(params: DateRangeParams = {}) {
  return useQuery<JournalEntry[]>({
    queryKey: ['accounting', 'daybook', params.startDate, params.endDate],
    queryFn: async () => {
      interface BackendJournalLine {
        id: string;
        account_id: string;
        debit_paise: string | number;
        credit_paise: string | number;
        account: { id: string; code: string; name: string; category: string };
      }
      interface BackendJournalEntry {
        id: string;
        entry_date: string;
        description: string;
        source_type: string;
        source_id: string;
        total_debit_paise: string | number;
        total_credit_paise: string | number;
        created_by: string;
        created_at: string;
        lines: BackendJournalLine[];
      }

      const response = await apiClient.get<BackendJournalEntry[]>(`/accounting/daybook${buildDateQuery(params)}`);
      return response.map((entry) => ({
        ...entry,
        total_debit_paise: Number(entry.total_debit_paise),
        total_credit_paise: Number(entry.total_credit_paise),
        lines: entry.lines.map((line) => ({
          ...line,
          debit_paise: Number(line.debit_paise),
          credit_paise: Number(line.credit_paise),
        })),
      }));
    },
  });
}

export function useTrialBalance(params: DateRangeParams = {}) {
  return useQuery<TrialBalanceRow[]>({
    queryKey: ['accounting', 'trial-balance', params.endDate],
    queryFn: async () => {
      const query = new URLSearchParams();
      if (params.endDate) query.set('asOfDate', params.endDate);
      const qs = query.toString();
      const url = `/accounting/trial-balance${qs ? `?${qs}` : ''}`;

      interface BackendTrialBalanceRow {
        code: string;
        name: string;
        debitBalancePaise: string;
        creditBalancePaise: string;
      }
      interface BackendTrialBalanceResponse {
        asOfDate: string;
        rows: BackendTrialBalanceRow[];
        totalDebitBalancePaise: string;
        totalCreditBalancePaise: string;
        isBalanced: boolean;
      }

      const response = await apiClient.get<BackendTrialBalanceResponse>(url);
      return response.rows.map((row) => ({
        accountCode: row.code,
        accountName: row.name,
        debitPaise: Number(row.debitBalancePaise),
        creditPaise: Number(row.creditBalancePaise),
      }));
    },
  });
}

export function useProfitLoss(params: DateRangeParams = {}) {
  return useQuery<ProfitLossReport>({
    queryKey: ['accounting', 'profit-loss', params.startDate, params.endDate],
    queryFn: async () => {
      interface BackendProfitLossItem {
        name: string;
        amountPaise: string;
      }
      interface BackendProfitLossResponse {
        startDate: string;
        endDate: string;
        income: BackendProfitLossItem[];
        expenses: BackendProfitLossItem[];
        netProfitPaise: string;
      }

      const response = await apiClient.get<BackendProfitLossResponse>(`/accounting/profit-loss${buildDateQuery(params)}`);
      return {
        income: response.income.map((item) => ({
          category: item.name,
          totalPaise: Number(item.amountPaise),
        })),
        expenses: response.expenses.map((item) => ({
          category: item.name,
          totalPaise: Number(item.amountPaise),
        })),
        netProfitPaise: Number(response.netProfitPaise),
      };
    },
  });
}

export function useBalanceSheet(params: DateRangeParams = {}) {
  return useQuery<BalanceSheet>({
    queryKey: ['accounting', 'balance-sheet', params.endDate],
    queryFn: async () => {
      const query = new URLSearchParams();
      if (params.endDate) query.set('asOfDate', params.endDate);
      const qs = query.toString();
      const url = `/accounting/balance-sheet${qs ? `?${qs}` : ''}`;

      interface BackendBalanceSheetItem {
        name: string;
        balancePaise: string;
      }
      interface BackendBalanceSheetResponse {
        asOfDate: string;
        assets: BackendBalanceSheetItem[];
        liabilities: BackendBalanceSheetItem[];
        equity: BackendBalanceSheetItem[];
        totalAssetsPaise: string;
        totalLiabilitiesPaise: string;
        totalEquityPaise: string;
      }

      const response = await apiClient.get<BackendBalanceSheetResponse>(url);
      return {
        assets: response.assets.map((item) => ({
          name: item.name,
          totalPaise: Number(item.balancePaise),
        })),
        liabilities: response.liabilities.map((item) => ({
          name: item.name,
          totalPaise: Number(item.balancePaise),
        })),
        equity: response.equity.map((item) => ({
          name: item.name,
          totalPaise: Number(item.balancePaise),
        })),
      };
    },
  });
}
