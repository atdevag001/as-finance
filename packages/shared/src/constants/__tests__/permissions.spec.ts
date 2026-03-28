import { describe, it, expect } from 'vitest';
import { PERMISSIONS } from '../permissions.js';
import { UserRole } from '../../enums/index.js';

const ALL_ROLES = Object.values(UserRole);

describe('PERMISSIONS', () => {
  it('has entries for all expected modules', () => {
    const modules = new Set(Object.keys(PERMISSIONS).map((k) => k.split('.')[0]));
    expect(modules).toContain('customer');
    expect(modules).toContain('loan');
    expect(modules).toContain('collection');
    expect(modules).toContain('accounting');
    expect(modules).toContain('report');
    expect(modules).toContain('user');
    expect(modules).toContain('audit');
    expect(modules).toContain('settings');
  });

  it('every permission entry contains only valid UserRole values', () => {
    for (const [key, roles] of Object.entries(PERMISSIONS)) {
      for (const role of roles) {
        expect(ALL_ROLES, `Invalid role "${role}" in permission "${key}"`).toContain(role);
      }
    }
  });

  it('super_admin has access to every permission', () => {
    for (const [key, roles] of Object.entries(PERMISSIONS)) {
      expect(roles, `super_admin missing from "${key}"`).toContain(UserRole.SUPER_ADMIN);
    }
  });

  it('viewer_auditor has read-only access to audit logs', () => {
    expect(PERMISSIONS['audit.read']).toContain(UserRole.VIEWER_AUDITOR);
  });
});
