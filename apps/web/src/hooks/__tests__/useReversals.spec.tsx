import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCreateReversal } from '../useReversals';
import type { ReactNode } from 'react';

// Mock the API client
const mockPost = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

/**
 * useReversals Hook Tests
 *
 * Tests the useCreateReversal mutation for:
 * - Reversal creation with reason
 * - Idempotency key header
 * - Query invalidation after success
 * - Error handling (404, 409, etc.)
 *
 * **Validates: Collection reversal workflow and idempotency**
 */

describe('useReversals Hook', () => {
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

  describe('useCreateReversal', () => {
    it('creates a reversal with reason', async () => {
      mockPost.mockResolvedValueOnce({ id: 'rev-1', status: 'reversed' });

      const { result } = renderHook(() => useCreateReversal(), { wrapper });

      result.current.mutate({
        collectionId: 'col-1',
        reason: 'Payment was duplicate entry',
        idempotencyKey: 'idem-key-123',
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPost).toHaveBeenCalledWith(
        '/reversals',
        { collectionId: 'col-1', reason: 'Payment was duplicate entry' },
        { headers: { 'X-Idempotency-Key': 'idem-key-123' } }
      );
    });

    it('sends X-Idempotency-Key header', async () => {
      mockPost.mockResolvedValueOnce({ id: 'rev-1' });

      const { result } = renderHook(() => useCreateReversal(), { wrapper });

      result.current.mutate({
        collectionId: 'col-1',
        reason: 'Customer complaint',
        idempotencyKey: 'unique-key-456',
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const callArgs = mockPost.mock.calls[0];
      expect(callArgs[2]).toEqual({ headers: { 'X-Idempotency-Key': 'unique-key-456' } });
    });

    it('invalidates collections, loans, and receipts queries on success', async () => {
      mockPost.mockResolvedValueOnce({ id: 'rev-1' });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useCreateReversal(), { wrapper });

      result.current.mutate({
        collectionId: 'col-1',
        reason: 'Test reversal',
        idempotencyKey: 'key-1',
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['collections'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['loans'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['receipts'] });
    });

    it('handles 400 error for invalid request', async () => {
      const badRequestError = new Error('Bad Request');
      (badRequestError as Error & { statusCode: number }).statusCode = 400;
      mockPost.mockRejectedValueOnce(badRequestError);

      const { result } = renderHook(() => useCreateReversal(), { wrapper });

      result.current.mutate({
        collectionId: 'col-1',
        reason: 'Test',
        idempotencyKey: 'key-1',
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });

    it('handles 404 error when collection not found', async () => {
      const notFoundError = new Error('Collection not found');
      (notFoundError as Error & { statusCode: number }).statusCode = 404;
      mockPost.mockRejectedValueOnce(notFoundError);

      const { result } = renderHook(() => useCreateReversal(), { wrapper });

      result.current.mutate({
        collectionId: 'invalid-col',
        reason: 'Testing not found',
        idempotencyKey: 'key-1',
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toBe('Collection not found');
    });

    it('handles 409 error when already reversed', async () => {
      const conflictError = new Error('Collection already reversed');
      (conflictError as Error & { statusCode: number }).statusCode = 409;
      mockPost.mockRejectedValueOnce(conflictError);

      const { result } = renderHook(() => useCreateReversal(), { wrapper });

      result.current.mutate({
        collectionId: 'col-already-reversed',
        reason: 'Trying to reverse again',
        idempotencyKey: 'key-1',
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toBe('Collection already reversed');
    });

    it('handles slow mutation', async () => {
      mockPost.mockImplementation(() => new Promise((resolve) => {
        setTimeout(() => resolve({ id: 'rev-1' }), 100);
      }));

      const { result } = renderHook(() => useCreateReversal(), { wrapper });

      result.current.mutate({
        collectionId: 'col-1',
        reason: 'Test reversal',
        idempotencyKey: 'key-1',
      });

      // Eventually succeeds even with slow response
      await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 2000 });
    });

    it('same idempotency key returns same result', async () => {
      const reversalResult = { id: 'rev-1', status: 'reversed' };
      mockPost.mockResolvedValue(reversalResult);

      const { result } = renderHook(() => useCreateReversal(), { wrapper });

      // First call
      result.current.mutate({
        collectionId: 'col-1',
        reason: 'Test reversal',
        idempotencyKey: 'same-key',
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Reset for second call
      result.current.reset();

      // Second call with same key
      result.current.mutate({
        collectionId: 'col-1',
        reason: 'Test reversal',
        idempotencyKey: 'same-key',
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Both calls should have used the same idempotency key
      expect(mockPost).toHaveBeenCalledTimes(2);
      const firstCallKey = mockPost.mock.calls[0][2].headers['X-Idempotency-Key'];
      const secondCallKey = mockPost.mock.calls[1][2].headers['X-Idempotency-Key'];
      expect(firstCallKey).toBe(secondCallKey);
    });

    const reasonTests = [
      { reason: 'Duplicate payment', description: 'duplicate payment' },
      { reason: 'Customer complaint - wrong amount', description: 'wrong amount' },
      { reason: 'Bank returned cheque', description: 'bounced cheque' },
      { reason: 'Wrong loan credited', description: 'wrong loan' },
      { reason: 'Testing purposes only', description: 'testing' },
    ];

    it.each(reasonTests)('accepts $description reason', async ({ reason }) => {
      mockPost.mockResolvedValueOnce({ id: 'rev-1' });

      const { result } = renderHook(() => useCreateReversal(), { wrapper });

      result.current.mutate({
        collectionId: 'col-1',
        reason,
        idempotencyKey: 'key-1',
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPost).toHaveBeenCalledWith(
        '/reversals',
        expect.objectContaining({ reason }),
        expect.any(Object)
      );
    });

    it('does not invalidate queries on error', async () => {
      mockPost.mockRejectedValueOnce(new Error('Server Error'));

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useCreateReversal(), { wrapper });

      result.current.mutate({
        collectionId: 'col-1',
        reason: 'Test',
        idempotencyKey: 'key-1',
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(invalidateSpy).not.toHaveBeenCalled();
    });
  });
});
