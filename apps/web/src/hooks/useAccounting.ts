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
  date: string;
  description: string;
  sourceType: string;
  lines: { accountName: string; debitPaise: number; creditPaise: number }[];
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
    queryFn: () => apiClient.get(`/accounting/daybook${buildDateQuery(params)}`),
  });
}

export function useTrialBalance(params: DateRangeParams = {}) {
  return useQuery<TrialBalanceRow[]>({
    queryKey: ['accounting', 'trial-balance', params.startDate, params.endDate],
    queryFn: () => apiClient.get(`/accounting/trial-balance${buildDateQuery(params)}`),
  });
}

export function useProfitLoss(params: DateRangeParams = {}) {
  return useQuery<ProfitLossReport>({
    queryKey: ['accounting', 'profit-loss', params.startDate, params.endDate],
    queryFn: () => apiClient.get(`/accounting/profit-loss${buildDateQuery(params)}`),
  });
}

export function useBalanceSheet(params: DateRangeParams = {}) {
  return useQuery<BalanceSheet>({
    queryKey: ['accounting', 'balance-sheet', params.startDate, params.endDate],
    queryFn: () => apiClient.get(`/accounting/balance-sheet${buildDateQuery(params)}`),
  });
}
