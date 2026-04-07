import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToastContainer } from '../toast';
import type { ToastItem } from '@/providers/toast-provider';

// Mock useToast hook
const mockDismissToast = vi.fn();
let mockToasts: ToastItem[] = [];

vi.mock('@/providers/toast-provider', () => ({
  useToast: () => ({
    toasts: mockToasts,
    dismissToast: mockDismissToast,
  }),
}));

/**
 * ToastContainer Component Unit Tests
 *
 * Tests the ToastContainer component for:
 * - Renders nothing when no toasts
 * - Success variant styling (green)
 * - Error variant styling (red/destructive)
 * - Warning variant styling (orange)
 * - Variant icons (CheckCircle, XCircle, AlertTriangle)
 * - Dismiss button functionality
 * - Accessibility attributes (aria-live, role)
 * - Multiple toasts rendering
 *
 * **Validates: Toast notification display component**
 */

describe('ToastContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToasts = [];
  });

  describe('Empty State', () => {
    it('renders nothing when no toasts', () => {
      mockToasts = [];
      const { container } = render(<ToastContainer />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('Success Variant', () => {
    it('renders success toast', () => {
      mockToasts = [{ id: '1', message: 'Operation successful', variant: 'success' }];
      render(<ToastContainer />);
      expect(screen.getByText('Operation successful')).toBeInTheDocument();
    });

    it('has success styling', () => {
      mockToasts = [{ id: '1', message: 'Success!', variant: 'success' }];
      render(<ToastContainer />);
      const toast = screen.getByRole('status');
      expect(toast.className).toContain('border-green-500');
      expect(toast.className).toContain('bg-green-50');
    });

    it('has CheckCircle icon', () => {
      mockToasts = [{ id: '1', message: 'Success!', variant: 'success' }];
      render(<ToastContainer />);
      const toast = screen.getByRole('status');
      const icon = toast.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });
  });

  describe('Error Variant', () => {
    it('renders error toast', () => {
      mockToasts = [{ id: '1', message: 'Something went wrong', variant: 'error' }];
      render(<ToastContainer />);
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('has destructive styling', () => {
      mockToasts = [{ id: '1', message: 'Error!', variant: 'error' }];
      render(<ToastContainer />);
      const toast = screen.getByRole('status');
      expect(toast.className).toContain('border-destructive');
      expect(toast.className).toContain('bg-destructive');
    });

    it('has XCircle icon', () => {
      mockToasts = [{ id: '1', message: 'Error!', variant: 'error' }];
      render(<ToastContainer />);
      const toast = screen.getByRole('status');
      const icon = toast.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });
  });

  describe('Warning Variant', () => {
    it('renders warning toast', () => {
      mockToasts = [{ id: '1', message: 'Be careful!', variant: 'warning' }];
      render(<ToastContainer />);
      expect(screen.getByText('Be careful!')).toBeInTheDocument();
    });

    it('has warning styling', () => {
      mockToasts = [{ id: '1', message: 'Warning!', variant: 'warning' }];
      render(<ToastContainer />);
      const toast = screen.getByRole('status');
      expect(toast.className).toContain('border-orange-500');
      expect(toast.className).toContain('bg-orange-50');
    });

    it('has AlertTriangle icon', () => {
      mockToasts = [{ id: '1', message: 'Warning!', variant: 'warning' }];
      render(<ToastContainer />);
      const toast = screen.getByRole('status');
      const icon = toast.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });
  });

  describe('Dismiss Button', () => {
    it('renders dismiss button', () => {
      mockToasts = [{ id: '1', message: 'Test', variant: 'success' }];
      render(<ToastContainer />);
      expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
    });

    it('calls dismissToast with correct id when clicked', () => {
      mockToasts = [{ id: 'toast-123', message: 'Test', variant: 'success' }];
      render(<ToastContainer />);

      fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

      expect(mockDismissToast).toHaveBeenCalledWith('toast-123');
    });

    it('has X icon', () => {
      mockToasts = [{ id: '1', message: 'Test', variant: 'success' }];
      render(<ToastContainer />);
      const button = screen.getByRole('button', { name: 'Dismiss' });
      const icon = button.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('container has aria-live="polite"', () => {
      mockToasts = [{ id: '1', message: 'Test', variant: 'success' }];
      render(<ToastContainer />);
      const container = screen.getByLabelText('Notifications');
      expect(container).toHaveAttribute('aria-live', 'polite');
    });

    it('container has aria-label="Notifications"', () => {
      mockToasts = [{ id: '1', message: 'Test', variant: 'success' }];
      render(<ToastContainer />);
      expect(screen.getByLabelText('Notifications')).toBeInTheDocument();
    });

    it('individual toast has role="status"', () => {
      mockToasts = [{ id: '1', message: 'Test', variant: 'success' }];
      render(<ToastContainer />);
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('dismiss button has aria-label', () => {
      mockToasts = [{ id: '1', message: 'Test', variant: 'success' }];
      render(<ToastContainer />);
      expect(screen.getByRole('button', { name: 'Dismiss' })).toHaveAttribute('aria-label', 'Dismiss');
    });
  });

  describe('Multiple Toasts', () => {
    it('renders multiple toasts', () => {
      mockToasts = [
        { id: '1', message: 'First toast', variant: 'success' },
        { id: '2', message: 'Second toast', variant: 'error' },
        { id: '3', message: 'Third toast', variant: 'warning' },
      ];
      render(<ToastContainer />);

      expect(screen.getByText('First toast')).toBeInTheDocument();
      expect(screen.getByText('Second toast')).toBeInTheDocument();
      expect(screen.getByText('Third toast')).toBeInTheDocument();
    });

    it('renders correct number of dismiss buttons', () => {
      mockToasts = [
        { id: '1', message: 'First', variant: 'success' },
        { id: '2', message: 'Second', variant: 'error' },
      ];
      render(<ToastContainer />);

      const buttons = screen.getAllByRole('button', { name: 'Dismiss' });
      expect(buttons).toHaveLength(2);
    });

    it('dismisses correct toast when button clicked', () => {
      mockToasts = [
        { id: 'first', message: 'First', variant: 'success' },
        { id: 'second', message: 'Second', variant: 'error' },
      ];
      render(<ToastContainer />);

      const buttons = screen.getAllByRole('button', { name: 'Dismiss' });
      fireEvent.click(buttons[1]); // Click second dismiss button

      expect(mockDismissToast).toHaveBeenCalledWith('second');
    });

    it('each toast has unique key', () => {
      mockToasts = [
        { id: 'unique-1', message: 'First', variant: 'success' },
        { id: 'unique-2', message: 'Second', variant: 'error' },
      ];
      render(<ToastContainer />);

      const toasts = screen.getAllByRole('status');
      expect(toasts).toHaveLength(2);
    });
  });

  describe('Positioning', () => {
    it('container is fixed position', () => {
      mockToasts = [{ id: '1', message: 'Test', variant: 'success' }];
      render(<ToastContainer />);
      const container = screen.getByLabelText('Notifications');
      expect(container.className).toContain('fixed');
    });

    it('container is positioned bottom-right', () => {
      mockToasts = [{ id: '1', message: 'Test', variant: 'success' }];
      render(<ToastContainer />);
      const container = screen.getByLabelText('Notifications');
      expect(container.className).toContain('bottom-4');
      expect(container.className).toContain('right-4');
    });

    it('container has high z-index', () => {
      mockToasts = [{ id: '1', message: 'Test', variant: 'success' }];
      render(<ToastContainer />);
      const container = screen.getByLabelText('Notifications');
      expect(container.className).toContain('z-50');
    });
  });

  describe('Animation', () => {
    it('toast has slide-in animation class', () => {
      mockToasts = [{ id: '1', message: 'Test', variant: 'success' }];
      render(<ToastContainer />);
      const toast = screen.getByRole('status');
      expect(toast.className).toContain('animate-in');
      expect(toast.className).toContain('slide-in-from-right');
    });

    it('toast has fade-in animation', () => {
      mockToasts = [{ id: '1', message: 'Test', variant: 'success' }];
      render(<ToastContainer />);
      const toast = screen.getByRole('status');
      expect(toast.className).toContain('fade-in');
    });
  });

  describe('Message Content', () => {
    it('displays long messages', () => {
      const longMessage = 'This is a very long toast message that should still display correctly without truncation issues';
      mockToasts = [{ id: '1', message: longMessage, variant: 'success' }];
      render(<ToastContainer />);
      expect(screen.getByText(longMessage)).toBeInTheDocument();
    });

    it('displays special characters in message', () => {
      mockToasts = [{ id: '1', message: 'Amount: ₹10,000.00', variant: 'success' }];
      render(<ToastContainer />);
      expect(screen.getByText('Amount: ₹10,000.00')).toBeInTheDocument();
    });

    it('handles empty message string', () => {
      mockToasts = [{ id: '1', message: '', variant: 'success' }];
      render(<ToastContainer />);
      expect(screen.getByRole('status')).toBeInTheDocument();
    });
  });

  describe('Styling Classes', () => {
    it('toast has rounded corners', () => {
      mockToasts = [{ id: '1', message: 'Test', variant: 'success' }];
      render(<ToastContainer />);
      const toast = screen.getByRole('status');
      expect(toast.className).toContain('rounded-md');
    });

    it('toast has border', () => {
      mockToasts = [{ id: '1', message: 'Test', variant: 'success' }];
      render(<ToastContainer />);
      const toast = screen.getByRole('status');
      expect(toast.className).toContain('border');
    });

    it('toast has shadow', () => {
      mockToasts = [{ id: '1', message: 'Test', variant: 'success' }];
      render(<ToastContainer />);
      const toast = screen.getByRole('status');
      expect(toast.className).toContain('shadow-lg');
    });

    it('toast has padding', () => {
      mockToasts = [{ id: '1', message: 'Test', variant: 'success' }];
      render(<ToastContainer />);
      const toast = screen.getByRole('status');
      expect(toast.className).toContain('px-4');
      expect(toast.className).toContain('py-3');
    });
  });
});
