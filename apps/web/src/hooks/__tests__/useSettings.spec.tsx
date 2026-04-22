import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useSettings,
  useHolidays,
  useUpdateSetting,
  useSetHolidays,
} from '../useSettings';
import type { ReactNode } from 'react';

// Mock the API client
const mockGet = vi.fn();
const mockPatch = vi.fn();
const mockPut = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
    put: (...args: unknown[]) => mockPut(...args),
  },
}));

/**
 * useSettings Hook Tests
 *
 * Tests the useSettings hooks for:
 * - List settings query
 * - Holidays list query (returns string[] of ISO dates)
 * - Update single setting mutation
 * - Set holidays (bulk replace) mutation
 *
 * **Validates: Settings and holidays management workflow**
 */

describe('useSettings Hook', () => {
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

  describe('useSettings (list)', () => {
    const mockSettingsList = [
      { key: 'penalty_rate', value: '2', description: 'Daily penalty rate in percentage' },
      { key: 'grace_period_days', value: '3', description: 'Grace period before penalty' },
      { key: 'max_loan_principal', value: '50000000', description: 'Max loan amount in paise' },
      { key: 'working_days', value: 'Mon,Tue,Wed,Thu,Fri,Sat', description: 'Working days' },
      { key: 'office_hours', value: '09:00-18:00', description: 'Office hours' },
    ];

    it('fetches settings list', async () => {
      mockGet.mockResolvedValueOnce(mockSettingsList);

      const { result } = renderHook(() => useSettings(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith('/settings');
      expect(result.current.data).toEqual(mockSettingsList);
    });

    it('settings have key and value', async () => {
      mockGet.mockResolvedValueOnce(mockSettingsList);

      const { result } = renderHook(() => useSettings(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      result.current.data?.forEach(setting => {
        expect(setting.key).toBeDefined();
        expect(setting.value).toBeDefined();
      });
    });

    it('settings may have description', async () => {
      mockGet.mockResolvedValueOnce(mockSettingsList);

      const { result } = renderHook(() => useSettings(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const settingsWithDescription = result.current.data?.filter(s => s.description);
      expect(settingsWithDescription?.length).toBeGreaterThan(0);
    });

    it('returns loading state initially', () => {
      mockGet.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useSettings(), { wrapper });

      expect(result.current.isLoading).toBe(true);
    });

    it('handles error state', async () => {
      mockGet.mockRejectedValueOnce(new Error('Server Error'));

      const { result } = renderHook(() => useSettings(), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });

    const settingKeyTests = [
      { key: 'penalty_rate' },
      { key: 'grace_period_days' },
      { key: 'max_loan_principal' },
      { key: 'working_days' },
      { key: 'office_hours' },
    ];

    it.each(settingKeyTests)('includes setting with key=$key', async ({ key }) => {
      mockGet.mockResolvedValueOnce(mockSettingsList);

      const { result } = renderHook(() => useSettings(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const setting = result.current.data?.find(s => s.key === key);
      expect(setting).toBeDefined();
    });
  });

  describe('useHolidays', () => {
    const mockHolidays = [
      '2024-01-26',
      '2024-03-25',
      '2024-08-15',
      '2024-10-02',
      '2024-11-01',
    ];

    it('fetches holidays list', async () => {
      mockGet.mockResolvedValueOnce(mockHolidays);

      const { result } = renderHook(() => useHolidays(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith('/settings/holidays');
      expect(result.current.data).toEqual(mockHolidays);
    });

    it('holidays are ISO date strings', async () => {
      mockGet.mockResolvedValueOnce(mockHolidays);

      const { result } = renderHook(() => useHolidays(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      result.current.data?.forEach(dateStr => {
        expect(dateStr).toMatch(dateRegex);
      });
    });

    it('returns loading state initially', () => {
      mockGet.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useHolidays(), { wrapper });

      expect(result.current.isLoading).toBe(true);
    });

    it('handles error state', async () => {
      mockGet.mockRejectedValueOnce(new Error('Server Error'));

      const { result } = renderHook(() => useHolidays(), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });

    it('returns empty list when no holidays', async () => {
      mockGet.mockResolvedValueOnce([]);

      const { result } = renderHook(() => useHolidays(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual([]);
    });
  });

  describe('useUpdateSetting', () => {
    it('updates a single setting by key', async () => {
      mockPatch.mockResolvedValueOnce({ key: 'penalty_rate', value: '2.5' });

      const { result } = renderHook(() => useUpdateSetting(), { wrapper });

      result.current.mutate({
        key: 'penalty_rate',
        value: '2.5',
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPatch).toHaveBeenCalledWith('/settings/penalty_rate', {
        value: '2.5',
        description: undefined,
      });
    });

    it('updates setting with description', async () => {
      mockPatch.mockResolvedValueOnce({ key: 'penalty_rate', value: '3', description: 'Updated rate' });

      const { result } = renderHook(() => useUpdateSetting(), { wrapper });

      result.current.mutate({
        key: 'penalty_rate',
        value: '3',
        description: 'Updated rate',
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPatch).toHaveBeenCalledWith('/settings/penalty_rate', {
        value: '3',
        description: 'Updated rate',
      });
    });

    it('invalidates settings query on success', async () => {
      mockPatch.mockResolvedValueOnce({ key: 'penalty_rate', value: '3' });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useUpdateSetting(), { wrapper });

      result.current.mutate({ key: 'penalty_rate', value: '3' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['settings'] });
    });

    it('handles mutation error', async () => {
      mockPatch.mockRejectedValueOnce(new Error('Invalid setting value'));

      const { result } = renderHook(() => useUpdateSetting(), { wrapper });

      result.current.mutate({ key: 'invalid_key', value: 'value' });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe('useSetHolidays', () => {
    it('replaces all holidays', async () => {
      const newHolidays = ['2024-01-26', '2024-08-15', '2024-12-25'];
      mockPut.mockResolvedValueOnce(newHolidays);

      const { result } = renderHook(() => useSetHolidays(), { wrapper });

      result.current.mutate(newHolidays);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPut).toHaveBeenCalledWith('/settings/holidays', {
        holidays: newHolidays,
      });
    });

    it('invalidates holidays query on success', async () => {
      mockPut.mockResolvedValueOnce(['2024-12-25']);

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useSetHolidays(), { wrapper });

      result.current.mutate(['2024-12-25']);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['settings', 'holidays'] });
    });

    it('handles error for invalid date', async () => {
      mockPut.mockRejectedValueOnce(new Error('Invalid ISO date string'));

      const { result } = renderHook(() => useSetHolidays(), { wrapper });

      result.current.mutate(['invalid-date']);

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toBe('Invalid ISO date string');
    });

    it('can clear all holidays', async () => {
      mockPut.mockResolvedValueOnce([]);

      const { result } = renderHook(() => useSetHolidays(), { wrapper });

      result.current.mutate([]);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPut).toHaveBeenCalledWith('/settings/holidays', {
        holidays: [],
      });
    });

    it('does not invalidate queries on error', async () => {
      mockPut.mockRejectedValueOnce(new Error('Server Error'));

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useSetHolidays(), { wrapper });

      result.current.mutate(['2024-01-01']);

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(invalidateSpy).not.toHaveBeenCalled();
    });
  });
});
