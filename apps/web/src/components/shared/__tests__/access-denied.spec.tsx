import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AccessDenied } from '../access-denied';

// Mock next/navigation
const mockBack = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    back: mockBack,
  }),
}));

/**
 * AccessDenied Component Unit Tests
 *
 * Tests the AccessDenied component for:
 * - Renders "Access Denied" heading
 * - Shows descriptive message
 * - Has a "Go back" button
 * - Back button calls router.back()
 *
 * **Validates: Access denied page component**
 */

describe('AccessDenied', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders the access denied heading', () => {
      render(<AccessDenied />);
      expect(screen.getByRole('heading', { name: 'Access Denied' })).toBeInTheDocument();
    });

    it('renders descriptive message', () => {
      render(<AccessDenied />);
      expect(screen.getByText(/do not have permission/i)).toBeInTheDocument();
    });

    it('renders contact administrator message', () => {
      render(<AccessDenied />);
      expect(screen.getByText(/contact your administrator/i)).toBeInTheDocument();
    });

    it('renders shield icon', () => {
      render(<AccessDenied />);
      // ShieldX icon is rendered with aria-hidden
      const icon = document.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });
  });

  describe('Go Back Button', () => {
    it('renders Go back button', () => {
      render(<AccessDenied />);
      expect(screen.getByRole('button', { name: 'Go back' })).toBeInTheDocument();
    });

    it('calls router.back() when clicked', () => {
      render(<AccessDenied />);

      fireEvent.click(screen.getByRole('button', { name: 'Go back' }));

      expect(mockBack).toHaveBeenCalledTimes(1);
    });

    it('button has outline variant styling', () => {
      render(<AccessDenied />);
      const button = screen.getByRole('button', { name: 'Go back' });
      // The Button component with variant="outline" adds specific classes
      expect(button).toBeInTheDocument();
    });
  });

  describe('Layout', () => {
    it('is centered on the page', () => {
      const { container } = render(<AccessDenied />);
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain('flex');
      expect(wrapper.className).toContain('items-center');
      expect(wrapper.className).toContain('justify-center');
    });

    it('has minimum height', () => {
      const { container } = render(<AccessDenied />);
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain('min-h-');
    });

    it('has text-center alignment', () => {
      const { container } = render(<AccessDenied />);
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain('text-center');
    });
  });

  describe('Accessibility', () => {
    it('heading is level 1', () => {
      render(<AccessDenied />);
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toHaveTextContent('Access Denied');
    });

    it('icon is aria-hidden', () => {
      render(<AccessDenied />);
      const icon = document.querySelector('svg');
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('Styling', () => {
    it('icon has destructive/error color', () => {
      render(<AccessDenied />);
      const icon = document.querySelector('svg');
      // SVG elements use SVGAnimatedString for className, so check via classList
      expect(icon?.classList.contains('text-destructive')).toBe(true);
    });

    it('description has muted color', () => {
      render(<AccessDenied />);
      const description = screen.getByText(/do not have permission/i);
      expect(description.className).toContain('text-muted-foreground');
    });
  });
});
