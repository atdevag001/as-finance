import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useReport } from '../useReports';
import type { ReactNode } from 'react';

// Mock the API client
const mockGet = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
  },
}));

/**
 * useReports Hook Tests
 *
 * Tests the useReport hook for:
 * - Fetch report by type
 * - Date range filter
 * - All report types work
 * - Report data structure
 *
 * **Validates: Report generation and data retrieval**
 */

describe('useReports Hook', () => {
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

  describe('useReport', () => {
    const mockCollectionReport = {
      type: 'collection',
      label: 'Collection Report',
      columns: ['date', 'loan_number', 'customer', 'amount', 'mode'],
      rows: [
        { date: '2024-01-15', loan_number: 'LN-2024-001', customer: 'John Doe', amount: 50000, mode: 'cash' },
        { date: '2024-01-15', loan_number: 'LN-2024-002', customer: 'Jane Smith', amount: 75000, mode: 'upi' },
        { date: '2024-01-16', loan_number: 'LN-2024-001', customer: 'John Doe', amount: 50000, mode: 'cash' },
      ],
    };

    const mockOutstandingReport = {
      type: 'outstanding',
      label: 'Outstanding Report',
      columns: ['loan_number', 'customer', 'principal', 'interest', 'penalty', 'total'],
      rows: [
        { loan_number: 'LN-2024-001', customer: 'John Doe', principal: 400000, interest: 50000, penalty: 5000, total: 455000 },
        { loan_number: 'LN-2024-002', customer: 'Jane Smith', principal: 900000, interest: 100000, penalty: 0, total: 1000000 },
      ],
    };

    it('fetches report by type', async () => {
      mockGet.mockResolvedValueOnce(mockCollectionReport);

      const { result } = renderHook(() => useReport('collection'), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith('/reports/collection');
      expect(result.current.data).toEqual(mockCollectionReport);
    });

    it('fetches report with date range', async () => {
      mockGet.mockResolvedValueOnce(mockCollectionReport);

      const { result } = renderHook(
        () => useReport('collection', { startDate: '2024-01-01', endDate: '2024-01-31' }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith(
        '/reports/collection?startDate=2024-01-01&endDate=2024-01-31'
      );
    });

    it('fetches report with only startDate', async () => {
      mockGet.mockResolvedValueOnce(mockCollectionReport);

      const { result } = renderHook(
        () => useReport('collection', { startDate: '2024-01-01' }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith('/reports/collection?startDate=2024-01-01');
    });

    it('fetches report with only endDate', async () => {
      mockGet.mockResolvedValueOnce(mockCollectionReport);

      const { result } = renderHook(
        () => useReport('collection', { endDate: '2024-01-31' }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith('/reports/collection?endDate=2024-01-31');
    });

    it('does not fetch when type is empty', () => {
      renderHook(() => useReport(''), { wrapper });

      expect(mockGet).not.toHaveBeenCalled();
    });

    it('returns report data structure', async () => {
      mockGet.mockResolvedValueOnce(mockCollectionReport);

      const { result } = renderHook(() => useReport('collection'), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const report = result.current.data!;
      expect(report.type).toBeDefined();
      expect(report.label).toBeDefined();
      expect(report.columns).toBeDefined();
      expect(report.rows).toBeDefined();
      expect(Array.isArray(report.columns)).toBe(true);
      expect(Array.isArray(report.rows)).toBe(true);
    });

    it('returns loading state initially', () => {
      mockGet.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useReport('collection'), { wrapper });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.data).toBeUndefined();
    });

    it('handles error state', async () => {
      mockGet.mockRejectedValueOnce(new Error('Server Error'));

      const { result } = renderHook(() => useReport('collection'), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });

    it('returns empty rows when no data', async () => {
      const emptyReport = {
        type: 'collection',
        label: 'Collection Report',
        columns: ['date', 'loan_number', 'customer', 'amount', 'mode'],
        rows: [],
      };
      mockGet.mockResolvedValueOnce(emptyReport);

      const { result } = renderHook(() => useReport('collection'), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.rows).toEqual([]);
    });

    const reportTypeTests = [
      { type: 'collection', description: 'collection report' },
      { type: 'outstanding', description: 'outstanding report' },
      { type: 'disbursement', description: 'disbursement report' },
      { type: 'overdue', description: 'overdue report' },
      { type: 'demand', description: 'demand report' },
      { type: 'portfolio', description: 'portfolio report' },
    ];

    it.each(reportTypeTests)('fetches $description', async ({ type }) => {
      const mockReport = {
        type,
        label: `${type.charAt(0).toUpperCase() + type.slice(1)} Report`,
        columns: ['column1', 'column2'],
        rows: [],
      };
      mockGet.mockResolvedValueOnce(mockReport);

      const { result } = renderHook(() => useReport(type), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith(`/reports/${type}`);
      expect(result.current.data?.type).toBe(type);
    });

    it('handles outstanding report with multiple columns', async () => {
      mockGet.mockResolvedValueOnce(mockOutstandingReport);

      const { result } = renderHook(() => useReport('outstanding'), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const report = result.current.data!;
      expect(report.columns).toContain('loan_number');
      expect(report.columns).toContain('customer');
      expect(report.columns).toContain('principal');
      expect(report.columns).toContain('interest');
      expect(report.columns).toContain('penalty');
      expect(report.columns).toContain('total');
    });

    it('report rows have corresponding column values', async () => {
      mockGet.mockResolvedValueOnce(mockOutstandingReport);

      const { result } = renderHook(() => useReport('outstanding'), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const report = result.current.data!;
      report.rows.forEach(row => {
        report.columns.forEach(column => {
          expect(row[column]).toBeDefined();
        });
      });
    });

    it('handles 404 error for invalid report type', async () => {
      const notFoundError = new Error('Report type not found');
      (notFoundError as Error & { statusCode: number }).statusCode = 404;
      mockGet.mockRejectedValueOnce(notFoundError);

      const { result } = renderHook(() => useReport('invalid_type'), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toBe('Report type not found');
    });

    const dateRangeTests = [
      { startDate: '2024-01-01', endDate: '2024-01-31', expected: '?startDate=2024-01-01&endDate=2024-01-31' },
      { startDate: '2024-02-01', endDate: '2024-02-29', expected: '?startDate=2024-02-01&endDate=2024-02-29' },
      { startDate: '2024-03-01', endDate: '2024-03-31', expected: '?startDate=2024-03-01&endDate=2024-03-31' },
    ];

    it.each(dateRangeTests)('handles date range $startDate to $endDate', async ({ startDate, endDate, expected }) => {
      mockGet.mockResolvedValueOnce({ type: 'collection', label: 'Test', columns: [], rows: [] });

      const { result } = renderHook(
        () => useReport('collection', { startDate, endDate }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith(`/reports/collection${expected}`);
    });
  });
});
