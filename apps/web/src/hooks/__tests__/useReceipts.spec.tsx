import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useReceipts, useReceiptDetail } from '../useReceipts';
import type { ReactNode } from 'react';

// Mock the API client
const mockGet = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
  },
}));

/**
 * useReceipts Hook Tests
 *
 * Tests the useReceipts hooks for:
 * - List receipts with pagination
 * - Filter by loanId
 * - Fetch receipt detail by ID
 * - Receipt fields validation
 * - Allocation breakdown
 *
 * **Validates: Receipt query and data retrieval**
 */

describe('useReceipts Hook', () => {
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

  describe('useReceipts (list)', () => {
    const mockReceiptsList = {
      data: [
        {
          id: 'rcpt-1',
          receipt_number: 'RCP-2024-001',
          collection_id: 'col-1',
          customer_name: 'John Doe',
          loan_number: 'LN-2024-001',
          amount_paise: 466666,
          principal_paise: 350000,
          interest_paise: 100000,
          penalty_paise: 16666,
          outstanding_after_paise: 4533334,
          officer_name: 'Field Officer 1',
          payment_mode: 'cash',
          payment_date: '2024-01-15',
          status: 'posted',
          created_at: '2024-01-15T10:00:00.000Z',
        },
        {
          id: 'rcpt-2',
          receipt_number: 'RCP-2024-002',
          collection_id: 'col-2',
          customer_name: 'Jane Smith',
          loan_number: 'LN-2024-002',
          amount_paise: 500000,
          principal_paise: 400000,
          interest_paise: 100000,
          penalty_paise: 0,
          outstanding_after_paise: 9500000,
          officer_name: 'Field Officer 2',
          payment_mode: 'upi',
          payment_date: '2024-01-16',
          status: 'posted',
          created_at: '2024-01-16T10:00:00.000Z',
        },
      ],
      total: 100,
    };

    it('fetches receipts list with default pagination', async () => {
      mockGet.mockResolvedValueOnce(mockReceiptsList);

      const { result } = renderHook(() => useReceipts(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith('/receipts?skip=0&take=20');
      expect(result.current.data).toEqual(mockReceiptsList);
    });

    it('fetches receipts with specific page', async () => {
      mockGet.mockResolvedValueOnce({ data: [], total: 100 });

      const { result } = renderHook(() => useReceipts({ page: 3 }), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith('/receipts?skip=40&take=20');
    });

    it('filters by loanId', async () => {
      mockGet.mockResolvedValueOnce({ data: [], total: 0 });

      const { result } = renderHook(() => useReceipts({ loanId: 'loan-1' }), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('loanId=loan-1'));
    });

    it('combines loanId and page filters', async () => {
      mockGet.mockResolvedValueOnce({ data: [], total: 50 });

      const { result } = renderHook(
        () => useReceipts({ loanId: 'loan-1', page: 2 }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const url = mockGet.mock.calls[0][0] as string;
      expect(url).toContain('loanId=loan-1');
      expect(url).toContain('skip=20');
    });

    it('returns receipt fields', async () => {
      mockGet.mockResolvedValueOnce(mockReceiptsList);

      const { result } = renderHook(() => useReceipts(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      result.current.data?.data.forEach(receipt => {
        expect(receipt.id).toBeDefined();
        expect(receipt.receipt_number).toBeDefined();
        expect(receipt.collection_id).toBeDefined();
        expect(receipt.customer_name).toBeDefined();
        expect(receipt.loan_number).toBeDefined();
        expect(receipt.amount_paise).toBeDefined();
        expect(receipt.principal_paise).toBeDefined();
        expect(receipt.interest_paise).toBeDefined();
        expect(receipt.penalty_paise).toBeDefined();
        expect(receipt.outstanding_after_paise).toBeDefined();
        expect(receipt.officer_name).toBeDefined();
        expect(receipt.payment_mode).toBeDefined();
        expect(receipt.payment_date).toBeDefined();
        expect(receipt.status).toBeDefined();
        expect(receipt.created_at).toBeDefined();
      });
    });

    it('allocation breakdown adds up to total', async () => {
      mockGet.mockResolvedValueOnce(mockReceiptsList);

      const { result } = renderHook(() => useReceipts(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      result.current.data?.data.forEach(receipt => {
        const allocationTotal = receipt.principal_paise + receipt.interest_paise + receipt.penalty_paise;
        expect(allocationTotal).toBe(receipt.amount_paise);
      });
    });

    it('amounts are in paise (integers)', async () => {
      mockGet.mockResolvedValueOnce(mockReceiptsList);

      const { result } = renderHook(() => useReceipts(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      result.current.data?.data.forEach(receipt => {
        expect(Number.isInteger(receipt.amount_paise)).toBe(true);
        expect(Number.isInteger(receipt.principal_paise)).toBe(true);
        expect(Number.isInteger(receipt.interest_paise)).toBe(true);
        expect(Number.isInteger(receipt.penalty_paise)).toBe(true);
        expect(Number.isInteger(receipt.outstanding_after_paise)).toBe(true);
      });
    });

    it('returns loading state initially', () => {
      mockGet.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useReceipts(), { wrapper });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.data).toBeUndefined();
    });

    it('handles error state', async () => {
      mockGet.mockRejectedValueOnce(new Error('Server Error'));

      const { result } = renderHook(() => useReceipts(), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });

    it('returns empty data when no receipts', async () => {
      mockGet.mockResolvedValueOnce({ data: [], total: 0 });

      const { result } = renderHook(() => useReceipts(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.data).toEqual([]);
      expect(result.current.data?.total).toBe(0);
    });

    const paymentModeTests = [
      { mode: 'cash' },
      { mode: 'upi' },
      { mode: 'bank_transfer' },
      { mode: 'cheque' },
    ];

    it.each(paymentModeTests)('includes receipts with $mode payment mode', async ({ mode }) => {
      const receiptsWithMode = {
        data: [{ ...mockReceiptsList.data[0], payment_mode: mode }],
        total: 1,
      };
      mockGet.mockResolvedValueOnce(receiptsWithMode);

      const { result } = renderHook(() => useReceipts(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.data[0].payment_mode).toBe(mode);
    });
  });

  describe('useReceiptDetail', () => {
    const mockReceiptDetail = {
      id: 'rcpt-1',
      receipt_number: 'RCP-2024-001',
      collection_id: 'col-1',
      customer_name: 'John Doe',
      loan_number: 'LN-2024-001',
      amount_paise: 466666,
      principal_paise: 350000,
      interest_paise: 100000,
      penalty_paise: 16666,
      outstanding_after_paise: 4533334,
      officer_name: 'Field Officer 1',
      payment_mode: 'cash',
      payment_date: '2024-01-15',
      status: 'posted',
      created_at: '2024-01-15T10:00:00.000Z',
    };

    it('fetches receipt detail by ID', async () => {
      mockGet.mockResolvedValueOnce(mockReceiptDetail);

      const { result } = renderHook(() => useReceiptDetail('rcpt-1'), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith('/receipts/rcpt-1');
      expect(result.current.data).toEqual(mockReceiptDetail);
    });

    it('does not fetch when ID is empty', () => {
      renderHook(() => useReceiptDetail(''), { wrapper });

      expect(mockGet).not.toHaveBeenCalled();
    });

    it('returns receipt fields', async () => {
      mockGet.mockResolvedValueOnce(mockReceiptDetail);

      const { result } = renderHook(() => useReceiptDetail('rcpt-1'), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const receipt = result.current.data!;
      expect(receipt.receipt_number).toBe('RCP-2024-001');
      expect(receipt.customer_name).toBe('John Doe');
      expect(receipt.loan_number).toBe('LN-2024-001');
      expect(receipt.amount_paise).toBe(466666);
    });

    it('returns allocation breakdown', async () => {
      mockGet.mockResolvedValueOnce(mockReceiptDetail);

      const { result } = renderHook(() => useReceiptDetail('rcpt-1'), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const receipt = result.current.data!;
      expect(receipt.principal_paise).toBe(350000);
      expect(receipt.interest_paise).toBe(100000);
      expect(receipt.penalty_paise).toBe(16666);
    });

    it('returns 404 error when receipt not found', async () => {
      const notFoundError = new Error('Receipt not found');
      (notFoundError as Error & { statusCode: number }).statusCode = 404;
      mockGet.mockRejectedValueOnce(notFoundError);

      const { result } = renderHook(() => useReceiptDetail('invalid-rcpt'), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toBe('Receipt not found');
    });

    it('returns loading state initially', () => {
      mockGet.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useReceiptDetail('rcpt-1'), { wrapper });

      expect(result.current.isLoading).toBe(true);
    });

    it('handles reversed receipt status', async () => {
      const reversedReceipt = { ...mockReceiptDetail, status: 'reversed' };
      mockGet.mockResolvedValueOnce(reversedReceipt);

      const { result } = renderHook(() => useReceiptDetail('rcpt-reversed'), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.status).toBe('reversed');
    });

    it('outstanding_after_paise is non-negative', async () => {
      mockGet.mockResolvedValueOnce(mockReceiptDetail);

      const { result } = renderHook(() => useReceiptDetail('rcpt-1'), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.outstanding_after_paise).toBeGreaterThanOrEqual(0);
    });
  });
});
