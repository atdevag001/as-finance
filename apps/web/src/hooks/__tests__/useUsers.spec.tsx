import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useUsers, useUser, useCreateUser, useUpdateUser } from '../useUsers';
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
 * useUsers Hook Tests
 *
 * Tests the useUsers hooks for:
 * - List users with pagination
 * - User detail query
 * - Create user with password
 * - Update user (role change, toggle active)
 * - Query invalidation
 *
 * **Validates: User management workflow**
 */

describe('useUsers Hook', () => {
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

  describe('useUsers (list)', () => {
    const mockUsersList = {
      data: [
        {
          id: 'user-1',
          username: 'admin',
          full_name: 'Admin User',
          mobile: '9876543210',
          role: 'super_admin',
          is_active: true,
          created_at: '2024-01-01T10:00:00.000Z',
        },
        {
          id: 'user-2',
          username: 'officer1',
          full_name: 'Field Officer One',
          mobile: '9876543211',
          role: 'field_officer',
          is_active: true,
          area: 'Zone A',
          created_at: '2024-01-05T10:00:00.000Z',
        },
        {
          id: 'user-3',
          username: 'collector1',
          full_name: 'Collection Officer',
          mobile: '9876543212',
          role: 'collection_officer',
          is_active: false,
          area: 'Zone B',
          created_at: '2024-01-10T10:00:00.000Z',
        },
      ],
      total: 30,
    };

    it('fetches users list with default pagination', async () => {
      mockGet.mockResolvedValueOnce(mockUsersList);

      const { result } = renderHook(() => useUsers(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith('/users?skip=0&take=20');
      expect(result.current.data).toEqual(mockUsersList);
    });

    it('fetches users with specific page', async () => {
      mockGet.mockResolvedValueOnce({ data: [], total: 100 });

      const { result } = renderHook(() => useUsers({ page: 3 }), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith('/users?skip=40&take=20');
    });

    it('returns loading state initially', () => {
      mockGet.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useUsers(), { wrapper });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.data).toBeUndefined();
    });

    it('returns error state on API failure', async () => {
      mockGet.mockRejectedValueOnce(new Error('Server Error'));

      const { result } = renderHook(() => useUsers(), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });

    it('returns users with different roles', async () => {
      mockGet.mockResolvedValueOnce(mockUsersList);

      const { result } = renderHook(() => useUsers(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const roles = new Set(result.current.data?.data.map(u => u.role));
      expect(roles).toContain('super_admin');
      expect(roles).toContain('field_officer');
      expect(roles).toContain('collection_officer');
    });

    it('returns active and inactive users', async () => {
      mockGet.mockResolvedValueOnce(mockUsersList);

      const { result } = renderHook(() => useUsers(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const activeUsers = result.current.data?.data.filter(u => u.is_active);
      const inactiveUsers = result.current.data?.data.filter(u => !u.is_active);
      expect(activeUsers?.length).toBeGreaterThan(0);
      expect(inactiveUsers?.length).toBeGreaterThan(0);
    });

    const pageTests = [
      { page: 1, expectedSkip: 0 },
      { page: 2, expectedSkip: 20 },
      { page: 5, expectedSkip: 80 },
    ];

    it.each(pageTests)('page $page calculates skip=$expectedSkip', async ({ page, expectedSkip }) => {
      mockGet.mockResolvedValueOnce({ data: [], total: 100 });

      const { result } = renderHook(() => useUsers({ page }), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith(expect.stringContaining(`skip=${expectedSkip}`));
    });
  });

  describe('useUser (detail)', () => {
    const mockUserDetail = {
      id: 'user-1',
      username: 'admin',
      full_name: 'Admin User',
      mobile: '9876543210',
      role: 'super_admin',
      is_active: true,
      area: undefined,
      created_at: '2024-01-01T10:00:00.000Z',
    };

    it('fetches user detail by ID', async () => {
      mockGet.mockResolvedValueOnce(mockUserDetail);

      const { result } = renderHook(() => useUser('user-1'), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockGet).toHaveBeenCalledWith('/users/user-1');
      expect(result.current.data).toEqual(mockUserDetail);
    });

    it('does not fetch when ID is empty', () => {
      renderHook(() => useUser(''), { wrapper });

      expect(mockGet).not.toHaveBeenCalled();
    });

    it('returns 404 error when user not found', async () => {
      const notFoundError = new Error('User not found');
      (notFoundError as Error & { statusCode: number }).statusCode = 404;
      mockGet.mockRejectedValueOnce(notFoundError);

      const { result } = renderHook(() => useUser('invalid-user'), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });

    it('returns loading state initially', () => {
      mockGet.mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useUser('user-1'), { wrapper });

      expect(result.current.isLoading).toBe(true);
    });

    it('returns user with optional area field', async () => {
      const userWithArea = { ...mockUserDetail, area: 'Zone A' };
      mockGet.mockResolvedValueOnce(userWithArea);

      const { result } = renderHook(() => useUser('user-2'), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.area).toBe('Zone A');
    });
  });

  describe('useCreateUser', () => {
    it('creates a new user', async () => {
      const newUser = { id: 'user-new', username: 'newuser' };
      mockPost.mockResolvedValueOnce(newUser);

      const { result } = renderHook(() => useCreateUser(), { wrapper });

      result.current.mutate({
        username: 'newuser',
        password: 'SecurePassword123!',
        full_name: 'New User',
        mobile: '9876543213',
        role: 'field_officer',
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPost).toHaveBeenCalledWith('/users', {
        username: 'newuser',
        password: 'SecurePassword123!',
        full_name: 'New User',
        mobile: '9876543213',
        role: 'field_officer',
      });
    });

    it('creates user with area', async () => {
      mockPost.mockResolvedValueOnce({ id: 'user-new' });

      const { result } = renderHook(() => useCreateUser(), { wrapper });

      result.current.mutate({
        username: 'areauser',
        password: 'Password123!',
        full_name: 'Area User',
        mobile: '9876543214',
        role: 'field_officer',
        area: 'Zone C',
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPost).toHaveBeenCalledWith('/users', expect.objectContaining({
        area: 'Zone C',
      }));
    });

    it('invalidates users query on success', async () => {
      mockPost.mockResolvedValueOnce({ id: 'user-new' });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useCreateUser(), { wrapper });

      result.current.mutate({ username: 'test', password: 'pass' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['users'] });
    });

    it('handles 409 error for duplicate username', async () => {
      const conflictError = new Error('Username already exists');
      (conflictError as Error & { statusCode: number }).statusCode = 409;
      mockPost.mockRejectedValueOnce(conflictError);

      const { result } = renderHook(() => useCreateUser(), { wrapper });

      result.current.mutate({ username: 'existing', password: 'pass' });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toBe('Username already exists');
    });

    it('handles slow mutation', async () => {
      mockPost.mockImplementation(() => new Promise((resolve) => {
        setTimeout(() => resolve({ id: 'user-new' }), 100);
      }));

      const { result } = renderHook(() => useCreateUser(), { wrapper });

      result.current.mutate({ username: 'test', password: 'pass' });

      

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });

    const roleTests = [
      { role: 'super_admin', description: 'super admin' },
      { role: 'manager', description: 'manager' },
      { role: 'field_officer', description: 'field officer' },
      { role: 'collection_officer', description: 'collection officer' },
      { role: 'accountant', description: 'accountant' },
      { role: 'office_staff', description: 'office staff' },
      { role: 'viewer_auditor', description: 'viewer auditor' },
    ];

    it.each(roleTests)('creates user with $description role', async ({ role }) => {
      mockPost.mockResolvedValueOnce({ id: 'user-new' });

      const { result } = renderHook(() => useCreateUser(), { wrapper });

      result.current.mutate({ username: 'test', password: 'pass', role });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPost).toHaveBeenCalledWith('/users', expect.objectContaining({ role }));
    });
  });

  describe('useUpdateUser', () => {
    it('updates a user', async () => {
      mockPatch.mockResolvedValueOnce({ id: 'user-1', full_name: 'Updated Name' });

      const { result } = renderHook(() => useUpdateUser(), { wrapper });

      result.current.mutate({
        id: 'user-1',
        full_name: 'Updated Name',
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPatch).toHaveBeenCalledWith('/users/user-1', {
        full_name: 'Updated Name',
      });
    });

    it('changes user role', async () => {
      mockPatch.mockResolvedValueOnce({ id: 'user-1', role: 'manager' });

      const { result } = renderHook(() => useUpdateUser(), { wrapper });

      result.current.mutate({
        id: 'user-1',
        role: 'manager',
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPatch).toHaveBeenCalledWith('/users/user-1', {
        role: 'manager',
      });
    });

    it('toggles user active status', async () => {
      mockPatch.mockResolvedValueOnce({ id: 'user-1', is_active: false });

      const { result } = renderHook(() => useUpdateUser(), { wrapper });

      result.current.mutate({
        id: 'user-1',
        is_active: false,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPatch).toHaveBeenCalledWith('/users/user-1', {
        is_active: false,
      });
    });

    it('updates user area', async () => {
      mockPatch.mockResolvedValueOnce({ id: 'user-1', area: 'Zone D' });

      const { result } = renderHook(() => useUpdateUser(), { wrapper });

      result.current.mutate({
        id: 'user-1',
        area: 'Zone D',
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockPatch).toHaveBeenCalledWith('/users/user-1', {
        area: 'Zone D',
      });
    });

    it('invalidates users query on success', async () => {
      mockPatch.mockResolvedValueOnce({ id: 'user-1' });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useUpdateUser(), { wrapper });

      result.current.mutate({ id: 'user-1', full_name: 'Test' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['users'] });
    });

    it('handles 404 error when user not found', async () => {
      const notFoundError = new Error('User not found');
      (notFoundError as Error & { statusCode: number }).statusCode = 404;
      mockPatch.mockRejectedValueOnce(notFoundError);

      const { result } = renderHook(() => useUpdateUser(), { wrapper });

      result.current.mutate({ id: 'invalid-user', full_name: 'Test' });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });

    it('handles 403 error for unauthorized role change', async () => {
      const forbiddenError = new Error('Cannot change super_admin role');
      (forbiddenError as Error & { statusCode: number }).statusCode = 403;
      mockPatch.mockRejectedValueOnce(forbiddenError);

      const { result } = renderHook(() => useUpdateUser(), { wrapper });

      result.current.mutate({ id: 'user-admin', role: 'field_officer' });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });

    it('handles slow mutation', async () => {
      mockPatch.mockImplementation(() => new Promise((resolve) => {
        setTimeout(() => resolve({ id: 'user-1' }), 100);
      }));

      const { result } = renderHook(() => useUpdateUser(), { wrapper });

      result.current.mutate({ id: 'user-1', full_name: 'Test' });

      

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });

    it('does not invalidate queries on error', async () => {
      mockPatch.mockRejectedValueOnce(new Error('Server Error'));

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useUpdateUser(), { wrapper });

      result.current.mutate({ id: 'user-1', full_name: 'Test' });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(invalidateSpy).not.toHaveBeenCalled();
    });
  });
});
