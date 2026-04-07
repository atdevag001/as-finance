import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePenalties, useWaivePenalty } from '../usePenalties';
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
 * usePenalties Hook Tests
 *
 * Tests the usePenalties hooks for:
 * - List penalties by loanId
 * - Waive penalty with reason
 * - Query invalidation after waive
 * - Error handling (already waived, not found)
 *
 * **Validates: Penalty management workflow**
 */

describe('usePenalties Hook', () => {
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

  describe('usePenalties (list)', () => {
    const mockPenaltiesList = {
      data: [
        {
          id: 'pen-1',
          loan_id: 'loan-1',
          installment_id: 'inst-1',
          installment_number: 1,
          amount_paise: 5000,
          period: '2024-01',
          status: 'active',
          posted_date: '2024-01-15',
          created_at: '2024-01-15T10:00:00.000Z',
        },
        {
          id: 'pen-2',
          loan_id: 'loan-1',
          installment_id: 'inst-2',
          installment_number: 2,
          amount_paise: 7500,
          period: '2024-02',
          status: 'active',
          posted_date: '2024-02-15',
          created_at: '2024-02-15T10:00:00.000Z',
        },
        {
          id: 'pen-3',
          loan_id: 'loan-1',
          installment_id: 'inst-1',
          installment_number: 1,
          amount_paise: 5000,
          period: '2024-01',
          status: 'waived',
          posted_date: '2024-01-15',
          waived_at: '2024-01-20T10:00:00.000Z',
          waived_by: 'manager-1',
          waive_reason: 'Customer hardship',
          created_at: '2024-01-15T10:00:00.000Z',
        },
      ],
      total: 3,
    };

    it('fetches penalties by loanId', async () => {
      mockGet.mockResolvedValueOnce(mockPenaltiesList);

      const { result } = renderHook(() => usePenalties({ loanId: 'loan-1' }), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith('/penalties?loanId=loan-1');
      expect(result.current.data).toEqual(mockPenaltiesList);
    });

    it('does not fetch when loanId is empty', () => {
      renderHook(() => usePenalties({ loanId: '' }), { wrapper });

      expect(mockGet).not.toHaveBeenCalled();
    });

    it('returns loading state initially', () => {
      mockGet.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => usePenalties({ loanId: 'loan-1' }), { wrapper });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.data).toBeUndefined();
    });

    it('returns error state on API failure', async () => {
      mockGet.mockRejectedValueOnce(new Error('Server Error'));

      const { result } = renderHook(() => usePenalties({ loanId: 'loan-1' }), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });

    it('returns empty data when no penalties', async () => {
      mockGet.mockResolvedValueOnce({ data: [], total: 0 });

      const { result } = renderHook(() => usePenalties({ loanId: 'loan-1' }), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.data).toEqual([]);
      expect(result.current.data?.total).toBe(0);
    });

    it('includes waived penalty details', async () => {
      mockGet.mockResolvedValueOnce(mockPenaltiesList);

      const { result } = renderHook(() => usePenalties({ loanId: 'loan-1' }), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const waivedPenalty = result.current.data?.data.find(p => p.status === 'waived');
      expect(waivedPenalty?.waived_at).toBeDefined();
      expect(waivedPenalty?.waived_by).toBeDefined();
      expect(waivedPenalty?.waive_reason).toBeDefined();
    });

    it('penalty amounts are in paise', async () => {
      mockGet.mockResolvedValueOnce(mockPenaltiesList);

      const { result } = renderHook(() => usePenalties({ loanId: 'loan-1' }), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      result.current.data?.data.forEach(penalty => {
        expect(Number.isInteger(penalty.amount_paise)).toBe(true);
      });
    });

    const statusTests = [
      { status: 'active', count: 2 },
      { status: 'waived', count: 1 },
    ];

    it.each(statusTests)('includes penalties with status=$status', async ({ status, count }) => {
      mockGet.mockResolvedValueOnce(mockPenaltiesList);

      const { result } = renderHook(() => usePenalties({ loanId: 'loan-1' }), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const matchingPenalties = result.current.data?.data.filter(p => p.status === status);
      expect(matchingPenalties?.length).toBe(count);
    });
  });

  describe('useWaivePenalty', () => {
    it('waives a penalty with reason', async () => {
      mockPost.mockResolvedValueOnce({ id: 'pen-1', status: 'waived' });

      const { result } = renderHook(() => useWaivePenalty(), { wrapper });

      result.current.mutate({
        id: 'pen-1',
        reason: 'Customer facing financial hardship',
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPost).toHaveBeenCalledWith('/penalties/pen-1/waive', {
        reason: 'Customer facing financial hardship',
        approver: undefined,
      });
    });

    it('waives a penalty with approver', async () => {
      mockPost.mockResolvedValueOnce({ id: 'pen-1', status: 'waived' });

      const { result } = renderHook(() => useWaivePenalty(), { wrapper });

      result.current.mutate({
        id: 'pen-1',
        reason: 'Manager approved waiver',
        approver: 'manager-1',
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPost).toHaveBeenCalledWith('/penalties/pen-1/waive', {
        reason: 'Manager approved waiver',
        approver: 'manager-1',
      });
    });

    it('invalidates penalties and loans queries on success', async () => {
      mockPost.mockResolvedValueOnce({ id: 'pen-1', status: 'waived' });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useWaivePenalty(), { wrapper });

      result.current.mutate({ id: 'pen-1', reason: 'Test waiver' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['penalties'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['loans'] });
    });

    it('handles 404 error when penalty not found', async () => {
      const notFoundError = new Error('Penalty not found');
      (notFoundError as Error & { statusCode: number }).statusCode = 404;
      mockPost.mockRejectedValueOnce(notFoundError);

      const { result } = renderHook(() => useWaivePenalty(), { wrapper });

      result.current.mutate({ id: 'invalid-pen', reason: 'Test' });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toBe('Penalty not found');
    });

    it('handles 409 error when already waived', async () => {
      const conflictError = new Error('Penalty already waived');
      (conflictError as Error & { statusCode: number }).statusCode = 409;
      mockPost.mockRejectedValueOnce(conflictError);

      const { result } = renderHook(() => useWaivePenalty(), { wrapper });

      result.current.mutate({ id: 'pen-already-waived', reason: 'Test' });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toBe('Penalty already waived');
    });

    it('handles slow mutation', async () => {
      mockPost.mockImplementation(() => new Promise((resolve) => {
        setTimeout(() => resolve({ id: 'pen-1', status: 'waived' }), 100);
      }));

      const { result } = renderHook(() => useWaivePenalty(), { wrapper });

      result.current.mutate({ id: 'pen-1', reason: 'Test' });

      // Eventually succeeds even with slow response
      await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 2000 });
    });

    it('does not invalidate queries on error', async () => {
      mockPost.mockRejectedValueOnce(new Error('Server Error'));

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useWaivePenalty(), { wrapper });

      result.current.mutate({ id: 'pen-1', reason: 'Test' });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(invalidateSpy).not.toHaveBeenCalled();
    });

    const waiveReasonTests = [
      { reason: 'Customer hardship - lost job', description: 'hardship' },
      { reason: 'First-time late payment', description: 'first-time' },
      { reason: 'Bank processing delay', description: 'bank delay' },
      { reason: 'Festival waiver scheme', description: 'promotional' },
      { reason: 'Manager discretionary waiver', description: 'manager decision' },
    ];

    it.each(waiveReasonTests)('accepts $description waive reason', async ({ reason }) => {
      mockPost.mockResolvedValueOnce({ id: 'pen-1', status: 'waived' });

      const { result } = renderHook(() => useWaivePenalty(), { wrapper });

      result.current.mutate({ id: 'pen-1', reason });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPost).toHaveBeenCalledWith(
        '/penalties/pen-1/waive',
        expect.objectContaining({ reason })
      );
    });
  });
});
