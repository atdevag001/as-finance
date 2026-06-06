'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// Centralized so write-side hooks can invalidate KPIs without stringly-typed drift.
export const DASHBOARD_QUERY_KEY = ['dashboard'] as const;

export interface DashboardKPIs {
  totalCustomers: number;
  activeLoans: number;
  overdueLoans: number;
  totalOutstandingPaise: number;
  todayCollectionsPaise: number;
  todayDisbursementsPaise: number;
  pendingApprovals: number;
}

export function useDashboard() {
  return useQuery<DashboardKPIs>({
    queryKey: DASHBOARD_QUERY_KEY,
    queryFn: () => apiClient.get('/dashboard'),
  });
}
