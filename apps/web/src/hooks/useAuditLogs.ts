'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface AuditLog {
  id: string;
  action_type: string;
  actor_id: string;
  actor_role: string;
  target_entity: string;
  target_id: string;
  created_at: string;
  remarks?: string;
}

interface PaginatedResult<T> {
  data: T[];
  total: number;
}

export function useAuditLogs(params: {
  page?: number;
  entity?: string;
  action?: string;
  startDate?: string;
} = {}) {
  const { page = 1, entity, action, startDate } = params;
  const pageSize = 20;
  const skip = (page - 1) * pageSize;
  const query = new URLSearchParams({ skip: String(skip), take: String(pageSize) });
  if (entity) query.set('targetEntity', entity);
  if (action) query.set('actionType', action);
  if (startDate) query.set('startDate', startDate);

  return useQuery<PaginatedResult<AuditLog>>({
    queryKey: ['audit-logs', page, entity, action, startDate],
    queryFn: () => apiClient.get(`/audit-logs?${query.toString()}`),
  });
}
