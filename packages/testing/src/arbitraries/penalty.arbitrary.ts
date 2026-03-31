/**
 * Penalty-related fast-check arbitraries.
 */
import fc from 'fast-check';

/** Penalty configuration for flat or percentage penalty */
export interface PenaltyConfig {
  type: 'flat' | 'percentage';
  flatAmountPaise: number;
  percentageBps: number;
  gracePeriodDays: number;
}

export const penaltyConfigArb: fc.Arbitrary<PenaltyConfig> = fc.oneof(
  fc.record({
    type: fc.constant('flat' as const),
    flatAmountPaise: fc.integer({ min: 100, max: 100_000 }),
    percentageBps: fc.constant(0),
    gracePeriodDays: fc.integer({ min: 0, max: 30 }),
  }),
  fc.record({
    type: fc.constant('percentage' as const),
    flatAmountPaise: fc.constant(0),
    percentageBps: fc.integer({ min: 10, max: 5000 }),
    gracePeriodDays: fc.integer({ min: 0, max: 30 }),
  }),
);

/** Due date in the past (for overdue testing) */
export const dueDateArb: fc.Arbitrary<Date> = fc.date({
  min: new Date('2020-01-01'),
  max: new Date('2030-12-31'),
});
