'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { apiClient, setAccessToken } from '@/lib/api-client';

/** Set access token as a cookie so Next.js middleware can read it for route gating. */
function setTokenCookie(token: string | null) {
  if (typeof document === 'undefined') return;
  if (token) {
    document.cookie = `access_token=${token}; path=/; SameSite=Strict; Secure`;
  } else {
    document.cookie = 'access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
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
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  });

  // Attempt to restore session on mount via refresh token
  useEffect(() => {
    let cancelled = false;
    async function restore() {
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
          setTokenCookie(null);
          setState({ user: null, isLoading: false, isAuthenticated: false });
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
