import { describe, it, expect } from 'vitest';
import {
  UserRole,
  LoanStatus,
  CustomerStatus,
  InterestType,
  Frequency,
  PaymentMode,
  CollectionStatus,
  ReceiptStatus,
  InstallmentStatus,
  OverdueBucket,
  GroupStatus,
  AccountCategory,
  JournalSourceType,
  OutboxStatus,
  AuditAction,
  NotificationEvent,
} from '../index.js';

/**
 * These tests verify that the shared package enum values match
 * the Prisma schema enum definitions exactly.
 *
 * If a Prisma migration adds/removes an enum value, these tests
 * will fail until the shared enum is updated to match.
 *
 * Validates: Requirements 47.7
 */

describe('Enum alignment with Prisma schema', () => {
  it('UserRole values match Prisma UserRole enum', () => {
    const expected = [
      'super_admin',
      'manager',
      'field_officer',
      'collection_officer',
      'accountant',
      'office_staff',
      'viewer_auditor',
    ];
    expect(Object.values(UserRole).sort()).toEqual(expected.sort());
  });

  it('LoanStatus values match Prisma LoanStatus enum', () => {
    const expected = [
      'draft',
      'submitted',
      'under_review',
      'approved',
      'rejected',
      'disbursed',
      'active',
      'overdue',
      'defaulted',
      'foreclosed',
      'closed',
    ];
    expect(Object.values(LoanStatus).sort()).toEqual(expected.sort());
  });

  it('CustomerStatus values match Prisma CustomerStatus enum', () => {
    const expected = ['active', 'blacklisted', 'inactive'];
    expect(Object.values(CustomerStatus).sort()).toEqual(expected.sort());
  });

  it('InterestType values match Prisma InterestType enum', () => {
    const expected = ['flat', 'reducing_balance'];
    expect(Object.values(InterestType).sort()).toEqual(expected.sort());
  });

  it('Frequency values match Prisma Frequency enum', () => {
    const expected = ['daily', 'weekly', 'monthly'];
    expect(Object.values(Frequency).sort()).toEqual(expected.sort());
  });

  it('PaymentMode values match Prisma PaymentMode enum', () => {
    const expected = ['cash', 'bank_transfer', 'online'];
    expect(Object.values(PaymentMode).sort()).toEqual(expected.sort());
  });

  it('CollectionStatus values match Prisma CollectionStatus enum', () => {
    const expected = ['posted', 'reversed'];
    expect(Object.values(CollectionStatus).sort()).toEqual(expected.sort());
  });

  it('ReceiptStatus values match Prisma ReceiptStatus enum', () => {
    const expected = ['active', 'reversed'];
    expect(Object.values(ReceiptStatus).sort()).toEqual(expected.sort());
  });

  it('InstallmentStatus values match Prisma InstallmentStatus enum', () => {
    const expected = ['pending', 'partial', 'paid', 'overdue', 'closed'];
    expect(Object.values(InstallmentStatus).sort()).toEqual(expected.sort());
  });

  it('OverdueBucket values match Prisma OverdueBucket enum', () => {
    const expected = [
      'bucket_0',
      'bucket_1_30',
      'bucket_31_60',
      'bucket_61_90',
      'bucket_90_plus',
    ];
    expect(Object.values(OverdueBucket).sort()).toEqual(expected.sort());
  });

  it('GroupStatus values match Prisma GroupStatus enum', () => {
    const expected = ['active', 'inactive', 'dissolved'];
    expect(Object.values(GroupStatus).sort()).toEqual(expected.sort());
  });

  it('AccountCategory values match Prisma AccountCategory enum', () => {
    const expected = ['asset', 'liability', 'income', 'expense', 'equity'];
    expect(Object.values(AccountCategory).sort()).toEqual(expected.sort());
  });

  it('JournalSourceType values match Prisma JournalSourceType enum', () => {
    const expected = [
      'disbursement',
      'collection',
      'reversal',
      'penalty',
      'expense',
      'processing_fee',
      'foreclosure',
    ];
    expect(Object.values(JournalSourceType).sort()).toEqual(expected.sort());
  });

  it('OutboxStatus values match Prisma OutboxStatus enum', () => {
    const expected = ['pending', 'processing', 'sent', 'failed', 'dead_letter'];
    expect(Object.values(OutboxStatus).sort()).toEqual(expected.sort());
  });

  it('NotificationEvent values match Prisma NotificationEvent enum', () => {
    const expected = [
      'loan_approved',
      'loan_rejected',
      'disbursed',
      'collection_receipt',
      'emi_reminder',
      'overdue_reminder',
      'penalty_notice',
      'daily_collection_summary',
    ];
    expect(Object.values(NotificationEvent).sort()).toEqual(expected.sort());
  });
});

describe('AuditAction enum', () => {
  it('contains all Prisma AuditAction values', () => {
    // Prisma schema AuditAction values
    const prismaValues = [
      'customer_created',
      'customer_updated',
      'customer_blacklisted',
      'customer_reinstated',
      'loan_created',
      'loan_submitted',
      'loan_reviewed',
      'loan_approved',
      'loan_rejected',
      'loan_disbursed',
      'loan_closed',
      'loan_foreclosed',
      'loan_overdue',
      'loan_defaulted',
      'collection_posted',
      'collection_reversed',
      'penalty_posted',
      'penalty_waived',
      'expense_recorded',
      'login_success',
      'login_failed',
      'logout',
      'account_locked',
      'password_changed',
      'user_created',
      'user_role_changed',
      'unauthorized_access',
      'cash_handover',
      'document_uploaded',
      'document_deleted',
    ];

    const sharedValues = Object.values(AuditAction);

    // Every Prisma value must exist in the shared enum
    for (const val of prismaValues) {
      expect(sharedValues, `Shared AuditAction missing Prisma value "${val}"`).toContain(val);
    }
  });
});
