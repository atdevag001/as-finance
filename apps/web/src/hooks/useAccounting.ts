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

// Surface backend-computed totals + isBalanced so the UI can warn on imbalance instead of silently rendering mismatched totals.
export interface TrialBalanceReport {
  rows: TrialBalanceRow[];
  totalDebitPaise: number;
  totalCreditPaise: number;
  isBalanced: boolean;
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
  // Retained earnings (income - expenses since inception) lives outside equity[] and must be surfaced so totals balance.
  retainedEarningsPaise: number;
  totalAssetsPaise: number;
  totalLiabilitiesPaise: number;
  totalEquityPaise: number;
  totalLiabilitiesAndEquityPaise: number;
  isBalanced: boolean;
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

// Trial balance is a point-in-time report; only asOfDate is meaningful (no date range).
export function useTrialBalance(params: { asOfDate?: string } = {}) {
  return useQuery<TrialBalanceReport>({
    queryKey: ['accounting', 'trial-balance', params.asOfDate],
    queryFn: async () => {
      const query = new URLSearchParams();
      if (params.asOfDate) query.set('asOfDate', params.asOfDate);
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
      return {
        rows: response.rows.map((row) => ({
          accountCode: row.code,
          accountName: row.name,
          debitPaise: Number(row.debitBalancePaise),
          creditPaise: Number(row.creditBalancePaise),
        })),
        totalDebitPaise: Number(response.totalDebitBalancePaise),
        totalCreditPaise: Number(response.totalCreditBalancePaise),
        isBalanced: response.isBalanced,
      };
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
        retainedEarningsPaise: string;
        totalAssetsPaise: string;
        totalLiabilitiesPaise: string;
        totalEquityPaise: string;
        totalLiabilitiesAndEquityPaise: string;
        isBalanced: boolean;
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
        retainedEarningsPaise: Number(response.retainedEarningsPaise),
        totalAssetsPaise: Number(response.totalAssetsPaise),
        totalLiabilitiesPaise: Number(response.totalLiabilitiesPaise),
        totalEquityPaise: Number(response.totalEquityPaise),
        totalLiabilitiesAndEquityPaise: Number(response.totalLiabilitiesAndEquityPaise),
        isBalanced: response.isBalanced,
      };
    },
  });
}
