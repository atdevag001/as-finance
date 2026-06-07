import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { LoanRepository } from './loan.repository';
import { CreateLoanDto } from './dto/create-loan.dto';
import { ApproveLoanDto } from './dto/approve-loan.dto';
import { RejectLoanDto } from './dto/reject-loan.dto';
import { LoanQueryDto } from './dto/loan-query.dto';
import { BusinessRuleError, NotFoundError } from '../../common/errors';
import { canBypassMakerChecker } from '../../common/constants/maker-checker';
import { generateSchedule, type ScheduleParams } from '../schedule/schedule.service';
import { addMonthsClamped, parseDateIST, todayISTDate } from '../../common/utils/date.util';
import { UNRESTRICTED_ROLES } from '../../common/constants/roles';
import { SettingsService } from '../settings/settings.service';

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

// Use shared UNRESTRICTED_ROLES — single source of truth across services
const UNRESTRICTED_LOAN_ROLES = UNRESTRICTED_ROLES;

@Injectable()
export class LoanService {
  constructor(
    private readonly loanRepository: LoanRepository,
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  /**
   * Enforce per-officer scope on mutation paths so restricted roles
   * (e.g. field_officer) cannot act on loans assigned to other officers.
   * Customers with no assigned officer are unscoped — any role may act.
   */
  private assertScope(
    customer: { assigned_officer_id?: string | null } | null | undefined,
    actorId: string | undefined,
    actorRole: string | undefined,
  ): void {
    const assigned = customer?.assigned_officer_id;
    if (
      actorId &&
      actorRole &&
      !UNRESTRICTED_LOAN_ROLES.includes(actorRole) &&
      assigned != null &&
      assigned !== actorId
    ) {
      throw new BusinessRuleError(
        'You can only act on loans for customers assigned to you',
        'SCOPE_VIOLATION',
      );
    }
  }

  /**
   * Fetch the configured holidays as IST-midnight Date objects for
   * passing into the schedule generator.
   */
  private async getHolidaysForSchedule(): Promise<Date[]> {
    const holidayStrings = await this.settingsService.getHolidays();
    return holidayStrings.map((s) => parseDateIST(s));
  }

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
    // Restricted roles may only create loans for their own assigned customers.
    this.assertScope(customer, actorId, actorRole);
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
    // Restricted roles may only act on loans for customers assigned to them.
    this.assertScope(loan.customer, actorId, actorRole);

    this.validateTransition(loan.status, 'submitted');

    // Re-validate at submission time
    const customer = await this.loanRepository.getCustomerStatus(loan.customer_id);
    if (customer?.status === 'blacklisted') {
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

    // Wrap status + history + approval + audit writes in one transaction so a
    // partial failure cannot leave a 'submitted' loan without an audit trail.
    return this.prisma.$transaction(async (tx) => {
      const updated = await this.loanRepository.updateStatus(
        loanId,
        'submitted',
        undefined,
        loan.version,
        tx,
      );

      await this.loanRepository.createStatusHistory(
        {
          loan_id: loanId,
          from_status: 'draft',
          to_status: 'submitted',
          changed_by: actorId,
        },
        tx,
      );

      await this.loanRepository.createApproval(
        {
          loan_id: loanId,
          action: 'submitted',
          actor_id: actorId,
        },
        tx,
      );

      await this.loanRepository.createAuditLog(
        {
          action_type: 'loan_submitted',
          actor_id: actorId,
          actor_role: actorRole,
          target_entity: 'loan',
          target_id: loanId,
          before_state: { status: 'draft' },
          after_state: { status: 'submitted' },
        },
        tx,
      );

      return updated;
    });
  }

  /**
   * Move a submitted loan to under_review status.
   */
  async review(loanId: string, actorId: string, actorRole: string) {
    const loan = await this.loanRepository.findById(loanId);
    if (!loan) {
      throw new NotFoundError(`Loan not found: ${loanId}`);
    }
    // Restricted roles may only act on loans for customers assigned to them.
    this.assertScope(loan.customer, actorId, actorRole);

    this.validateTransition(loan.status, 'under_review');

    // Wrap status + history + approval + audit writes in one transaction so a
    // partial failure cannot leave an 'under_review' loan without an audit trail.
    return this.prisma.$transaction(async (tx) => {
      const updated = await this.loanRepository.updateStatus(
        loanId,
        'under_review',
        undefined,
        loan.version,
        tx,
      );

      await this.loanRepository.createStatusHistory(
        {
          loan_id: loanId,
          from_status: 'submitted',
          to_status: 'under_review',
          changed_by: actorId,
        },
        tx,
      );

      await this.loanRepository.createApproval(
        {
          loan_id: loanId,
          action: 'under_review',
          actor_id: actorId,
        },
        tx,
      );

      await this.loanRepository.createAuditLog(
        {
          action_type: 'loan_reviewed',
          actor_id: actorId,
          actor_role: actorRole,
          target_entity: 'loan',
          target_id: loanId,
          before_state: { status: 'submitted' },
          after_state: { status: 'under_review' },
        },
        tx,
      );

      return updated;
    });
  }

  /**
   * Approve a loan under review.
   *
   * All six writes (status update, schedule installments, loan totals,
   * status_history, approval, audit log) are wrapped in a single
   * prisma.$transaction so a mid-flight failure leaves no partial state
   * (e.g. an "approved" loan with no schedule).
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
    // Restricted roles may only act on loans for customers assigned to them.
    this.assertScope(loan.customer, actorId, actorRole);

    this.validateTransition(loan.status, 'approved');

    // Maker-checker enforcement (bypass for allowed roles)
    if (loan.created_by === actorId && !canBypassMakerChecker(actorRole)) {
      throw new BusinessRuleError(
        'Maker-checker violation: approver cannot be the same user who created the loan',
        'MAKER_CHECKER_VIOLATION',
      );
    }

    // Reject past firstEmiDate so the schedule cannot be born instantly overdue.
    if (dto.firstEmiDate) {
      const firstEmiIST = parseDateIST(dto.firstEmiDate);
      if (firstEmiIST <= todayISTDate()) {
        throw new BusinessRuleError(
          'First EMI date must be in the future',
          'FIRST_EMI_DATE_NOT_FUTURE',
        );
      }
    }

    // Pre-compute the schedule outside the transaction (pure function,
    // no IO) so the tx body stays as small as possible.
    let schedule: ReturnType<typeof generateSchedule> | null = null;
    let totalInterestPaise = 0;
    let totalPayablePaise = 0;
    if (loan.product_version) {
      const pv = loan.product_version;
      let scheduleStartDate = new Date();
      if (dto.firstEmiDate) {
        // Use UTC-midnight parse for schedule math — addMonthsClamped's local-TZ
        // getters would otherwise read parseDateIST's prev-UTC-day instant as the
        // wrong calendar day on UTC hosts. Same pattern as disbursement.service.
        const firstEmi = new Date(dto.firstEmiDate);
        scheduleStartDate = this.calculateStartDateFromFirstEmi(firstEmi, pv.repayment_frequency);
      }

      // Honour configured bank holidays so EMI due dates never land on them.
      const holidays = await this.getHolidaysForSchedule();

      schedule = generateSchedule({
        principalPaise: Number(loan.principal_paise),
        annualRateBps: pv.annual_rate_bps,
        tenureMonths: loan.tenure_months,
        interestType: pv.interest_type,
        frequency: pv.repayment_frequency,
        startDate: scheduleStartDate,
        holidays,
      } as ScheduleParams);

      totalInterestPaise = schedule.reduce((sum, inst) => sum + inst.interestPaise, 0);
      totalPayablePaise = Number(loan.principal_paise) + totalInterestPaise;
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await this.loanRepository.updateStatus(
        loanId,
        'approved',
        { approved_by: actorId },
        loan.version,
        tx,
      );

      // Persist the EMI schedule and totals inside the same tx so an
      // approved loan can never end up without a schedule.
      if (schedule) {
        await this.loanRepository.createScheduleInstallments(loanId, schedule, tx);
        await this.loanRepository.updateLoanTotals(
          loanId,
          totalInterestPaise,
          totalPayablePaise,
          tx,
        );
      }

      await this.loanRepository.createStatusHistory(
        {
          loan_id: loanId,
          from_status: 'under_review',
          to_status: 'approved',
          changed_by: actorId,
        },
        tx,
      );

      await this.loanRepository.createApproval(
        {
          loan_id: loanId,
          action: 'approved',
          actor_id: actorId,
          remarks: dto.remarks,
        },
        tx,
      );

      await this.loanRepository.createAuditLog(
        {
          action_type: 'loan_approved',
          actor_id: actorId,
          actor_role: actorRole,
          target_entity: 'loan',
          target_id: loanId,
          before_state: { status: 'under_review' },
          after_state: { status: 'approved', approved_by: actorId },
          remarks: dto.remarks,
        },
        tx,
      );

      return updated;
    });
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
    // Restricted roles may only act on loans for customers assigned to them.
    this.assertScope(loan.customer, actorId, actorRole);

    this.validateTransition(loan.status, 'rejected');

    // Wrap status + history + approval + audit writes in one transaction so a
    // partial failure cannot leave a 'rejected' loan without an audit trail.
    return this.prisma.$transaction(async (tx) => {
      const updated = await this.loanRepository.updateStatus(
        loanId,
        'rejected',
        undefined,
        loan.version,
        tx,
      );

      await this.loanRepository.createStatusHistory(
        {
          loan_id: loanId,
          from_status: 'under_review',
          to_status: 'rejected',
          changed_by: actorId,
          reason: dto.reason,
        },
        tx,
      );

      await this.loanRepository.createApproval(
        {
          loan_id: loanId,
          action: 'rejected',
          actor_id: actorId,
          remarks: dto.reason,
        },
        tx,
      );

      await this.loanRepository.createAuditLog(
        {
          action_type: 'loan_rejected',
          actor_id: actorId,
          actor_role: actorRole,
          target_entity: 'loan',
          target_id: loanId,
          before_state: { status: 'under_review' },
          after_state: { status: 'rejected' },
          remarks: dto.reason,
        },
        tx,
      );

      return updated;
    });
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
      action_type: `loan_${toStatus}`,
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
    // Restricted roles may only act on loans for customers assigned to them.
    this.assertScope(loan.customer, actorId, actorRole);

    // Validate state transition (only active or overdue can transition to closed)
    this.validateTransition(loan.status, 'closed');

    // Wrap row lock + re-checked prerequisites + writes in a single tx so a
    // concurrent penalty/collection mutation cannot slip in between checks and
    // close. Other modules update the loan row without bumping `version`, so a
    // FOR UPDATE lock — not optimistic locking alone — is required for safety.
    return this.prisma.$transaction(async (tx) => {
      const locked = await this.loanRepository.lockLoanForUpdate(loanId, tx);
      if (!locked) {
        throw new NotFoundError(`Loan not found: ${loanId}`);
      }

      // Re-check all closure prerequisites under the row lock.
      const unmetPrerequisites: string[] = [];

      const unpaidInstallments = await this.loanRepository.getUnpaidInstallments(loanId, tx);
      if (unpaidInstallments.length > 0) {
        const installmentNumbers = unpaidInstallments
          .map((i) => `#${i.installment_number} (${i.status})`)
          .join(', ');
        unmetPrerequisites.push(`Unpaid installments: ${installmentNumbers}`);
      }

      const unsettledPenalties = await this.loanRepository.getUnsettledPenalties(loanId, tx);
      if (unsettledPenalties.length > 0) {
        const penaltyDetails = unsettledPenalties
          .map((p) => `${p.penalty_period} (${p.amount_paise} paise)`)
          .join(', ');
        unmetPrerequisites.push(`Unsettled penalties: ${penaltyDetails}`);
      }

      const pendingReversals = await this.loanRepository.getPendingReversals(loanId, tx);
      if (pendingReversals.length > 0) {
        unmetPrerequisites.push(
          `Pending reversals: ${pendingReversals.length} reversal(s) in progress`,
        );
      }

      const outstandingBalance = await this.loanRepository.getOutstandingBalance(loanId, tx);
      const outstandingPaise = Number(outstandingBalance ?? 0);
      if (Math.abs(outstandingPaise) > 1) {
        unmetPrerequisites.push(
          `Outstanding balance is ${outstandingPaise} paise (must be 0 or within 1 paisa tolerance)`,
        );
      }

      if (unmetPrerequisites.length > 0) {
        throw new BusinessRuleError(
          `Loan closure prerequisites not met: ${unmetPrerequisites.join('; ')}`,
          'CLOSURE_PREREQUISITES_NOT_MET',
        );
      }

      const updated = await this.loanRepository.updateStatus(
        loanId,
        'closed',
        undefined,
        locked.version,
        tx,
      );

      await this.loanRepository.createStatusHistory(
        {
          loan_id: loanId,
          from_status: loan.status,
          to_status: 'closed',
          changed_by: actorId,
        },
        tx,
      );

      await this.loanRepository.createAuditLog(
        {
          action_type: 'loan_closed',
          actor_id: actorId,
          actor_role: actorRole,
          target_entity: 'loan',
          target_id: loanId,
          before_state: { status: loan.status, outstanding_paise: outstandingPaise },
          after_state: { status: 'closed', outstanding_paise: 0 },
        },
        tx,
      );

      return updated;
    });
  }

  /**
   * Check if loan terms are immutable (post-approval).
   */
  isImmutable(status: string): boolean {
    return IMMUTABLE_AFTER.has(status);
  }

  /**
   * Get a loan by ID with full details.
   * Enforces per-customer scope: restricted roles (field_officer) must be the
   * customer's assigned officer.
   */
  async findById(id: string, actorId?: string, actorRole?: string) {
    const loan = await this.loanRepository.findById(id);
    if (!loan) {
      throw new NotFoundError(`Loan not found: ${id}`);
    }
    if (
      actorId &&
      actorRole &&
      !UNRESTRICTED_LOAN_ROLES.includes(actorRole) &&
      loan.customer?.assigned_officer_id !== actorId
    ) {
      throw new BusinessRuleError(
        'You can only access loans for customers assigned to you',
        'SCOPE_VIOLATION',
      );
    }
    return loan;
  }

  /**
   * List loans with pagination and filters.
   * Restricted roles (field_officer) get scoped to their assigned customers.
   */
  async findAll(query: LoanQueryDto, actorId?: string, actorRole?: string) {
    const scopedToOfficer =
      actorId && actorRole && !UNRESTRICTED_LOAN_ROLES.includes(actorRole)
        ? actorId
        : undefined;
    return this.loanRepository.findAll({
      skip: query.skip,
      take: query.take,
      status: query.status,
      customerId: query.customerId,
      search: query.search,
      aadhaarLastFour: query.aadhaarLastFour,
      assignedOfficerId: scopedToOfficer,
    });
  }

  /**
   * Get status transition history for a loan.
   * Enforces per-officer scope so restricted roles cannot read audit trails
   * for customers they are not assigned to.
   */
  async getStatusHistory(id: string, actorId?: string, actorRole?: string) {
    await this.findById(id, actorId, actorRole);
    return this.loanRepository.getStatusHistory(id);
  }

  /**
   * Calculate the schedule start date from a desired first EMI date.
   * The schedule generator adds 1 frequency period to startDate for the first EMI,
   * so we need to subtract 1 period from the desired first EMI date.
   */
  private calculateStartDateFromFirstEmi(firstEmiDate: Date, frequency: string): Date {
    switch (frequency) {
      case 'monthly':
        return addMonthsClamped(firstEmiDate, -1);
      case 'weekly': {
        const startDate = new Date(firstEmiDate);
        startDate.setDate(startDate.getDate() - 7);
        return startDate;
      }
      case 'daily': {
        const startDate = new Date(firstEmiDate);
        startDate.setDate(startDate.getDate() - 1);
        return startDate;
      }
      default:
        return new Date(firstEmiDate);
    }
  }

  /**
   * Regenerate the EMI schedule with a new first EMI date.
   *
   * Constraints:
   * - Loan must be in approved or active status
   * - No payments must have been collected yet
   * - First EMI date must be in the future
   * - If loan is disbursed, first EMI date must be after disbursement date
   */
  async regenerateSchedule(
    loanId: string,
    firstEmiDate: string,
    actorId: string,
    actorRole: string,
  ) {
    const loan = await this.loanRepository.findById(loanId);
    if (!loan) {
      throw new NotFoundError(`Loan not found: ${loanId}`);
    }
    // Restricted roles may only act on loans for customers assigned to them.
    this.assertScope(loan.customer, actorId, actorRole);

    // Validate loan status - only approved or active loans can have schedule regenerated
    if (!['approved', 'active'].includes(loan.status)) {
      throw new BusinessRuleError(
        `Schedule can only be regenerated for approved or active loans. Current status: ${loan.status}`,
        'INVALID_LOAN_STATUS_FOR_REGENERATION',
      );
    }

    // Check if any payments have been collected
    const hasCollections = await this.loanRepository.hasCollections(loanId);
    if (hasCollections) {
      throw new BusinessRuleError(
        'Cannot regenerate schedule after payments have been collected',
        'COLLECTIONS_EXIST',
      );
    }

    // Validate first EMI date is in the future — anchor both sides to IST midnight
    // so the check matches the IST business calendar used by penalty/disbursement.
    const firstEmiIST = parseDateIST(firstEmiDate);
    if (firstEmiIST <= todayISTDate()) {
      throw new BusinessRuleError(
        'First EMI date must be in the future',
        'FIRST_EMI_DATE_NOT_FUTURE',
      );
    }

    // If loan is disbursed, first EMI date must be after disbursement date.
    // disbursement_date is a @db.Date column — read its YYYY-MM-DD slice and
    // re-parse via parseDateIST so the comparison stays in IST.
    if (loan.disbursement_date) {
      const disbDateStr = loan.disbursement_date.toISOString().split('T')[0]!;
      const disbursementDateIST = parseDateIST(disbDateStr);
      if (firstEmiIST <= disbursementDateIST) {
        throw new BusinessRuleError(
          'First EMI date must be after disbursement date',
          'FIRST_EMI_DATE_BEFORE_DISBURSEMENT',
        );
      }
    }

    // Get product version for schedule generation
    if (!loan.product_version) {
      throw new BusinessRuleError(
        'Loan product version not found',
        'PRODUCT_VERSION_NOT_FOUND',
      );
    }

    const pv = loan.product_version;

    // Use UTC-midnight parse for schedule math — addMonthsClamped's local-TZ
    // getters would otherwise read parseDateIST's prev-UTC-day instant as the
    // wrong calendar day on UTC hosts. Same pattern as disbursement.service.
    const firstEmiCalendar = new Date(firstEmiDate);
    const scheduleStartDate = this.calculateStartDateFromFirstEmi(firstEmiCalendar, pv.repayment_frequency);

    // Honour configured bank holidays so regenerated EMI due dates skip them.
    const holidays = await this.getHolidaysForSchedule();

    // Generate new schedule
    const schedule = generateSchedule({
      principalPaise: Number(loan.principal_paise),
      annualRateBps: pv.annual_rate_bps,
      tenureMonths: loan.tenure_months,
      interestType: pv.interest_type,
      frequency: pv.repayment_frequency,
      startDate: scheduleStartDate,
      holidays,
    } as ScheduleParams);

    // Calculate new totals
    const totalInterestPaise = schedule.reduce((sum, inst) => sum + inst.interestPaise, 0);
    const totalPayablePaise = Number(loan.principal_paise) + totalInterestPaise;

    // Get old schedule for audit
    const oldSchedule = loan.schedules || [];
    const oldFirstDueDate = oldSchedule.length > 0 ? oldSchedule[0]?.due_date : null;

    // Delete old schedule, create new one, and update loan totals atomically.
    // A mid-flight failure here previously left a loan with no schedule.
    const firstDueDate = schedule[0]?.dueDate;
    const lastDueDate = schedule[schedule.length - 1]?.dueDate;

    await this.prisma.$transaction(async (tx) => {
      const locked = await this.loanRepository.lockLoanForUpdate(loanId, tx);
      if (!locked) {
        throw new NotFoundError(`Loan not found: ${loanId}`);
      }

      // Re-validate invariants under the FOR UPDATE lock — a concurrent
      // disburse/foreclose/close could have flipped status or stamped a
      // disbursement_date between the initial read and the lock. Without these
      // re-checks the FOR UPDATE lock only serializes the write, not the read.
      if (!['approved', 'active'].includes(locked.status)) {
        throw new BusinessRuleError(
          `Schedule can only be regenerated for approved or active loans. Current status: ${locked.status}`,
          'INVALID_LOAN_STATUS_FOR_REGENERATION',
        );
      }
      if (locked.version !== loan.version) {
        throw new BusinessRuleError(
          'Loan was modified concurrently — please retry',
          'LOAN_CONCURRENTLY_MODIFIED',
        );
      }
      // Re-fetch disbursement_date under lock — it may have been set since the
      // pre-lock read by a concurrent disbursement.
      const fresh = await tx.loans.findUnique({
        where: { id: loanId },
        select: { disbursement_date: true },
      });
      if (fresh?.disbursement_date) {
        const disbDateStr = fresh.disbursement_date.toISOString().split('T')[0]!;
        const disbursementDateIST = parseDateIST(disbDateStr);
        if (firstEmiIST <= disbursementDateIST) {
          throw new BusinessRuleError(
            'First EMI date must be after disbursement date',
            'FIRST_EMI_DATE_BEFORE_DISBURSEMENT',
          );
        }
      }

      // Re-check that no collections appeared while we were computing the new schedule
      const collectionsCount = await tx.collections.count({
        where: { loan_id: loanId, status: 'posted' as never },
      });
      if (collectionsCount > 0) {
        throw new BusinessRuleError(
          'Cannot regenerate schedule after payments have been collected',
          'COLLECTIONS_EXIST',
        );
      }

      // Pre-check: collection_allocations link to installment_id via FK. Even
      // reversed collections leave allocation rows. Deleting schedules without
      // deleting allocations first would FK-violate. Friendly error if any
      // exist (should be empty given the collections check above, but defensive).
      const allocationCount = await tx.collection_allocations.count({
        where: { installment: { loan_id: loanId } },
      });
      if (allocationCount > 0) {
        throw new BusinessRuleError(
          `Cannot regenerate schedule: ${allocationCount} historical collection allocation(s) still reference this loan's installments`,
          'ALLOCATIONS_EXIST',
        );
      }

      await tx.loan_schedules.deleteMany({ where: { loan_id: loanId } });
      if (schedule.length > 0) {
        await tx.loan_schedules.createMany({
          data: schedule.map((inst) => ({
            loan_id: loanId,
            installment_number: inst.installmentNumber,
            due_date: inst.dueDate,
            principal_paise: inst.principalPaise,
            interest_paise: inst.interestPaise,
            total_paise: inst.totalPaise,
            principal_paid_paise: 0n,
            interest_paid_paise: 0n,
            penalty_paid_paise: 0n,
            status: 'pending' as never,
          })),
        });
      }

      await tx.loans.update({
        where: { id: loanId },
        data: {
          first_due_date: firstDueDate,
          last_due_date: lastDueDate,
          total_interest_paise: totalInterestPaise,
          total_payable_paise: totalPayablePaise,
          version: { increment: 1 },
        },
      });

      // Audit log MUST commit/roll back with the schedule write — keep inside tx
      // so a transient DB error cannot leave the financial change unaudited.
      await this.loanRepository.createAuditLog(
        {
          action_type: 'loan_schedule_regenerated',
          actor_id: actorId,
          actor_role: actorRole,
          target_entity: 'loan',
          target_id: loanId,
          before_state: {
            first_due_date: oldFirstDueDate?.toISOString(),
            schedule_count: oldSchedule.length,
          },
          after_state: {
            first_due_date: firstDueDate?.toISOString(),
            schedule_count: schedule.length,
            regenerated: true,
          },
          remarks: `Schedule regenerated with new first EMI date: ${firstEmiDate}`,
        },
        tx,
      );
    });

    return {
      loanId,
      firstEmiDate: firstDueDate?.toISOString().split('T')[0],
      lastEmiDate: lastDueDate?.toISOString().split('T')[0],
      numberOfInstallments: schedule.length,
      totalInterestPaise,
      totalPayablePaise,
    };
  }
}
