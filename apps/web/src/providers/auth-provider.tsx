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

/** Set access token as a cookie so Next.js middleware can read it for route gating. */
function setTokenCookie(token: string | null) {
  if (typeof document === 'undefined') return;
  // Only use Secure flag when on HTTPS to allow development over HTTP
  const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:';
  if (token) {
    document.cookie = `access_token=${token}; path=/; SameSite=Strict${isSecure ? '; Secure' : ''}`;
  } else {
    document.cookie = 'access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  }
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
      // Skip restore if we already have an access token (e.g., just logged in)
      if (getAccessToken()) {
        setState((prev) => ({ ...prev, isLoading: false }));
        return;
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
