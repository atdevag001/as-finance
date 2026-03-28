import { describe, it, expect, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RbacGuard } from '../rbac.guard';
import { PERMISSION_KEY } from '../../decorators/require-permission.decorator';

function createMockContext(
  permission: string | undefined,
  userRole: string | undefined,
) {
  const reflector = new Reflector();
  vi.spyOn(reflector, 'getAllAndOverride').mockImplementation(((key: string) => {
    if (key === PERMISSION_KEY) return permission;
    return undefined;
  }) as any);

  const request = userRole ? { user: { sub: 'u1', role: userRole } } : { user: undefined };
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  };

  return { context, reflector };
}

describe('RbacGuard', () => {
  it('allows access when no permission metadata is set', () => {
    const { context, reflector } = createMockContext(undefined, 'manager');
    const guard = new RbacGuard(reflector);
    expect(guard.canActivate(context as any)).toBe(true);
  });

  it('allows access when user role is in the allowed list', () => {
    const { context, reflector } = createMockContext('customer.create', 'super_admin');
    const guard = new RbacGuard(reflector);
    expect(guard.canActivate(context as any)).toBe(true);
  });

  it('denies access when user role is not in the allowed list', () => {
    const { context, reflector } = createMockContext('loan.approve', 'field_officer');
    const guard = new RbacGuard(reflector);
    expect(() => guard.canActivate(context as any)).toThrow(ForbiddenException);
  });

  it('denies access when user has no role', () => {
    const { context, reflector } = createMockContext('customer.read', undefined);
    const guard = new RbacGuard(reflector);
    expect(() => guard.canActivate(context as any)).toThrow(ForbiddenException);
  });

  it('denies access for unknown permission keys (least privilege)', () => {
    const { context, reflector } = createMockContext('nonexistent.action', 'super_admin');
    const guard = new RbacGuard(reflector);
    expect(() => guard.canActivate(context as any)).toThrow(ForbiddenException);
  });

  it('allows viewer_auditor to read audit logs', () => {
    const { context, reflector } = createMockContext('audit.read', 'viewer_auditor');
    const guard = new RbacGuard(reflector);
    expect(guard.canActivate(context as any)).toBe(true);
  });

  it('denies field_officer from reversing collections', () => {
    const { context, reflector } = createMockContext('collection.reverse', 'field_officer');
    const guard = new RbacGuard(reflector);
    expect(() => guard.canActivate(context as any)).toThrow(ForbiddenException);
  });
});
