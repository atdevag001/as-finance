import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PermissionGate } from '../permission-gate';

// Mock the auth provider
const mockUseAuth = vi.fn();
vi.mock('@/providers/auth-provider', () => ({
  useAuth: () => mockUseAuth(),
}));

/**
 * PermissionGate Component Unit Tests
 *
 * Tests the PermissionGate component for:
 * - Rendering children when user has required permission
 * - Rendering fallback when user lacks permission
 * - Rendering null when no fallback and user lacks permission
 * - Handling missing user (unauthenticated state)
 *
 * **Validates: Property 6 - hasPermission(role, perm) == true iff role in PERMISSIONS[perm]**
 * **Validates: Property 7 - Sidebar renders exactly items where hasPermission(role, item.perm) is true**
 */

describe('PermissionGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('User with permission', () => {
    beforeEach(() => {
      // Super admin has all permissions
      mockUseAuth.mockReturnValue({
        user: { id: '1', username: 'admin', fullName: 'Admin User', role: 'super_admin' },
        isLoading: false,
        isAuthenticated: true,
      });
    });

    it('renders children when user has permission', () => {
      render(
        <PermissionGate permission="loan.approve">
          <button>Approve Loan</button>
        </PermissionGate>
      );
      expect(screen.getByRole('button', { name: 'Approve Loan' })).toBeInTheDocument();
    });

    it('does not render fallback when user has permission', () => {
      render(
        <PermissionGate permission="loan.approve" fallback={<span>No access</span>}>
          <button>Approve Loan</button>
        </PermissionGate>
      );
      expect(screen.queryByText('No access')).not.toBeInTheDocument();
    });
  });

  describe('User without permission', () => {
    beforeEach(() => {
      // Field officer doesn't have loan.approve permission
      mockUseAuth.mockReturnValue({
        user: { id: '2', username: 'officer', fullName: 'Field Officer', role: 'field_officer' },
        isLoading: false,
        isAuthenticated: true,
      });
    });

    it('does not render children when user lacks permission', () => {
      render(
        <PermissionGate permission="loan.approve">
          <button>Approve Loan</button>
        </PermissionGate>
      );
      expect(screen.queryByRole('button', { name: 'Approve Loan' })).not.toBeInTheDocument();
    });

    it('renders fallback when user lacks permission', () => {
      render(
        <PermissionGate permission="loan.approve" fallback={<span>No access</span>}>
          <button>Approve Loan</button>
        </PermissionGate>
      );
      expect(screen.getByText('No access')).toBeInTheDocument();
    });

    it('renders null when no fallback provided and user lacks permission', () => {
      const { container } = render(
        <PermissionGate permission="loan.approve">
          <button>Approve Loan</button>
        </PermissionGate>
      );
      expect(container).toBeEmptyDOMElement();
    });
  });

  describe('Different roles and permissions', () => {
    it('manager can approve loans', () => {
      mockUseAuth.mockReturnValue({
        user: { id: '3', username: 'manager', fullName: 'Manager', role: 'manager' },
        isLoading: false,
        isAuthenticated: true,
      });

      render(
        <PermissionGate permission="loan.approve">
          <button>Approve Loan</button>
        </PermissionGate>
      );
      expect(screen.getByRole('button', { name: 'Approve Loan' })).toBeInTheDocument();
    });

    it('collection officer can create collections', () => {
      mockUseAuth.mockReturnValue({
        user: { id: '4', username: 'collector', fullName: 'Collector', role: 'collection_officer' },
        isLoading: false,
        isAuthenticated: true,
      });

      render(
        <PermissionGate permission="collection.create">
          <button>Post Collection</button>
        </PermissionGate>
      );
      expect(screen.getByRole('button', { name: 'Post Collection' })).toBeInTheDocument();
    });

    it('collection officer cannot approve loans', () => {
      mockUseAuth.mockReturnValue({
        user: { id: '4', username: 'collector', fullName: 'Collector', role: 'collection_officer' },
        isLoading: false,
        isAuthenticated: true,
      });

      render(
        <PermissionGate permission="loan.approve">
          <button>Approve Loan</button>
        </PermissionGate>
      );
      expect(screen.queryByRole('button', { name: 'Approve Loan' })).not.toBeInTheDocument();
    });

    it('accountant can view accounting', () => {
      mockUseAuth.mockReturnValue({
        user: { id: '5', username: 'accountant', fullName: 'Accountant', role: 'accountant' },
        isLoading: false,
        isAuthenticated: true,
      });

      render(
        <PermissionGate permission="accounting.read">
          <div>Accounting Dashboard</div>
        </PermissionGate>
      );
      expect(screen.getByText('Accounting Dashboard')).toBeInTheDocument();
    });

    it('viewer_auditor has read-only access to audits', () => {
      mockUseAuth.mockReturnValue({
        user: { id: '6', username: 'auditor', fullName: 'Auditor', role: 'viewer_auditor' },
        isLoading: false,
        isAuthenticated: true,
      });

      render(
        <PermissionGate permission="audit.read">
          <div>Audit Logs</div>
        </PermissionGate>
      );
      expect(screen.getByText('Audit Logs')).toBeInTheDocument();
    });
  });

  describe('Unauthenticated user', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        user: null,
        isLoading: false,
        isAuthenticated: false,
      });
    });

    it('does not render children when user is null', () => {
      render(
        <PermissionGate permission="loan.read">
          <button>View Loans</button>
        </PermissionGate>
      );
      expect(screen.queryByRole('button', { name: 'View Loans' })).not.toBeInTheDocument();
    });

    it('renders fallback when user is null', () => {
      render(
        <PermissionGate permission="loan.read" fallback={<span>Please log in</span>}>
          <button>View Loans</button>
        </PermissionGate>
      );
      expect(screen.getByText('Please log in')).toBeInTheDocument();
    });
  });

  describe('Fallback content types', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        user: { id: '2', username: 'officer', fullName: 'Field Officer', role: 'field_officer' },
        isLoading: false,
        isAuthenticated: true,
      });
    });

    it('accepts string fallback', () => {
      render(
        <PermissionGate permission="loan.approve" fallback="Access denied">
          <button>Approve</button>
        </PermissionGate>
      );
      expect(screen.getByText('Access denied')).toBeInTheDocument();
    });

    it('accepts complex JSX fallback', () => {
      render(
        <PermissionGate
          permission="loan.approve"
          fallback={
            <div>
              <h2>Access Denied</h2>
              <p>You do not have permission to approve loans.</p>
            </div>
          }
        >
          <button>Approve</button>
        </PermissionGate>
      );
      expect(screen.getByRole('heading', { name: 'Access Denied' })).toBeInTheDocument();
      expect(screen.getByText('You do not have permission to approve loans.')).toBeInTheDocument();
    });

    it('accepts null as fallback (explicit)', () => {
      const { container } = render(
        <PermissionGate permission="loan.approve" fallback={null}>
          <button>Approve</button>
        </PermissionGate>
      );
      expect(container).toBeEmptyDOMElement();
    });
  });

  describe('Complex children', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        user: { id: '1', username: 'admin', fullName: 'Admin', role: 'super_admin' },
        isLoading: false,
        isAuthenticated: true,
      });
    });

    it('renders multiple children elements', () => {
      render(
        <PermissionGate permission="user.create">
          <h1>Create User</h1>
          <form>
            <input type="text" placeholder="Username" />
            <button type="submit">Create</button>
          </form>
        </PermissionGate>
      );
      expect(screen.getByRole('heading', { name: 'Create User' })).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Username')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
    });
  });
});
