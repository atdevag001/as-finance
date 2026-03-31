/**
 * Money-related fast-check arbitraries.
 * All money values are integer paise — never floats.
 */
import fc from 'fast-check';

/** Positive paise amount: 1 paise to 10 crore (₹1,00,00,000) */
export const paiseArb = fc.integer({ min: 1, max: 10_000_000_00 });

/** Large paise amount for stress testing: 100 paise to MAX_SAFE_INTEGER */
export const bigPaiseArb = fc.integer({ min: 100, max: Number.MAX_SAFE_INTEGER });

/** Annual interest rate in basis points: 1% (100 bps) to 50% (5000 bps) */
export const annualRateBpsArb = fc.integer({ min: 100, max: 5000 });

/** Loan tenure in months: 1 to 60 */
export const tenureMonthsArb = fc.integer({ min: 1, max: 60 });
