'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface CashbookSummary {
  date: string;
  openingBalancePaise: number;
  cashInflowsPaise: number;
  cashOutflowsPaise: number;
  closingBalancePaise: number;
  hasDiscrepancy: boolean;
  transactionCount: number;
}

export interface CashHandover {
  id: string;
  collection_officer_id: string;
  collection_officer: { id: string; full_name: string };
  receiving_officer: { id: string; full_name: string };
  total_amount_paise: number;
  handover_date: string;
  verification_status: 'pending' | 'verified' | 'discrepancy';
  verified_at?: string;
  created_at: string;
}

export function useDailySummary(date?: string) {
  const query = date ? `?date=${date}` : '';
  return useQuery<CashbookSummary>({
    queryKey: ['cashbook', 'daily-summary', date],
    queryFn: () => apiClient.get(`/cashbook/daily-summary${query}`),
  });
}

export function useHandovers() {
  return useQuery<CashHandover[]>({
    queryKey: ['cashbook', 'handovers'],
    queryFn: async () => {
      const response = await apiClient.get<{ data: CashHandover[]; total: number } | CashHandover[]>('/cashbook/handovers');
      // Handle both { data: [], total: N } and direct array responses
      return Array.isArray(response) ? response : response.data;
    },
  });
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient.post('/cashbook/expenses', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cashbook'] });
    },
  });
}

export function useCreateHandover() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient.post('/cashbook/handovers', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cashbook'] });
    },
  });
}

export function useVerifyHandover() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, verificationStatus }: { id: string; verificationStatus: 'verified' | 'discrepancy' }) =>
      apiClient.patch(`/cashbook/handovers/${id}/verify`, { verificationStatus }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cashbook'] });
    },
  });
}
