'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface Loan {
  id: string;
  loan_number: string;
  customer_id: string;
  customer?: { full_name: string };
  principal_paise: number;
  tenure_months: number;
  status: string;
  dpd: number;
  overdue_bucket?: string;
  cached_outstanding_paise?: number;
  disbursement_date?: string;
  created_at: string;
}

export interface ProductVersion {
  id: string;
  product_id: string;
  version_number: number;
  interest_type: string;
  annual_rate_bps: number;
  repayment_frequency: string;
  processing_fee_type?: string;
  processing_fee_value?: number;
}

export interface LoanDetail extends Loan {
  purpose: string;
  total_interest_paise?: number;
  total_payable_paise?: number;
  processing_fee_paise?: number;
  first_due_date?: string;
  last_due_date?: string;
  created_by: string;
  approved_by?: string;
  schedules: Installment[];
  product_version?: ProductVersion;
}

export interface Installment {
  id: string;
  installment_number: number;
  due_date: string;
  principal_paise: number;
  interest_paise: number;
  total_paise: number;
  principal_paid_paise: number;
  interest_paid_paise: number;
  penalty_paid_paise: number;
  status: string;
}

interface PaginatedResult<T> {
  data: T[];
  total: number;
}

export function useLoans(params: { page?: number; status?: string; search?: string; aadhaarLastFour?: string } = {}) {
  const { page = 1, status, search, aadhaarLastFour } = params;
  const pageSize = 20;
  const skip = (page - 1) * pageSize;
  const query = new URLSearchParams({ skip: String(skip), take: String(pageSize) });
  if (status) query.set('status', status);
  if (search) query.set('search', search);
  if (aadhaarLastFour) query.set('aadhaarLastFour', aadhaarLastFour);

  return useQuery<PaginatedResult<Loan>>({
    queryKey: ['loans', page, status, search, aadhaarLastFour],
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loans'] });
      qc.invalidateQueries({ queryKey: ['loan'] });
      qc.invalidateQueries({ queryKey: ['receipts'] });
      qc.invalidateQueries({ queryKey: ['penalties'] });
      qc.invalidateQueries({ queryKey: ['foreclosures'] });
      qc.invalidateQueries({ queryKey: ['status-history'] });
    },
  });
}
