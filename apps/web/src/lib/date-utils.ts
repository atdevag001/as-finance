/**
 * Date utility functions for IST (Asia/Kolkata) formatting.
 *
 * All user-facing dates in AS Finance LMS are displayed in IST.
 * Timestamps are stored as UTC and converted for display here.
 *
 * Rounding: N/A (no money calculations).
 */

const IST_TIMEZONE = 'Asia/Kolkata';

/**
 * Formats an ISO 8601 date string to DD-MMM-YYYY in IST.
 * Month abbreviations are title-case 3-letter (Jan, Feb, Mar, etc.).
 *
 * @example formatDateIST('2024-01-15T18:30:00.000Z') → '16-Jan-2024'
 */
export function formatDateIST(isoString: string): string {
  const date = new Date(isoString);
  const formatter = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: IST_TIMEZONE,
  });
  // Intl returns "16 Jan 2024" — replace spaces with hyphens
  return formatter.format(date).replace(/ /g, '-');
}

/**
 * Formats an ISO 8601 date string to DD-MMM-YYYY HH:mm in IST.
 *
 * @example formatTimestampIST('2024-01-15T18:30:00.000Z') → '16-Jan-2024 00:00'
 */
export function formatTimestampIST(isoString: string): string {
  const date = new Date(isoString);

  const datePart = formatDateIST(isoString);

  const timeFormatter = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: IST_TIMEZONE,
  });
  const timePart = timeFormatter.format(date);

  return `${datePart} ${timePart}`;
}

/**
 * Returns today's date in IST as YYYY-MM-DD for HTML date inputs.
 *
 * @example todayIST() → '2024-01-16'
 */
export function todayIST(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: IST_TIMEZONE,
  });
  // en-CA locale formats as YYYY-MM-DD
  return formatter.format(now);
}

/**
 * Returns tomorrow's date in IST as YYYY-MM-DD for HTML date inputs.
 *
 * Used as the `min` for first-EMI date pickers: the backend's disbursement
 * and schedule-regeneration paths reject firstEmi <= today (strict greater-than),
 * so the picker must forbid today to avoid a confusing post-submit error.
 *
 * @example tomorrowIST() → '2024-01-17'
 */
export function tomorrowIST(): string {
  const now = new Date();
  // Parse today's IST date-parts to avoid local-tz drift around midnight UTC.
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: IST_TIMEZONE,
  }).formatToParts(now);
  const y = Number(parts.find((p) => p.type === 'year')!.value);
  const m = Number(parts.find((p) => p.type === 'month')!.value);
  const d = Number(parts.find((p) => p.type === 'day')!.value);
  // UTC math avoids the local-tz DST landmine; the date components are pure.
  const tomorrowUtc = new Date(Date.UTC(y, m - 1, d + 1));
  const yy = tomorrowUtc.getUTCFullYear();
  const mm = String(tomorrowUtc.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(tomorrowUtc.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}
