import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useGenerateForeclosureQuote, useExecuteForeclosure } from '../useForeclosures';
import type { ReactNode } from 'react';

// Mock the API client
const mockPost = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

/**
 * useForeclosures Hook Tests
 *
 * Tests the foreclosure hooks for:
 * - Quote generation with settlement amounts
 * - Quote execution with idempotency and payment mode
 * - Query invalidation after successful foreclosure
 * - Error handling for expired quotes and invalid states
 *
 * **Validates: Foreclosure workflow - quote and execute**
 */

describe('useForeclosures Hook', () => {
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

  describe('useGenerateForeclosureQuote', () => {
    const mockQuote = {
      foreclosureId: 'fc-quote-1',
      loanId: 'loan-1',
      loanNumber: 'LN-001',
      outstandingPrincipalPaise: 4000000,
      accruedInterestPaise: 200000,
      pendingPenaltiesPaise: 50000,
      rebatePaise: 100000,
      settlementAmountPaise: 4150000,
      quoteExpiresAt: '2024-01-20T18:00:00.000Z',
      status: 'pending',
    };

    it('generates a foreclosure quote', async () => {
      mockPost.mockResolvedValueOnce(mockQuote);

      const { result } = renderHook(() => useGenerateForeclosureQuote(), { wrapper });

      result.current.mutate({ loanId: 'loan-1' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPost).toHaveBeenCalledWith('/foreclosures/quote', { loanId: 'loan-1' });
    });

    it('returns all quote fields in response', async () => {
      mockPost.mockResolvedValueOnce(mockQuote);

      const { result } = renderHook(() => useGenerateForeclosureQuote(), { wrapper });

      result.current.mutate({ loanId: 'loan-1' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const quote = result.current.data!;
      expect(quote.foreclosureId).toBe('fc-quote-1');
      expect(quote.outstandingPrincipalPaise).toBe(4000000);
      expect(quote.accruedInterestPaise).toBe(200000);
      expect(quote.pendingPenaltiesPaise).toBe(50000);
      expect(quote.rebatePaise).toBe(100000);
      expect(quote.settlementAmountPaise).toBe(4150000);
      expect(quote.quoteExpiresAt).toBeDefined();
    });

    it('returns amounts in paise', async () => {
      mockPost.mockResolvedValueOnce(mockQuote);

      const { result } = renderHook(() => useGenerateForeclosureQuote(), { wrapper });

      result.current.mutate({ loanId: 'loan-1' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const quote = result.current.data!;
      // All amounts should be integers (paise)
      expect(Number.isInteger(quote.outstandingPrincipalPaise)).toBe(true);
      expect(Number.isInteger(quote.accruedInterestPaise)).toBe(true);
      expect(Number.isInteger(quote.pendingPenaltiesPaise)).toBe(true);
      expect(Number.isInteger(quote.rebatePaise)).toBe(true);
      expect(Number.isInteger(quote.settlementAmountPaise)).toBe(true);
    });

    it('settlement = principal + interest + penalties - rebate', async () => {
      mockPost.mockResolvedValueOnce(mockQuote);

      const { result } = renderHook(() => useGenerateForeclosureQuote(), { wrapper });

      result.current.mutate({ loanId: 'loan-1' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const quote = result.current.data!;
      const expectedSettlement =
        quote.outstandingPrincipalPaise +
        quote.accruedInterestPaise +
        quote.pendingPenaltiesPaise -
        quote.rebatePaise;
      expect(quote.settlementAmountPaise).toBe(expectedSettlement);
    });

    it('quoteExpiresAt is set in the future', async () => {
      const futureDate = new Date();
      futureDate.setHours(futureDate.getHours() + 24);

      mockPost.mockResolvedValueOnce({
        ...mockQuote,
        quoteExpiresAt: futureDate.toISOString(),
      });

      const { result } = renderHook(() => useGenerateForeclosureQuote(), { wrapper });

      result.current.mutate({ loanId: 'loan-1' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const expiresAt = new Date(result.current.data!.quoteExpiresAt);
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('handles error when loan not active', async () => {
      const error = new Error('Loan is not in active status');
      (error as Error & { statusCode: number }).statusCode = 400;
      mockPost.mockRejectedValueOnce(error);

      const { result } = renderHook(() => useGenerateForeclosureQuote(), { wrapper });

      result.current.mutate({ loanId: 'loan-closed' });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toBe('Loan is not in active status');
    });

    it('handles 404 when loan not found', async () => {
      const error = new Error('Loan not found');
      (error as Error & { statusCode: number }).statusCode = 404;
      mockPost.mockRejectedValueOnce(error);

      const { result } = renderHook(() => useGenerateForeclosureQuote(), { wrapper });

      result.current.mutate({ loanId: 'invalid-loan' });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });

    it('handles slow mutation', async () => {
      mockPost.mockImplementation(() => new Promise((resolve) => {
        setTimeout(() => resolve(mockQuote), 100);
      }));

      const { result } = renderHook(() => useGenerateForeclosureQuote(), { wrapper });

      result.current.mutate({ loanId: 'loan-1' });

      // Eventually succeeds even with slow response
      await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 2000 });
    });
  });

  describe('useExecuteForeclosure', () => {
    it('executes a foreclosure with required paymentMode', async () => {
      mockPost.mockResolvedValueOnce({ status: 'closed' });

      const { result } = renderHook(() => useExecuteForeclosure(), { wrapper });

      result.current.mutate({
        foreclosureId: 'fc-quote-1',
        paymentMode: 'cash',
        idempotencyKey: 'idem-key-123',
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPost).toHaveBeenCalledWith('/foreclosures', {
        foreclosureId: 'fc-quote-1',
        paymentMode: 'cash',
        idempotencyKey: 'idem-key-123',
      });
    });

    it('sends idempotency key and payment mode in body', async () => {
      mockPost.mockResolvedValueOnce({ status: 'closed' });

      const { result } = renderHook(() => useExecuteForeclosure(), { wrapper });

      result.current.mutate({
        foreclosureId: 'fc-quote-1',
        paymentMode: 'bank_transfer',
        idempotencyKey: 'unique-key-456',
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPost).toHaveBeenCalledWith(
        '/foreclosures',
        expect.objectContaining({
          idempotencyKey: 'unique-key-456',
          paymentMode: 'bank_transfer',
        })
      );
    });

    it('invalidates loans, collections, and foreclosures queries on success', async () => {
      mockPost.mockResolvedValueOnce({ status: 'closed' });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useExecuteForeclosure(), { wrapper });

      result.current.mutate({
        foreclosureId: 'fc-quote-1',
        paymentMode: 'cash',
        idempotencyKey: 'key-1',
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['loans'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['collections'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['foreclosures'] });
    });

    it('handles 400 error when quote expired', async () => {
      const error = new Error('Quote has expired');
      (error as Error & { statusCode: number }).statusCode = 400;
      mockPost.mockRejectedValueOnce(error);

      const { result } = renderHook(() => useExecuteForeclosure(), { wrapper });

      result.current.mutate({
        foreclosureId: 'fc-quote-expired',
        paymentMode: 'cash',
        idempotencyKey: 'key-1',
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toBe('Quote has expired');
    });

    it('handles 404 when quote not found', async () => {
      const error = new Error('Foreclosure quote not found');
      (error as Error & { statusCode: number }).statusCode = 404;
      mockPost.mockRejectedValueOnce(error);

      const { result } = renderHook(() => useExecuteForeclosure(), { wrapper });

      result.current.mutate({
        foreclosureId: 'invalid-quote',
        paymentMode: 'cash',
        idempotencyKey: 'key-1',
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });

    it('handles 409 when already executed', async () => {
      const error = new Error('Foreclosure already executed');
      (error as Error & { statusCode: number }).statusCode = 409;
      mockPost.mockRejectedValueOnce(error);

      const { result } = renderHook(() => useExecuteForeclosure(), { wrapper });

      result.current.mutate({
        foreclosureId: 'fc-quote-done',
        paymentMode: 'cash',
        idempotencyKey: 'key-1',
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toBe('Foreclosure already executed');
    });

    it('handles slow mutation', async () => {
      mockPost.mockImplementation(() => new Promise((resolve) => {
        setTimeout(() => resolve({ status: 'closed' }), 100);
      }));

      const { result } = renderHook(() => useExecuteForeclosure(), { wrapper });

      result.current.mutate({
        foreclosureId: 'fc-quote-1',
        paymentMode: 'cash',
        idempotencyKey: 'key-1',
      });

      // Eventually succeeds even with slow response
      await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 2000 });
    });

    it('does not invalidate queries on error', async () => {
      mockPost.mockRejectedValueOnce(new Error('Server Error'));

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useExecuteForeclosure(), { wrapper });

      result.current.mutate({
        foreclosureId: 'fc-quote-1',
        paymentMode: 'cash',
        idempotencyKey: 'key-1',
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(invalidateSpy).not.toHaveBeenCalled();
    });

    it('supports optional rebate fields', async () => {
      mockPost.mockResolvedValueOnce({ status: 'closed' });

      const { result } = renderHook(() => useExecuteForeclosure(), { wrapper });

      result.current.mutate({
        foreclosureId: 'fc-quote-1',
        paymentMode: 'cash',
        idempotencyKey: 'key-1',
        rebatePaise: 10000,
        rebateReason: 'Good customer',
        rebateAuthorizedBy: 'user-123',
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPost).toHaveBeenCalledWith('/foreclosures', {
        foreclosureId: 'fc-quote-1',
        paymentMode: 'cash',
        idempotencyKey: 'key-1',
        rebatePaise: 10000,
        rebateReason: 'Good customer',
        rebateAuthorizedBy: 'user-123',
      });
    });
  });
});
