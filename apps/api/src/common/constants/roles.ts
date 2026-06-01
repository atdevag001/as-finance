import { UserRole } from '@as-finance/shared';

/**
 * Roles that bypass per-officer scope filtering on reads/writes.
 * Restricted roles (e.g., field_officer) must match the entity's assigned_officer_id.
 *
 * Single source of truth — do not duplicate this list in service files.
 */
export const UNRESTRICTED_ROLES: readonly string[] = [
  UserRole.SUPER_ADMIN,
  UserRole.MANAGER,
  UserRole.ACCOUNTANT,
  UserRole.OFFICE_STAFF,
  UserRole.VIEWER_AUDITOR,
  UserRole.COLLECTION_OFFICER,
];

/**
 * Returns true if the given role bypasses per-officer scope filtering.
 */
export function isUnrestrictedRole(actorRole: string | undefined): boolean {
  return !!actorRole && UNRESTRICTED_ROLES.includes(actorRole);
}
