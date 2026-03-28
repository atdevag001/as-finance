import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RbacGuard } from '../rbac.guard';
import { PERMISSION_KEY } from '../../decorators/require-permission.decorator';
import { PERMISSIONS, UserRole } from '@as-finance/shared';

/**
 * Property 29: RBAC Permission Enforcement
 *
 * For all API actions and user roles, access is granted iff the role is in
 * the allowed roles list for that action; unauthorized → 403, unauthenticated → 401.
 *
 * **Validates: Requirements 15.2, 15.3, 15.4**
 */

// --- Helpers ---

const ALL_ROLES = Object.values(UserRole);
const ALL_PERMISSIONS = Object.keys(PERMISSIONS);

function createMockContext(
  permission: string | undefined,
  user: { sub: string; role: string } | undefined,
) {
  const reflector = new Reflector();
  vi.spyOn(reflector, 'getAllAndOverride').mockImplementation(((key: unknown) => {
    if (key === PERMISSION_KEY) return permission;
    return undefined;
  }) as any);

  const request = { user };
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  };

  return { context, reflector };
}

// --- Generators ---

/** Generates a valid permission key from the PERMISSIONS constant */
const permissionArb = fc.constantFrom(...ALL_PERMISSIONS);

/** Generates a valid UserRole */
const roleArb = fc.constantFrom(...ALL_ROLES);

/** Generates a random string that is NOT a valid permission key */
const unknownPermissionArb = fc
  .stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz._'.split('')), {
    minLength: 3,
    maxLength: 30,
  })
  .filter((s) => !(s in PERMISSIONS));

// --- Property Tests ---

describe('Property 29: RBAC Permission Enforcement', () => {
  it('grants access iff the role is in the allowed roles list for the permission', () => {
    fc.assert(
      fc.property(permissionArb, roleArb, (permission, role) => {
        const { context, reflector } = createMockContext(permission, {
          sub: 'user-1',
          role,
        });
        const guard = new RbacGuard(reflector);

        const allowedRoles = PERMISSIONS[permission] as readonly string[];
        const isAllowed = allowedRoles.includes(role);

        if (isAllowed) {
          expect(guard.canActivate(context as any)).toBe(true);
        } else {
          expect(() => guard.canActivate(context as any)).toThrow(
            ForbiddenException,
          );
        }
      }),
      { numRuns: 200 },
    );
  });

  it('denies access with ForbiddenException for unknown permission keys (least privilege)', () => {
    fc.assert(
      fc.property(unknownPermissionArb, roleArb, (permission, role) => {
        const { context, reflector } = createMockContext(permission, {
          sub: 'user-1',
          role,
        });
        const guard = new RbacGuard(reflector);

        expect(() => guard.canActivate(context as any)).toThrow(
          ForbiddenException,
        );
      }),
      { numRuns: 100 },
    );
  });

  it('denies access with ForbiddenException when user has no role', () => {
    fc.assert(
      fc.property(permissionArb, (permission) => {
        const { context, reflector } = createMockContext(permission, undefined);
        const guard = new RbacGuard(reflector);

        expect(() => guard.canActivate(context as any)).toThrow(
          ForbiddenException,
        );
      }),
      { numRuns: 100 },
    );
  });

  it('allows any authenticated user when no permission metadata is set', () => {
    fc.assert(
      fc.property(roleArb, (role) => {
        const { context, reflector } = createMockContext(undefined, {
          sub: 'user-1',
          role,
        });
        const guard = new RbacGuard(reflector);

        expect(guard.canActivate(context as any)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
