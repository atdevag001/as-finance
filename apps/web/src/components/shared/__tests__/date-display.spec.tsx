import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DateDisplay } from '../date-display';

/**
 * DateDisplay Component Unit Tests
 *
 * Tests the DateDisplay component for:
 * - Date formatting in IST (DD-MMM-YYYY)
 * - Timestamp formatting when showTime=true (DD-MMM-YYYY HH:mm)
 * - Semantic <time> element with dateTime attribute
 * - Custom className support
 *
 * **Validates: Property 2 - Date formatting in IST, Requirements 23.1, 23.2, 23.3**
 */

describe('DateDisplay', () => {
  describe('Date-only formatting', () => {
    it('formats date in DD-MMM-YYYY format', () => {
      render(<DateDisplay date="2024-01-15T10:00:00.000Z" />);
      expect(screen.getByText('15-Jan-2024')).toBeInTheDocument();
    });

    it('converts UTC to IST correctly (day stays same for early UTC)', () => {
      // 10:00 UTC = 15:30 IST, same day
      render(<DateDisplay date="2024-01-15T10:00:00.000Z" />);
      expect(screen.getByText('15-Jan-2024')).toBeInTheDocument();
    });

    it('converts UTC to IST correctly (day rolls over for late UTC)', () => {
      // 20:00 UTC = 01:30 IST next day
      render(<DateDisplay date="2024-01-15T20:00:00.000Z" />);
      expect(screen.getByText('16-Jan-2024')).toBeInTheDocument();
    });

    it('handles midnight UTC', () => {
      // 00:00 UTC = 05:30 IST same day
      render(<DateDisplay date="2024-01-15T00:00:00.000Z" />);
      expect(screen.getByText('15-Jan-2024')).toBeInTheDocument();
    });
  });

  describe('Timestamp formatting (showTime=true)', () => {
    it('formats date with time in DD-MMM-YYYY HH:mm format', () => {
      render(<DateDisplay date="2024-01-15T10:00:00.000Z" showTime />);
      expect(screen.getByText('15-Jan-2024 15:30')).toBeInTheDocument();
    });

    it('converts UTC to IST time correctly', () => {
      // 00:00 UTC = 05:30 IST
      render(<DateDisplay date="2024-01-15T00:00:00.000Z" showTime />);
      expect(screen.getByText('15-Jan-2024 05:30')).toBeInTheDocument();
    });

    it('handles day rollover with time', () => {
      // 20:00 UTC = 01:30 IST next day
      render(<DateDisplay date="2024-01-15T20:00:00.000Z" showTime />);
      expect(screen.getByText('16-Jan-2024 01:30')).toBeInTheDocument();
    });

    it('handles noon IST', () => {
      // 06:30 UTC = 12:00 IST
      render(<DateDisplay date="2024-01-15T06:30:00.000Z" showTime />);
      expect(screen.getByText('15-Jan-2024 12:00')).toBeInTheDocument();
    });
  });

  describe('showTime prop', () => {
    it('showTime defaults to false', () => {
      render(<DateDisplay date="2024-01-15T10:00:00.000Z" />);
      // Should only show date without time
      const text = screen.getByText('15-Jan-2024');
      expect(text.textContent).not.toContain(':');
    });

    it('showTime=false shows date only', () => {
      render(<DateDisplay date="2024-01-15T10:00:00.000Z" showTime={false} />);
      expect(screen.getByText('15-Jan-2024')).toBeInTheDocument();
    });

    it('showTime=true shows date and time', () => {
      render(<DateDisplay date="2024-01-15T10:00:00.000Z" showTime={true} />);
      const text = screen.getByText('15-Jan-2024 15:30');
      expect(text.textContent).toContain(':');
    });
  });

  describe('Semantic HTML', () => {
    it('renders a <time> element', () => {
      render(<DateDisplay date="2024-01-15T10:00:00.000Z" />);
      const timeElement = screen.getByText('15-Jan-2024');
      expect(timeElement.tagName).toBe('TIME');
    });

    it('has dateTime attribute with original ISO string', () => {
      render(<DateDisplay date="2024-01-15T10:00:00.000Z" />);
      const timeElement = screen.getByText('15-Jan-2024');
      expect(timeElement).toHaveAttribute('dateTime', '2024-01-15T10:00:00.000Z');
    });
  });

  describe('className prop', () => {
    it('accepts and applies className', () => {
      render(<DateDisplay date="2024-01-15T10:00:00.000Z" className="my-custom-class" />);
      const timeElement = screen.getByText('15-Jan-2024');
      expect(timeElement.className).toContain('my-custom-class');
    });

    it('works without className', () => {
      render(<DateDisplay date="2024-01-15T10:00:00.000Z" />);
      const timeElement = screen.getByText('15-Jan-2024');
      expect(timeElement).toBeInTheDocument();
    });
  });

  describe('Edge cases', () => {
    it('handles leap year Feb 29', () => {
      render(<DateDisplay date="2024-02-29T10:00:00.000Z" />);
      expect(screen.getByText('29-Feb-2024')).toBeInTheDocument();
    });

    it('handles year boundary (Dec 31 UTC -> Jan 1 IST)', () => {
      // Dec 31, 2023 at 20:00 UTC = Jan 1, 2024 at 01:30 IST
      render(<DateDisplay date="2023-12-31T20:00:00.000Z" />);
      expect(screen.getByText('01-Jan-2024')).toBeInTheDocument();
    });

    it('handles month boundary', () => {
      // Jan 31 at 20:00 UTC = Feb 1 at 01:30 IST
      render(<DateDisplay date="2024-01-31T20:00:00.000Z" />);
      expect(screen.getByText('01-Feb-2024')).toBeInTheDocument();
    });
  });

  describe('Month abbreviations', () => {
    const monthTests = [
      { date: '2024-01-15T10:00:00.000Z', expected: /Jan/ },
      { date: '2024-02-15T10:00:00.000Z', expected: /Feb/ },
      { date: '2024-03-15T10:00:00.000Z', expected: /Mar/ },
      { date: '2024-04-15T10:00:00.000Z', expected: /Apr/ },
      { date: '2024-05-15T10:00:00.000Z', expected: /May/ },
      { date: '2024-06-15T10:00:00.000Z', expected: /Jun/ },
      { date: '2024-07-15T10:00:00.000Z', expected: /Jul/ },
      { date: '2024-08-15T10:00:00.000Z', expected: /Aug/ },
      { date: '2024-09-15T10:00:00.000Z', expected: /Sep/ },
      { date: '2024-10-15T10:00:00.000Z', expected: /Oct/ },
      { date: '2024-11-15T10:00:00.000Z', expected: /Nov/ },
      { date: '2024-12-15T10:00:00.000Z', expected: /Dec/ },
    ];

    it.each(monthTests)('formats month correctly for $date', ({ date, expected }) => {
      render(<DateDisplay date={date} />);
      const text = document.querySelector('time')?.textContent ?? '';
      expect(text).toMatch(expected);
    });
  });
});
