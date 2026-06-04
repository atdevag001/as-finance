import { describe, it, expect } from 'vitest';
import {
  calculateFlatEMI,
  calculateReducingBalanceEMI,
  generateSchedule,
  adjustForHolidays,
  generateDueDates,
  deriveInstallmentCount,
  derivePeriodicRate,
  type ScheduleParams,
} from '../schedule.service';
import { InterestType, Frequency } from '@as-finance/shared';
import { buildScheduleParams } from '@as-finance/testing';
import Decimal from 'decimal.js';

describe('Schedule Service — Unit Tests', () => {
  // ─── deriveInstallmentCount ──────────────────────────────────────────────

  describe('deriveInstallmentCount', () => {
    it('monthly: N = tenureMonths', () => {
      expect(deriveInstallmentCount(12, Frequency.MONTHLY)).toBe(12);
    });

    it('weekly: N = ceil(tenureMonths × 52 / 12) — 6 months → 26', () => {
      // Calendar-accurate: 6 × 52/12 = 26 weeks
      expect(deriveInstallmentCount(6, Frequency.WEEKLY)).toBe(26);
    });

    it('daily: N = ceil(tenureMonths × 365.25 / 12) — 3 months → 92', () => {
      // Calendar-accurate: 3 × 365.25/12 = 91.3125 → ceil(91.3125) = 92
      expect(deriveInstallmentCount(3, Frequency.DAILY)).toBe(92);
    });

    it('single month monthly = 1 installment', () => {
      expect(deriveInstallmentCount(1, Frequency.MONTHLY)).toBe(1);
    });

    it('single month weekly = ceil(52/12) = 5 installments', () => {
      // 1 × 52/12 = 4.333... → ceil = 5
      expect(deriveInstallmentCount(1, Frequency.WEEKLY)).toBe(5);
    });

    it('single month daily = ceil(365.25/12) = 31 installments', () => {
      // 1 × 365.25/12 = 30.4375 → ceil = 31
      expect(deriveInstallmentCount(1, Frequency.DAILY)).toBe(31);
    });

    it('max tenure 360 months monthly = 360 installments', () => {
      expect(deriveInstallmentCount(360, Frequency.MONTHLY)).toBe(360);
    });

    it('max tenure 360 months weekly = 1560 installments', () => {
      // 360 × 52/12 = 1560 exactly
      expect(deriveInstallmentCount(360, Frequency.WEEKLY)).toBe(1560);
    });

    it('max tenure 360 months daily = 10958 installments', () => {
      // 360 × 365.25/12 = 10957.5 → ceil = 10958
      expect(deriveInstallmentCount(360, Frequency.DAILY)).toBe(10958);
    });
  });

  // ─── derivePeriodicRate ──────────────────────────────────────────────────

  describe('derivePeriodicRate', () => {
    it('monthly rate for 1200 bps (12%) = 0.01', () => {
      const rate = derivePeriodicRate(1200, Frequency.MONTHLY);
      expect(rate.toNumber()).toBeCloseTo(0.01, 10);
    });

    it('weekly rate for 1200 bps = 12/52/100', () => {
      const rate = derivePeriodicRate(1200, Frequency.WEEKLY);
      const expected = new Decimal(1200).div(10000).div(52);
      expect(rate.eq(expected)).toBe(true);
    });

    it('daily rate for 1200 bps = 12/365/100', () => {
      const rate = derivePeriodicRate(1200, Frequency.DAILY);
      const expected = new Decimal(1200).div(10000).div(365);
      expect(rate.eq(expected)).toBe(true);
    });

    it('zero rate returns zero for all frequencies', () => {
      expect(derivePeriodicRate(0, Frequency.MONTHLY).isZero()).toBe(true);
      expect(derivePeriodicRate(0, Frequency.WEEKLY).isZero()).toBe(true);
      expect(derivePeriodicRate(0, Frequency.DAILY).isZero()).toBe(true);
    });

    it('max rate 10000 bps monthly = 100%/12', () => {
      const rate = derivePeriodicRate(10000, Frequency.MONTHLY);
      const expected = new Decimal(10000).div(10000).div(12);
      expect(rate.eq(expected)).toBe(true);
    });

    it('max rate 10000 bps weekly = 100%/52', () => {
      const rate = derivePeriodicRate(10000, Frequency.WEEKLY);
      const expected = new Decimal(10000).div(10000).div(52);
      expect(rate.eq(expected)).toBe(true);
    });

    it('max rate 10000 bps daily = 100%/365', () => {
      const rate = derivePeriodicRate(10000, Frequency.DAILY);
      const expected = new Decimal(10000).div(10000).div(365);
      expect(rate.eq(expected)).toBe(true);
    });
  });

  // ─── calculateFlatEMI ────────────────────────────────────────────────────

  describe('calculateFlatEMI', () => {
    it('12% flat on ₹1,00,000 for 12 months — verify exact values', () => {
      const result = calculateFlatEMI(10_000_000, 1200, 12, Frequency.MONTHLY);

      expect(result.totalInterestPaise).toBe(1_200_000);
      expect(result.numberOfInstallments).toBe(12);

      const totalPrincipal = result.installments.reduce((s, i) => s + i.principalPaise, 0);
      expect(totalPrincipal).toBe(10_000_000);

      const totalInterest = result.installments.reduce((s, i) => s + i.interestPaise, 0);
      expect(totalInterest).toBe(1_200_000);

      // H18: floor(10_000_000 / 12) = 833_333, remainder = 4.
      // First 4 installments get 833_334 (the +1 paisa adjustment), the rest get 833_333.
      // Interest divides evenly: floor(1_200_000 / 12) = 100_000 with no remainder,
      // so every installment has 100_000 paise of interest.
      for (let i = 0; i < 4; i++) {
        expect(result.installments[i]!.principalPaise).toBe(833334);
        expect(result.installments[i]!.interestPaise).toBe(100000);
      }
      for (let i = 4; i < 12; i++) {
        expect(result.installments[i]!.principalPaise).toBe(833333);
        expect(result.installments[i]!.interestPaise).toBe(100000);
      }
    });

    it('handles single installment (tenure = 1 month, monthly)', () => {
      const result = calculateFlatEMI(500_000, 2400, 1, Frequency.MONTHLY);
      expect(result.numberOfInstallments).toBe(1);
      expect(result.totalInterestPaise).toBe(10_000);
      expect(result.installments[0]!.principalPaise).toBe(500_000);
      expect(result.installments[0]!.interestPaise).toBe(10_000);
      expect(result.installments[0]!.totalPaise).toBe(510_000);
    });

    it('weekly frequency produces correct installment count', () => {
      // Updated: 3 × 52/12 = 13 weekly installments (calendar-accurate)
      const result = calculateFlatEMI(1_000_000, 1200, 3, Frequency.WEEKLY);
      expect(result.numberOfInstallments).toBe(13);
      expect(result.totalInterestPaise).toBe(30_000);
    });

    it('daily frequency produces correct installment count', () => {
      // Updated: ceil(2 × 365.25 / 12) = ceil(60.875) = 61 daily installments
      const result = calculateFlatEMI(1_000_000, 1200, 2, Frequency.DAILY);
      expect(result.numberOfInstallments).toBe(61);
    });

    it('daily frequency — known expected output', () => {
      // 1,000,000 paise, 1200 bps, 2 months daily → 61 installments
      // total_interest = 1000000 × 0.12 × 2/12 = 20000 (frequency-independent)
      const result = calculateFlatEMI(1_000_000, 1200, 2, Frequency.DAILY);
      expect(result.totalInterestPaise).toBe(20_000);
      expect(result.numberOfInstallments).toBe(61);

      const totalP = result.installments.reduce((s, i) => s + i.principalPaise, 0);
      const totalI = result.installments.reduce((s, i) => s + i.interestPaise, 0);
      expect(totalP).toBe(1_000_000);
      expect(totalI).toBe(20_000);
    });

    it('reconciliation: sum of components always equals totals', () => {
      const result = calculateFlatEMI(7_777_777, 1500, 7, Frequency.MONTHLY);
      const totalP = result.installments.reduce((s, i) => s + i.principalPaise, 0);
      const totalI = result.installments.reduce((s, i) => s + i.interestPaise, 0);
      expect(totalP).toBe(7_777_777);
      expect(totalI).toBe(result.totalInterestPaise);
      for (const inst of result.installments) {
        expect(inst.totalPaise).toBe(inst.principalPaise + inst.interestPaise);
      }
    });
  });

  // ─── calculateReducingBalanceEMI ─────────────────────────────────────────

  describe('calculateReducingBalanceEMI', () => {
    it('12% reducing on ₹1,00,000 for 12 months — principal sums to principal', () => {
      const result = calculateReducingBalanceEMI(10_000_000, 1200, 12, Frequency.MONTHLY);

      expect(result.numberOfInstallments).toBe(12);

      const totalPrincipal = result.installments.reduce((s, i) => s + i.principalPaise, 0);
      expect(totalPrincipal).toBe(10_000_000);

      for (const inst of result.installments) {
        expect(inst.totalPaise).toBe(inst.principalPaise + inst.interestPaise);
      }

      // Interest should decrease over time (reducing balance property)
      for (let i = 1; i < result.installments.length - 1; i++) {
        expect(result.installments[i]!.interestPaise).toBeLessThanOrEqual(
          result.installments[i - 1]!.interestPaise,
        );
      }
    });

    it('single installment reducing balance', () => {
      const result = calculateReducingBalanceEMI(500_000, 1200, 1, Frequency.MONTHLY);
      expect(result.numberOfInstallments).toBe(1);
      expect(result.installments[0]!.principalPaise).toBe(500_000);
      expect(result.installments[0]!.interestPaise).toBe(5_000);
    });

    it('weekly frequency reducing balance', () => {
      // 3 × 52/12 = 13 weekly installments
      const result = calculateReducingBalanceEMI(1_000_000, 1200, 3, Frequency.WEEKLY);
      expect(result.numberOfInstallments).toBe(13);
      const totalPrincipal = result.installments.reduce((s, i) => s + i.principalPaise, 0);
      expect(totalPrincipal).toBe(1_000_000);
    });

    it('daily frequency reducing balance — known expected output', () => {
      // ceil(2 × 365.25 / 12) = 61 daily installments
      const result = calculateReducingBalanceEMI(1_000_000, 1200, 2, Frequency.DAILY);
      expect(result.numberOfInstallments).toBe(61);
      const totalPrincipal = result.installments.reduce((s, i) => s + i.principalPaise, 0);
      expect(totalPrincipal).toBe(1_000_000);

      // Interest should generally decrease over time
      for (let i = 1; i < result.installments.length - 1; i++) {
        expect(result.installments[i]!.interestPaise).toBeLessThanOrEqual(
          result.installments[i - 1]!.interestPaise,
        );
      }
    });

    it('reconciliation: principal always sums to original principal', () => {
      const result = calculateReducingBalanceEMI(5_555_555, 1800, 24, Frequency.MONTHLY);
      const totalPrincipal = result.installments.reduce((s, i) => s + i.principalPaise, 0);
      expect(totalPrincipal).toBe(5_555_555);
      for (const inst of result.installments) {
        expect(inst.totalPaise).toBe(inst.principalPaise + inst.interestPaise);
      }
    });
  });


  // ─── normalizeZero (tested indirectly) ───────────────────────────────────

  describe('normalizeZero (indirect via schedule generation)', () => {
    it('zero-rate flat schedule produces no negative zeros in installments', () => {
      const result = calculateFlatEMI(1_000_000, 0, 6, Frequency.MONTHLY);
      for (const inst of result.installments) {
        // Object.is distinguishes -0 from +0
        expect(Object.is(inst.principalPaise, -0)).toBe(false);
        expect(Object.is(inst.interestPaise, -0)).toBe(false);
        expect(Object.is(inst.totalPaise, -0)).toBe(false);
      }
    });

    it('zero-rate reducing balance produces no negative zeros', () => {
      const result = calculateReducingBalanceEMI(1_000_000, 0, 6, Frequency.MONTHLY);
      for (const inst of result.installments) {
        expect(Object.is(inst.principalPaise, -0)).toBe(false);
        expect(Object.is(inst.interestPaise, -0)).toBe(false);
        expect(Object.is(inst.totalPaise, -0)).toBe(false);
      }
    });

    it('zero-rate schedule totalInterestPaise is not negative zero', () => {
      const flat = calculateFlatEMI(500_000, 0, 3, Frequency.MONTHLY);
      expect(Object.is(flat.totalInterestPaise, -0)).toBe(false);
      expect(flat.totalInterestPaise).toBe(0);

      const reducing = calculateReducingBalanceEMI(500_000, 0, 3, Frequency.MONTHLY);
      expect(Object.is(reducing.totalInterestPaise, -0)).toBe(false);
      expect(reducing.totalInterestPaise).toBe(0);
    });
  });

  // ─── Principal + Interest sum to total payable (Req 1.7) ────────────────

  describe('principal + interest sum to total payable within 1 paisa tolerance', () => {
    it('flat monthly: components sum to total payable', () => {
      const result = calculateFlatEMI(10_000_000, 1200, 12, Frequency.MONTHLY);
      const totalP = result.installments.reduce((s, i) => s + i.principalPaise, 0);
      const totalI = result.installments.reduce((s, i) => s + i.interestPaise, 0);
      const totalPayable = totalP + totalI;
      const expectedPayable = 10_000_000 + result.totalInterestPaise;
      expect(Math.abs(totalPayable - expectedPayable)).toBeLessThanOrEqual(1);
    });

    it('flat weekly: components sum to total payable', () => {
      const result = calculateFlatEMI(2_500_000, 1500, 6, Frequency.WEEKLY);
      const totalP = result.installments.reduce((s, i) => s + i.principalPaise, 0);
      const totalI = result.installments.reduce((s, i) => s + i.interestPaise, 0);
      expect(Math.abs((totalP + totalI) - (2_500_000 + result.totalInterestPaise))).toBeLessThanOrEqual(1);
    });

    it('flat daily: components sum to total payable', () => {
      const result = calculateFlatEMI(1_000_000, 1200, 3, Frequency.DAILY);
      const totalP = result.installments.reduce((s, i) => s + i.principalPaise, 0);
      const totalI = result.installments.reduce((s, i) => s + i.interestPaise, 0);
      expect(Math.abs((totalP + totalI) - (1_000_000 + result.totalInterestPaise))).toBeLessThanOrEqual(1);
    });

    it('reducing monthly: components sum to total payable', () => {
      const result = calculateReducingBalanceEMI(10_000_000, 1200, 12, Frequency.MONTHLY);
      const totalP = result.installments.reduce((s, i) => s + i.principalPaise, 0);
      const totalI = result.installments.reduce((s, i) => s + i.interestPaise, 0);
      expect(Math.abs((totalP + totalI) - (10_000_000 + result.totalInterestPaise))).toBeLessThanOrEqual(1);
    });

    it('reducing weekly: components sum to total payable', () => {
      const result = calculateReducingBalanceEMI(2_500_000, 1500, 6, Frequency.WEEKLY);
      const totalP = result.installments.reduce((s, i) => s + i.principalPaise, 0);
      const totalI = result.installments.reduce((s, i) => s + i.interestPaise, 0);
      expect(Math.abs((totalP + totalI) - (2_500_000 + result.totalInterestPaise))).toBeLessThanOrEqual(1);
    });

    it('reducing daily: components sum to total payable', () => {
      const result = calculateReducingBalanceEMI(1_000_000, 1200, 3, Frequency.DAILY);
      const totalP = result.installments.reduce((s, i) => s + i.principalPaise, 0);
      const totalI = result.installments.reduce((s, i) => s + i.interestPaise, 0);
      expect(Math.abs((totalP + totalI) - (1_000_000 + result.totalInterestPaise))).toBeLessThanOrEqual(1);
    });

    it('each installment totalPaise = principalPaise + interestPaise', () => {
      const flat = calculateFlatEMI(7_777_777, 1500, 7, Frequency.MONTHLY);
      for (const inst of flat.installments) {
        expect(inst.totalPaise).toBe(inst.principalPaise + inst.interestPaise);
      }

      const reducing = calculateReducingBalanceEMI(7_777_777, 1500, 7, Frequency.MONTHLY);
      for (const inst of reducing.installments) {
        expect(inst.totalPaise).toBe(inst.principalPaise + inst.interestPaise);
      }
    });
  });

  // ─── Edge Cases (Req 1.8) ──────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('zero-interest flat schedule: all interest components are zero', () => {
      const result = calculateFlatEMI(1_000_000, 0, 6, Frequency.MONTHLY);
      expect(result.totalInterestPaise).toBe(0);
      expect(result.numberOfInstallments).toBe(6);
      const totalP = result.installments.reduce((s, i) => s + i.principalPaise, 0);
      expect(totalP).toBe(1_000_000);
      for (const inst of result.installments) {
        expect(inst.interestPaise).toBe(0);
        expect(inst.totalPaise).toBe(inst.principalPaise);
      }
    });

    it('zero-interest reducing balance: all interest components are zero', () => {
      const result = calculateReducingBalanceEMI(1_000_000, 0, 6, Frequency.MONTHLY);
      expect(result.numberOfInstallments).toBe(6);
      const totalP = result.installments.reduce((s, i) => s + i.principalPaise, 0);
      expect(totalP).toBe(1_000_000);
      for (const inst of result.installments) {
        expect(inst.interestPaise).toBe(0);
        expect(inst.totalPaise).toBe(inst.principalPaise);
      }
    });

    it('single installment: entire principal and interest in one payment', () => {
      const flatResult = calculateFlatEMI(10_000_00, 2400, 1, Frequency.MONTHLY);
      expect(flatResult.numberOfInstallments).toBe(1);
      expect(flatResult.installments[0]!.principalPaise).toBe(10_000_00);
      expect(flatResult.totalInterestPaise).toBe(20_000);
      expect(flatResult.installments[0]!.totalPaise).toBe(10_000_00 + 20_000);

      const reducingResult = calculateReducingBalanceEMI(10_000_00, 2400, 1, Frequency.MONTHLY);
      expect(reducingResult.numberOfInstallments).toBe(1);
      expect(reducingResult.installments[0]!.principalPaise).toBe(10_000_00);
      expect(reducingResult.installments[0]!.interestPaise).toBe(20_000);
    });

    it('maximum tenure (360 months) flat schedule reconciles', () => {
      const result = calculateFlatEMI(10_000_000, 1200, 360, Frequency.MONTHLY);
      expect(result.numberOfInstallments).toBe(360);
      const totalP = result.installments.reduce((s, i) => s + i.principalPaise, 0);
      const totalI = result.installments.reduce((s, i) => s + i.interestPaise, 0);
      expect(totalP).toBe(10_000_000);
      expect(totalI).toBe(result.totalInterestPaise);
      // total_interest = 10000000 × 0.12 × 30 = 36000000
      expect(result.totalInterestPaise).toBe(36_000_000);
    });

    it('maximum tenure (360 months) reducing balance reconciles', () => {
      const result = calculateReducingBalanceEMI(10_000_000, 1200, 360, Frequency.MONTHLY);
      expect(result.numberOfInstallments).toBe(360);
      const totalP = result.installments.reduce((s, i) => s + i.principalPaise, 0);
      expect(totalP).toBe(10_000_000);
    });

    it('minimum principal (100 paise) flat schedule reconciles', () => {
      const result = calculateFlatEMI(100, 1200, 1, Frequency.MONTHLY);
      expect(result.numberOfInstallments).toBe(1);
      expect(result.installments[0]!.principalPaise).toBe(100);
      const totalP = result.installments.reduce((s, i) => s + i.principalPaise, 0);
      expect(totalP).toBe(100);
    });

    it('minimum principal (100 paise) reducing balance reconciles', () => {
      const result = calculateReducingBalanceEMI(100, 1200, 1, Frequency.MONTHLY);
      expect(result.numberOfInstallments).toBe(1);
      expect(result.installments[0]!.principalPaise).toBe(100);
    });

    it('minimum principal (100 paise) with multiple installments', () => {
      const result = calculateFlatEMI(100, 1200, 3, Frequency.MONTHLY);
      expect(result.numberOfInstallments).toBe(3);
      const totalP = result.installments.reduce((s, i) => s + i.principalPaise, 0);
      expect(totalP).toBe(100);
      // All amounts should be non-negative
      for (const inst of result.installments) {
        expect(inst.principalPaise).toBeGreaterThanOrEqual(0);
        expect(inst.interestPaise).toBeGreaterThanOrEqual(0);
        expect(inst.totalPaise).toBeGreaterThanOrEqual(0);
      }
    });

    it('maximum principal (10 billion paise) flat schedule reconciles', () => {
      const result = calculateFlatEMI(10_000_000_000, 1200, 12, Frequency.MONTHLY);
      expect(result.numberOfInstallments).toBe(12);
      const totalP = result.installments.reduce((s, i) => s + i.principalPaise, 0);
      expect(totalP).toBe(10_000_000_000);
      const totalI = result.installments.reduce((s, i) => s + i.interestPaise, 0);
      expect(totalI).toBe(result.totalInterestPaise);
    });

    it('maximum principal (10 billion paise) reducing balance reconciles', () => {
      const result = calculateReducingBalanceEMI(10_000_000_000, 1200, 12, Frequency.MONTHLY);
      expect(result.numberOfInstallments).toBe(12);
      const totalP = result.installments.reduce((s, i) => s + i.principalPaise, 0);
      expect(totalP).toBe(10_000_000_000);
    });

    it('maximum rate (10000 bps = 100%) flat schedule reconciles', () => {
      const result = calculateFlatEMI(1_000_000, 10000, 12, Frequency.MONTHLY);
      expect(result.numberOfInstallments).toBe(12);
      // total_interest = 1000000 × 1.0 × 1 = 1000000
      expect(result.totalInterestPaise).toBe(1_000_000);
      const totalP = result.installments.reduce((s, i) => s + i.principalPaise, 0);
      expect(totalP).toBe(1_000_000);
      const totalI = result.installments.reduce((s, i) => s + i.interestPaise, 0);
      expect(totalI).toBe(1_000_000);
    });

    it('maximum rate (10000 bps = 100%) reducing balance reconciles', () => {
      const result = calculateReducingBalanceEMI(1_000_000, 10000, 12, Frequency.MONTHLY);
      expect(result.numberOfInstallments).toBe(12);
      const totalP = result.installments.reduce((s, i) => s + i.principalPaise, 0);
      expect(totalP).toBe(1_000_000);
      // All amounts non-negative
      for (const inst of result.installments) {
        expect(inst.principalPaise).toBeGreaterThanOrEqual(0);
        expect(inst.interestPaise).toBeGreaterThanOrEqual(0);
      }
    });

    it('reducing balance known amortization: 12% on ₹1,00,000 for 12 months', () => {
      const result = calculateReducingBalanceEMI(10_000_000, 1200, 12, Frequency.MONTHLY);

      expect(result.numberOfInstallments).toBe(12);

      // First installment: interest = 10000000 × 0.01 = 100000
      expect(result.installments[0]!.interestPaise).toBe(100_000);
      const firstPrincipal = result.installments[0]!.principalPaise;
      expect(firstPrincipal).toBe(result.emiPaise - 100_000);

      // Second installment: interest = (10000000 - firstPrincipal) × 0.01
      const outstandingAfterFirst = 10_000_000 - firstPrincipal;
      const expectedSecondInterest = Math.round(outstandingAfterFirst * 0.01);
      expect(Math.abs(result.installments[1]!.interestPaise - expectedSecondInterest)).toBeLessThanOrEqual(1);

      const totalP = result.installments.reduce((s, i) => s + i.principalPaise, 0);
      expect(totalP).toBe(10_000_000);

      // Total interest should be less than flat interest
      const flatResult = calculateFlatEMI(10_000_000, 1200, 12, Frequency.MONTHLY);
      expect(result.totalInterestPaise).toBeLessThan(flatResult.totalInterestPaise);
    });

    it('maximum tenure (60 months) flat schedule reconciles', () => {
      const result = calculateFlatEMI(50_000_00, 1200, 60, Frequency.MONTHLY);
      expect(result.numberOfInstallments).toBe(60);
      const totalP = result.installments.reduce((s, i) => s + i.principalPaise, 0);
      const totalI = result.installments.reduce((s, i) => s + i.interestPaise, 0);
      expect(totalP).toBe(50_000_00);
      expect(totalI).toBe(result.totalInterestPaise);
      expect(result.totalInterestPaise).toBe(3_000_000);
    });

    it('maximum tenure (60 months) reducing balance reconciles', () => {
      const result = calculateReducingBalanceEMI(50_000_00, 1200, 60, Frequency.MONTHLY);
      expect(result.numberOfInstallments).toBe(60);
      const totalP = result.installments.reduce((s, i) => s + i.principalPaise, 0);
      expect(totalP).toBe(50_000_00);
      for (let i = 1; i < result.installments.length - 1; i++) {
        expect(result.installments[i]!.interestPaise).toBeLessThanOrEqual(
          result.installments[i - 1]!.interestPaise,
        );
      }
    });
  });

  // ─── generateDueDates ────────────────────────────────────────────────────

  describe('generateDueDates', () => {
    it('monthly: generates dates 1 month apart', () => {
      const start = new Date(2024, 0, 15); // Jan 15, 2024
      const dates = generateDueDates(start, 3, Frequency.MONTHLY);
      expect(dates).toHaveLength(3);
      expect(dates[0]!.getMonth()).toBe(1); // Feb
      expect(dates[1]!.getMonth()).toBe(2); // Mar
      expect(dates[2]!.getMonth()).toBe(3); // Apr
      for (const d of dates) {
        expect(d.getDate()).toBe(15);
      }
    });

    it('weekly: generates dates 7 days apart', () => {
      const start = new Date(2024, 0, 1); // Jan 1, 2024
      const dates = generateDueDates(start, 4, Frequency.WEEKLY);
      expect(dates).toHaveLength(4);
      expect(dates[0]!.getDate()).toBe(8);
      expect(dates[1]!.getDate()).toBe(15);
      expect(dates[2]!.getDate()).toBe(22);
      expect(dates[3]!.getDate()).toBe(29);
    });

    it('daily: generates dates 1 day apart', () => {
      const start = new Date(2024, 0, 1);
      const dates = generateDueDates(start, 5, Frequency.DAILY);
      expect(dates).toHaveLength(5);
      expect(dates[0]!.getDate()).toBe(2);
      expect(dates[4]!.getDate()).toBe(6);
    });

    it('dates are strictly monotonically increasing', () => {
      const start = new Date(2024, 0, 1);
      for (const freq of [Frequency.MONTHLY, Frequency.WEEKLY, Frequency.DAILY]) {
        const dates = generateDueDates(start, 10, freq);
        for (let i = 1; i < dates.length; i++) {
          expect(dates[i]!.getTime()).toBeGreaterThan(dates[i - 1]!.getTime());
        }
      }
    });

    it('zero count returns empty array', () => {
      const dates = generateDueDates(new Date(2024, 0, 1), 0, Frequency.MONTHLY);
      expect(dates).toHaveLength(0);
    });

    it('monthly dates handle month-end rollover (clamps to last day of target month)', () => {
      // Starting Jan 31 — Feb doesn't have 31 days
      const start = new Date(2024, 0, 31);
      const dates = generateDueDates(start, 3, Frequency.MONTHLY);
      expect(dates).toHaveLength(3);
      // Post-fix: Jan 31 + 1mo → Feb 29 (2024 leap year), NOT Mar 2 as
      // raw setMonth would produce. addMonthsClamped pins the day to the
      // last valid day of the target month.
      expect(dates[0]!.getMonth()).toBe(1); // February
      expect(dates[0]!.getDate()).toBe(29);
      expect(dates[1]!.getMonth()).toBe(2); // March
      expect(dates[1]!.getDate()).toBe(31);
      expect(dates[2]!.getMonth()).toBe(3); // April
      expect(dates[2]!.getDate()).toBe(30);
    });
  });

  // ─── adjustForHolidays ──────────────────────────────────────────────────

  describe('adjustForHolidays', () => {
    it('shifts due dates falling on holidays to next business day', () => {
      const dueDates = [
        new Date(2024, 0, 15), // Jan 15 — holiday
        new Date(2024, 1, 15), // Feb 15 — not a holiday
      ];
      const holidays = [new Date(2024, 0, 15)];
      const adjusted = adjustForHolidays(dueDates, holidays);
      expect(adjusted[0]!.getDate()).toBe(16);
      expect(adjusted[1]!.getDate()).toBe(15);
    });

    it('shifts past consecutive holidays', () => {
      const dueDates = [new Date(2024, 0, 15)];
      const holidays = [
        new Date(2024, 0, 15),
        new Date(2024, 0, 16),
        new Date(2024, 0, 17),
      ];
      const adjusted = adjustForHolidays(dueDates, holidays);
      expect(adjusted[0]!.getDate()).toBe(18);
    });

    it('returns unchanged dates when no holidays', () => {
      const dueDates = [new Date(2024, 5, 10)];
      const adjusted = adjustForHolidays(dueDates, []);
      expect(adjusted[0]!.getDate()).toBe(10);
    });

    it('handles empty due dates', () => {
      const adjusted = adjustForHolidays([], [new Date(2024, 0, 1)]);
      expect(adjusted).toHaveLength(0);
    });

    it('does not modify original due dates array', () => {
      const original = new Date(2024, 0, 15);
      const dueDates = [original];
      const holidays = [new Date(2024, 0, 15)];
      adjustForHolidays(dueDates, holidays);
      expect(original.getDate()).toBe(15); // original unchanged
    });
  });

  // ─── generateSchedule (integration of all pieces) ───────────────────────

  describe('generateSchedule', () => {
    it('flat interest schedule with holidays', () => {
      const params: ScheduleParams = {
        principalPaise: 10_000_000,
        annualRateBps: 1200,
        tenureMonths: 3,
        interestType: InterestType.FLAT,
        frequency: Frequency.MONTHLY,
        startDate: new Date(2024, 0, 1),
        holidays: [new Date(2024, 1, 1)],
      };

      const schedule = generateSchedule(params);
      expect(schedule).toHaveLength(3);

      // First due date: Feb 1 → shifted to Feb 2 (holiday adjustment)
      expect(schedule[0]!.dueDate.getMonth()).toBe(1);
      expect(schedule[0]!.dueDate.getDate()).toBe(2);

      const totalP = schedule.reduce((s, i) => s + i.principalPaise, 0);
      expect(totalP).toBe(10_000_000);
    });

    it('reducing balance schedule produces correct installment count', () => {
      const params: ScheduleParams = {
        principalPaise: 5_000_000,
        annualRateBps: 1800,
        tenureMonths: 6,
        interestType: InterestType.REDUCING_BALANCE,
        frequency: Frequency.WEEKLY,
        startDate: new Date(2024, 0, 1),
        holidays: [],
      };

      const schedule = generateSchedule(params);
      // Updated: 6 × 52/12 = 26 weekly installments
      expect(schedule).toHaveLength(26);

      const totalP = schedule.reduce((s, i) => s + i.principalPaise, 0);
      expect(totalP).toBe(5_000_000);
    });

    it('determinism: same inputs produce identical output', () => {
      const params: ScheduleParams = {
        principalPaise: 3_000_000,
        annualRateBps: 1500,
        tenureMonths: 12,
        interestType: InterestType.FLAT,
        frequency: Frequency.MONTHLY,
        startDate: new Date(2024, 0, 1),
        holidays: [new Date(2024, 3, 1)],
      };

      const schedule1 = generateSchedule(params);
      const schedule2 = generateSchedule(params);

      expect(JSON.stringify(schedule1)).toBe(JSON.stringify(schedule2));
    });

    it('uses buildScheduleParams factory with defaults', () => {
      const params = buildScheduleParams();
      const schedule = generateSchedule(params);
      // Default: 12 months, monthly → 12 installments
      expect(schedule).toHaveLength(12);
      const totalP = schedule.reduce((s, i) => s + i.principalPaise, 0);
      expect(totalP).toBe(100_000_00);
    });

    it('uses buildScheduleParams factory with overrides', () => {
      const params = buildScheduleParams({
        principalPaise: 5_000_000,
        tenureMonths: 6,
        frequency: Frequency.WEEKLY,
        interestType: InterestType.REDUCING_BALANCE,
      });
      const schedule = generateSchedule(params);
      // Updated: 6 × 52/12 = 26 weekly installments (calendar-accurate)
      expect(schedule).toHaveLength(26);
      const totalP = schedule.reduce((s, i) => s + i.principalPaise, 0);
      expect(totalP).toBe(5_000_000);
    });

    it('daily frequency schedule with factory', () => {
      const params = buildScheduleParams({
        principalPaise: 300_000,
        tenureMonths: 1,
        frequency: Frequency.DAILY,
      });
      const schedule = generateSchedule(params);
      // Updated: ceil(1 × 365.25 / 12) = ceil(30.4375) = 31 daily installments
      expect(schedule).toHaveLength(31);
      const totalP = schedule.reduce((s, i) => s + i.principalPaise, 0);
      expect(totalP).toBe(300_000);
    });

    it('all installment amounts are non-negative integers', () => {
      const params = buildScheduleParams({
        principalPaise: 7_777_777,
        annualRateBps: 1500,
        tenureMonths: 24,
      });
      const schedule = generateSchedule(params);
      for (const inst of schedule) {
        expect(Number.isInteger(inst.principalPaise)).toBe(true);
        expect(Number.isInteger(inst.interestPaise)).toBe(true);
        expect(Number.isInteger(inst.totalPaise)).toBe(true);
        expect(inst.principalPaise).toBeGreaterThanOrEqual(0);
        expect(inst.interestPaise).toBeGreaterThanOrEqual(0);
        expect(inst.totalPaise).toBeGreaterThanOrEqual(0);
      }
    });

    it('installment numbers are sequential starting from 1', () => {
      const params = buildScheduleParams({ tenureMonths: 6 });
      const schedule = generateSchedule(params);
      for (let i = 0; i < schedule.length; i++) {
        expect(schedule[i]!.installmentNumber).toBe(i + 1);
      }
    });

    it('due dates are strictly monotonically increasing', () => {
      const params = buildScheduleParams({ tenureMonths: 12 });
      const schedule = generateSchedule(params);
      for (let i = 1; i < schedule.length; i++) {
        expect(schedule[i]!.dueDate.getTime()).toBeGreaterThan(
          schedule[i - 1]!.dueDate.getTime(),
        );
      }
    });
  });
});
