'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface ReceiptDetail {
  id: string;
  receipt_number: string;
  collection_id: string;
  loan_id: string;
  customer_id: string;
  customer_name: string;
  loan_number: string;
  amount_paise: number;
  penalty_component_paise: number;
  interest_component_paise: number;
  principal_component_paise: number;
  outstanding_after_paise: number;
  officer_name: string;
  payment_mode: string;
  payment_date: string;
  status: 'active' | 'reversed';
  is_reversal: boolean;
  compensating_receipt_id?: string;
  original_receipt_id?: string;
  created_at: string;
}

interface PaginatedResult<T> {
  data: T[];
  total: number;
}

export function useReceipts(params: { loanId?: string; page?: number } = {}) {
  const { loanId, page = 1 } = params;
  const pageSize = 20;
  const skip = (page - 1) * pageSize;
  const query = new URLSearchParams({ skip: String(skip), take: String(pageSize) });
  if (loanId) query.set('loanId', loanId);

  return useQuery<PaginatedResult<ReceiptDetail>>({
    queryKey: ['receipts', 'list', page, loanId],
    queryFn: () => apiClient.get(`/receipts?${query.toString()}`),
  });
}

export function useReceiptDetail(id: string) {
  return useQuery<ReceiptDetail>({
    queryKey: ['receipts', id],
    queryFn: () => apiClient.get(`/receipts/${id}`),
    enabled: !!id,
  });
}
