import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDashboard } from '../useDashboard';
import type { ReactNode } from 'react';

// Mock the API client
const mockGet = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
  },
}));

/**
 * useDashboard Hook Tests
 *
 * Tests the useDashboard hook for:
 * - Fetch KPIs
 * - All KPI fields present
 * - Money fields in paise
 * - Count fields are non-negative
 * - Loading and error states
 *
 * **Validates: Dashboard KPI data retrieval**
 */

describe('useDashboard Hook', () => {
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

  describe('useDashboard', () => {
    const mockDashboardKPIs = {
      totalCustomers: 1250,
      activeLoans: 450,
      overdueLoans: 35,
      totalOutstandingPaise: 2250000000,
      todayCollectionsPaise: 15500000,
      todayDisbursementsPaise: 25000000,
      cashInHandPaise: 5000000,
      pendingApprovals: 12,
    };

    it('fetches dashboard KPIs', async () => {
      mockGet.mockResolvedValueOnce(mockDashboardKPIs);

      const { result } = renderHook(() => useDashboard(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith('/dashboard');
      expect(result.current.data).toEqual(mockDashboardKPIs);
    });

    it('returns all 8 KPI fields', async () => {
      mockGet.mockResolvedValueOnce(mockDashboardKPIs);

      const { result } = renderHook(() => useDashboard(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const kpis = result.current.data!;
      expect(kpis.totalCustomers).toBeDefined();
      expect(kpis.activeLoans).toBeDefined();
      expect(kpis.overdueLoans).toBeDefined();
      expect(kpis.totalOutstandingPaise).toBeDefined();
      expect(kpis.todayCollectionsPaise).toBeDefined();
      expect(kpis.todayDisbursementsPaise).toBeDefined();
      expect(kpis.cashInHandPaise).toBeDefined();
      expect(kpis.pendingApprovals).toBeDefined();
    });

    it('money fields are in paise (integers)', async () => {
      mockGet.mockResolvedValueOnce(mockDashboardKPIs);

      const { result } = renderHook(() => useDashboard(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const kpis = result.current.data!;
      expect(Number.isInteger(kpis.totalOutstandingPaise)).toBe(true);
      expect(Number.isInteger(kpis.todayCollectionsPaise)).toBe(true);
      expect(Number.isInteger(kpis.todayDisbursementsPaise)).toBe(true);
      expect(Number.isInteger(kpis.cashInHandPaise)).toBe(true);
    });

    it('count fields are non-negative integers', async () => {
      mockGet.mockResolvedValueOnce(mockDashboardKPIs);

      const { result } = renderHook(() => useDashboard(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const kpis = result.current.data!;
      expect(kpis.totalCustomers).toBeGreaterThanOrEqual(0);
      expect(kpis.activeLoans).toBeGreaterThanOrEqual(0);
      expect(kpis.overdueLoans).toBeGreaterThanOrEqual(0);
      expect(kpis.pendingApprovals).toBeGreaterThanOrEqual(0);
    });

    it('returns loading state initially', () => {
      mockGet.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useDashboard(), { wrapper });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.data).toBeUndefined();
    });

    it('handles error state', async () => {
      mockGet.mockRejectedValueOnce(new Error('Server Error'));

      const { result } = renderHook(() => useDashboard(), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });

    it('overdueLoans <= activeLoans', async () => {
      mockGet.mockResolvedValueOnce(mockDashboardKPIs);

      const { result } = renderHook(() => useDashboard(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const kpis = result.current.data!;
      expect(kpis.overdueLoans).toBeLessThanOrEqual(kpis.activeLoans);
    });

    it('handles zero values', async () => {
      const zeroKPIs = {
        totalCustomers: 0,
        activeLoans: 0,
        overdueLoans: 0,
        totalOutstandingPaise: 0,
        todayCollectionsPaise: 0,
        todayDisbursementsPaise: 0,
        cashInHandPaise: 0,
        pendingApprovals: 0,
      };
      mockGet.mockResolvedValueOnce(zeroKPIs);

      const { result } = renderHook(() => useDashboard(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(zeroKPIs);
    });

    it('handles large values', async () => {
      const largeKPIs = {
        totalCustomers: 1000000,
        activeLoans: 500000,
        overdueLoans: 50000,
        totalOutstandingPaise: Number.MAX_SAFE_INTEGER,
        todayCollectionsPaise: 999999999999,
        todayDisbursementsPaise: 888888888888,
        cashInHandPaise: 77777777777,
        pendingApprovals: 10000,
      };
      mockGet.mockResolvedValueOnce(largeKPIs);

      const { result } = renderHook(() => useDashboard(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(largeKPIs);
    });

    const kpiFieldTests = [
      { field: 'totalCustomers', description: 'total customers count' },
      { field: 'activeLoans', description: 'active loans count' },
      { field: 'overdueLoans', description: 'overdue loans count' },
      { field: 'totalOutstandingPaise', description: 'total outstanding in paise' },
      { field: 'todayCollectionsPaise', description: 'today collections in paise' },
      { field: 'todayDisbursementsPaise', description: 'today disbursements in paise' },
      { field: 'cashInHandPaise', description: 'cash in hand in paise' },
      { field: 'pendingApprovals', description: 'pending approvals count' },
    ];

    it.each(kpiFieldTests)('$description is numeric', async ({ field }) => {
      mockGet.mockResolvedValueOnce(mockDashboardKPIs);

      const { result } = renderHook(() => useDashboard(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const value = result.current.data![field as keyof typeof mockDashboardKPIs];
      expect(typeof value).toBe('number');
    });
  });
});
