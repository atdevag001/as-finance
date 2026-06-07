/**
 * Typed API client with JWT auth header injection, refresh token handling,
 * and request_id propagation.
 */

// API URL for the backend server
// Uses NEXT_PUBLIC_API_URL env var, falling back to localhost for development
const API_BASE_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';

let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

/**
 * SECURITY: We no longer read access_token from document.cookie. The token
 * is stored ONLY in an HttpOnly cookie (set by the API) and an optional
 * in-memory copy held in this module (set by AuthProvider after /auth/login
 * + /auth/refresh). The browser auto-sends the HttpOnly cookie via
 * `credentials: 'include'` — the in-memory copy is only used for the
 * Authorization: Bearer header during the transitional period.
 */
export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/**
 * Read csrf_token cookie. Set by the API on safe (GET) responses via CsrfGuard.
 * Backend rejects state-changing requests without a matching x-csrf-token header,
 * so we attach it on every non-GET below.
 */
function readCsrfCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]!) : null;
}

/**
 * Determine if the HTTP method requires a CSRF token (i.e. is state-changing).
 */
function methodNeedsCsrf(method: string | undefined): boolean {
  const m = (method ?? 'GET').toUpperCase();
  return m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS';
}

function generateRequestId(): string {
  // Use crypto.randomUUID if available (requires secure context),
  // otherwise fall back to a random string
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for insecure contexts (HTTP)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
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
  /**
   * Domain-specific error code from the API's GlobalExceptionFilter.
   * Examples: 'INVALID_CREDENTIALS', 'ACCOUNT_LOCKED', 'PASSWORD_REUSE',
   * 'SCOPE_VIOLATION', 'REFRESH_TOKEN_REPLAY', 'CONFLICT_OPTIMISTIC_LOCK',
   * 'ALREADY_DISBURSED', 'PERIOD_CLOSED', 'COLLECTIONS_EXIST', etc.
   * Use this for branching UI messages instead of statusCode alone.
   */
  code?: string;
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

  // Use getAccessToken() to read from cookie if in-memory token is null
  const token = getAccessToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Double-submit-cookie CSRF: echo csrf_token cookie value in header for
  // mutating requests. Backend CsrfGuard rejects mismatches with 403.
  if (methodNeedsCsrf(init.method)) {
    const csrf = readCsrfCookie();
    if (csrf) headers.set('x-csrf-token', csrf);
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

/**
 * POST multipart/form-data to the API.
 *
 * Mirrors `request()` semantics (credentials, auth refresh on 401,
 * x-request-id, ApiClientError on non-2xx) but does NOT set Content-Type —
 * the browser sets it (including the multipart boundary) automatically when
 * the body is a FormData instance.
 */
async function postFormData<T>(
  path: string,
  formData: FormData,
  skipRefresh = false,
): Promise<T> {
  const requestId = generateRequestId();
  const headers = new Headers();
  headers.set('x-request-id', requestId);

  const token = getAccessToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // POST is always state-changing, attach CSRF if cookie is present.
  const csrf = readCsrfCookie();
  if (csrf) headers.set('x-csrf-token', csrf);

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: formData,
  });

  // Handle 401 — attempt token refresh once
  if (res.status === 401 && !skipRefresh) {
    const newToken = await ensureValidToken();
    if (newToken) {
      return postFormData<T>(path, formData, true);
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

/**
 * Fetch a binary file (blob) from the API.
 * Used for file downloads (PDF, Excel, etc.)
 */
async function fetchBlob(path: string, skipRefresh = false): Promise<Blob> {
  const requestId = generateRequestId();
  const headers = new Headers();
  headers.set('x-request-id', requestId);

  const token = getAccessToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'GET',
    headers,
    credentials: 'include',
  });

  // Mirror request()/postFormData(): silently refresh expired token so document
  // View doesn't surface a 401 as a misleading "permission denied" to the user.
  if (res.status === 401 && !skipRefresh) {
    const newToken = await ensureValidToken();
    if (newToken) {
      return fetchBlob(path, true);
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

  return res.blob();
}

export const apiClient = {
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'GET' }),

  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body }),

  /**
   * POST multipart/form-data. Do not set Content-Type yourself —
   * the browser will set the correct multipart boundary.
   */
  postFormData: <T>(path: string, formData: FormData) =>
    postFormData<T>(path, formData),

  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PATCH', body }),

  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PUT', body }),

  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'DELETE' }),

  /** Fetch a binary file (blob) for downloads */
  getBlob: (path: string) => fetchBlob(path),
};
