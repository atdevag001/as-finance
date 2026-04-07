import React, { useEffect, useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth, type AuthUser } from '../auth-provider';

// Mock next/navigation
const mockPush = vi.fn();
const mockPathname = '/dashboard';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => mockPathname,
}));

// Mock api-client
const mockPost = vi.fn();
const mockSetAccessToken = vi.fn();
const mockGetAccessToken = vi.fn(() => null);
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    post: (...args: unknown[]) => mockPost(...args),
  },
  setAccessToken: (token: string | null) => mockSetAccessToken(token),
  getAccessToken: () => mockGetAccessToken(),
}));

// Mock toast provider
const mockShowToast = vi.fn();
vi.mock('../toast-provider', () => ({
  useToastSafe: () => ({ showToast: mockShowToast }),
}));

/**
 * AuthProvider Unit Tests
 *
 * Tests the AuthProvider for:
 * - Initial state (isLoading=true, user=null)
 * - Session restore via refresh token
 * - Login success/failure scenarios
 * - Logout flow
 * - useAuth hook error handling
 *
 * **Validates: Authentication state management and session handling**
 */

describe('AuthProvider', () => {
  const mockUser: AuthUser = {
    id: 'user-1',
    username: 'testuser',
    fullName: 'Test User',
    role: 'field_officer',
  };

  // Simple test component that displays auth state
  function TestDisplay() {
    const auth = useAuth();
    return (
      <div>
        <span data-testid="loading">{String(auth.isLoading)}</span>
        <span data-testid="authenticated">{String(auth.isAuthenticated)}</span>
        <span data-testid="username">{auth.user?.username ?? 'none'}</span>
      </div>
    );
  }

  // Test component with login/logout buttons
  function TestWithActions() {
    const auth = useAuth();
    const [error, setError] = useState<string | null>(null);

    const handleLogin = async () => {
      try {
        setError(null);
        await auth.login('testuser', 'password123');
      } catch (e) {
        setError((e as Error).message);
      }
    };

    return (
      <div>
        <span data-testid="loading">{String(auth.isLoading)}</span>
        <span data-testid="authenticated">{String(auth.isAuthenticated)}</span>
        <span data-testid="username">{auth.user?.username ?? 'none'}</span>
        <span data-testid="error">{error ?? ''}</span>
        <button data-testid="login-btn" onClick={handleLogin}>Login</button>
        <button data-testid="logout-btn" onClick={() => auth.logout()}>Logout</button>
      </div>
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAccessToken.mockReturnValue(null);
  });

  describe('Initial State', () => {
    it('starts with isLoading=true before restore completes', () => {
      // Make refresh hang
      mockPost.mockImplementation(() => new Promise(() => {}));

      render(
        <AuthProvider>
          <TestDisplay />
        </AuthProvider>
      );

      expect(screen.getByTestId('loading').textContent).toBe('true');
    });

    it('starts with user=null', () => {
      mockPost.mockImplementation(() => new Promise(() => {}));

      render(
        <AuthProvider>
          <TestDisplay />
        </AuthProvider>
      );

      expect(screen.getByTestId('username').textContent).toBe('none');
    });

    it('starts with isAuthenticated=false', () => {
      mockPost.mockImplementation(() => new Promise(() => {}));

      render(
        <AuthProvider>
          <TestDisplay />
        </AuthProvider>
      );

      expect(screen.getByTestId('authenticated').textContent).toBe('false');
    });
  });

  describe('Session Restore', () => {
    it('calls /auth/refresh on mount', async () => {
      mockPost.mockResolvedValueOnce({ accessToken: 'token-123', user: mockUser });

      render(
        <AuthProvider>
          <TestDisplay />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledWith('/auth/refresh', undefined, { skipRefresh: true });
      });
    });

    it('sets user and isAuthenticated on successful restore', async () => {
      mockPost.mockResolvedValueOnce({ accessToken: 'token-123', user: mockUser });

      render(
        <AuthProvider>
          <TestDisplay />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('authenticated').textContent).toBe('true');
      });
      expect(screen.getByTestId('username').textContent).toBe('testuser');
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    it('stores access token on successful restore', async () => {
      mockPost.mockResolvedValueOnce({ accessToken: 'stored-token', user: mockUser });

      render(
        <AuthProvider>
          <TestDisplay />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(mockSetAccessToken).toHaveBeenCalledWith('stored-token');
      });
    });

    it('sets isAuthenticated=false on restore failure', async () => {
      mockPost.mockRejectedValueOnce(new Error('Refresh failed'));

      render(
        <AuthProvider>
          <TestDisplay />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('false');
      });
      expect(screen.getByTestId('authenticated').textContent).toBe('false');
    });
  });

  describe('Login', () => {
    it('calls /auth/login with credentials', async () => {
      // Restore fails first
      mockPost.mockRejectedValueOnce(new Error('No session'));
      // Login succeeds
      mockPost.mockResolvedValueOnce({ accessToken: 'login-token', user: mockUser });

      render(
        <AuthProvider>
          <TestWithActions />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('false');
      });

      await act(async () => {
        screen.getByTestId('login-btn').click();
      });

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledWith(
          '/auth/login',
          { username: 'testuser', password: 'password123' },
          { skipRefresh: true }
        );
      });
    });

    it('sets user and isAuthenticated on successful login', async () => {
      mockPost.mockRejectedValueOnce(new Error('No session'));
      mockPost.mockResolvedValueOnce({ accessToken: 'login-token', user: mockUser });

      render(
        <AuthProvider>
          <TestWithActions />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('false');
      });

      await act(async () => {
        screen.getByTestId('login-btn').click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('authenticated').textContent).toBe('true');
      });
      expect(screen.getByTestId('username').textContent).toBe('testuser');
    });

    it('stores access token on successful login', async () => {
      mockPost.mockRejectedValueOnce(new Error('No session'));
      mockPost.mockResolvedValueOnce({ accessToken: 'new-token', user: mockUser });

      render(
        <AuthProvider>
          <TestWithActions />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('false');
      });

      await act(async () => {
        screen.getByTestId('login-btn').click();
      });

      await waitFor(() => {
        expect(mockSetAccessToken).toHaveBeenCalledWith('new-token');
      });
    });

    it('surfaces error on login failure', async () => {
      mockPost.mockRejectedValueOnce(new Error('No session'));
      mockPost.mockRejectedValueOnce(new Error('Invalid username or password'));

      render(
        <AuthProvider>
          <TestWithActions />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('false');
      });

      await act(async () => {
        screen.getByTestId('login-btn').click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('error').textContent).toBe('Invalid username or password');
      });
      expect(screen.getByTestId('authenticated').textContent).toBe('false');
    });
  });

  describe('Logout', () => {
    it('calls /auth/logout', async () => {
      mockPost.mockResolvedValueOnce({ accessToken: 'token-123', user: mockUser });
      mockPost.mockResolvedValueOnce({}); // logout

      render(
        <AuthProvider>
          <TestWithActions />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('authenticated').textContent).toBe('true');
      });

      await act(async () => {
        screen.getByTestId('logout-btn').click();
      });

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledWith('/auth/logout');
      });
    });

    it('clears user and isAuthenticated on logout', async () => {
      mockPost.mockResolvedValueOnce({ accessToken: 'token-123', user: mockUser });
      mockPost.mockResolvedValueOnce({});

      render(
        <AuthProvider>
          <TestWithActions />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('authenticated').textContent).toBe('true');
      });

      await act(async () => {
        screen.getByTestId('logout-btn').click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('authenticated').textContent).toBe('false');
      });
      expect(screen.getByTestId('username').textContent).toBe('none');
    });

    it('clears token on logout', async () => {
      mockPost.mockResolvedValueOnce({ accessToken: 'token-123', user: mockUser });
      mockPost.mockResolvedValueOnce({});

      render(
        <AuthProvider>
          <TestWithActions />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('authenticated').textContent).toBe('true');
      });

      await act(async () => {
        screen.getByTestId('logout-btn').click();
      });

      await waitFor(() => {
        expect(mockSetAccessToken).toHaveBeenCalledWith(null);
      });
    });

    it('still clears state even if logout API fails', async () => {
      mockPost.mockResolvedValueOnce({ accessToken: 'token-123', user: mockUser });
      mockPost.mockRejectedValueOnce(new Error('Network error'));

      render(
        <AuthProvider>
          <TestWithActions />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('authenticated').textContent).toBe('true');
      });

      await act(async () => {
        screen.getByTestId('logout-btn').click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('authenticated').textContent).toBe('false');
      });
      expect(mockSetAccessToken).toHaveBeenCalledWith(null);
    });
  });

  describe('useAuth hook', () => {
    it('throws error when used outside AuthProvider', () => {
      function BadComponent() {
        useAuth();
        return null;
      }

      // Suppress React error boundary output
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        render(<BadComponent />);
      }).toThrow('useAuth must be used within an AuthProvider');

      spy.mockRestore();
    });
  });

  describe('Auth Context Value', () => {
    it('provides login function', async () => {
      mockPost.mockRejectedValueOnce(new Error('No session'));

      function TestLoginFn() {
        const auth = useAuth();
        return <span data-testid="has-login">{typeof auth.login === 'function' ? 'yes' : 'no'}</span>;
      }

      render(
        <AuthProvider>
          <TestLoginFn />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('has-login').textContent).toBe('yes');
      });
    });

    it('provides logout function', async () => {
      mockPost.mockRejectedValueOnce(new Error('No session'));

      function TestLogoutFn() {
        const auth = useAuth();
        return <span data-testid="has-logout">{typeof auth.logout === 'function' ? 'yes' : 'no'}</span>;
      }

      render(
        <AuthProvider>
          <TestLogoutFn />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('has-logout').textContent).toBe('yes');
      });
    });
  });

  describe('User Data', () => {
    it('provides full user object on successful auth', async () => {
      const fullUser: AuthUser = {
        id: 'user-abc',
        username: 'admin',
        fullName: 'Admin User',
        role: 'super_admin',
      };
      mockPost.mockResolvedValueOnce({ accessToken: 'token', user: fullUser });

      function TestUserData() {
        const auth = useAuth();
        if (!auth.user) return <span data-testid="user">none</span>;
        return (
          <div>
            <span data-testid="user-id">{auth.user.id}</span>
            <span data-testid="user-username">{auth.user.username}</span>
            <span data-testid="user-fullname">{auth.user.fullName}</span>
            <span data-testid="user-role">{auth.user.role}</span>
          </div>
        );
      }

      render(
        <AuthProvider>
          <TestUserData />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('user-id').textContent).toBe('user-abc');
      });
      expect(screen.getByTestId('user-username').textContent).toBe('admin');
      expect(screen.getByTestId('user-fullname').textContent).toBe('Admin User');
      expect(screen.getByTestId('user-role').textContent).toBe('super_admin');
    });
  });
});
