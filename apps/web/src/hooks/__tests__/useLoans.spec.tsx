import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLoans, useLoan, useCreateLoan, useLoanAction } from '../useLoans';
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
 * useLoans Hook Tests
 *
 * Tests the useLoans hooks for:
 * - List queries with pagination and filters
 * - Detail query with schedules
 * - Create mutation
 * - Loan action mutations (submit, review, approve, reject, disburse)
 * - Query invalidation after mutations
 *
 * **Validates: Loan workflow hooks and state management**
 */

describe('useLoans Hook', () => {
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

  describe('useLoans (list)', () => {
    const mockLoansList = {
      data: [
        {
          id: 'loan-1',
          loan_number: 'LN-2024-001',
          customer_id: 'cust-1',
          customer: { full_name: 'John Doe' },
          principal_paise: 5000000,
          tenure_months: 12,
          status: 'active',
          dpd: 0,
          cached_outstanding_paise: 4500000,
          created_at: '2024-01-15T10:00:00.000Z',
        },
        {
          id: 'loan-2',
          loan_number: 'LN-2024-002',
          customer_id: 'cust-2',
          customer: { full_name: 'Jane Smith' },
          principal_paise: 10000000,
          tenure_months: 24,
          status: 'overdue',
          dpd: 15,
          overdue_bucket: 'bucket_1_30',
          cached_outstanding_paise: 9800000,
          created_at: '2024-01-10T10:00:00.000Z',
        },
      ],
      total: 50,
    };

    it('fetches loans list with default pagination', async () => {
      mockGet.mockResolvedValueOnce(mockLoansList);

      const { result } = renderHook(() => useLoans(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith('/loans?skip=0&take=20');
      expect(result.current.data).toEqual(mockLoansList);
    });

    it('fetches loans with specific page', async () => {
      mockGet.mockResolvedValueOnce({ data: [], total: 100 });

      const { result } = renderHook(() => useLoans({ page: 4 }), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Page 4 with pageSize 20: skip = (4-1) * 20 = 60
      expect(mockGet).toHaveBeenCalledWith('/loans?skip=60&take=20');
    });

    it('fetches loans with status filter', async () => {
      mockGet.mockResolvedValueOnce({ data: [], total: 0 });

      const { result } = renderHook(() => useLoans({ status: 'active' }), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('status=active'));
    });

    it('fetches loans with search filter', async () => {
      mockGet.mockResolvedValueOnce({ data: [], total: 0 });

      const { result } = renderHook(() => useLoans({ search: 'LN-2024' }), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('search=LN-2024'));
    });

    it('fetches loans with multiple filters', async () => {
      mockGet.mockResolvedValueOnce({ data: [], total: 0 });

      const { result } = renderHook(
        () => useLoans({ page: 2, status: 'overdue', search: 'john' }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const url = mockGet.mock.calls[0][0] as string;
      expect(url).toContain('skip=20');
      expect(url).toContain('status=overdue');
      expect(url).toContain('search=john');
    });

    it('returns loading state initially', () => {
      mockGet.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useLoans(), { wrapper });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.data).toBeUndefined();
    });

    it('returns error state on API failure', async () => {
      mockGet.mockRejectedValueOnce(new Error('Server Error'));

      const { result } = renderHook(() => useLoans(), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });

    const statusFilterTests = [
      { status: 'draft', description: 'draft loans' },
      { status: 'submitted', description: 'submitted loans' },
      { status: 'under_review', description: 'under review loans' },
      { status: 'approved', description: 'approved loans' },
      { status: 'rejected', description: 'rejected loans' },
      { status: 'disbursed', description: 'disbursed loans' },
      { status: 'active', description: 'active loans' },
      { status: 'overdue', description: 'overdue loans' },
      { status: 'closed', description: 'closed loans' },
    ];

    it.each(statusFilterTests)('filters by $description', async ({ status }) => {
      mockGet.mockResolvedValueOnce({ data: [], total: 0 });

      const { result } = renderHook(() => useLoans({ status }), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith(expect.stringContaining(`status=${status}`));
    });
  });

  describe('useLoan (detail)', () => {
    const mockLoanDetail = {
      id: 'loan-1',
      loan_number: 'LN-2024-001',
      customer_id: 'cust-1',
      principal_paise: 5000000,
      tenure_months: 12,
      status: 'active',
      dpd: 0,
      purpose: 'Business expansion',
      total_interest_paise: 600000,
      total_payable_paise: 5600000,
      processing_fee_paise: 50000,
      first_due_date: '2024-02-01',
      last_due_date: '2025-01-01',
      created_by: 'user-1',
      created_at: '2024-01-15T10:00:00.000Z',
      schedules: [
        {
          id: 'inst-1',
          installment_number: 1,
          due_date: '2024-02-01',
          principal_paise: 416666,
          interest_paise: 50000,
          total_paise: 466666,
          principal_paid_paise: 416666,
          interest_paid_paise: 50000,
          penalty_paid_paise: 0,
          status: 'paid',
        },
        {
          id: 'inst-2',
          installment_number: 2,
          due_date: '2024-03-01',
          principal_paise: 416667,
          interest_paise: 50000,
          total_paise: 466667,
          principal_paid_paise: 0,
          interest_paid_paise: 0,
          penalty_paid_paise: 0,
          status: 'pending',
        },
      ],
    };

    it('fetches loan detail by ID', async () => {
      mockGet.mockResolvedValueOnce(mockLoanDetail);

      const { result } = renderHook(() => useLoan('loan-1'), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith('/loans/loan-1');
      expect(result.current.data).toEqual(mockLoanDetail);
    });

    it('includes schedules in response', async () => {
      mockGet.mockResolvedValueOnce(mockLoanDetail);

      const { result } = renderHook(() => useLoan('loan-1'), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.schedules).toHaveLength(2);
      expect(result.current.data?.schedules[0].status).toBe('paid');
      expect(result.current.data?.schedules[1].status).toBe('pending');
    });

    it('does not fetch when ID is empty', () => {
      renderHook(() => useLoan(''), { wrapper });

      expect(mockGet).not.toHaveBeenCalled();
    });

    it('returns 404 error when loan not found', async () => {
      const notFoundError = new Error('Not Found');
      (notFoundError as Error & { statusCode: number }).statusCode = 404;
      mockGet.mockRejectedValueOnce(notFoundError);

      const { result } = renderHook(() => useLoan('invalid-id'), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe('useCreateLoan', () => {
    it('creates a new loan', async () => {
      const newLoan = { id: 'loan-new', loan_number: 'LN-2024-100' };
      mockPost.mockResolvedValueOnce(newLoan);

      const { result } = renderHook(() => useCreateLoan(), { wrapper });

      result.current.mutate({
        customer_id: 'cust-1',
        product_id: 'prod-1',
        principal_paise: 5000000,
        tenure_months: 12,
        purpose: 'Business',
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPost).toHaveBeenCalledWith('/loans', {
        customer_id: 'cust-1',
        product_id: 'prod-1',
        principal_paise: 5000000,
        tenure_months: 12,
        purpose: 'Business',
      });
    });

    it('invalidates loans query on success', async () => {
      mockPost.mockResolvedValueOnce({ id: 'loan-new' });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useCreateLoan(), { wrapper });

      result.current.mutate({ customer_id: 'cust-1' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['loans'] });
    });
  });

  describe('useLoanAction', () => {
    it('submits loan for review', async () => {
      mockPost.mockResolvedValueOnce({ status: 'submitted' });

      const { result } = renderHook(() => useLoanAction(), { wrapper });

      result.current.mutate({ id: 'loan-1', action: 'submit' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPost).toHaveBeenCalledWith('/loans/loan-1/submit', undefined);
    });

    it('starts review of loan', async () => {
      mockPost.mockResolvedValueOnce({ status: 'under_review' });

      const { result } = renderHook(() => useLoanAction(), { wrapper });

      result.current.mutate({ id: 'loan-1', action: 'review' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPost).toHaveBeenCalledWith('/loans/loan-1/review', undefined);
    });

    it('approves loan', async () => {
      mockPost.mockResolvedValueOnce({ status: 'approved' });

      const { result } = renderHook(() => useLoanAction(), { wrapper });

      result.current.mutate({ id: 'loan-1', action: 'approve' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPost).toHaveBeenCalledWith('/loans/loan-1/approve', undefined);
    });

    it('rejects loan with reason', async () => {
      mockPost.mockResolvedValueOnce({ status: 'rejected' });

      const { result } = renderHook(() => useLoanAction(), { wrapper });

      result.current.mutate({
        id: 'loan-1',
        action: 'reject',
        body: { reason: 'Insufficient documentation' },
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPost).toHaveBeenCalledWith('/loans/loan-1/reject', {
        reason: 'Insufficient documentation',
      });
    });

    it('disburses loan with payment details', async () => {
      mockPost.mockResolvedValueOnce({ status: 'disbursed' });

      const { result } = renderHook(() => useLoanAction(), { wrapper });

      result.current.mutate({
        id: 'loan-1',
        action: 'disburse',
        body: {
          idempotency_key: 'uuid-123',
          payment_mode: 'bank_transfer',
          reference: 'TXN-12345',
        },
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPost).toHaveBeenCalledWith('/loans/loan-1/disburse', {
        idempotency_key: 'uuid-123',
        payment_mode: 'bank_transfer',
        reference: 'TXN-12345',
      });
    });

    it('invalidates loans query after action', async () => {
      mockPost.mockResolvedValueOnce({ status: 'approved' });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useLoanAction(), { wrapper });

      result.current.mutate({ id: 'loan-1', action: 'approve' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['loans'] });
    });

    it('handles action error', async () => {
      mockPost.mockRejectedValueOnce(new Error('Unauthorized'));

      const { result } = renderHook(() => useLoanAction(), { wrapper });

      result.current.mutate({ id: 'loan-1', action: 'approve' });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });
});
