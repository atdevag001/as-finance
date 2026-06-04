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

// ─── Generators ─────────────────────────────────────────────────────────────

/**
 * Generates a valid product version configuration together with a conforming
 * loan (principal within range, tenure within range). Using fc.chain ensures
 * the dependent values participate in shrinking properly.
 */
const conformingLoanArb = fc
  .record({
    interestType: fc.constantFrom(InterestType.FLAT, InterestType.REDUCING_BALANCE),
    annualRateBps: fc.integer({ min: 100, max: 5000 }),
    minPrincipalPaise: fc.integer({ min: 100_00, max: 50_000_00 }),
    maxPrincipalPaise: fc.integer({ min: 50_001_00, max: 100_000_00 }),
    minTenureMonths: fc.integer({ min: 1, max: 12 }),
    maxTenureMonths: fc.integer({ min: 13, max: 60 }),
    frequency: fc.constantFrom(Frequency.MONTHLY, Frequency.WEEKLY, Frequency.DAILY),
  })
  .chain((product) => {
    // For daily frequency, ensure principal is large enough so per-installment
    // amounts stay positive after rounding (daily can produce 1800+ installments).
    const minPrincipal =
      product.frequency === Frequency.DAILY
        ? Math.max(product.minPrincipalPaise, 100_000)
        : product.minPrincipalPaise;
    const maxPrincipal = Math.max(product.maxPrincipalPaise, minPrincipal + 1);

    return fc.record({
      product: fc.constant(product),
      principalPaise: fc.integer({
        min: minPrincipal,
        max: maxPrincipal,
      }),
      tenureMonths: fc.integer({
        min: product.minTenureMonths,
        max: product.maxTenureMonths,
      }),
      startDate: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
    });
  });

/**
 * Generator for cross-frequency tests: produces a base loan config that works
 * across all three frequencies. Uses larger principals to ensure daily frequency
 * installments stay positive after rounding.
 */
const crossFrequencyBaseArb = fc.record({
  principalPaise: fc.integer({ min: 500_000, max: 100_000_00 }),
  annualRateBps: fc.integer({ min: 100, max: 5000 }),
  tenureMonths: fc.integer({ min: 1, max: 36 }),
  startDate: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
});

const allFrequencies: Frequency[] = [Frequency.MONTHLY, Frequency.WEEKLY, Frequency.DAILY];

// ─── Helper ─────────────────────────────────────────────────────────────────

function buildParams(
  base: { principalPaise: number; annualRateBps: number; tenureMonths: number; startDate: Date },
  interestType: InterestType,
  frequency: Frequency,
): ScheduleParams {
  return {
    ...base,
    interestType,
    frequency,
    holidays: [],
  };
}

// ─── Property 28: Model Conformance ─────────────────────────────────────────

/**
 * Feature: as-finance-loan-management-system, Property 28: Model Conformance
 *
 * For all loans with a linked product version, the generated schedule SHALL conform
 * to the product's interest type (flat or reducing_balance), use the product's annual
 * rate in bps, and have a tenure within the product's min/max tenure range. The
 * principal SHALL be within the product's min/max principal range.
 *
 * **Validates: Requirements 2.8, 3.3, 25.12**
 */
describe('Property 28: Model Conformance', () => {
  it('schedule conforms to product interest type, rate, and tenure/principal ranges', () => {
    fc.assert(
      fc.property(conformingLoanArb, ({ product, principalPaise, tenureMonths, startDate }) => {
        const params: ScheduleParams = {
          principalPaise,
          annualRateBps: product.annualRateBps,
          tenureMonths,
          interestType: product.interestType,
          frequency: product.frequency,
          startDate,
          holidays: [],
        };

        const schedule = generateSchedule(params);

        // 1. Installment count matches the expected count for the product's frequency
        const expectedInstallments = deriveInstallmentCount(tenureMonths, product.frequency);
        expect(schedule).toHaveLength(expectedInstallments);

        // 2. Principal reconciliation: sum of principal components equals loan principal
        //    (schedule conforms to the product's principal parameter)
        const totalPrincipal = schedule.reduce((s, i) => s + i.principalPaise, 0);
        expect(totalPrincipal).toBe(principalPaise);

        // 3. Interest type conformance:
        //    - Flat: every installment's interest is within 1 paisa of every other.
        //      H18 distributes the totalInterest rounding remainder across the
        //      first `remainder` installments, so any two installments differ
        //      by at most 1 paisa rather than being byte-identical.
        //    - Reducing balance: interest is non-increasing across non-last installments
        //      (as outstanding principal decreases, interest decreases)
        if (product.interestType === InterestType.FLAT && schedule.length > 1) {
          const interests = schedule.map((i) => i.interestPaise);
          const iMax = Math.max(...interests);
          const iMin = Math.min(...interests);
          expect(iMax - iMin).toBeLessThanOrEqual(1);
        } else if (product.interestType === InterestType.REDUCING_BALANCE && schedule.length > 2) {
          for (let i = 1; i < schedule.length - 1; i++) {
            expect(schedule[i]!.interestPaise).toBeLessThanOrEqual(
              schedule[i - 1]!.interestPaise,
            );
          }
        }

        // 4. All installments have positive total (valid schedule for any product config)
        for (const inst of schedule) {
          expect(inst.totalPaise).toBeGreaterThan(0);
        }

        // 5. Each installment's total equals its principal + interest components
        for (const inst of schedule) {
          expect(inst.totalPaise).toBe(inst.principalPaise + inst.interestPaise);
        }
      }),
      { numRuns: 100 },
    );
  });
});


// ─── Cross-Frequency Conformance: Flat Interest Total Payable Invariance ────

/**
 * Cross-Frequency Conformance: Flat Interest Total Payable Identity
 *
 * For flat interest loans, the total interest is computed as:
 *   totalInterest = P × (R / 10000) × (T / 12)
 *
 * This formula is independent of repayment frequency. Therefore, for the same
 * principal, rate, and tenure, the total payable (principal + total interest)
 * MUST be identical across monthly, weekly, and daily frequencies.
 *
 * **Validates: Requirements 2.1, 2.3**
 */
describe('Cross-Frequency: Flat interest total payable is identical across frequencies', () => {
  it('flat interest total payable is the same for monthly, weekly, and daily', () => {
    fc.assert(
      fc.property(crossFrequencyBaseArb, (base) => {
        const schedules = allFrequencies.map((freq) => {
          const params = buildParams(base, InterestType.FLAT, freq);
          return generateSchedule(params);
        });

        // Total payable = sum of all installment totalPaise
        const totals = schedules.map((s) =>
          s.reduce((sum, inst) => sum + inst.totalPaise, 0),
        );

        // All three frequencies must produce the same total payable
        expect(totals[1]).toBe(totals[0]); // weekly === monthly
        expect(totals[2]).toBe(totals[0]); // daily === monthly
      }),
      { numRuns: 1000 },
    );
  });
});

// ─── Cross-Frequency Conformance: Flat Interest Total Interest Invariance ───

/**
 * Cross-Frequency Conformance: Flat Interest Total Interest Identity
 *
 * For flat interest, total interest is frequency-independent. The sum of all
 * installment interest components must be identical across all frequencies
 * for the same principal, rate, and tenure.
 *
 * **Validates: Requirements 2.1, 2.3**
 */
describe('Cross-Frequency: Flat interest total interest is identical across frequencies', () => {
  it('flat interest sum equals the same value for monthly, weekly, and daily', () => {
    fc.assert(
      fc.property(crossFrequencyBaseArb, (base) => {
        const interestSums = allFrequencies.map((freq) => {
          const params = buildParams(base, InterestType.FLAT, freq);
          const schedule = generateSchedule(params);
          return schedule.reduce((sum, inst) => sum + inst.interestPaise, 0);
        });

        expect(interestSums[1]).toBe(interestSums[0]); // weekly === monthly
        expect(interestSums[2]).toBe(interestSums[0]); // daily === monthly
      }),
      { numRuns: 1000 },
    );
  });
});

// ─── Cross-Frequency Conformance: Principal Reconciliation All Frequencies ──

/**
 * Cross-Frequency Conformance: Principal Reconciliation Across Frequencies
 *
 * Regardless of frequency or interest type, the sum of all installment principal
 * components must always equal the original loan principal. This must hold for
 * every frequency independently.
 *
 * **Validates: Requirements 2.1**
 */
describe('Cross-Frequency: Principal reconciliation holds for all frequencies', () => {
  it('sum of principal components equals loan principal for every frequency and interest type', () => {
    const interestTypes = [InterestType.FLAT, InterestType.REDUCING_BALANCE];

    fc.assert(
      fc.property(
        crossFrequencyBaseArb,
        fc.constantFrom(...interestTypes),
        (base, interestType) => {
          for (const freq of allFrequencies) {
            const params = buildParams(base, interestType, freq);
            const schedule = generateSchedule(params);
            const totalPrincipal = schedule.reduce((sum, inst) => sum + inst.principalPaise, 0);
            expect(totalPrincipal).toBe(base.principalPaise);
          }
        },
      ),
      { numRuns: 1000 },
    );
  });
});

// ─── Cross-Frequency Conformance: Non-Negative Integers All Frequencies ─────

/**
 * Cross-Frequency Conformance: Non-Negative Integer Amounts Across Frequencies
 *
 * For all valid inputs and all frequencies, every installment's principalPaise,
 * interestPaise, and totalPaise must be non-negative integers. This ensures
 * rounding across different installment counts never produces fractional or
 * negative values.
 *
 * **Validates: Requirements 2.6**
 */
describe('Cross-Frequency: All amounts are non-negative integers for every frequency', () => {
  it('every installment amount is a non-negative integer across all frequencies and interest types', () => {
    const interestTypes = [InterestType.FLAT, InterestType.REDUCING_BALANCE];

    fc.assert(
      fc.property(
        crossFrequencyBaseArb,
        fc.constantFrom(...interestTypes),
        (base, interestType) => {
          for (const freq of allFrequencies) {
            const params = buildParams(base, interestType, freq);
            const schedule = generateSchedule(params);

            for (const inst of schedule) {
              expect(Number.isInteger(inst.principalPaise)).toBe(true);
              expect(inst.principalPaise).toBeGreaterThanOrEqual(0);
              expect(Number.isInteger(inst.interestPaise)).toBe(true);
              expect(inst.interestPaise).toBeGreaterThanOrEqual(0);
              expect(Number.isInteger(inst.totalPaise)).toBe(true);
              expect(inst.totalPaise).toBeGreaterThanOrEqual(0);
            }
          }
        },
      ),
      { numRuns: 1000 },
    );
  });
});

// ─── Cross-Frequency Conformance: Reducing Balance Bounded Divergence ───────

/**
 * Cross-Frequency Conformance: Reducing Balance Total Payable Bounded Divergence
 *
 * For reducing balance loans, total interest depends on the compounding frequency.
 * More frequent compounding (daily > weekly > monthly) generally produces slightly
 * different total interest. However, for the same principal, rate, and tenure,
 * the total payable across frequencies should remain within a reasonable bound
 * (5% of the monthly total payable). This ensures no frequency produces wildly
 * divergent results.
 *
 * **Validates: Requirements 2.1, 2.3**
 */
describe('Cross-Frequency: Reducing balance total payable divergence is bounded', () => {
  it('total payable across frequencies stays within 5% of the monthly baseline', () => {
    fc.assert(
      fc.property(crossFrequencyBaseArb, (base) => {
        const totals = allFrequencies.map((freq) => {
          const params = buildParams(base, InterestType.REDUCING_BALANCE, freq);
          const schedule = generateSchedule(params);
          return schedule.reduce((sum, inst) => sum + inst.totalPaise, 0);
        });

        const monthlyTotal = totals[0]!;
        const tolerance = Math.ceil(monthlyTotal * 0.05);

        // Weekly and daily totals should be within 5% of monthly
        expect(Math.abs(totals[1]! - monthlyTotal)).toBeLessThanOrEqual(tolerance);
        expect(Math.abs(totals[2]! - monthlyTotal)).toBeLessThanOrEqual(tolerance);
      }),
      { numRuns: 1000 },
    );
  });
});

// ─── Cross-Frequency Conformance: Installment Count Consistency ─────────────

/**
 * Cross-Frequency Conformance: Installment Count Calendar Accuracy
 *
 * For the same tenure, the installment counts across frequencies must match
 * the calendar-accurate derivation in `deriveInstallmentCount`:
 *   weekly = ceil(tenureMonths × 52 / 12)   (~4.33 weeks per month)
 *   daily  = ceil(tenureMonths × 365.25 / 12) (~30.44 days per month)
 *
 * The previous test asserted exact 4× and 30× ratios, but those approximations
 * under-count installments for longer tenures (a year has 52 weeks / 365.25
 * days, not 48 / 360). This test now mirrors the actual derivation formula.
 *
 * **Validates: Requirements 2.1**
 */
describe('Cross-Frequency: Installment counts follow calendar-accurate derivation', () => {
  it('weekly = ceil(months × 52/12) and daily = ceil(months × 365.25/12)', () => {
    const interestTypes = [InterestType.FLAT, InterestType.REDUCING_BALANCE];

    fc.assert(
      fc.property(
        crossFrequencyBaseArb,
        fc.constantFrom(...interestTypes),
        (base, interestType) => {
          const counts = allFrequencies.map((freq) => {
            const params = buildParams(base, interestType, freq);
            return generateSchedule(params).length;
          });

          // Monthly: N = tenureMonths
          expect(counts[0]).toBe(base.tenureMonths);
          // Weekly: ceil(tenureMonths × 52 / 12)
          expect(counts[1]).toBe(Math.ceil((base.tenureMonths * 52) / 12));
          // Daily: ceil(tenureMonths × 365.25 / 12)
          expect(counts[2]).toBe(Math.ceil((base.tenureMonths * 365.25) / 12));
        },
      ),
      { numRuns: 1000 },
    );
  });
});
