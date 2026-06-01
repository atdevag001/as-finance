'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { apiClient, setAccessToken, getAccessToken } from '@/lib/api-client';
import { useToastSafe } from './toast-provider';

/**
 * SECURITY: We no longer write access_token to document.cookie. The API sets
 * it as HttpOnly+Secure+SameSite=Strict on /auth/login and /auth/refresh; the
 * browser auto-sends it via `credentials: 'include'`. Next.js middleware reads
 * the HttpOnly cookie server-side from the request — JS does not need access.
 *
 * Removing the JS write closes XSS exfiltration. The previous setTokenCookie()
 * is removed; callers below now no-op the cookie management.
 */
function setTokenCookie(_token: string | null) {
  // intentionally empty — HttpOnly cookie is managed by the API
}

/** Parse JWT and get expiry timestamp (in ms) */
function getJwtExpiry(token: string): number | null {
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const decoded = JSON.parse(atob(payload));
    return decoded.exp ? decoded.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** Decode JWT payload to extract user info */
function decodeJwt(token: string): { sub: string; role: string; exp: number } | null {
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  role: string;
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const toastContext = useToastSafe();
  const showToast = toastContext?.showToast;

  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  });

  const expiryWarningShown = useRef(false);
  const refreshAttempted = useRef(false);

  // Session timeout warning check
  useEffect(() => {
    if (!state.isAuthenticated) {
      expiryWarningShown.current = false;
      refreshAttempted.current = false;
      return;
    }

    const checkExpiry = async () => {
      const token = getAccessToken();
      if (!token) return;

      const expiry = getJwtExpiry(token);
      if (!expiry) return;

      const now = Date.now();
      const timeRemaining = expiry - now;
      const twoMinutes = 2 * 60 * 1000;

      // If less than 2 minutes remaining and we haven't shown warning yet
      if (timeRemaining <= twoMinutes && timeRemaining > 0 && !expiryWarningShown.current) {
        expiryWarningShown.current = true;

        // Show warning toast
        if (showToast) {
          showToast({
            message: 'Your session will expire soon. Please save your work.',
            variant: 'warning',
          });
        }

        // Attempt silent refresh
        if (!refreshAttempted.current) {
          refreshAttempted.current = true;
          try {
            const data = await apiClient.post<{ accessToken: string; user: AuthUser }>(
              '/auth/refresh',
              undefined,
              { skipRefresh: true },
            );
            setAccessToken(data.accessToken);
            setTokenCookie(data.accessToken);
            setState({ user: data.user, isLoading: false, isAuthenticated: true });
            expiryWarningShown.current = false;
            refreshAttempted.current = false;
            // Dismiss warning on success - toast auto-dismisses
          } catch {
            // Refresh failed, redirect to login
            setAccessToken(null);
            setTokenCookie(null);
            setState({ user: null, isLoading: false, isAuthenticated: false });
            router.push(`/login?redirect=${encodeURIComponent(pathname || '/')}`);
          }
        }
      }

      // If already expired
      if (timeRemaining <= 0) {
        setAccessToken(null);
        setTokenCookie(null);
        setState({ user: null, isLoading: false, isAuthenticated: false });
        router.push(`/login?redirect=${encodeURIComponent(pathname || '/')}`);
      }
    };

    // Check every 30 seconds
    const interval = setInterval(checkExpiry, 30000);
    // Also check immediately
    checkExpiry();

    return () => clearInterval(interval);
  }, [state.isAuthenticated, showToast, router, pathname]);

  // Attempt to restore session on mount via refresh token
  useEffect(() => {
    let cancelled = false;
    async function restore() {
      // Skip restore if we already have an access token (e.g., just logged in or from cookie)
      const existingToken = getAccessToken();
      if (existingToken) {
        // Token exists - decode it to get user info and mark as authenticated
        const payload = decodeJwt(existingToken);
        if (payload && payload.exp * 1000 > Date.now()) {
          // Token is valid and not expired - ensure it's set in memory for API calls
          setAccessToken(existingToken);
          // Create minimal user from JWT
          const minimalUser: AuthUser = {
            id: payload.sub,
            username: '', // Not in JWT, will be filled on next refresh
            fullName: '', // Not in JWT, will be filled on next refresh
            role: payload.role,
          };
          setState({ user: minimalUser, isLoading: false, isAuthenticated: true });
          return;
        }
        // Token expired, fall through to refresh
      }
      try {
        const data = await apiClient.post<{ accessToken: string; user: AuthUser }>(
          '/auth/refresh',
          undefined,
          { skipRefresh: true },
        );
        if (!cancelled) {
          setAccessToken(data.accessToken);
          setTokenCookie(data.accessToken);
          setState({ user: data.user, isLoading: false, isAuthenticated: true });
        }
      } catch {
        if (!cancelled) {
          // Only clear auth if we don't have an active token
          // (prevents race condition with concurrent login)
          if (!getAccessToken()) {
            setTokenCookie(null);
            setState({ user: null, isLoading: false, isAuthenticated: false });
          } else {
            setState((prev) => ({ ...prev, isLoading: false }));
          }
        }
      }
    }
    void restore();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const data = await apiClient.post<{ accessToken: string; user: AuthUser }>(
      '/auth/login',
      { username, password },
      { skipRefresh: true },
    );
    setAccessToken(data.accessToken);
    setTokenCookie(data.accessToken);
    setState({ user: data.user, isLoading: false, isAuthenticated: true });
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // Logout best-effort
    } finally {
      setAccessToken(null);
      setTokenCookie(null);
      setState({ user: null, isLoading: false, isAuthenticated: false });
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, logout }),
    [state, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
