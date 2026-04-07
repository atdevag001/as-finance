import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MoneyDisplay } from '../money-display';

/**
 * MoneyDisplay Component Unit Tests
 *
 * Tests the MoneyDisplay component for:
 * - Formatting paise to INR
 * - Indian comma grouping (last 3 digits, then groups of 2)
 * - Always showing 2 decimal places
 * - Negative amount styling
 * - CSS class application
 *
 * **Validates: Requirements 20.1, 20.2, 20.3, 20.4 (Money Display and Formatting)**
 */

describe('MoneyDisplay', () => {
  describe('Basic formatting', () => {
    it('formats zero paise as ₹0.00', () => {
      render(<MoneyDisplay paise={0} />);
      expect(screen.getByText('₹0.00')).toBeInTheDocument();
    });

    it('formats one paisa as ₹0.01', () => {
      render(<MoneyDisplay paise={1} />);
      expect(screen.getByText('₹0.01')).toBeInTheDocument();
    });

    it('formats 99 paise as ₹0.99', () => {
      render(<MoneyDisplay paise={99} />);
      expect(screen.getByText('₹0.99')).toBeInTheDocument();
    });

    it('formats 100 paise as ₹1.00', () => {
      render(<MoneyDisplay paise={100} />);
      expect(screen.getByText('₹1.00')).toBeInTheDocument();
    });

    it('formats 150 paise as ₹1.50', () => {
      render(<MoneyDisplay paise={150} />);
      expect(screen.getByText('₹1.50')).toBeInTheDocument();
    });

    it('formats 12345 paise as ₹123.45', () => {
      render(<MoneyDisplay paise={12345} />);
      expect(screen.getByText('₹123.45')).toBeInTheDocument();
    });
  });

  describe('Indian comma grouping', () => {
    it('no commas for amounts under 1000 rupees', () => {
      render(<MoneyDisplay paise={99900} />);
      expect(screen.getByText('₹999.00')).toBeInTheDocument();
    });

    it('formats 1000 rupees with first comma', () => {
      render(<MoneyDisplay paise={100000} />);
      expect(screen.getByText('₹1,000.00')).toBeInTheDocument();
    });

    it('formats 10,000 rupees correctly', () => {
      render(<MoneyDisplay paise={1000000} />);
      expect(screen.getByText('₹10,000.00')).toBeInTheDocument();
    });

    it('formats 1 lakh (1,00,000) correctly', () => {
      render(<MoneyDisplay paise={10000000} />);
      expect(screen.getByText('₹1,00,000.00')).toBeInTheDocument();
    });

    it('formats 10 lakh (10,00,000) correctly', () => {
      render(<MoneyDisplay paise={100000000} />);
      expect(screen.getByText('₹10,00,000.00')).toBeInTheDocument();
    });

    it('formats 1 crore (1,00,00,000) correctly', () => {
      render(<MoneyDisplay paise={1000000000} />);
      expect(screen.getByText('₹1,00,00,000.00')).toBeInTheDocument();
    });

    it('formats 10 crore (10,00,00,000) correctly', () => {
      render(<MoneyDisplay paise={10000000000} />);
      expect(screen.getByText('₹10,00,00,000.00')).toBeInTheDocument();
    });

    it('formats arbitrary amount ₹12,34,56,789.00 rupees', () => {
      // 12345678900 paise = 123456789.00 rupees = ₹12,34,56,789.00
      render(<MoneyDisplay paise={12345678900} />);
      expect(screen.getByText('₹12,34,56,789.00')).toBeInTheDocument();
    });
  });

  describe('Decimal places', () => {
    it('always shows 2 decimal places for whole rupees', () => {
      render(<MoneyDisplay paise={100} />);
      const text = screen.getByText('₹1.00');
      expect(text).toBeInTheDocument();
    });

    it('pads single digit paise with leading zero', () => {
      render(<MoneyDisplay paise={101} />);
      expect(screen.getByText('₹1.01')).toBeInTheDocument();
    });

    it('shows full paise for double digit', () => {
      render(<MoneyDisplay paise={199} />);
      expect(screen.getByText('₹1.99')).toBeInTheDocument();
    });

    it('handles 10 paise', () => {
      render(<MoneyDisplay paise={10} />);
      expect(screen.getByText('₹0.10')).toBeInTheDocument();
    });

    it('handles 50 paise', () => {
      render(<MoneyDisplay paise={50} />);
      expect(screen.getByText('₹0.50')).toBeInTheDocument();
    });
  });

  describe('Negative amounts', () => {
    it('formats negative amount with minus sign', () => {
      render(<MoneyDisplay paise={-100} />);
      expect(screen.getByText('-₹1.00')).toBeInTheDocument();
    });

    it('formats negative zero as ₹0.00 (no minus)', () => {
      render(<MoneyDisplay paise={-0} />);
      expect(screen.getByText('₹0.00')).toBeInTheDocument();
    });

    it('formats negative one paisa', () => {
      render(<MoneyDisplay paise={-1} />);
      expect(screen.getByText('-₹0.01')).toBeInTheDocument();
    });

    it('formats negative lakh amount', () => {
      render(<MoneyDisplay paise={-10000000} />);
      expect(screen.getByText('-₹1,00,000.00')).toBeInTheDocument();
    });

    it('formats negative crore amount', () => {
      render(<MoneyDisplay paise={-1000000000} />);
      expect(screen.getByText('-₹1,00,00,000.00')).toBeInTheDocument();
    });
  });

  describe('CSS classes', () => {
    it('has tabular-nums class by default', () => {
      render(<MoneyDisplay paise={100} />);
      const element = screen.getByText('₹1.00');
      expect(element.className).toContain('tabular-nums');
    });

    it('applies text-destructive class for negative amounts by default', () => {
      render(<MoneyDisplay paise={-100} />);
      const element = screen.getByText('-₹1.00');
      expect(element.className).toContain('text-destructive');
    });

    it('does not apply text-destructive for positive amounts', () => {
      render(<MoneyDisplay paise={100} />);
      const element = screen.getByText('₹1.00');
      expect(element.className).not.toContain('text-destructive');
    });

    it('does not apply text-destructive for zero', () => {
      render(<MoneyDisplay paise={0} />);
      const element = screen.getByText('₹0.00');
      expect(element.className).not.toContain('text-destructive');
    });

    it('accepts additional className', () => {
      render(<MoneyDisplay paise={100} className="my-custom-class" />);
      const element = screen.getByText('₹1.00');
      expect(element.className).toContain('my-custom-class');
    });
  });

  describe('colorNegative prop', () => {
    it('applies destructive color when colorNegative is true (default)', () => {
      render(<MoneyDisplay paise={-100} colorNegative={true} />);
      const element = screen.getByText('-₹1.00');
      expect(element.className).toContain('text-destructive');
    });

    it('does not apply destructive color when colorNegative is false', () => {
      render(<MoneyDisplay paise={-100} colorNegative={false} />);
      const element = screen.getByText('-₹1.00');
      expect(element.className).not.toContain('text-destructive');
    });

    it('colorNegative has no effect on positive amounts', () => {
      render(<MoneyDisplay paise={100} colorNegative={true} />);
      const element = screen.getByText('₹1.00');
      expect(element.className).not.toContain('text-destructive');
    });
  });

  describe('Real-world loan amounts', () => {
    it('formats typical loan principal (₹10,000)', () => {
      render(<MoneyDisplay paise={1000000} />);
      expect(screen.getByText('₹10,000.00')).toBeInTheDocument();
    });

    it('formats typical loan principal (₹50,000)', () => {
      render(<MoneyDisplay paise={5000000} />);
      expect(screen.getByText('₹50,000.00')).toBeInTheDocument();
    });

    it('formats typical loan principal (₹1,00,000)', () => {
      render(<MoneyDisplay paise={10000000} />);
      expect(screen.getByText('₹1,00,000.00')).toBeInTheDocument();
    });

    it('formats typical collection (₹2,500)', () => {
      render(<MoneyDisplay paise={250000} />);
      expect(screen.getByText('₹2,500.00')).toBeInTheDocument();
    });

    it('formats typical collection with paise (₹2,517.50)', () => {
      render(<MoneyDisplay paise={251750} />);
      expect(screen.getByText('₹2,517.50')).toBeInTheDocument();
    });

    it('formats typical penalty (₹150)', () => {
      render(<MoneyDisplay paise={15000} />);
      expect(screen.getByText('₹150.00')).toBeInTheDocument();
    });
  });

  describe('Edge cases', () => {
    it('handles boundary at 999 rupees (no comma)', () => {
      render(<MoneyDisplay paise={99999} />);
      expect(screen.getByText('₹999.99')).toBeInTheDocument();
    });

    it('handles boundary at 1000 rupees (first comma)', () => {
      render(<MoneyDisplay paise={100000} />);
      expect(screen.getByText('₹1,000.00')).toBeInTheDocument();
    });

    it('handles very large numbers', () => {
      // Testing with a large number that fits in JS number precision
      render(<MoneyDisplay paise={9007199254740991} />);
      const element = screen.getByText(/₹[\d,]+\.\d{2}/);
      expect(element).toBeInTheDocument();
    });
  });
});
