import { UserRole } from '@as-finance/shared';

/**
 * Roles that can bypass maker-checker constraints.
 * These roles can approve/execute their own requests.
 */
export const MAKER_CHECKER_BYPASS_ROLES: readonly string[] = [
  UserRole.SUPER_ADMIN,
];

/**
 * Check if a role can bypass maker-checker constraints.
 */
export function canBypassMakerChecker(role: string): boolean {
  return MAKER_CHECKER_BYPASS_ROLES.includes(role);
}
