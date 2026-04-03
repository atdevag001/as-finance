import { describe, it, expect } from 'vitest';
import { formatDateIST, formatTimestampIST, todayIST } from '../date-utils';

describe('formatDateIST', () => {
  it('formats a UTC midnight date to DD-MMM-YYYY in IST', () => {
    // 2024-01-15 00:00 UTC = 2024-01-15 05:30 IST → same calendar day
    expect(formatDateIST('2024-01-15T00:00:00.000Z')).toBe('15-Jan-2024');
  });

  it('handles UTC date that crosses midnight into next day in IST', () => {
    // 2024-01-15 20:00 UTC = 2024-01-16 01:30 IST → next day
    expect(formatDateIST('2024-01-15T20:00:00.000Z')).toBe('16-Jan-2024');
  });

  it('formats dates with different months correctly', () => {
    expect(formatDateIST('2024-03-05T10:00:00.000Z')).toBe('05-Mar-2024');
    expect(formatDateIST('2024-12-25T10:00:00.000Z')).toBe('25-Dec-2024');
    expect(formatDateIST('2024-07-01T10:00:00.000Z')).toBe('01-Jul-2024');
  });

  it('pads single-digit days with leading zero', () => {
    expect(formatDateIST('2024-06-01T10:00:00.000Z')).toBe('01-Jun-2024');
  });
});

describe('formatTimestampIST', () => {
  it('formats to DD-MMM-YYYY HH:mm in IST', () => {
    // 2024-01-15 14:00 UTC = 2024-01-15 19:30 IST
    expect(formatTimestampIST('2024-01-15T14:00:00.000Z')).toBe('15-Jan-2024 19:30');
  });

  it('handles midnight UTC → 05:30 IST', () => {
    expect(formatTimestampIST('2024-01-15T00:00:00.000Z')).toBe('15-Jan-2024 05:30');
  });

  it('handles date crossing midnight in IST', () => {
    // 2024-01-15 18:30 UTC = 2024-01-16 00:00 IST
    expect(formatTimestampIST('2024-01-15T18:30:00.000Z')).toBe('16-Jan-2024 00:00');
  });
});

describe('todayIST', () => {
  it('returns a string in YYYY-MM-DD format', () => {
    const result = todayIST();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns the current IST date', () => {
    const result = todayIST();
    // Verify by computing IST date independently
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
});
