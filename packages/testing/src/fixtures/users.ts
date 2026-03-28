import { UserRole } from '@as-finance/shared';
import { type TestUser, createUser } from '../factories/user.factory.js';

/**
 * Sample users for each role, useful for integration tests and seed data.
 */
export const SAMPLE_USERS: Record<UserRole, TestUser> = {
  [UserRole.SUPER_ADMIN]: createUser({
    username: 'admin',
    fullName: 'System Administrator',
    role: UserRole.SUPER_ADMIN,
  }),
  [UserRole.MANAGER]: createUser({
    username: 'manager1',
    fullName: 'Branch Manager',
    role: UserRole.MANAGER,
  }),
  [UserRole.FIELD_OFFICER]: createUser({
    username: 'field1',
    fullName: 'Field Officer One',
    role: UserRole.FIELD_OFFICER,
  }),
  [UserRole.COLLECTION_OFFICER]: createUser({
    username: 'collector1',
    fullName: 'Collection Officer One',
    role: UserRole.COLLECTION_OFFICER,
  }),
  [UserRole.ACCOUNTANT]: createUser({
    username: 'accountant1',
    fullName: 'Head Accountant',
    role: UserRole.ACCOUNTANT,
  }),
  [UserRole.OFFICE_STAFF]: createUser({
    username: 'staff1',
    fullName: 'Office Staff One',
    role: UserRole.OFFICE_STAFF,
  }),
  [UserRole.VIEWER_AUDITOR]: createUser({
    username: 'auditor1',
    fullName: 'External Auditor',
    role: UserRole.VIEWER_AUDITOR,
  }),
};
