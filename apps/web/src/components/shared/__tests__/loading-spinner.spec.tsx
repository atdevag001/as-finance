import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoadingSpinner } from '../loading-spinner';

/**
 * LoadingSpinner Component Unit Tests
 *
 * Tests the LoadingSpinner component for:
 * - Renders with animate-spin class
 * - Supports sm, md, lg size variants
 * - Has role="status" and aria-label for accessibility
 * - Supports custom className
 *
 * **Validates: Loading indicator component**
 */

describe('LoadingSpinner', () => {
  describe('Rendering', () => {
    it('renders the spinner', () => {
      render(<LoadingSpinner />);
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('has animate-spin class', () => {
      render(<LoadingSpinner />);
      const spinner = screen.getByRole('status');
      expect(spinner.className).toContain('animate-spin');
    });

    it('has rounded-full class', () => {
      render(<LoadingSpinner />);
      const spinner = screen.getByRole('status');
      expect(spinner.className).toContain('rounded-full');
    });
  });

  describe('Accessibility', () => {
    it('has role="status"', () => {
      render(<LoadingSpinner />);
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('has aria-label="Loading"', () => {
      render(<LoadingSpinner />);
      const spinner = screen.getByRole('status');
      expect(spinner).toHaveAttribute('aria-label', 'Loading');
    });

    it('has screen reader text', () => {
      render(<LoadingSpinner />);
      expect(screen.getByText('Loading…')).toBeInTheDocument();
    });

    it('screen reader text is visually hidden', () => {
      render(<LoadingSpinner />);
      const srText = screen.getByText('Loading…');
      expect(srText.className).toContain('sr-only');
    });
  });

  describe('Size Variants', () => {
    it('defaults to md size', () => {
      render(<LoadingSpinner />);
      const spinner = screen.getByRole('status');
      expect(spinner.className).toContain('h-6');
      expect(spinner.className).toContain('w-6');
    });

    it('renders sm size', () => {
      render(<LoadingSpinner size="sm" />);
      const spinner = screen.getByRole('status');
      expect(spinner.className).toContain('h-4');
      expect(spinner.className).toContain('w-4');
    });

    it('renders md size', () => {
      render(<LoadingSpinner size="md" />);
      const spinner = screen.getByRole('status');
      expect(spinner.className).toContain('h-6');
      expect(spinner.className).toContain('w-6');
    });

    it('renders lg size', () => {
      render(<LoadingSpinner size="lg" />);
      const spinner = screen.getByRole('status');
      expect(spinner.className).toContain('h-10');
      expect(spinner.className).toContain('w-10');
    });

    const sizeTests = [
      { size: 'sm' as const, expectedHeight: 'h-4', expectedWidth: 'w-4' },
      { size: 'md' as const, expectedHeight: 'h-6', expectedWidth: 'w-6' },
      { size: 'lg' as const, expectedHeight: 'h-10', expectedWidth: 'w-10' },
    ];

    it.each(sizeTests)('$size size has correct dimensions', ({ size, expectedHeight, expectedWidth }) => {
      render(<LoadingSpinner size={size} />);
      const spinner = screen.getByRole('status');
      expect(spinner.className).toContain(expectedHeight);
      expect(spinner.className).toContain(expectedWidth);
    });
  });

  describe('Styling', () => {
    it('has border for spinner effect', () => {
      render(<LoadingSpinner />);
      const spinner = screen.getByRole('status');
      expect(spinner.className).toContain('border');
    });

    it('has primary color border', () => {
      render(<LoadingSpinner />);
      const spinner = screen.getByRole('status');
      expect(spinner.className).toContain('border-primary');
    });

    it('has transparent top border for animation', () => {
      render(<LoadingSpinner />);
      const spinner = screen.getByRole('status');
      expect(spinner.className).toContain('border-t-transparent');
    });
  });

  describe('Custom className', () => {
    it('applies custom className', () => {
      render(<LoadingSpinner className="my-custom-spinner" />);
      const spinner = screen.getByRole('status');
      expect(spinner.className).toContain('my-custom-spinner');
    });

    it('preserves default classes when custom class is added', () => {
      render(<LoadingSpinner className="extra-class" />);
      const spinner = screen.getByRole('status');
      expect(spinner.className).toContain('animate-spin');
      expect(spinner.className).toContain('extra-class');
    });

    it('works with size prop and custom className', () => {
      render(<LoadingSpinner size="lg" className="custom" />);
      const spinner = screen.getByRole('status');
      expect(spinner.className).toContain('h-10');
      expect(spinner.className).toContain('custom');
    });
  });
});
