import { PERMISSIONS } from '@as-finance/shared/constants';

/**
 * Check whether a given role has a specific permission.
 * Client-side convenience only — the API enforces authorization server-side.
 */
export function hasPermission(role: string, permission: string): boolean {
  const allowed = PERMISSIONS[permission];
  if (!allowed) return false;
  return (allowed as readonly string[]).includes(role);
}
