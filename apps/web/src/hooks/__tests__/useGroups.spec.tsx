import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useGroups,
  useGroup,
  useCreateGroup,
  useAddGroupMember,
  usePostGroupCollection,
} from '../useGroups';
import type { ReactNode } from 'react';

// Mock the API client
const mockGet = vi.fn();
const mockPost = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

/**
 * useGroups Hook Tests
 *
 * Tests the useGroups hooks for:
 * - List groups with pagination
 * - Group detail with members
 * - Create group mutation
 * - Add member mutation
 * - Post group collection mutation
 * - Query invalidation
 *
 * **Validates: Group management workflow for joint liability groups**
 */

describe('useGroups Hook', () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
        },
      },
    });
  });

  describe('useGroups (list)', () => {
    const mockGroupsList = {
      data: [
        {
          id: 'grp-1',
          name: 'Village Group A',
          leader_name: 'Ramesh Kumar',
          member_count: 10,
          meeting_day: 'Monday',
          status: 'active',
          created_at: '2024-01-10T10:00:00.000Z',
        },
        {
          id: 'grp-2',
          name: 'Women SHG',
          leader_name: 'Lakshmi Devi',
          member_count: 15,
          meeting_day: 'Wednesday',
          status: 'active',
          created_at: '2024-01-05T10:00:00.000Z',
        },
      ],
      total: 25,
    };

    it('fetches groups list with default pagination', async () => {
      mockGet.mockResolvedValueOnce(mockGroupsList);

      const { result } = renderHook(() => useGroups(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith('/groups?skip=0&take=20');
      expect(result.current.data).toEqual(mockGroupsList);
    });

    it('fetches groups with specific page', async () => {
      mockGet.mockResolvedValueOnce({ data: [], total: 100 });

      const { result } = renderHook(() => useGroups({ page: 3 }), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith('/groups?skip=40&take=20');
    });

    it('returns loading state initially', () => {
      mockGet.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useGroups(), { wrapper });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.data).toBeUndefined();
    });

    it('returns error state on API failure', async () => {
      mockGet.mockRejectedValueOnce(new Error('Server Error'));

      const { result } = renderHook(() => useGroups(), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });

    it('returns empty data when no groups', async () => {
      mockGet.mockResolvedValueOnce({ data: [], total: 0 });

      const { result } = renderHook(() => useGroups(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.data).toEqual([]);
      expect(result.current.data?.total).toBe(0);
    });
  });

  describe('useGroup (detail)', () => {
    const mockGroupDetail = {
      id: 'grp-1',
      name: 'Village Group A',
      leader_name: 'Ramesh Kumar',
      member_count: 3,
      meeting_day: 'Monday',
      status: 'active',
      created_at: '2024-01-10T10:00:00.000Z',
      members: [
        {
          id: 'mem-1',
          customer_id: 'cust-1',
          customer_name: 'Ramesh Kumar',
          loan_id: 'loan-1',
          loan_number: 'LN-2024-001',
          outstanding_paise: 4500000,
        },
        {
          id: 'mem-2',
          customer_id: 'cust-2',
          customer_name: 'Suresh Kumar',
          loan_id: 'loan-2',
          loan_number: 'LN-2024-002',
          outstanding_paise: 3200000,
        },
        {
          id: 'mem-3',
          customer_id: 'cust-3',
          customer_name: 'Mahesh Kumar',
        },
      ],
      collections: [
        {
          id: 'gc-1',
          group_id: 'grp-1',
          total_amount_paise: 466666,
          payment_date: '2024-01-15',
          status: 'posted',
          created_at: '2024-01-15T10:00:00.000Z',
        },
      ],
    };

    it('fetches group detail by ID', async () => {
      mockGet.mockResolvedValueOnce(mockGroupDetail);

      const { result } = renderHook(() => useGroup('grp-1'), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith('/groups/grp-1');
      expect(result.current.data).toEqual(mockGroupDetail);
    });

    it('returns members list', async () => {
      mockGet.mockResolvedValueOnce(mockGroupDetail);

      const { result } = renderHook(() => useGroup('grp-1'), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.members).toHaveLength(3);
    });

    it('does not fetch when ID is empty', () => {
      renderHook(() => useGroup(''), { wrapper });

      expect(mockGet).not.toHaveBeenCalled();
    });

    it('returns 404 error when group not found', async () => {
      const notFoundError = new Error('Group not found');
      (notFoundError as Error & { statusCode: number }).statusCode = 404;
      mockGet.mockRejectedValueOnce(notFoundError);

      const { result } = renderHook(() => useGroup('invalid-grp'), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe('useCreateGroup', () => {
    it('creates a new group', async () => {
      const newGroup = { id: 'grp-new', name: 'New Group' };
      mockPost.mockResolvedValueOnce(newGroup);

      const { result } = renderHook(() => useCreateGroup(), { wrapper });

      result.current.mutate({
        name: 'New Group',
        leader_customer_id: 'cust-1',
        meeting_day: 'Tuesday',
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPost).toHaveBeenCalledWith('/groups', {
        name: 'New Group',
        leader_customer_id: 'cust-1',
        meeting_day: 'Tuesday',
      });
    });

    it('invalidates groups query on success', async () => {
      mockPost.mockResolvedValueOnce({ id: 'grp-new' });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useCreateGroup(), { wrapper });

      result.current.mutate({ name: 'Test Group' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['groups'] });
    });

    it('handles mutation error', async () => {
      mockPost.mockRejectedValueOnce(new Error('Group name already exists'));

      const { result } = renderHook(() => useCreateGroup(), { wrapper });

      result.current.mutate({ name: 'Existing Group' });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe('useAddGroupMember', () => {
    it('adds a member to group', async () => {
      mockPost.mockResolvedValueOnce({ id: 'mem-new' });

      const { result } = renderHook(() => useAddGroupMember(), { wrapper });

      result.current.mutate({
        groupId: 'grp-1',
        customer_id: 'cust-new',
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPost).toHaveBeenCalledWith('/groups/grp-1/members', {
        customer_id: 'cust-new',
      });
    });

    it('invalidates groups query on success', async () => {
      mockPost.mockResolvedValueOnce({ id: 'mem-new' });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useAddGroupMember(), { wrapper });

      result.current.mutate({ groupId: 'grp-1', customer_id: 'cust-1' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['groups'] });
    });

    it('handles 404 when group not found', async () => {
      const notFoundError = new Error('Group not found');
      (notFoundError as Error & { statusCode: number }).statusCode = 404;
      mockPost.mockRejectedValueOnce(notFoundError);

      const { result } = renderHook(() => useAddGroupMember(), { wrapper });

      result.current.mutate({ groupId: 'invalid-grp', customer_id: 'cust-1' });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe('usePostGroupCollection', () => {
    it('posts a group collection', async () => {
      mockPost.mockResolvedValueOnce({ id: 'gc-new', status: 'posted' });

      const { result } = renderHook(() => usePostGroupCollection(), { wrapper });

      result.current.mutate({
        groupId: 'grp-1',
        paymentDate: '2024-01-20',
        payments: [
          { loanId: 'loan-1', amountPaise: 233333 },
          { loanId: 'loan-2', amountPaise: 200000 },
        ],
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPost).toHaveBeenCalledWith('/groups/grp-1/collections', {
        paymentDate: '2024-01-20',
        payments: [
          { loanId: 'loan-1', amountPaise: 233333 },
          { loanId: 'loan-2', amountPaise: 200000 },
        ],
      });
    });

    it('invalidates groups, collections, and loans queries on success', async () => {
      mockPost.mockResolvedValueOnce({ id: 'gc-new' });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => usePostGroupCollection(), { wrapper });

      result.current.mutate({
        groupId: 'grp-1',
        payments: [{ loanId: 'loan-1', amountPaise: 100000 }],
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['groups'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['collections'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['loans'] });
    });

    it('handles mutation error', async () => {
      mockPost.mockRejectedValueOnce(new Error('Insufficient amount'));

      const { result } = renderHook(() => usePostGroupCollection(), { wrapper });

      result.current.mutate({
        groupId: 'grp-1',
        payments: [],
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });
});
