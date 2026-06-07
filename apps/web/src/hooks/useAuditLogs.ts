'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface AuditLog {
  id: string;
  action_type: string;
  actor_id: string;
  actor_role: string;
  // Joined from the actor user — absent on legacy rows, so optional.
  actor?: { id: string; full_name: string; email: string } | null;
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
  endDate?: string;
  actorId?: string;
  targetId?: string;
} = {}) {
  const { page = 1, entity, action, startDate, endDate, actorId, targetId } = params;
  const pageSize = 20;
  const skip = (page - 1) * pageSize;
  const query = new URLSearchParams({ skip: String(skip), take: String(pageSize) });
  if (entity) query.set('targetEntity', entity);
  if (action) query.set('actionType', action);
  if (startDate) query.set('startDate', startDate);
  if (endDate) query.set('endDate', endDate);
  if (actorId) query.set('actorId', actorId);
  if (targetId) query.set('targetId', targetId);
  // Sent so the server can bracket date-only filters to the user's local day, not UTC.
  if (startDate || endDate) query.set('tzOffsetMinutes', String(new Date().getTimezoneOffset()));

  return useQuery<PaginatedResult<AuditLog>>({
    queryKey: ['audit-logs', page, entity, action, startDate, endDate, actorId, targetId],
    queryFn: () => apiClient.get(`/audit-logs?${query.toString()}`),
  });
}
