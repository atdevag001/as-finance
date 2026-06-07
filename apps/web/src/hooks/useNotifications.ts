'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface Notification {
  id: string;
  event_type: string;
  recipient_mobile: string;
  template_id?: string;
  message_body: string;
  variables: Record<string, string>;
  status: 'pending' | 'sent' | 'failed' | 'dead_letter';
  retry_count: number;
  max_retries: number;
  next_retry_at?: string;
  provider_response?: string;
  source_type: string;
  source_id: string;
  created_at: string;
  processed_at?: string;
}

interface PaginatedResult {
  data: Notification[];
  total: number;
}

// Exported so the page can compute totalPages from the same source of truth.
export const NOTIFICATIONS_PAGE_SIZE = 20;

export function useNotifications(params: {
  page?: number;
  status?: string;
  eventType?: string;
} = {}) {
  const { page = 1, status, eventType } = params;
  const skip = (page - 1) * NOTIFICATIONS_PAGE_SIZE;

  const query = new URLSearchParams({
    skip: String(skip),
    take: String(NOTIFICATIONS_PAGE_SIZE),
  });
  if (status) query.set('status', status);
  if (eventType) query.set('eventType', eventType);

  return useQuery<PaginatedResult>({
    queryKey: ['notifications', page, status, eventType],
    queryFn: () => apiClient.get(`/notifications?${query.toString()}`),
    // Keep previous rows visible during filter/page changes to avoid spinner flicker
    placeholderData: (prev) => prev,
    // OutboxProcessor polls every 10s; mirror that so retry progress is visible without manual refresh
    refetchInterval: 10_000,
  });
}

export function useRetryNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/notifications/${id}/retry`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}
