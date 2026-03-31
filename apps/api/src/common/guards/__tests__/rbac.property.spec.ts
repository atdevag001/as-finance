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


/**
 * Property 37: No Orphaned Permissions — every permission has at least one role with access
 * Property 38: Super Admin Full Access — super_admin has access to every permission
 * Property 39: Viewer Read-Only — viewer_auditor has only read-level access
 * Property 40: No Duplicate Roles — no duplicate role entries per permission
 *
 * **Validates: Requirements 38.1, 38.2, 38.3, 38.4, 38.5**
 */

describe('Property 37: No Orphaned Permissions', () => {
  it('every permission in the matrix has at least one role with access', () => {
    fc.assert(
      fc.property(permissionArb, (permission) => {
        const roles = PERMISSIONS[permission] as readonly UserRole[] | undefined;
        expect(roles).toBeDefined();
        expect(roles!.length).toBeGreaterThanOrEqual(1);
      }),
      { numRuns: 100 },
    );
  });
});

describe('Property 38: Super Admin Full Access', () => {
  it('super_admin has access to every permission in the matrix', () => {
    fc.assert(
      fc.property(permissionArb, (permission) => {
        const allowedRoles = PERMISSIONS[permission] as readonly string[];
        expect(allowedRoles).toContain(UserRole.SUPER_ADMIN);
      }),
      { numRuns: 100 },
    );
  });
});

describe('Property 39: Viewer Read-Only', () => {
  /** Actions that are write/mutate operations — viewer_auditor must NOT have these */
  const WRITE_ACTIONS = [
    'create',
    'update',
    'delete',
    'approve',
    'reject',
    'reverse',
    'disburse',
    'close',
    'submit',
    'blacklist',
    'upload_doc',
    'calculate',
    'waive',
    'quote',
    'execute',
    'change_role',
    'manage_members',
    'collect',
    'create_expense',
    'manage_cashbook',
    'export',
    'print',
    'verify',
    'retry',
  ];

  it('viewer_auditor has only read-level access (no write/mutate permissions)', () => {
    fc.assert(
      fc.property(permissionArb, (permission) => {
        const allowedRoles = PERMISSIONS[permission] as readonly string[];
        const action = permission.split('.')[1] ?? '';
        const viewerHasAccess = allowedRoles.includes(UserRole.VIEWER_AUDITOR);

        if (WRITE_ACTIONS.includes(action)) {
          expect(viewerHasAccess).toBe(false);
        }
        // read-level permissions may or may not include viewer — no assertion needed
      }),
      { numRuns: 100 },
    );
  });
});

describe('Property 40: No Duplicate Roles', () => {
  it('no permission has duplicate role entries in its allowed roles array', () => {
    fc.assert(
      fc.property(permissionArb, (permission) => {
        const roles = PERMISSIONS[permission] as readonly UserRole[];
        const uniqueRoles = new Set(roles);
        expect(uniqueRoles.size).toBe(roles.length);
      }),
      { numRuns: 100 },
    );
  });
});
