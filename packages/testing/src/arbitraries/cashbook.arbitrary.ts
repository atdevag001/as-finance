/**
 * Cashbook-related fast-check arbitraries.
 * DailySummaryInput uses bigint for paise values.
 */
import fc from 'fast-check';
import type { DailySummaryInput } from '../factories/daily-summary.factory.js';

const transactionCategoryArb = fc.constantFrom(
  'collection',
  'disbursement',
  'expense',
  'handover',
  'processing_fee',
);

const transactionArb = fc.record({
  type: fc.constantFrom('inflow' as const, 'outflow' as const),
  amountPaise: fc.bigInt({ min: 1n, max: 10_000_000n }),
  category: transactionCategoryArb,
});

/** Generates a valid DailySummaryInput with non-negative opening balance and transactions */
export const dailySummaryInputArb: fc.Arbitrary<DailySummaryInput> = fc.record({
  openingBalancePaise: fc.bigInt({ min: 0n, max: 100_000_000n }),
  transactions: fc.array(transactionArb, { minLength: 0, maxLength: 20 }),
});
