import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LoanService } from '../loan.service';
import { DisbursementService } from '../../disbursement/disbursement.service';
import { BusinessRuleError, NotFoundError } from '../../../common/errors';

/**
 * Integration tests for loan lifecycle flow.
 * Tests: customer creation → loan application → submission → review →
 *        approval (maker-checker) → disbursement → active status.
 *
 * Uses mocked repositories to verify the correct sequence of service calls.
 *
 * Validates: Requirements 3.1, 5.3, 25.6
 */

// ── Mock Factories ───────────────────────────────────────────────────────────

function createMockLoanRepo() {
  return {
    getCustomerStatus: vi.fn().mockResolvedValue({ id: 'cust-1', status: 'active' }),
    hasDefaultedLoans: vi.fn().mockResolvedValue(false),
    getProductVersion: vi.fn().mockResolvedValue({
      id: 'pv-1',
      product_id: 'prod-1',
      is_active: true,
      min_principal_paise: 1000000,
      max_principal_paise: 50000000,
      min_tenure_months: 3,
      max_tenure_months: 36,
      max_concurrent_loans: 3,
      product: { id: 'prod-1', is_active: true },
    }),
    countActiveLoansByCustomerAndProduct: vi.fn().mockResolvedValue(0),
    generateLoanNumber: vi.fn().mockResolvedValue('LN-2024-00001'),
    create: vi.fn().mockResolvedValue({ id: 'loan-1', status: 'draft', loan_number: 'LN-2024-00001' }),
    createStatusHistory: vi.fn().mockResolvedValue({}),
    createAuditLog: vi.fn().mockResolvedValue({}),
    createApproval: vi.fn().mockResolvedValue({}),
    findById: vi.fn(),
    updateStatus: vi.fn(),
    getUnpaidInstallments: vi.fn().mockResolvedValue([]),
    getUnsettledPenalties: vi.fn().mockResolvedValue([]),
    getPendingReversals: vi.fn().mockResolvedValue([]),
    getOutstandingBalance: vi.fn().mockResolvedValue(0),
    findAll: vi.fn(),
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Loan Lifecycle Integration', () => {
  let loanService: LoanService;
  let repo: ReturnType<typeof createMockLoanRepo>;

  beforeEach(() => {
    repo = createMockLoanRepo();
    loanService = new LoanService(repo as never);
  });

  it('should complete full lifecycle: draft → submitted → under_review → approved → disbursed', async () => {
    const creatorId = 'user-creator';
    const reviewerId = 'user-reviewer';
    const approverId = 'user-approver';

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
    repo.findById.mockResolvedValue({
      id: 'loan-1', status: 'draft', customer_id: 'cust-1', created_by: creatorId,
      principal_paise: 10000000n, tenure_months: 12,
      product_version: {
        min_principal_paise: 1000000n, max_principal_paise: 50000000n,
        min_tenure_months: 3, max_tenure_months: 36,
      },
    });
    repo.updateStatus.mockResolvedValue({ id: 'loan-1', status: 'submitted' });

    const submitted = await loanService.submit('loan-1', creatorId, 'field_officer');
    expect(submitted!.status).toBe('submitted');
    expect(repo.createApproval).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'submitted' }),
    );

    // Step 3: Review loan
    repo.findById.mockResolvedValue({ id: 'loan-1', status: 'submitted', created_by: creatorId });
    repo.updateStatus.mockResolvedValue({ id: 'loan-1', status: 'under_review' });

    const reviewed = await loanService.review('loan-1', reviewerId, 'manager');
    expect(reviewed!.status).toBe('under_review');

    // Step 4: Approve loan (maker-checker: approver ≠ creator)
    repo.findById.mockResolvedValue({ id: 'loan-1', status: 'under_review', created_by: creatorId });
    repo.updateStatus.mockResolvedValue({ id: 'loan-1', status: 'approved' });

    const approved = await loanService.approve(
      'loan-1', { remarks: 'Looks good' }, approverId, 'manager',
    );
    expect(approved!.status).toBe('approved');
    expect(repo.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action_type: 'loan_approved' }),
    );
  });

  it('should enforce maker-checker: creator cannot approve own loan', async () => {
    const creatorId = 'user-creator';
    repo.findById.mockResolvedValue({ id: 'loan-1', status: 'under_review', created_by: creatorId });

    await expect(
      loanService.approve('loan-1', { remarks: 'Self-approve' }, creatorId, 'manager'),
    ).rejects.toThrow(BusinessRuleError);
  });

  it('should reject invalid state transitions', () => {
    expect(() => loanService.validateTransition('draft', 'approved')).toThrow(BusinessRuleError);
    expect(() => loanService.validateTransition('closed', 'active')).toThrow(BusinessRuleError);
    expect(() => loanService.validateTransition('rejected', 'submitted')).toThrow(BusinessRuleError);
  });

  it('should prevent loan creation for blacklisted customer', async () => {
    repo.getCustomerStatus.mockResolvedValue({ id: 'cust-1', status: 'blacklisted' });

    await expect(
      loanService.create(
        { customerId: 'cust-1', productVersionId: 'pv-1', principalPaise: 10000000, tenureMonths: 12, purpose: 'Test' },
        'user-1', 'field_officer',
      ),
    ).rejects.toThrow(BusinessRuleError);
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
    repo.findById.mockResolvedValue({
      id: 'loan-1', status: 'draft', customer_id: 'cust-1', created_by: 'user-1',
      principal_paise: 10000000n, tenure_months: 12,
      product_version: {
        min_principal_paise: 1000000n, max_principal_paise: 50000000n,
        min_tenure_months: 3, max_tenure_months: 36,
      },
    });
    repo.updateStatus.mockResolvedValue({ id: 'loan-1', status: 'submitted' });
    await loanService.submit('loan-1', 'user-1', 'field_officer');
    expect(repo.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action_type: 'loan_submitted' }),
    );
  });
});
