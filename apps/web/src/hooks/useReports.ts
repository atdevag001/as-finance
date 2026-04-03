'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface ReportData {
  type: string;
  label: string;
  columns: string[];
  rows: Record<string, unknown>[];
}

export function useReport(type: string, params: { startDate?: string; endDate?: string } = {}) {
  const query = new URLSearchParams();
  if (params.startDate) query.set('startDate', params.startDate);
  if (params.endDate) query.set('endDate', params.endDate);
  const qs = query.toString();

  return useQuery<ReportData>({
    queryKey: ['reports', type, params.startDate, params.endDate],
    queryFn: () => apiClient.get(`/reports/${type}${qs ? `?${qs}` : ''}`),
    enabled: !!type,
  });
}
