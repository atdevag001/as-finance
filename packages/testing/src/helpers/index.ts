/**
 * Shared test assertion helpers for the AS Finance LMS test suite.
 *
 * These utilities wrap common financial correctness checks so that
 * property-based tests and unit tests can express invariants concisely.
 */
import { expect } from 'vitest';
import type { JournalEntry } from '../factories/build-aliases.factory.js';

/**
 * Assert that a journal entry is balanced: total debit paise === total credit paise.
 *
 * Checks both the header totals and the sum of individual lines.
 *
 * @param entry - A JournalEntry with `lines`, `totalDebitPaise`, and `totalCreditPaise`.
 */
export function expectBalanced(entry: JournalEntry): void {
  // Header-level balance
  expect(entry.totalDebitPaise).toBe(entry.totalCreditPaise);

  // Line-level balance
  const lineDebits = entry.lines.reduce((sum, l) => sum + l.debitPaise, 0);
  const lineCredits = entry.lines.reduce((sum, l) => sum + l.creditPaise, 0);
  expect(lineDebits).toBe(lineCredits);

  // Header must agree with lines
  expect(entry.totalDebitPaise).toBe(lineDebits);
  expect(entry.totalCreditPaise).toBe(lineCredits);
}

/**
 * Assert that a paise value is a non-negative integer (no fractional paise, no negatives).
 *
 * @param value - The money amount in paise to validate.
 */
export function expectNonNegativePaise(value: number): void {
  expect(Number.isInteger(value), `Expected integer paise but got ${value}`).toBe(true);
  expect(value, `Expected non-negative paise but got ${value}`).toBeGreaterThanOrEqual(0);
}

/**
 * Assert that an array of Dates is strictly monotonically increasing
 * (each date is strictly after the previous one).
 *
 * @param dates - An array of Date objects to check ordering on.
 */
export function expectMonotonicallyIncreasing(dates: Date[]): void {
  for (let i = 1; i < dates.length; i++) {
    const current = dates[i]!;
    const previous = dates[i - 1]!;
    expect(
      current.getTime(),
      `Expected date[${i}] (${current.toISOString()}) to be strictly after date[${i - 1}] (${previous.toISOString()})`,
    ).toBeGreaterThan(previous.getTime());
  }
}
