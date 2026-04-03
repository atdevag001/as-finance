'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface Setting {
  key: string;
  value: string;
  description?: string;
}

export interface Holiday {
  id: string;
  date: string;
  description: string;
}

export function useSettings() {
  return useQuery<Setting[]>({
    queryKey: ['settings'],
    queryFn: () => apiClient.get('/settings'),
  });
}

export function useHolidays() {
  return useQuery<Holiday[]>({
    queryKey: ['settings', 'holidays'],
    queryFn: () => apiClient.get('/settings/holidays'),
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, string>) =>
      apiClient.patch('/settings', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
    },
  });
}

export function useCreateHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { date: string; description: string }) =>
      apiClient.post('/settings/holidays', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'holidays'] });
    },
  });
}

export function useDeleteHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.delete(`/settings/holidays/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'holidays'] });
    },
  });
}
