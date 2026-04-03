import { describe, it, expect } from 'vitest';
import { hasPermission } from '../permissions';
import { PERMISSIONS } from '@as-finance/shared/constants';
import { UserRole } from '@as-finance/shared/enums';

describe('hasPermission', () => {
  it('returns true when the role is in the allowed list', () => {
    expect(hasPermission(UserRole.SUPER_ADMIN, 'loan.approve')).toBe(true);
    expect(hasPermission(UserRole.MANAGER, 'loan.approve')).toBe(true);
  });

  it('returns false when the role is not in the allowed list', () => {
    expect(hasPermission(UserRole.FIELD_OFFICER, 'loan.approve')).toBe(false);
    expect(hasPermission(UserRole.COLLECTION_OFFICER, 'loan.approve')).toBe(false);
    expect(hasPermission(UserRole.VIEWER_AUDITOR, 'loan.approve')).toBe(false);
  });

  it('returns false for an unknown permission key', () => {
    expect(hasPermission(UserRole.SUPER_ADMIN, 'nonexistent.action')).toBe(false);
  });

  it('returns false for an empty role', () => {
    expect(hasPermission('', 'loan.read')).toBe(false);
  });

  it('grants read permissions broadly', () => {
    for (const role of Object.values(UserRole)) {
      expect(hasPermission(role, 'loan.read')).toBe(true);
      expect(hasPermission(role, 'customer.read')).toBe(true);
    }
  });

  it('restricts settings.update to super_admin only', () => {
    expect(hasPermission(UserRole.SUPER_ADMIN, 'settings.update')).toBe(true);
    expect(hasPermission(UserRole.MANAGER, 'settings.update')).toBe(false);
    expect(hasPermission(UserRole.FIELD_OFFICER, 'settings.update')).toBe(false);
  });
});
