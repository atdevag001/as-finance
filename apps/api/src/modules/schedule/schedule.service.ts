import { Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { InterestType, Frequency } from '@as-finance/shared';
import { addMonthsClamped } from '../../common/utils/date.util';

// Configure Decimal.js globally for this module: ROUND_HALF_UP
Decimal.set({ rounding: Decimal.ROUND_HALF_UP });

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ScheduleParams {
  principalPaise: number;
  annualRateBps: number; // basis points (e.g., 1200 = 12%)
  tenureMonths: number;
  interestType: InterestType;
  frequency: Frequency;
  startDate: Date; // IST business date
  holidays: Date[];
}

export interface Installment {
  installmentNumber: number;
  dueDate: Date;
  principalPaise: number;
  interestPaise: number;
  totalPaise: number;
}

export interface EMIBreakdown {
  emiPaise: number;
  totalInterestPaise: number;
  numberOfInstallments: number;
  installments: Installment[];
}

// ─── Pure Helper Functions ───────────────────────────────────────────────────

/**
 * Normalize negative zero to positive zero.
 * JavaScript distinguishes -0 and +0, but for financial values they must be
 * treated identically. JSON.stringify(-0) produces "0", which breaks
 * round-trip equality when the in-memory value is -0.
 */
function normalizeZero(n: number): number {
  return n === 0 ? 0 : n;
}

/**
 * Derive the number of installments from tenure (months) and frequency.
 *
 *   monthly: N = tenureMonths
 *   weekly:  N = ceil(tenureMonths × 52 / 12)
 *   daily:   N = ceil(tenureMonths × 365.25 / 12)
 *
 * Calendar-accurate: a year has ~52.18 weeks and ~365.25 days (Julian year
 * accounting for leap years). The previous implementation used the rough
 * approximations 4 weeks/month and 30 days/month, which materially under-counted
 * installments for longer tenures (e.g., 12 months daily → 360 instead of 366).
 * Ceiling ensures the schedule never under-covers the tenure period.
 */
export function deriveInstallmentCount(
  tenureMonths: number,
  frequency: Frequency,
): number {
  switch (frequency) {
    case Frequency.MONTHLY:
      return tenureMonths;
    case Frequency.WEEKLY:
      return Math.ceil((tenureMonths * 52) / 12);
    case Frequency.DAILY:
      return Math.ceil((tenureMonths * 365.25) / 12);
    default:
      throw new Error(`Unsupported frequency: ${frequency}`);
  }
}

/**
 * Derive the periodic interest rate from annual rate (bps) and frequency.
 *   monthly: R / 10000 / 12
 *   weekly:  R / 10000 / 52
 *   daily:   R / 10000 / 365
 *
 * Returns a Decimal for precision — no rounding at this stage.
 */
export function derivePeriodicRate(
  annualRateBps: number,
  frequency: Frequency,
): Decimal {
  const annualRate = new Decimal(annualRateBps).div(10000);
  switch (frequency) {
    case Frequency.MONTHLY:
      return annualRate.div(12);
    case Frequency.WEEKLY:
      return annualRate.div(52);
    case Frequency.DAILY:
      return annualRate.div(365);
    default:
      throw new Error(`Unsupported frequency: ${frequency}`);
  }
}

/**
 * Generate due dates starting from startDate, spaced by frequency.
 *   monthly: add 1 month per installment
 *   weekly:  add 7 days per installment
 *   daily:   add 1 day per installment
 *
 * First due date = startDate + one frequency period.
 */
export function generateDueDates(
  startDate: Date,
  count: number,
  frequency: Frequency,
): Date[] {
  const dates: Date[] = [];
  for (let i = 1; i <= count; i++) {
    let d: Date;
    switch (frequency) {
      case Frequency.MONTHLY:
        // Clamp month-end overflow: Mar 31 + 1mo → Apr 30 (not May 1)
        d = addMonthsClamped(startDate, i);
        break;
      case Frequency.WEEKLY:
        d = new Date(startDate);
        d.setDate(d.getDate() + i * 7);
        break;
      case Frequency.DAILY:
        d = new Date(startDate);
        d.setDate(d.getDate() + i);
        break;
      default:
        d = new Date(startDate);
    }
    dates.push(d);
  }
  return dates;
}

/**
 * Shift due dates that fall on holidays to the next business day.
 * A "business day" is any day NOT in the holiday set.
 * Comparison is date-only (year-month-day), ignoring time.
 *
 * After holiday adjustment, ensures dates remain strictly monotonically
 * increasing. If two dates collide (e.g., consecutive daily dates both
 * shifted to the same day), the later one is pushed forward until unique.
 */
export function adjustForHolidays(dueDates: Date[], holidays: Date[]): Date[] {
  // Build a Set of holiday date strings for O(1) lookup
  const holidaySet = new Set(holidays.map((h) => toDateKey(h)));

  const adjusted = dueDates.map((d) => {
    const a = new Date(d);
    // Shift forward until the date is not a holiday
    while (holidaySet.has(toDateKey(a))) {
      a.setDate(a.getDate() + 1);
    }
    return a;
  });

  // Ensure strict monotonicity: if adjusted[i] <= adjusted[i-1], push forward
  for (let i = 1; i < adjusted.length; i++) {
    while (adjusted[i]!.getTime() <= adjusted[i - 1]!.getTime()) {
      adjusted[i]!.setDate(adjusted[i]!.getDate() + 1);
      // Also skip holidays on the new date
      while (holidaySet.has(toDateKey(adjusted[i]!))) {
        adjusted[i]!.setDate(adjusted[i]!.getDate() + 1);
      }
    }
  }

  return adjusted;
}

/** Format a Date as "YYYY-MM-DD" for date-only comparison. */
function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ─── Flat Interest EMI Calculation ───────────────────────────────────────────

/**
 * Calculate flat-interest EMI schedule.
 *
 * Formula:
 *   total_interest = P × (R / 10000) × (T / 12)
 *   N = number of installments (derived from frequency)
 *   EMI = (P + total_interest) / N
 *
 * Each installment has fixed principal and interest components.
 * Rounding: intermediate arithmetic uses Decimal.js, each installment's
 * principal and interest are rounded to integer paise (ROUND_HALF_UP).
 * The last installment absorbs any rounding difference so that:
 *   sum(principal_paise) == principalPaise
 *   sum(interest_paise) == totalInterestPaise
 *
 * @param principalPaise  Loan principal in integer paise
 * @param annualRateBps   Annual interest rate in basis points (1200 = 12%)
 * @param tenureMonths    Loan tenure in months
 * @param frequency       Repayment frequency (monthly, weekly, daily)
 */
export function calculateFlatEMI(
  principalPaise: number,
  annualRateBps: number,
  tenureMonths: number,
  frequency: Frequency = Frequency.MONTHLY,
): EMIBreakdown {
  const P = new Decimal(principalPaise);
  const R = new Decimal(annualRateBps);
  const T = new Decimal(tenureMonths);

  // total_interest = P × (R / 10000) × (T / 12)
  // Rounding point: round total interest to integer paise
  const totalInterest = P.mul(R).div(10000).mul(T).div(12).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

  const N = deriveInstallmentCount(tenureMonths, frequency);

  // H18: Distribute the rounding remainder evenly across the FIRST `remainder`
  // installments (1 paisa each) rather than dumping it into the last installment.
  //
  // Old behaviour: every regular installment got floor(P/N) paise of principal
  // and the last installment absorbed (P - floor(P/N) × (N-1)) — which could be
  // up to N-1 paise larger than the others. That created an artificially "jumbo"
  // final installment and could surprise borrowers / break EMI-equality
  // assumptions downstream.
  //
  // New behaviour: the first `remainder` installments each get +1 paisa.
  // Differences between any two installments are now at most 1 paisa. The
  // cumulative principal and interest still reconcile exactly.
  const totalPrincipalPaise = principalPaise;
  const totalInterestPaise = totalInterest.toNumber();

  const perInstallmentPrincipal = Math.floor(totalPrincipalPaise / N);
  const principalRemainder = totalPrincipalPaise - perInstallmentPrincipal * N;

  const perInstallmentInterest = Math.floor(totalInterestPaise / N);
  const interestRemainder = totalInterestPaise - perInstallmentInterest * N;

  const principalPaiseFor = (idx: number): number =>
    perInstallmentPrincipal + (idx < principalRemainder ? 1 : 0);
  const interestPaiseFor = (idx: number): number =>
    perInstallmentInterest + (idx < interestRemainder ? 1 : 0);

  const installments: Installment[] = [];
  for (let i = 1; i <= N; i++) {
    const principalPaiseI = normalizeZero(principalPaiseFor(i - 1));
    const interestPaiseI = normalizeZero(interestPaiseFor(i - 1));
    installments.push({
      installmentNumber: i,
      dueDate: new Date(), // placeholder — caller sets due dates
      principalPaise: principalPaiseI,
      interestPaise: interestPaiseI,
      totalPaise: normalizeZero(principalPaiseI + interestPaiseI),
    });
  }

  // EMI for the "base" installment (those without the +1 paisa adjustment).
  // When P and totalInterest divide evenly by N, all installments share this EMI.
  const emi = perInstallmentPrincipal + perInstallmentInterest;

  return {
    emiPaise: emi,
    totalInterestPaise: totalInterestPaise,
    numberOfInstallments: N,
    installments,
  };
}

// ─── Reducing Balance EMI Calculation ────────────────────────────────────────

/**
 * Calculate reducing-balance EMI schedule.
 *
 * Formula:
 *   r = periodic rate (derived from frequency)
 *   n = number of installments (derived from frequency)
 *   EMI = P × r × (1+r)^n / ((1+r)^n - 1)
 *
 * Each installment:
 *   interest = outstanding × periodic_rate  (rounded to integer paise — ROUND_HALF_UP)
 *   principal = EMI - interest              (rounded to integer paise — ROUND_HALF_UP)
 *
 * The last installment absorbs any rounding difference so that:
 *   sum(principal_paise) == principalPaise
 *
 * @param principalPaise  Loan principal in integer paise
 * @param annualRateBps   Annual interest rate in basis points (1200 = 12%)
 * @param tenureMonths    Loan tenure in months
 * @param frequency       Repayment frequency (monthly, weekly, daily)
 */
export function calculateReducingBalanceEMI(
  principalPaise: number,
  annualRateBps: number,
  tenureMonths: number,
  frequency: Frequency = Frequency.MONTHLY,
): EMIBreakdown {
  const P = new Decimal(principalPaise);
  const r = derivePeriodicRate(annualRateBps, frequency);
  const n = deriveInstallmentCount(tenureMonths, frequency);

  // Special case: zero interest rate — EMI is simply P / N with no interest
  if (r.isZero()) {
    const nDec = new Decimal(n);
    const perPrincipal = P.div(nDec).toDecimalPlaces(0, Decimal.ROUND_FLOOR).toNumber();
    const installments: Installment[] = [];
    let cumulativePrincipal = 0;

    for (let i = 1; i <= n; i++) {
      if (i < n) {
        cumulativePrincipal += perPrincipal;
        installments.push({
          installmentNumber: i,
          dueDate: new Date(),
          principalPaise: perPrincipal,
          interestPaise: 0,
          totalPaise: perPrincipal,
        });
      } else {
        const lastPrincipal = normalizeZero(principalPaise - cumulativePrincipal);
        installments.push({
          installmentNumber: i,
          dueDate: new Date(),
          principalPaise: lastPrincipal,
          interestPaise: 0,
          totalPaise: lastPrincipal,
        });
      }
    }

    return {
      emiPaise: perPrincipal,
      totalInterestPaise: 0,
      numberOfInstallments: n,
      installments,
    };
  }

  // EMI = P × r × (1+r)^n / ((1+r)^n - 1)
  // Use sufficient precision for intermediate calculation
  const onePlusR = r.plus(1);
  const onePlusRpowN = onePlusR.pow(n);
  const emiDecimal = P.mul(r).mul(onePlusRpowN).div(onePlusRpowN.minus(1));

  // Rounding point: round EMI to integer paise
  const emiRounded = emiDecimal.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();

  let outstanding = P;
  const installments: Installment[] = [];
  let cumulativePrincipal = 0;
  let totalInterest = new Decimal(0);

  for (let i = 1; i <= n; i++) {
    if (i < n) {
      // Rounding point: round interest to integer paise
      const interestDec = outstanding.mul(r).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
      const interestPaise = normalizeZero(interestDec.toNumber());

      // principal = EMI - interest
      // Clamp: ensure cumulative principal never exceeds total principal.
      // Without this clamp, ROUND_HALF_UP on interest can cause the per-installment
      // principal to slightly overshoot, and over many installments (e.g., daily
      // frequency with 1260 installments) the cumulative error makes the last
      // installment's principal negative.
      let principalPaiseCurrent = normalizeZero(emiRounded - interestPaise);
      const remainingPrincipal = principalPaise - cumulativePrincipal;
      if (principalPaiseCurrent > remainingPrincipal) {
        principalPaiseCurrent = remainingPrincipal;
      }
      if (principalPaiseCurrent < 0) {
        principalPaiseCurrent = 0;
      }

      cumulativePrincipal += principalPaiseCurrent;
      totalInterest = totalInterest.plus(interestPaise);
      outstanding = outstanding.minus(principalPaiseCurrent);

      installments.push({
        installmentNumber: i,
        dueDate: new Date(), // placeholder — caller sets due dates
        principalPaise: principalPaiseCurrent,
        interestPaise: interestPaise,
        totalPaise: normalizeZero(principalPaiseCurrent + interestPaise),
      });
    } else {
      // Last installment absorbs rounding difference for principal
      const lastPrincipal = normalizeZero(principalPaise - cumulativePrincipal);

      // Rounding point: last interest = outstanding × rate, rounded to integer paise
      const lastInterestDec = outstanding.mul(r).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
      const lastInterest = normalizeZero(lastInterestDec.toNumber());
      totalInterest = totalInterest.plus(lastInterest);

      installments.push({
        installmentNumber: i,
        dueDate: new Date(), // placeholder
        principalPaise: lastPrincipal,
        interestPaise: lastInterest,
        totalPaise: normalizeZero(lastPrincipal + lastInterest),
      });
    }
  }

  return {
    emiPaise: emiRounded,
    totalInterestPaise: normalizeZero(totalInterest.toNumber()),
    numberOfInstallments: n,
    installments,
  };
}

// ─── Schedule Generation (orchestrator) ──────────────────────────────────────

/**
 * Generate a complete repayment schedule.
 *
 * Dispatches to flat or reducing balance calculation, then assigns due dates
 * (with holiday adjustment) to each installment.
 *
 * This is a pure function: same inputs always produce the same output.
 * No database access, no side effects.
 */
export function generateSchedule(params: ScheduleParams): Installment[] {
  const {
    principalPaise,
    annualRateBps,
    tenureMonths,
    interestType,
    frequency,
    startDate,
    holidays,
  } = params;

  // 1. Calculate EMI breakdown based on interest type
  const breakdown =
    interestType === InterestType.FLAT
      ? calculateFlatEMI(principalPaise, annualRateBps, tenureMonths, frequency)
      : calculateReducingBalanceEMI(principalPaise, annualRateBps, tenureMonths, frequency);

  // 2. Generate raw due dates
  const rawDueDates = generateDueDates(
    startDate,
    breakdown.numberOfInstallments,
    frequency,
  );

  // 3. Adjust for holidays
  const adjustedDueDates = adjustForHolidays(rawDueDates, holidays);

  // 4. Assign due dates to installments
  return breakdown.installments.map((inst, idx) => ({
    ...inst,
    dueDate: adjustedDueDates[idx]!,
  }));
}

// ─── NestJS Injectable Service (thin wrapper) ────────────────────────────────

/**
 * NestJS injectable service wrapping the pure schedule generation functions.
 * All core logic lives in the exported pure functions above for direct testing.
 */
@Injectable()
export class ScheduleService {
  generateSchedule(params: ScheduleParams): Installment[] {
    return generateSchedule(params);
  }

  calculateFlatEMI(
    principalPaise: number,
    annualRateBps: number,
    tenureMonths: number,
    frequency: Frequency = Frequency.MONTHLY,
  ): EMIBreakdown {
    return calculateFlatEMI(principalPaise, annualRateBps, tenureMonths, frequency);
  }

  calculateReducingBalanceEMI(
    principalPaise: number,
    annualRateBps: number,
    tenureMonths: number,
    frequency: Frequency = Frequency.MONTHLY,
  ): EMIBreakdown {
    return calculateReducingBalanceEMI(principalPaise, annualRateBps, tenureMonths, frequency);
  }

  adjustForHolidays(dueDates: Date[], holidays: Date[]): Date[] {
    return adjustForHolidays(dueDates, holidays);
  }
}
