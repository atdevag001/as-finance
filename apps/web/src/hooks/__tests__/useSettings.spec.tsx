import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useSettings,
  useHolidays,
  useUpdateSettings,
  useCreateHoliday,
  useDeleteHoliday,
} from '../useSettings';
import type { ReactNode } from 'react';

// Mock the API client
const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPatch = vi.fn();
const mockDelete = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

/**
 * useSettings Hook Tests
 *
 * Tests the useSettings hooks for:
 * - List settings query
 * - Holidays list query
 * - Update settings mutation
 * - Create holiday mutation
 * - Delete holiday mutation
 * - Query invalidation
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
      { id: 'hol-1', date: '2024-01-26', description: 'Republic Day' },
      { id: 'hol-2', date: '2024-03-25', description: 'Holi' },
      { id: 'hol-3', date: '2024-08-15', description: 'Independence Day' },
      { id: 'hol-4', date: '2024-10-02', description: 'Gandhi Jayanti' },
      { id: 'hol-5', date: '2024-11-01', description: 'Diwali' },
    ];

    it('fetches holidays list', async () => {
      mockGet.mockResolvedValueOnce(mockHolidays);

      const { result } = renderHook(() => useHolidays(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith('/settings/holidays');
      expect(result.current.data).toEqual(mockHolidays);
    });

    it('holidays have id, date, and description', async () => {
      mockGet.mockResolvedValueOnce(mockHolidays);

      const { result } = renderHook(() => useHolidays(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      result.current.data?.forEach(holiday => {
        expect(holiday.id).toBeDefined();
        expect(holiday.date).toBeDefined();
        expect(holiday.description).toBeDefined();
      });
    });

    it('holiday dates are in YYYY-MM-DD format', async () => {
      mockGet.mockResolvedValueOnce(mockHolidays);

      const { result } = renderHook(() => useHolidays(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      result.current.data?.forEach(holiday => {
        expect(holiday.date).toMatch(dateRegex);
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

  describe('useUpdateSettings', () => {
    it('updates settings', async () => {
      mockPatch.mockResolvedValueOnce({ success: true });

      const { result } = renderHook(() => useUpdateSettings(), { wrapper });

      result.current.mutate({
        penalty_rate: '2.5',
        grace_period_days: '5',
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPatch).toHaveBeenCalledWith('/settings', {
        penalty_rate: '2.5',
        grace_period_days: '5',
      });
    });

    it('invalidates settings query on success', async () => {
      mockPatch.mockResolvedValueOnce({ success: true });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useUpdateSettings(), { wrapper });

      result.current.mutate({ penalty_rate: '3' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['settings'] });
    });

    it('handles mutation error', async () => {
      mockPatch.mockRejectedValueOnce(new Error('Invalid setting value'));

      const { result } = renderHook(() => useUpdateSettings(), { wrapper });

      result.current.mutate({ invalid_key: 'value' });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });

    it('handles slow mutation', async () => {
      mockPatch.mockImplementation(() => new Promise((resolve) => {
        setTimeout(() => resolve({ success: true }), 100);
      }));

      const { result } = renderHook(() => useUpdateSettings(), { wrapper });

      result.current.mutate({ penalty_rate: '2' });

      

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });

    it('updates single setting', async () => {
      mockPatch.mockResolvedValueOnce({ success: true });

      const { result } = renderHook(() => useUpdateSettings(), { wrapper });

      result.current.mutate({ max_loan_principal: '100000000' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPatch).toHaveBeenCalledWith('/settings', {
        max_loan_principal: '100000000',
      });
    });

    it('updates multiple settings at once', async () => {
      mockPatch.mockResolvedValueOnce({ success: true });

      const { result } = renderHook(() => useUpdateSettings(), { wrapper });

      result.current.mutate({
        penalty_rate: '2.5',
        grace_period_days: '7',
        office_hours: '08:00-19:00',
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPatch).toHaveBeenCalledWith('/settings', {
        penalty_rate: '2.5',
        grace_period_days: '7',
        office_hours: '08:00-19:00',
      });
    });
  });

  describe('useCreateHoliday', () => {
    it('creates a new holiday', async () => {
      mockPost.mockResolvedValueOnce({ id: 'hol-new', date: '2024-12-25', description: 'Christmas' });

      const { result } = renderHook(() => useCreateHoliday(), { wrapper });

      result.current.mutate({
        date: '2024-12-25',
        description: 'Christmas',
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPost).toHaveBeenCalledWith('/settings/holidays', {
        date: '2024-12-25',
        description: 'Christmas',
      });
    });

    it('invalidates holidays query on success', async () => {
      mockPost.mockResolvedValueOnce({ id: 'hol-new' });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useCreateHoliday(), { wrapper });

      result.current.mutate({ date: '2024-12-25', description: 'Test' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['settings', 'holidays'] });
    });

    it('handles 409 error for duplicate date', async () => {
      const conflictError = new Error('Holiday already exists for this date');
      (conflictError as Error & { statusCode: number }).statusCode = 409;
      mockPost.mockRejectedValueOnce(conflictError);

      const { result } = renderHook(() => useCreateHoliday(), { wrapper });

      result.current.mutate({ date: '2024-01-26', description: 'Duplicate' });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toBe('Holiday already exists for this date');
    });

    it('handles slow mutation', async () => {
      mockPost.mockImplementation(() => new Promise((resolve) => {
        setTimeout(() => resolve({ id: 'hol-new' }), 100);
      }));

      const { result } = renderHook(() => useCreateHoliday(), { wrapper });

      result.current.mutate({ date: '2024-12-25', description: 'Test' });

      

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });
  });

  describe('useDeleteHoliday', () => {
    it('deletes a holiday', async () => {
      mockDelete.mockResolvedValueOnce({ success: true });

      const { result } = renderHook(() => useDeleteHoliday(), { wrapper });

      result.current.mutate('hol-1');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockDelete).toHaveBeenCalledWith('/settings/holidays/hol-1');
    });

    it('invalidates holidays query on success', async () => {
      mockDelete.mockResolvedValueOnce({ success: true });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useDeleteHoliday(), { wrapper });

      result.current.mutate('hol-1');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['settings', 'holidays'] });
    });

    it('handles 404 error when holiday not found', async () => {
      const notFoundError = new Error('Holiday not found');
      (notFoundError as Error & { statusCode: number }).statusCode = 404;
      mockDelete.mockRejectedValueOnce(notFoundError);

      const { result } = renderHook(() => useDeleteHoliday(), { wrapper });

      result.current.mutate('invalid-hol');

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toBe('Holiday not found');
    });

    it('handles slow mutation', async () => {
      mockDelete.mockImplementation(() => new Promise((resolve) => {
        setTimeout(() => resolve({ success: true }), 100);
      }));

      const { result } = renderHook(() => useDeleteHoliday(), { wrapper });

      result.current.mutate('hol-1');

      

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });

    it('does not invalidate queries on error', async () => {
      mockDelete.mockRejectedValueOnce(new Error('Server Error'));

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useDeleteHoliday(), { wrapper });

      result.current.mutate('hol-1');

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(invalidateSpy).not.toHaveBeenCalled();
    });
  });
});
