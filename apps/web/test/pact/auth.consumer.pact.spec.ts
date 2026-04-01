/**
 * Pact Consumer Contract — Auth Interactions
 *
 * Defines expected API interactions for authentication:
 * - POST /auth/login (success with credentials)
 * - POST /auth/refresh (success with refresh token)
 *
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4
 */
import { describe, it, expect } from 'vitest';
import { createPact, MatchersV3 } from './setup';

describe('Auth Consumer Pact', () => {
  const pact = createPact();

  describe('POST /auth/login', () => {
    it('returns accessToken and user on valid credentials', async () => {
      pact.addInteraction({
        states: [{ description: 'a user with username "manager1" exists' }],
        uponReceiving: 'a login request with valid credentials',
        withRequest: {
          method: 'POST',
          path: '/auth/login',
          headers: { 'Content-Type': 'application/json' },
          body: {
            username: 'manager1',
            password: 'TestPass1',
          },
        },
        willRespondWith: {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: {
            accessToken: MatchersV3.like('eyJhbGciOiJIUzI1NiJ9.token'),
            user: {
              id: MatchersV3.like('user-uuid'),
              username: MatchersV3.like('manager1'),
              fullName: MatchersV3.like('Manager One'),
              role: MatchersV3.like('manager'),
            },
          },
        },
      });

      await pact.executeTest(async (mockServer) => {
        const res = await fetch(`${mockServer.url}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: 'manager1', password: 'TestPass1' }),
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toHaveProperty('accessToken');
        expect(body.user).toHaveProperty('id');
        expect(body.user).toHaveProperty('username');
        expect(body.user).toHaveProperty('fullName');
        expect(body.user).toHaveProperty('role');
      });
    });
  });

  describe('POST /auth/refresh', () => {
    it('returns new accessToken on valid refresh token', async () => {
      pact.addInteraction({
        states: [{ description: 'a valid refresh token exists' }],
        uponReceiving: 'a token refresh request with valid refresh token',
        withRequest: {
          method: 'POST',
          path: '/auth/refresh',
          headers: { 'Content-Type': 'application/json' },
          body: {
            refreshToken: 'valid-refresh-token',
          },
        },
        willRespondWith: {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: {
            accessToken: MatchersV3.like('eyJhbGciOiJIUzI1NiJ9.new-token'),
          },
        },
      });

      await pact.executeTest(async (mockServer) => {
        const res = await fetch(`${mockServer.url}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: 'valid-refresh-token' }),
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toHaveProperty('accessToken');
        expect(typeof body.accessToken).toBe('string');
      });
    });
  });
});
