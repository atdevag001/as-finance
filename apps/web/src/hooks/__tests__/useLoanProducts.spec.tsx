import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useLoanProducts,
  useLoanProductsList,
  useCreateLoanProduct,
  useUpdateLoanProduct,
  useDeactivateLoanProduct,
  type LoanProduct,
} from '../useLoanProducts';
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
 * useLoanProducts Hook Tests
 *
 * Tests the useLoanProducts hooks for:
 * - List products with pagination
 * - Products list (all active)
 * - Create loan product
 * - Update loan product
 * - Deactivate loan product
 * - Query invalidation
 *
 * **Validates: Loan product management workflow**
 */

describe('useLoanProducts Hook', () => {
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

  describe('useLoanProducts (paginated)', () => {
    const mockProductsList = {
      data: [
        {
          id: 'prod-1',
          name: 'Standard Personal Loan',
          is_active: true,
          current_version_id: 'ver-1',
          created_by: 'user-1',
          created_at: '2024-01-01T10:00:00.000Z',
          updated_at: '2024-01-01T10:00:00.000Z',
          current_version: {
            id: 'ver-1',
            product_id: 'prod-1',
            version_number: 1,
            interest_type: 'flat' as const,
            annual_rate_bps: 1800,
            min_principal_paise: 1000000,
            max_principal_paise: 50000000,
            min_tenure_months: 3,
            max_tenure_months: 24,
            repayment_frequency: 'monthly' as const,
            processing_fee_type: 'percentage',
            processing_fee_value: 200,
            penalty_grace_days: 0,
            penalty_type: 'percentage_of_overdue',
            penalty_value: 50,
            penalty_frequency: 'monthly',
            max_concurrent_loans: 1,
            allocation_order: ['penalty', 'interest', 'principal'],
            is_active: true,
            created_at: '2024-01-01T10:00:00.000Z',
          },
        },
        {
          id: 'prod-2',
          name: 'Business Loan',
          is_active: true,
          current_version_id: 'ver-2',
          created_by: 'user-1',
          created_at: '2024-01-05T10:00:00.000Z',
          updated_at: '2024-01-05T10:00:00.000Z',
          current_version: {
            id: 'ver-2',
            product_id: 'prod-2',
            version_number: 1,
            interest_type: 'reducing_balance' as const,
            annual_rate_bps: 1400,
            min_principal_paise: 5000000,
            max_principal_paise: 200000000,
            min_tenure_months: 6,
            max_tenure_months: 60,
            repayment_frequency: 'monthly' as const,
            processing_fee_type: 'percentage',
            processing_fee_value: 150,
            penalty_grace_days: 0,
            penalty_type: 'percentage_of_overdue',
            penalty_value: 100,
            penalty_frequency: 'monthly',
            max_concurrent_loans: 1,
            allocation_order: ['penalty', 'interest', 'principal'],
            is_active: true,
            created_at: '2024-01-05T10:00:00.000Z',
          },
        },
        {
          id: 'prod-3',
          name: 'Daily Collection Loan',
          is_active: false,
          current_version_id: 'ver-3',
          created_by: 'user-1',
          created_at: '2024-01-10T10:00:00.000Z',
          updated_at: '2024-01-10T10:00:00.000Z',
          current_version: {
            id: 'ver-3',
            product_id: 'prod-3',
            version_number: 2,
            interest_type: 'flat' as const,
            annual_rate_bps: 2400,
            min_principal_paise: 500000,
            max_principal_paise: 10000000,
            min_tenure_months: 1,
            max_tenure_months: 6,
            repayment_frequency: 'daily' as const,
            processing_fee_type: null,
            processing_fee_value: null,
            penalty_grace_days: 0,
            penalty_type: null,
            penalty_value: null,
            penalty_frequency: null,
            max_concurrent_loans: 1,
            allocation_order: ['penalty', 'interest', 'principal'],
            is_active: true,
            created_at: '2024-01-10T10:00:00.000Z',
          },
        },
      ] as LoanProduct[],
      total: 10,
    };

    it('fetches loan products with default pagination', async () => {
      mockGet.mockResolvedValueOnce(mockProductsList);

      const { result } = renderHook(() => useLoanProducts(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith('/loan-products?skip=0&take=20&includeInactive=true');
      expect(result.current.data).toEqual(mockProductsList);
    });

    it('fetches products with specific page', async () => {
      mockGet.mockResolvedValueOnce({ data: [], total: 50 });

      const { result } = renderHook(() => useLoanProducts({ page: 3 }), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('skip=40'));
    });

    it('includes inactive products by default', async () => {
      mockGet.mockResolvedValueOnce(mockProductsList);

      const { result } = renderHook(() => useLoanProducts(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('includeInactive=true'));
    });

    it('returns products with different interest types', async () => {
      mockGet.mockResolvedValueOnce(mockProductsList);

      const { result } = renderHook(() => useLoanProducts(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const interestTypes = new Set(
        result.current.data?.data.map(p => p.current_version?.interest_type).filter(Boolean)
      );
      expect(interestTypes).toContain('flat');
      expect(interestTypes).toContain('reducing_balance');
    });

    it('returns products with different frequencies', async () => {
      mockGet.mockResolvedValueOnce(mockProductsList);

      const { result } = renderHook(() => useLoanProducts(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const frequencies = new Set(
        result.current.data?.data.map(p => p.current_version?.repayment_frequency).filter(Boolean)
      );
      expect(frequencies).toContain('monthly');
      expect(frequencies).toContain('daily');
    });

    it('product fields are valid', async () => {
      mockGet.mockResolvedValueOnce(mockProductsList);

      const { result } = renderHook(() => useLoanProducts(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      result.current.data?.data.forEach(product => {
        expect(product.id).toBeDefined();
        expect(product.name).toBeDefined();
        expect(typeof product.is_active).toBe('boolean');

        const version = product.current_version;
        if (version) {
          expect(version.version_number).toBeGreaterThanOrEqual(1);
          expect(['flat', 'reducing_balance']).toContain(version.interest_type);
          expect(version.annual_rate_bps).toBeGreaterThan(0);
          expect(version.min_principal_paise).toBeLessThan(version.max_principal_paise);
          expect(version.min_tenure_months).toBeLessThanOrEqual(version.max_tenure_months);
          expect(['daily', 'weekly', 'monthly']).toContain(version.repayment_frequency);
        }
      });
    });

    it('returns loading state initially', () => {
      mockGet.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useLoanProducts(), { wrapper });

      expect(result.current.isLoading).toBe(true);
    });

    it('handles error state', async () => {
      mockGet.mockRejectedValueOnce(new Error('Server Error'));

      const { result } = renderHook(() => useLoanProducts(), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe('useLoanProductsList', () => {
    const mockProductsArray = [
      {
        id: 'prod-1',
        name: 'Standard Personal Loan',
        is_active: true,
        current_version_id: 'ver-1',
        created_by: 'user-1',
        created_at: '2024-01-01T10:00:00.000Z',
        updated_at: '2024-01-01T10:00:00.000Z',
        current_version: {
          id: 'ver-1',
          product_id: 'prod-1',
          version_number: 1,
          interest_type: 'flat' as const,
          annual_rate_bps: 1800,
          min_principal_paise: 1000000,
          max_principal_paise: 50000000,
          min_tenure_months: 3,
          max_tenure_months: 24,
          repayment_frequency: 'monthly' as const,
          processing_fee_type: null,
          processing_fee_value: null,
          penalty_grace_days: 0,
          penalty_type: null,
          penalty_value: null,
          penalty_frequency: null,
          max_concurrent_loans: 1,
          allocation_order: ['penalty', 'interest', 'principal'],
          is_active: true,
          created_at: '2024-01-01T10:00:00.000Z',
        },
      },
      {
        id: 'prod-2',
        name: 'Business Loan',
        is_active: true,
        current_version_id: 'ver-2',
        created_by: 'user-1',
        created_at: '2024-01-05T10:00:00.000Z',
        updated_at: '2024-01-05T10:00:00.000Z',
        current_version: {
          id: 'ver-2',
          product_id: 'prod-2',
          version_number: 1,
          interest_type: 'reducing_balance' as const,
          annual_rate_bps: 1400,
          min_principal_paise: 5000000,
          max_principal_paise: 200000000,
          min_tenure_months: 6,
          max_tenure_months: 60,
          repayment_frequency: 'monthly' as const,
          processing_fee_type: null,
          processing_fee_value: null,
          penalty_grace_days: 0,
          penalty_type: null,
          penalty_value: null,
          penalty_frequency: null,
          max_concurrent_loans: 1,
          allocation_order: ['penalty', 'interest', 'principal'],
          is_active: true,
          created_at: '2024-01-05T10:00:00.000Z',
        },
      },
    ] as LoanProduct[];

    it('fetches all loan products as array', async () => {
      mockGet.mockResolvedValueOnce(mockProductsArray);

      const { result } = renderHook(() => useLoanProductsList(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith('/loan-products');
      expect(result.current.data).toEqual(mockProductsArray);
    });

    it('returns array directly (not paginated)', async () => {
      mockGet.mockResolvedValueOnce(mockProductsArray);

      const { result } = renderHook(() => useLoanProductsList(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(Array.isArray(result.current.data)).toBe(true);
    });

    it('returns loading state initially', () => {
      mockGet.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useLoanProductsList(), { wrapper });

      expect(result.current.isLoading).toBe(true);
    });
  });

  describe('useCreateLoanProduct', () => {
    it('creates a new loan product', async () => {
      const newProduct = { id: 'prod-new', name: 'New Product' };
      mockPost.mockResolvedValueOnce(newProduct);

      const { result } = renderHook(() => useCreateLoanProduct(), { wrapper });

      result.current.mutate({
        name: 'New Product',
        interestType: 'flat',
        annualRateBps: 2000,
        minPrincipalPaise: 1000000,
        maxPrincipalPaise: 20000000,
        minTenureMonths: 3,
        maxTenureMonths: 12,
        repaymentFrequency: 'monthly',
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPost).toHaveBeenCalledWith('/loan-products', {
        name: 'New Product',
        interestType: 'flat',
        annualRateBps: 2000,
        minPrincipalPaise: 1000000,
        maxPrincipalPaise: 20000000,
        minTenureMonths: 3,
        maxTenureMonths: 12,
        repaymentFrequency: 'monthly',
      });
    });

    it('invalidates loan-products query on success', async () => {
      mockPost.mockResolvedValueOnce({ id: 'prod-new' });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useCreateLoanProduct(), { wrapper });

      result.current.mutate({ name: 'Test' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['loan-products'] });
    });

    it('handles mutation error', async () => {
      mockPost.mockRejectedValueOnce(new Error('Product name already exists'));

      const { result } = renderHook(() => useCreateLoanProduct(), { wrapper });

      result.current.mutate({ name: 'Existing Product' });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });

    it('handles slow mutation', async () => {
      mockPost.mockImplementation(() => new Promise((resolve) => {
        setTimeout(() => resolve({ id: 'prod-new' }), 100);
      }));

      const { result } = renderHook(() => useCreateLoanProduct(), { wrapper });

      result.current.mutate({ name: 'Test' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });
  });

  describe('useUpdateLoanProduct', () => {
    it('updates a loan product', async () => {
      mockPatch.mockResolvedValueOnce({ id: 'prod-1', name: 'Updated Product' });

      const { result } = renderHook(() => useUpdateLoanProduct(), { wrapper });

      result.current.mutate({
        id: 'prod-1',
        data: { annualRateBps: 1600 },
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPatch).toHaveBeenCalledWith('/loan-products/prod-1', {
        annualRateBps: 1600,
      });
    });

    it('invalidates loan-products query on success', async () => {
      mockPatch.mockResolvedValueOnce({ id: 'prod-1' });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useUpdateLoanProduct(), { wrapper });

      result.current.mutate({ id: 'prod-1', data: { annualRateBps: 1600 } });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['loan-products'] });
    });

    it('handles 404 error when product not found', async () => {
      const notFoundError = new Error('Loan product not found');
      (notFoundError as Error & { statusCode: number }).statusCode = 404;
      mockPatch.mockRejectedValueOnce(notFoundError);

      const { result } = renderHook(() => useUpdateLoanProduct(), { wrapper });

      result.current.mutate({ id: 'invalid-prod', data: { annualRateBps: 1600 } });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });

    it('handles slow mutation', async () => {
      mockPatch.mockImplementation(() => new Promise((resolve) => {
        setTimeout(() => resolve({ id: 'prod-1' }), 100);
      }));

      const { result } = renderHook(() => useUpdateLoanProduct(), { wrapper });

      result.current.mutate({ id: 'prod-1', data: { annualRateBps: 1600 } });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });
  });

  describe('useDeactivateLoanProduct', () => {
    it('deactivates a loan product', async () => {
      mockPost.mockResolvedValueOnce({ id: 'prod-1', is_active: false });

      const { result } = renderHook(() => useDeactivateLoanProduct(), { wrapper });

      result.current.mutate('prod-1');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPost).toHaveBeenCalledWith('/loan-products/prod-1/deactivate');
    });

    it('invalidates loan-products query on success', async () => {
      mockPost.mockResolvedValueOnce({ id: 'prod-1', is_active: false });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useDeactivateLoanProduct(), { wrapper });

      result.current.mutate('prod-1');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['loan-products'] });
    });

    it('handles 404 error when product not found', async () => {
      const notFoundError = new Error('Loan product not found');
      (notFoundError as Error & { statusCode: number }).statusCode = 404;
      mockPost.mockRejectedValueOnce(notFoundError);

      const { result } = renderHook(() => useDeactivateLoanProduct(), { wrapper });

      result.current.mutate('invalid-prod');

      await waitFor(() => expect(result.current.isError).toBe(true));
    });

    it('handles 409 error when product has active loans', async () => {
      const conflictError = new Error('Cannot deactivate: product has active loans');
      (conflictError as Error & { statusCode: number }).statusCode = 409;
      mockPost.mockRejectedValueOnce(conflictError);

      const { result } = renderHook(() => useDeactivateLoanProduct(), { wrapper });

      result.current.mutate('prod-with-loans');

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toBe('Cannot deactivate: product has active loans');
    });

    it('handles slow mutation', async () => {
      mockPost.mockImplementation(() => new Promise((resolve) => {
        setTimeout(() => resolve({ id: 'prod-1', is_active: false }), 100);
      }));

      const { result } = renderHook(() => useDeactivateLoanProduct(), { wrapper });

      result.current.mutate('prod-1');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });

    it('does not invalidate queries on error', async () => {
      mockPost.mockRejectedValueOnce(new Error('Server Error'));

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useDeactivateLoanProduct(), { wrapper });

      result.current.mutate('prod-1');

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(invalidateSpy).not.toHaveBeenCalled();
    });
  });
});
