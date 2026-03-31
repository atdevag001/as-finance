/**
 * BigInt/Number Conversion Safety Tests (Task 24.2)
 *
 * Tests that BigInt-to-Number conversions at the Prisma-to-application boundary
 * do not lose precision, and that Decimal.js intermediate calculations produce
 * correct integer paise after ROUND_HALF_UP rounding.
 *
 * Validates: Requirements 62.1–62.6
 */

import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Mirrors the calculateProcessingFee logic from DisbursementService.
 */
function calculateProcessingFee(
  principalPaise: bigint,
  feeType: string,
  feeValue: number,
): bigint {
  if (feeType === 'fixed') {
    return BigInt(feeValue);
  }
  if (feeType === 'percentage') {
    const fee = new Decimal(principalPaise.toString())
      .mul(feeValue)
      .div(10000)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    return BigInt(fee.toString());
  }
  return 0n;
}

/**
 * Simulates BigInt-to-Number conversion as done at the Prisma boundary.
 */
function bigintToNumber(value: bigint): number {
  return Number(value);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('BigInt/Number Conversion Safety (Req 62)', () => {
  // ─── 62.1: BigInt within MAX_SAFE_INTEGER converts without precision loss ─

  describe('62.1 — BigInt within MAX_SAFE_INTEGER', () => {
    it('converts 0n without loss', () => {
      expect(bigintToNumber(0n)).toBe(0);
    });

    it('converts 1n without loss', () => {
      expect(bigintToNumber(1n)).toBe(1);
    });

    it('converts 100_00n (100 rupees) without loss', () => {
      expect(bigintToNumber(100_00n)).toBe(10000);
    });

    it('converts 10_000_000_00n (1 crore) without loss', () => {
      expect(bigintToNumber(10_000_000_00n)).toBe(1_000_000_000);
    });

    it('converts MAX_SAFE_INTEGER without loss', () => {
      const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
      const converted = bigintToNumber(maxSafe);
      expect(converted).toBe(Number.MAX_SAFE_INTEGER);
      expect(BigInt(converted)).toBe(maxSafe);
    });

    it('round-trips through Number for typical loan amounts', () => {
      const amounts = [100n, 1_000_00n, 50_000_00n, 10_00_000_00n, 1_000_000_000_00n];
      for (const amt of amounts) {
        const num = Number(amt);
        expect(BigInt(num)).toBe(amt);
      }
    });
  });

  // ─── 62.2: BigInt serialization in JSON API responses ─────────────────────

  describe('62.2 — BigInt JSON serialization', () => {
    it('BigInt cannot be directly serialized with JSON.stringify', () => {
      expect(() => JSON.stringify({ amount: 100n })).toThrow();
    });

    it('BigInt converted to Number before serialization works for safe values', () => {
      const obj = { amount: Number(100_000_00n) };
      const json = JSON.stringify(obj);
      expect(JSON.parse(json).amount).toBe(10000000);
    });

    it('BigInt converted to String preserves precision for any value', () => {
      const big = BigInt(Number.MAX_SAFE_INTEGER) + 100n;
      const obj = { amount: big.toString() };
      const json = JSON.stringify(obj);
      expect(JSON.parse(json).amount).toBe(big.toString());
    });
  });

  // ─── 62.3: Decimal.js intermediate calculations ──────────────────────────

  describe('62.3 — Decimal.js ROUND_HALF_UP produces correct integer paise', () => {
    it('rounds 0.5 up to 1', () => {
      const result = new Decimal('0.5').toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
      expect(result.toNumber()).toBe(1);
    });

    it('rounds 0.4 down to 0', () => {
      const result = new Decimal('0.4').toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
      expect(result.toNumber()).toBe(0);
    });

    it('percentage fee: 100001 paise at 150 bps = 1500.015 → 1500', () => {
      const result = new Decimal('100001')
        .mul(150)
        .div(10000)
        .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
      expect(result.toNumber()).toBe(1500);
    });

    it('percentage fee: 100005 paise at 150 bps = 1500.075 → 1500', () => {
      const result = new Decimal('100005')
        .mul(150)
        .div(10000)
        .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
      expect(result.toNumber()).toBe(1500);
    });

    it('EMI calculation: large principal with reducing balance', () => {
      const principal = new Decimal('1000000000'); // 10M rupees in paise
      const monthlyRate = new Decimal('1200').div(10000).div(12); // 1% monthly
      const n = 12;
      // EMI = P * r * (1+r)^n / ((1+r)^n - 1)
      const factor = monthlyRate.plus(1).pow(n);
      const emi = principal.mul(monthlyRate).mul(factor).div(factor.minus(1));
      const rounded = emi.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
      expect(rounded.isInteger()).toBe(true);
      expect(rounded.isPositive()).toBe(true);
    });

    it('all intermediate results are finite and non-NaN', () => {
      const values = ['0', '1', '999999999', Number.MAX_SAFE_INTEGER.toString()];
      for (const v of values) {
        const d = new Decimal(v).mul(1200).div(10000).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
        expect(d.isFinite()).toBe(true);
        expect(d.isNaN()).toBe(false);
      }
    });
  });

  // ─── 62.4: calculateProcessingFee BigInt edge cases ──────────────────────

  describe('62.4 — calculateProcessingFee BigInt edge cases', () => {
    it('fixed fee: returns feeValue directly as BigInt', () => {
      expect(calculateProcessingFee(100_000_00n, 'fixed', 500_00)).toBe(500_00n);
    });

    it('fixed fee: zero principal still returns feeValue', () => {
      expect(calculateProcessingFee(0n, 'fixed', 500_00)).toBe(500_00n);
    });

    it('percentage fee: zero principal → 0n', () => {
      expect(calculateProcessingFee(0n, 'percentage', 200)).toBe(0n);
    });

    it('percentage fee: minimum principal 100n at 200 bps → 2n', () => {
      // 100 * 200 / 10000 = 2
      expect(calculateProcessingFee(100n, 'percentage', 200)).toBe(2n);
    });

    it('percentage fee: 10 billion paise at 200 bps', () => {
      const principal = 1_000_000_000_00n; // 10 billion paise = 100 crore INR
      const result = calculateProcessingFee(principal, 'percentage', 200);
      // 1_000_000_000_00 * 200 / 10000 = 2_000_000_000
      expect(result).toBe(2_000_000_000n);
    });

    it('percentage fee: fractional result rounds HALF_UP', () => {
      // 100001 * 150 / 10000 = 1500.015 → 1500
      expect(calculateProcessingFee(100001n, 'percentage', 150)).toBe(1500n);
    });

    it('unrecognized fee type → 0n', () => {
      expect(calculateProcessingFee(100_000_00n, 'unknown', 500)).toBe(0n);
    });
  });

  // ─── 62.5: BigInt arithmetic matches Decimal.js ──────────────────────────

  describe('62.5 — BigInt arithmetic matches Decimal.js', () => {
    it('allocation sum via BigInt matches Decimal.js sum', () => {
      const components = [1234n, 5678n, 9012n];
      const bigintSum = components.reduce((a, b) => a + b, 0n);
      const decimalSum = components
        .map((c) => new Decimal(c.toString()))
        .reduce((a, b) => a.plus(b), new Decimal(0));
      expect(bigintSum).toBe(BigInt(decimalSum.toString()));
    });

    it('reversal negation via BigInt matches Decimal.js', () => {
      const original = 12345n;
      const reversed = -original;
      const decReversed = new Decimal(original.toString()).neg();
      expect(reversed).toBe(BigInt(decReversed.toString()));
    });

    it('outstanding computation: total - allocated via both methods', () => {
      const total = 1_000_000_00n;
      const allocated = 350_000_00n;
      const outstanding = total - allocated;
      const decOutstanding = new Decimal(total.toString()).minus(allocated.toString());
      expect(outstanding).toBe(BigInt(decOutstanding.toString()));
    });
  });

  // ─── 62.6: Values exceeding MAX_SAFE_INTEGER ─────────────────────────────

  describe('62.6 — Values exceeding MAX_SAFE_INTEGER', () => {
    it('BigInt beyond MAX_SAFE_INTEGER is representable', () => {
      const beyond = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
      expect(beyond > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true);
    });

    it('Number conversion of beyond-MAX_SAFE_INTEGER loses precision', () => {
      // MAX_SAFE_INTEGER + 2 demonstrates precision loss clearly
      const beyond = BigInt(Number.MAX_SAFE_INTEGER) + 2n;
      const asNumber = Number(beyond);
      // The round-trip through Number loses the exact value
      const roundTripped = BigInt(asNumber);
      // 9007199254740993 → Number → 9007199254740992 → BigInt ≠ original
      expect(roundTripped).not.toBe(beyond);
    });

    it('String serialization preserves beyond-MAX_SAFE_INTEGER values', () => {
      const beyond = BigInt(Number.MAX_SAFE_INTEGER) + 12345n;
      const str = beyond.toString();
      expect(BigInt(str)).toBe(beyond);
    });

    it('Decimal.js handles beyond-MAX_SAFE_INTEGER correctly', () => {
      const beyond = BigInt(Number.MAX_SAFE_INTEGER) + 999n;
      const d = new Decimal(beyond.toString());
      expect(d.isFinite()).toBe(true);
      expect(BigInt(d.toFixed(0))).toBe(beyond);
    });
  });
});
