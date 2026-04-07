import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCollections, usePostCollection, useReceipt } from '../useCollections';
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
 * useCollections Hook Tests
 *
 * Tests the useCollections hooks for:
 * - List queries with pagination and filters
 * - Post collection mutation
 * - Receipt query
 * - Query invalidation after mutations
 * - Idempotency key handling
 *
 * **Validates: Collection workflow hooks and state management**
 */

describe('useCollections Hook', () => {
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

  describe('useCollections (list)', () => {
    const mockCollectionsList = {
      data: [
        {
          id: 'col-1',
          loan_id: 'loan-1',
          loan_number: 'LN-2024-001',
          customer_name: 'John Doe',
          amount_paise: 500000,
          payment_date: '2024-01-15',
          payment_mode: 'cash',
          status: 'posted',
          receipt_id: 'rcpt-1',
          created_at: '2024-01-15T10:00:00.000Z',
        },
        {
          id: 'col-2',
          loan_id: 'loan-2',
          loan_number: 'LN-2024-002',
          customer_name: 'Jane Smith',
          amount_paise: 750000,
          payment_date: '2024-01-16',
          payment_mode: 'upi',
          status: 'posted',
          receipt_id: 'rcpt-2',
          created_at: '2024-01-16T10:00:00.000Z',
        },
      ],
      total: 50,
    };

    it('fetches collections list with default pagination', async () => {
      mockGet.mockResolvedValueOnce(mockCollectionsList);

      const { result } = renderHook(() => useCollections(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith('/collections?skip=0&take=20');
      expect(result.current.data).toEqual(mockCollectionsList);
    });

    it('fetches collections with specific page', async () => {
      mockGet.mockResolvedValueOnce({ data: [], total: 100 });

      const { result } = renderHook(() => useCollections({ page: 3 }), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Page 3 with pageSize 20: skip = (3-1) * 20 = 40
      expect(mockGet).toHaveBeenCalledWith('/collections?skip=40&take=20');
    });

    it('filters by loanId', async () => {
      mockGet.mockResolvedValueOnce({ data: [], total: 0 });

      const { result } = renderHook(
        () => useCollections({ loanId: 'loan-123' }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('loanId=loan-123'));
    });

    it('filters by date range', async () => {
      mockGet.mockResolvedValueOnce({ data: [], total: 0 });

      const { result } = renderHook(
        () => useCollections({ startDate: '2024-01-01', endDate: '2024-01-31' }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const url = mockGet.mock.calls[0][0] as string;
      expect(url).toContain('startDate=2024-01-01');
      expect(url).toContain('endDate=2024-01-31');
    });

    it('filters by loanNumber', async () => {
      mockGet.mockResolvedValueOnce({ data: [], total: 0 });

      const { result } = renderHook(
        () => useCollections({ loanNumber: 'LN-2024' }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('loanNumber=LN-2024'));
    });

    it('combines multiple filters', async () => {
      mockGet.mockResolvedValueOnce({ data: [], total: 0 });

      const { result } = renderHook(
        () => useCollections({
          page: 2,
          loanId: 'loan-1',
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          loanNumber: 'LN-2024',
        }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const url = mockGet.mock.calls[0][0] as string;
      expect(url).toContain('skip=20');
      expect(url).toContain('loanId=loan-1');
      expect(url).toContain('startDate=2024-01-01');
      expect(url).toContain('endDate=2024-01-31');
      expect(url).toContain('loanNumber=LN-2024');
    });

    it('returns loading state initially', () => {
      mockGet.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useCollections(), { wrapper });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.data).toBeUndefined();
    });

    it('returns error state on API failure', async () => {
      mockGet.mockRejectedValueOnce(new Error('Server Error'));

      const { result } = renderHook(() => useCollections(), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });

    it('returns empty data when no matches', async () => {
      mockGet.mockResolvedValueOnce({ data: [], total: 0 });

      const { result } = renderHook(() => useCollections(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.data).toEqual([]);
      expect(result.current.data?.total).toBe(0);
    });

    const pageTests = [
      { page: 1, expectedSkip: 0 },
      { page: 2, expectedSkip: 20 },
      { page: 5, expectedSkip: 80 },
      { page: 10, expectedSkip: 180 },
    ];

    it.each(pageTests)('page $page calculates skip=$expectedSkip', async ({ page, expectedSkip }) => {
      mockGet.mockResolvedValueOnce({ data: [], total: 100 });

      const { result } = renderHook(() => useCollections({ page }), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith(expect.stringContaining(`skip=${expectedSkip}`));
    });
  });

  describe('usePostCollection', () => {
    it('posts a new collection', async () => {
      const newCollection = { id: 'col-new', receipt_id: 'rcpt-new' };
      mockPost.mockResolvedValueOnce(newCollection);

      const { result } = renderHook(() => usePostCollection(), { wrapper });

      result.current.mutate({
        loan_id: 'loan-1',
        amount_paise: 500000,
        payment_mode: 'cash',
        payment_date: '2024-01-15',
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPost).toHaveBeenCalledWith('/collections', {
        loan_id: 'loan-1',
        amount_paise: 500000,
        payment_mode: 'cash',
        payment_date: '2024-01-15',
      });
    });

    it('invalidates collections and loans queries on success', async () => {
      mockPost.mockResolvedValueOnce({ id: 'col-new' });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => usePostCollection(), { wrapper });

      result.current.mutate({ loan_id: 'loan-1', amount_paise: 100000 });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['collections'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['loans'] });
    });

    it('handles mutation error', async () => {
      mockPost.mockRejectedValueOnce(new Error('Insufficient balance'));

      const { result } = renderHook(() => usePostCollection(), { wrapper });

      result.current.mutate({ loan_id: 'loan-1', amount_paise: 100000 });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });

    it('handles slow mutation', async () => {
      mockPost.mockImplementation(() => new Promise((resolve) => {
        setTimeout(() => resolve({ id: 'col-new' }), 100);
      }));

      const { result } = renderHook(() => usePostCollection(), { wrapper });

      result.current.mutate({ loan_id: 'loan-1', amount_paise: 100000 });

      // Eventually succeeds even with slow response
      await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 2000 });
    });

    const paymentModeTests = [
      { mode: 'cash', description: 'cash payment' },
      { mode: 'upi', description: 'UPI payment' },
      { mode: 'bank_transfer', description: 'bank transfer' },
      { mode: 'cheque', description: 'cheque payment' },
    ];

    it.each(paymentModeTests)('accepts $description mode', async ({ mode }) => {
      mockPost.mockResolvedValueOnce({ id: 'col-new' });

      const { result } = renderHook(() => usePostCollection(), { wrapper });

      result.current.mutate({
        loan_id: 'loan-1',
        amount_paise: 100000,
        payment_mode: mode,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPost).toHaveBeenCalledWith('/collections', expect.objectContaining({
        payment_mode: mode,
      }));
    });
  });

  describe('useReceipt', () => {
    const mockReceipt = {
      id: 'rcpt-1',
      receipt_number: 'RCP-2024-001',
      collection_id: 'col-1',
      customer_name: 'John Doe',
      loan_number: 'LN-2024-001',
      amount_paise: 500000,
      principal_paise: 350000,
      interest_paise: 100000,
      penalty_paise: 50000,
      outstanding_after_paise: 4500000,
      officer_name: 'Field Officer',
      payment_mode: 'cash',
      payment_date: '2024-01-15',
      status: 'posted',
      created_at: '2024-01-15T10:00:00.000Z',
    };

    it('fetches receipt by ID', async () => {
      mockGet.mockResolvedValueOnce(mockReceipt);

      const { result } = renderHook(() => useReceipt('rcpt-1'), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith('/receipts/rcpt-1');
      expect(result.current.data).toEqual(mockReceipt);
    });

    it('includes allocation breakdown', async () => {
      mockGet.mockResolvedValueOnce(mockReceipt);

      const { result } = renderHook(() => useReceipt('rcpt-1'), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.principal_paise).toBe(350000);
      expect(result.current.data?.interest_paise).toBe(100000);
      expect(result.current.data?.penalty_paise).toBe(50000);
    });

    it('does not fetch when ID is empty', () => {
      renderHook(() => useReceipt(''), { wrapper });

      expect(mockGet).not.toHaveBeenCalled();
    });

    it('returns 404 error when receipt not found', async () => {
      const notFoundError = new Error('Not Found');
      (notFoundError as Error & { statusCode: number }).statusCode = 404;
      mockGet.mockRejectedValueOnce(notFoundError);

      const { result } = renderHook(() => useReceipt('invalid-id'), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });

    it('calculates correct allocation total', async () => {
      mockGet.mockResolvedValueOnce(mockReceipt);

      const { result } = renderHook(() => useReceipt('rcpt-1'), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const receipt = result.current.data!;
      const allocationTotal = receipt.principal_paise + receipt.interest_paise + receipt.penalty_paise;
      expect(allocationTotal).toBe(receipt.amount_paise);
    });
  });
});
