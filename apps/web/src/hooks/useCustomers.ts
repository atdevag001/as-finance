'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface Customer {
  id: string;
  fullName: string;
  mobile: string;
  aadhaarLastFour: string;
  city: string;
  district: string;
  status: string;
  riskLevel: string;
  assignedOfficerId?: string;
  createdAt: string;
}

export interface CustomerDetail extends Customer {
  fatherOrHusbandName?: string;
  alternateMobile?: string;
  panLastFour?: string;
  dob?: string;
  age?: number;
  gender: string;
  occupation?: string;
  monthlyIncomePaise?: number;
  addressLine1: string;
  addressLine2?: string;
  state: string;
  pincode: string;
  notes?: string;
  familyMembers: { id: string; name: string; relationship: string; contactNumber?: string }[];
  guarantors: { id: string; name: string; relationship: string; mobile: string }[];
}

interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function useCustomers(params: { page?: number; search?: string; status?: string } = {}) {
  const { page = 1, search, status } = params;
  const query = new URLSearchParams({ page: String(page), pageSize: '20' });
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
