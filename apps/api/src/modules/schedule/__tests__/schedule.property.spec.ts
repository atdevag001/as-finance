import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  generateSchedule,
  calculateFlatEMI,
  calculateReducingBalanceEMI,
  deriveInstallmentCount,
  type ScheduleParams,
} from '../schedule.service';
import { InterestType, Frequency } from '@as-finance/shared';

// ─── Shared Generators ─────────────────────────────────────────────────────

const scheduleParamsArb: fc.Arbitrary<ScheduleParams> = fc.record({
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

// ─── Helper ─────────────────────────────────────────────────────────────────

function getBreakdown(params: ScheduleParams) {
  return params.interestType === InterestType.FLAT
    ? calculateFlatEMI(params.principalPaise, params.annualRateBps, params.tenureMonths, params.frequency)
    : calculateReducingBalanceEMI(params.principalPaise, params.annualRateBps, params.tenureMonths, params.frequency);
}

// ─── Property 1: Schedule Reconciliation ────────────────────────────────────

/**
 * Property 1: Schedule Reconciliation
 *
 * For all valid ScheduleParams, the sum of all installment principal components
 * equals the loan principal amount.
 *
 * **Validates: Requirements 2.1**
 */
describe('Property 1: Schedule Reconciliation — principal sum equals loan principal', () => {
  it('sum of all installment principalPaise equals params.principalPaise', () => {
    fc.assert(
      fc.property(scheduleParamsArb, (params) => {
        const schedule = generateSchedule(params);
        const totalPrincipal = schedule.reduce((sum, inst) => sum + inst.principalPaise, 0);
        expect(totalPrincipal).toBe(params.principalPaise);
      }),
      { numRuns: 1000 },
    );
  });
});

// ─── Property 2: Interest Reconciliation ────────────────────────────────────

/**
 * Property 2: Interest Reconciliation
 *
 * For all valid ScheduleParams, the sum of all installment interest components
 * equals the total interest amount from the EMI breakdown.
 *
 * **Validates: Requirements 2.2**
 */
describe('Property 2: Interest Reconciliation — interest sum equals total interest', () => {
  it('sum of all installment interestPaise equals breakdown.totalInterestPaise', () => {
    fc.assert(
      fc.property(scheduleParamsArb, (params) => {
        const breakdown = getBreakdown(params);
        const schedule = generateSchedule(params);
        const totalInterest = schedule.reduce((sum, inst) => sum + inst.interestPaise, 0);
        expect(totalInterest).toBe(breakdown.totalInterestPaise);
      }),
      { numRuns: 1000 },
    );
  });
});

// ─── Property 3: Total Reconciliation ───────────────────────────────────────

/**
 * Property 3: Total Reconciliation
 *
 * For all valid ScheduleParams, the sum of all installment totals equals
 * the total payable amount (principal + total interest).
 *
 * **Validates: Requirements 2.3**
 */
describe('Property 3: Total Reconciliation — installment totals equal total payable', () => {
  it('sum of all installment totalPaise equals principalPaise + totalInterestPaise', () => {
    fc.assert(
      fc.property(scheduleParamsArb, (params) => {
        const breakdown = getBreakdown(params);
        const schedule = generateSchedule(params);
        const totalPayable = params.principalPaise + breakdown.totalInterestPaise;
        const sumTotals = schedule.reduce((sum, inst) => sum + inst.totalPaise, 0);
        expect(sumTotals).toBe(totalPayable);
      }),
      { numRuns: 1000 },
    );
  });
});

// ─── Property 4: Rounding Distribution ──────────────────────────────────────

/**
 * Property 4: Rounding Distribution (H18)
 *
 * For flat interest, the rounding remainder is distributed 1 paisa per
 * installment across the FIRST `remainder` installments (not dumped into the
 * last). As a consequence, every installment's principal differs from any
 * other by AT MOST 1 paisa, and the same holds for interest. There are at
 * most two distinct principal values and at most two distinct interest values
 * in the schedule, and the two values (when both are present) differ by exactly 1.
 *
 * For reducing balance, all non-last installments have totalPaise ≤ EMI
 * (clamped near the end to avoid cumulative overshoot).
 *
 * **Validates: Requirements 2.4**
 */
describe('Property 4: Rounding Distribution — at most 1-paisa spread across flat installments', () => {
  it('flat interest: any two installments differ by ≤ 1 paisa in principal and in interest', () => {
    const flatParamsArb = scheduleParamsArb.map((p) => ({
      ...p,
      interestType: InterestType.FLAT as InterestType,
    }));

    fc.assert(
      fc.property(flatParamsArb, (params) => {
        const schedule = generateSchedule(params);
        if (schedule.length <= 1) return;

        const principals = schedule.map((i) => i.principalPaise);
        const interests = schedule.map((i) => i.interestPaise);

        // At most 1 paisa spread between max and min, for both principal and interest.
        const pMax = Math.max(...principals);
        const pMin = Math.min(...principals);
        expect(pMax - pMin).toBeLessThanOrEqual(1);

        const iMax = Math.max(...interests);
        const iMin = Math.min(...interests);
        expect(iMax - iMin).toBeLessThanOrEqual(1);

        // At most two distinct values per series (the "base" amount and base+1).
        expect(new Set(principals).size).toBeLessThanOrEqual(2);
        expect(new Set(interests).size).toBeLessThanOrEqual(2);
      }),
      { numRuns: 1000 },
    );
  });

  it('reducing balance: non-last installments have identical EMI total (or clamped near end)', () => {
    const reducingParamsArb = scheduleParamsArb.map((p) => ({
      ...p,
      interestType: InterestType.REDUCING_BALANCE as InterestType,
    }));

    fc.assert(
      fc.property(reducingParamsArb, (params) => {
        const breakdown = getBreakdown(params);
        const schedule = generateSchedule(params);
        if (schedule.length <= 1) return;

        // For reducing balance, non-last installments should have totalPaise
        // equal to emiPaise OR less (when principal is clamped to avoid
        // cumulative overshoot). All must be non-negative.
        for (let i = 0; i < schedule.length - 1; i++) {
          expect(schedule[i]!.totalPaise).toBeLessThanOrEqual(breakdown.emiPaise);
          expect(schedule[i]!.totalPaise).toBeGreaterThanOrEqual(0);
        }
      }),
      { numRuns: 1000 },
    );
  });
});

// ─── Property 5: Determinism ────────────────────────────────────────────────

/**
 * Property 5: Determinism
 *
 * For all valid ScheduleParams, generating the schedule twice with identical
 * inputs always produces the identical installment array.
 *
 * **Validates: Requirements 2.5**
 */
describe('Property 5: Determinism — same params produce identical schedule', () => {
  it('two calls with identical ScheduleParams produce byte-identical JSON output', () => {
    fc.assert(
      fc.property(scheduleParamsArb, (params) => {
        const schedule1 = generateSchedule(params);
        const schedule2 = generateSchedule(params);
        expect(JSON.stringify(schedule1)).toBe(JSON.stringify(schedule2));
      }),
      { numRuns: 1000 },
    );
  });
});

// ─── Property 6: Non-Negative Integers ──────────────────────────────────────

/**
 * Property 6: Non-Negative Integers
 *
 * For all valid ScheduleParams, every installment's principalPaise, interestPaise,
 * and totalPaise are non-negative integers (no fractional paise, no negative values).
 *
 * **Validates: Requirements 2.6**
 */
describe('Property 6: Non-Negative Integers — all amounts are non-negative integers', () => {
  it('every installment amount is a non-negative integer', () => {
    fc.assert(
      fc.property(scheduleParamsArb, (params) => {
        const schedule = generateSchedule(params);
        for (const inst of schedule) {
          expect(Number.isInteger(inst.principalPaise)).toBe(true);
          expect(inst.principalPaise).toBeGreaterThanOrEqual(0);
          expect(Number.isInteger(inst.interestPaise)).toBe(true);
          expect(inst.interestPaise).toBeGreaterThanOrEqual(0);
          expect(Number.isInteger(inst.totalPaise)).toBe(true);
          expect(inst.totalPaise).toBeGreaterThanOrEqual(0);
        }
      }),
      { numRuns: 1000 },
    );
  });
});

// ─── Property 7: Monotonic Due Dates ────────────────────────────────────────

/**
 * Property 7: Monotonic Due Dates
 *
 * For all valid ScheduleParams, the due dates in the generated schedule are
 * strictly monotonically increasing (each due date is strictly after the previous).
 *
 * **Validates: Requirements 2.7**
 */
describe('Property 7: Monotonic Due Dates — due dates strictly increasing', () => {
  it('due dates are strictly monotonically increasing', () => {
    fc.assert(
      fc.property(scheduleParamsArb, (params) => {
        const schedule = generateSchedule(params);
        for (let i = 1; i < schedule.length; i++) {
          expect(
            schedule[i]!.dueDate.getTime(),
          ).toBeGreaterThan(
            schedule[i - 1]!.dueDate.getTime(),
          );
        }
      }),
      { numRuns: 1000 },
    );
  });
});

// ─── Property 8: Installment Count ──────────────────────────────────────────

/**
 * Property 8: Installment Count
 *
 * For all valid ScheduleParams, the number of installments in the generated
 * schedule matches the output of deriveInstallmentCount().
 *
 * **Validates: Requirements 2.8**
 */
describe('Property 8: Installment Count — matches deriveInstallmentCount()', () => {
  it('schedule length equals deriveInstallmentCount(tenureMonths, frequency)', () => {
    fc.assert(
      fc.property(scheduleParamsArb, (params) => {
        const schedule = generateSchedule(params);
        const expectedCount = deriveInstallmentCount(params.tenureMonths, params.frequency);
        expect(schedule.length).toBe(expectedCount);
      }),
      { numRuns: 1000 },
    );
  });
});
