import { describe, it, expect, beforeAll } from 'vitest';
import supertest from 'supertest';
import { getApiBaseUrl, getUserTokens, getSeedData } from '../helpers/seed.js';
import { createAuthClients, type AuthClients } from '../helpers/auth-client.js';

/**
 * Auth API Contract Tests
 *
 * Verifies request/response shapes, validation errors (400), and auth errors (401)
 * for all auth endpoints: POST /auth/login, POST /auth/refresh,
 * POST /auth/logout, POST /auth/change-password.
 *
 * Contract tests focus on verifying the API surface: correct status codes,
 * response field names/types, and error handling behavior.
 *
 * Validates: Requirements 40.1, 40.18, 40.19
 */

const TEST_PASSWORD = 'TestPass1';

/** Helper to wait for rate limit window to reset */
const waitForRateLimit = (ms = 2000) => new Promise((r) => setTimeout(r, ms));

describe('Auth Contract Tests', () => {
  let apiBaseUrl: string;
  let clients: AuthClients;

  beforeAll(async () => {
    apiBaseUrl = getApiBaseUrl();
    const tokens = getUserTokens();
    clients = createAuthClients(apiBaseUrl, tokens);
    // Allow rate limit window from global setup to partially reset
    await waitForRateLimit(3000);
  });

  // ─── POST /auth/login — Response Shape ───────────────────────────────────

  describe('POST /auth/login', () => {
    describe('response shape', () => {
      it('should return accessToken (string) and user object on success', async () => {
        const seedData = getSeedData();
        const username = seedData.users.manager.username;

        const res = await supertest(apiBaseUrl)
          .post('/auth/login')
          .send({ username, password: TEST_PASSWORD });

        expect(res.status).toBe(200);

        // Access token
        expect(res.body).toHaveProperty('accessToken');
        expect(typeof res.body.accessToken).toBe('string');
        expect(res.body.accessToken.length).toBeGreaterThan(0);

        // User object shape
        expect(res.body).toHaveProperty('user');
        expect(typeof res.body.user.id).toBe('string');
        expect(typeof res.body.user.username).toBe('string');
        expect(typeof res.body.user.fullName).toBe('string');
        expect(typeof res.body.user.role).toBe('string');

        // Should NOT expose refreshToken in body (it's in httpOnly cookie)
        expect(res.body).not.toHaveProperty('refreshToken');
      });

      it('should set refresh_token as httpOnly cookie', async () => {
        const seedData = getSeedData();
        const username = seedData.users.collectionOfficer.username;

        const res = await supertest(apiBaseUrl)
          .post('/auth/login')
          .send({ username, password: TEST_PASSWORD });

        expect(res.status).toBe(200);
        const cookies = res.headers['set-cookie'];
        expect(cookies).toBeDefined();
        const refreshCookie = Array.isArray(cookies)
          ? cookies.find((c: string) => c.startsWith('refresh_token='))
          : typeof cookies === 'string' && cookies.startsWith('refresh_token=')
            ? cookies
            : undefined;
        expect(refreshCookie).toBeDefined();
        expect(refreshCookie).toContain('HttpOnly');
      });
    });

    describe('validation errors (400)', () => {
      it('should return 400 when username is missing', async () => {
        const res = await supertest(apiBaseUrl)
          .post('/auth/login')
          .send({ password: TEST_PASSWORD });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when password is missing', async () => {
        const res = await supertest(apiBaseUrl)
          .post('/auth/login')
          .send({ username: 'some_user' });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when body is empty', async () => {
        const res = await supertest(apiBaseUrl)
          .post('/auth/login')
          .send({});

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when username is empty string', async () => {
        const res = await supertest(apiBaseUrl)
          .post('/auth/login')
          .send({ username: '', password: TEST_PASSWORD });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when password is empty string', async () => {
        const res = await supertest(apiBaseUrl)
          .post('/auth/login')
          .send({ username: 'some_user', password: '' });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });
    });

    describe('auth errors', () => {
      it('should return 403 for invalid credentials with structured error', async () => {
        const res = await supertest(apiBaseUrl)
          .post('/auth/login')
          .send({ username: 'nonexistent_contract_user', password: 'WrongPass1' });

        expect(res.status).toBe(403);
        expect(res.body).toHaveProperty('statusCode', 403);
        expect(res.body).toHaveProperty('message');
        expect(typeof res.body.message).toBe('string');
      });
    });
  });

  // ─── POST /auth/refresh ──────────────────────────────────────────────────

  describe('POST /auth/refresh', () => {
    describe('response shape', () => {
      it('should return accessToken (string) and rotate refresh cookie on success', async () => {
        const seedData = getSeedData();
        const username = seedData.users.accountant.username;

        // Login to get a refresh token cookie
        const loginRes = await supertest(apiBaseUrl)
          .post('/auth/login')
          .send({ username, password: TEST_PASSWORD });
        expect(loginRes.status).toBe(200);

        const cookies = loginRes.headers['set-cookie'];
        const refreshCookie = Array.isArray(cookies)
          ? cookies.find((c: string) => c.startsWith('refresh_token='))
          : cookies;
        expect(refreshCookie).toBeDefined();

        const res = await supertest(apiBaseUrl)
          .post('/auth/refresh')
          .set('Cookie', refreshCookie!)
          .send();

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('accessToken');
        expect(typeof res.body.accessToken).toBe('string');
        expect(res.body.accessToken.length).toBeGreaterThan(0);

        // Should set a new rotated refresh token cookie
        const newCookies = res.headers['set-cookie'];
        expect(newCookies).toBeDefined();
        const newRefreshCookie = Array.isArray(newCookies)
          ? newCookies.find((c: string) => c.startsWith('refresh_token='))
          : typeof newCookies === 'string' && newCookies.startsWith('refresh_token=')
            ? newCookies
            : undefined;
        expect(newRefreshCookie).toBeDefined();
      });
    });

    describe('auth errors', () => {
      it('should return 403 when no refresh token cookie is provided', async () => {
        const res = await supertest(apiBaseUrl)
          .post('/auth/refresh')
          .send();

        expect(res.status).toBe(403);
        expect(res.body).toHaveProperty('statusCode', 403);
        expect(res.body).toHaveProperty('message');
        expect(typeof res.body.message).toBe('string');
      });

      it('should return 403 when refresh token is invalid', async () => {
        const res = await supertest(apiBaseUrl)
          .post('/auth/refresh')
          .set('Cookie', 'refresh_token=invalid-token-value')
          .send();

        expect(res.status).toBe(403);
        expect(res.body).toHaveProperty('statusCode', 403);
        expect(res.body).toHaveProperty('message');
      });
    });
  });

  // ─── POST /auth/logout ───────────────────────────────────────────────────

  describe('POST /auth/logout', () => {
    describe('response shape', () => {
      it('should return success message on authenticated logout', async () => {
        const seedData = getSeedData();
        const username = seedData.users.officeStaff.username;

        // Login to get a valid access token
        const loginRes = await supertest(apiBaseUrl)
          .post('/auth/login')
          .send({ username, password: TEST_PASSWORD });
        expect(loginRes.status).toBe(200);
        const accessToken = loginRes.body.accessToken;

        const res = await supertest(apiBaseUrl)
          .post('/auth/logout')
          .set('Authorization', `Bearer ${accessToken}`)
          .send();

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('message');
        expect(typeof res.body.message).toBe('string');
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const res = await supertest(apiBaseUrl)
          .post('/auth/logout')
          .send();

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 401 when token is expired', async () => {
        const res = await clients.expired
          .post('/auth/logout')
          .send();

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });

      it('should return 401 when token is tampered', async () => {
        const res = await clients.tampered
          .post('/auth/logout')
          .send();

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });
  });
