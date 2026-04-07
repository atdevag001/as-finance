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
          version: 1,
          interest_type: 'flat',
          annual_rate: 18,
          min_principal_paise: 1000000,
          max_principal_paise: 50000000,
          min_tenure_months: 3,
          max_tenure_months: 24,
          frequency: 'monthly',
          is_active: true,
          processing_fee_percent: 2,
          penalty_rate_percent: 0.5,
          allocation_order: 'penalty,interest,principal',
          created_at: '2024-01-01T10:00:00.000Z',
        },
        {
          id: 'prod-2',
          name: 'Business Loan',
          version: 1,
          interest_type: 'reducing_balance',
          annual_rate: 14,
          min_principal_paise: 5000000,
          max_principal_paise: 200000000,
          min_tenure_months: 6,
          max_tenure_months: 60,
          frequency: 'monthly',
          is_active: true,
          processing_fee_percent: 1.5,
          penalty_rate_percent: 1,
          created_at: '2024-01-05T10:00:00.000Z',
        },
        {
          id: 'prod-3',
          name: 'Daily Collection Loan',
          version: 2,
          interest_type: 'flat',
          annual_rate: 24,
          min_principal_paise: 500000,
          max_principal_paise: 10000000,
          min_tenure_months: 1,
          max_tenure_months: 6,
          frequency: 'daily',
          is_active: false,
          created_at: '2024-01-10T10:00:00.000Z',
        },
      ],
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

      const interestTypes = new Set(result.current.data?.data.map(p => p.interest_type));
      expect(interestTypes).toContain('flat');
      expect(interestTypes).toContain('reducing_balance');
    });

    it('returns products with different frequencies', async () => {
      mockGet.mockResolvedValueOnce(mockProductsList);

      const { result } = renderHook(() => useLoanProducts(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const frequencies = new Set(result.current.data?.data.map(p => p.frequency));
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
        expect(product.version).toBeGreaterThanOrEqual(1);
        expect(['flat', 'reducing_balance']).toContain(product.interest_type);
        expect(product.annual_rate).toBeGreaterThan(0);
        expect(product.min_principal_paise).toBeLessThan(product.max_principal_paise);
        expect(product.min_tenure_months).toBeLessThanOrEqual(product.max_tenure_months);
        expect(['daily', 'weekly', 'monthly']).toContain(product.frequency);
        expect(typeof product.is_active).toBe('boolean');
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
        version: 1,
        interest_type: 'flat',
        annual_rate: 18,
        min_principal_paise: 1000000,
        max_principal_paise: 50000000,
        min_tenure_months: 3,
        max_tenure_months: 24,
        frequency: 'monthly',
        is_active: true,
      },
      {
        id: 'prod-2',
        name: 'Business Loan',
        version: 1,
        interest_type: 'reducing_balance',
        annual_rate: 14,
        min_principal_paise: 5000000,
        max_principal_paise: 200000000,
        min_tenure_months: 6,
        max_tenure_months: 60,
        frequency: 'monthly',
        is_active: true,
      },
    ];

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
        interest_type: 'flat',
        annual_rate: 20,
        min_principal_paise: 1000000,
        max_principal_paise: 20000000,
        min_tenure_months: 3,
        max_tenure_months: 12,
        frequency: 'monthly',
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPost).toHaveBeenCalledWith('/loan-products', {
        name: 'New Product',
        interest_type: 'flat',
        annual_rate: 20,
        min_principal_paise: 1000000,
        max_principal_paise: 20000000,
        min_tenure_months: 3,
        max_tenure_months: 12,
        frequency: 'monthly',
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
        data: { name: 'Updated Product', annual_rate: 16 },
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPatch).toHaveBeenCalledWith('/loan-products/prod-1', {
        name: 'Updated Product',
        annual_rate: 16,
      });
    });

    it('invalidates loan-products query on success', async () => {
      mockPatch.mockResolvedValueOnce({ id: 'prod-1' });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useUpdateLoanProduct(), { wrapper });

      result.current.mutate({ id: 'prod-1', data: { name: 'Test' } });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['loan-products'] });
    });

    it('handles 404 error when product not found', async () => {
      const notFoundError = new Error('Loan product not found');
      (notFoundError as Error & { statusCode: number }).statusCode = 404;
      mockPatch.mockRejectedValueOnce(notFoundError);

      const { result } = renderHook(() => useUpdateLoanProduct(), { wrapper });

      result.current.mutate({ id: 'invalid-prod', data: { name: 'Test' } });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });

    it('handles slow mutation', async () => {
      mockPatch.mockImplementation(() => new Promise((resolve) => {
        setTimeout(() => resolve({ id: 'prod-1' }), 100);
      }));

      const { result } = renderHook(() => useUpdateLoanProduct(), { wrapper });

      result.current.mutate({ id: 'prod-1', data: { name: 'Test' } });

      

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
