import { GroupStatus } from '@as-finance/shared';
import { buildEntity, randomUUID } from './helpers.js';

export interface TestGroup {
  id: string;
  name: string;
  meetingDay: string;
  branchArea: string;
  leaderId: string;
  status: GroupStatus;
  memberCount: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export function createGroup(overrides?: Partial<TestGroup>): TestGroup {
  const now = new Date();
  return buildEntity<TestGroup>(
    {
      id: randomUUID(),
      name: `Test Group ${randomUUID().slice(0, 6)}`,
      meetingDay: 'monday',
      branchArea: 'Jaipur Branch',
      leaderId: randomUUID(),
      status: GroupStatus.ACTIVE,
      memberCount: 5,
      createdBy: randomUUID(),
      createdAt: now,
      updatedAt: now,
    },
    overrides,
  );
}
