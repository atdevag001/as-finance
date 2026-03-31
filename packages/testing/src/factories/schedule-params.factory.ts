import { InterestType, Frequency } from '@as-finance/shared';
import { buildEntity, randomUUID } from './helpers.js';

/**
 * ScheduleParams — input parameters for schedule generation.
 * Not a Prisma model; used by Schedule_Generator pure functions.
 */
export interface ScheduleParams {
  principalPaise: number;
  annualRateBps: number;
  tenureMonths: number;
  interestType: InterestType;
  frequency: Frequency;
  startDate: Date;
  holidays: Date[];
}

export function buildScheduleParams(overrides?: Partial<ScheduleParams>): ScheduleParams {
  return buildEntity<ScheduleParams>(
    {
      principalPaise: 100_000_00,
      annualRateBps: 1200,
      tenureMonths: 12,
      interestType: InterestType.FLAT,
      frequency: Frequency.MONTHLY,
      startDate: new Date('2024-01-01'),
      holidays: [],
    },
    overrides,
  );
}
