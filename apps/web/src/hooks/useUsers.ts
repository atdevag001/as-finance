'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface User {
  id: string;
  username: string;
  full_name: string;
  email?: string;
  mobile: string;
  role: string;
  is_active: boolean;
  area?: string;
  created_at: string;
}

interface PaginatedResult<T> {
  data: T[];
  total: number;
}

export function useUsers(params: { page?: number } = {}) {
  const { page = 1 } = params;
  const pageSize = 20;
  const skip = (page - 1) * pageSize;
  const query = new URLSearchParams({ skip: String(skip), take: String(pageSize) });

  return useQuery<PaginatedResult<User>>({
    queryKey: ['users', page],
    queryFn: () => apiClient.get(`/users?${query.toString()}`),
  });
}

// Selectors (e.g. waive-penalty approver dropdown) need every user, not just the first page,
// otherwise valid approvers are silently truncated when there are >20 users in the system.
export function useApprovers() {
  const pageSize = 100; // backend caps `take` at 100 (UserQueryDto)
  return useQuery<PaginatedResult<User>>({
    queryKey: ['users', 'all'],
    queryFn: async () => {
      const all: User[] = [];
      let skip = 0;
      // Loop until we've fetched `total` rows; guard against runaway loops.
      for (let i = 0; i < 100; i++) {
        const q = new URLSearchParams({ skip: String(skip), take: String(pageSize) });
        const page = await apiClient.get<PaginatedResult<User>>(`/users?${q.toString()}`);
        all.push(...page.data);
        if (all.length >= page.total || page.data.length === 0) {
          return { data: all, total: page.total };
        }
        skip += pageSize;
      }
      return { data: all, total: all.length };
    },
    staleTime: 60_000,
  });
}

export function useUser(id: string) {
  return useQuery<User>({
    queryKey: ['users', id],
    queryFn: () => apiClient.get(`/users/${id}`),
    enabled: !!id,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient.post('/users', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      apiClient.patch(`/users/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
    },
  });
}
