'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface DashboardKPIs {
  totalCustomers: number;
  activeLoans: number;
  overdueLoans: number;
  totalOutstandingPaise: number;
  todayCollectionsPaise: number;
  todayDisbursementsPaise: number;
  cashInHandPaise: number;
  pendingApprovals: number;
}

export function useDashboard() {
  return useQuery<DashboardKPIs>({
    queryKey: ['dashboard'],
    queryFn: () => apiClient.get('/dashboard'),
  });
}
