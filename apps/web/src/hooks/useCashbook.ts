'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// Paise fields arrive as strings: server-side BigInt serializes via JSON.stringify (no native bigint
// support) and computeDailySummary explicitly calls .toString(). Typing as number silently lost
// precision past 2^53 paise (~₹90 lakh crore).
export interface CashbookSummary {
  date: string;
  openingBalancePaise: string;
  cashInflowsPaise: string;
  cashOutflowsPaise: string;
  closingBalancePaise: string;
  hasDiscrepancy: boolean;
  transactionCount: number;
}

export interface CashHandover {
  id: string;
  collection_officer_id: string;
  collection_officer: { id: string; full_name: string };
  receiving_officer: { id: string; full_name: string };
  total_amount_paise: string;
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

export interface UseHandoversParams {
  verificationStatus?: 'pending' | 'verified' | 'discrepancy';
}

export function useHandovers(params: UseHandoversParams = {}) {
  const { verificationStatus } = params;
  // Filter server-side so status filtering isn't truncated by the default page size of 20.
  const query = verificationStatus ? `?verificationStatus=${verificationStatus}` : '';
  return useQuery<CashHandover[]>({
    queryKey: ['cashbook', 'handovers', verificationStatus ?? 'all'],
    queryFn: async () => {
      const response = await apiClient.get<{ data: CashHandover[]; total: number } | CashHandover[]>(`/cashbook/handovers${query}`);
      // Handle both { data: [], total: N } and direct array responses
      return Array.isArray(response) ? response : response.data;
    },
  });
}

// Generate a fresh UUID per submit so double-clicks/retries reuse the same Idempotency-Key and dedupe server-side.
function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient.post('/cashbook/expenses', data, {
        headers: { 'Idempotency-Key': newIdempotencyKey() },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cashbook'] });
      // Expense posts a journal entry; refresh accounting reports.
      qc.invalidateQueries({ queryKey: ['accounting'] });
    },
  });
}

export function useCreateHandover() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient.post('/cashbook/handovers', data, {
        headers: { 'Idempotency-Key': newIdempotencyKey() },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cashbook'] });
      // Handover moves cash between officers; downstream accounting views may reflect it.
      qc.invalidateQueries({ queryKey: ['accounting'] });
    },
  });
}

export interface VerifyHandoverInput {
  id: string;
  verificationStatus: 'verified' | 'discrepancy';
  // Required by backend when verificationStatus === 'discrepancy' (MISSING_DISCREPANCY_AMOUNT otherwise).
  discrepancyAmountPaise?: number;
  discrepancyNotes?: string;
}

export function useVerifyHandover() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, verificationStatus, discrepancyAmountPaise, discrepancyNotes }: VerifyHandoverInput) =>
      apiClient.patch(`/cashbook/handovers/${id}/verify`, {
        verificationStatus,
        ...(discrepancyAmountPaise !== undefined ? { discrepancyAmountPaise } : {}),
        ...(discrepancyNotes !== undefined ? { discrepancyNotes } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cashbook'] });
      // Verification may flag discrepancies that downstream accounting reports surface.
      qc.invalidateQueries({ queryKey: ['accounting'] });
    },
  });
}
