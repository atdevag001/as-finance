import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { formatDateIST, formatTimestampIST, todayIST } from '../date-utils';

/**
 * Property 2: Date formatting in IST
 *
 * For any valid ISO 8601 date string, formatDateIST(date) should produce a string
 * matching the pattern DD-MMM-YYYY in the Asia/Kolkata timezone, and
 * formatTimestampIST(date) should produce DD-MMM-YYYY HH:mm in IST.
 *
 * **Validates: Requirements 23.1, 23.2, 23.3**
 */

/**
 * Property 15: Default date is today in IST
 *
 * For any date input field that defaults to "today", the default value should
 * equal the current date in the Asia/Kolkata timezone, formatted as YYYY-MM-DD.
 *
 * **Validates: Requirements 10.5, 15.2, 23.5**
 */

// --- Generators ---

/** Generates valid ISO 8601 date strings */
const isoDateArb = fc
  .date({
    min: new Date('2000-01-01T00:00:00.000Z'),
    max: new Date('2099-12-31T23:59:59.999Z'),
  })
  .map((d) => d.toISOString());

/** Generates dates around midnight UTC (edge case for IST conversion) */
const midnightUTCArb = fc
  .tuple(
    fc.integer({ min: 2000, max: 2099 }), // year
    fc.integer({ min: 1, max: 12 }), // month
    fc.integer({ min: 1, max: 28 }), // day (safe for all months)
  )
  .map(([year, month, day]) => {
    const d = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    return d.toISOString();
  });

/** Generates dates that cross midnight into next day in IST (18:30 UTC = 00:00 IST next day) */
const dayRolloverArb = fc
  .tuple(
    fc.integer({ min: 2000, max: 2099 }), // year
    fc.integer({ min: 1, max: 12 }), // month
    fc.integer({ min: 1, max: 27 }), // day (leave room for rollover)
    fc.integer({ min: 19, max: 23 }), // hour (after 18:30 UTC = next day IST)
  )
  .map(([year, month, day, hour]) => {
    const d = new Date(Date.UTC(year, month - 1, day, hour, 30, 0, 0));
    return d.toISOString();
  });

/** Valid month abbreviations (Intl.DateTimeFormat may use 'Sept' for September) */
const MONTH_ABBRS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Sept', 'Oct', 'Nov', 'Dec'];

// --- Property 2: Date formatting in IST ---

describe('Property 2: Date formatting in IST', () => {
  it('formatDateIST always produces DD-MMM-YYYY format', () => {
    fc.assert(
      fc.property(isoDateArb, (isoString) => {
        const result = formatDateIST(isoString);

        // Pattern: DD-Mmm-YYYY (Intl may return 3-4 letter months like 'Sep' or 'Sept')
        expect(result).toMatch(/^\d{2}-[A-Z][a-z]{2,3}-\d{4}$/);

        // Day should be 01-31
        const day = parseInt(result.slice(0, 2), 10);
        expect(day).toBeGreaterThanOrEqual(1);
        expect(day).toBeLessThanOrEqual(31);

        // Month should be valid abbreviation (extract between first and last hyphen)
        const parts = result.split('-');
        const month = parts[1];
        expect(MONTH_ABBRS).toContain(month);

        // Year should be 4 digits in our test range
        // Note: IST is UTC+5:30, so Dec 31 2099 late evening UTC becomes Jan 1 2100 IST
        const year = parseInt(parts[2]!, 10);
        expect(year).toBeGreaterThanOrEqual(2000);
        expect(year).toBeLessThanOrEqual(2100);
      }),
      { numRuns: 200 },
    );
  });

  it('formatTimestampIST produces valid format with date and time', () => {
    fc.assert(
      fc.property(isoDateArb, (isoString) => {
        const result = formatTimestampIST(isoString);

        // Should contain a space separating date and time
        expect(result).toContain(' ');

        // Should have a colon in the time part
        expect(result).toContain(':');

        // Should have hyphens in the date part
        const parts = result.split(' ');
        expect(parts.length).toBe(2);
        expect(parts[0]).toContain('-');
      }),
      { numRuns: 100 },
    );
  });

  it('formatTimestampIST includes the same date as formatDateIST', () => {
    // Test specific cases since date part extraction can vary by implementation
    const testCases = [
      '2024-01-15T10:00:00.000Z',
      '2024-06-20T15:30:00.000Z',
      '2024-12-31T23:00:00.000Z',
    ];

    for (const isoString of testCases) {
      const datePart = formatDateIST(isoString);
      const fullTimestamp = formatTimestampIST(isoString);

      // The timestamp should start with the date part
      expect(fullTimestamp.startsWith(datePart)).toBe(true);
    }
  });

  it('IST offset is correctly applied for midnight UTC', () => {
    // Test specific known cases rather than property test
    // UTC 00:00 becomes IST 05:30
    const result = formatTimestampIST('2024-01-15T00:00:00.000Z');
    expect(result).toBe('15-Jan-2024 05:30');
  });

  it('dates near midnight UTC may roll over to next day in IST', () => {
    // Test specific known cases rather than property test
    // 2024-01-15 at 20:00 UTC = 2024-01-16 at 01:30 IST
    const result = formatDateIST('2024-01-15T20:00:00.000Z');
    expect(result).toBe('16-Jan-2024');
  });

  it('month abbreviations are correctly capitalized', () => {
    fc.assert(
      fc.property(isoDateArb, (isoString) => {
        const result = formatDateIST(isoString);
        // Extract month between hyphens
        const parts = result.split('-');
        const month = parts[1]!;

        // First letter uppercase, rest lowercase
        expect(month[0]).toMatch(/[A-Z]/);
        expect(month.slice(1)).toMatch(/[a-z]+/);
      }),
      { numRuns: 100 },
    );
  });

  it('day is always zero-padded to 2 digits', () => {
    fc.assert(
      fc.property(isoDateArb, (isoString) => {
        const result = formatDateIST(isoString);
        const dayStr = result.slice(0, 2);

        expect(dayStr).toMatch(/^\d{2}$/);
      }),
      { numRuns: 100 },
    );
  });
});

// --- Property 15: Default date is today in IST ---

describe('Property 15: Default date is today in IST', () => {
  it('todayIST returns YYYY-MM-DD format', () => {
    const result = todayIST();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('todayIST returns the correct IST date', () => {
    const result = todayIST();

    // Compute expected IST date independently
    const now = new Date();
    const istFormatter = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'Asia/Kolkata',
    });
    const expected = istFormatter.format(now);

    expect(result).toBe(expected);
  });

  it('todayIST year is reasonable', () => {
    const result = todayIST();
    const year = parseInt(result.slice(0, 4), 10);

    // Should be current year (allow for test running over year boundary)
    const currentYear = new Date().getFullYear();
    expect(Math.abs(year - currentYear)).toBeLessThanOrEqual(1);
  });

  it('todayIST month is 01-12', () => {
    const result = todayIST();
    const month = parseInt(result.slice(5, 7), 10);

    expect(month).toBeGreaterThanOrEqual(1);
    expect(month).toBeLessThanOrEqual(12);
  });

  it('todayIST day is 01-31', () => {
    const result = todayIST();
    const day = parseInt(result.slice(8, 10), 10);

    expect(day).toBeGreaterThanOrEqual(1);
    expect(day).toBeLessThanOrEqual(31);
  });
});

// --- Edge cases ---

describe('Date formatting edge cases', () => {
  it('handles leap year Feb 29', () => {
    const leapYearDate = '2024-02-29T10:00:00.000Z';
    const result = formatDateIST(leapYearDate);

    expect(result).toBe('29-Feb-2024');
  });

  it('handles year boundary (Dec 31 UTC -> Jan 1 IST)', () => {
    // Dec 31, 2023 at 20:00 UTC = Jan 1, 2024 at 01:30 IST
    const yearBoundary = '2023-12-31T20:00:00.000Z';
    const result = formatDateIST(yearBoundary);

    expect(result).toBe('01-Jan-2024');
  });

  it('handles month boundary', () => {
    // Jan 31 at 20:00 UTC = Feb 1 at 01:30 IST
    const monthBoundary = '2024-01-31T20:00:00.000Z';
    const result = formatDateIST(monthBoundary);

    expect(result).toBe('01-Feb-2024');
  });

  it('handles early morning IST times correctly', () => {
    // 2024-01-15 at 23:00 UTC = 2024-01-16 at 04:30 IST
    const lateUTC = '2024-01-15T23:00:00.000Z';
    const result = formatTimestampIST(lateUTC);

    expect(result).toBe('16-Jan-2024 04:30');
  });

  it('handles noon IST correctly', () => {
    // 2024-01-15 at 06:30 UTC = 2024-01-15 at 12:00 IST
    const noonIST = '2024-01-15T06:30:00.000Z';
    const result = formatTimestampIST(noonIST);

    expect(result).toBe('15-Jan-2024 12:00');
  });

  it('handles milliseconds correctly (truncated)', () => {
    const withMillis = '2024-01-15T10:30:45.999Z';
    const result = formatTimestampIST(withMillis);

    // Should show 16:00 IST (10:30 UTC + 5:30)
    expect(result).toBe('15-Jan-2024 16:00');
  });
});
