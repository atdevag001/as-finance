import { describe, it, expect, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RbacGuard } from '../rbac.guard';
import { PERMISSION_KEY } from '../../decorators/require-permission.decorator';

function createMockContext(
  permission: string | undefined,
  userRole: string | undefined,
  options?: { noUser?: boolean },
) {
  const reflector = new Reflector();
  const handler = vi.fn();
  const cls = vi.fn();

  vi.spyOn(reflector, 'getAllAndOverride').mockImplementation(((key: string) => {
    if (key === PERMISSION_KEY) return permission;
    return undefined;
  }) as any);

  const request = options?.noUser
    ? {}
    : userRole
      ? { user: { sub: 'u1', role: userRole } }
      : { user: undefined };

  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => handler,
    getClass: () => cls,
  };

  return { context, reflector, handler, cls };
}

describe('RbacGuard', () => {
  // --- Requirement 37.3: Open endpoints without @RequirePermission ---

  it('allows access when no permission metadata is set', () => {
    const { context, reflector } = createMockContext(undefined, 'manager');
    const guard = new RbacGuard(reflector);
    expect(guard.canActivate(context as any)).toBe(true);
  });

  it('allows any authenticated role when no permission metadata is set', () => {
    const { context, reflector } = createMockContext(undefined, 'field_officer');
    const guard = new RbacGuard(reflector);
    expect(guard.canActivate(context as any)).toBe(true);
  });

  // --- Requirement 37.1: Allow when role in allowed roles ---

  it('allows access when user role is in the allowed list', () => {
    const { context, reflector } = createMockContext('customer.create', 'super_admin');
    const guard = new RbacGuard(reflector);
    expect(guard.canActivate(context as any)).toBe(true);
  });

  it('allows manager to approve loans', () => {
    const { context, reflector } = createMockContext('loan.approve', 'manager');
    const guard = new RbacGuard(reflector);
    expect(guard.canActivate(context as any)).toBe(true);
  });

  it('allows collection_officer to create collections', () => {
    const { context, reflector } = createMockContext('collection.create', 'collection_officer');
    const guard = new RbacGuard(reflector);
    expect(guard.canActivate(context as any)).toBe(true);
  });

  it('allows viewer_auditor to read audit logs', () => {
    const { context, reflector } = createMockContext('audit.read', 'viewer_auditor');
    const guard = new RbacGuard(reflector);
    expect(guard.canActivate(context as any)).toBe(true);
  });

  it('allows accountant to read accounting data', () => {
    const { context, reflector } = createMockContext('accounting.read', 'accountant');
    const guard = new RbacGuard(reflector);
    expect(guard.canActivate(context as any)).toBe(true);
  });

  it('allows any role to read customers (READ_ALL permission)', () => {
    const { context, reflector } = createMockContext('customer.read', 'viewer_auditor');
    const guard = new RbacGuard(reflector);
    expect(guard.canActivate(context as any)).toBe(true);
  });

  // --- Requirement 37.2: Deny with ForbiddenException ---

  it('denies access when user role is not in the allowed list', () => {
    const { context, reflector } = createMockContext('loan.approve', 'field_officer');
    const guard = new RbacGuard(reflector);
    expect(() => guard.canActivate(context as any)).toThrow(ForbiddenException);
  });

  it('denies field_officer from reversing collections', () => {
    const { context, reflector } = createMockContext('collection.reverse', 'field_officer');
    const guard = new RbacGuard(reflector);
    expect(() => guard.canActivate(context as any)).toThrow(ForbiddenException);
  });

  it('denies collection_officer from approving loans', () => {
    const { context, reflector } = createMockContext('loan.approve', 'collection_officer');
    const guard = new RbacGuard(reflector);
    expect(() => guard.canActivate(context as any)).toThrow(ForbiddenException);
  });

  it('denies viewer_auditor from creating customers', () => {
    const { context, reflector } = createMockContext('customer.create', 'viewer_auditor');
    const guard = new RbacGuard(reflector);
    expect(() => guard.canActivate(context as any)).toThrow(ForbiddenException);
  });

  it('includes role and permission in denial message', () => {
    const { context, reflector } = createMockContext('loan.approve', 'field_officer');
    const guard = new RbacGuard(reflector);
    expect(() => guard.canActivate(context as any)).toThrow(
      /Role 'field_officer' is not authorized for 'loan.approve'/,
    );
  });

  // --- Requirement 37.4: Unknown permission denial (least privilege) ---

  it('denies access for unknown permission keys (least privilege)', () => {
    const { context, reflector } = createMockContext('nonexistent.action', 'super_admin');
    const guard = new RbacGuard(reflector);
    expect(() => guard.canActivate(context as any)).toThrow(ForbiddenException);
  });

  it('includes unknown permission key in denial message', () => {
    const { context, reflector } = createMockContext('nonexistent.action', 'super_admin');
    const guard = new RbacGuard(reflector);
    expect(() => guard.canActivate(context as any)).toThrow(
      /Unknown permission: nonexistent\.action/,
    );
  });

  // --- Requirement 37.5: Missing role denial ---

  it('denies access when user has no role', () => {
    const { context, reflector } = createMockContext('customer.read', undefined);
    const guard = new RbacGuard(reflector);
    expect(() => guard.canActivate(context as any)).toThrow(ForbiddenException);
  });

  it('denies access when user object is missing from request', () => {
    const { context, reflector } = createMockContext('customer.read', undefined, { noUser: true });
    const guard = new RbacGuard(reflector);
    expect(() => guard.canActivate(context as any)).toThrow(ForbiddenException);
  });

  it('includes "User role not found" in missing role denial message', () => {
    const { context, reflector } = createMockContext('customer.read', undefined);
    const guard = new RbacGuard(reflector);
    expect(() => guard.canActivate(context as any)).toThrow(/User role not found/);
  });

  // --- Reflector integration: passes handler and class to getAllAndOverride ---

  it('passes handler and class references to Reflector', () => {
    const { context, reflector, handler, cls } = createMockContext(undefined, 'manager');
    const spy = vi.spyOn(reflector, 'getAllAndOverride');
    const guard = new RbacGuard(reflector);
    guard.canActivate(context as any);
    expect(spy).toHaveBeenCalledWith(PERMISSION_KEY, [handler, cls]);
  });

  // --- Settings.update: only super_admin ---

  it('allows only super_admin to update settings', () => {
    const { context: ctx1, reflector: r1 } = createMockContext('settings.update', 'super_admin');
    expect(new RbacGuard(r1).canActivate(ctx1 as any)).toBe(true);

    const { context: ctx2, reflector: r2 } = createMockContext('settings.update', 'manager');
    expect(() => new RbacGuard(r2).canActivate(ctx2 as any)).toThrow(ForbiddenException);
  });
});
