import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { computeDailySummary, DailySummaryInput } from '../cashbook.service';

// ---------------------------------------------------------------------------
// Shared generators
// ---------------------------------------------------------------------------

/**
 * Arbitrary opening balance in paise. Allows negative values to test
 * discrepancy detection, but biases toward realistic positive balances.
 */
const openingBalanceArb = fc.bigInt({ min: -10_000_000n, max: 10_000_000_000n });

/**
 * Non-negative opening balance for Property 17 (non-negative amounts context).
 */
const nonNegativeOpeningArb = fc.bigInt({ min: 0n, max: 10_000_000_000n });

/**
 * Arbitrary positive amount in paise (1 – 10,000,000 i.e. up to ₹1,00,000).
 */
const amountPaiseArb = fc.bigInt({ min: 1n, max: 10_000_000n });

const categoryArb = fc.constantFrom(
  'collection',
  'disbursement',
  'expense',
  'handover',
  'processing_fee',
  'penalty',
  'other',
);

const transactionTypeArb = fc.constantFrom<'inflow' | 'outflow'>('inflow', 'outflow');

/**
 * Generates a single cash transaction with type, amount, and category.
 */
const transactionArb = fc.record({
  type: transactionTypeArb,
  amountPaise: amountPaiseArb,
  category: categoryArb,
});

/**
 * Generates a complete DailySummaryInput with an opening balance and
 * 0–50 transactions.
 */
const dailySummaryInputArb: fc.Arbitrary<DailySummaryInput> = fc.record({
  openingBalancePaise: openingBalanceArb,
  transactions: fc.array(transactionArb, { minLength: 0, maxLength: 50 }),
});

/**
 * Generates a DailySummaryInput with non-negative opening balance
 * (valid business scenario for Property 17).
 */
const validDailySummaryInputArb: fc.Arbitrary<DailySummaryInput> = fc.record({
  openingBalancePaise: nonNegativeOpeningArb,
  transactions: fc.array(transactionArb, { minLength: 0, maxLength: 50 }),
});

// ===========================================================================
// Property 16: Cashbook Balance
//
// opening + inflows - outflows = closing for any valid DailySummaryInput
//
// **Validates: Requirements 26.1, 26.2, 26.3**
// ===========================================================================

describe('Property 16: Cashbook Balance', () => {
  it('opening + inflows - outflows = closing for any valid DailySummaryInput', () => {
    fc.assert(
      fc.property(dailySummaryInputArb, (input) => {
        const result = computeDailySummary(input);

        const opening = BigInt(result.openingBalancePaise);
        const inflows = BigInt(result.cashInflowsPaise);
        const outflows = BigInt(result.cashOutflowsPaise);
        const closing = BigInt(result.closingBalancePaise);

        // Core reconciliation identity
        expect(opening + inflows - outflows).toBe(closing);
      }),
      { numRuns: 100 },
    );
  });

  it('opening balance in output matches the input opening balance', () => {
    fc.assert(
      fc.property(dailySummaryInputArb, (input) => {
        const result = computeDailySummary(input);

        expect(BigInt(result.openingBalancePaise)).toBe(input.openingBalancePaise);
      }),
      { numRuns: 100 },
    );
  });

  it('cash inflows equal the sum of all inflow transaction amounts', () => {
    fc.assert(
      fc.property(dailySummaryInputArb, (input) => {
        const result = computeDailySummary(input);

        const expectedInflows = input.transactions
          .filter((tx) => tx.type === 'inflow')
          .reduce((sum, tx) => sum + tx.amountPaise, 0n);

        expect(BigInt(result.cashInflowsPaise)).toBe(expectedInflows);
      }),
      { numRuns: 100 },
    );
  });

  it('cash outflows equal the sum of all outflow transaction amounts', () => {
    fc.assert(
      fc.property(dailySummaryInputArb, (input) => {
        const result = computeDailySummary(input);

        const expectedOutflows = input.transactions
          .filter((tx) => tx.type === 'outflow')
          .reduce((sum, tx) => sum + tx.amountPaise, 0n);

        expect(BigInt(result.cashOutflowsPaise)).toBe(expectedOutflows);
      }),
      { numRuns: 100 },
    );
  });

  it('with no transactions, closing balance equals opening balance', () => {
    fc.assert(
      fc.property(openingBalanceArb, (openingBalancePaise) => {
        const result = computeDailySummary({ openingBalancePaise, transactions: [] });

        expect(BigInt(result.closingBalancePaise)).toBe(openingBalancePaise);
        expect(BigInt(result.cashInflowsPaise)).toBe(0n);
        expect(BigInt(result.cashOutflowsPaise)).toBe(0n);
      }),
      { numRuns: 100 },
    );
  });

  it('discrepancy is flagged when closing balance is negative', () => {
    fc.assert(
      fc.property(dailySummaryInputArb, (input) => {
        const result = computeDailySummary(input);

        const closing = BigInt(result.closingBalancePaise);

        if (closing < 0n) {
          expect(result.hasDiscrepancy).toBe(true);
        } else {
          expect(result.hasDiscrepancy).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ===========================================================================
// Property 17: Non-Negative Amounts
//
// All summary amounts (inflows, outflows) are non-negative integers.
// Transaction amounts are always positive (min: 1n), so aggregated
// inflows and outflows must be >= 0.
//
// **Validates: Requirements 26.1, 26.2, 26.3**
// ===========================================================================

describe('Property 17: Non-Negative Amounts', () => {
  it('cashInflowsPaise is always a non-negative integer', () => {
    fc.assert(
      fc.property(dailySummaryInputArb, (input) => {
        const result = computeDailySummary(input);
        const inflows = BigInt(result.cashInflowsPaise);

        expect(inflows).toBeGreaterThanOrEqual(0n);
      }),
      { numRuns: 100 },
    );
  });

  it('cashOutflowsPaise is always a non-negative integer', () => {
    fc.assert(
      fc.property(dailySummaryInputArb, (input) => {
        const result = computeDailySummary(input);
        const outflows = BigInt(result.cashOutflowsPaise);

        expect(outflows).toBeGreaterThanOrEqual(0n);
      }),
      { numRuns: 100 },
    );
  });

  it('all output values are valid integer strings (no fractional paise)', () => {
    fc.assert(
      fc.property(dailySummaryInputArb, (input) => {
        const result = computeDailySummary(input);

        // All output fields must be parseable as BigInt (integer strings)
        expect(() => BigInt(result.openingBalancePaise)).not.toThrow();
        expect(() => BigInt(result.cashInflowsPaise)).not.toThrow();
        expect(() => BigInt(result.cashOutflowsPaise)).not.toThrow();
        expect(() => BigInt(result.closingBalancePaise)).not.toThrow();
      }),
      { numRuns: 100 },
    );
  });

  it('individual transaction amounts are always positive (no zero or negative)', () => {
    fc.assert(
      fc.property(validDailySummaryInputArb, (input) => {
        // Each transaction amount in the input is positive (min: 1n)
        for (const tx of input.transactions) {
          expect(tx.amountPaise).toBeGreaterThan(0n);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('hasDiscrepancy is a boolean value', () => {
    fc.assert(
      fc.property(dailySummaryInputArb, (input) => {
        const result = computeDailySummary(input);

        expect(typeof result.hasDiscrepancy).toBe('boolean');
      }),
      { numRuns: 100 },
    );
  });
});

// ===========================================================================
// Property 27: Cash Reconciliation (original — retained for backward compat)
//
// For all business days, opening_balance + cash_inflows - cash_outflows ==
// closing_balance; discrepancies flagged.
//
// **Validates: Requirements 13.5, 25.11**
// ===========================================================================

describe('Property 27: Cash Reconciliation', () => {
  it('for all inputs, opening_balance + cash_inflows - cash_outflows == closing_balance', () => {
    fc.assert(
      fc.property(dailySummaryInputArb, (input) => {
        const result = computeDailySummary(input);

        const opening = BigInt(result.openingBalancePaise);
        const inflows = BigInt(result.cashInflowsPaise);
        const outflows = BigInt(result.cashOutflowsPaise);
        const closing = BigInt(result.closingBalancePaise);

        // Core reconciliation identity
        expect(opening + inflows - outflows).toBe(closing);
      }),
      { numRuns: 1000 },
    );
  });

  it('opening balance in output matches the input opening balance', () => {
    fc.assert(
      fc.property(dailySummaryInputArb, (input) => {
        const result = computeDailySummary(input);

        expect(BigInt(result.openingBalancePaise)).toBe(input.openingBalancePaise);
      }),
      { numRuns: 500 },
    );
  });

  it('cash inflows equal the sum of all inflow transaction amounts', () => {
    fc.assert(
      fc.property(dailySummaryInputArb, (input) => {
        const result = computeDailySummary(input);

        const expectedInflows = input.transactions
          .filter((tx) => tx.type === 'inflow')
          .reduce((sum, tx) => sum + tx.amountPaise, 0n);

        expect(BigInt(result.cashInflowsPaise)).toBe(expectedInflows);
      }),
      { numRuns: 500 },
    );
  });

  it('cash outflows equal the sum of all outflow transaction amounts', () => {
    fc.assert(
      fc.property(dailySummaryInputArb, (input) => {
        const result = computeDailySummary(input);

        const expectedOutflows = input.transactions
          .filter((tx) => tx.type === 'outflow')
          .reduce((sum, tx) => sum + tx.amountPaise, 0n);

        expect(BigInt(result.cashOutflowsPaise)).toBe(expectedOutflows);
      }),
      { numRuns: 500 },
    );
  });

  it('discrepancy is flagged when closing balance is negative', () => {
    fc.assert(
      fc.property(dailySummaryInputArb, (input) => {
        const result = computeDailySummary(input);

        const closing = BigInt(result.closingBalancePaise);

        if (closing < 0n) {
          expect(result.hasDiscrepancy).toBe(true);
        } else {
          expect(result.hasDiscrepancy).toBe(false);
        }
      }),
      { numRuns: 1000 },
    );
  });

  it('with no transactions, closing balance equals opening balance', () => {
    fc.assert(
      fc.property(openingBalanceArb, (openingBalancePaise) => {
        const result = computeDailySummary({ openingBalancePaise, transactions: [] });

        expect(BigInt(result.closingBalancePaise)).toBe(openingBalancePaise);
        expect(BigInt(result.cashInflowsPaise)).toBe(0n);
        expect(BigInt(result.cashOutflowsPaise)).toBe(0n);
      }),
      { numRuns: 500 },
    );
  });
});
