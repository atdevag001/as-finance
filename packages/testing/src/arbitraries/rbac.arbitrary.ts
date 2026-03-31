/**
 * RBAC-related fast-check arbitraries.
 */
import fc from 'fast-check';
import { UserRole, PERMISSIONS } from '@as-finance/shared';

/** Arbitrary for any valid UserRole enum value */
export const roleArb: fc.Arbitrary<UserRole> = fc.constantFrom(
  ...Object.values(UserRole),
);

/** Arbitrary for any valid permission key from the PERMISSIONS constant */
export const permissionKeyArb: fc.Arbitrary<string> = fc.constantFrom(
  ...Object.keys(PERMISSIONS),
);
