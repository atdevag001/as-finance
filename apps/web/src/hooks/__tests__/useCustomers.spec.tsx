import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCustomers, useCustomer, useCreateCustomer, useUpdateCustomer, useAddFamilyMember, useAddGuarantor } from '../useCustomers';
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
 * useCustomers Hook Tests
 *
 * Tests the useCustomers hooks for:
 * - List queries with pagination and filters
 * - Detail query by ID
 * - Create mutation
 * - Update mutation
 * - Add family member mutation
 * - Add guarantor mutation
 * - Query invalidation after mutations
 *
 * **Validates: Hook layer between UI and API**
 */

describe('useCustomers Hook', () => {
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

  describe('useCustomers (list)', () => {
    const mockCustomersList = {
      data: [
        {
          id: 'cust-1',
          full_name: 'John Doe',
          mobile: '9876543210',
          aadhaar_last_four: '1234',
          city: 'Mumbai',
          district: 'Mumbai',
          status: 'active',
          risk_level: 'low',
          created_at: '2024-01-15T10:00:00.000Z',
        },
        {
          id: 'cust-2',
          full_name: 'Jane Smith',
          mobile: '9876543211',
          aadhaar_last_four: '5678',
          city: 'Delhi',
          district: 'Delhi',
          status: 'active',
          risk_level: 'medium',
          created_at: '2024-01-14T10:00:00.000Z',
        },
      ],
      total: 25,
    };

    it('fetches customers list with default pagination', async () => {
      mockGet.mockResolvedValueOnce(mockCustomersList);

      const { result } = renderHook(() => useCustomers(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith('/customers?skip=0&take=20');
      expect(result.current.data).toEqual(mockCustomersList);
    });

    it('fetches customers list with specific page', async () => {
      mockGet.mockResolvedValueOnce({ data: [], total: 100 });

      const { result } = renderHook(() => useCustomers({ page: 3 }), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Page 3 with pageSize 20: skip = (3-1) * 20 = 40
      expect(mockGet).toHaveBeenCalledWith('/customers?skip=40&take=20');
    });

    it('fetches customers with search filter', async () => {
      mockGet.mockResolvedValueOnce({ data: [], total: 0 });

      const { result } = renderHook(() => useCustomers({ search: 'john' }), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('search=john'));
    });

    it('fetches customers with status filter', async () => {
      mockGet.mockResolvedValueOnce({ data: [], total: 0 });

      const { result } = renderHook(() => useCustomers({ status: 'active' }), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('status=active'));
    });

    it('fetches customers with multiple filters', async () => {
      mockGet.mockResolvedValueOnce({ data: [], total: 0 });

      const { result } = renderHook(
        () => useCustomers({ page: 2, search: 'smith', status: 'blacklisted' }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const url = mockGet.mock.calls[0][0] as string;
      expect(url).toContain('skip=20');
      expect(url).toContain('search=smith');
      expect(url).toContain('status=blacklisted');
    });

    it('returns loading state initially', () => {
      mockGet.mockImplementation(() => new Promise(() => {})); // Never resolves

      const { result } = renderHook(() => useCustomers(), { wrapper });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.data).toBeUndefined();
    });

    it('returns error state on API failure', async () => {
      mockGet.mockRejectedValueOnce(new Error('API Error'));

      const { result } = renderHook(() => useCustomers(), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toBeDefined();
    });

    it('returns empty data for no results', async () => {
      mockGet.mockResolvedValueOnce({ data: [], total: 0 });

      const { result } = renderHook(() => useCustomers(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.data).toEqual([]);
      expect(result.current.data?.total).toBe(0);
    });
  });

  describe('useCustomer (detail)', () => {
    const mockCustomerDetail = {
      id: 'cust-1',
      full_name: 'John Doe',
      mobile: '9876543210',
      aadhaar_last_four: '1234',
      city: 'Mumbai',
      district: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
      status: 'active',
      risk_level: 'low',
      gender: 'male',
      address_line1: '123 Main St',
      created_at: '2024-01-15T10:00:00.000Z',
      family_members: [],
      guarantors: [],
    };

    it('fetches customer detail by ID', async () => {
      mockGet.mockResolvedValueOnce(mockCustomerDetail);

      const { result } = renderHook(() => useCustomer('cust-1'), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith('/customers/cust-1');
      expect(result.current.data).toEqual(mockCustomerDetail);
    });

    it('does not fetch when ID is empty', () => {
      renderHook(() => useCustomer(''), { wrapper });

      expect(mockGet).not.toHaveBeenCalled();
    });

    it('returns 404 error when customer not found', async () => {
      const notFoundError = new Error('Not Found');
      (notFoundError as Error & { statusCode: number }).statusCode = 404;
      mockGet.mockRejectedValueOnce(notFoundError);

      const { result } = renderHook(() => useCustomer('invalid-id'), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toBeDefined();
    });

    it('includes family members and guarantors in response', async () => {
      const detailWithRelations = {
        ...mockCustomerDetail,
        family_members: [
          { id: 'fm-1', name: 'Jane Doe', relationship: 'spouse', contact_number: '9876543212' },
        ],
        guarantors: [
          { id: 'g-1', name: 'Bob Smith', relationship: 'friend', mobile: '9876543213' },
        ],
      };
      mockGet.mockResolvedValueOnce(detailWithRelations);

      const { result } = renderHook(() => useCustomer('cust-1'), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.family_members).toHaveLength(1);
      expect(result.current.data?.guarantors).toHaveLength(1);
    });
  });

  describe('useCreateCustomer', () => {
    it('creates a new customer', async () => {
      const newCustomer = { id: 'cust-new', full_name: 'New Customer' };
      mockPost.mockResolvedValueOnce(newCustomer);

      const { result } = renderHook(() => useCreateCustomer(), { wrapper });

      result.current.mutate({
        full_name: 'New Customer',
        mobile: '9876543210',
        aadhaar: '123456789012',
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPost).toHaveBeenCalledWith('/customers', {
        full_name: 'New Customer',
        mobile: '9876543210',
        aadhaar: '123456789012',
      });
    });

    it('invalidates customers query on success', async () => {
      mockPost.mockResolvedValueOnce({ id: 'cust-new' });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useCreateCustomer(), { wrapper });

      result.current.mutate({ full_name: 'Test' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['customers'] });
    });

    it('handles validation error', async () => {
      const validationError = new Error('Validation failed');
      mockPost.mockRejectedValueOnce(validationError);

      const { result } = renderHook(() => useCreateCustomer(), { wrapper });

      result.current.mutate({ full_name: '' });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toBeDefined();
    });
  });

  describe('useUpdateCustomer', () => {
    it('updates an existing customer', async () => {
      mockPatch.mockResolvedValueOnce({ id: 'cust-1', full_name: 'Updated Name' });

      const { result } = renderHook(() => useUpdateCustomer(), { wrapper });

      result.current.mutate({ id: 'cust-1', data: { full_name: 'Updated Name' } });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPatch).toHaveBeenCalledWith('/customers/cust-1', { full_name: 'Updated Name' });
    });

    it('invalidates both customer detail and list queries', async () => {
      mockPatch.mockResolvedValueOnce({ id: 'cust-1' });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useUpdateCustomer(), { wrapper });

      result.current.mutate({ id: 'cust-1', data: { city: 'Delhi' } });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['customers', 'cust-1'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['customers'] });
    });
  });

  describe('useAddFamilyMember', () => {
    it('adds a family member to customer', async () => {
      mockPost.mockResolvedValueOnce({ id: 'fm-new' });

      const { result } = renderHook(() => useAddFamilyMember(), { wrapper });

      result.current.mutate({
        customerId: 'cust-1',
        data: { name: 'Jane Doe', relationship: 'spouse' },
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPost).toHaveBeenCalledWith('/customers/cust-1/family-members', {
        name: 'Jane Doe',
        relationship: 'spouse',
      });
    });

    it('invalidates customer detail query on success', async () => {
      mockPost.mockResolvedValueOnce({ id: 'fm-new' });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useAddFamilyMember(), { wrapper });

      result.current.mutate({
        customerId: 'cust-1',
        data: { name: 'Test', relationship: 'child' },
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['customers', 'cust-1'] });
    });
  });

  describe('useAddGuarantor', () => {
    it('adds a guarantor to customer', async () => {
      mockPost.mockResolvedValueOnce({ id: 'g-new' });

      const { result } = renderHook(() => useAddGuarantor(), { wrapper });

      result.current.mutate({
        customerId: 'cust-1',
        data: { name: 'Bob Smith', relationship: 'friend', mobile: '9876543213' },
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPost).toHaveBeenCalledWith('/customers/cust-1/guarantors', {
        name: 'Bob Smith',
        relationship: 'friend',
        mobile: '9876543213',
      });
    });

    it('invalidates customer detail query on success', async () => {
      mockPost.mockResolvedValueOnce({ id: 'g-new' });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useAddGuarantor(), { wrapper });

      result.current.mutate({
        customerId: 'cust-1',
        data: { name: 'Test', relationship: 'colleague', mobile: '9876543214' },
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['customers', 'cust-1'] });
    });
  });
});
