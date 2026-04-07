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
 * - Quote execution with idempotency
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
      id: 'fc-quote-1',
      loan_id: 'loan-1',
      outstanding_principal_paise: 4000000,
      accrued_interest_paise: 200000,
      pending_penalties_paise: 50000,
      rebate_paise: 100000,
      settlement_amount_paise: 4150000,
      expires_at: '2024-01-20T18:00:00.000Z',
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
      expect(quote.id).toBe('fc-quote-1');
      expect(quote.outstanding_principal_paise).toBe(4000000);
      expect(quote.accrued_interest_paise).toBe(200000);
      expect(quote.pending_penalties_paise).toBe(50000);
      expect(quote.rebate_paise).toBe(100000);
      expect(quote.settlement_amount_paise).toBe(4150000);
      expect(quote.expires_at).toBeDefined();
    });

    it('returns amounts in paise', async () => {
      mockPost.mockResolvedValueOnce(mockQuote);

      const { result } = renderHook(() => useGenerateForeclosureQuote(), { wrapper });

      result.current.mutate({ loanId: 'loan-1' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const quote = result.current.data!;
      // All amounts should be integers (paise)
      expect(Number.isInteger(quote.outstanding_principal_paise)).toBe(true);
      expect(Number.isInteger(quote.accrued_interest_paise)).toBe(true);
      expect(Number.isInteger(quote.pending_penalties_paise)).toBe(true);
      expect(Number.isInteger(quote.rebate_paise)).toBe(true);
      expect(Number.isInteger(quote.settlement_amount_paise)).toBe(true);
    });

    it('settlement = principal + interest + penalties - rebate', async () => {
      mockPost.mockResolvedValueOnce(mockQuote);

      const { result } = renderHook(() => useGenerateForeclosureQuote(), { wrapper });

      result.current.mutate({ loanId: 'loan-1' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const quote = result.current.data!;
      const expectedSettlement =
        quote.outstanding_principal_paise +
        quote.accrued_interest_paise +
        quote.pending_penalties_paise -
        quote.rebate_paise;
      expect(quote.settlement_amount_paise).toBe(expectedSettlement);
    });

    it('expires_at is set in the future', async () => {
      const futureDate = new Date();
      futureDate.setHours(futureDate.getHours() + 24);

      mockPost.mockResolvedValueOnce({
        ...mockQuote,
        expires_at: futureDate.toISOString(),
      });

      const { result } = renderHook(() => useGenerateForeclosureQuote(), { wrapper });

      result.current.mutate({ loanId: 'loan-1' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const expiresAt = new Date(result.current.data!.expires_at);
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
    it('executes a foreclosure', async () => {
      mockPost.mockResolvedValueOnce({ status: 'closed' });

      const { result } = renderHook(() => useExecuteForeclosure(), { wrapper });

      result.current.mutate({ id: 'fc-quote-1', idempotencyKey: 'idem-key-123' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPost).toHaveBeenCalledWith('/foreclosures/fc-quote-1/execute', {
        idempotencyKey: 'idem-key-123',
      });
    });

    it('sends idempotency key in body', async () => {
      mockPost.mockResolvedValueOnce({ status: 'closed' });

      const { result } = renderHook(() => useExecuteForeclosure(), { wrapper });

      result.current.mutate({ id: 'fc-quote-1', idempotencyKey: 'unique-key-456' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPost).toHaveBeenCalledWith(
        '/foreclosures/fc-quote-1/execute',
        expect.objectContaining({ idempotencyKey: 'unique-key-456' })
      );
    });

    it('invalidates loans and collections queries on success', async () => {
      mockPost.mockResolvedValueOnce({ status: 'closed' });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useExecuteForeclosure(), { wrapper });

      result.current.mutate({ id: 'fc-quote-1', idempotencyKey: 'key-1' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['loans'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['collections'] });
    });

    it('handles 400 error when quote expired', async () => {
      const error = new Error('Quote has expired');
      (error as Error & { statusCode: number }).statusCode = 400;
      mockPost.mockRejectedValueOnce(error);

      const { result } = renderHook(() => useExecuteForeclosure(), { wrapper });

      result.current.mutate({ id: 'fc-quote-expired', idempotencyKey: 'key-1' });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toBe('Quote has expired');
    });

    it('handles 404 when quote not found', async () => {
      const error = new Error('Foreclosure quote not found');
      (error as Error & { statusCode: number }).statusCode = 404;
      mockPost.mockRejectedValueOnce(error);

      const { result } = renderHook(() => useExecuteForeclosure(), { wrapper });

      result.current.mutate({ id: 'invalid-quote', idempotencyKey: 'key-1' });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });

    it('handles 409 when already executed', async () => {
      const error = new Error('Foreclosure already executed');
      (error as Error & { statusCode: number }).statusCode = 409;
      mockPost.mockRejectedValueOnce(error);

      const { result } = renderHook(() => useExecuteForeclosure(), { wrapper });

      result.current.mutate({ id: 'fc-quote-done', idempotencyKey: 'key-1' });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toBe('Foreclosure already executed');
    });

    it('handles slow mutation', async () => {
      mockPost.mockImplementation(() => new Promise((resolve) => {
        setTimeout(() => resolve({ status: 'closed' }), 100);
      }));

      const { result } = renderHook(() => useExecuteForeclosure(), { wrapper });

      result.current.mutate({ id: 'fc-quote-1', idempotencyKey: 'key-1' });

      // Eventually succeeds even with slow response
      await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 2000 });
    });

    it('does not invalidate queries on error', async () => {
      mockPost.mockRejectedValueOnce(new Error('Server Error'));

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useExecuteForeclosure(), { wrapper });

      result.current.mutate({ id: 'fc-quote-1', idempotencyKey: 'key-1' });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(invalidateSpy).not.toHaveBeenCalled();
    });
  });
});
