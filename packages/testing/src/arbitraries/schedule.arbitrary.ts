/**
 * Schedule-related fast-check arbitraries.
 * Generates valid ScheduleParams for property-based tests.
 */
import fc from 'fast-check';
import { InterestType, Frequency } from '@as-finance/shared';
import type { ScheduleParams } from '../factories/schedule-params.factory.js';

export const scheduleParamsArb: fc.Arbitrary<ScheduleParams> = fc.record({
  principalPaise: fc.integer({ min: 100_00, max: 100_000_00 }),
  annualRateBps: fc.integer({ min: 100, max: 5000 }),
  tenureMonths: fc.integer({ min: 1, max: 60 }),
  interestType: fc.constantFrom(InterestType.FLAT, InterestType.REDUCING_BALANCE),
  frequency: fc.constantFrom(Frequency.MONTHLY, Frequency.WEEKLY, Frequency.DAILY),
  startDate: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
  holidays: fc.array(
    fc.date({ min: new Date('2020-01-01'), max: new Date('2031-12-31') }),
    { maxLength: 20 },
  ),
});
