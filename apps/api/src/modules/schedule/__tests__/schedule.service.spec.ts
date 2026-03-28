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
import Decimal from 'decimal.js';

describe('Schedule Service — Unit Tests', () => {
  // ─── deriveInstallmentCount ──────────────────────────────────────────────

  describe('deriveInstallmentCount', () => {
    it('monthly: N = tenureMonths', () => {
      expect(deriveInstallmentCount(12, Frequency.MONTHLY)).toBe(12);
    });

    it('weekly: N = tenureMonths × 4', () => {
      expect(deriveInstallmentCount(6, Frequency.WEEKLY)).toBe(24);
    });

    it('daily: N = tenureMonths × 30', () => {
      expect(deriveInstallmentCount(3, Frequency.DAILY)).toBe(90);
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
  });

  // ─── calculateFlatEMI ────────────────────────────────────────────────────

  describe('calculateFlatEMI', () => {
    it('12% flat on ₹1,00,000 for 12 months — verify exact values', () => {
      // Principal: 10000000 paise (₹1,00,000)
      // Rate: 1200 bps (12%)
      // Tenure: 12 months
      // total_interest = 10000000 × 1200/10000 × 12/12 = 10000000 × 0.12 × 1 = 1200000 paise
      // N = 12 (monthly)
      // per_principal = 10000000 / 12 = 833333.33... → 833333 paise (ROUND_HALF_UP)
      // per_interest = 1200000 / 12 = 100000 paise (exact)
      const result = calculateFlatEMI(10_000_000, 1200, 12, Frequency.MONTHLY);

      expect(result.totalInterestPaise).toBe(1_200_000);
      expect(result.numberOfInstallments).toBe(12);

      // Sum of all principal must equal principal
      const totalPrincipal = result.installments.reduce((s, i) => s + i.principalPaise, 0);
      expect(totalPrincipal).toBe(10_000_000);

      // Sum of all interest must equal total interest
      const totalInterest = result.installments.reduce((s, i) => s + i.interestPaise, 0);
      expect(totalInterest).toBe(1_200_000);

      // First 11 installments should have equal principal
      for (let i = 0; i < 11; i++) {
        expect(result.installments[i]!.principalPaise).toBe(833333);
        expect(result.installments[i]!.interestPaise).toBe(100000);
      }

      // Last installment absorbs rounding difference
      // 10000000 - 833333 × 11 = 10000000 - 9166663 = 833337
      expect(result.installments[11]!.principalPaise).toBe(833337);
      expect(result.installments[11]!.interestPaise).toBe(100000);
    });

    it('handles single installment (tenure = 1 month, monthly)', () => {
      const result = calculateFlatEMI(500_000, 2400, 1, Frequency.MONTHLY);
      // total_interest = 500000 × 2400/10000 × 1/12 = 500000 × 0.24 / 12 = 10000
      expect(result.numberOfInstallments).toBe(1);
      expect(result.totalInterestPaise).toBe(10_000);
      expect(result.installments[0]!.principalPaise).toBe(500_000);
      expect(result.installments[0]!.interestPaise).toBe(10_000);
      expect(result.installments[0]!.totalPaise).toBe(510_000);
    });

    it('weekly frequency produces correct installment count', () => {
      const result = calculateFlatEMI(1_000_000, 1200, 3, Frequency.WEEKLY);
      // N = 3 × 4 = 12
      expect(result.numberOfInstallments).toBe(12);
      // total_interest = 1000000 × 0.12 × 3/12 = 30000
      expect(result.totalInterestPaise).toBe(30_000);
    });

    it('daily frequency produces correct installment count', () => {
      const result = calculateFlatEMI(1_000_000, 1200, 2, Frequency.DAILY);
      // N = 2 × 30 = 60
      expect(result.numberOfInstallments).toBe(60);
    });

    it('reconciliation: sum of components always equals totals', () => {
      const result = calculateFlatEMI(7_777_777, 1500, 7, Frequency.MONTHLY);
      const totalP = result.installments.reduce((s, i) => s + i.principalPaise, 0);
      const totalI = result.installments.reduce((s, i) => s + i.interestPaise, 0);
      expect(totalP).toBe(7_777_777);
      expect(totalI).toBe(result.totalInterestPaise);
      // Each installment's total = principal + interest
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

      // Sum of all principal must equal principal
      const totalPrincipal = result.installments.reduce((s, i) => s + i.principalPaise, 0);
      expect(totalPrincipal).toBe(10_000_000);

      // Each installment's total = principal + interest
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
      // With 1 installment: EMI = P × r × (1+r)^1 / ((1+r)^1 - 1) = P × r × (1+r) / r = P × (1+r)
      // = 500000 × 1.01 = 505000
      expect(result.installments[0]!.principalPaise).toBe(500_000);
      expect(result.installments[0]!.interestPaise).toBe(5_000);
    });

    it('weekly frequency reducing balance', () => {
      const result = calculateReducingBalanceEMI(1_000_000, 1200, 3, Frequency.WEEKLY);
      expect(result.numberOfInstallments).toBe(12);
      const totalPrincipal = result.installments.reduce((s, i) => s + i.principalPaise, 0);
      expect(totalPrincipal).toBe(1_000_000);
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

  // ─── Edge Cases (Task 8.8) ─────────────────────────────────────────────

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

    it('maximum tenure (60 months) flat schedule reconciles', () => {
      const result = calculateFlatEMI(50_000_00, 1200, 60, Frequency.MONTHLY);
      expect(result.numberOfInstallments).toBe(60);
      const totalP = result.installments.reduce((s, i) => s + i.principalPaise, 0);
      const totalI = result.installments.reduce((s, i) => s + i.interestPaise, 0);
      expect(totalP).toBe(50_000_00);
      expect(totalI).toBe(result.totalInterestPaise);
      // total_interest = 5000000 × 0.12 × 5 = 3000000
      expect(result.totalInterestPaise).toBe(3_000_000);
    });

    it('maximum tenure (60 months) reducing balance reconciles', () => {
      const result = calculateReducingBalanceEMI(50_000_00, 1200, 60, Frequency.MONTHLY);
      expect(result.numberOfInstallments).toBe(60);
      const totalP = result.installments.reduce((s, i) => s + i.principalPaise, 0);
      expect(totalP).toBe(50_000_00);
      // Interest should decrease over time
      for (let i = 1; i < result.installments.length - 1; i++) {
        expect(result.installments[i]!.interestPaise).toBeLessThanOrEqual(
          result.installments[i - 1]!.interestPaise,
        );
      }
    });

    it('reducing balance known amortization: 12% on ₹1,00,000 for 12 months', () => {
      // Verify the first few installments against known amortization values
      // Monthly rate = 1200/10000/12 = 0.01
      // EMI = 10000000 × 0.01 × 1.01^12 / (1.01^12 - 1)
      // Using Decimal.js: EMI ≈ 888488 paise (rounded)
      const result = calculateReducingBalanceEMI(10_000_000, 1200, 12, Frequency.MONTHLY);

      expect(result.numberOfInstallments).toBe(12);

      // First installment: interest = 10000000 × 0.01 = 100000
      expect(result.installments[0]!.interestPaise).toBe(100_000);
      // First principal = EMI - 100000
      const firstPrincipal = result.installments[0]!.principalPaise;
      expect(firstPrincipal).toBe(result.emiPaise - 100_000);

      // Second installment: interest = (10000000 - firstPrincipal) × 0.01
      const outstandingAfterFirst = 10_000_000 - firstPrincipal;
      const expectedSecondInterest = Math.round(outstandingAfterFirst * 0.01);
      // Allow ±1 paise for rounding
      expect(Math.abs(result.installments[1]!.interestPaise - expectedSecondInterest)).toBeLessThanOrEqual(1);

      // Total principal must equal original
      const totalP = result.installments.reduce((s, i) => s + i.principalPaise, 0);
      expect(totalP).toBe(10_000_000);

      // Total interest should be less than flat interest (reducing balance always cheaper)
      const flatResult = calculateFlatEMI(10_000_000, 1200, 12, Frequency.MONTHLY);
      expect(result.totalInterestPaise).toBeLessThan(flatResult.totalInterestPaise);
    });

    it('single installment: entire principal and interest in one payment', () => {
      const flatResult = calculateFlatEMI(10_000_00, 2400, 1, Frequency.MONTHLY);
      expect(flatResult.numberOfInstallments).toBe(1);
      expect(flatResult.installments[0]!.principalPaise).toBe(10_000_00);
      // total_interest = 1000000 × 0.24 × 1/12 = 20000
      expect(flatResult.totalInterestPaise).toBe(20_000);
      expect(flatResult.installments[0]!.totalPaise).toBe(10_000_00 + 20_000);

      const reducingResult = calculateReducingBalanceEMI(10_000_00, 2400, 1, Frequency.MONTHLY);
      expect(reducingResult.numberOfInstallments).toBe(1);
      expect(reducingResult.installments[0]!.principalPaise).toBe(10_000_00);
      // interest = 1000000 × (2400/10000/12) = 1000000 × 0.02 = 20000
      expect(reducingResult.installments[0]!.interestPaise).toBe(20_000);
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
      // Day should remain 15
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
      expect(adjusted[0]!.getDate()).toBe(16); // shifted to Jan 16
      expect(adjusted[1]!.getDate()).toBe(15); // unchanged
    });

    it('shifts past consecutive holidays', () => {
      const dueDates = [new Date(2024, 0, 15)];
      const holidays = [
        new Date(2024, 0, 15),
        new Date(2024, 0, 16),
        new Date(2024, 0, 17),
      ];
      const adjusted = adjustForHolidays(dueDates, holidays);
      expect(adjusted[0]!.getDate()).toBe(18); // shifted past 3 consecutive holidays
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
        startDate: new Date(2024, 0, 1), // Jan 1, 2024
        holidays: [new Date(2024, 1, 1)], // Feb 1 is a holiday
      };

      const schedule = generateSchedule(params);
      expect(schedule).toHaveLength(3);

      // First due date: Feb 1 → shifted to Feb 2 (holiday adjustment)
      expect(schedule[0]!.dueDate.getMonth()).toBe(1);
      expect(schedule[0]!.dueDate.getDate()).toBe(2);

      // Principal reconciliation
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
      // weekly, 6 months → 24 installments
      expect(schedule).toHaveLength(24);

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
  });
});
