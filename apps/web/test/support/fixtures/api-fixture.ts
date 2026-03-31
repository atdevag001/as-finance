import { test as base, type APIRequestContext } from '@playwright/test';

export type ApiFixture = {
  api: {
    get: (path: string, token?: string) => Promise<{ status: number; body: any }>;
    post: (path: string, data: unknown, token?: string) => Promise<{ status: number; body: any }>;
    patch: (path: string, data: unknown, token?: string) => Promise<{ status: number; body: any }>;
    delete: (path: string, token?: string) => Promise<{ status: number; body: any }>;
  };
};

const API_URL = process.env.API_URL || 'http://localhost:3001';

async function makeRequest(
  request: APIRequestContext,
  method: string,
  path: string,
  data?: unknown,
  token?: string,
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const url = `${API_URL}${path}`;
  const options: any = { headers };
  if (data) options.data = data;

  const response = await request.fetch(url, { method, ...options });
  let body: any;
  try {
    body = await response.json();
  } catch {
    body = await response.text();
  }
  return { status: response.status(), body };
}

export const test = base.extend<ApiFixture>({
  api: async ({ request }, use) => {
    await use({
      get: (path, token) => makeRequest(request, 'GET', path, undefined, token),
      post: (path, data, token) => makeRequest(request, 'POST', path, data, token),
      patch: (path, data, token) => makeRequest(request, 'PATCH', path, data, token),
      delete: (path, token) => makeRequest(request, 'DELETE', path, undefined, token),
    });
  },
});
