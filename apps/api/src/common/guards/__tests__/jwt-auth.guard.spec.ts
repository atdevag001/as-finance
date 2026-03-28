import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import { JwtAuthGuard } from '../jwt-auth.guard';

const TEST_SECRET = 'test-jwt-secret-for-unit-tests';

function createMockContext(headers: Record<string, string> = {}, handlerMeta: Record<string, unknown> = {}) {
  const request = { headers };
  const reflector = new Reflector();
  vi.spyOn(reflector, 'getAllAndOverride').mockImplementation(((key: string) => {
    return handlerMeta[key] ?? undefined;
  }) as any);
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  };
  return { context, request, reflector };
}

describe('JwtAuthGuard', () => {
  const originalEnv = process.env['JWT_SECRET'];

  beforeEach(() => {
    process.env['JWT_SECRET'] = TEST_SECRET;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env['JWT_SECRET'] = originalEnv;
    } else {
      delete process.env['JWT_SECRET'];
    }
  });

  it('allows public endpoints without a token', () => {
    const { context, reflector } = createMockContext({}, { isPublic: true });
    const guard = new JwtAuthGuard(reflector);
    expect(guard.canActivate(context as any)).toBe(true);
  });

  it('rejects requests with no Authorization header', () => {
    const { context, reflector } = createMockContext();
    const guard = new JwtAuthGuard(reflector);
    expect(() => guard.canActivate(context as any)).toThrow(UnauthorizedException);
  });

  it('rejects requests with malformed Authorization header', () => {
    const { context, reflector } = createMockContext({ authorization: 'Basic abc' });
    const guard = new JwtAuthGuard(reflector);
    expect(() => guard.canActivate(context as any)).toThrow(UnauthorizedException);
  });

  it('rejects requests with an invalid token', () => {
    const { context, reflector } = createMockContext({ authorization: 'Bearer invalid.token.here' });
    const guard = new JwtAuthGuard(reflector);
    expect(() => guard.canActivate(context as any)).toThrow(UnauthorizedException);
  });

  it('accepts a valid token and attaches user to request', () => {
    const payload = { sub: 'user-1', role: 'manager' };
    const token = jwt.sign(payload, TEST_SECRET, { expiresIn: '15m' });
    const { context, request, reflector } = createMockContext({ authorization: `Bearer ${token}` });
    const guard = new JwtAuthGuard(reflector);

    expect(guard.canActivate(context as any)).toBe(true);
    expect((request as any).user).toMatchObject({ sub: 'user-1', role: 'manager' });
  });

  it('rejects an expired token', () => {
    const payload = { sub: 'user-1', role: 'manager' };
    const token = jwt.sign(payload, TEST_SECRET, { expiresIn: '-1s' });
    const { context, reflector } = createMockContext({ authorization: `Bearer ${token}` });
    const guard = new JwtAuthGuard(reflector);
    expect(() => guard.canActivate(context as any)).toThrow(UnauthorizedException);
  });

  it('rejects a token signed with wrong secret', () => {
    const payload = { sub: 'user-1', role: 'manager' };
    const token = jwt.sign(payload, 'wrong-secret', { expiresIn: '15m' });
    const { context, reflector } = createMockContext({ authorization: `Bearer ${token}` });
    const guard = new JwtAuthGuard(reflector);
    expect(() => guard.canActivate(context as any)).toThrow(UnauthorizedException);
  });
});
