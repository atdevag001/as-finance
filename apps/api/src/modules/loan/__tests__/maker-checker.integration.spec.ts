import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LoanService } from '../loan.service';
import { BusinessRuleError } from '../../../common/errors';

/**
 * Loan approval workflow integration test.
 *
 * Verifies the full approval workflow:
 *   field_officer creates loan → submits → manager reviews →
 *   manager approves → audit log records actor IDs.
 *
 * Validates: Requirements 61.6
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
    created_by: 'fo-user-1',
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

// ── Actor IDs ────────────────────────────────────────────────────────────────

const FIELD_OFFICER_ID = 'fo-user-1';
const FIELD_OFFICER_ROLE = 'field_officer';
const MANAGER_ID = 'mgr-user-1';
const MANAGER_ROLE = 'manager';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Maker-Checker Integration', () => {
  let loanService: LoanService;
  let repo: ReturnType<typeof createMockLoanRepo>;

  beforeEach(() => {
    repo = createMockLoanRepo();
    const prismaMock: any = {
      $transaction: vi.fn(async (cb: (tx: any) => Promise<any>) => cb({})),
    };
    const settingsMock: any = { getHolidays: vi.fn().mockResolvedValue([]) };
    (repo as any).lockLoanForUpdate = vi.fn(async () => ({ id: 'loan-1', status: 'active', version: 1, cached_outstanding_paise: 0n }));
    loanService = new LoanService(repo as never, prismaMock, settingsMock);
  });

  describe('Req 61.6 — Full approval flow with audit trail', () => {
    it('should complete full flow: field_officer creates → submits → manager reviews → manager approves', async () => {
      // Step 1: field_officer creates loan (draft)
      const loan = await loanService.create(
        {
          customerId: 'cust-1',
          productVersionId: 'pv-1',
          principalPaise: 10000000,
          tenureMonths: 12,
          purpose: 'Business expansion',
        },
        FIELD_OFFICER_ID,
        FIELD_OFFICER_ROLE,
      );
      expect(loan.status).toBe('draft');

      // Step 2: field_officer submits loan
      repo.findById.mockResolvedValue(buildLoanDetail({ status: 'draft', created_by: FIELD_OFFICER_ID }));
      repo.updateStatus.mockResolvedValue({ id: 'loan-1', status: 'submitted', version: 2 });

      const submitted = await loanService.submit('loan-1', FIELD_OFFICER_ID, FIELD_OFFICER_ROLE);
      expect(submitted!.status).toBe('submitted');

      // Step 3: manager reviews loan
      repo.findById.mockResolvedValue(buildLoanDetail({ status: 'submitted', created_by: FIELD_OFFICER_ID }));
      repo.updateStatus.mockResolvedValue({ id: 'loan-1', status: 'under_review', version: 3 });

      const reviewed = await loanService.review('loan-1', MANAGER_ID, MANAGER_ROLE);
      expect(reviewed!.status).toBe('under_review');

      // Step 4: manager approves loan
      repo.findById.mockResolvedValue(buildLoanDetail({ status: 'under_review', created_by: FIELD_OFFICER_ID }));
      repo.updateStatus.mockResolvedValue({ id: 'loan-1', status: 'approved', version: 4 });

      const approved = await loanService.approve(
        'loan-1', { remarks: 'All documents verified' }, MANAGER_ID, MANAGER_ROLE,
      );
      expect(approved!.status).toBe('approved');
    });

    it('should record field_officer actor_id in creation audit log', async () => {
      await loanService.create(
        {
          customerId: 'cust-1',
          productVersionId: 'pv-1',
          principalPaise: 10000000,
          tenureMonths: 12,
          purpose: 'Test',
        },
        FIELD_OFFICER_ID,
        FIELD_OFFICER_ROLE,
      );

      expect(repo.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action_type: 'loan_created',
          actor_id: FIELD_OFFICER_ID,
          actor_role: FIELD_OFFICER_ROLE,
          target_entity: 'loan',
        }),
      );
    });

    it('should record field_officer actor_id in submission audit log', async () => {
      repo.findById.mockResolvedValue(buildLoanDetail({ status: 'draft', created_by: FIELD_OFFICER_ID }));
      repo.updateStatus.mockResolvedValue({ id: 'loan-1', status: 'submitted' });

      await loanService.submit('loan-1', FIELD_OFFICER_ID, FIELD_OFFICER_ROLE);

      expect(repo.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action_type: 'loan_submitted',
          actor_id: FIELD_OFFICER_ID,
          actor_role: FIELD_OFFICER_ROLE,
        }),
      );
    });

    it('should record manager actor_id in review audit log', async () => {
      repo.findById.mockResolvedValue(buildLoanDetail({ status: 'submitted', created_by: FIELD_OFFICER_ID }));
      repo.updateStatus.mockResolvedValue({ id: 'loan-1', status: 'under_review' });

      await loanService.review('loan-1', MANAGER_ID, MANAGER_ROLE);

      expect(repo.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action_type: 'loan_reviewed',
          actor_id: MANAGER_ID,
          actor_role: MANAGER_ROLE,
        }),
      );
    });

    it('should record manager actor_id in approval audit log', async () => {
      repo.findById.mockResolvedValue(buildLoanDetail({ status: 'under_review', created_by: FIELD_OFFICER_ID }));
      repo.updateStatus.mockResolvedValue({ id: 'loan-1', status: 'approved' });

      await loanService.approve('loan-1', { remarks: 'Approved' }, MANAGER_ID, MANAGER_ROLE);

      expect(repo.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action_type: 'loan_approved',
          actor_id: MANAGER_ID,
          actor_role: MANAGER_ROLE,
          target_entity: 'loan',
          target_id: 'loan-1',
          after_state: expect.objectContaining({ approved_by: MANAGER_ID }),
        }),
      );
    });

    it('should record both maker and checker IDs across the full flow audit trail', async () => {
      // Create (maker = field_officer)
      await loanService.create(
        {
          customerId: 'cust-1',
          productVersionId: 'pv-1',
          principalPaise: 10000000,
          tenureMonths: 12,
          purpose: 'Full flow test',
        },
        FIELD_OFFICER_ID,
        FIELD_OFFICER_ROLE,
      );

      // Submit (maker = field_officer)
      repo.findById.mockResolvedValue(buildLoanDetail({ status: 'draft', created_by: FIELD_OFFICER_ID }));
      repo.updateStatus.mockResolvedValue({ id: 'loan-1', status: 'submitted' });
      await loanService.submit('loan-1', FIELD_OFFICER_ID, FIELD_OFFICER_ROLE);

      // Review (checker = manager)
      repo.findById.mockResolvedValue(buildLoanDetail({ status: 'submitted', created_by: FIELD_OFFICER_ID }));
      repo.updateStatus.mockResolvedValue({ id: 'loan-1', status: 'under_review' });
      await loanService.review('loan-1', MANAGER_ID, MANAGER_ROLE);

      // Approve (checker = manager)
      repo.findById.mockResolvedValue(buildLoanDetail({ status: 'under_review', created_by: FIELD_OFFICER_ID }));
      repo.updateStatus.mockResolvedValue({ id: 'loan-1', status: 'approved' });
      await loanService.approve('loan-1', { remarks: 'OK' }, MANAGER_ID, MANAGER_ROLE);

      // Verify all audit log calls recorded correct actor IDs
      const auditCalls = repo.createAuditLog.mock.calls.map(
        (c: unknown[]) => c[0],
      ) as Array<{ action_type: string; actor_id: string; actor_role: string }>;

      // loan_created by field_officer
      const createdLog = auditCalls.find((c) => c['action_type'] === 'loan_created');
      expect(createdLog).toBeDefined();
      expect(createdLog!['actor_id']).toBe(FIELD_OFFICER_ID);
      expect(createdLog!['actor_role']).toBe(FIELD_OFFICER_ROLE);

      // loan_submitted by field_officer
      const submittedLog = auditCalls.find((c) => c['action_type'] === 'loan_submitted');
      expect(submittedLog).toBeDefined();
      expect(submittedLog!['actor_id']).toBe(FIELD_OFFICER_ID);
      expect(submittedLog!['actor_role']).toBe(FIELD_OFFICER_ROLE);

      // loan_reviewed by manager
      const reviewedLog = auditCalls.find((c) => c['action_type'] === 'loan_reviewed');
      expect(reviewedLog).toBeDefined();
      expect(reviewedLog!['actor_id']).toBe(MANAGER_ID);
      expect(reviewedLog!['actor_role']).toBe(MANAGER_ROLE);

      // loan_approved by manager
      const approvedLog = auditCalls.find((c) => c['action_type'] === 'loan_approved');
      expect(approvedLog).toBeDefined();
      expect(approvedLog!['actor_id']).toBe(MANAGER_ID);
      expect(approvedLog!['actor_role']).toBe(MANAGER_ROLE);
    });

    it('should allow creator to approve their own loan', async () => {
      repo.findById.mockResolvedValue(buildLoanDetail({ status: 'under_review', created_by: FIELD_OFFICER_ID }));
      repo.updateStatus.mockResolvedValue({ id: 'loan-1', status: 'approved' });

      const approved = await loanService.approve(
        'loan-1', { remarks: 'Self-approve' }, FIELD_OFFICER_ID, MANAGER_ROLE,
      );
      expect(approved!.status).toBe('approved');

      expect(repo.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action_type: 'loan_approved',
          actor_id: FIELD_OFFICER_ID,
        }),
      );
    });

    it('should record approval record with approver actor_id and remarks', async () => {
      repo.findById.mockResolvedValue(buildLoanDetail({ status: 'under_review', created_by: FIELD_OFFICER_ID }));
      repo.updateStatus.mockResolvedValue({ id: 'loan-1', status: 'approved' });

      await loanService.approve('loan-1', { remarks: 'Verified docs' }, MANAGER_ID, MANAGER_ROLE);

      expect(repo.createApproval).toHaveBeenCalledWith(
        expect.objectContaining({
          loan_id: 'loan-1',
          action: 'approved',
          actor_id: MANAGER_ID,
          remarks: 'Verified docs',
        }),
      );
    });

    it('should record submission approval record with maker actor_id', async () => {
      repo.findById.mockResolvedValue(buildLoanDetail({ status: 'draft', created_by: FIELD_OFFICER_ID }));
      repo.updateStatus.mockResolvedValue({ id: 'loan-1', status: 'submitted' });

      await loanService.submit('loan-1', FIELD_OFFICER_ID, FIELD_OFFICER_ROLE);

      expect(repo.createApproval).toHaveBeenCalledWith(
        expect.objectContaining({
          loan_id: 'loan-1',
          action: 'submitted',
          actor_id: FIELD_OFFICER_ID,
        }),
      );
    });

    it('should allow a different manager to approve a loan created by another manager', async () => {
      const creatorManagerId = 'mgr-user-2';
      repo.findById.mockResolvedValue(buildLoanDetail({ status: 'under_review', created_by: creatorManagerId }));
      repo.updateStatus.mockResolvedValue({ id: 'loan-1', status: 'approved' });

      const approved = await loanService.approve(
        'loan-1', { remarks: 'Cross-manager approval' }, MANAGER_ID, MANAGER_ROLE,
      );
      expect(approved!.status).toBe('approved');

      expect(repo.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action_type: 'loan_approved',
          actor_id: MANAGER_ID,
          after_state: expect.objectContaining({ approved_by: MANAGER_ID }),
        }),
      );
    });
  });
});
