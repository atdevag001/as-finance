import { describe, it, expect } from 'vitest';
import {
  buildScheduleParams,
  buildInstallmentState,
  buildPenaltyState,
  buildCollectionInput,
  buildReceiptData,
  buildDailySummaryInput,
  buildAuditLogEntry,
  buildIdempotencyRecord,
  buildSmsTemplate,
  buildUser,
  buildCustomer,
  buildLoan,
  buildLoanProduct,
  buildJournalEntry,
  buildJournalLine,
} from '../index.js';
import {
  InterestType,
  Frequency,
  PaymentMode,
  ReceiptStatus,
  AuditAction,
  UserRole,
  NotificationEvent,
  LoanStatus,
  CustomerStatus,
  JournalSourceType,
  AccountCategory,
} from '@as-finance/shared';

describe('Factory functions — valid defaults', () => {
  it('buildScheduleParams returns valid defaults', () => {
    const params = buildScheduleParams();
    expect(params.principalPaise).toBe(100_000_00);
    expect(params.annualRateBps).toBe(1200);
    expect(params.tenureMonths).toBe(12);
    expect(params.interestType).toBe(InterestType.FLAT);
    expect(params.frequency).toBe(Frequency.MONTHLY);
    expect(params.startDate).toBeInstanceOf(Date);
    expect(params.holidays).toEqual([]);
  });

  it('buildScheduleParams accepts overrides', () => {
    const params = buildScheduleParams({ principalPaise: 500_000_00, tenureMonths: 24 });
    expect(params.principalPaise).toBe(500_000_00);
    expect(params.tenureMonths).toBe(24);
    expect(params.annualRateBps).toBe(1200); // default preserved
  });

  it('buildInstallmentState returns valid defaults', () => {
    const state = buildInstallmentState();
    expect(state.installmentId).toBeTruthy();
    expect(state.installmentNumber).toBe(1);
    expect(state.principalPaise).toBeGreaterThan(0);
    expect(state.interestPaise).toBeGreaterThan(0);
    expect(state.principalPaidPaise).toBe(0);
    expect(state.interestPaidPaise).toBe(0);
    expect(state.dueDate).toBeInstanceOf(Date);
  });

  it('buildPenaltyState returns valid defaults', () => {
    const state = buildPenaltyState();
    expect(state.penaltyId).toBeTruthy();
    expect(state.amountPaise).toBeGreaterThan(0);
    expect(state.paidPaise).toBe(0);
  });

  it('buildCollectionInput returns valid defaults', () => {
    const input = buildCollectionInput();
    expect(input.loanId).toBeTruthy();
    expect(input.amountPaise).toBeGreaterThan(0);
    expect(input.paymentMode).toBe(PaymentMode.CASH);
    expect(input.idempotencyKey).toBeTruthy();
    expect(input.collectedBy).toBeTruthy();
  });

  it('buildReceiptData returns valid defaults with balanced components', () => {
    const receipt = buildReceiptData();
    expect(receipt.receiptNumber).toBeTruthy();
    expect(receipt.amountPaise).toBe(
      receipt.penaltyComponentPaise + receipt.interestComponentPaise + receipt.principalComponentPaise,
    );
    expect(receipt.status).toBe(ReceiptStatus.ACTIVE);
    expect(receipt.isReversal).toBe(false);
  });

  it('buildDailySummaryInput returns valid defaults with bigint values', () => {
    const input = buildDailySummaryInput();
    expect(typeof input.openingBalancePaise).toBe('bigint');
    expect(input.transactions.length).toBeGreaterThan(0);
    expect(typeof input.transactions[0]!.amountPaise).toBe('bigint');
  });

  it('buildAuditLogEntry returns valid defaults', () => {
    const entry = buildAuditLogEntry();
    expect(entry.actionType).toBe(AuditAction.COLLECTION_POSTED);
    expect(entry.actorRole).toBe(UserRole.COLLECTION_OFFICER);
    expect(entry.targetEntity).toBe('collection');
    expect(entry.ipAddress).toBeTruthy();
    expect(entry.requestId).toBeTruthy();
  });

  it('buildIdempotencyRecord returns valid defaults with future expiry', () => {
    const record = buildIdempotencyRecord();
    expect(record.key).toBeTruthy();
    expect(record.operationType).toBe('collection');
    expect(record.resultStatus).toBe(201);
    expect(record.expiresAt.getTime()).toBeGreaterThan(record.createdAt.getTime());
  });

  it('buildSmsTemplate returns valid defaults', () => {
    const template = buildSmsTemplate();
    expect(template.eventType).toBe(NotificationEvent.COLLECTION_RECEIPT);
    expect(template.language).toBe('en');
    expect(template.templateBody).toContain('{{customerName}}');
    expect(template.isActive).toBe(true);
  });

  it('buildUser returns valid defaults', () => {
    const user = buildUser();
    expect(user.username).toBeTruthy();
    expect(user.role).toBe(UserRole.FIELD_OFFICER);
    expect(user.isActive).toBe(true);
    expect(user.failedLoginAttempts).toBe(0);
  });

  it('buildCustomer returns valid defaults', () => {
    const customer = buildCustomer();
    expect(customer.fullName).toBeTruthy();
    expect(customer.status).toBe(CustomerStatus.ACTIVE);
    expect(customer.aadhaarLastFour).toHaveLength(4);
    expect(customer.mobile).toBeTruthy();
  });

  it('buildLoan returns valid defaults', () => {
    const loan = buildLoan();
    expect(loan.loanNumber).toMatch(/^LN-\d{4}-\d{5}$/);
    expect(loan.status).toBe(LoanStatus.DRAFT);
    expect(loan.principalPaise).toBeGreaterThan(0);
    expect(loan.dpd).toBe(0);
  });

  it('buildLoanProduct returns product and version structure', () => {
    const result = buildLoanProduct({
      name: 'Test Product',
      isActive: true,
      interestType: InterestType.FLAT,
      annualRateBps: 1200,
      allocationOrder: ['penalty', 'interest', 'principal'],
    });
    expect(result).toHaveProperty('product');
    expect(result).toHaveProperty('version');
    expect(result.product.name).toBe('Test Product');
    expect(result.product.isActive).toBe(true);
    expect(result.version.interestType).toBe(InterestType.FLAT);
    expect(result.version.annualRateBps).toBe(1200);
    expect(result.version.allocationOrder).toEqual(['penalty', 'interest', 'principal']);
  });

  it('buildJournalEntry returns balanced entry with lines', () => {
    const entry = buildJournalEntry();
    expect(entry.totalDebitPaise).toBe(entry.totalCreditPaise);
    expect(entry.lines.length).toBe(2);
    expect(entry.sourceType).toBe(JournalSourceType.DISBURSEMENT);

    const totalDebit = entry.lines.reduce((sum, l) => sum + l.debitPaise, 0);
    const totalCredit = entry.lines.reduce((sum, l) => sum + l.creditPaise, 0);
    expect(totalDebit).toBe(totalCredit);
  });

  it('buildJournalLine returns valid defaults', () => {
    const line = buildJournalLine();
    expect(line.accountCode).toBeTruthy();
    expect(line.accountCategory).toBe(AccountCategory.ASSET);
    expect(line.debitPaise + line.creditPaise).toBeGreaterThan(0);
  });

  it('all build* factories accept Partial overrides', () => {
    const customAudit = buildAuditLogEntry({ actionType: AuditAction.LOAN_APPROVED, remarks: 'test' });
    expect(customAudit.actionType).toBe(AuditAction.LOAN_APPROVED);
    expect(customAudit.remarks).toBe('test');

    const customTemplate = buildSmsTemplate({ language: 'hi' });
    expect(customTemplate.language).toBe('hi');

    const customIdem = buildIdempotencyRecord({ operationType: 'disbursement' });
    expect(customIdem.operationType).toBe('disbursement');
  });
});
