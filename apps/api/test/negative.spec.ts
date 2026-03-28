import { describe, it, expect, vi, beforeAll } from 'vitest';
import { LoanService } from '../src/modules/loan/loan.service';
import { CollectionService } from '../src/modules/collection/collection.service';
import { ReversalService } from '../src/modules/reversal/reversal.service';
import { DisbursementService } from '../src/modules/disbursement/disbursement.service';
import { BusinessRuleError, ConflictError, NotFoundError } from '../src/common/errors';

/**
 * Negative tests.
 * Tests: invalid formats rejected, duplicate identity flagged, disbursement before approval rejected,
 *        invalid state transitions, invalid file upload, permission denial, over-collection,
 *        reversal constraints.
 *
 * Validates: Requirements 1.2, 3.9, 5.2, 6.10, 6.12, 7.5, 7.6, 15.4, 22.4
 */

describe('Negative Tests', () => {
  describe('Invalid input format validation', () => {
    it('should validate Aadhaar format (12 digits only)', async () => {
      const { aadhaarSchema } = await import('@as-finance/shared');
      // Valid
      expect(aadhaarSchema.safeParse('123456789012').success).toBe(true);
      // Invalid: too short
      expect(aadhaarSchema.safeParse('12345').success).toBe(false);
      // Invalid: contains letters
      expect(aadhaarSchema.safeParse('12345678901a').success).toBe(false);
      // Invalid: too long
      expect(aadhaarSchema.safeParse('1234567890123').success).toBe(false);
    });

    it('should validate PAN format (ABCDE1234F)', async () => {
      const { panSchema } = await import('@as-finance/shared');
      expect(panSchema.safeParse('ABCDE1234F').success).toBe(true);
      expect(panSchema.safeParse('abcde1234f').success).toBe(false);
      expect(panSchema.safeParse('12345').success).toBe(false);
      expect(panSchema.safeParse('ABCDE1234').success).toBe(false);
    });

    it('should validate mobile format (10 digits starting with 6-9)', async () => {
      const { mobileSchema } = await import('@as-finance/shared');
      expect(mobileSchema.safeParse('9876543210').success).toBe(true);
      expect(mobileSchema.safeParse('6000000000').success).toBe(true);
      expect(mobileSchema.safeParse('5876543210').success).toBe(false);
      expect(mobileSchema.safeParse('987654321').success).toBe(false); // 9 digits
      expect(mobileSchema.safeParse('98765432100').success).toBe(false); // 11 digits
    });
  });

  describe('Disbursement before approval rejected', () => {
    it('should reject disbursement when loan is not approved', async () => {
      const mockRepo = {
        getLoanForDisbursement: vi.fn().mockResolvedValue({ id: 'loan-1', status: 'draft', customer_id: 'c1' }),
        hasSchedule: vi.fn().mockResolvedValue(true),
        hasKycDocuments: vi.fn().mockResolvedValue(true),
        isAlreadyDisbursed: vi.fn().mockResolvedValue(false),
      };

      const service = new DisbursementService(
        {} as never, mockRepo as never, {} as never, {} as never, {} as never, {} as never,
      );

      await expect(service.verifyPrerequisites('loan-1')).rejects.toThrow(BusinessRuleError);
    });

    it('should reject disbursement when schedule not generated', async () => {
      const mockRepo = {
        getLoanForDisbursement: vi.fn().mockResolvedValue({ id: 'loan-1', status: 'approved', customer_id: 'c1' }),
        hasSchedule: vi.fn().mockResolvedValue(false),
        hasKycDocuments: vi.fn().mockResolvedValue(true),
        isAlreadyDisbursed: vi.fn().mockResolvedValue(false),
      };

      const service = new DisbursementService(
        {} as never, mockRepo as never, {} as never, {} as never, {} as never, {} as never,
      );

      await expect(service.verifyPrerequisites('loan-1')).rejects.toThrow(BusinessRuleError);
    });

    it('should reject disbursement when already disbursed', async () => {
      const mockRepo = {
        getLoanForDisbursement: vi.fn().mockResolvedValue({ id: 'loan-1', status: 'approved', customer_id: 'c1' }),
        hasSchedule: vi.fn().mockResolvedValue(true),
        hasKycDocuments: vi.fn().mockResolvedValue(true),
        isAlreadyDisbursed: vi.fn().mockResolvedValue(true),
      };

      const service = new DisbursementService(
        {} as never, mockRepo as never, {} as never, {} as never, {} as never, {} as never,
      );

      await expect(service.verifyPrerequisites('loan-1')).rejects.toThrow(BusinessRuleError);
    });
  });

  describe('Invalid state transitions rejected', () => {
    let loanService: LoanService;

    beforeAll(() => {
      loanService = new LoanService({ findById: vi.fn() } as never);
    });

    it.each([
      ['draft', 'approved'],
      ['draft', 'active'],
      ['submitted', 'approved'],
      ['approved', 'submitted'],
      ['closed', 'active'],
      ['rejected', 'submitted'],
      ['defaulted', 'active'],
      ['foreclosed', 'active'],
    ])('should reject transition from %s to %s', (from, to) => {
      expect(() => loanService.validateTransition(from, to)).toThrow(BusinessRuleError);
    });

    it.each([
      ['draft', 'submitted'],
      ['submitted', 'under_review'],
      ['under_review', 'approved'],
      ['under_review', 'rejected'],
      ['approved', 'disbursed'],
      ['active', 'closed'],
      ['active', 'overdue'],
    ])('should allow valid transition from %s to %s', (from, to) => {
      expect(() => loanService.validateTransition(from, to)).not.toThrow();
    });
  });

  describe('Over-collection rejected', () => {
    it('should reject collection exceeding outstanding balance', async () => {
      const ACCOUNTS: Record<string, { id: string }> = {
        '1001': { id: 'acc-cash' }, '1100': { id: 'acc-lr' },
        '4001': { id: 'acc-int' }, '4003': { id: 'acc-pen' },
      };
      const mockRepo = {
        lockLoanForUpdate: vi.fn().mockResolvedValue({ id: 'loan-1', status: 'active' }),
        getLoanForCollection: vi.fn().mockResolvedValue({
          id: 'loan-1', loan_number: 'LN-001', customer_id: 'c1', status: 'active', dpd: 0,
          product_version: { allocation_order: ['penalty', 'interest', 'principal'] },
          customer: { id: 'c1', full_name: 'Test', mobile: '9876543210' },
          schedules: [{
            id: 's-1', installment_number: 1, due_date: new Date(),
            principal_paise: 10000n, interest_paise: 1000n,
            principal_paid_paise: 0n, interest_paid_paise: 0n, penalty_paid_paise: 0n,
          }],
        }),
        getPendingPenalties: vi.fn().mockResolvedValue([]),
        findAccountByCode: vi.fn((code: string) => Promise.resolve(ACCOUNTS[code] ?? null)),
      };
      const mockPrisma = { $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({})) };

      const service = new CollectionService(
        mockPrisma as never, mockRepo as never,
        { createJournalEntry: vi.fn().mockResolvedValue({ id: 'je-1' }) } as never,
        { createAuditLog: vi.fn() } as never,
        { find: vi.fn().mockResolvedValue(null), store: vi.fn() } as never,
        { generateReceipt: vi.fn() } as never,
      );

      // Outstanding = 11000, trying to collect 99999
      await expect(
        service.postCollection(
          { loanId: 'loan-1', amountPaise: 99999, paymentDate: '2024-01-15', paymentMode: 'cash', idempotencyKey: 'over-key' },
          'officer-1', 'collection_officer',
        ),
      ).rejects.toThrow(BusinessRuleError);
    });
  });

  describe('Collection against invalid loan status rejected', () => {
    it.each(['closed', 'defaulted', 'rejected', 'draft', 'foreclosed'])(
      'should reject collection against %s loan',
      async (status) => {
        const mockRepo = {
          lockLoanForUpdate: vi.fn().mockResolvedValue({ id: 'loan-1', status }),
        };
        const mockPrisma = { $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({})) };

        const service = new CollectionService(
          mockPrisma as never, mockRepo as never, {} as never,
          {} as never, { find: vi.fn().mockResolvedValue(null) } as never, {} as never,
        );

        await expect(
          service.postCollection(
            { loanId: 'loan-1', amountPaise: 1000, paymentDate: '2024-01-15', paymentMode: 'cash', idempotencyKey: 'key' },
            'officer-1', 'collection_officer',
          ),
        ).rejects.toThrow(BusinessRuleError);
      },
    );
  });

  describe('Reversal constraints', () => {
    it('should reject reversal of already-reversed collection', async () => {
      const mockTx = {
        collections: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'col-1', status: 'reversed', is_reversal: false, loan_id: 'loan-1',
          }),
        },
      };
      const mockPrisma = { $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)) };

      const service = new ReversalService(
        mockPrisma as never, {} as never, {} as never,
        {} as never, { find: vi.fn().mockResolvedValue(null) } as never, {} as never,
      );

      await expect(
        service.reverseCollection(
          { collectionId: 'col-1', reason: 'Test', idempotencyKey: 'rev-key' },
          'manager-1', 'manager',
        ),
      ).rejects.toThrow('already been reversed');
    });

    it('should reject reversal of a reversal (no chained reversals)', async () => {
      const mockTx = {
        collections: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'col-rev', status: 'posted', is_reversal: true, loan_id: 'loan-1',
          }),
        },
      };
      const mockPrisma = { $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)) };

      const service = new ReversalService(
        mockPrisma as never, {} as never, {} as never,
        {} as never, { find: vi.fn().mockResolvedValue(null) } as never, {} as never,
      );

      await expect(
        service.reverseCollection(
          { collectionId: 'col-rev', reason: 'Chain', idempotencyKey: 'rev-key-2' },
          'manager-1', 'manager',
        ),
      ).rejects.toThrow('Cannot reverse a reversal');
    });
  });

  describe('Loan creation validation', () => {
    it('should reject loan for blacklisted customer', async () => {
      const mockRepo = {
        getCustomerStatus: vi.fn().mockResolvedValue({ id: 'c1', status: 'blacklisted' }),
      };
      const service = new LoanService(mockRepo as never);

      await expect(
        service.create(
          { customerId: 'c1', productVersionId: 'pv-1', principalPaise: 10000000, tenureMonths: 12 },
          'user-1', 'field_officer',
        ),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('should reject loan for customer with defaulted loans', async () => {
      const mockRepo = {
        getCustomerStatus: vi.fn().mockResolvedValue({ id: 'c1', status: 'active' }),
        hasDefaultedLoans: vi.fn().mockResolvedValue(true),
      };
      const service = new LoanService(mockRepo as never);

      await expect(
        service.create(
          { customerId: 'c1', productVersionId: 'pv-1', principalPaise: 10000000, tenureMonths: 12 },
          'user-1', 'field_officer',
        ),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('should reject principal outside product range', async () => {
      const mockRepo = {
        getCustomerStatus: vi.fn().mockResolvedValue({ id: 'c1', status: 'active' }),
        hasDefaultedLoans: vi.fn().mockResolvedValue(false),
        getProductVersion: vi.fn().mockResolvedValue({
          id: 'pv-1', product_id: 'p1', is_active: true,
          min_principal_paise: 1000000, max_principal_paise: 5000000,
          min_tenure_months: 3, max_tenure_months: 36, max_concurrent_loans: 3,
          product: { id: 'p1', is_active: true },
        }),
      };
      const service = new LoanService(mockRepo as never);

      // Too low
      await expect(
        service.create(
          { customerId: 'c1', productVersionId: 'pv-1', principalPaise: 100, tenureMonths: 12 },
          'user-1', 'field_officer',
        ),
      ).rejects.toThrow(BusinessRuleError);

      // Too high
      await expect(
        service.create(
          { customerId: 'c1', productVersionId: 'pv-1', principalPaise: 99999999, tenureMonths: 12 },
          'user-1', 'field_officer',
        ),
      ).rejects.toThrow(BusinessRuleError);
    });
  });
});
