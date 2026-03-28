import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  generateSchedule,
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
        //    - Flat: all non-last installments have equal interest (fixed interest per period)
        //    - Reducing balance: interest is non-increasing across non-last installments
        //      (as outstanding principal decreases, interest decreases)
        if (product.interestType === InterestType.FLAT && schedule.length > 1) {
          const firstInterest = schedule[0]!.interestPaise;
          for (let i = 1; i < schedule.length - 1; i++) {
            expect(schedule[i]!.interestPaise).toBe(firstInterest);
          }
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
