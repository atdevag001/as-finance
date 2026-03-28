import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  calculateFlatEMI,
  calculateReducingBalanceEMI,
  generateSchedule,
  generateDueDates,
  adjustForHolidays,
  type ScheduleParams,
} from '../schedule.service';
import { InterestType, Frequency } from '@as-finance/shared';

// ─── Shared Generators ─────────────────────────────────────────────────────

/** Valid principal in paise: ₹1,000 to ₹1,00,000 */
const principalPaiseArb = fc.integer({ min: 100_00, max: 100_000_00 });

/** Valid annual rate in basis points: 1% to 50% */
const annualRateBpsArb = fc.integer({ min: 100, max: 5000 });

/** Valid tenure in months: 1 to 60 */
const tenureMonthsArb = fc.integer({ min: 1, max: 60 });

/** Valid frequency */
const frequencyArb = fc.constantFrom(Frequency.MONTHLY, Frequency.WEEKLY, Frequency.DAILY);

/** Valid interest type */
const interestTypeArb = fc.constantFrom(InterestType.FLAT, InterestType.REDUCING_BALANCE);

/** Valid start date */
const startDateArb = fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') });

/** Holiday calendar generator — up to 20 unique holidays */
const holidayCalendarArb = fc.array(
  fc.date({ min: new Date('2020-01-01'), max: new Date('2031-12-31') }),
  { minLength: 0, maxLength: 20 },
);

// ─── Property 1: Schedule Reconciliation (Flat Interest) ────────────────────

/**
 * Feature: as-finance-loan-management-system, Property 1: Schedule Reconciliation (Flat Interest)
 *
 * For all valid flat-interest loan parameters (principal in paise, annual rate in bps,
 * tenure in months), the generated schedule SHALL satisfy:
 *   sum(installment[i].principal_paise) == principal_paise
 *   AND sum(installment[i].interest_paise) == total_interest_paise
 * with any rounding difference confined to the last installment only.
 *
 * **Validates: Requirements 4.2, 4.6, 25.1**
 */
describe('Property 1: Schedule Reconciliation (Flat Interest)', () => {
  it('sum(principal_paise) == principal AND sum(interest_paise) == total_interest, rounding in last installment only', () => {
    fc.assert(
      fc.property(
        principalPaiseArb,
        annualRateBpsArb,
        tenureMonthsArb,
        frequencyArb,
        (principalPaise, annualRateBps, tenureMonths, frequency) => {
          const result = calculateFlatEMI(principalPaise, annualRateBps, tenureMonths, frequency);

          // 1. Sum of all principal components must equal the original principal
          const totalPrincipal = result.installments.reduce((s, i) => s + i.principalPaise, 0);
          expect(totalPrincipal).toBe(principalPaise);

          // 2. Sum of all interest components must equal total interest
          const totalInterest = result.installments.reduce((s, i) => s + i.interestPaise, 0);
          expect(totalInterest).toBe(result.totalInterestPaise);

          // 3. Each installment's total must equal principal + interest
          for (const inst of result.installments) {
            expect(inst.totalPaise).toBe(inst.principalPaise + inst.interestPaise);
          }

          // 4. Rounding difference confined to last installment only:
          //    All installments except the last should have the same principal and interest
          if (result.installments.length > 1) {
            const firstPrincipal = result.installments[0]!.principalPaise;
            const firstInterest = result.installments[0]!.interestPaise;
            for (let i = 1; i < result.installments.length - 1; i++) {
              expect(result.installments[i]!.principalPaise).toBe(firstPrincipal);
              expect(result.installments[i]!.interestPaise).toBe(firstInterest);
            }
          }

          // 5. Number of installments must be correct
          expect(result.numberOfInstallments).toBe(result.installments.length);
        },
      ),
      { numRuns: 1000 },
    );
  });
});


// ─── Property 2: Schedule Reconciliation (Reducing Balance) ─────────────────

/**
 * Feature: as-finance-loan-management-system, Property 2: Schedule Reconciliation (Reducing Balance)
 *
 * For all valid reducing-balance loan parameters (principal in paise, annual rate in bps,
 * tenure in months), the generated schedule SHALL satisfy:
 *   sum(installment[i].principal_paise) == principal_paise
 * with any rounding difference confined to the last installment only.
 *
 * **Validates: Requirements 4.3, 4.6, 25.1**
 */
describe('Property 2: Schedule Reconciliation (Reducing Balance)', () => {
  it('sum(principal_paise) == principal, rounding in last installment only', () => {
    fc.assert(
      fc.property(
        principalPaiseArb,
        annualRateBpsArb,
        tenureMonthsArb,
        frequencyArb,
        (principalPaise, annualRateBps, tenureMonths, frequency) => {
          const result = calculateReducingBalanceEMI(principalPaise, annualRateBps, tenureMonths, frequency);

          // 1. Sum of all principal components must equal the original principal
          const totalPrincipal = result.installments.reduce((s, i) => s + i.principalPaise, 0);
          expect(totalPrincipal).toBe(principalPaise);

          // 2. Each installment's total must equal principal + interest
          for (const inst of result.installments) {
            expect(inst.totalPaise).toBe(inst.principalPaise + inst.interestPaise);
          }

          // 3. Number of installments must be correct
          expect(result.numberOfInstallments).toBe(result.installments.length);

          // 4. Rounding difference confined to last installment only:
          //    All non-last installments should have the same EMI (principal + interest = emiPaise)
          //    Only the last installment may differ due to rounding absorption
          if (result.installments.length > 1) {
            for (let i = 0; i < result.installments.length - 1; i++) {
              expect(result.installments[i]!.totalPaise).toBe(result.emiPaise);
            }
          }
        },
      ),
      { numRuns: 1000 },
    );
  });
});


// ─── Property 3: Schedule Determinism ────────────────────────────────────────

/**
 * Feature: as-finance-loan-management-system, Property 3: Schedule Determinism
 *
 * For all valid schedule generation inputs (principal, rate, tenure, start date,
 * frequency, interest type, holiday calendar), generating the schedule twice with
 * identical inputs SHALL produce byte-identical output.
 *
 * **Validates: Requirements 4.5, 21.6, 25.10**
 */
describe('Property 3: Schedule Determinism', () => {
  it('generating schedule twice with identical inputs produces byte-identical output', () => {
    fc.assert(
      fc.property(
        principalPaiseArb,
        annualRateBpsArb,
        tenureMonthsArb,
        interestTypeArb,
        frequencyArb,
        startDateArb,
        holidayCalendarArb,
        (principalPaise, annualRateBps, tenureMonths, interestType, frequency, startDate, holidays) => {
          const params: ScheduleParams = {
            principalPaise,
            annualRateBps,
            tenureMonths,
            interestType,
            frequency,
            startDate,
            holidays,
          };

          const schedule1 = generateSchedule(params);
          const schedule2 = generateSchedule(params);

          // Byte-identical: JSON serialization must match exactly
          expect(JSON.stringify(schedule1)).toBe(JSON.stringify(schedule2));
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ─── Property 4: Schedule Round-Trip ─────────────────────────────────────────

/**
 * Feature: as-finance-loan-management-system, Property 4: Schedule Round-Trip
 *
 * For all valid generated schedules, serializing the schedule to its storage
 * representation (JSON) and parsing it back SHALL produce an equivalent schedule object.
 *
 * **Validates: Requirements 4.10**
 */
describe('Property 4: Schedule Round-Trip', () => {
  it('serialize → parse → serialize produces equivalent object', () => {
    fc.assert(
      fc.property(
        principalPaiseArb,
        annualRateBpsArb,
        tenureMonthsArb,
        interestTypeArb,
        frequencyArb,
        startDateArb,
        holidayCalendarArb,
        (principalPaise, annualRateBps, tenureMonths, interestType, frequency, startDate, holidays) => {
          const params: ScheduleParams = {
            principalPaise,
            annualRateBps,
            tenureMonths,
            interestType,
            frequency,
            startDate,
            holidays,
          };

          const schedule = generateSchedule(params);

          // Serialize to JSON (storage representation)
          const serialized = JSON.stringify(schedule);

          // Parse back
          const parsed = JSON.parse(serialized);

          // Serialize again
          const reSerialized = JSON.stringify(parsed);

          // Round-trip: serialize → parse → serialize must be identical
          expect(reSerialized).toBe(serialized);

          // Verify structural equivalence: all numeric fields preserved
          expect(parsed).toHaveLength(schedule.length);
          for (let i = 0; i < schedule.length; i++) {
            expect(parsed[i].installmentNumber).toBe(schedule[i]!.installmentNumber);
            expect(parsed[i].principalPaise).toEqual(schedule[i]!.principalPaise);
            expect(parsed[i].interestPaise).toEqual(schedule[i]!.interestPaise);
            expect(parsed[i].totalPaise).toEqual(schedule[i]!.totalPaise);
            // Date round-trips as ISO string
            expect(new Date(parsed[i].dueDate).toISOString()).toBe(schedule[i]!.dueDate.toISOString());
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ─── Property 5: Due Date Generation with Holiday Adjustment ─────────────────

/**
 * Feature: as-finance-loan-management-system, Property 5: Due Date Generation with Holiday Adjustment
 *
 * For all valid start dates, frequencies (daily/weekly/monthly), and holiday calendars,
 * the generated due dates SHALL be correctly spaced by the frequency interval, and no
 * due date SHALL fall on a date present in the holiday calendar. Each holiday-shifted
 * date SHALL be the next calendar day not in the holiday set.
 *
 * **Validates: Requirements 4.7, 4.8**
 */
describe('Property 5: Due Date Generation with Holiday Adjustment', () => {
  it('due dates are correctly spaced and no due date falls on a holiday', () => {
    fc.assert(
      fc.property(
        startDateArb,
        fc.integer({ min: 1, max: 24 }),
        frequencyArb,
        holidayCalendarArb,
        (startDate, count, frequency, holidays) => {
          // Generate raw due dates
          const rawDates = generateDueDates(startDate, count, frequency);

          // Verify correct count
          expect(rawDates).toHaveLength(count);

          // Verify raw dates are correctly spaced
          for (let i = 0; i < rawDates.length; i++) {
            const expected = new Date(startDate);
            switch (frequency) {
              case Frequency.MONTHLY:
                expected.setMonth(expected.getMonth() + (i + 1));
                break;
              case Frequency.WEEKLY:
                expected.setDate(expected.getDate() + (i + 1) * 7);
                break;
              case Frequency.DAILY:
                expected.setDate(expected.getDate() + (i + 1));
                break;
            }
            expect(rawDates[i]!.getFullYear()).toBe(expected.getFullYear());
            expect(rawDates[i]!.getMonth()).toBe(expected.getMonth());
            expect(rawDates[i]!.getDate()).toBe(expected.getDate());
          }

          // Adjust for holidays
          const adjusted = adjustForHolidays(rawDates, holidays);

          // Verify same count
          expect(adjusted).toHaveLength(count);

          // Build holiday set for O(1) lookup
          const holidaySet = new Set(
            holidays.map((h) => {
              const y = h.getFullYear();
              const m = String(h.getMonth() + 1).padStart(2, '0');
              const d = String(h.getDate()).padStart(2, '0');
              return `${y}-${m}-${d}`;
            }),
          );

          // Verify no adjusted due date falls on a holiday
          for (const d of adjusted) {
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            expect(holidaySet.has(key)).toBe(false);
          }

          // Verify adjusted dates are >= raw dates (holidays only shift forward)
          for (let i = 0; i < rawDates.length; i++) {
            expect(adjusted[i]!.getTime()).toBeGreaterThanOrEqual(rawDates[i]!.getTime());
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
