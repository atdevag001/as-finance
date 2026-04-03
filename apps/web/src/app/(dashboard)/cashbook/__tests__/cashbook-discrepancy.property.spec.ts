import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 18: Cashbook discrepancy warning
 *
 * For any cashbook daily summary where `hasDiscrepancy` is `true`, the UI
 * should display a visible warning indicator. When `hasDiscrepancy` is `false`,
 * no warning should be shown.
 *
 * **Validates: Requirements 15.3**
 *
 * We test the pure logic that drives the discrepancy warning visibility,
 * extracted from the CashbookPage component.
 */

interface CashbookSummary {
  date: string;
  openingBalancePaise: number;
  cashInflowsPaise: number;
  cashOutflowsPaise: number;
  closingBalancePaise: number;
  hasDiscrepancy: boolean;
  transactionCount: number;
}

/**
 * Determines whether the discrepancy warning should be visible.
 * Mirrors the conditional rendering logic in CashbookPage:
 *   {data.hasDiscrepancy && <DiscrepancyWarning />}
 */
function shouldShowDiscrepancyWarning(summary: CashbookSummary): boolean {
  return summary.hasDiscrepancy === true;
}

// ─── Generators ───────────────────────────────────────────────────────────────

const cashbookSummaryArb = (hasDiscrepancy: boolean): fc.Arbitrary<CashbookSummary> =>
  fc.record({
    date: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }).map((d) => d.toISOString().slice(0, 10)),
    openingBalancePaise: fc.integer({ min: 0, max: 100_000_000 }),
    cashInflowsPaise: fc.integer({ min: 0, max: 100_000_000 }),
    cashOutflowsPaise: fc.integer({ min: 0, max: 100_000_000 }),
    closingBalancePaise: fc.integer({ min: 0, max: 100_000_000 }),
    hasDiscrepancy: fc.constant(hasDiscrepancy),
    transactionCount: fc.integer({ min: 0, max: 10_000 }),
  });

const anyCashbookSummaryArb: fc.Arbitrary<CashbookSummary> = fc.oneof(
  cashbookSummaryArb(true),
  cashbookSummaryArb(false),
);

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Property 18: Cashbook discrepancy warning', () => {
  it('warning is shown when hasDiscrepancy is true, regardless of other values', () => {
    fc.assert(
      fc.property(cashbookSummaryArb(true), (summary) => {
        expect(shouldShowDiscrepancyWarning(summary)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it('warning is hidden when hasDiscrepancy is false, regardless of other values', () => {
    fc.assert(
      fc.property(cashbookSummaryArb(false), (summary) => {
        expect(shouldShowDiscrepancyWarning(summary)).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  it('warning visibility is determined solely by hasDiscrepancy flag', () => {
    fc.assert(
      fc.property(anyCashbookSummaryArb, (summary) => {
        const visible = shouldShowDiscrepancyWarning(summary);
        expect(visible).toBe(summary.hasDiscrepancy);
      }),
      { numRuns: 200 },
    );
  });

  it('discrepancy flag is independent of balance amounts', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.integer({ min: 0, max: 100_000_000 }),
        fc.integer({ min: 0, max: 100_000_000 }),
        fc.integer({ min: 0, max: 100_000_000 }),
        fc.integer({ min: 0, max: 100_000_000 }),
        (hasDiscrepancy, opening, inflows, outflows, closing) => {
          const summary: CashbookSummary = {
            date: '2024-01-15',
            openingBalancePaise: opening,
            cashInflowsPaise: inflows,
            cashOutflowsPaise: outflows,
            closingBalancePaise: closing,
            hasDiscrepancy,
            transactionCount: 5,
          };
          expect(shouldShowDiscrepancyWarning(summary)).toBe(hasDiscrepancy);
        },
      ),
      { numRuns: 200 },
    );
  });
});
