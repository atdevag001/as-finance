import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type RepaymentFrequency = 'daily' | 'weekly' | 'monthly';

const PERIODS_PER_YEAR: Record<RepaymentFrequency, number> = {
  daily: 365,
  weekly: 52,
  monthly: 12,
};

const PERIOD_LABELS: Record<RepaymentFrequency, { short: string; long: string }> = {
  daily: { short: 'p.d.', long: 'per day' },
  weekly: { short: 'p.w.', long: 'per week' },
  monthly: { short: 'p.m.', long: 'per month' },
};

/**
 * Calculate periodic interest rate from annual rate.
 *
 * @param annualRatePercent - Annual rate as percentage (e.g., 24 for 24%)
 * @param frequency - Repayment frequency ('daily', 'weekly', 'monthly')
 * @returns Object with rate value, formatted string, and label
 */
export function calculatePeriodicRate(
  annualRatePercent: number,
  frequency: string | null | undefined,
): { rate: number; formatted: string; label: string; labelLong: string } {
  // Default to monthly if frequency is invalid/missing
  const freq: RepaymentFrequency =
    frequency === 'daily' || frequency === 'weekly' || frequency === 'monthly'
      ? frequency
      : 'monthly';

  const periodsPerYear = PERIODS_PER_YEAR[freq];
  const rate = annualRatePercent / periodsPerYear;

  // Use 3 decimal places for daily (smaller values), 2 for others
  const decimals = freq === 'daily' ? 3 : 2;
  const formatted = rate.toFixed(decimals);

  const { short: label, long: labelLong } = PERIOD_LABELS[freq];

  return { rate, formatted, label, labelLong };
}
