'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface Collection {
  id: string;
  loanId: string;
  loanNumber?: string;
  customerName?: string;
  amountPaise: number;
  paymentDate: string;
  paymentMode: string;
  status: string;
  receiptId?: string;
  collectedBy?: string;
  createdAt: string;
}

export interface Receipt {
  id: string;
  receiptNumber: string;
  collectionId: string;
  customerName: string;
  loanNumber: string;
  amountPaise: number;
  principalPaise: number;
  interestPaise: number;
  penaltyPaise: number;
  outstandingAfterPaise: number;
  officerName: string;
  paymentMode: string;
  paymentDate: string;
  status: string;
  createdAt: string;
}

interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function useCollections(params: { page?: number; loanId?: string } = {}) {
  const { page = 1, loanId } = params;
  const pageSize = 20;
  const skip = (page - 1) * pageSize;
  const query = new URLSearchParams({ skip: String(skip), take: String(pageSize) });
  if (loanId) query.set('loanId', loanId);

  return useQuery<PaginatedResult<Collection>>({
    queryKey: ['collections', page, loanId],
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
