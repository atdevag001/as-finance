import { InterestType, Frequency } from '@as-finance/shared';
import { createLoanProduct } from '../factories/loan-product.factory.js';

/**
 * Sample loan product configurations for testing.
 */

/** Standard flat-interest monthly product: 12% p.a., ₹10K–₹5L, 3–36 months */
export const FLAT_MONTHLY_PRODUCT = createLoanProduct({
  name: 'Standard Flat Monthly',
  interestType: InterestType.FLAT,
  annualRateBps: 1200,
  minPrincipalPaise: 1000000,
  maxPrincipalPaise: 50000000,
  minTenureMonths: 3,
  maxTenureMonths: 36,
  repaymentFrequency: Frequency.MONTHLY,
});

/** Reducing balance monthly product: 18% p.a., ₹50K–₹10L, 6–24 months */
export const REDUCING_MONTHLY_PRODUCT = createLoanProduct({
  name: 'Reducing Balance Monthly',
  interestType: InterestType.REDUCING_BALANCE,
  annualRateBps: 1800,
  minPrincipalPaise: 5000000,
  maxPrincipalPaise: 100000000,
  minTenureMonths: 6,
  maxTenureMonths: 24,
  repaymentFrequency: Frequency.MONTHLY,
});

/** Weekly flat product: 24% p.a., ₹5K–₹1L, 3–12 months, with penalty config */
export const FLAT_WEEKLY_PRODUCT = createLoanProduct({
  name: 'Weekly Flat with Penalty',
  interestType: InterestType.FLAT,
  annualRateBps: 2400,
  minPrincipalPaise: 500000,
  maxPrincipalPaise: 10000000,
  minTenureMonths: 3,
  maxTenureMonths: 12,
  repaymentFrequency: Frequency.WEEKLY,
  penaltyGraceDays: 7,
  penaltyType: 'flat_per_period',
  penaltyValue: 5000, // ₹50 flat per period
  penaltyFrequency: Frequency.WEEKLY,
});

/** Daily reducing balance product: 15% p.a., ₹10K–₹2L, 1–6 months */
export const REDUCING_DAILY_PRODUCT = createLoanProduct({
  name: 'Daily Reducing Balance',
  interestType: InterestType.REDUCING_BALANCE,
  annualRateBps: 1500,
  minPrincipalPaise: 1000000,
  maxPrincipalPaise: 20000000,
  minTenureMonths: 1,
  maxTenureMonths: 6,
  repaymentFrequency: Frequency.DAILY,
});
