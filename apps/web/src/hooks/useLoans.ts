'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface Loan {
  id: string;
  loanNumber: string;
  customerId: string;
  customerName?: string;
  principalPaise: number;
  tenureMonths: number;
  status: string;
  dpd: number;
  overdueBucket?: string;
  cachedOutstandingPaise?: number;
  disbursementDate?: string;
  createdAt: string;
}

export interface LoanDetail extends Loan {
  purpose: string;
  totalInterestPaise?: number;
  totalPayablePaise?: number;
  processingFeePaise?: number;
  firstDueDate?: string;
  lastDueDate?: string;
  createdBy: string;
  approvedBy?: string;
  schedule: Installment[];
}

export interface Installment {
  id: string;
  installmentNumber: number;
  dueDate: string;
  principalPaise: number;
  interestPaise: number;
  totalPaise: number;
  principalPaidPaise: number;
  interestPaidPaise: number;
  penaltyPaidPaise: number;
  status: string;
}

interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function useLoans(params: { page?: number; status?: string } = {}) {
  const { page = 1, status } = params;
  const query = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (status) query.set('status', status);

  return useQuery<PaginatedResult<Loan>>({
    queryKey: ['loans', page, status],
    queryFn: () => apiClient.get(`/loans?${query.toString()}`),
  });
}

export function useLoan(id: string) {
  return useQuery<LoanDetail>({
    queryKey: ['loans', id],
    queryFn: () => apiClient.get(`/loans/${id}`),
    enabled: !!id,
  });
}

export function useCreateLoan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiClient.post('/loans', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['loans'] }); },
  });
}

export function useLoanAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, body }: { id: string; action: string; body?: Record<string, unknown> }) =>
      apiClient.post(`/loans/${id}/${action}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['loans'] }); },
  });
}
