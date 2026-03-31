import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import { JwtAuthGuard } from '../jwt-auth.guard';

const TEST_SECRET = 'test-jwt-secret-for-unit-tests';

function createMockContext(
  headers: Record<string, string> = {},
  handlerMeta: Record<string, unknown> = {},
) {
  const request = { headers };
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

describe('JwtAuthGuard', () => {
  const originalEnv = process.env['JWT_SECRET'];
  beforeEach(() => { process.env['JWT_SECRET'] = TEST_SECRET; });
  afterEach(() => {
    if (originalEnv !== undefined) process.env['JWT_SECRET'] = originalEnv;
    else delete process.env['JWT_SECRET'];
  });

  // --- Public endpoint bypass ---
  it('allows public endpoints without a token', () => {
    const { context, reflector } = createMockContext({}, { isPublic: true });
    expect(new JwtAuthGuard(reflector).canActivate(context as any)).toBe(true);
  });

  // --- Validates: Requirements 44.2 - Missing token rejection ---
  it('rejects requests with no Authorization header', () => {
    const { context, reflector } = createMockContext();
    expect(() => new JwtAuthGuard(reflector).canActivate(context as any)).toThrow(UnauthorizedException);
  });

  it('rejects missing header with descriptive message', () => {
    const { context, reflector } = createMockContext();
    expect(() => new JwtAuthGuard(reflector).canActivate(context as any)).toThrow(/[Mm]issing|[Mm]alformed|authorization/);
  });

  it('rejects malformed Authorization header (Basic scheme)', () => {
    const { context, reflector } = createMockContext({ authorization: 'Basic abc' });
    expect(() => new JwtAuthGuard(reflector).canActivate(context as any)).toThrow(UnauthorizedException);
  });

  it('rejects Bearer keyword but no token value', () => {
    const { context, reflector } = createMockContext({ authorization: 'Bearer ' });
    expect(() => new JwtAuthGuard(reflector).canActivate(context as any)).toThrow(UnauthorizedException);
  });

  it('rejects only the Bearer keyword (no space)', () => {
    const { context, reflector } = createMockContext({ authorization: 'Bearer' });
    expect(() => new JwtAuthGuard(reflector).canActivate(context as any)).toThrow(UnauthorizedException);
  });

  // --- Validates: Requirements 44.3 - Valid token acceptance ---
  it('accepts a valid token and attaches user to request', () => {
    const token = jwt.sign({ sub: 'user-1', role: 'manager' }, TEST_SECRET, { expiresIn: '15m' });
    const { context, request, reflector } = createMockContext({ authorization: 'Bearer ' + token });
    expect(new JwtAuthGuard(reflector).canActivate(context as any)).toBe(true);
    expect((request as any).user).toMatchObject({ sub: 'user-1', role: 'manager' });
  });

  it('attaches full JWT payload including iat and exp', () => {
    const token = jwt.sign({ sub: 'u-42', role: 'field_officer' }, TEST_SECRET, { expiresIn: '15m' });
    const { context, request, reflector } = createMockContext({ authorization: 'Bearer ' + token });
    new JwtAuthGuard(reflector).canActivate(context as any);
    const user = (request as any).user;
    expect(user.sub).toBe('u-42');
    expect(user.role).toBe('field_officer');
    expect(user.iat).toEqual(expect.any(Number));
    expect(user.exp).toEqual(expect.any(Number));
  });

  // --- Validates: Requirements 44.2 - Expired token rejection ---
  it('rejects an expired token', () => {
    const token = jwt.sign({ sub: 'user-1', role: 'manager' }, TEST_SECRET, { expiresIn: '-1s' });
    const { context, reflector } = createMockContext({ authorization: 'Bearer ' + token });
    expect(() => new JwtAuthGuard(reflector).canActivate(context as any)).toThrow(UnauthorizedException);
  });

  it('rejects expired token with descriptive error message', () => {
    const token = jwt.sign({ sub: 'user-1', role: 'manager' }, TEST_SECRET, { expiresIn: '-1s' });
    const { context, reflector } = createMockContext({ authorization: 'Bearer ' + token });
    expect(() => new JwtAuthGuard(reflector).canActivate(context as any)).toThrow(/[Ii]nvalid|[Ee]xpired/);
  });

  // --- Validates: Requirements 44.3 - Tampered token rejection ---
  it('rejects a token signed with wrong secret', () => {
    const token = jwt.sign({ sub: 'user-1', role: 'manager' }, 'wrong-secret', { expiresIn: '15m' });
    const { context, reflector } = createMockContext({ authorization: 'Bearer ' + token });
    expect(() => new JwtAuthGuard(reflector).canActivate(context as any)).toThrow(UnauthorizedException);
  });

  it('rejects a completely corrupted token string', () => {
    const { context, reflector } = createMockContext({ authorization: 'Bearer invalid.token.here' });
    expect(() => new JwtAuthGuard(reflector).canActivate(context as any)).toThrow(UnauthorizedException);
  });

  it('rejects a token with tampered payload (role escalation)', () => {
    const token = jwt.sign({ sub: 'user-1', role: 'manager' }, TEST_SECRET, { expiresIn: '15m' });
    const parts = token.split('.');
    const decoded = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    decoded.role = 'super_admin';
    parts[1] = Buffer.from(JSON.stringify(decoded)).toString('base64url');
    const { context, reflector } = createMockContext({ authorization: 'Bearer ' + parts.join('.') });
    expect(() => new JwtAuthGuard(reflector).canActivate(context as any)).toThrow(UnauthorizedException);
  });

  it('rejects a token with random garbage characters', () => {
    const { context, reflector } = createMockContext({ authorization: 'Bearer abc123xyz' });
    expect(() => new JwtAuthGuard(reflector).canActivate(context as any)).toThrow(UnauthorizedException);
  });

  // --- JWT_SECRET configuration error ---
  it('rejects when JWT_SECRET is not configured', () => {
    delete process.env['JWT_SECRET'];
    const token = jwt.sign({ sub: 'user-1', role: 'manager' }, TEST_SECRET, { expiresIn: '15m' });
    const { context, reflector } = createMockContext({ authorization: 'Bearer ' + token });
    expect(() => new JwtAuthGuard(reflector).canActivate(context as any)).toThrow(UnauthorizedException);
  });
});
