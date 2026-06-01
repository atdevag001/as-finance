import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import { JwtAuthGuard } from '../jwt-auth.guard';

const TEST_SECRET = 'test-jwt-secret-for-unit-tests';
const ISS = 'as-finance-api';
const AUD = 'as-finance-web';

/** Sign a JWT matching the production claims set (iss/aud/HS256). */
function signTestJwt(payload: Record<string, unknown>, opts: jwt.SignOptions = {}): string {
  return jwt.sign(payload, TEST_SECRET, {
    algorithm: 'HS256',
    issuer: ISS,
    audience: AUD,
    expiresIn: '15m',
    ...opts,
  });
}

function createMockContext(
  headers: Record<string, string> = {},
  handlerMeta: Record<string, unknown> = {},
  cookies: Record<string, string> = {},
) {
  const request = { headers, cookies };
  const reflector = new Reflector();
  vi.spyOn(reflector, 'getAllAndOverride').mockImplementation(((key: string) => {
    return handlerMeta[key] ?? undefined;
  }) as any);
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  };
  return { context, request, reflector };
}

function makePrismaMock(user: { role: string; is_active: boolean; token_version: number } | null) {
  return {
    users: {
      findUnique: vi.fn().mockResolvedValue(user),
    },
  } as any;
}

const DEFAULT_USER = { role: 'manager', is_active: true, token_version: 1 };

describe('JwtAuthGuard', () => {
  const originalEnv = process.env['JWT_SECRET'];
  beforeEach(() => {
    process.env['JWT_SECRET'] = TEST_SECRET;
  });
  afterEach(() => {
    if (originalEnv !== undefined) process.env['JWT_SECRET'] = originalEnv;
    else delete process.env['JWT_SECRET'];
  });

  it('allows public endpoints without a token', async () => {
    const { context, reflector } = createMockContext({}, { isPublic: true });
    const guard = new JwtAuthGuard(reflector, makePrismaMock(null));
    expect(await guard.canActivate(context as any)).toBe(true);
  });

  it('rejects requests with no Authorization header', async () => {
    const { context, reflector } = createMockContext();
    const guard = new JwtAuthGuard(reflector, makePrismaMock(DEFAULT_USER));
    await expect(guard.canActivate(context as any)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects malformed Authorization header (Basic scheme)', async () => {
    const { context, reflector } = createMockContext({ authorization: 'Basic abc' });
    const guard = new JwtAuthGuard(reflector, makePrismaMock(DEFAULT_USER));
    await expect(guard.canActivate(context as any)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects Bearer keyword but no token value', async () => {
    const { context, reflector } = createMockContext({ authorization: 'Bearer ' });
    const guard = new JwtAuthGuard(reflector, makePrismaMock(DEFAULT_USER));
    await expect(guard.canActivate(context as any)).rejects.toThrow(UnauthorizedException);
  });

  it('accepts a valid token and attaches user to request', async () => {
    const token = signTestJwt({ sub: 'user-1', role: 'manager', tv: 1 });
    const { context, request, reflector } = createMockContext({ authorization: 'Bearer ' + token });
    const guard = new JwtAuthGuard(reflector, makePrismaMock(DEFAULT_USER));
    expect(await guard.canActivate(context as any)).toBe(true);
    expect((request as any).user).toMatchObject({ sub: 'user-1', role: 'manager' });
  });

  it('rejects an expired token', async () => {
    const token = signTestJwt({ sub: 'user-1', role: 'manager' }, { expiresIn: '-1s' });
    const { context, reflector } = createMockContext({ authorization: 'Bearer ' + token });
    const guard = new JwtAuthGuard(reflector, makePrismaMock(DEFAULT_USER));
    await expect(guard.canActivate(context as any)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a token signed with wrong secret', async () => {
    const token = jwt.sign({ sub: 'user-1', role: 'manager' }, 'wrong-secret', {
      algorithm: 'HS256',
      issuer: ISS,
      audience: AUD,
      expiresIn: '15m',
    });
    const { context, reflector } = createMockContext({ authorization: 'Bearer ' + token });
    const guard = new JwtAuthGuard(reflector, makePrismaMock(DEFAULT_USER));
    await expect(guard.canActivate(context as any)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a completely corrupted token string', async () => {
    const { context, reflector } = createMockContext({ authorization: 'Bearer invalid.token.here' });
    const guard = new JwtAuthGuard(reflector, makePrismaMock(DEFAULT_USER));
    await expect(guard.canActivate(context as any)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects token with tampered payload (signature mismatch)', async () => {
    const token = signTestJwt({ sub: 'user-1', role: 'manager' });
    const parts = token.split('.');
    const decoded = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString());
    decoded.role = 'super_admin';
    parts[1] = Buffer.from(JSON.stringify(decoded)).toString('base64url');
    const { context, reflector } = createMockContext({ authorization: 'Bearer ' + parts.join('.') });
    const guard = new JwtAuthGuard(reflector, makePrismaMock(DEFAULT_USER));
    await expect(guard.canActivate(context as any)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects when JWT_SECRET is not configured', async () => {
    delete process.env['JWT_SECRET'];
    const token = signTestJwt({ sub: 'user-1', role: 'manager' });
    const { context, reflector } = createMockContext({ authorization: 'Bearer ' + token });
    const guard = new JwtAuthGuard(reflector, makePrismaMock(DEFAULT_USER));
    await expect(guard.canActivate(context as any)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects token whose tv claim mismatches DB token_version (post-password-change revocation)', async () => {
    // Unique sub avoids USER_CACHE bleed from earlier tests
    const token = signTestJwt({ sub: 'user-tv-mismatch', role: 'manager', tv: 1 });
    const { context, reflector } = createMockContext({ authorization: 'Bearer ' + token });
    const guard = new JwtAuthGuard(
      reflector,
      makePrismaMock({ role: 'manager', is_active: true, token_version: 2 }),
    );
    await expect(guard.canActivate(context as any)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects token for deactivated user', async () => {
    const token = signTestJwt({ sub: 'user-deactivated', role: 'manager', tv: 1 });
    const { context, reflector } = createMockContext({ authorization: 'Bearer ' + token });
    const guard = new JwtAuthGuard(
      reflector,
      makePrismaMock({ role: 'manager', is_active: false, token_version: 1 }),
    );
    await expect(guard.canActivate(context as any)).rejects.toThrow(UnauthorizedException);
  });

  it('reads token from HttpOnly cookie when present (prefers cookie over Bearer)', async () => {
    const cookieToken = signTestJwt({ sub: 'user-cookie', role: 'admin', tv: 1 });
    const bearerToken = signTestJwt({ sub: 'user-bearer', role: 'admin', tv: 1 });
    const { context, request, reflector } = createMockContext(
      { authorization: 'Bearer ' + bearerToken },
      {},
      { access_token: cookieToken },
    );
    const guard = new JwtAuthGuard(
      reflector,
      makePrismaMock({ role: 'admin', is_active: true, token_version: 1 }),
    );
    expect(await guard.canActivate(context as any)).toBe(true);
    expect((request as any).user.sub).toBe('user-cookie');
  });
});
