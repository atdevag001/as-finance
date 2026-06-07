'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface LoanProductVersion {
  id: string;
  product_id: string;
  version_number: number;
  interest_type: 'flat' | 'reducing_balance';
  annual_rate_bps: number;
  min_principal_paise: number;
  max_principal_paise: number;
  min_tenure_months: number;
  max_tenure_months: number;
  repayment_frequency: 'daily' | 'weekly' | 'monthly';
  processing_fee_type?: string | null;
  processing_fee_value?: number | null;
  penalty_grace_days: number;
  penalty_type?: string | null;
  penalty_value?: number | null;
  penalty_frequency?: string | null;
  max_concurrent_loans: number;
  allocation_order: string[];
  is_active: boolean;
  created_at: string;
}

export interface LoanProduct {
  id: string;
  name: string;
  is_active: boolean;
  current_version_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  current_version?: LoanProductVersion | null;
}

interface PaginatedResult<T> {
  data: T[];
  total: number;
}

export function useLoanProducts(params: { page?: number; includeInactive?: boolean } = {}) {
  const { page = 1, includeInactive = true } = params;
  const pageSize = 20;
  const skip = (page - 1) * pageSize;
  const query = new URLSearchParams({ skip: String(skip), take: String(pageSize) });
  // Backend filters via `isActive`; omit when including inactive so both are returned.
  if (!includeInactive) query.set('isActive', 'true');

  return useQuery<PaginatedResult<LoanProduct>>({
    queryKey: ['loan-products', page, includeInactive],
    queryFn: () => apiClient.get(`/loan-products?${query.toString()}`),
  });
}

export function useLoanProductsList() {
  return useQuery<LoanProduct[]>({
    queryKey: ['loan-products', 'list'],
    queryFn: async () => {
      // Picker UIs need the full set; backend caps at 50 by default.
      const result = await apiClient.get<PaginatedResult<LoanProduct> | LoanProduct[]>(
        '/loan-products?take=500',
      );
      if (Array.isArray(result)) return result;
      if (result.total > result.data.length) {
        console.warn(
          `useLoanProductsList: server has ${result.total} products but only ${result.data.length} returned; picker UI is truncated.`,
        );
      }
      return result.data ?? [];
    },
  });
}

export function useCreateLoanProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiClient.post('/loan-products', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loan-products'] });
    },
  });
}

export function useUpdateLoanProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      apiClient.patch(`/loan-products/${id}`, data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['loan-products'] });
      // Edit page caches by singular key; invalidate so back-nav refetches.
      qc.invalidateQueries({ queryKey: ['loan-product', variables.id] });
    },
  });
}

export function useDeactivateLoanProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/loan-products/${id}/deactivate`),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['loan-products'] });
      qc.invalidateQueries({ queryKey: ['loan-product', id] });
    },
  });
}
