import { describe, it, expect } from 'vitest';
import { addMonthsClamped, parseDateIST, todayIST } from '../date.util';

describe('addMonthsClamped', () => {
  it('clamps Jan 31 + 1 month to Feb 28 (non-leap year)', () => {
    const result = addMonthsClamped(new Date(2025, 0, 31), 1);
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(1); // February
    expect(result.getDate()).toBe(28);
  });

  it('clamps Jan 31 + 1 month to Feb 29 (leap year)', () => {
    const result = addMonthsClamped(new Date(2024, 0, 31), 1);
    expect(result.getFullYear()).toBe(2024);
    expect(result.getMonth()).toBe(1);
    expect(result.getDate()).toBe(29);
  });

  it('clamps Mar 31 + 1 month to Apr 30 (not May 1 as JS setMonth would)', () => {
    const result = addMonthsClamped(new Date(2025, 2, 31), 1);
    expect(result.getMonth()).toBe(3); // April
    expect(result.getDate()).toBe(30);
  });

  it('clamps Mar 31 - 1 month to Feb 28 (not Mar 2/3)', () => {
    const result = addMonthsClamped(new Date(2025, 2, 31), -1);
    expect(result.getMonth()).toBe(1); // February
    expect(result.getDate()).toBe(28);
  });

  it('passes through mid-month dates unchanged', () => {
    const result = addMonthsClamped(new Date(2025, 0, 15), 1);
    expect(result.getMonth()).toBe(1);
    expect(result.getDate()).toBe(15);
  });

  it('handles year boundaries (Dec 31 + 1mo = Jan 31)', () => {
    const result = addMonthsClamped(new Date(2024, 11, 31), 1);
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(0); // January
    expect(result.getDate()).toBe(31);
  });

  it('handles year boundaries with clamp (Dec 30 + 14mo = Feb 28)', () => {
    const result = addMonthsClamped(new Date(2024, 11, 30), 14);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(1);
    expect(result.getDate()).toBe(28);
  });

  it('preserves time-of-day from the source date', () => {
    const start = new Date(2025, 0, 15, 14, 30, 45, 123);
    const result = addMonthsClamped(start, 1);
    expect(result.getHours()).toBe(14);
    expect(result.getMinutes()).toBe(30);
    expect(result.getSeconds()).toBe(45);
    expect(result.getMilliseconds()).toBe(123);
  });
});

describe('todayIST', () => {
  it('returns YYYY-MM-DD format string', () => {
    const result = todayIST();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('parseDateIST', () => {
  it('parses YYYY-MM-DD as IST midnight', () => {
    const result = parseDateIST('2025-06-01');
    // IST midnight = UTC 18:30 previous day
    expect(result.getUTCDate()).toBe(31); // May 31 UTC
    expect(result.getUTCHours()).toBe(18);
    expect(result.getUTCMinutes()).toBe(30);
  });

  it('throws on invalid format', () => {
    expect(() => parseDateIST('not-a-date')).toThrow();
    expect(() => parseDateIST('2025/06/01')).toThrow();
    expect(() => parseDateIST('2025-06')).toThrow();
  });
});
