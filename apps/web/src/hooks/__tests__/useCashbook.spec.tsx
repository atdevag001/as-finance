import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useDailySummary,
  useHandovers,
  useCreateExpense,
  useCreateHandover,
  useVerifyHandover,
} from '../useCashbook';
import type { ReactNode } from 'react';

// Mock the API client
const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPatch = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
  },
}));

/**
 * useCashbook Hook Tests
 *
 * Tests the cashbook hooks for:
 * - Daily summary with date filter
 * - Discrepancy detection
 * - Handovers list
 * - Create expense mutation
 * - Create handover mutation
 * - Verify handover mutation
 * - Query invalidation
 *
 * **Validates: Cashbook management workflow**
 */

describe('useCashbook Hook', () => {
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

  describe('useDailySummary', () => {
    const mockSummary = {
      date: '2024-01-15',
      openingBalancePaise: 100000,
      cashInflowsPaise: 500000,
      cashOutflowsPaise: 200000,
      closingBalancePaise: 400000,
      hasDiscrepancy: false,
      transactionCount: 15,
    };

    it('fetches daily summary without date filter', async () => {
      mockGet.mockResolvedValueOnce(mockSummary);

      const { result } = renderHook(() => useDailySummary(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith('/cashbook/daily-summary');
      expect(result.current.data).toEqual(mockSummary);
    });

    it('fetches daily summary with specific date', async () => {
      mockGet.mockResolvedValueOnce(mockSummary);

      const { result } = renderHook(() => useDailySummary('2024-01-15'), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith('/cashbook/daily-summary?date=2024-01-15');
    });

    it('returns all summary fields', async () => {
      mockGet.mockResolvedValueOnce(mockSummary);

      const { result } = renderHook(() => useDailySummary(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const summary = result.current.data!;
      expect(summary.date).toBeDefined();
      expect(summary.openingBalancePaise).toBeDefined();
      expect(summary.cashInflowsPaise).toBeDefined();
      expect(summary.cashOutflowsPaise).toBeDefined();
      expect(summary.closingBalancePaise).toBeDefined();
      expect(summary.hasDiscrepancy).toBeDefined();
      expect(summary.transactionCount).toBeDefined();
    });

    it('closing = opening + inflows - outflows', async () => {
      mockGet.mockResolvedValueOnce(mockSummary);

      const { result } = renderHook(() => useDailySummary(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const summary = result.current.data!;
      const expectedClosing =
        summary.openingBalancePaise + summary.cashInflowsPaise - summary.cashOutflowsPaise;
      expect(summary.closingBalancePaise).toBe(expectedClosing);
    });

    it('detects discrepancy state', async () => {
      const discrepancySummary = { ...mockSummary, hasDiscrepancy: true };
      mockGet.mockResolvedValueOnce(discrepancySummary);

      const { result } = renderHook(() => useDailySummary(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.hasDiscrepancy).toBe(true);
    });

    it('amounts are in paise (integers)', async () => {
      mockGet.mockResolvedValueOnce(mockSummary);

      const { result } = renderHook(() => useDailySummary(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const summary = result.current.data!;
      expect(Number.isInteger(summary.openingBalancePaise)).toBe(true);
      expect(Number.isInteger(summary.cashInflowsPaise)).toBe(true);
      expect(Number.isInteger(summary.cashOutflowsPaise)).toBe(true);
      expect(Number.isInteger(summary.closingBalancePaise)).toBe(true);
    });

    it('returns loading state initially', () => {
      mockGet.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useDailySummary(), { wrapper });

      expect(result.current.isLoading).toBe(true);
    });

    it('handles error state', async () => {
      mockGet.mockRejectedValueOnce(new Error('Server Error'));

      const { result } = renderHook(() => useDailySummary(), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe('useHandovers', () => {
    const mockHandovers = [
      {
        id: 'ho-1',
        collection_officer_id: 'user-1',
        officer_name: 'John Doe',
        total_amount_paise: 250000,
        receiving_officer_id: 'manager-1',
        handover_date: '2024-01-15',
        verification_status: 'pending',
        created_at: '2024-01-15T18:00:00.000Z',
      },
      {
        id: 'ho-2',
        collection_officer_id: 'user-2',
        officer_name: 'Jane Smith',
        total_amount_paise: 180000,
        receiving_officer_id: 'manager-2',
        handover_date: '2024-01-15',
        verification_status: 'verified',
        verified_by: 'manager-1',
        created_at: '2024-01-15T17:00:00.000Z',
      },
    ];

    it('fetches handovers list', async () => {
      mockGet.mockResolvedValueOnce(mockHandovers);

      const { result } = renderHook(() => useHandovers(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith('/cashbook/handovers');
      expect(result.current.data).toEqual(mockHandovers);
    });

    it('includes pending handovers', async () => {
      mockGet.mockResolvedValueOnce(mockHandovers);

      const { result } = renderHook(() => useHandovers(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const pendingHandovers = result.current.data?.filter(h => h.verification_status === 'pending');
      expect(pendingHandovers?.length).toBeGreaterThan(0);
    });

    it('includes verified handovers with verified_by', async () => {
      mockGet.mockResolvedValueOnce(mockHandovers);

      const { result } = renderHook(() => useHandovers(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const verifiedHandovers = result.current.data?.filter(h => h.verification_status === 'verified');
      verifiedHandovers?.forEach(h => {
        expect(h.verified_by).toBeDefined();
      });
    });

    it('amounts are in paise', async () => {
      mockGet.mockResolvedValueOnce(mockHandovers);

      const { result } = renderHook(() => useHandovers(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      result.current.data?.forEach(h => {
        expect(Number.isInteger(h.total_amount_paise)).toBe(true);
      });
    });

    it('returns loading state initially', () => {
      mockGet.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useHandovers(), { wrapper });

      expect(result.current.isLoading).toBe(true);
    });

    it('handles error state', async () => {
      mockGet.mockRejectedValueOnce(new Error('Server Error'));

      const { result } = renderHook(() => useHandovers(), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe('useCreateExpense', () => {
    it('creates an expense', async () => {
      mockPost.mockResolvedValueOnce({ id: 'exp-1' });

      const { result } = renderHook(() => useCreateExpense(), { wrapper });

      result.current.mutate({
        category: 'office_supplies',
        amount_paise: 50000,
        description: 'Printer paper',
        payment_mode: 'cash',
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPost).toHaveBeenCalledWith('/cashbook/expenses', {
        category: 'office_supplies',
        amount_paise: 50000,
        description: 'Printer paper',
        payment_mode: 'cash',
      });
    });

    it('invalidates cashbook queries on success', async () => {
      mockPost.mockResolvedValueOnce({ id: 'exp-1' });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useCreateExpense(), { wrapper });

      result.current.mutate({ amount_paise: 10000 });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['cashbook'] });
    });

    it('handles mutation error', async () => {
      mockPost.mockRejectedValueOnce(new Error('Insufficient balance'));

      const { result } = renderHook(() => useCreateExpense(), { wrapper });

      result.current.mutate({ amount_paise: 1000000 });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });

    it('handles slow mutation', async () => {
      mockPost.mockImplementation(() => new Promise((resolve) => {
        setTimeout(() => resolve({ id: 'exp-1' }), 100);
      }));

      const { result } = renderHook(() => useCreateExpense(), { wrapper });

      result.current.mutate({ amount_paise: 10000 });

      // Eventually succeeds even with slow response
      await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 2000 });
    });

    const expenseCategoryTests = [
      { category: 'office_supplies', description: 'office supplies' },
      { category: 'travel', description: 'travel expense' },
      { category: 'utilities', description: 'utility payment' },
      { category: 'miscellaneous', description: 'miscellaneous' },
    ];

    it.each(expenseCategoryTests)('accepts $description category', async ({ category }) => {
      mockPost.mockResolvedValueOnce({ id: 'exp-1' });

      const { result } = renderHook(() => useCreateExpense(), { wrapper });

      result.current.mutate({ category, amount_paise: 10000 });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPost).toHaveBeenCalledWith('/cashbook/expenses', expect.objectContaining({
        category,
      }));
    });
  });

  describe('useCreateHandover', () => {
    it('creates a handover', async () => {
      mockPost.mockResolvedValueOnce({ id: 'ho-new', status: 'pending' });

      const { result } = renderHook(() => useCreateHandover(), { wrapper });

      result.current.mutate({
        amount_paise: 250000,
        remarks: 'End of day cash handover',
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPost).toHaveBeenCalledWith('/cashbook/handovers', {
        amount_paise: 250000,
        remarks: 'End of day cash handover',
      });
    });

    it('invalidates cashbook queries on success', async () => {
      mockPost.mockResolvedValueOnce({ id: 'ho-new' });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useCreateHandover(), { wrapper });

      result.current.mutate({ amount_paise: 100000 });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['cashbook'] });
    });

    it('handles mutation error', async () => {
      mockPost.mockRejectedValueOnce(new Error('Amount exceeds available cash'));

      const { result } = renderHook(() => useCreateHandover(), { wrapper });

      result.current.mutate({ amount_paise: 10000000 });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });

    it('handles slow mutation', async () => {
      mockPost.mockImplementation(() => new Promise((resolve) => {
        setTimeout(() => resolve({ id: 'ho-new' }), 100);
      }));

      const { result } = renderHook(() => useCreateHandover(), { wrapper });

      result.current.mutate({ amount_paise: 100000 });

      // Eventually succeeds even with slow response
      await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 2000 });
    });
  });

  describe('useVerifyHandover', () => {
    it('verifies a handover', async () => {
      mockPatch.mockResolvedValueOnce({ id: 'ho-1', verification_status: 'verified' });

      const { result } = renderHook(() => useVerifyHandover(), { wrapper });

      result.current.mutate({ id: 'ho-1', verificationStatus: 'verified' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPatch).toHaveBeenCalledWith('/cashbook/handovers/ho-1/verify', { verificationStatus: 'verified' });
    });

    it('marks a handover as discrepancy', async () => {
      mockPatch.mockResolvedValueOnce({ id: 'ho-1', verification_status: 'discrepancy' });

      const { result } = renderHook(() => useVerifyHandover(), { wrapper });

      result.current.mutate({ id: 'ho-1', verificationStatus: 'discrepancy' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPatch).toHaveBeenCalledWith('/cashbook/handovers/ho-1/verify', { verificationStatus: 'discrepancy' });
    });

    it('invalidates cashbook queries on success', async () => {
      mockPatch.mockResolvedValueOnce({ id: 'ho-1', verification_status: 'verified' });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useVerifyHandover(), { wrapper });

      result.current.mutate({ id: 'ho-1', verificationStatus: 'verified' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['cashbook'] });
    });

    it('handles 404 error when handover not found', async () => {
      const notFoundError = new Error('Handover not found');
      (notFoundError as Error & { statusCode: number }).statusCode = 404;
      mockPatch.mockRejectedValueOnce(notFoundError);

      const { result } = renderHook(() => useVerifyHandover(), { wrapper });

      result.current.mutate({ id: 'invalid-ho', verificationStatus: 'verified' });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });

    it('handles 409 error when already verified', async () => {
      const conflictError = new Error('Handover already verified');
      (conflictError as Error & { statusCode: number }).statusCode = 409;
      mockPatch.mockRejectedValueOnce(conflictError);

      const { result } = renderHook(() => useVerifyHandover(), { wrapper });

      result.current.mutate({ id: 'ho-already-verified', verificationStatus: 'verified' });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });

    it('handles slow mutation', async () => {
      mockPatch.mockImplementation(() => new Promise((resolve) => {
        setTimeout(() => resolve({ id: 'ho-1', verification_status: 'verified' }), 100);
      }));

      const { result } = renderHook(() => useVerifyHandover(), { wrapper });

      result.current.mutate({ id: 'ho-1', verificationStatus: 'verified' });

      // Eventually succeeds even with slow response
      await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 2000 });
    });

    it('does not invalidate queries on error', async () => {
      mockPatch.mockRejectedValueOnce(new Error('Server Error'));

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useVerifyHandover(), { wrapper });

      result.current.mutate({ id: 'ho-1', verificationStatus: 'verified' });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(invalidateSpy).not.toHaveBeenCalled();
    });
  });
});
