import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient, setAccessToken, getAccessToken, ApiClientError } from '../api-client';

/**
 * API Client Tests
 *
 * Tests the apiClient for:
 * - HTTP methods (GET, POST, PATCH, PUT, DELETE)
 * - Headers (Content-Type, Authorization, x-request-id)
 * - Token management (set, get, clear)
 * - 401 handling with token refresh
 * - Response handling (200, 204, 4xx, 5xx)
 * - ApiClientError structure
 *
 * **Validates: API client HTTP methods and auth flow**
 */

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock crypto.randomUUID
vi.stubGlobal('crypto', {
  randomUUID: () => 'test-request-id-123',
});

describe('API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAccessToken(null);
  });

  afterEach(() => {
    setAccessToken(null);
  });

  describe('Token Management', () => {
    it('setAccessToken stores the token', () => {
      setAccessToken('test-token');
      expect(getAccessToken()).toBe('test-token');
    });

    it('getAccessToken returns null when not set', () => {
      expect(getAccessToken()).toBeNull();
    });

    it('setAccessToken clears token when passed null', () => {
      setAccessToken('test-token');
      setAccessToken(null);
      expect(getAccessToken()).toBeNull();
    });
  });

  describe('HTTP Methods', () => {
    it('GET request uses correct method', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: 'test' }),
      });

      await apiClient.get('/test');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/test'),
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('POST request uses correct method and body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 'new' }),
      });

      await apiClient.post('/test', { name: 'Test' });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.method).toBe('POST');
      expect(options.body).toBe(JSON.stringify({ name: 'Test' }));
    });

    it('PATCH request uses correct method', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ updated: true }),
      });

      await apiClient.patch('/test/1', { name: 'Updated' });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.method).toBe('PATCH');
      expect(options.body).toBe(JSON.stringify({ name: 'Updated' }));
    });

    it('PUT request uses correct method', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ replaced: true }),
      });

      await apiClient.put('/test/1', { name: 'Replaced' });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.method).toBe('PUT');
    });

    it('DELETE request uses correct method', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ deleted: true }),
      });

      await apiClient.delete('/test/1');

      const [, options] = mockFetch.mock.calls[0];
      expect(options.method).toBe('DELETE');
    });
  });

  describe('Headers', () => {
    it('sets Content-Type to application/json', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      await apiClient.get('/test');

      const [, options] = mockFetch.mock.calls[0];
      const headers = options.headers;
      expect(headers.get('Content-Type')).toBe('application/json');
    });

    it('sets Authorization header when token is set', async () => {
      setAccessToken('my-token');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      await apiClient.get('/test');

      const [, options] = mockFetch.mock.calls[0];
      const headers = options.headers;
      expect(headers.get('Authorization')).toBe('Bearer my-token');
    });

    it('does not set Authorization header when token is null', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      await apiClient.get('/test');

      const [, options] = mockFetch.mock.calls[0];
      const headers = options.headers;
      expect(headers.get('Authorization')).toBeNull();
    });

    it('sets x-request-id header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      await apiClient.get('/test');

      const [, options] = mockFetch.mock.calls[0];
      const headers = options.headers;
      expect(headers.get('x-request-id')).toBe('test-request-id-123');
    });

    it('includes credentials for cookies', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      await apiClient.get('/test');

      const [, options] = mockFetch.mock.calls[0];
      expect(options.credentials).toBe('include');
    });
  });

  describe('Response Handling', () => {
    it('parses JSON response for 200 status', async () => {
      const responseData = { id: '1', name: 'Test' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(responseData),
      });

      const result = await apiClient.get('/test');

      expect(result).toEqual(responseData);
    });

    it('returns undefined for 204 No Content', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      const result = await apiClient.delete('/test/1');

      expect(result).toBeUndefined();
    });

    it('throws ApiClientError for 400 Bad Request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () => Promise.resolve({ statusCode: 400, message: 'Validation failed' }),
      });

      await expect(apiClient.post('/test', {})).rejects.toThrow(ApiClientError);
    });

    it('ApiClientError contains statusCode and body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: () => Promise.resolve({ statusCode: 403, message: 'Access denied' }),
      });

      try {
        await apiClient.get('/test');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiClientError);
        const apiError = error as ApiClientError;
        expect(apiError.statusCode).toBe(403);
        expect(apiError.body.message).toBe('Access denied');
        expect(apiError.body.requestId).toBe('test-request-id-123');
      }
    });

    it('throws ApiClientError for 404 Not Found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: () => Promise.resolve({ statusCode: 404, message: 'Resource not found' }),
      });

      await expect(apiClient.get('/test/unknown')).rejects.toThrow(ApiClientError);
    });

    it('throws ApiClientError for 500 Server Error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({ statusCode: 500, message: 'Server error' }),
      });

      await expect(apiClient.get('/test')).rejects.toThrow(ApiClientError);
    });

    it('uses status text as message when JSON parse fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        json: () => Promise.reject(new Error('Invalid JSON')),
      });

      try {
        await apiClient.get('/test');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiClientError);
        const apiError = error as ApiClientError;
        expect(apiError.statusCode).toBe(502);
        expect(apiError.body.message).toBe('Bad Gateway');
      }
    });
  });

  describe('401 Token Refresh', () => {
    it('attempts token refresh on 401', async () => {
      // First call returns 401
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () => Promise.resolve({ statusCode: 401, message: 'Token expired' }),
      });

      // Refresh call succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ accessToken: 'new-token' }),
      });

      // Retry with new token succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: 'success' }),
      });

      const result = await apiClient.get('/protected');

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result).toEqual({ data: 'success' });
    });

    it('surfaces 401 when refresh fails', async () => {
      // First call returns 401
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () => Promise.resolve({ statusCode: 401, message: 'Token expired' }),
      });

      // Refresh call fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () => Promise.resolve({ statusCode: 401, message: 'Refresh failed' }),
      });

      await expect(apiClient.get('/protected')).rejects.toThrow(ApiClientError);
    });

    it('skipRefresh option prevents token refresh', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () => Promise.resolve({ statusCode: 401, message: 'Unauthorized' }),
      });

      await expect(
        apiClient.get('/test', { skipRefresh: true })
      ).rejects.toThrow(ApiClientError);

      // Only one call - no refresh attempt
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Custom Headers', () => {
    it('merges custom headers with defaults', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      await apiClient.post('/test', { data: 'test' }, {
        headers: { 'X-Idempotency-Key': 'unique-key' },
      });

      const [, options] = mockFetch.mock.calls[0];
      const headers = options.headers;
      expect(headers.get('X-Idempotency-Key')).toBe('unique-key');
      expect(headers.get('Content-Type')).toBe('application/json');
    });
  });

  describe('URL Construction', () => {
    it('prepends API base URL to path', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      await apiClient.get('/customers');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('/customers');
    });
  });
});
