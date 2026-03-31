import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import { paiseToDec, decToPaise, formatINR } from '../money.js';

describe('paiseToDec', () => {
  it('converts 100 paise to 1.00 rupee', () => {
    expect(paiseToDec(100).equals(new Decimal('1'))).toBe(true);
  });

  it('converts 12345 paise to 123.45 rupees', () => {
    expect(paiseToDec(12345).equals(new Decimal('123.45'))).toBe(true);
  });

  it('converts 0 paise to 0 rupees', () => {
    expect(paiseToDec(0).equals(new Decimal('0'))).toBe(true);
  });

  it('converts 1 paisa to 0.01 rupees', () => {
    expect(paiseToDec(1).equals(new Decimal('0.01'))).toBe(true);
  });

  it('converts MAX_SAFE_INTEGER paise without precision loss', () => {
    const maxSafe = Number.MAX_SAFE_INTEGER;
    const result = paiseToDec(maxSafe);
    expect(result.times(100).toNumber()).toBe(maxSafe);
  });

  it('converts negative paise correctly', () => {
    expect(paiseToDec(-500).equals(new Decimal('-5'))).toBe(true);
  });
});

describe('decToPaise', () => {
  it('converts 1.00 rupee to 100 paise', () => {
    expect(decToPaise(new Decimal('1'))).toBe(100);
  });

  it('converts 123.45 rupees to 12345 paise', () => {
    expect(decToPaise(new Decimal('123.45'))).toBe(12345);
  });

  it('rounds half-up: 1.005 rupees → 101 paise', () => {
    expect(decToPaise(new Decimal('1.005'))).toBe(101);
  });

  it('rounds half-up: 1.004 rupees → 100 paise', () => {
    expect(decToPaise(new Decimal('1.004'))).toBe(100);
  });

  it('converts 0 rupees to 0 paise', () => {
    expect(decToPaise(new Decimal('0'))).toBe(0);
  });

  it('handles fractional amounts: 0.999 rupees → 100 paise (ROUND_HALF_UP)', () => {
    expect(decToPaise(new Decimal('0.999'))).toBe(100);
  });

  it('handles very small fractional: 0.001 rupees → 0 paise', () => {
    expect(decToPaise(new Decimal('0.001'))).toBe(0);
  });
});

describe('formatINR', () => {
  it('formats small amount: 100 paise → ₹1.00', () => {
    expect(formatINR(100)).toBe('₹1.00');
  });

  it('formats with Indian comma grouping: 12345678 paise → ₹1,23,456.78', () => {
    expect(formatINR(12345678)).toBe('₹1,23,456.78');
  });

  it('formats zero: 0 paise → ₹0.00', () => {
    expect(formatINR(0)).toBe('₹0.00');
  });

  it('formats amount under 1000 rupees: 99999 paise → ₹999.99', () => {
    expect(formatINR(99999)).toBe('₹999.99');
  });

  it('formats large amount: 1000000000 paise → ₹1,00,00,000.00', () => {
    expect(formatINR(1000000000)).toBe('₹1,00,00,000.00');
  });

  it('formats negative amount: -12345678 paise → -₹1,23,456.78', () => {
    expect(formatINR(-12345678)).toBe('-₹1,23,456.78');
  });

  it('formats 1 paisa → ₹0.01', () => {
    expect(formatINR(1)).toBe('₹0.01');
  });

  it('formats crore amount: 10000000000 paise → ₹10,00,00,000.00', () => {
    expect(formatINR(10000000000)).toBe('₹10,00,00,000.00');
  });
});
