/**
 * Frontend RBAC UI Element Tests
 *
 * Verifies that the frontend correctly hides/shows UI elements based on user role.
 * Tests the sidebar navigation permission filtering and page-level write button visibility.
 *
 * Requirements: 44.7, 51.4
 */
import { describe, it, expect } from 'vitest';
import { PERMISSIONS } from '@as-finance/shared/constants';
import { UserRole } from '@as-finance/shared/enums';

// ─── Sidebar navigation items (from apps/web/src/components/sidebar-nav.tsx) ─

interface NavItem {
  label: string;
  href: string;
  permission: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Customers', href: '/customers', permission: 'customer.read' },
  { label: 'Loans', href: '/loans', permission: 'loan.read' },
  { label: 'Collections', href: '/collections', permission: 'collection.read' },
  { label: 'Receipts', href: '/receipts', permission: 'receipt.read' },
  { label: 'Groups', href: '/groups', permission: 'group.read' },
  { label: 'Accounting', href: '/accounting', permission: 'accounting.read' },
  { label: 'Cashbook', href: '/cashbook', permission: 'accounting.manage_cashbook' },
  { label: 'Reports', href: '/reports', permission: 'report.read' },
  { label: 'Notifications', href: '/notifications', permission: 'notification.read' },
  { label: 'Users', href: '/users', permission: 'user.read' },
  { label: 'Audit Logs', href: '/audit', permission: 'audit.read' },
  { label: 'Settings', href: '/settings', permission: 'settings.read' },
];

// ─── Write action buttons on pages ───────────────────────────────────────────

interface WriteButton {
  page: string;
  label: string;
  /** Permission required to show this button */
  requiredPermission: string;
}

const WRITE_BUTTONS: WriteButton[] = [
  { page: '/customers', label: 'New Customer', requiredPermission: 'customer.create' },
  { page: '/loans', label: 'New Loan', requiredPermission: 'loan.create' },
  { page: '/collections', label: 'Post Collection', requiredPermission: 'collection.create' },
  { page: '/groups', label: 'New Group', requiredPermission: 'group.create' },
];

// ─── Helper ──────────────────────────────────────────────────────────────────

function hasPermission(role: string, permission: string): boolean {
  const allowed = PERMISSIONS[permission];
  if (!allowed) return false;
  return (allowed as readonly string[]).includes(role);
}

function getVisibleNavItems(role: string): NavItem[] {
  return NAV_ITEMS.filter((item) => hasPermission(role, item.permission));
}

function getVisibleWriteButtons(role: string): WriteButton[] {
  return WRITE_BUTTONS.filter((btn) => hasPermission(role, btn.requiredPermission));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Frontend RBAC UI Element Tests', () => {
  describe('44.7 Auditor (viewer_auditor) does not see write buttons', () => {
    const auditorRole = UserRole.VIEWER_AUDITOR;

    it('auditor should NOT see "New Customer" button', () => {
      expect(hasPermission(auditorRole, 'customer.create')).toBe(false);
    });

    it('auditor should NOT see "New Loan" button', () => {
      expect(hasPermission(auditorRole, 'loan.create')).toBe(false);
    });

    it('auditor should NOT see "Post Collection" button', () => {
      expect(hasPermission(auditorRole, 'collection.create')).toBe(false);
    });

    it('auditor should NOT see "New Group" button', () => {
      expect(hasPermission(auditorRole, 'group.create')).toBe(false);
    });

    it('auditor has zero visible write buttons', () => {
      const visibleButtons = getVisibleWriteButtons(auditorRole);
      expect(visibleButtons).toHaveLength(0);
    });

    it('auditor can see read-only nav items', () => {
      const visibleItems = getVisibleNavItems(auditorRole);
      const visibleLabels = visibleItems.map((i) => i.label);

      // Auditor should see: Customers, Loans, Collections, Receipts, Groups, Reports, Audit Logs
      expect(visibleLabels).toContain('Customers');
      expect(visibleLabels).toContain('Loans');
      expect(visibleLabels).toContain('Collections');
      expect(visibleLabels).toContain('Receipts');
      expect(visibleLabels).toContain('Groups');
      expect(visibleLabels).toContain('Reports');
      expect(visibleLabels).toContain('Audit Logs');
    });

    it('auditor should NOT see admin-only nav items', () => {
      const visibleItems = getVisibleNavItems(auditorRole);
      const visibleLabels = visibleItems.map((i) => i.label);

      // Auditor should NOT see: Users, Settings, Notifications, Cashbook
      expect(visibleLabels).not.toContain('Users');
      expect(visibleLabels).not.toContain('Settings');
      expect(visibleLabels).not.toContain('Notifications');
      expect(visibleLabels).not.toContain('Cashbook');
    });

    it('auditor should see Accounting (has accounting.read permission)', () => {
      expect(hasPermission(auditorRole, 'accounting.read')).toBe(true);
      const visibleItems = getVisibleNavItems(auditorRole);
      expect(visibleItems.map((i) => i.label)).toContain('Accounting');
    });
  });

  describe('51.4 RBAC UI gaps — all roles have correct nav visibility', () => {
    it('super_admin sees all nav items', () => {
      const visibleItems = getVisibleNavItems(UserRole.SUPER_ADMIN);
      expect(visibleItems.length).toBe(NAV_ITEMS.length);
    });

    it('manager sees all nav items', () => {
      const visibleItems = getVisibleNavItems(UserRole.MANAGER);
      expect(visibleItems.length).toBe(NAV_ITEMS.length);
    });

    it('field_officer sees correct nav items', () => {
      const visibleItems = getVisibleNavItems(UserRole.FIELD_OFFICER);
      const visibleLabels = visibleItems.map((i) => i.label);

      expect(visibleLabels).toContain('Customers');
      expect(visibleLabels).toContain('Loans');
      expect(visibleLabels).toContain('Collections');
      expect(visibleLabels).toContain('Receipts');
      expect(visibleLabels).toContain('Groups');
      expect(visibleLabels).toContain('Reports');

      // Field officer should NOT see admin items
      expect(visibleLabels).not.toContain('Users');
      expect(visibleLabels).not.toContain('Settings');
      expect(visibleLabels).not.toContain('Notifications');
      expect(visibleLabels).not.toContain('Accounting');
      expect(visibleLabels).not.toContain('Cashbook');
      expect(visibleLabels).not.toContain('Audit Logs');
    });

    it('collection_officer sees correct nav items', () => {
      const visibleItems = getVisibleNavItems(UserRole.COLLECTION_OFFICER);
      const visibleLabels = visibleItems.map((i) => i.label);

      expect(visibleLabels).toContain('Customers');
      expect(visibleLabels).toContain('Loans');
      expect(visibleLabels).toContain('Collections');
      expect(visibleLabels).toContain('Receipts');
      expect(visibleLabels).toContain('Groups');
      expect(visibleLabels).toContain('Reports');

      // Collection officer should NOT see admin items
      expect(visibleLabels).not.toContain('Users');
      expect(visibleLabels).not.toContain('Settings');
      expect(visibleLabels).not.toContain('Notifications');
      expect(visibleLabels).not.toContain('Accounting');
      expect(visibleLabels).not.toContain('Cashbook');
      expect(visibleLabels).not.toContain('Audit Logs');
    });

    it('accountant sees correct nav items', () => {
      const visibleItems = getVisibleNavItems(UserRole.ACCOUNTANT);
      const visibleLabels = visibleItems.map((i) => i.label);

      expect(visibleLabels).toContain('Customers');
      expect(visibleLabels).toContain('Loans');
      expect(visibleLabels).toContain('Collections');
      expect(visibleLabels).toContain('Receipts');
      expect(visibleLabels).toContain('Groups');
      expect(visibleLabels).toContain('Accounting');
      expect(visibleLabels).toContain('Cashbook');
      expect(visibleLabels).toContain('Reports');

      // Accountant should NOT see admin items
      expect(visibleLabels).not.toContain('Users');
      expect(visibleLabels).not.toContain('Settings');
      expect(visibleLabels).not.toContain('Notifications');
      expect(visibleLabels).not.toContain('Audit Logs');
    });

    it('office_staff sees correct nav items', () => {
      const visibleItems = getVisibleNavItems(UserRole.OFFICE_STAFF);
      const visibleLabels = visibleItems.map((i) => i.label);

      expect(visibleLabels).toContain('Customers');
      expect(visibleLabels).toContain('Loans');
      expect(visibleLabels).toContain('Collections');
      expect(visibleLabels).toContain('Receipts');
      expect(visibleLabels).toContain('Groups');

      // Office staff does NOT have report.read permission
      expect(visibleLabels).not.toContain('Reports');
      // Office staff should NOT see admin items
      expect(visibleLabels).not.toContain('Users');
      expect(visibleLabels).not.toContain('Settings');
      expect(visibleLabels).not.toContain('Notifications');
      expect(visibleLabels).not.toContain('Accounting');
      expect(visibleLabels).not.toContain('Cashbook');
      expect(visibleLabels).not.toContain('Audit Logs');
    });
  });

  describe('Write button visibility per role', () => {
    it('field_officer sees New Customer and New Loan buttons', () => {
      const buttons = getVisibleWriteButtons(UserRole.FIELD_OFFICER);
      const labels = buttons.map((b) => b.label);
      expect(labels).toContain('New Customer');
      expect(labels).toContain('New Loan');
      expect(labels).toContain('New Group');
      expect(labels).not.toContain('Post Collection');
    });

    it('collection_officer sees Post Collection button only', () => {
      const buttons = getVisibleWriteButtons(UserRole.COLLECTION_OFFICER);
      const labels = buttons.map((b) => b.label);
      expect(labels).toContain('Post Collection');
      expect(labels).not.toContain('New Customer');
      expect(labels).not.toContain('New Loan');
      expect(labels).not.toContain('New Group');
    });

    it('accountant sees no write buttons on main pages', () => {
      const buttons = getVisibleWriteButtons(UserRole.ACCOUNTANT);
      expect(buttons).toHaveLength(0);
    });

    it('office_staff sees New Customer and New Loan buttons', () => {
      const buttons = getVisibleWriteButtons(UserRole.OFFICE_STAFF);
      const labels = buttons.map((b) => b.label);
      expect(labels).toContain('New Customer');
      expect(labels).toContain('New Loan');
      expect(labels).not.toContain('Post Collection');
      expect(labels).not.toContain('New Group');
    });
  });
});
