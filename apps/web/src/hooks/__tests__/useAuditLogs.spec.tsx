import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuditLogs } from '../useAuditLogs';
import type { ReactNode } from 'react';

// Mock the API client
const mockGet = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
  },
}));

/**
 * useAuditLogs Hook Tests
 *
 * Tests the useAuditLogs hook for:
 * - List with pagination
 * - Filter by entity
 * - Filter by action
 * - Filter by startDate
 * - Multiple filters combined
 * - Log fields validation
 *
 * **Validates: Audit log query and filtering**
 */

describe('useAuditLogs Hook', () => {
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

  describe('useAuditLogs', () => {
    const mockAuditLogs = {
      data: [
        {
          id: 'log-1',
          action_type: 'loan_created',
          actor_id: 'user-1',
          actor_role: 'field_officer',
          target_entity: 'loan',
          target_id: 'loan-1',
          created_at: '2024-01-15T10:00:00.000Z',
          remarks: 'Created new loan application',
        },
        {
          id: 'log-2',
          action_type: 'loan_approved',
          actor_id: 'user-2',
          actor_role: 'manager',
          target_entity: 'loan',
          target_id: 'loan-1',
          created_at: '2024-01-15T11:00:00.000Z',
          remarks: 'Approved loan after review',
        },
        {
          id: 'log-3',
          action_type: 'customer_created',
          actor_id: 'user-1',
          actor_role: 'field_officer',
          target_entity: 'customer',
          target_id: 'cust-1',
          created_at: '2024-01-15T09:00:00.000Z',
        },
        {
          id: 'log-4',
          action_type: 'collection_posted',
          actor_id: 'user-3',
          actor_role: 'collection_officer',
          target_entity: 'collection',
          target_id: 'col-1',
          created_at: '2024-01-16T14:00:00.000Z',
          remarks: 'Cash collection from customer',
        },
      ],
      total: 100,
    };

    it('fetches audit logs with default pagination', async () => {
      mockGet.mockResolvedValueOnce(mockAuditLogs);

      const { result } = renderHook(() => useAuditLogs(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith('/audit-logs?skip=0&take=20');
      expect(result.current.data).toEqual(mockAuditLogs);
    });

    it('fetches audit logs with specific page', async () => {
      mockGet.mockResolvedValueOnce({ data: [], total: 100 });

      const { result } = renderHook(() => useAuditLogs({ page: 3 }), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith('/audit-logs?skip=40&take=20');
    });

    it('filters by entity', async () => {
      mockGet.mockResolvedValueOnce({ data: [], total: 0 });

      const { result } = renderHook(() => useAuditLogs({ entity: 'customer' }), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('entity=customer'));
    });

    it('filters by action', async () => {
      mockGet.mockResolvedValueOnce({ data: [], total: 0 });

      const { result } = renderHook(() => useAuditLogs({ action: 'loan_approved' }), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('action=loan_approved'));
    });

    it('filters by startDate', async () => {
      mockGet.mockResolvedValueOnce({ data: [], total: 0 });

      const { result } = renderHook(
        () => useAuditLogs({ startDate: '2024-01-15' }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('startDate=2024-01-15'));
    });

    it('combines multiple filters', async () => {
      mockGet.mockResolvedValueOnce({ data: [], total: 0 });

      const { result } = renderHook(
        () => useAuditLogs({
          page: 2,
          entity: 'loan',
          action: 'loan_created',
          startDate: '2024-01-01',
        }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const url = mockGet.mock.calls[0][0] as string;
      expect(url).toContain('skip=20');
      expect(url).toContain('entity=loan');
      expect(url).toContain('action=loan_created');
      expect(url).toContain('startDate=2024-01-01');
    });

    it('returns log fields', async () => {
      mockGet.mockResolvedValueOnce(mockAuditLogs);

      const { result } = renderHook(() => useAuditLogs(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      result.current.data?.data.forEach(log => {
        expect(log.id).toBeDefined();
        expect(log.action_type).toBeDefined();
        expect(log.actor_id).toBeDefined();
        expect(log.actor_role).toBeDefined();
        expect(log.target_entity).toBeDefined();
        expect(log.target_id).toBeDefined();
        expect(log.created_at).toBeDefined();
      });
    });

    it('remarks field is optional', async () => {
      mockGet.mockResolvedValueOnce(mockAuditLogs);

      const { result } = renderHook(() => useAuditLogs(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const logsWithRemarks = result.current.data?.data.filter(l => l.remarks);
      const logsWithoutRemarks = result.current.data?.data.filter(l => !l.remarks);
      expect(logsWithRemarks?.length).toBeGreaterThan(0);
      expect(logsWithoutRemarks?.length).toBeGreaterThan(0);
    });

    it('returns loading state initially', () => {
      mockGet.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useAuditLogs(), { wrapper });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.data).toBeUndefined();
    });

    it('handles error state', async () => {
      mockGet.mockRejectedValueOnce(new Error('Server Error'));

      const { result } = renderHook(() => useAuditLogs(), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });

    it('returns empty data when no logs', async () => {
      mockGet.mockResolvedValueOnce({ data: [], total: 0 });

      const { result } = renderHook(() => useAuditLogs(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.data).toEqual([]);
      expect(result.current.data?.total).toBe(0);
    });

    const entityTests = [
      { entity: 'customer', description: 'customer entity' },
      { entity: 'loan', description: 'loan entity' },
      { entity: 'collection', description: 'collection entity' },
      { entity: 'user', description: 'user entity' },
      { entity: 'setting', description: 'setting entity' },
    ];

    it.each(entityTests)('filters by $description', async ({ entity }) => {
      mockGet.mockResolvedValueOnce({ data: [], total: 0 });

      const { result } = renderHook(() => useAuditLogs({ entity }), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith(expect.stringContaining(`entity=${entity}`));
    });

    const actionTests = [
      { action: 'loan_created', description: 'loan created action' },
      { action: 'loan_approved', description: 'loan approved action' },
      { action: 'loan_rejected', description: 'loan rejected action' },
      { action: 'loan_disbursed', description: 'loan disbursed action' },
      { action: 'customer_created', description: 'customer created action' },
      { action: 'customer_updated', description: 'customer updated action' },
      { action: 'collection_posted', description: 'collection posted action' },
      { action: 'collection_reversed', description: 'collection reversed action' },
    ];

    it.each(actionTests)('filters by $description', async ({ action }) => {
      mockGet.mockResolvedValueOnce({ data: [], total: 0 });

      const { result } = renderHook(() => useAuditLogs({ action }), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith(expect.stringContaining(`action=${action}`));
    });

    const pageTests = [
      { page: 1, expectedSkip: 0 },
      { page: 2, expectedSkip: 20 },
      { page: 5, expectedSkip: 80 },
      { page: 10, expectedSkip: 180 },
    ];

    it.each(pageTests)('page $page calculates skip=$expectedSkip', async ({ page, expectedSkip }) => {
      mockGet.mockResolvedValueOnce({ data: [], total: 200 });

      const { result } = renderHook(() => useAuditLogs({ page }), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith(expect.stringContaining(`skip=${expectedSkip}`));
    });
  });
});
