/**
 * Typed API client with JWT auth header injection, refresh token handling,
 * and request_id propagation.
 */

const API_BASE_URL =
  (typeof process !== 'undefined' ? process.env['NEXT_PUBLIC_API_URL'] : undefined) ??
  'http://localhost:3001';

let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

function generateRequestId(): string {
  return crypto.randomUUID();
}

async function refreshAccessToken(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include', // sends httpOnly refresh token cookie
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      accessToken = null;
      return null;
    }
    const data = (await res.json()) as { accessToken: string };
    accessToken = data.accessToken;
    return accessToken;
  } catch {
    accessToken = null;
    return null;
  }
}

/**
 * Ensures only one refresh request is in-flight at a time.
 */
async function ensureValidToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export interface ApiError {
  statusCode: number;
  message: string;
  error?: string;
  requestId?: string;
}

export class ApiClientError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly body: ApiError,
  ) {
    super(body.message);
    this.name = 'ApiClientError';
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Skip automatic token refresh on 401 */
  skipRefresh?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, skipRefresh, ...init } = options;
  const requestId = generateRequestId();

  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('x-request-id', requestId);

  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // Handle 401 — attempt token refresh once
  if (res.status === 401 && !skipRefresh) {
    const newToken = await ensureValidToken();
    if (newToken) {
      return request<T>(path, { ...options, skipRefresh: true });
    }
    // Refresh failed — surface the 401
  }

  if (!res.ok) {
    const errorBody = (await res.json().catch(() => ({
      statusCode: res.status,
      message: res.statusText,
    }))) as ApiError;
    throw new ApiClientError(res.status, { ...errorBody, requestId });
  }

  // 204 No Content
  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

export const apiClient = {
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'GET' }),

  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body }),

  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PATCH', body }),

  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PUT', body }),

  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'DELETE' }),
};
