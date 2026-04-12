import { Injectable } from '@nestjs/common';
import { LoanRepository } from './loan.repository';
import { CreateLoanDto } from './dto/create-loan.dto';
import { ApproveLoanDto } from './dto/approve-loan.dto';
import { RejectLoanDto } from './dto/reject-loan.dto';
import { LoanQueryDto } from './dto/loan-query.dto';
import { BusinessRuleError, NotFoundError } from '../../common/errors';
import { generateSchedule, type ScheduleParams } from '../schedule/schedule.service';

/**
 * Allowed loan status transitions matrix.
 * Key = current status, Value = set of allowed target statuses.
 */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ['submitted'],
  submitted: ['under_review'],
  under_review: ['approved', 'rejected'],
  approved: ['disbursed'],
  disbursed: ['active'],
  active: ['overdue', 'defaulted', 'foreclosed', 'closed'],
  overdue: ['active', 'foreclosed', 'defaulted', 'closed'],
  // Terminal states — no outgoing transitions
  rejected: [],
  defaulted: [],
  foreclosed: [],
  closed: [],
};

/** Statuses after which loan terms (principal, tenure, product) are immutable */
const IMMUTABLE_AFTER = new Set([
  'approved',
  'disbursed',
  'active',
  'overdue',
  'defaulted',
  'foreclosed',
  'closed',
]);

@Injectable()
export class LoanService {
  constructor(private readonly loanRepository: LoanRepository) {}

  /**
   * Validate that a status transition is allowed.
   */
  validateTransition(fromStatus: string, toStatus: string): void {
    const allowed = ALLOWED_TRANSITIONS[fromStatus];
    if (!allowed) {
      throw new BusinessRuleError(
        `Unknown loan status: ${fromStatus}`,
        'INVALID_LOAN_STATUS',
      );
    }
    if (!allowed.includes(toStatus)) {
      throw new BusinessRuleError(
        `Invalid status transition from '${fromStatus}' to '${toStatus}'. Allowed transitions: ${allowed.length > 0 ? allowed.join(', ') : 'none (terminal state)'}`,
        'INVALID_STATUS_TRANSITION',
      );
    }
  }

  /**
   * Get the allowed transitions map (exposed for property testing).
   */
  getAllowedTransitions(): Record<string, string[]> {
    return { ...ALLOWED_TRANSITIONS };
  }

  /**
   * Create a new loan application in draft status.
   * Validates: principal/tenure within product ranges, customer not blacklisted,
   * no defaulted loans, concurrent loan limit.
   */
  async create(dto: CreateLoanDto, actorId: string, actorRole: string) {
    // 1. Verify customer exists and is not blacklisted
    const customer = await this.loanRepository.getCustomerStatus(dto.customerId);
    if (!customer) {
      throw new NotFoundError(`Customer not found: ${dto.customerId}`);
    }
    if (customer.status === 'blacklisted') {
      throw new BusinessRuleError(
        'Cannot create loan for a blacklisted customer',
        'CUSTOMER_BLACKLISTED',
      );
    }

    // 2. Verify customer has no defaulted loans
    const hasDefaulted = await this.loanRepository.hasDefaultedLoans(dto.customerId);
    if (hasDefaulted) {
      throw new BusinessRuleError(
        'Cannot create loan for a customer with defaulted loans',
        'CUSTOMER_HAS_DEFAULTED_LOANS',
      );
    }

    // 3. Verify product version exists and is active
    const productVersion = await this.loanRepository.getProductVersion(dto.productVersionId);
    if (!productVersion) {
      throw new NotFoundError(`Product version not found: ${dto.productVersionId}`);
    }
    if (!productVersion.is_active || !productVersion.product.is_active) {
      throw new BusinessRuleError(
        'Cannot create loan with an inactive product',
        'PRODUCT_INACTIVE',
      );
    }

    // 4. Validate principal within product range
    const minPrincipal = Number(productVersion.min_principal_paise);
    const maxPrincipal = Number(productVersion.max_principal_paise);
    if (dto.principalPaise < minPrincipal || dto.principalPaise > maxPrincipal) {
      throw new BusinessRuleError(
        `Principal ${dto.principalPaise} paise is outside allowed range [${minPrincipal}, ${maxPrincipal}]`,
        'PRINCIPAL_OUT_OF_RANGE',
      );
    }

    // 5. Validate tenure within product range
    if (
      dto.tenureMonths < productVersion.min_tenure_months ||
      dto.tenureMonths > productVersion.max_tenure_months
    ) {
      throw new BusinessRuleError(
        `Tenure ${dto.tenureMonths} months is outside allowed range [${productVersion.min_tenure_months}, ${productVersion.max_tenure_months}]`,
        'TENURE_OUT_OF_RANGE',
      );
    }

    // 6. Check concurrent loan limit per product
    const activeCount =
      await this.loanRepository.countActiveLoansByCustomerAndProduct(
        dto.customerId,
        productVersion.product_id,
      );
    if (activeCount >= productVersion.max_concurrent_loans) {
      throw new BusinessRuleError(
        `Customer has reached the maximum concurrent loan limit (${productVersion.max_concurrent_loans}) for this product`,
        'CONCURRENT_LOAN_LIMIT_EXCEEDED',
      );
    }

    // 7. Generate unique loan number
    const loanNumber = await this.loanRepository.generateLoanNumber();

    // 8. Create the loan in draft status
    const loan = await this.loanRepository.create({
      loan_number: loanNumber,
      customer_id: dto.customerId,
      product_version_id: dto.productVersionId,
      principal_paise: dto.principalPaise,
      tenure_months: dto.tenureMonths,
      purpose: dto.purpose,
      created_by: actorId,
      group_id: dto.groupId,
    });

    // 9. Record initial status history
    await this.loanRepository.createStatusHistory({
      loan_id: loan.id,
      from_status: null,
      to_status: 'draft',
      changed_by: actorId,
    });

    // 10. Record audit log
    await this.loanRepository.createAuditLog({
      action_type: 'loan_created',
      actor_id: actorId,
      actor_role: actorRole,
      target_entity: 'loan',
      target_id: loan.id,
      after_state: { loan_number: loanNumber, status: 'draft', principal_paise: dto.principalPaise },
    });

    return loan;
  }

  /**
   * Submit a draft loan for review.
   * Re-validates principal/tenure, customer status, and defaulted loans at submission time.
   */
  async submit(loanId: string, actorId: string, actorRole: string) {
    const loan = await this.loanRepository.findById(loanId);
    if (!loan) {
      throw new NotFoundError(`Loan not found: ${loanId}`);
    }

    this.validateTransition(loan.status, 'submitted');

    // Re-validate at submission time
    const customer = await this.loanRepository.getCustomerStatus(loan.customer_id);
    if (customer && customer.status === 'blacklisted') {
      throw new BusinessRuleError(
        'Cannot submit loan for a blacklisted customer',
        'CUSTOMER_BLACKLISTED',
      );
    }

    const hasDefaulted = await this.loanRepository.hasDefaultedLoans(loan.customer_id);
    if (hasDefaulted) {
      throw new BusinessRuleError(
        'Cannot submit loan for a customer with defaulted loans',
        'CUSTOMER_HAS_DEFAULTED_LOANS',
      );
    }

    // Validate principal/tenure against product version
    if (loan.product_version) {
      const pv = loan.product_version;
      const principal = Number(loan.principal_paise);
      const minP = Number(pv.min_principal_paise);
      const maxP = Number(pv.max_principal_paise);
      if (principal < minP || principal > maxP) {
        throw new BusinessRuleError(
          `Principal ${principal} paise is outside allowed range [${minP}, ${maxP}]`,
          'PRINCIPAL_OUT_OF_RANGE',
        );
      }
      if (loan.tenure_months < pv.min_tenure_months || loan.tenure_months > pv.max_tenure_months) {
        throw new BusinessRuleError(
          `Tenure ${loan.tenure_months} months is outside allowed range [${pv.min_tenure_months}, ${pv.max_tenure_months}]`,
          'TENURE_OUT_OF_RANGE',
        );
      }
    }

    const updated = await this.loanRepository.updateStatus(loanId, 'submitted');

    await this.loanRepository.createStatusHistory({
      loan_id: loanId,
      from_status: 'draft',
      to_status: 'submitted',
      changed_by: actorId,
    });

    await this.loanRepository.createApproval({
      loan_id: loanId,
      action: 'submitted',
      actor_id: actorId,
    });

    await this.loanRepository.createAuditLog({
      action_type: 'loan_submitted',
      actor_id: actorId,
      actor_role: actorRole,
      target_entity: 'loan',
      target_id: loanId,
      before_state: { status: 'draft' },
      after_state: { status: 'submitted' },
    });

    return updated;
  }

  /**
   * Move a submitted loan to under_review status.
   */
  async review(loanId: string, actorId: string, actorRole: string) {
    const loan = await this.loanRepository.findById(loanId);
    if (!loan) {
      throw new NotFoundError(`Loan not found: ${loanId}`);
    }

    this.validateTransition(loan.status, 'under_review');

    const updated = await this.loanRepository.updateStatus(loanId, 'under_review');

    await this.loanRepository.createStatusHistory({
      loan_id: loanId,
      from_status: 'submitted',
      to_status: 'under_review',
      changed_by: actorId,
    });

    await this.loanRepository.createApproval({
      loan_id: loanId,
      action: 'under_review',
      actor_id: actorId,
    });

    await this.loanRepository.createAuditLog({
      action_type: 'loan_reviewed',
      actor_id: actorId,
      actor_role: actorRole,
      target_entity: 'loan',
      target_id: loanId,
      before_state: { status: 'submitted' },
      after_state: { status: 'under_review' },
    });

    return updated;
  }

  /**
   * Approve a loan under review.
   * Maker-checker: approver must differ from the loan creator.
   */
  async approve(
    loanId: string,
    dto: ApproveLoanDto,
    actorId: string,
    actorRole: string,
  ) {
    const loan = await this.loanRepository.findById(loanId);
    if (!loan) {
      throw new NotFoundError(`Loan not found: ${loanId}`);
    }

    this.validateTransition(loan.status, 'approved');

    // Maker-checker enforcement: approver ≠ creator
    if (loan.created_by === actorId) {
      throw new BusinessRuleError(
        'Maker-checker violation: approver cannot be the same user who created the loan',
        'MAKER_CHECKER_VIOLATION',
      );
    }

    const updated = await this.loanRepository.updateStatus(loanId, 'approved', {
      approved_by: actorId,
    });

    // Generate and persist the EMI schedule
    if (loan.product_version) {
      const pv = loan.product_version;
      const schedule = generateSchedule({
        principalPaise: Number(loan.principal_paise),
        annualRateBps: pv.annual_rate_bps,
        tenureMonths: loan.tenure_months,
        interestType: pv.interest_type,
        frequency: pv.repayment_frequency,
        startDate: new Date(),
        holidays: [],
      } as ScheduleParams);

      // Calculate total interest and total payable
      const totalInterestPaise = schedule.reduce((sum, inst) => sum + inst.interestPaise, 0);
      const totalPayablePaise = Number(loan.principal_paise) + totalInterestPaise;

      // Persist schedule installments
      await this.loanRepository.createScheduleInstallments(loanId, schedule);

      // Update loan with total interest and total payable
      await this.loanRepository.updateLoanTotals(loanId, totalInterestPaise, totalPayablePaise);
    }

    await this.loanRepository.createStatusHistory({
      loan_id: loanId,
      from_status: 'under_review',
      to_status: 'approved',
      changed_by: actorId,
    });

    await this.loanRepository.createApproval({
      loan_id: loanId,
      action: 'approved',
      actor_id: actorId,
      remarks: dto.remarks,
    });

    await this.loanRepository.createAuditLog({
      action_type: 'loan_approved',
      actor_id: actorId,
      actor_role: actorRole,
      target_entity: 'loan',
      target_id: loanId,
      before_state: { status: 'under_review' },
      after_state: { status: 'approved', approved_by: actorId },
      remarks: dto.remarks,
    });

    return updated;
  }

  /**
   * Reject a loan under review. Requires a reason.
   */
  async reject(
    loanId: string,
    dto: RejectLoanDto,
    actorId: string,
    actorRole: string,
  ) {
    const loan = await this.loanRepository.findById(loanId);
    if (!loan) {
      throw new NotFoundError(`Loan not found: ${loanId}`);
    }

    this.validateTransition(loan.status, 'rejected');

    const updated = await this.loanRepository.updateStatus(loanId, 'rejected');

    await this.loanRepository.createStatusHistory({
      loan_id: loanId,
      from_status: 'under_review',
      to_status: 'rejected',
      changed_by: actorId,
      reason: dto.reason,
    });

    await this.loanRepository.createApproval({
      loan_id: loanId,
      action: 'rejected',
      actor_id: actorId,
      remarks: dto.reason,
    });

    await this.loanRepository.createAuditLog({
      action_type: 'loan_rejected',
      actor_id: actorId,
      actor_role: actorRole,
      target_entity: 'loan',
      target_id: loanId,
      before_state: { status: 'under_review' },
      after_state: { status: 'rejected' },
      remarks: dto.reason,
    });

    return updated;
  }

  /**
   * Transition a loan to an arbitrary valid status (used by other modules
   * for disbursement, overdue, defaulted, foreclosed, closed transitions).
   */
  async transitionStatus(
    loanId: string,
    toStatus: string,
    actorId: string,
    actorRole: string,
    options?: { reason?: string; metadata?: unknown; extra?: Record<string, unknown> },
  ) {
    const loan = await this.loanRepository.findById(loanId);
    if (!loan) {
      throw new NotFoundError(`Loan not found: ${loanId}`);
    }

    this.validateTransition(loan.status, toStatus);

    const updated = await this.loanRepository.updateStatus(
      loanId,
      toStatus,
      options?.extra,
      loan.version,
    );

    await this.loanRepository.createStatusHistory({
      loan_id: loanId,
      from_status: loan.status,
      to_status: toStatus,
      changed_by: actorId,
      reason: options?.reason,
      metadata: options?.metadata,
    });

    await this.loanRepository.createAuditLog({
      action_type: `loan_${toStatus}` as string,
      actor_id: actorId,
      actor_role: actorRole,
      target_entity: 'loan',
      target_id: loanId,
      before_state: { status: loan.status },
      after_state: { status: toStatus },
      remarks: options?.reason,
    });

    return updated;
  }

  /**
   * Close a fully repaid loan after verifying all prerequisites.
   *
   * Prerequisites (Requirement 10.1):
   * 1. All schedule installments fully paid
   * 2. All penalties settled or explicitly waived
   * 3. No pending reversals
   * 4. Outstanding balance == 0 (or within 1 paisa tolerance)
   *
   * Rejects with typed error listing all unmet prerequisites (Requirement 10.2).
   * Updates loan status to closed and creates audit log (Requirement 10.3).
   * Closed loans cannot be reopened (Requirement 10.4).
   */
  async closeLoan(loanId: string, actorId: string, actorRole: string) {
    const loan = await this.loanRepository.findById(loanId);
    if (!loan) {
      throw new NotFoundError(`Loan not found: ${loanId}`);
    }

    // Validate state transition (only active or overdue can transition to closed)
    this.validateTransition(loan.status, 'closed');

    // Check all closure prerequisites
    const unmetPrerequisites: string[] = [];

    // 1. All installments fully paid
    const unpaidInstallments = await this.loanRepository.getUnpaidInstallments(loanId);
    if (unpaidInstallments.length > 0) {
      const installmentNumbers = unpaidInstallments
        .map((i) => `#${i.installment_number} (${i.status})`)
        .join(', ');
      unmetPrerequisites.push(
        `Unpaid installments: ${installmentNumbers}`,
      );
    }

    // 2. All penalties settled or waived
    const unsettledPenalties = await this.loanRepository.getUnsettledPenalties(loanId);
    if (unsettledPenalties.length > 0) {
      const penaltyDetails = unsettledPenalties
        .map((p) => `${p.penalty_period} (${p.amount_paise} paise)`)
        .join(', ');
      unmetPrerequisites.push(
        `Unsettled penalties: ${penaltyDetails}`,
      );
    }

    // 3. No pending reversals
    const pendingReversals = await this.loanRepository.getPendingReversals(loanId);
    if (pendingReversals.length > 0) {
      unmetPrerequisites.push(
        `Pending reversals: ${pendingReversals.length} reversal(s) in progress`,
      );
    }

    // 4. Outstanding balance == 0 (within 1 paisa tolerance)
    const outstandingBalance = await this.loanRepository.getOutstandingBalance(loanId);
    const outstandingPaise = Number(outstandingBalance ?? 0);
    if (Math.abs(outstandingPaise) > 1) {
      unmetPrerequisites.push(
        `Outstanding balance is ${outstandingPaise} paise (must be 0 or within 1 paisa tolerance)`,
      );
    }

    // Reject if any prerequisites are unmet
    if (unmetPrerequisites.length > 0) {
      throw new BusinessRuleError(
        `Loan closure prerequisites not met: ${unmetPrerequisites.join('; ')}`,
        'CLOSURE_PREREQUISITES_NOT_MET',
      );
    }

    // Update loan status to closed
    const updated = await this.loanRepository.updateStatus(loanId, 'closed');

    // Record status history
    await this.loanRepository.createStatusHistory({
      loan_id: loanId,
      from_status: loan.status,
      to_status: 'closed',
      changed_by: actorId,
    });

    // Record audit log
    await this.loanRepository.createAuditLog({
      action_type: 'loan_closed',
      actor_id: actorId,
      actor_role: actorRole,
      target_entity: 'loan',
      target_id: loanId,
      before_state: { status: loan.status, outstanding_paise: outstandingPaise },
      after_state: { status: 'closed', outstanding_paise: 0 },
    });

    return updated;
  }

  /**
   * Check if loan terms are immutable (post-approval).
   */
  isImmutable(status: string): boolean {
    return IMMUTABLE_AFTER.has(status);
  }

  /**
   * Get a loan by ID with full details.
   */
  async findById(id: string) {
    const loan = await this.loanRepository.findById(id);
    if (!loan) {
      throw new NotFoundError(`Loan not found: ${id}`);
    }
    return loan;
  }

  /**
   * List loans with pagination and filters.
   */
  async findAll(query: LoanQueryDto) {
    return this.loanRepository.findAll({
      skip: query.skip,
      take: query.take,
      status: query.status,
      customerId: query.customerId,
      search: query.search,
    });
  }

  /**
   * Get status transition history for a loan.
   */
  async getStatusHistory(id: string) {
    const loan = await this.loanRepository.findById(id);
    if (!loan) {
      throw new NotFoundError(`Loan not found: ${id}`);
    }
    return this.loanRepository.getStatusHistory(id);
  }
}
