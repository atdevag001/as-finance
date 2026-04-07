import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorMessage } from '../error-message';

/**
 * ErrorMessage Component Unit Tests
 *
 * Tests the ErrorMessage component for:
 * - Renders error message text
 * - Has destructive/red styling
 * - Has role="alert" for accessibility
 * - Supports custom className
 *
 * **Validates: Error display component**
 */

describe('ErrorMessage', () => {
  describe('Rendering', () => {
    it('renders the error message', () => {
      render(<ErrorMessage message="Something went wrong" />);
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('renders different error messages', () => {
      const { rerender } = render(<ErrorMessage message="Network error" />);
      expect(screen.getByText('Network error')).toBeInTheDocument();

      rerender(<ErrorMessage message="Validation failed" />);
      expect(screen.getByText('Validation failed')).toBeInTheDocument();
    });

    it('renders empty string without crashing', () => {
      render(<ErrorMessage message="" />);
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has role="alert" for screen readers', () => {
      render(<ErrorMessage message="Error occurred" />);
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('the alert contains the message', () => {
      render(<ErrorMessage message="Critical failure" />);
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent('Critical failure');
    });
  });

  describe('Styling', () => {
    it('has destructive color class', () => {
      render(<ErrorMessage message="Error" />);
      const alert = screen.getByRole('alert');
      expect(alert.className).toContain('text-destructive');
    });

    it('has background styling', () => {
      render(<ErrorMessage message="Error" />);
      const alert = screen.getByRole('alert');
      expect(alert.className).toContain('bg-destructive');
    });

    it('has rounded border', () => {
      render(<ErrorMessage message="Error" />);
      const alert = screen.getByRole('alert');
      expect(alert.className).toContain('rounded');
    });
  });

  describe('Custom className', () => {
    it('applies custom className', () => {
      render(<ErrorMessage message="Error" className="my-custom-class" />);
      const alert = screen.getByRole('alert');
      expect(alert.className).toContain('my-custom-class');
    });

    it('preserves default classes when custom class is added', () => {
      render(<ErrorMessage message="Error" className="extra-class" />);
      const alert = screen.getByRole('alert');
      expect(alert.className).toContain('text-destructive');
      expect(alert.className).toContain('extra-class');
    });

    it('works without className prop', () => {
      render(<ErrorMessage message="Error" />);
      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
    });
  });

  describe('Error Message Types', () => {
    const errorMessages = [
      { message: 'Invalid username or password', description: 'auth error' },
      { message: 'Network request failed', description: 'network error' },
      { message: 'Server returned 500', description: 'server error' },
      { message: 'Validation: Mobile must be 10 digits', description: 'validation error' },
      { message: 'You do not have permission', description: 'permission error' },
      { message: 'Resource not found', description: '404 error' },
      { message: 'Session expired. Please login again', description: 'session error' },
    ];

    it.each(errorMessages)('renders $description correctly', ({ message }) => {
      render(<ErrorMessage message={message} />);
      expect(screen.getByText(message)).toBeInTheDocument();
    });
  });

  describe('Icon', () => {
    it('contains an alert icon', () => {
      render(<ErrorMessage message="Error with icon" />);
      const alert = screen.getByRole('alert');
      // The component uses AlertCircle from lucide-react
      const svg = alert.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });
  });
});
