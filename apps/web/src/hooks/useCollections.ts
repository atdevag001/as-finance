'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface Collection {
  id: string;
  loan_id: string;
  loan_number?: string;
  customer_name?: string;
  amount_paise: number;
  payment_date: string;
  payment_mode: string;
  status: string;
  receipt_id?: string;
  collected_by?: string;
  created_at: string;
  loan?: { loan_number: string; customer?: { full_name: string } };
}

export interface Receipt {
  id: string;
  receipt_number: string;
  collection_id: string;
  customer_name: string;
  loan_number: string;
  amount_paise: number;
  principal_paise: number;
  interest_paise: number;
  penalty_paise: number;
  outstanding_after_paise: number;
  officer_name: string;
  payment_mode: string;
  payment_date: string;
  status: string;
  created_at: string;
}

interface PaginatedResult<T> {
  data: T[];
  total: number;
}

export function useCollections(params: {
  page?: number;
  loanId?: string;
  startDate?: string;
  endDate?: string;
  loanNumber?: string;
} = {}) {
  const { page = 1, loanId, startDate, endDate, loanNumber } = params;
  const pageSize = 20;
  const skip = (page - 1) * pageSize;
  const query = new URLSearchParams({ skip: String(skip), take: String(pageSize) });
  if (loanId) query.set('loanId', loanId);
  if (startDate) query.set('startDate', startDate);
  if (endDate) query.set('endDate', endDate);
  if (loanNumber) query.set('loanNumber', loanNumber);

  return useQuery<PaginatedResult<Collection>>({
    queryKey: ['collections', page, loanId, startDate, endDate, loanNumber],
    queryFn: () => apiClient.get(`/collections?${query.toString()}`),
  });
}

export function usePostCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiClient.post('/collections', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['collections'] });
      qc.invalidateQueries({ queryKey: ['loans'] });
    },
  });
}

export function useReceipt(id: string) {
  return useQuery<Receipt>({
    queryKey: ['receipts', id],
    queryFn: () => apiClient.get(`/receipts/${id}`),
    enabled: !!id,
  });
}
