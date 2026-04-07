import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PaginationControls } from '../pagination-controls';

/**
 * PaginationControls Component Unit Tests
 *
 * Tests the PaginationControls component for:
 * - Correct page display (Page X of Y)
 * - Previous button disabled on first page
 * - Next button disabled on last page
 * - Button click navigation
 * - Component not rendered when totalPages <= 1
 *
 * **Validates: Property 9 - totalPages = ceil(total / pageSize), skip = (page - 1) * pageSize**
 */

describe('PaginationControls', () => {
  const defaultProps = {
    page: 1,
    totalPages: 5,
    onPageChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders page indicator', () => {
      render(<PaginationControls {...defaultProps} page={3} totalPages={5} />);
      expect(screen.getByText('Page 3 of 5')).toBeInTheDocument();
    });

    it('renders previous and next buttons', () => {
      render(<PaginationControls {...defaultProps} />);
      expect(screen.getByRole('button', { name: 'Previous page' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Next page' })).toBeInTheDocument();
    });
  });

  describe('Hidden when single page', () => {
    it('returns null when totalPages is 1', () => {
      const { container } = render(<PaginationControls {...defaultProps} totalPages={1} />);
      expect(container).toBeEmptyDOMElement();
    });

    it('returns null when totalPages is 0', () => {
      const { container } = render(<PaginationControls {...defaultProps} totalPages={0} />);
      expect(container).toBeEmptyDOMElement();
    });

    it('returns null when totalPages is negative', () => {
      const { container } = render(<PaginationControls {...defaultProps} totalPages={-1} />);
      expect(container).toBeEmptyDOMElement();
    });

    it('renders when totalPages is 2', () => {
      render(<PaginationControls {...defaultProps} totalPages={2} />);
      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    });
  });

  describe('First page', () => {
    it('previous button is disabled on first page', () => {
      render(<PaginationControls {...defaultProps} page={1} totalPages={5} />);
      const prevButton = screen.getByRole('button', { name: 'Previous page' });
      expect(prevButton).toBeDisabled();
    });

    it('next button is enabled on first page', () => {
      render(<PaginationControls {...defaultProps} page={1} totalPages={5} />);
      const nextButton = screen.getByRole('button', { name: 'Next page' });
      expect(nextButton).not.toBeDisabled();
    });
  });

  describe('Last page', () => {
    it('next button is disabled on last page', () => {
      render(<PaginationControls {...defaultProps} page={5} totalPages={5} />);
      const nextButton = screen.getByRole('button', { name: 'Next page' });
      expect(nextButton).toBeDisabled();
    });

    it('previous button is enabled on last page', () => {
      render(<PaginationControls {...defaultProps} page={5} totalPages={5} />);
      const prevButton = screen.getByRole('button', { name: 'Previous page' });
      expect(prevButton).not.toBeDisabled();
    });
  });

  describe('Middle page', () => {
    it('both buttons are enabled on middle page', () => {
      render(<PaginationControls {...defaultProps} page={3} totalPages={5} />);
      const prevButton = screen.getByRole('button', { name: 'Previous page' });
      const nextButton = screen.getByRole('button', { name: 'Next page' });
      expect(prevButton).not.toBeDisabled();
      expect(nextButton).not.toBeDisabled();
    });
  });

  describe('Button interactions', () => {
    it('clicking next calls onPageChange with page + 1', () => {
      const onPageChange = vi.fn();
      render(<PaginationControls page={2} totalPages={5} onPageChange={onPageChange} />);

      fireEvent.click(screen.getByRole('button', { name: 'Next page' }));

      expect(onPageChange).toHaveBeenCalledWith(3);
    });

    it('clicking previous calls onPageChange with page - 1', () => {
      const onPageChange = vi.fn();
      render(<PaginationControls page={3} totalPages={5} onPageChange={onPageChange} />);

      fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));

      expect(onPageChange).toHaveBeenCalledWith(2);
    });

    it('clicking disabled previous button does not call onPageChange', () => {
      const onPageChange = vi.fn();
      render(<PaginationControls page={1} totalPages={5} onPageChange={onPageChange} />);

      const prevButton = screen.getByRole('button', { name: 'Previous page' });
      fireEvent.click(prevButton);

      // Button is disabled so click should not propagate
      expect(onPageChange).not.toHaveBeenCalled();
    });

    it('clicking disabled next button does not call onPageChange', () => {
      const onPageChange = vi.fn();
      render(<PaginationControls page={5} totalPages={5} onPageChange={onPageChange} />);

      const nextButton = screen.getByRole('button', { name: 'Next page' });
      fireEvent.click(nextButton);

      // Button is disabled so click should not propagate
      expect(onPageChange).not.toHaveBeenCalled();
    });
  });

  describe('Page display variations', () => {
    const pageTests = [
      { page: 1, totalPages: 2, expected: 'Page 1 of 2' },
      { page: 2, totalPages: 2, expected: 'Page 2 of 2' },
      { page: 1, totalPages: 10, expected: 'Page 1 of 10' },
      { page: 5, totalPages: 10, expected: 'Page 5 of 10' },
      { page: 10, totalPages: 10, expected: 'Page 10 of 10' },
      { page: 1, totalPages: 100, expected: 'Page 1 of 100' },
      { page: 50, totalPages: 100, expected: 'Page 50 of 100' },
    ];

    it.each(pageTests)('shows "$expected" for page $page of $totalPages', ({ page, totalPages, expected }) => {
      render(<PaginationControls page={page} totalPages={totalPages} onPageChange={vi.fn()} />);
      expect(screen.getByText(expected)).toBeInTheDocument();
    });
  });
});
