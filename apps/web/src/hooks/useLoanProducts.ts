'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface LoanProduct {
  id: string;
  name: string;
  version: number;
  interest_type: 'flat' | 'reducing_balance';
  annual_rate: number;
  min_principal_paise: number;
  max_principal_paise: number;
  min_tenure_months: number;
  max_tenure_months: number;
  frequency: 'daily' | 'weekly' | 'monthly';
}

export function useLoanProducts() {
  return useQuery<LoanProduct[]>({
    queryKey: ['loan-products'],
    queryFn: () => apiClient.get('/loan-products'),
  });
}
