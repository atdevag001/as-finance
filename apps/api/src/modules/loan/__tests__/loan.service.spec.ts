import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LoanService } from '../loan.service';
import { BusinessRuleError, NotFoundError } from '../../../common/errors';

/**
 * Unit tests for LoanService — creation, approval, rejection, closure,
 * and immutability.
 *
 * Validates: Requirements 15.3, 15.4, 15.5, 15.6, 15.7, 61.3, 61.4, 61.5
 */

// ── Mock helpers ─────────────────────────────────────────────────────────────

function createProductVersion(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pv-1',
    product_id: 'prod-1',
    version_number: 1,
    interest_type: 'flat',
    annual_rate_bps: 1200,
    min_principal_paise: 10000n,
    max_principal_paise: 50000000n,
    min_tenure_months: 1,
    max_tenure_months: 60,
    repayment_frequency: 'monthly',
    processing_fee_type: null,
    processing_fee_value: null,
    max_concurrent_loans: 3,
    is_active: true,
    product: { id: 'prod-1', name: 'Test Product', is_active: true },
    ...overrides,
  };
}

function createLoan(overrides: Record<string, unknown> = {}) {
  return {
    id: 'loan-1',
    loan_number: 'LN-2024-00001',
    customer_id: 'cust-1',
    product_version_id: 'pv-1',
    principal_paise: 100000n,
    tenure_months: 12,
    purpose: 'Business expansion',
    status: 'draft',
    created_by: 'user-creator',
    approved_by: null,
    version: 1,
    product_version: createProductVersion(),
    ...overrides,
  };
}

function createMockRepo(overrides: Record<string, unknown> = {}) {
  return {
    findById: vi.fn().mockResolvedValue(createLoan()),
    create: vi.fn().mockResolvedValue(createLoan()),
    findAll: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    updateStatus: vi.fn().mockImplementation(async (_id: string, status: string, extra?: Record<string, unknown>) => ({
      ...createLoan(),
      status,
      ...extra,
    })),
    createStatusHistory: vi.fn().mockResolvedValue({}),
    createApproval: vi.fn().mockResolvedValue({}),
    createAuditLog: vi.fn().mockResolvedValue({}),
    generateLoanNumber: vi.fn().mockResolvedValue('LN-2024-00001'),
    getCustomerStatus: vi.fn().mockResolvedValue({ id: 'cust-1', status: 'active', full_name: 'Test Customer' }),
    hasDefaultedLoans: vi.fn().mockResolvedValue(false),
    getProductVersion: vi.fn().mockResolvedValue(createProductVersion()),
    countActiveLoansByCustomerAndProduct: vi.fn().mockResolvedValue(0),
    createScheduleInstallments: vi.fn().mockResolvedValue(undefined),
    updateLoanTotals: vi.fn().mockResolvedValue(undefined),
    getUnpaidInstallments: vi.fn().mockResolvedValue([]),
    getUnsettledPenalties: vi.fn().mockResolvedValue([]),
    getPendingReversals: vi.fn().mockResolvedValue([]),
    getOutstandingBalance: vi.fn().mockResolvedValue(0n),
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('LoanService', () => {
  let service: LoanService;
  let repo: ReturnType<typeof createMockRepo>;
  // PrismaService mock: regenerateSchedule uses $transaction with tx.collections,
  // tx.loan_schedules, tx.loans. Tests that don't exercise that path get
  // by with the no-op mock.
  const prismaMock = {
    $transaction: vi.fn(async (cb: (tx: any) => Promise<any>) => {
      const tx = {
        collections: { count: vi.fn().mockResolvedValue(0) },
        loan_schedules: { deleteMany: vi.fn(), createMany: vi.fn() },
        loans: { update: vi.fn() },
      };
      return cb(tx);
    }),
  } as any;

  beforeEach(() => {
    repo = createMockRepo();
    service = new LoanService(repo as any, prismaMock);
  });

  // ── Requirement 15.3: Immutability after approval ──────────────────────

  describe('isImmutable (Req 15.3)', () => {
    it('returns true for approved status', () => {
      expect(service.isImmutable('approved')).toBe(true);
    });

    it('returns true for all post-approval statuses', () => {
      const immutableStatuses = ['approved', 'disbursed', 'active', 'overdue', 'defaulted', 'foreclosed', 'closed'];
      for (const status of immutableStatuses) {
        expect(service.isImmutable(status)).toBe(true);
      }
    });

    it('returns false for pre-approval statuses', () => {
      const mutableStatuses = ['draft', 'submitted', 'under_review', 'rejected'];
      for (const status of mutableStatuses) {
        expect(service.isImmutable(status)).toBe(false);
      }
    });
  });

  // ── Requirement 15.4: Loan creation ────────────────────────────────────

  describe('create (Req 15.4)', () => {
    const validDto = {
      customerId: 'cust-1',
      productVersionId: 'pv-1',
      principalPaise: 100000,
      tenureMonths: 12,
      purpose: 'Business expansion',
    };

    it('creates a loan in draft status with valid DTO', async () => {
      const result = await service.create(validDto, 'user-1', 'field_officer');

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          loan_number: 'LN-2024-00001',
          customer_id: 'cust-1',
          product_version_id: 'pv-1',
          principal_paise: 100000,
          tenure_months: 12,
          purpose: 'Business expansion',
          created_by: 'user-1',
        }),
      );
      expect(result).toBeDefined();
    });

    it('records initial status history (null → draft)', async () => {
      await service.create(validDto, 'user-1', 'field_officer');

      expect(repo.createStatusHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          from_status: null,
          to_status: 'draft',
          changed_by: 'user-1',
        }),
      );
    });

    it('creates audit log for loan creation', async () => {
      await service.create(validDto, 'user-1', 'field_officer');

      expect(repo.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action_type: 'loan_created',
          actor_id: 'user-1',
          actor_role: 'field_officer',
          target_entity: 'loan',
        }),
      );
    });

    it('rejects creation for non-existent customer', async () => {
      repo.getCustomerStatus.mockResolvedValue(null);

      await expect(
        service.create(validDto, 'user-1', 'field_officer'),
      ).rejects.toThrow(NotFoundError);
    });

    it('rejects creation for blacklisted customer', async () => {
      repo.getCustomerStatus.mockResolvedValue({ id: 'cust-1', status: 'blacklisted', full_name: 'Test' });

      await expect(
        service.create(validDto, 'user-1', 'field_officer'),
      ).rejects.toThrow(BusinessRuleError);

      try {
        await service.create(validDto, 'user-1', 'field_officer');
      } catch (err) {
        expect((err as BusinessRuleError).code).toBe('CUSTOMER_BLACKLISTED');
      }
    });

    it('rejects creation for customer with defaulted loans', async () => {
      repo.hasDefaultedLoans.mockResolvedValue(true);

      await expect(
        service.create(validDto, 'user-1', 'field_officer'),
      ).rejects.toThrow(BusinessRuleError);

      try {
        await service.create(validDto, 'user-1', 'field_officer');
      } catch (err) {
        expect((err as BusinessRuleError).code).toBe('CUSTOMER_HAS_DEFAULTED_LOANS');
      }
    });

    it('rejects creation for non-existent product version', async () => {
      repo.getProductVersion.mockResolvedValue(null);

      await expect(
        service.create(validDto, 'user-1', 'field_officer'),
      ).rejects.toThrow(NotFoundError);
    });

    it('rejects creation with inactive product', async () => {
      repo.getProductVersion.mockResolvedValue(createProductVersion({ is_active: false }));

      await expect(
        service.create(validDto, 'user-1', 'field_officer'),
      ).rejects.toThrow(BusinessRuleError);

      try {
        await service.create(validDto, 'user-1', 'field_officer');
      } catch (err) {
        expect((err as BusinessRuleError).code).toBe('PRODUCT_INACTIVE');
      }
    });

    it('rejects creation with inactive parent product', async () => {
      repo.getProductVersion.mockResolvedValue(
        createProductVersion({ product: { id: 'prod-1', name: 'Test', is_active: false } }),
      );

      await expect(
        service.create(validDto, 'user-1', 'field_officer'),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('rejects creation when principal is below product minimum', async () => {
      const dto = { ...validDto, principalPaise: 1 };

      await expect(
        service.create(dto, 'user-1', 'field_officer'),
      ).rejects.toThrow(BusinessRuleError);

      try {
        await service.create(dto, 'user-1', 'field_officer');
      } catch (err) {
        expect((err as BusinessRuleError).code).toBe('PRINCIPAL_OUT_OF_RANGE');
      }
    });

    it('rejects creation when principal exceeds product maximum', async () => {
      const dto = { ...validDto, principalPaise: 999999999 };

      await expect(
        service.create(dto, 'user-1', 'field_officer'),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('rejects creation when tenure is below product minimum', async () => {
      repo.getProductVersion.mockResolvedValue(createProductVersion({ min_tenure_months: 6 }));
      const dto = { ...validDto, tenureMonths: 3 };

      await expect(
        service.create(dto, 'user-1', 'field_officer'),
      ).rejects.toThrow(BusinessRuleError);

      try {
        await service.create(dto, 'user-1', 'field_officer');
      } catch (err) {
        expect((err as BusinessRuleError).code).toBe('TENURE_OUT_OF_RANGE');
      }
    });

    it('rejects creation when tenure exceeds product maximum', async () => {
      const dto = { ...validDto, tenureMonths: 120 };

      await expect(
        service.create(dto, 'user-1', 'field_officer'),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('rejects creation when concurrent loan limit is reached', async () => {
      repo.countActiveLoansByCustomerAndProduct.mockResolvedValue(3);

      await expect(
        service.create(validDto, 'user-1', 'field_officer'),
      ).rejects.toThrow(BusinessRuleError);

      try {
        await service.create(validDto, 'user-1', 'field_officer');
      } catch (err) {
        expect((err as BusinessRuleError).code).toBe('CONCURRENT_LOAN_LIMIT_EXCEEDED');
      }
    });

    it('passes groupId when provided', async () => {
      const dto = { ...validDto, groupId: 'group-1' };
      await service.create(dto, 'user-1', 'field_officer');

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ group_id: 'group-1' }),
      );
    });
  });

  // ── Requirement 15.5: Loan approval with role requirements ─────────────

  describe('approve (Req 15.5)', () => {
    beforeEach(() => {
      repo.findById.mockResolvedValue(
        createLoan({ status: 'under_review', created_by: 'user-creator' }),
      );
    });

    it('approves a loan under review', async () => {
      const result = await service.approve('loan-1', { remarks: 'Looks good' }, 'user-approver', 'manager');

      expect(result).toBeDefined();
      // approve() now wraps all writes in prisma.$transaction so every
      // repo write receives the tx client as an extra trailing arg.
      expect(repo.updateStatus).toHaveBeenCalledWith(
        'loan-1',
        'approved',
        expect.objectContaining({ approved_by: 'user-approver' }),
        expect.any(Number), // optimistic-lock version
        expect.anything(), // tx
      );
    });

    it('records approved_by field with approver user ID (Req 61.3)', async () => {
      await service.approve('loan-1', {}, 'user-approver', 'manager');

      expect(repo.updateStatus).toHaveBeenCalledWith(
        'loan-1',
        'approved',
        expect.objectContaining({ approved_by: 'user-approver' }),
        expect.any(Number),
        expect.anything(), // tx
      );
    });

    it('creates approval record with remarks', async () => {
      await service.approve('loan-1', { remarks: 'All checks passed' }, 'user-approver', 'manager');

      expect(repo.createApproval).toHaveBeenCalledWith(
        expect.objectContaining({
          loan_id: 'loan-1',
          action: 'approved',
          actor_id: 'user-approver',
          remarks: 'All checks passed',
        }),
        expect.anything(), // tx
      );
    });

    it('creates audit log for approval', async () => {
      await service.approve('loan-1', {}, 'user-approver', 'manager');

      expect(repo.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action_type: 'loan_approved',
          actor_id: 'user-approver',
          actor_role: 'manager',
          target_entity: 'loan',
          target_id: 'loan-1',
          before_state: { status: 'under_review' },
          after_state: expect.objectContaining({ status: 'approved', approved_by: 'user-approver' }),
        }),
        expect.anything(), // tx
      );
    });

    it('generates and persists EMI schedule on approval', async () => {
      await service.approve('loan-1', {}, 'user-approver', 'manager');

      expect(repo.createScheduleInstallments).toHaveBeenCalledWith(
        'loan-1',
        expect.any(Array),
        expect.anything(), // tx
      );
      expect(repo.updateLoanTotals).toHaveBeenCalledWith(
        'loan-1',
        expect.any(Number),
        expect.any(Number),
        expect.anything(), // tx
      );
    });

    it('rejects approval when loan is not found', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(
        service.approve('nonexistent', {}, 'user-approver', 'manager'),
      ).rejects.toThrow(NotFoundError);
    });

    it('rejects approval from invalid status (draft)', async () => {
      repo.findById.mockResolvedValue(createLoan({ status: 'draft', created_by: 'other' }));

      await expect(
        service.approve('loan-1', {}, 'user-approver', 'manager'),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('rejects approval when approver is the same as creator (manager role)', async () => {
      repo.findById.mockResolvedValue(
        createLoan({ status: 'under_review', created_by: 'user-creator' }),
      );

      await expect(
        service.approve('loan-1', {}, 'user-creator', 'manager'),
      ).rejects.toThrow(BusinessRuleError);

      try {
        await service.approve('loan-1', {}, 'user-creator', 'manager');
      } catch (err) {
        expect((err as BusinessRuleError).code).toBe('MAKER_CHECKER_VIOLATION');
      }
    });

    it('allows super_admin to approve their own loan (bypass maker-checker)', async () => {
      repo.findById.mockResolvedValue(
        createLoan({ status: 'under_review', created_by: 'admin-user' }),
      );

      const result = await service.approve('loan-1', { remarks: 'Self-approved' }, 'admin-user', 'super_admin');

      expect(result).toBeDefined();
      expect(repo.updateStatus).toHaveBeenCalledWith(
        'loan-1',
        'approved',
        expect.objectContaining({ approved_by: 'admin-user' }),
        expect.any(Number),
        expect.anything(), // tx
      );
    });

    it('allows different user to approve regardless of role', async () => {
      repo.findById.mockResolvedValue(
        createLoan({ status: 'under_review', created_by: 'user-creator' }),
      );

      const result = await service.approve('loan-1', {}, 'different-user', 'manager');

      expect(result).toBeDefined();
      expect(repo.updateStatus).toHaveBeenCalledWith(
        'loan-1',
        'approved',
        expect.objectContaining({ approved_by: 'different-user' }),
        expect.any(Number),
        expect.anything(), // tx
      );
    });

  });

  // ── Requirement 15.6: Loan rejection with mandatory remarks ────────────

  describe('reject (Req 15.6)', () => {
    beforeEach(() => {
      repo.findById.mockResolvedValue(createLoan({ status: 'under_review' }));
    });

    it('rejects a loan under review with a reason', async () => {
      const result = await service.reject(
        'loan-1',
        { reason: 'Insufficient documentation' },
        'user-reviewer',
        'manager',
      );

      expect(result).toBeDefined();
      expect(repo.updateStatus).toHaveBeenCalledWith('loan-1', 'rejected', undefined, expect.any(Number));
    });

    it('records rejection reason in status history', async () => {
      await service.reject(
        'loan-1',
        { reason: 'Bad credit history' },
        'user-reviewer',
        'manager',
      );

      expect(repo.createStatusHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          from_status: 'under_review',
          to_status: 'rejected',
          reason: 'Bad credit history',
        }),
      );
    });

    it('records rejection reason in approval record', async () => {
      await service.reject(
        'loan-1',
        { reason: 'Incomplete KYC' },
        'user-reviewer',
        'manager',
      );

      expect(repo.createApproval).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'rejected',
          remarks: 'Incomplete KYC',
        }),
      );
    });

    it('creates audit log for rejection with remarks', async () => {
      await service.reject(
        'loan-1',
        { reason: 'Risk too high' },
        'user-reviewer',
        'manager',
      );

      expect(repo.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action_type: 'loan_rejected',
          remarks: 'Risk too high',
          before_state: { status: 'under_review' },
          after_state: { status: 'rejected' },
        }),
      );
    });

    it('rejects rejection when loan is not found', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(
        service.reject('nonexistent', { reason: 'test' }, 'user-1', 'manager'),
      ).rejects.toThrow(NotFoundError);
    });

    it('rejects rejection from invalid status (draft)', async () => {
      repo.findById.mockResolvedValue(createLoan({ status: 'draft' }));

      await expect(
        service.reject('loan-1', { reason: 'test' }, 'user-1', 'manager'),
      ).rejects.toThrow(BusinessRuleError);
    });
  });

  // ── Requirement 15.7: Loan closure prerequisites ───────────────────────

  describe('closeLoan (Req 15.7)', () => {
    beforeEach(() => {
      repo.findById.mockResolvedValue(createLoan({ status: 'active' }));
    });

    it('closes an active loan when all prerequisites are met', async () => {
      const result = await service.closeLoan('loan-1', 'actor-1', 'manager');
      expect(result).toBeDefined();
      expect(repo.updateStatus).toHaveBeenCalledWith('loan-1', 'closed', undefined, expect.any(Number));
    });

    it('rejects closure when installments are unpaid', async () => {
      repo.getUnpaidInstallments.mockResolvedValue([
        { id: 'i-1', installment_number: 1, status: 'pending', principal_paise: 10000n, interest_paise: 1000n, principal_paid_paise: 0n, interest_paid_paise: 0n },
      ]);

      await expect(
        service.closeLoan('loan-1', 'actor-1', 'manager'),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('rejects closure when penalties are unsettled', async () => {
      repo.getUnsettledPenalties.mockResolvedValue([
        { id: 'p-1', amount_paise: 500n, penalty_period: '2024-01', installment_id: 'i-1' },
      ]);

      await expect(
        service.closeLoan('loan-1', 'actor-1', 'manager'),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('rejects closure when there are pending reversals', async () => {
      repo.getPendingReversals.mockResolvedValue([
        { id: 'r-1', original_collection_id: 'c-1' },
      ]);

      await expect(
        service.closeLoan('loan-1', 'actor-1', 'manager'),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('rejects closure when outstanding balance exceeds tolerance', async () => {
      repo.getOutstandingBalance.mockResolvedValue(5000n);

      await expect(
        service.closeLoan('loan-1', 'actor-1', 'manager'),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('reports all unmet prerequisites in a single error', async () => {
      repo.getUnpaidInstallments.mockResolvedValue([
        { id: 'i-1', installment_number: 1, status: 'pending', principal_paise: 10000n, interest_paise: 1000n, principal_paid_paise: 0n, interest_paid_paise: 0n },
      ]);
      repo.getUnsettledPenalties.mockResolvedValue([
        { id: 'p-1', amount_paise: 500n, penalty_period: '2024-01', installment_id: 'i-1' },
      ]);

      try {
        await service.closeLoan('loan-1', 'actor-1', 'manager');
        expect.unreachable('Expected BusinessRuleError');
      } catch (err) {
        expect(err).toBeInstanceOf(BusinessRuleError);
        const msg = (err as BusinessRuleError).message;
        expect(msg).toContain('Unpaid installments');
        expect(msg).toContain('Unsettled penalties');
      }
    });
  });

  // ── Submit flow ────────────────────────────────────────────────────────

  describe('submit', () => {
    beforeEach(() => {
      repo.findById.mockResolvedValue(createLoan({ status: 'draft' }));
    });

    it('submits a draft loan', async () => {
      const result = await service.submit('loan-1', 'user-1', 'field_officer');

      expect(result).toBeDefined();
      expect(repo.updateStatus).toHaveBeenCalledWith('loan-1', 'submitted', undefined, expect.any(Number));
    });

    it('re-validates customer status at submission time', async () => {
      repo.getCustomerStatus.mockResolvedValue({ id: 'cust-1', status: 'blacklisted', full_name: 'Test' });

      await expect(
        service.submit('loan-1', 'user-1', 'field_officer'),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('re-validates defaulted loans at submission time', async () => {
      repo.hasDefaultedLoans.mockResolvedValue(true);

      await expect(
        service.submit('loan-1', 'user-1', 'field_officer'),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('rejects submission from invalid status', async () => {
      repo.findById.mockResolvedValue(createLoan({ status: 'approved' }));

      await expect(
        service.submit('loan-1', 'user-1', 'field_officer'),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('rejects submission when loan not found', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(
        service.submit('nonexistent', 'user-1', 'field_officer'),
      ).rejects.toThrow(NotFoundError);
    });

    it('creates approval record for submission', async () => {
      await service.submit('loan-1', 'user-1', 'field_officer');

      expect(repo.createApproval).toHaveBeenCalledWith(
        expect.objectContaining({
          loan_id: 'loan-1',
          action: 'submitted',
          actor_id: 'user-1',
        }),
      );
    });
  });

  // ── Review flow ────────────────────────────────────────────────────────

  describe('review', () => {
    beforeEach(() => {
      repo.findById.mockResolvedValue(createLoan({ status: 'submitted' }));
    });

    it('moves a submitted loan to under_review', async () => {
      const result = await service.review('loan-1', 'user-reviewer', 'manager');

      expect(result).toBeDefined();
      expect(repo.updateStatus).toHaveBeenCalledWith('loan-1', 'under_review', undefined, expect.any(Number));
    });

    it('rejects review from invalid status', async () => {
      repo.findById.mockResolvedValue(createLoan({ status: 'draft' }));

      await expect(
        service.review('loan-1', 'user-1', 'manager'),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('rejects review when loan not found', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(
        service.review('nonexistent', 'user-1', 'manager'),
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ── transitionStatus ──────────────────────────────────────────────────

  describe('transitionStatus', () => {
    it('transitions loan to a valid target status', async () => {
      repo.findById.mockResolvedValue(createLoan({ status: 'active', version: 2 }));

      const result = await service.transitionStatus('loan-1', 'overdue', 'sys', 'system');

      expect(result).toBeDefined();
      expect(repo.updateStatus).toHaveBeenCalledWith('loan-1', 'overdue', undefined, 2);
    });

    it('rejects invalid transition', async () => {
      repo.findById.mockResolvedValue(createLoan({ status: 'draft', version: 1 }));

      await expect(
        service.transitionStatus('loan-1', 'active', 'sys', 'system'),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('rejects when loan not found', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(
        service.transitionStatus('nonexistent', 'active', 'sys', 'system'),
      ).rejects.toThrow(NotFoundError);
    });

    it('passes reason and extra options', async () => {
      repo.findById.mockResolvedValue(createLoan({ status: 'active', version: 1 }));

      await service.transitionStatus('loan-1', 'overdue', 'sys', 'system', {
        reason: 'Missed payment',
        extra: { dpd: 15 },
      });

      expect(repo.updateStatus).toHaveBeenCalledWith('loan-1', 'overdue', { dpd: 15 }, 1);
      expect(repo.createStatusHistory).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'Missed payment' }),
      );
    });
  });

  // ── findById / findAll ─────────────────────────────────────────────────

  describe('findById', () => {
    it('returns loan when found', async () => {
      const result = await service.findById('loan-1');
      expect(result).toBeDefined();
    });

    it('throws NotFoundError when loan does not exist', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.findById('nonexistent')).rejects.toThrow(NotFoundError);
    });
  });

  describe('findAll', () => {
    it('delegates to repository with query params', async () => {
      await service.findAll({ skip: 0, take: 10, status: 'active' });

      expect(repo.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10, status: 'active' }),
      );
    });
  });

});
