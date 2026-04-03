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
