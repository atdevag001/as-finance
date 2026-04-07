import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from '../status-badge';

/**
 * StatusBadge Component Unit Tests
 *
 * Tests the StatusBadge component for:
 * - All 8 status type mappings (loan, overdue_bucket, installment, collection, customer, penalty, product, group)
 * - Correct CSS variant classes for each status
 * - Unknown status fallback to neutral
 * - Display label formatting (underscores to spaces)
 * - Custom label override
 *
 * **Validates: Property 8 - Every status/type combination maps to exactly one variant**
 */

describe('StatusBadge', () => {
  describe('Loan Status (11 values)', () => {
    const loanStatusTests: Array<{ status: string; expectedClass: string; description: string }> = [
      { status: 'draft', expectedClass: 'bg-gray-100', description: 'neutral variant' },
      { status: 'submitted', expectedClass: 'bg-blue-100', description: 'info variant' },
      { status: 'under_review', expectedClass: 'bg-blue-100', description: 'info variant' },
      { status: 'approved', expectedClass: 'bg-green-100', description: 'success variant' },
      { status: 'rejected', expectedClass: 'bg-red-100', description: 'danger variant' },
      { status: 'disbursed', expectedClass: 'bg-blue-100', description: 'info variant' },
      { status: 'active', expectedClass: 'bg-green-100', description: 'success variant' },
      { status: 'overdue', expectedClass: 'bg-yellow-100', description: 'warning variant' },
      { status: 'defaulted', expectedClass: 'bg-red-100', description: 'danger variant' },
      { status: 'foreclosed', expectedClass: 'bg-yellow-100', description: 'warning variant' },
      { status: 'closed', expectedClass: 'bg-gray-100', description: 'neutral variant' },
    ];

    it.each(loanStatusTests)('renders $status with $description', ({ status, expectedClass }) => {
      render(<StatusBadge status={status} type="loan" />);
      const badge = screen.getByText(status.replace(/_/g, ' '));
      expect(badge.className).toContain(expectedClass);
    });
  });

  describe('Overdue Bucket (5 values)', () => {
    const overdueBucketTests: Array<{ status: string; expectedClass: string; description: string }> = [
      { status: 'bucket_0', expectedClass: 'bg-green-100', description: 'success variant' },
      { status: 'bucket_1_30', expectedClass: 'bg-orange-100', description: 'overdue-1 variant' },
      { status: 'bucket_31_60', expectedClass: 'bg-orange-200', description: 'overdue-2 variant' },
      { status: 'bucket_61_90', expectedClass: 'bg-red-200', description: 'overdue-3 variant' },
      { status: 'bucket_90_plus', expectedClass: 'bg-red-300', description: 'overdue-4 variant' },
    ];

    it.each(overdueBucketTests)('renders $status with $description', ({ status, expectedClass }) => {
      render(<StatusBadge status={status} type="overdue_bucket" />);
      const badge = screen.getByText(status.replace(/_/g, ' '));
      expect(badge.className).toContain(expectedClass);
    });
  });

  describe('Installment Status (5 values)', () => {
    const installmentStatusTests: Array<{ status: string; expectedClass: string; description: string }> = [
      { status: 'pending', expectedClass: 'bg-gray-100', description: 'neutral variant' },
      { status: 'partial', expectedClass: 'bg-yellow-100', description: 'warning variant' },
      { status: 'paid', expectedClass: 'bg-green-100', description: 'success variant' },
      { status: 'overdue', expectedClass: 'bg-red-100', description: 'danger variant' },
      { status: 'closed', expectedClass: 'bg-gray-100', description: 'neutral variant' },
    ];

    it.each(installmentStatusTests)('renders $status with $description', ({ status, expectedClass }) => {
      render(<StatusBadge status={status} type="installment" />);
      const badge = screen.getByText(status.replace(/_/g, ' '));
      expect(badge.className).toContain(expectedClass);
    });
  });

  describe('Collection Status (2 values)', () => {
    const collectionStatusTests: Array<{ status: string; expectedClass: string; description: string }> = [
      { status: 'posted', expectedClass: 'bg-green-100', description: 'success variant' },
      { status: 'reversed', expectedClass: 'bg-red-100', description: 'danger variant' },
    ];

    it.each(collectionStatusTests)('renders $status with $description', ({ status, expectedClass }) => {
      render(<StatusBadge status={status} type="collection" />);
      const badge = screen.getByText(status.replace(/_/g, ' '));
      expect(badge.className).toContain(expectedClass);
    });
  });

  describe('Customer Status (3 values)', () => {
    const customerStatusTests: Array<{ status: string; expectedClass: string; description: string }> = [
      { status: 'active', expectedClass: 'bg-green-100', description: 'success variant' },
      { status: 'blacklisted', expectedClass: 'bg-red-100', description: 'danger variant' },
      { status: 'inactive', expectedClass: 'bg-gray-100', description: 'neutral variant' },
    ];

    it.each(customerStatusTests)('renders $status with $description', ({ status, expectedClass }) => {
      render(<StatusBadge status={status} type="customer" />);
      const badge = screen.getByText(status.replace(/_/g, ' '));
      expect(badge.className).toContain(expectedClass);
    });
  });

  describe('Penalty Status (3 values)', () => {
    const penaltyStatusTests: Array<{ status: string; expectedClass: string; description: string }> = [
      { status: 'pending', expectedClass: 'bg-yellow-100', description: 'warning variant' },
      { status: 'paid', expectedClass: 'bg-green-100', description: 'success variant' },
      { status: 'waived', expectedClass: 'bg-blue-100', description: 'info variant' },
    ];

    it.each(penaltyStatusTests)('renders $status with $description', ({ status, expectedClass }) => {
      render(<StatusBadge status={status} type="penalty" />);
      const badge = screen.getByText(status.replace(/_/g, ' '));
      expect(badge.className).toContain(expectedClass);
    });
  });

  describe('Product Status (2 values)', () => {
    const productStatusTests: Array<{ status: string; expectedClass: string; description: string }> = [
      { status: 'active', expectedClass: 'bg-green-100', description: 'success variant' },
      { status: 'inactive', expectedClass: 'bg-gray-100', description: 'neutral variant' },
    ];

    it.each(productStatusTests)('renders $status with $description', ({ status, expectedClass }) => {
      render(<StatusBadge status={status} type="product" />);
      const badge = screen.getByText(status.replace(/_/g, ' '));
      expect(badge.className).toContain(expectedClass);
    });
  });

  describe('Group Status (3 values)', () => {
    const groupStatusTests: Array<{ status: string; expectedClass: string; description: string }> = [
      { status: 'active', expectedClass: 'bg-green-100', description: 'success variant' },
      { status: 'inactive', expectedClass: 'bg-gray-100', description: 'neutral variant' },
      { status: 'disbanded', expectedClass: 'bg-red-100', description: 'danger variant' },
    ];

    it.each(groupStatusTests)('renders $status with $description', ({ status, expectedClass }) => {
      render(<StatusBadge status={status} type="group" />);
      const badge = screen.getByText(status.replace(/_/g, ' '));
      expect(badge.className).toContain(expectedClass);
    });
  });

  describe('Unknown status fallback', () => {
    it('defaults to neutral variant for unknown loan status', () => {
      render(<StatusBadge status="unknown_status" type="loan" />);
      const badge = screen.getByText('unknown status');
      expect(badge.className).toContain('bg-gray-100');
    });

    it('defaults to neutral variant for unknown customer status', () => {
      render(<StatusBadge status="suspended" type="customer" />);
      const badge = screen.getByText('suspended');
      expect(badge.className).toContain('bg-gray-100');
    });

    it('defaults to neutral variant for unknown collection status', () => {
      render(<StatusBadge status="pending_verification" type="collection" />);
      const badge = screen.getByText('pending verification');
      expect(badge.className).toContain('bg-gray-100');
    });
  });

  describe('Display label formatting', () => {
    it('replaces underscores with spaces', () => {
      render(<StatusBadge status="under_review" type="loan" />);
      expect(screen.getByText('under review')).toBeInTheDocument();
    });

    it('replaces multiple underscores', () => {
      render(<StatusBadge status="bucket_61_90" type="overdue_bucket" />);
      expect(screen.getByText('bucket 61 90')).toBeInTheDocument();
    });

    it('handles status without underscores', () => {
      render(<StatusBadge status="active" type="loan" />);
      expect(screen.getByText('active')).toBeInTheDocument();
    });
  });

  describe('Custom label override', () => {
    it('uses custom label when provided', () => {
      render(<StatusBadge status="active" type="loan" label="Currently Active" />);
      expect(screen.getByText('Currently Active')).toBeInTheDocument();
    });

    it('custom label overrides underscore replacement', () => {
      render(<StatusBadge status="under_review" type="loan" label="Under Review" />);
      expect(screen.getByText('Under Review')).toBeInTheDocument();
      expect(screen.queryByText('under review')).not.toBeInTheDocument();
    });
  });

  describe('CSS structure', () => {
    it('has base badge classes', () => {
      render(<StatusBadge status="active" type="loan" />);
      const badge = screen.getByText('active');
      expect(badge.className).toContain('inline-flex');
      expect(badge.className).toContain('items-center');
      expect(badge.className).toContain('rounded-full');
      expect(badge.className).toContain('px-2.5');
      expect(badge.className).toContain('py-0.5');
      expect(badge.className).toContain('text-xs');
      expect(badge.className).toContain('font-medium');
      expect(badge.className).toContain('capitalize');
    });

    it('accepts additional className', () => {
      render(<StatusBadge status="active" type="loan" className="my-custom-class" />);
      const badge = screen.getByText('active');
      expect(badge.className).toContain('my-custom-class');
    });
  });

  describe('Default type', () => {
    it('defaults to loan type when type is not specified', () => {
      render(<StatusBadge status="approved" />);
      const badge = screen.getByText('approved');
      // loan type 'approved' should be success (green)
      expect(badge.className).toContain('bg-green-100');
    });
  });
});
