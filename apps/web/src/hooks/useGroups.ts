'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface Group {
  id: string;
  name: string;
  leader_name: string;
  member_count: number;
  meeting_day: string;
  status: string;
  created_at: string;
}

export interface GroupMember {
  id: string;
  customer_id: string;
  customer_name: string;
  loan_id?: string;
  loan_number?: string;
  outstanding_paise?: number;
}

export interface GroupDetail extends Group {
  members: GroupMember[];
  collections: GroupCollection[];
}

export interface GroupCollection {
  id: string;
  group_id: string;
  total_amount_paise: number;
  payment_date: string;
  status: string;
  created_at: string;
}

interface PaginatedResult<T> {
  data: T[];
  total: number;
}

export function useGroups(params: { page?: number } = {}) {
  const { page = 1 } = params;
  const pageSize = 20;
  const skip = (page - 1) * pageSize;
  const query = new URLSearchParams({ skip: String(skip), take: String(pageSize) });

  return useQuery<PaginatedResult<Group>>({
    queryKey: ['groups', page],
    queryFn: () => apiClient.get(`/groups?${query.toString()}`),
  });
}

export function useGroupsList() {
  return useQuery<Group[]>({
    queryKey: ['groups', 'list'],
    queryFn: async () => {
      const result = await apiClient.get<PaginatedResult<Group> | Group[]>('/groups?status=active');
      const groups = Array.isArray(result) ? result : result.data ?? [];
      return groups.filter(g => g.status === 'active');
    },
  });
}

export function useGroup(id: string) {
  return useQuery<GroupDetail>({
    queryKey: ['groups', id],
    queryFn: () => apiClient.get(`/groups/${id}`),
    enabled: !!id,
  });
}

export function useCreateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiClient.post('/groups', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['groups'] }); },
  });
}

export function useAddGroupMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, ...data }: { groupId: string } & Record<string, unknown>) =>
      apiClient.post(`/groups/${groupId}/members`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['groups'] }); },
  });
}

export function usePostGroupCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, ...data }: { groupId: string } & Record<string, unknown>) =>
      apiClient.post(`/groups/${groupId}/collections`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] });
      qc.invalidateQueries({ queryKey: ['collections'] });
      qc.invalidateQueries({ queryKey: ['loans'] });
    },
  });
}
