import { UserRole } from '@as-finance/shared';
import { buildEntity, randomMobile, randomUUID } from './helpers.js';

export interface TestUser {
  id: string;
  username: string;
  passwordHash: string;
  fullName: string;
  email: string | null;
  mobile: string;
  role: UserRole;
  isActive: boolean;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export function createUser(overrides?: Partial<TestUser>): TestUser {
  const now = new Date();
  return buildEntity<TestUser>(
    {
      id: randomUUID(),
      username: `user_${randomUUID().slice(0, 8)}`,
      passwordHash: '$2b$12$placeholder.hash.value.for.testing.only',
      fullName: 'Test User',
      email: null,
      mobile: randomMobile(),
      role: UserRole.FIELD_OFFICER,
      isActive: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    },
    overrides,
  );
}
