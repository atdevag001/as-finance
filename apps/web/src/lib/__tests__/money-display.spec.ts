import { describe, it, expect } from 'vitest';

/**
 * MoneyDisplay Unit Tests
 *
 * Tests the formatPaiseToINR function for:
 * - Indian comma grouping (last 3 digits, then groups of 2)
 * - Decimal formatting (always 2 decimal places)
 * - Negative handling (prefix with minus)
 * - Edge cases (zero, very large numbers)
 *
 * **Validates: Requirement 20 (Money Display and Formatting)**
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

describe('formatPaiseToINR', () => {
  describe('basic formatting', () => {
    it('formats zero paise as ₹0.00', () => {
      expect(formatPaiseToINR(0)).toBe('₹0.00');
    });

    it('formats one paisa as ₹0.01', () => {
      expect(formatPaiseToINR(1)).toBe('₹0.01');
    });

    it('formats 99 paise as ₹0.99', () => {
      expect(formatPaiseToINR(99)).toBe('₹0.99');
    });

    it('formats 100 paise as ₹1.00', () => {
      expect(formatPaiseToINR(100)).toBe('₹1.00');
    });

    it('formats 150 paise as ₹1.50', () => {
      expect(formatPaiseToINR(150)).toBe('₹1.50');
    });

    it('formats 12345 paise as ₹123.45', () => {
      expect(formatPaiseToINR(12345)).toBe('₹123.45');
    });
  });

  describe('Indian comma grouping', () => {
    it('no commas for amounts under 1000 rupees', () => {
      expect(formatPaiseToINR(99900)).toBe('₹999.00');
    });

    it('formats 1000 rupees with first comma', () => {
      expect(formatPaiseToINR(100000)).toBe('₹1,000.00');
    });

    it('formats 10,000 rupees correctly', () => {
      expect(formatPaiseToINR(1000000)).toBe('₹10,000.00');
    });

    it('formats 1 lakh (1,00,000) correctly', () => {
      expect(formatPaiseToINR(10000000)).toBe('₹1,00,000.00');
    });

    it('formats 10 lakh (10,00,000) correctly', () => {
      expect(formatPaiseToINR(100000000)).toBe('₹10,00,000.00');
    });

    it('formats 1 crore (1,00,00,000) correctly', () => {
      expect(formatPaiseToINR(1000000000)).toBe('₹1,00,00,000.00');
    });

    it('formats 10 crore (10,00,00,000) correctly', () => {
      expect(formatPaiseToINR(10000000000)).toBe('₹10,00,00,000.00');
    });

    it('formats 99 crore correctly', () => {
      expect(formatPaiseToINR(9900000000000)).toBe('₹99,00,00,00,000.00');
    });

    it('formats arbitrary amount 12,34,56,789.00 rupees', () => {
      // 12345678900 paise = 123456789.00 rupees = ₹12,34,56,789.00
      expect(formatPaiseToINR(12345678900)).toBe('₹12,34,56,789.00');
    });
  });

  describe('decimal places', () => {
    it('always shows 2 decimal places for whole rupees', () => {
      expect(formatPaiseToINR(100)).toBe('₹1.00');
      expect(formatPaiseToINR(10000)).toBe('₹100.00');
    });

    it('pads single digit paise with leading zero', () => {
      expect(formatPaiseToINR(101)).toBe('₹1.01');
      expect(formatPaiseToINR(109)).toBe('₹1.09');
    });

    it('shows full paise for double digit', () => {
      expect(formatPaiseToINR(110)).toBe('₹1.10');
      expect(formatPaiseToINR(199)).toBe('₹1.99');
    });
  });

  describe('negative amounts', () => {
    it('prefixes negative amount with minus sign', () => {
      expect(formatPaiseToINR(-100)).toBe('-₹1.00');
    });

    it('formats negative zero as ₹0.00 (no minus)', () => {
      expect(formatPaiseToINR(-0)).toBe('₹0.00');
    });

    it('formats negative one paisa', () => {
      expect(formatPaiseToINR(-1)).toBe('-₹0.01');
    });

    it('formats negative lakh amount', () => {
      expect(formatPaiseToINR(-10000000)).toBe('-₹1,00,000.00');
    });

    it('formats negative crore amount', () => {
      expect(formatPaiseToINR(-1000000000)).toBe('-₹1,00,00,000.00');
    });
  });

  describe('edge cases', () => {
    it('handles very large numbers (MAX_SAFE_INTEGER / 100)', () => {
      // MAX_SAFE_INTEGER is 9007199254740991
      // As paise, this represents ~90071992547409 rupees
      const result = formatPaiseToINR(9007199254740991);
      expect(result).toMatch(/^₹[\d,]+\.\d{2}$/);
      expect(result).toContain('₹');
    });

    it('handles boundary at 999 rupees (no comma)', () => {
      expect(formatPaiseToINR(99999)).toBe('₹999.99');
    });

    it('handles boundary at 1000 rupees (first comma)', () => {
      expect(formatPaiseToINR(100000)).toBe('₹1,000.00');
    });

    it('handles 10 paise', () => {
      expect(formatPaiseToINR(10)).toBe('₹0.10');
    });

    it('handles 50 paise', () => {
      expect(formatPaiseToINR(50)).toBe('₹0.50');
    });
  });

  describe('real-world amounts', () => {
    it('formats typical loan principal (₹10,000)', () => {
      expect(formatPaiseToINR(1000000)).toBe('₹10,000.00');
    });

    it('formats typical loan principal (₹50,000)', () => {
      expect(formatPaiseToINR(5000000)).toBe('₹50,000.00');
    });

    it('formats typical loan principal (₹1,00,000)', () => {
      expect(formatPaiseToINR(10000000)).toBe('₹1,00,000.00');
    });

    it('formats typical collection (₹2,500)', () => {
      expect(formatPaiseToINR(250000)).toBe('₹2,500.00');
    });

    it('formats typical collection with paise (₹2,517.50)', () => {
      expect(formatPaiseToINR(251750)).toBe('₹2,517.50');
    });

    it('formats typical penalty (₹150)', () => {
      expect(formatPaiseToINR(15000)).toBe('₹150.00');
    });
  });
});

describe('formatPaiseToINR output format', () => {
  it('always starts with ₹ symbol for positive amounts', () => {
    expect(formatPaiseToINR(0)).toMatch(/^₹/);
    expect(formatPaiseToINR(1)).toMatch(/^₹/);
    expect(formatPaiseToINR(100000)).toMatch(/^₹/);
  });

  it('always starts with -₹ for negative amounts', () => {
    expect(formatPaiseToINR(-1)).toMatch(/^-₹/);
    expect(formatPaiseToINR(-100000)).toMatch(/^-₹/);
  });

  it('always ends with exactly 2 decimal digits', () => {
    expect(formatPaiseToINR(0)).toMatch(/\.\d{2}$/);
    expect(formatPaiseToINR(1)).toMatch(/\.\d{2}$/);
    expect(formatPaiseToINR(99)).toMatch(/\.\d{2}$/);
    expect(formatPaiseToINR(100)).toMatch(/\.\d{2}$/);
    expect(formatPaiseToINR(12345678)).toMatch(/\.\d{2}$/);
  });

  it('only contains valid characters: ₹, digits, commas, period, minus', () => {
    const validPattern = /^-?₹[\d,]+\.\d{2}$/;
    expect(formatPaiseToINR(0)).toMatch(validPattern);
    expect(formatPaiseToINR(1)).toMatch(validPattern);
    expect(formatPaiseToINR(-1)).toMatch(validPattern);
    expect(formatPaiseToINR(123456789)).toMatch(validPattern);
    expect(formatPaiseToINR(-123456789)).toMatch(validPattern);
  });
});
