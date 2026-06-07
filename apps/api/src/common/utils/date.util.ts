/**
 * Date utilities — IST-aware, month-end-safe.
 *
 * JavaScript's Date.setMonth normalizes overflow (Mar 31 + 1mo → May 1),
 * which produces wrong EMI due dates. Use addMonthsClamped to anchor to
 * the last day of the target month instead.
 */

const IST_OFFSET_MINUTES = 5 * 60 + 30;
const IST_OFFSET_MS = IST_OFFSET_MINUTES * 60 * 1000;

/**
 * Add months to `start`, clamping the day to the last valid day of the target month.
 *
 *   addMonthsClamped(Mar 31, +1) → Apr 30   (NOT May 1)
 *   addMonthsClamped(Jan 31, +1) → Feb 28   (or 29 in leap year)
 *   addMonthsClamped(Mar 31, -1) → Feb 28   (NOT Mar 2/3)
 *
 * Works in the local TZ of the input Date. For IST-pinned schedules, construct
 * `start` via parseDateIST first.
 */
export function addMonthsClamped(start: Date, monthsToAdd: number): Date {
  const target = new Date(start.getFullYear(), start.getMonth() + monthsToAdd, 1);
  const lastDayOfTarget = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0,
  ).getDate();
  target.setDate(Math.min(start.getDate(), lastDayOfTarget));
  // Preserve time of day from `start`
  target.setHours(
    start.getHours(),
    start.getMinutes(),
    start.getSeconds(),
    start.getMilliseconds(),
  );
  return target;
}

/** Today in IST as 'YYYY-MM-DD' string. */
export function todayIST(): string {
  const istNow = new Date(Date.now() + IST_OFFSET_MS);
  return istNow.toISOString().split('T')[0]!;
}

/**
 * Parse 'YYYY-MM-DD' as midnight IST.
 * Returns a Date object whose UTC time corresponds to 00:00 IST on that date.
 */
export function parseDateIST(dateStr: string): Date {
  // Accept either 'YYYY-MM-DD' OR a full ISO 'YYYY-MM-DDTHH:mm:ss(.sss)Z'
  // by stripping anything after the 'T'. Several upstream services
  // (disbursement / penalty / foreclosure / reversal) pass
  // `new Date().toISOString()` to createJournalEntry — without this
  // lenience every real money-movement throws 500 here.
  const ymd =
    dateStr.length > 10 && dateStr.indexOf('T') > 0
      ? dateStr.slice(0, 10)
      : dateStr;
  const parts = ymd.split('-');
  if (parts.length !== 3) {
    throw new Error(`Invalid date format: ${dateStr} (expected YYYY-MM-DD)`);
  }
  const [y, m, d] = parts.map(Number);
  if (
    Number.isNaN(y!) ||
    Number.isNaN(m!) ||
    Number.isNaN(d!)
  ) {
    throw new Error(`Invalid date components: ${dateStr}`);
  }
  // IST midnight = UTC 18:30 previous day
  return new Date(Date.UTC(y!, m! - 1, d, -5, -30));
}

/**
 * Parse 'YYYY-MM-DD' as UTC midnight on the SAME calendar day.
 *
 * Use this for Prisma `@db.Date` columns. Postgres' DATE cast under the default
 * UTC session timezone would strip an IST-midnight Date (UTC 18:30 previous day)
 * to the prior calendar day — so parseDateIST is unsafe for date-only columns.
 * UTC-midnight preserves the user-supplied calendar day regardless of host TZ.
 */
export function parseDateOnlyUTC(dateStr: string): Date {
  const parts = dateStr.split('-');
  if (parts.length !== 3) {
    throw new Error(`Invalid date format: ${dateStr} (expected YYYY-MM-DD)`);
  }
  const [y, m, d] = parts.map(Number);
  if (
    Number.isNaN(y!) ||
    Number.isNaN(m!) ||
    Number.isNaN(d!)
  ) {
    throw new Error(`Invalid date components: ${dateStr}`);
  }
  return new Date(Date.UTC(y!, m! - 1, d!));
}

/**
 * Calendar-day difference between two Dates, in IST.
 * Floor-rounds; ignores time-of-day. Returns negative if b < a.
 *
 *   calendarDaysDiff(2026-03-31T23:59:59 IST, 2026-04-01T00:00:01 IST) === 1
 *
 * Prefer over (b - a) / 86_400_000 for DPD/penalty math, which is off-by-one
 * across midnight and may double-count across DST boundaries in non-IST TZs.
 */
export function calendarDaysDiff(a: Date, b: Date): number {
  const aIST = new Date(a.getTime() + IST_OFFSET_MS);
  const bIST = new Date(b.getTime() + IST_OFFSET_MS);
  return Math.floor(
    (Date.UTC(bIST.getUTCFullYear(), bIST.getUTCMonth(), bIST.getUTCDate()) -
      Date.UTC(aIST.getUTCFullYear(), aIST.getUTCMonth(), aIST.getUTCDate())) /
      86_400_000,
  );
}

/** IST-midnight Date for "today" (system clock). */
export function todayISTDate(): Date {
  return parseDateIST(todayIST());
}
