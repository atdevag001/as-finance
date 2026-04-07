'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface Customer {
  id: string;
  full_name: string;
  mobile: string;
  aadhaar_last_four: string;
  city: string;
  district: string;
  status: string;
  risk_level: string;
  assigned_officer_id?: string;
  created_at: string;
}

export interface CustomerDetail extends Customer {
  father_or_husband_name?: string;
  alternate_mobile?: string;
  pan_last_four?: string;
  dob?: string;
  age?: number;
  gender: string;
  occupation?: string;
  monthly_income_paise?: number;
  address_line1: string;
  address_line2?: string;
  state: string;
  pincode: string;
  notes?: string;
  family_members: { id: string; name: string; relationship: string; contact_number?: string }[];
  guarantors: { id: string; name: string; relationship: string; mobile: string }[];
}

interface PaginatedResult<T> {
  data: T[];
  total: number;
}

export function useCustomers(params: { page?: number; search?: string; status?: string } = {}) {
  const { page = 1, search, status } = params;
  const pageSize = 20;
  const skip = (page - 1) * pageSize;
  const query = new URLSearchParams({ skip: String(skip), take: String(pageSize) });
  if (search) query.set('search', search);
  if (status) query.set('status', status);

  return useQuery<PaginatedResult<Customer>>({
    queryKey: ['customers', page, search, status],
    queryFn: () => apiClient.get(`/customers?${query.toString()}`),
  });
}

export function useCustomer(id: string) {
  return useQuery<CustomerDetail>({
    queryKey: ['customers', id],
    queryFn: () => apiClient.get(`/customers/${id}`),
    enabled: !!id,
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiClient.post('/customers', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers'] }); },
  });
}

export function useUpdateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      apiClient.patch(`/customers/${id}`, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['customers', id] });
      qc.invalidateQueries({ queryKey: ['customers'] });
    },
  });
}

export function useAddFamilyMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ customerId, data }: { customerId: string; data: Record<string, unknown> }) =>
      apiClient.post(`/customers/${customerId}/family-members`, data),
    onSuccess: (_, { customerId }) => {
      qc.invalidateQueries({ queryKey: ['customers', customerId] });
    },
  });
}

export function useAddGuarantor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ customerId, data }: { customerId: string; data: Record<string, unknown> }) =>
      apiClient.post(`/customers/${customerId}/guarantors`, data),
    onSuccess: (_, { customerId }) => {
      qc.invalidateQueries({ queryKey: ['customers', customerId] });
    },
  });
}
