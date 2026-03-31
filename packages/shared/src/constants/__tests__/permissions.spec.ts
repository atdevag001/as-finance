import { describe, it, expect } from 'vitest';
import { PERMISSIONS } from '../permissions.js';
import { UserRole } from '../../enums/index.js';

const ALL_ROLES = Object.values(UserRole);

describe('PERMISSIONS', () => {
  it('has entries for all expected modules', () => {
    const modules = new Set(Object.keys(PERMISSIONS).map((k) => k.split('.')[0]));
    const expectedModules = [
      'customer',
      'loan',
      'collection',
      'receipt',
      'accounting',
      'report',
      'user',
      'penalty',
      'foreclosure',
      'group',
      'audit',
      'settings',
      'notification',
      'handover',
    ];
    for (const mod of expectedModules) {
      expect(modules, `Missing module "${mod}"`).toContain(mod);
    }
  });

  it('every permission entry contains only valid UserRole values', () => {
    for (const [key, roles] of Object.entries(PERMISSIONS)) {
      for (const role of roles) {
        expect(ALL_ROLES, `Invalid role "${role}" in permission "${key}"`).toContain(role);
      }
    }
  });

  it('every permission entry has at least one role', () => {
    for (const [key, roles] of Object.entries(PERMISSIONS)) {
      expect(roles.length, `Permission "${key}" has no roles`).toBeGreaterThan(0);
    }
  });

  it('no permission entry has duplicate roles', () => {
    for (const [key, roles] of Object.entries(PERMISSIONS)) {
      const unique = new Set(roles);
      expect(unique.size, `Duplicate roles in "${key}"`).toBe(roles.length);
    }
  });

  it('super_admin has access to every permission', () => {
    for (const [key, roles] of Object.entries(PERMISSIONS)) {
      expect(roles, `super_admin missing from "${key}"`).toContain(UserRole.SUPER_ADMIN);
    }
  });

  it('covers expected customer module actions', () => {
    expect(PERMISSIONS).toHaveProperty('customer.create');
    expect(PERMISSIONS).toHaveProperty('customer.read');
    expect(PERMISSIONS).toHaveProperty('customer.update');
    expect(PERMISSIONS).toHaveProperty('customer.blacklist');
    expect(PERMISSIONS).toHaveProperty('customer.upload_doc');
  });

  it('covers expected loan module actions', () => {
    expect(PERMISSIONS).toHaveProperty('loan.create');
    expect(PERMISSIONS).toHaveProperty('loan.read');
    expect(PERMISSIONS).toHaveProperty('loan.submit');
    expect(PERMISSIONS).toHaveProperty('loan.approve');
    expect(PERMISSIONS).toHaveProperty('loan.reject');
    expect(PERMISSIONS).toHaveProperty('loan.disburse');
    expect(PERMISSIONS).toHaveProperty('loan.close');
  });

  it('covers expected collection module actions', () => {
    expect(PERMISSIONS).toHaveProperty('collection.create');
    expect(PERMISSIONS).toHaveProperty('collection.read');
    expect(PERMISSIONS).toHaveProperty('collection.reverse');
  });

  it('covers expected receipt module actions', () => {
    expect(PERMISSIONS).toHaveProperty('receipt.read');
    expect(PERMISSIONS).toHaveProperty('receipt.print');
  });

  it('covers expected accounting module actions', () => {
    expect(PERMISSIONS).toHaveProperty('accounting.read');
    expect(PERMISSIONS).toHaveProperty('accounting.create_expense');
    expect(PERMISSIONS).toHaveProperty('accounting.manage_cashbook');
  });

  it('covers expected report module actions', () => {
    expect(PERMISSIONS).toHaveProperty('report.read');
    expect(PERMISSIONS).toHaveProperty('report.export');
  });

  it('covers expected user module actions', () => {
    expect(PERMISSIONS).toHaveProperty('user.create');
    expect(PERMISSIONS).toHaveProperty('user.read');
    expect(PERMISSIONS).toHaveProperty('user.update');
    expect(PERMISSIONS).toHaveProperty('user.change_role');
  });

  it('covers expected penalty module actions', () => {
    expect(PERMISSIONS).toHaveProperty('penalty.read');
    expect(PERMISSIONS).toHaveProperty('penalty.calculate');
    expect(PERMISSIONS).toHaveProperty('penalty.waive');
  });

  it('covers expected foreclosure module actions', () => {
    expect(PERMISSIONS).toHaveProperty('foreclosure.quote');
    expect(PERMISSIONS).toHaveProperty('foreclosure.execute');
  });

  it('covers expected group module actions', () => {
    expect(PERMISSIONS).toHaveProperty('group.create');
    expect(PERMISSIONS).toHaveProperty('group.read');
    expect(PERMISSIONS).toHaveProperty('group.manage_members');
    expect(PERMISSIONS).toHaveProperty('group.collect');
  });

  it('covers expected audit module actions', () => {
    expect(PERMISSIONS).toHaveProperty('audit.read');
  });

  it('covers expected settings module actions', () => {
    expect(PERMISSIONS).toHaveProperty('settings.read');
    expect(PERMISSIONS).toHaveProperty('settings.update');
  });

  it('covers expected notification module actions', () => {
    expect(PERMISSIONS).toHaveProperty('notification.read');
    expect(PERMISSIONS).toHaveProperty('notification.retry');
  });

  it('covers expected handover module actions', () => {
    expect(PERMISSIONS).toHaveProperty('handover.create');
    expect(PERMISSIONS).toHaveProperty('handover.verify');
  });

  it('viewer_auditor has only read-level access', () => {
    const viewerPerms = Object.entries(PERMISSIONS)
      .filter(([, roles]) => roles.includes(UserRole.VIEWER_AUDITOR))
      .map(([key]) => key);

    for (const perm of viewerPerms) {
      const action = perm.split('.')[1];
      expect(
        action,
        `viewer_auditor should only have read-level access, but has "${perm}"`,
      ).toMatch(/^read$/);
    }
  });

  it('manager has access to all approval actions', () => {
    expect(PERMISSIONS['loan.approve']).toContain(UserRole.MANAGER);
    expect(PERMISSIONS['loan.reject']).toContain(UserRole.MANAGER);
    expect(PERMISSIONS['loan.disburse']).toContain(UserRole.MANAGER);
    expect(PERMISSIONS['collection.reverse']).toContain(UserRole.MANAGER);
    expect(PERMISSIONS['penalty.waive']).toContain(UserRole.MANAGER);
    expect(PERMISSIONS['foreclosure.quote']).toContain(UserRole.MANAGER);
    expect(PERMISSIONS['foreclosure.execute']).toContain(UserRole.MANAGER);
  });

  it('collection_officer can create collections and handovers', () => {
    expect(PERMISSIONS['collection.create']).toContain(UserRole.COLLECTION_OFFICER);
    expect(PERMISSIONS['handover.create']).toContain(UserRole.COLLECTION_OFFICER);
  });

  it('accountant can manage cashbook and verify handovers', () => {
    expect(PERMISSIONS['accounting.manage_cashbook']).toContain(UserRole.ACCOUNTANT);
    expect(PERMISSIONS['handover.verify']).toContain(UserRole.ACCOUNTANT);
  });
});
