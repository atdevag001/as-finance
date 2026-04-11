import { UserRole } from '../enums/index.js';

const { SUPER_ADMIN, MANAGER, FIELD_OFFICER, COLLECTION_OFFICER, ACCOUNTANT, OFFICE_STAFF, VIEWER_AUDITOR } = UserRole;

/** All roles for convenience */
const ALL_ROLES = Object.values(UserRole);

/** Read-heavy roles: everyone except those explicitly excluded */
const READ_ALL = ALL_ROLES;

/**
 * Permission matrix mapping module.action → allowed roles.
 * Scope constraints (own, assigned) are enforced at the service layer.
 */
export const PERMISSIONS: Record<string, readonly UserRole[]> = {
  // Customer
  'customer.create': [SUPER_ADMIN, MANAGER, FIELD_OFFICER, OFFICE_STAFF],
  'customer.read': READ_ALL,
  'customer.update': [SUPER_ADMIN, MANAGER, FIELD_OFFICER, OFFICE_STAFF],
  'customer.blacklist': [SUPER_ADMIN, MANAGER],
  'customer.upload_doc': [SUPER_ADMIN, MANAGER, FIELD_OFFICER, OFFICE_STAFF],

  // Loan Product
  'loan_product.create': [SUPER_ADMIN],
  'loan_product.read': READ_ALL,
  'loan_product.update': [SUPER_ADMIN],
  'loan_product.deactivate': [SUPER_ADMIN],

  // Loan
  'loan.create': [SUPER_ADMIN, MANAGER, FIELD_OFFICER, OFFICE_STAFF],
  'loan.read': READ_ALL,
  'loan.submit': [SUPER_ADMIN, MANAGER, FIELD_OFFICER, OFFICE_STAFF],
  'loan.approve': [SUPER_ADMIN, MANAGER],
  'loan.reject': [SUPER_ADMIN, MANAGER],
  'loan.disburse': [SUPER_ADMIN, MANAGER],
  'loan.close': [SUPER_ADMIN, MANAGER],

  // Collection
  'collection.create': [SUPER_ADMIN, MANAGER, COLLECTION_OFFICER],
  'collection.read': READ_ALL,
  'collection.reverse': [SUPER_ADMIN, MANAGER],

  // Receipt
  'receipt.read': READ_ALL,
  'receipt.print': [SUPER_ADMIN, MANAGER, COLLECTION_OFFICER],

  // Accounting
  'accounting.read': [SUPER_ADMIN, MANAGER, ACCOUNTANT, VIEWER_AUDITOR],
  'accounting.create_expense': [SUPER_ADMIN, MANAGER, ACCOUNTANT],
  'accounting.manage_cashbook': [SUPER_ADMIN, MANAGER, ACCOUNTANT],

  // Report
  'report.read': [SUPER_ADMIN, MANAGER, FIELD_OFFICER, COLLECTION_OFFICER, ACCOUNTANT, VIEWER_AUDITOR],
  'report.export': [SUPER_ADMIN, MANAGER, ACCOUNTANT],

  // User
  'user.create': [SUPER_ADMIN, MANAGER],
  'user.read': [SUPER_ADMIN, MANAGER],
  'user.update': [SUPER_ADMIN, MANAGER],
  'user.change_role': [SUPER_ADMIN, MANAGER],

  // Penalty
  'penalty.read': READ_ALL,
  'penalty.calculate': [SUPER_ADMIN, MANAGER],
  'penalty.waive': [SUPER_ADMIN, MANAGER],

  // Foreclosure
  'foreclosure.quote': [SUPER_ADMIN, MANAGER],
  'foreclosure.execute': [SUPER_ADMIN, MANAGER],

  // Group
  'group.create': [SUPER_ADMIN, MANAGER, FIELD_OFFICER],
  'group.read': READ_ALL,
  'group.manage_members': [SUPER_ADMIN, MANAGER, FIELD_OFFICER],
  'group.collect': [SUPER_ADMIN, MANAGER, COLLECTION_OFFICER],

  // Audit
  'audit.read': [SUPER_ADMIN, MANAGER, VIEWER_AUDITOR],

  // Settings
  'settings.read': [SUPER_ADMIN, MANAGER],
  'settings.update': [SUPER_ADMIN],

  // Notification
  'notification.read': [SUPER_ADMIN, MANAGER],
  'notification.retry': [SUPER_ADMIN, MANAGER],

  // Cash Handover
  'handover.create': [SUPER_ADMIN, MANAGER, COLLECTION_OFFICER],
  'handover.verify': [SUPER_ADMIN, MANAGER, ACCOUNTANT],
} as const;
