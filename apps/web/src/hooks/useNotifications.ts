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

export function useNotifications(params: {
  page?: number;
  status?: string;
  eventType?: string;
} = {}) {
  const { page = 1, status, eventType } = params;
  const pageSize = 20;
  const skip = (page - 1) * pageSize;

  const query = new URLSearchParams({ skip: String(skip), take: String(pageSize) });
  if (status) query.set('status', status);
  if (eventType) query.set('eventType', eventType);

  return useQuery<PaginatedResult>({
    queryKey: ['notifications', page, status, eventType],
    queryFn: () => apiClient.get(`/notifications?${query.toString()}`),
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
