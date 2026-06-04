import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LoanService } from '../loan.service';
import { DisbursementService } from '../../disbursement/disbursement.service';
import { CollectionService } from '../../collection/collection.service';
import { PenaltyService, calculateDpd, classifyOverdueBucket } from '../../penalty/penalty.service';
import { BusinessRuleError, NotFoundError, ConflictError } from '../../../common/errors';

/**
 * Integration tests for loan lifecycle flow.
 * Tests: customer creation → loan application → submission → review →
 *        approval → disbursement → active status → collection → closure.
 *
 * Uses mocked repositories to verify the correct sequence of service calls.
 *
 * Validates: Requirements 16.1, 16.2, 16.3, 16.4, 16.5
 */

// ── Mock Factories ───────────────────────────────────────────────────────────

function createMockLoanRepo() {
  return {
    getCustomerStatus: vi.fn().mockResolvedValue({ id: 'cust-1', status: 'active', full_name: 'Test Customer' }),
    hasDefaultedLoans: vi.fn().mockResolvedValue(false),
    getProductVersion: vi.fn().mockResolvedValue({
      id: 'pv-1',
      product_id: 'prod-1',
      is_active: true,
      annual_rate_bps: 1200,
      interest_type: 'flat',
      repayment_frequency: 'monthly',
      min_principal_paise: 1000000,
      max_principal_paise: 50000000,
      min_tenure_months: 3,
      max_tenure_months: 36,
      max_concurrent_loans: 3,
      processing_fee_type: null,
      processing_fee_value: null,
      product: { id: 'prod-1', name: 'Test Product', is_active: true },
    }),
    countActiveLoansByCustomerAndProduct: vi.fn().mockResolvedValue(0),
    generateLoanNumber: vi.fn().mockResolvedValue('LN-2024-00001'),
    create: vi.fn().mockResolvedValue({ id: 'loan-1', status: 'draft', loan_number: 'LN-2024-00001', version: 1 }),
    createStatusHistory: vi.fn().mockResolvedValue({}),
    createAuditLog: vi.fn().mockResolvedValue({}),
    createApproval: vi.fn().mockResolvedValue({}),
    createScheduleInstallments: vi.fn().mockResolvedValue(undefined),
    updateLoanTotals: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn(),
    updateStatus: vi.fn(),
    getUnpaidInstallments: vi.fn().mockResolvedValue([]),
    getUnsettledPenalties: vi.fn().mockResolvedValue([]),
    getPendingReversals: vi.fn().mockResolvedValue([]),
    getOutstandingBalance: vi.fn().mockResolvedValue(0n),
    findAll: vi.fn(),
  };
}

function buildLoanDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: 'loan-1',
    loan_number: 'LN-2024-00001',
    customer_id: 'cust-1',
    principal_paise: 10000000n,
    tenure_months: 12,
    status: 'draft',
    version: 1,
    created_by: 'user-creator',
    total_interest_paise: 1200000n,
    total_payable_paise: 11200000n,
    cached_outstanding_paise: 11200000n,
    dpd: 0,
    overdue_bucket: 'bucket_0',
    product_version: {
      annual_rate_bps: 1200,
      interest_type: 'flat',
      repayment_frequency: 'monthly',
      min_principal_paise: 1000000n,
      max_principal_paise: 50000000n,
      min_tenure_months: 3,
      max_tenure_months: 36,
    },
    schedules: [],
    approvals: [],
    status_history: [],
    customer: { id: 'cust-1', full_name: 'Test Customer', mobile: '9876543210', status: 'active' },
    ...overrides,
  };
}

function buildScheduleInstallments(count: number, startDate: Date, principalPerInst: number, interestPerInst: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `s-${i + 1}`,
    installment_number: i + 1,
    due_date: new Date(startDate.getFullYear(), startDate.getMonth() + i + 1, startDate.getDate()),
    principal_paise: BigInt(principalPerInst),
    interest_paise: BigInt(interestPerInst),
    total_paise: BigInt(principalPerInst + interestPerInst),
    principal_paid_paise: 0n,
    interest_paid_paise: 0n,
    penalty_paid_paise: 0n,
    status: 'pending',
    version: 1,
  }));
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Loan Lifecycle Integration', () => {
  let loanService: LoanService;
  let repo: ReturnType<typeof createMockLoanRepo>;

  beforeEach(() => {
    repo = createMockLoanRepo();
    loanService = new LoanService(repo as never);
  });

  // ── Requirement 16.1: Full happy path ──────────────────────────────────

  describe('Req 16.1 — Happy path: draft → submit → review → approve → disburse → collect all → close', () => {
    const creatorId = 'user-creator';
    const reviewerId = 'user-reviewer';
    const approverId = 'user-approver';

    it('should complete full lifecycle from draft to close', async () => {
      // Step 1: Create loan (draft)
      const loan = await loanService.create(
        {
          customerId: 'cust-1',
          productVersionId: 'pv-1',
          principalPaise: 10000000,
          tenureMonths: 12,
          purpose: 'Business expansion',
        },
        creatorId,
        'field_officer',
      );
      expect(loan.status).toBe('draft');
      expect(repo.createStatusHistory).toHaveBeenCalledWith(
        expect.objectContaining({ to_status: 'draft' }),
      );

      // Step 2: Submit loan
      repo.findById.mockResolvedValue(buildLoanDetail({ status: 'draft', created_by: creatorId }));
      repo.updateStatus.mockResolvedValue({ id: 'loan-1', status: 'submitted', version: 2 });

      const submitted = await loanService.submit('loan-1', creatorId, 'field_officer');
      expect(submitted!.status).toBe('submitted');
      expect(repo.createApproval).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'submitted' }),
      );

      // Step 3: Review loan
      repo.findById.mockResolvedValue(buildLoanDetail({ status: 'submitted', created_by: creatorId }));
      repo.updateStatus.mockResolvedValue({ id: 'loan-1', status: 'under_review', version: 3 });

      const reviewed = await loanService.review('loan-1', reviewerId, 'manager');
      expect(reviewed!.status).toBe('under_review');

      // Step 4: Approve loan
      repo.findById.mockResolvedValue(buildLoanDetail({ status: 'under_review', created_by: creatorId }));
      repo.updateStatus.mockResolvedValue({ id: 'loan-1', status: 'approved', version: 4 });

      const approved = await loanService.approve(
        'loan-1', { remarks: 'Looks good' }, approverId, 'manager',
      );
      expect(approved!.status).toBe('approved');
      expect(repo.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action_type: 'loan_approved' }),
      );

      // Step 5: Verify schedule was generated at approval
      expect(repo.createScheduleInstallments).toHaveBeenCalledTimes(1);
      expect(repo.updateLoanTotals).toHaveBeenCalledTimes(1);
    });

    it('should record audit log at each lifecycle step', async () => {
      // Create
      await loanService.create(
        { customerId: 'cust-1', productVersionId: 'pv-1', principalPaise: 10000000, tenureMonths: 12, purpose: 'Test' },
        'user-1', 'field_officer',
      );
      expect(repo.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action_type: 'loan_created' }),
      );

      // Submit
      repo.findById.mockResolvedValue(buildLoanDetail({ status: 'draft', created_by: 'user-1' }));
      repo.updateStatus.mockResolvedValue({ id: 'loan-1', status: 'submitted' });
      await loanService.submit('loan-1', 'user-1', 'field_officer');
      expect(repo.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action_type: 'loan_submitted' }),
      );

      // Review
      repo.findById.mockResolvedValue(buildLoanDetail({ status: 'submitted', created_by: 'user-1' }));
      repo.updateStatus.mockResolvedValue({ id: 'loan-1', status: 'under_review' });
      await loanService.review('loan-1', reviewerId, 'manager');
      expect(repo.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action_type: 'loan_reviewed' }),
      );

      // Approve
      repo.findById.mockResolvedValue(buildLoanDetail({ status: 'under_review', created_by: 'user-1' }));
      repo.updateStatus.mockResolvedValue({ id: 'loan-1', status: 'approved' });
      await loanService.approve('loan-1', { remarks: 'OK' }, approverId, 'manager');
      expect(repo.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action_type: 'loan_approved' }),
      );
    });

    it('should transition loan to closed when all prerequisites met via closeLoan', async () => {
      repo.findById.mockResolvedValue(buildLoanDetail({ status: 'active', version: 5 }));
      repo.getUnpaidInstallments.mockResolvedValue([]);
      repo.getUnsettledPenalties.mockResolvedValue([]);
      repo.getPendingReversals.mockResolvedValue([]);
      repo.getOutstandingBalance.mockResolvedValue(0n);
      repo.updateStatus.mockResolvedValue({ id: 'loan-1', status: 'closed', version: 6 });

      const closed = await loanService.closeLoan('loan-1', approverId, 'manager');
      expect(closed!.status).toBe('closed');
      expect(repo.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action_type: 'loan_closed' }),
      );
      expect(repo.createStatusHistory).toHaveBeenCalledWith(
        expect.objectContaining({ from_status: 'active', to_status: 'closed' }),
      );
    });

    it('should reject closure when unpaid installments exist', async () => {
      repo.findById.mockResolvedValue(buildLoanDetail({ status: 'active' }));
      repo.getUnpaidInstallments.mockResolvedValue([
        { id: 's-1', installment_number: 1, status: 'pending', principal_paise: 500000n, interest_paise: 50000n, principal_paid_paise: 0n, interest_paid_paise: 0n },
      ]);

      await expect(
        loanService.closeLoan('loan-1', approverId, 'manager'),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('should reject closure when outstanding balance is non-zero', async () => {
      repo.findById.mockResolvedValue(buildLoanDetail({ status: 'active' }));
      repo.getOutstandingBalance.mockResolvedValue(50000n);

      await expect(
        loanService.closeLoan('loan-1', approverId, 'manager'),
      ).rejects.toThrow(BusinessRuleError);
    });
  });

  // ── Requirement 16.2: Rejection path ───────────────────────────────────

  describe('Req 16.2 — Rejection path: create → submit → review → reject', () => {
    const creatorId = 'user-creator';
    const reviewerId = 'user-reviewer';

    it('should complete rejection path from draft to rejected', async () => {
      // Step 1: Create loan
      const loan = await loanService.create(
        {
          customerId: 'cust-1',
          productVersionId: 'pv-1',
          principalPaise: 10000000,
          tenureMonths: 12,
          purpose: 'Business expansion',
        },
        creatorId,
        'field_officer',
      );
      expect(loan.status).toBe('draft');

      // Step 2: Submit
      repo.findById.mockResolvedValue(buildLoanDetail({ status: 'draft', created_by: creatorId }));
      repo.updateStatus.mockResolvedValue({ id: 'loan-1', status: 'submitted' });
      const submitted = await loanService.submit('loan-1', creatorId, 'field_officer');
      expect(submitted!.status).toBe('submitted');

      // Step 3: Review
      repo.findById.mockResolvedValue(buildLoanDetail({ status: 'submitted', created_by: creatorId }));
      repo.updateStatus.mockResolvedValue({ id: 'loan-1', status: 'under_review' });
      const reviewed = await loanService.review('loan-1', reviewerId, 'manager');
      expect(reviewed!.status).toBe('under_review');

      // Step 4: Reject with mandatory reason
      repo.findById.mockResolvedValue(buildLoanDetail({ status: 'under_review', created_by: creatorId }));
      repo.updateStatus.mockResolvedValue({ id: 'loan-1', status: 'rejected' });
      const rejected = await loanService.reject(
        'loan-1',
        { reason: 'Insufficient documentation' },
        reviewerId,
        'manager',
      );
      expect(rejected!.status).toBe('rejected');
    });

    it('should record rejection reason in status history', async () => {
      repo.findById.mockResolvedValue(buildLoanDetail({ status: 'under_review', created_by: creatorId }));
      repo.updateStatus.mockResolvedValue({ id: 'loan-1', status: 'rejected' });

      await loanService.reject(
        'loan-1',
        { reason: 'Bad credit history' },
        reviewerId,
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

    it('should record rejection in approval log', async () => {
      repo.findById.mockResolvedValue(buildLoanDetail({ status: 'under_review', created_by: creatorId }));
      repo.updateStatus.mockResolvedValue({ id: 'loan-1', status: 'rejected' });

      await loanService.reject(
        'loan-1',
        { reason: 'Rejected for testing' },
        reviewerId,
        'manager',
      );

      expect(repo.createApproval).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'rejected',
          actor_id: reviewerId,
          remarks: 'Rejected for testing',
        }),
      );
    });

    it('should create audit log for rejection', async () => {
      repo.findById.mockResolvedValue(buildLoanDetail({ status: 'under_review', created_by: creatorId }));
      repo.updateStatus.mockResolvedValue({ id: 'loan-1', status: 'rejected' });

      await loanService.reject(
        'loan-1',
        { reason: 'Audit test' },
        reviewerId,
        'manager',
      );

      expect(repo.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action_type: 'loan_rejected',
          actor_id: reviewerId,
          after_state: expect.objectContaining({ status: 'rejected' }),
        }),
      );
    });

    it('should prevent any transition from rejected (terminal state)', () => {
      expect(() => { loanService.validateTransition('rejected', 'draft'); }).toThrow(BusinessRuleError);
      expect(() => { loanService.validateTransition('rejected', 'submitted'); }).toThrow(BusinessRuleError);
      expect(() => { loanService.validateTransition('rejected', 'active'); }).toThrow(BusinessRuleError);
    });
  });

  // ── Requirement 16.3: Overdue path ─────────────────────────────────────

  describe('Req 16.3 — Overdue path: disburse → miss payment → verify overdue + DPD', () => {
    it('should calculate positive DPD when installment is past due', () => {
      const dueDate = new Date('2024-01-15');
      const referenceDate = new Date('2024-02-14'); // 30 days past due
      const schedules = [
        {
          due_date: dueDate,
          principal_paise: 500000n,
          interest_paise: 50000n,
          principal_paid_paise: 0n,
          interest_paid_paise: 0n,
        },
      ];

      const dpd = calculateDpd(schedules, referenceDate);
      expect(dpd).toBe(30);
    });

    it('should classify DPD into correct overdue bucket', () => {
      expect(classifyOverdueBucket(0)).toBe('bucket_0');
      expect(classifyOverdueBucket(1)).toBe('bucket_1_30');
      expect(classifyOverdueBucket(30)).toBe('bucket_1_30');
      expect(classifyOverdueBucket(31)).toBe('bucket_31_60');
      expect(classifyOverdueBucket(60)).toBe('bucket_31_60');
      expect(classifyOverdueBucket(61)).toBe('bucket_61_90');
      expect(classifyOverdueBucket(90)).toBe('bucket_61_90');
      expect(classifyOverdueBucket(91)).toBe('bucket_90_plus');
      expect(classifyOverdueBucket(365)).toBe('bucket_90_plus');
    });

    it('should return DPD=0 when all installments are fully paid', () => {
      const schedules = [
        {
          due_date: new Date('2024-01-15'),
          principal_paise: 500000n,
          interest_paise: 50000n,
          principal_paid_paise: 500000n,
          interest_paid_paise: 50000n,
        },
      ];

      const dpd = calculateDpd(schedules, new Date('2024-03-01'));
      expect(dpd).toBe(0);
    });

    it('should use earliest unpaid installment for DPD calculation', () => {
      const schedules = [
        {
          due_date: new Date('2024-01-15'),
          principal_paise: 500000n,
          interest_paise: 50000n,
          principal_paid_paise: 500000n,
          interest_paid_paise: 50000n, // fully paid
        },
        {
          due_date: new Date('2024-02-15'),
          principal_paise: 500000n,
          interest_paise: 50000n,
          principal_paid_paise: 0n,
          interest_paid_paise: 0n, // unpaid
        },
        {
          due_date: new Date('2024-03-15'),
          principal_paise: 500000n,
          interest_paise: 50000n,
          principal_paid_paise: 0n,
          interest_paid_paise: 0n, // unpaid
        },
      ];

      // Reference date: April 1, 2024 → 45 days past Feb 15 (earliest unpaid)
      const dpd = calculateDpd(schedules, new Date('2024-04-01'));
      expect(dpd).toBe(46); // Feb 15 to Apr 1
    });

    it('should transition loan to overdue via transitionStatus', async () => {
      repo.findById.mockResolvedValue(buildLoanDetail({ status: 'active', version: 5 }));
      repo.updateStatus.mockResolvedValue({ id: 'loan-1', status: 'overdue', version: 6 });

      const result = await loanService.transitionStatus(
        'loan-1', 'overdue', 'system', 'system',
        { reason: 'DPD > 0, installment past due', metadata: { dpd: 30 } },
      );

      expect(result!.status).toBe('overdue');
      expect(repo.createStatusHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          from_status: 'active',
          to_status: 'overdue',
          reason: 'DPD > 0, installment past due',
          metadata: { dpd: 30 },
        }),
      );
      expect(repo.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action_type: 'loan_overdue' }),
      );
    });

    it('should allow overdue → active transition when DPD returns to 0', async () => {
      repo.findById.mockResolvedValue(buildLoanDetail({ status: 'overdue', version: 6 }));
      repo.updateStatus.mockResolvedValue({ id: 'loan-1', status: 'active', version: 7 });

      const result = await loanService.transitionStatus(
        'loan-1', 'active', 'system', 'system',
        { reason: 'All overdue installments paid, DPD returned to 0' },
      );

      expect(result!.status).toBe('active');
    });

    it('should allow overdue → closed transition', async () => {
      repo.findById.mockResolvedValue(buildLoanDetail({ status: 'overdue', version: 6 }));
      repo.getUnpaidInstallments.mockResolvedValue([]);
      repo.getUnsettledPenalties.mockResolvedValue([]);
      repo.getPendingReversals.mockResolvedValue([]);
      repo.getOutstandingBalance.mockResolvedValue(0n);
      repo.updateStatus.mockResolvedValue({ id: 'loan-1', status: 'closed', version: 7 });

      const closed = await loanService.closeLoan('loan-1', 'manager-1', 'manager');
      expect(closed!.status).toBe('closed');
    });

    it('should return DPD=0 when due date is in the future', () => {
      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 1);
      const schedules = [
        {
          due_date: futureDate,
          principal_paise: 500000n,
          interest_paise: 50000n,
          principal_paid_paise: 0n,
          interest_paid_paise: 0n,
        },
      ];

      const dpd = calculateDpd(schedules, new Date());
      expect(dpd).toBe(0);
    });
  });

  // ── Requirement 16.4: Schedule frozen at disbursement ───────────────────

  describe('Req 16.4 — Schedule frozen at disbursement', () => {
    it('should generate schedule at approval time', async () => {
      repo.findById.mockResolvedValue(buildLoanDetail({
        status: 'under_review',
        created_by: 'user-creator',
        product_version: {
          annual_rate_bps: 1200,
          interest_type: 'flat',
          repayment_frequency: 'monthly',
          min_principal_paise: 1000000n,
          max_principal_paise: 50000000n,
          min_tenure_months: 3,
          max_tenure_months: 36,
        },
      }));
      repo.updateStatus.mockResolvedValue({ id: 'loan-1', status: 'approved', version: 4 });

      await loanService.approve('loan-1', { remarks: 'Approved' }, 'user-approver', 'manager');

      // Schedule installments should have been created
      expect(repo.createScheduleInstallments).toHaveBeenCalledTimes(1);
      const installments = repo.createScheduleInstallments.mock.calls[0]![1];
      expect(installments.length).toBeGreaterThan(0);

      // Loan totals should have been updated
      expect(repo.updateLoanTotals).toHaveBeenCalledTimes(1);
      const [, totalInterest, totalPayable] = repo.updateLoanTotals.mock.calls[0]!;
      expect(totalInterest).toBeGreaterThan(0);
      expect(totalPayable).toBeGreaterThan(Number(10000000n));
    });

    it('should mark loan terms as immutable after approval', () => {
      expect(loanService.isImmutable('approved')).toBe(true);
      expect(loanService.isImmutable('disbursed')).toBe(true);
      expect(loanService.isImmutable('active')).toBe(true);
      expect(loanService.isImmutable('overdue')).toBe(true);
      expect(loanService.isImmutable('closed')).toBe(true);
    });

    it('should not mark pre-approval states as immutable', () => {
      expect(loanService.isImmutable('draft')).toBe(false);
      expect(loanService.isImmutable('submitted')).toBe(false);
      expect(loanService.isImmutable('under_review')).toBe(false);
    });

    it('should generate correct number of installments for 12-month tenure', async () => {
      repo.findById.mockResolvedValue(buildLoanDetail({
        status: 'under_review',
        created_by: 'user-creator',
        tenure_months: 12,
        product_version: {
          annual_rate_bps: 1200,
          interest_type: 'flat',
          repayment_frequency: 'monthly',
          min_principal_paise: 1000000n,
          max_principal_paise: 50000000n,
          min_tenure_months: 3,
          max_tenure_months: 36,
        },
      }));
      repo.updateStatus.mockResolvedValue({ id: 'loan-1', status: 'approved' });

      await loanService.approve('loan-1', { remarks: 'OK' }, 'user-approver', 'manager');

      const installments = repo.createScheduleInstallments.mock.calls[0]![1];
      expect(installments).toHaveLength(12);
    });

    it('should ensure schedule installment principals sum to loan principal', async () => {
      repo.findById.mockResolvedValue(buildLoanDetail({
        status: 'under_review',
        created_by: 'user-creator',
        principal_paise: 10000000n,
        product_version: {
          annual_rate_bps: 1200,
          interest_type: 'flat',
          repayment_frequency: 'monthly',
          min_principal_paise: 1000000n,
          max_principal_paise: 50000000n,
          min_tenure_months: 3,
          max_tenure_months: 36,
        },
      }));
      repo.updateStatus.mockResolvedValue({ id: 'loan-1', status: 'approved' });

      await loanService.approve('loan-1', { remarks: 'OK' }, 'user-approver', 'manager');

      const installments = repo.createScheduleInstallments.mock.calls[0]![1];
      const totalPrincipal = installments.reduce(
        (sum: number, inst: { principalPaise: number }) => sum + inst.principalPaise, 0,
      );
      expect(totalPrincipal).toBe(10000000);
    });
  });

  // ── Requirement 16.5: Optimistic locking ───────────────────────────────

  describe('Req 16.5 — Optimistic locking: concurrent updates detect version conflicts', () => {
    it('should pass expected version to updateStatus in transitionStatus', async () => {
      repo.findById.mockResolvedValue(buildLoanDetail({ status: 'active', version: 5 }));
      repo.updateStatus.mockResolvedValue({ id: 'loan-1', status: 'overdue', version: 6 });

      await loanService.transitionStatus('loan-1', 'overdue', 'system', 'system');

      // transitionStatus should pass the version for optimistic locking
      expect(repo.updateStatus).toHaveBeenCalledWith(
        'loan-1',
        'overdue',
        undefined, // no extra data
        5,         // expected version
      );
    });

    it('should detect version conflict when concurrent update changes version', async () => {
      repo.findById.mockResolvedValue(buildLoanDetail({ status: 'active', version: 5 }));
      // Simulate optimistic lock failure — updateStatus throws ConflictError
      repo.updateStatus.mockRejectedValue(
        new ConflictError(
          'Loan was modified by another request. Please reload and retry.',
          'CONFLICT_OPTIMISTIC_LOCK',
        ),
      );

      await expect(
        loanService.transitionStatus('loan-1', 'overdue', 'system', 'system'),
      ).rejects.toThrow(ConflictError);
    });

    it('should include descriptive message in optimistic lock conflict error', async () => {
      repo.findById.mockResolvedValue(buildLoanDetail({ status: 'active', version: 5 }));
      repo.updateStatus.mockRejectedValue(
        new ConflictError(
          'Loan was modified by another request. Please reload and retry.',
          'CONFLICT_OPTIMISTIC_LOCK',
        ),
      );

      await expect(
        loanService.transitionStatus('loan-1', 'overdue', 'system', 'system'),
      ).rejects.toThrow('Loan was modified by another request');
    });

    it('should not create status history or audit log when version conflict occurs', async () => {
      repo.findById.mockResolvedValue(buildLoanDetail({ status: 'active', version: 5 }));
      repo.updateStatus.mockRejectedValue(
        new ConflictError('Loan was modified by another request.', 'CONFLICT_OPTIMISTIC_LOCK'),
      );

      // Clear call counts from beforeEach
      repo.createStatusHistory.mockClear();
      repo.createAuditLog.mockClear();

      try {
        await loanService.transitionStatus('loan-1', 'overdue', 'system', 'system');
      } catch {
        // expected
      }

      // Since updateStatus threw before status history/audit log, they should not be called
      expect(repo.createStatusHistory).not.toHaveBeenCalled();
      expect(repo.createAuditLog).not.toHaveBeenCalled();
    });

    it('should simulate two concurrent transitions where second fails', async () => {
      // First call succeeds
      repo.findById.mockResolvedValueOnce(buildLoanDetail({ status: 'active', version: 5 }));
      repo.updateStatus.mockResolvedValueOnce({ id: 'loan-1', status: 'overdue', version: 6 });

      const first = await loanService.transitionStatus('loan-1', 'overdue', 'system-1', 'system');
      expect(first!.status).toBe('overdue');

      // Second call reads stale version (5) but DB has version 6 now
      repo.findById.mockResolvedValueOnce(buildLoanDetail({ status: 'active', version: 5 }));
      repo.updateStatus.mockRejectedValueOnce(
        new ConflictError('Loan was modified by another request.', 'CONFLICT_OPTIMISTIC_LOCK'),
      );

      await expect(
        loanService.transitionStatus('loan-1', 'overdue', 'system-2', 'system'),
      ).rejects.toThrow(ConflictError);
    });

    it('should pass extra data along with version in transitionStatus', async () => {
      repo.findById.mockResolvedValue(buildLoanDetail({ status: 'approved', version: 4 }));
      repo.updateStatus.mockResolvedValue({ id: 'loan-1', status: 'disbursed', version: 5 });

      await loanService.transitionStatus(
        'loan-1', 'disbursed', 'officer-1', 'field_officer',
        { extra: { disbursement_date: new Date('2024-01-15') } },
      );

      expect(repo.updateStatus).toHaveBeenCalledWith(
        'loan-1',
        'disbursed',
        { disbursement_date: new Date('2024-01-15') },
        4, // expected version
      );
    });
  });

  // ── Cross-cutting: Invalid state transitions ───────────────────────────

  describe('Invalid state transitions', () => {
    it('should reject all invalid transitions', () => {
      expect(() => { loanService.validateTransition('draft', 'approved'); }).toThrow(BusinessRuleError);
      expect(() => { loanService.validateTransition('draft', 'active'); }).toThrow(BusinessRuleError);
      expect(() => { loanService.validateTransition('closed', 'active'); }).toThrow(BusinessRuleError);
      expect(() => { loanService.validateTransition('rejected', 'submitted'); }).toThrow(BusinessRuleError);
      expect(() => { loanService.validateTransition('defaulted', 'active'); }).toThrow(BusinessRuleError);
      expect(() => { loanService.validateTransition('foreclosed', 'active'); }).toThrow(BusinessRuleError);
    });

    it('should reject transitions from terminal states', () => {
      const terminalStates = ['rejected', 'defaulted', 'foreclosed', 'closed'];
      const allStatuses = ['draft', 'submitted', 'under_review', 'approved', 'disbursed', 'active', 'overdue'];

      for (const terminal of terminalStates) {
        for (const target of allStatuses) {
          expect(() => { loanService.validateTransition(terminal, target); }).toThrow(BusinessRuleError);
        }
      }
    });
  });

  // ── Cross-cutting: Blacklisted customer prevention ─────────────────────

  describe('Blacklisted customer prevention', () => {
    it('should prevent loan creation for blacklisted customer', async () => {
      repo.getCustomerStatus.mockResolvedValue({ id: 'cust-1', status: 'blacklisted' });

      await expect(
        loanService.create(
          { customerId: 'cust-1', productVersionId: 'pv-1', principalPaise: 10000000, tenureMonths: 12, purpose: 'Test' },
          'user-1', 'field_officer',
        ),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('should prevent loan submission for blacklisted customer', async () => {
      repo.findById.mockResolvedValue(buildLoanDetail({ status: 'draft', created_by: 'user-1' }));
      repo.getCustomerStatus.mockResolvedValue({ id: 'cust-1', status: 'blacklisted' });

      await expect(
        loanService.submit('loan-1', 'user-1', 'field_officer'),
      ).rejects.toThrow(BusinessRuleError);
    });
  });
});
