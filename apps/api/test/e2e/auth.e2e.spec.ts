import { describe, it, expect, beforeAll } from 'vitest';
import supertest from 'supertest';
import { getApiBaseUrl, getUserTokens, getSeedData } from '../helpers/seed.js';
import { createAuthClients, type AuthClients } from '../helpers/auth-client.js';
import { createDbUtils, type DbUtils } from '../helpers/db-utils.js';
import { createUser } from '../helpers/factories.js';

/**
 * Auth E2E Tests
 *
 * Verifies the complete authentication lifecycle: login, refresh token rotation,
 * logout, password change, account lockout, and JWT security against the live API.
 *
 * Validates: Design GAP 1 (Auth E2E); Property 35
 */

const TEST_PASSWORD = 'TestPass1';

describe('Auth E2E', () => {
  let apiBaseUrl: string;
  let clients: AuthClients;
  let dbUtils: DbUtils;

  beforeAll(() => {
    apiBaseUrl = getApiBaseUrl();
    const tokens = getUserTokens();
    clients = createAuthClients(apiBaseUrl, tokens);
    dbUtils = createDbUtils();
  });

  // ─── Successful Login ────────────────────────────────────────────────────

  describe('successful login', () => {
    it('should return access token, user profile, and set refresh token cookie', async () => {
      const seedData = getSeedData();
      const username = seedData.users.fieldOfficer.username;

      const res = await supertest(apiBaseUrl)
        .post('/auth/login')
        .send({ username, password: TEST_PASSWORD });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
      expect(typeof res.body.accessToken).toBe('string');
      expect(res.body.user).toBeDefined();
      expect(res.body.user.id).toBeDefined();
      expect(res.body.user.username).toBe(username);
      expect(res.body.user.role).toBe('field_officer');
      expect(res.body.user.fullName).toBeDefined();

      // Refresh token should be set as httpOnly cookie
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

  // ─── Invalid Credentials ──────────────────────────────────────────────────

  describe('invalid credentials', () => {
    it('should return 403 INVALID_CREDENTIALS for wrong password', async () => {
      const seedData = getSeedData();
      const username = seedData.users.fieldOfficer.username;

      const res = await supertest(apiBaseUrl)
        .post('/auth/login')
        .send({ username, password: 'WrongPassword123' });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    });

    it('should return 403 INVALID_CREDENTIALS for non-existent user', async () => {
      const res = await supertest(apiBaseUrl)
        .post('/auth/login')
        .send({ username: 'nonexistent_user_xyz', password: TEST_PASSWORD });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    });
  });

  // ─── Inactive User ──────────────────────────────────────────────────────

  describe('inactive user', () => {
    it('should return 403 for login with inactive user', async () => {
      const user = await createUser(clients.superAdmin, {
        username: `e2e_inactive_${Date.now()}`,
        password: TEST_PASSWORD,
        role: 'field_officer',
      });
      const userId = user['id'] as string;
      const username = user['_username'] as string;

      await dbUtils.prisma.users.update({
        where: { id: userId },
        data: { is_active: false },
      });

      const res = await supertest(apiBaseUrl)
        .post('/auth/login')
        .send({ username, password: TEST_PASSWORD });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');

      // Re-activate for cleanup
      await dbUtils.prisma.users.update({
        where: { id: userId },
        data: { is_active: true },
      });
    });
  });

  // ─── Account Lockout ─────────────────────────────────────────────────────

  describe('account lockout', () => {
    it('should lock account after 5 consecutive failed login attempts', async () => {
      const user = await createUser(clients.superAdmin, {
        username: `e2e_lockout_${Date.now()}`,
        password: TEST_PASSWORD,
        role: 'field_officer',
      });
      const userId = user['id'] as string;
      const username = user['_username'] as string;

      // Reset failed attempts to ensure clean state
      await dbUtils.prisma.users.update({
        where: { id: userId },
        data: { failed_login_attempts: 0, locked_until: null },
      });

      // Attempt 5 failed logins
      for (let i = 0; i < 5; i++) {
        await supertest(apiBaseUrl)
          .post('/auth/login')
          .send({ username, password: 'WrongPassword123' });
      }

      // Verify locked_until is set in DB
      const dbUser = await dbUtils.findUserById(userId);
      expect(dbUser).not.toBeNull();
      expect(dbUser!.failed_login_attempts).toBe(5);
      expect(dbUser!.locked_until).not.toBeNull();
      expect(new Date(dbUser!.locked_until!).getTime()).toBeGreaterThan(Date.now());
    });

    it('should reject login on locked account even with correct credentials', async () => {
      const user = await createUser(clients.superAdmin, {
        username: `e2e_locked_${Date.now()}`,
        password: TEST_PASSWORD,
        role: 'field_officer',
      });
      const userId = user['id'] as string;
      const username = user['_username'] as string;

      const lockUntil = new Date();
      lockUntil.setMinutes(lockUntil.getMinutes() + 15);
      await dbUtils.prisma.users.update({
        where: { id: userId },
        data: { failed_login_attempts: 5, locked_until: lockUntil },
      });

      const res = await supertest(apiBaseUrl)
        .post('/auth/login')
        .send({ username, password: TEST_PASSWORD });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('ACCOUNT_LOCKED');
    });

    it('should allow login after lockout expires', async () => {
      const user = await createUser(clients.superAdmin, {
        username: `e2e_expired_lock_${Date.now()}`,
        password: TEST_PASSWORD,
        role: 'field_officer',
      });
      const userId = user['id'] as string;
      const username = user['_username'] as string;

      const expiredLock = new Date();
      expiredLock.setMinutes(expiredLock.getMinutes() - 1);
      await dbUtils.prisma.users.update({
        where: { id: userId },
        data: { failed_login_attempts: 5, locked_until: expiredLock },
      });

      const res = await supertest(apiBaseUrl)
        .post('/auth/login')
        .send({ username, password: TEST_PASSWORD });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
    });
  });

  // ─── Refresh Token Rotation ───────────────────────────────────────────────

  describe('refresh token rotation', () => {
    it('should issue new access token and rotate refresh token', async () => {
      const user = await createUser(clients.superAdmin, {
        username: `e2e_refresh_${Date.now()}`,
        password: TEST_PASSWORD,
        role: 'field_officer',
      });
      const userId = user['id'] as string;
      const username = user['_username'] as string;

      const loginRes = await supertest(apiBaseUrl)
        .post('/auth/login')
        .send({ username, password: TEST_PASSWORD });
      expect(loginRes.status).toBe(200);

      const cookies = loginRes.headers['set-cookie'];
      const refreshCookie = Array.isArray(cookies)
        ? cookies.find((c: string) => c.startsWith('refresh_token='))
        : cookies;
      expect(refreshCookie).toBeDefined();

      const tokensBefore = await dbUtils.findRefreshTokensByUserId(userId);
      const activeTokensBefore = tokensBefore.filter((t) => !t.is_revoked);

      const refreshRes = await supertest(apiBaseUrl)
        .post('/auth/refresh')
        .set('Cookie', refreshCookie!)
        .send();

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.accessToken).toBeDefined();

      const tokensAfter = await dbUtils.findRefreshTokensByUserId(userId);
      const revokedTokens = tokensAfter.filter((t) => t.is_revoked);
      const activeTokensAfter = tokensAfter.filter((t) => !t.is_revoked);

      expect(revokedTokens.length).toBeGreaterThanOrEqual(activeTokensBefore.length);
      expect(activeTokensAfter.length).toBeGreaterThanOrEqual(1);
    });

    it('should reject refresh with revoked token', async () => {
      const user = await createUser(clients.superAdmin, {
        username: `e2e_revoked_refresh_${Date.now()}`,
        password: TEST_PASSWORD,
        role: 'field_officer',
      });
      const username = user['_username'] as string;

      const loginRes = await supertest(apiBaseUrl)
        .post('/auth/login')
        .send({ username, password: TEST_PASSWORD });
      expect(loginRes.status).toBe(200);

      const cookies = loginRes.headers['set-cookie'];
      const refreshCookie = Array.isArray(cookies)
        ? cookies.find((c: string) => c.startsWith('refresh_token='))
        : cookies;

      // Use the refresh token once (revokes the old one)
      const firstRefresh = await supertest(apiBaseUrl)
        .post('/auth/refresh')
        .set('Cookie', refreshCookie!)
        .send();
      expect(firstRefresh.status).toBe(200);

      // Try to use the same (now revoked) refresh token again
      const secondRefresh = await supertest(apiBaseUrl)
        .post('/auth/refresh')
        .set('Cookie', refreshCookie!)
        .send();

      expect(secondRefresh.status).toBe(403);
      expect(secondRefresh.body.code).toMatch(
        /INVALID_REFRESH_TOKEN|MISSING_REFRESH_TOKEN/,
      );
    });

    it('should reject refresh with no cookie', async () => {
      const res = await supertest(apiBaseUrl).post('/auth/refresh').send();

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('MISSING_REFRESH_TOKEN');
    });
  });

  // ─── Logout ──────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('should revoke all refresh tokens for the user', async () => {
      const user = await createUser(clients.superAdmin, {
        username: `e2e_logout_${Date.now()}`,
        password: TEST_PASSWORD,
        role: 'field_officer',
      });
      const userId = user['id'] as string;
      const username = user['_username'] as string;

      const loginRes = await supertest(apiBaseUrl)
        .post('/auth/login')
        .send({ username, password: TEST_PASSWORD });
      expect(loginRes.status).toBe(200);
      const accessToken = loginRes.body.accessToken;

      const tokensBefore = await dbUtils.findRefreshTokensByUserId(userId);
      const activeBefore = tokensBefore.filter((t) => !t.is_revoked);
      expect(activeBefore.length).toBeGreaterThanOrEqual(1);

      const logoutRes = await supertest(apiBaseUrl)
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send();
      expect(logoutRes.status).toBe(200);

      const tokensAfter = await dbUtils.findRefreshTokensByUserId(userId);
      const activeAfter = tokensAfter.filter((t) => !t.is_revoked);
      expect(activeAfter.length).toBe(0);
    });
  });

  // ─── Password Change ──────────────────────────────────────────────────────

  describe('password change', () => {
    it('should invalidate all sessions after password change', async () => {
      const user = await createUser(clients.superAdmin, {
        username: `e2e_pwchange_${Date.now()}`,
        password: TEST_PASSWORD,
        role: 'field_officer',
      });
      const userId = user['id'] as string;
      const username = user['_username'] as string;

      const loginRes = await supertest(apiBaseUrl)
        .post('/auth/login')
        .send({ username, password: TEST_PASSWORD });
      expect(loginRes.status).toBe(200);
      const accessToken = loginRes.body.accessToken;

      const tokensBefore = await dbUtils.findRefreshTokensByUserId(userId);
      const activeBefore = tokensBefore.filter((t) => !t.is_revoked);
      expect(activeBefore.length).toBeGreaterThanOrEqual(1);

      const newPassword = 'NewTestPass1';
      const changeRes = await supertest(apiBaseUrl)
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: TEST_PASSWORD, newPassword });
      expect(changeRes.status).toBe(200);

      // Verify all refresh tokens are revoked in DB
      const tokensAfter = await dbUtils.findRefreshTokensByUserId(userId);
      const activeAfter = tokensAfter.filter((t) => !t.is_revoked);
      expect(activeAfter.length).toBe(0);

      // Verify login works with new password
      const newLoginRes = await supertest(apiBaseUrl)
        .post('/auth/login')
        .send({ username, password: newPassword });
      expect(newLoginRes.status).toBe(200);

      // Verify old password no longer works
      const oldLoginRes = await supertest(apiBaseUrl)
        .post('/auth/login')
        .send({ username, password: TEST_PASSWORD });
      expect(oldLoginRes.status).toBe(403);
    });

    it('should reject password change with incorrect current password', async () => {
      const seedData = getSeedData();
      const username = seedData.users.officeStaff.username;

      const loginRes = await supertest(apiBaseUrl)
        .post('/auth/login')
        .send({ username, password: TEST_PASSWORD });
      expect(loginRes.status).toBe(200);
      const accessToken = loginRes.body.accessToken;

      const res = await supertest(apiBaseUrl)
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: 'WrongCurrent123', newPassword: 'NewPass123' });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('INVALID_CURRENT_PASSWORD');
    });
  });

  // ─── JWT Security ─────────────────────────────────────────────────────────

  describe('JWT security', () => {
    it('should return 401 for tampered JWT', async () => {
      const res = await clients.tampered.get('/customers').send();
      expect(res.status).toBe(401);
    });

    it('should return 401 for expired JWT', async () => {
      const res = await clients.expired.get('/customers').send();
      expect(res.status).toBe(401);
    });

    it('should return 401 for missing JWT on protected endpoint', async () => {
      const res = await clients.unauthenticated.get('/customers').send();
      expect(res.status).toBe(401);
    });

    it('should return 401 for malformed authorization header', async () => {
      const res = await supertest(apiBaseUrl)
        .get('/customers')
        .set('Authorization', 'NotBearer some-token')
        .send();
      expect(res.status).toBe(401);
    });
  });
});
