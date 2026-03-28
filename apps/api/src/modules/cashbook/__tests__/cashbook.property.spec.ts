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

// ===========================================================================
// Property 27: Cash Reconciliation
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
