'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface Setting {
  key: string;
  value: unknown;
  description?: string;
}

export function useSettings() {
  return useQuery<Setting[]>({
    queryKey: ['settings'],
    queryFn: () => apiClient.get('/settings'),
  });
}

export function useHolidays() {
  return useQuery<string[]>({
    queryKey: ['settings', 'holidays'],
    queryFn: () => apiClient.get('/settings/holidays'),
  });
}

export function useUpdateSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value, description }: { key: string; value: unknown; description?: string }) =>
      apiClient.patch(`/settings/${key}`, { value, description }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
    },
  });
}

export function useSetHolidays() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (holidays: string[]) =>
      apiClient.put('/settings/holidays', { holidays }),
    onSuccess: () => {
      // Prefix-invalidate so both ['settings'] and ['settings','holidays'] refetch.
      qc.invalidateQueries({ queryKey: ['settings'] });
    },
  });
}
