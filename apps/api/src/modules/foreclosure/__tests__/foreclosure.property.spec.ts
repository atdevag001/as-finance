import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  calculateForeclosureSettlement,
  type ForeclosureSettlementInput,
} from '../foreclosure.service';

/**
 * Property 32: Foreclosure Settlement Calculation
 *
 * For all active or overdue loans, the foreclosure settlement amount SHALL equal
 * `outstanding_principal_paise + accrued_interest_paise + pending_penalties_paise - rebate_paise`,
 * with each component explicitly itemized and non-negative (except rebate which reduces the total).
 * Settlement is clamped to >= 0.
 *
 * **Validates: Requirements 9.1, 9.2**
 */

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Non-negative integer paise amount (0 – 1,000,000,000 i.e. up to 1 crore INR) */
const paiseArb = fc.integer({ min: 0, max: 1_000_000_000 });

/** Arbitrary valid ForeclosureSettlementInput with all non-negative paise amounts */
const settlementInputArb: fc.Arbitrary<ForeclosureSettlementInput> = fc.record({
  outstandingPrincipalPaise: paiseArb,
  accruedInterestPaise: paiseArb,
  pendingPenaltiesPaise: paiseArb,
  rebatePaise: paiseArb,
});

// ===========================================================================
// Property 32: Foreclosure Settlement Calculation
// ===========================================================================

describe('Property 32: Foreclosure Settlement Calculation', () => {
  it(
    'settlement == principal + interest + penalties - rebate, clamped to >= 0',
    () => {
      fc.assert(
        fc.property(settlementInputArb, (input) => {
          const result = calculateForeclosureSettlement(input);

          const expectedRaw =
            input.outstandingPrincipalPaise +
            input.accruedInterestPaise +
            input.pendingPenaltiesPaise -
            input.rebatePaise;
          const expected = Math.max(0, expectedRaw);

          expect(result.settlementAmountPaise).toBe(expected);
        }),
        { numRuns: 1000 },
      );
    },
  );

  it(
    'all result components are non-negative',
    () => {
      fc.assert(
        fc.property(settlementInputArb, (input) => {
          const result = calculateForeclosureSettlement(input);

          expect(result.outstandingPrincipalPaise).toBeGreaterThanOrEqual(0);
          expect(result.accruedInterestPaise).toBeGreaterThanOrEqual(0);
          expect(result.pendingPenaltiesPaise).toBeGreaterThanOrEqual(0);
          expect(result.rebatePaise).toBeGreaterThanOrEqual(0);
          expect(result.settlementAmountPaise).toBeGreaterThanOrEqual(0);
        }),
        { numRuns: 1000 },
      );
    },
  );

  it(
    'settlement amount is never negative regardless of rebate size',
    () => {
      // Specifically test cases where rebate exceeds the sum of other components
      const largeRebateInputArb = fc.record({
        outstandingPrincipalPaise: fc.integer({ min: 0, max: 100_000 }),
        accruedInterestPaise: fc.integer({ min: 0, max: 100_000 }),
        pendingPenaltiesPaise: fc.integer({ min: 0, max: 100_000 }),
        rebatePaise: fc.integer({ min: 100_000, max: 1_000_000_000 }),
      });

      fc.assert(
        fc.property(largeRebateInputArb, (input) => {
          const result = calculateForeclosureSettlement(input);
          expect(result.settlementAmountPaise).toBeGreaterThanOrEqual(0);
        }),
        { numRuns: 1000 },
      );
    },
  );
});
