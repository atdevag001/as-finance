import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 1: MoneyDisplay formatting correctness
 *
 * For any integer paise value, formatPaiseToINR(paise) should produce a string that:
 * (a) starts with ₹ (or -₹ for negative values)
 * (b) uses Indian comma grouping (last 3 digits, then groups of 2)
 * (c) has exactly 2 decimal places
 * (d) the numeric value equals Math.abs(paise) / 100 when parsed back
 *
 * **Validates: Requirements 20.1, 20.2, 20.3, 20.4**
 */

// Extracted from MoneyDisplay component for testing
function formatPaiseToINR(paise: number): string {
  const isNegative = paise < 0;
  const absPaise = Math.abs(paise);
  const rupees = Math.floor(absPaise / 100);
  const paisa = absPaise % 100;
  const decPart = paisa.toString().padStart(2, '0');

  const intStr = rupees.toString();
  let formatted: string;
  if (intStr.length <= 3) {
    formatted = intStr;
  } else {
    const last3 = intStr.slice(-3);
    const rest = intStr.slice(0, -3);
    const groups: string[] = [];
    for (let i = rest.length; i > 0; i -= 2) {
      groups.unshift(rest.slice(Math.max(0, i - 2), i));
    }
    formatted = groups.join(',') + ',' + last3;
  }

  return `${isNegative ? '-' : ''}₹${formatted}.${decPart}`;
}

/**
 * Validates that a string follows Indian comma grouping rules.
 * Indian grouping: last 3 digits, then groups of 2 from the right.
 */
function hasValidIndianGrouping(formatted: string): boolean {
  // Extract the integer part (between ₹ and .)
  const match = formatted.match(/₹([\d,]+)\./);
  if (!match) return false;

  const intPart = match[1]!;
  const groups = intPart.split(',');

  if (groups.length === 1) {
    // No commas — must be 1-3 digits
    return groups[0]!.length >= 1 && groups[0]!.length <= 3;
  }

  // Last group must be exactly 3 digits
  if (groups[groups.length - 1]!.length !== 3) return false;

  // All other groups must be exactly 2 digits (except possibly the first)
  for (let i = 1; i < groups.length - 1; i++) {
    if (groups[i]!.length !== 2) return false;
  }

  // First group can be 1-2 digits
  if (groups[0]!.length < 1 || groups[0]!.length > 2) return false;

  return true;
}

// --- Generators ---

/** Generates paise values within safe integer range for accurate testing */
const paiseArb = fc.integer({ min: -9007199254740991, max: 9007199254740991 });

/** Generates non-negative paise values */
const nonNegativePaiseArb = fc.integer({ min: 0, max: 9007199254740991 });

/** Generates positive paise values */
const positivePaiseArb = fc.integer({ min: 1, max: 9007199254740991 });

/** Generates negative paise values */
const negativePaiseArb = fc.integer({ min: -9007199254740991, max: -1 });

/** Generates typical loan amounts (₹1,000 to ₹10,00,000) */
const loanAmountPaiseArb = fc.integer({ min: 100000, max: 100000000 });

// --- Property 1: MoneyDisplay formatting correctness ---

describe('Property 1: MoneyDisplay formatting correctness', () => {
  it('(a) always starts with ₹ for non-negative amounts', () => {
    fc.assert(
      fc.property(nonNegativePaiseArb, (paise) => {
        const formatted = formatPaiseToINR(paise);
        expect(formatted.startsWith('₹')).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it('(a) always starts with -₹ for negative amounts', () => {
    fc.assert(
      fc.property(negativePaiseArb, (paise) => {
        const formatted = formatPaiseToINR(paise);
        expect(formatted.startsWith('-₹')).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it('(b) uses Indian comma grouping for any amount', () => {
    fc.assert(
      fc.property(paiseArb, (paise) => {
        const formatted = formatPaiseToINR(paise);
        // Remove the minus sign if present for grouping validation
        const withoutMinus = formatted.replace(/^-/, '');
        expect(hasValidIndianGrouping(withoutMinus)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it('(c) always has exactly 2 decimal places', () => {
    fc.assert(
      fc.property(paiseArb, (paise) => {
        const formatted = formatPaiseToINR(paise);
        // Should end with .XX where X are digits
        expect(formatted).toMatch(/\.\d{2}$/);
      }),
      { numRuns: 200 },
    );
  });

  it('(d) numeric value equals Math.abs(paise) / 100 when parsed back', () => {
    fc.assert(
      fc.property(paiseArb, (paise) => {
        const formatted = formatPaiseToINR(paise);
        // Remove ₹, commas, and minus sign to get the numeric value
        const numericStr = formatted.replace(/[₹,\-]/g, '');
        const parsedValue = parseFloat(numericStr);
        const expectedValue = Math.abs(paise) / 100;

        // Use toBeCloseTo for floating point comparison
        expect(parsedValue).toBeCloseTo(expectedValue, 2);
      }),
      { numRuns: 200 },
    );
  });

  it('output contains only valid characters', () => {
    fc.assert(
      fc.property(paiseArb, (paise) => {
        const formatted = formatPaiseToINR(paise);
        // Only valid characters: -, ₹, digits, commas, period
        expect(formatted).toMatch(/^-?₹[\d,]+\.\d{2}$/);
      }),
      { numRuns: 200 },
    );
  });

  it('preserves sign information correctly', () => {
    fc.assert(
      fc.property(paiseArb, (paise) => {
        const formatted = formatPaiseToINR(paise);
        const hasMinus = formatted.startsWith('-');

        if (paise < 0) {
          expect(hasMinus).toBe(true);
        } else {
          expect(hasMinus).toBe(false);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('typical loan amounts format correctly', () => {
    fc.assert(
      fc.property(loanAmountPaiseArb, (paise) => {
        const formatted = formatPaiseToINR(paise);

        // Should start with ₹
        expect(formatted.startsWith('₹')).toBe(true);

        // Should have commas (amounts > 1000 rupees)
        expect(formatted).toContain(',');

        // Should end with .00 for whole rupee amounts
        // (our generator produces whole paise values that may have decimal paise)
        expect(formatted).toMatch(/\.\d{2}$/);
      }),
      { numRuns: 200 },
    );
  });
});

describe('Property 1: Indian comma grouping specific tests', () => {
  it('amounts under 1000 rupees have no commas', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 99999 }), // 0 to 999.99 rupees
        (paise) => {
          const formatted = formatPaiseToINR(paise);
          // Extract integer part
          const match = formatted.match(/₹([\d,]+)\./);
          expect(match).toBeTruthy();
          expect(match![1]).not.toContain(',');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('amounts 1000-99999 rupees have exactly one comma', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100000, max: 9999999 }), // 1000 to 99999.99 rupees
        (paise) => {
          const formatted = formatPaiseToINR(paise);
          const commaCount = (formatted.match(/,/g) || []).length;
          expect(commaCount).toBe(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('amounts 1 lakh to 99 lakh have exactly two commas', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 10000000, max: 999999999 }), // 1,00,000 to 99,99,999.99 rupees
        (paise) => {
          const formatted = formatPaiseToINR(paise);
          const commaCount = (formatted.match(/,/g) || []).length;
          expect(commaCount).toBe(2);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('amounts 1 crore to 99 crore have exactly three commas', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1000000000, max: 99999999999 }), // 1,00,00,000 to 99,99,99,999.99 rupees
        (paise) => {
          const formatted = formatPaiseToINR(paise);
          const commaCount = (formatted.match(/,/g) || []).length;
          expect(commaCount).toBe(3);
        },
      ),
      { numRuns: 100 },
    );
  });
});
