import { Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import { PrismaService } from '../../database/prisma.service';
import { PenaltyRepository } from './penalty.repository';
import { AccountingService } from '../accounting/accounting.service';
import { AuditService } from '../audit/audit.service';
import { LoanService } from '../loan/loan.service';
import { CalculatePenaltyDto } from './dto/calculate-penalty.dto';
import { WaivePenaltyDto } from './dto/waive-penalty.dto';
import { BusinessRuleError, NotFoundError, ConflictError } from '../../common/errors';
import { JournalSourceType } from '@as-finance/shared';

/**
 * Prisma transaction client type.
 */
type TxClient = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

// ─── Pure Functions (exported for property testing) ──────────────────────────

/**
 * Calculate DPD (Days Past Due): calendar days since the earliest unpaid
 * installment due date.
 *
 * @param schedules - Installments ordered by due_date ascending
 * @param referenceDate - The date to calculate DPD against (typically today)
 * @returns DPD value (0 if no overdue installments)
 */
export function calculateDpd(
  schedules: {
    due_date: Date;
    principal_paise: bigint | number;
    interest_paise: bigint | number;
    principal_paid_paise: bigint | number;
    interest_paid_paise: bigint | number;
  }[],
  referenceDate: Date,
): number {
  let earliestUnpaidDate: Date | null = null;

  for (const s of schedules) {
    const principalDue = Number(s.principal_paise);
    const interestDue = Number(s.interest_paise);
    const principalPaid = Number(s.principal_paid_paise);
    const interestPaid = Number(s.interest_paid_paise);

    if (principalPaid < principalDue || interestPaid < interestDue) {
      if (!earliestUnpaidDate || s.due_date < earliestUnpaidDate) {
        earliestUnpaidDate = s.due_date;
      }
    }
  }

  if (!earliestUnpaidDate) {
    return 0;
  }

  // Only count as overdue if the due date is in the past
  const diffMs = referenceDate.getTime() - earliestUnpaidDate.getTime();
  const dpd = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  return dpd;
}

/**
 * Classify DPD into overdue bucket.
 *
 * Bucket classification:
 * - DPD 0 → bucket_0
 * - DPD 1-30 → bucket_1_30
 * - DPD 31-60 → bucket_31_60
 * - DPD 61-90 → bucket_61_90
 * - DPD >90 → bucket_90_plus
 *
 * This function is total (handles all non-negative integers) and deterministic.
 */
export function classifyOverdueBucket(dpd: number): string {
  if (dpd <= 0) return 'bucket_0';
  if (dpd <= 30) return 'bucket_1_30';
  if (dpd <= 60) return 'bucket_31_60';
  if (dpd <= 90) return 'bucket_61_90';
  return 'bucket_90_plus';
}

/**
 * Calculate penalty amount based on product configuration.
 *
 * @param penaltyType - 'flat_per_period' or 'percentage_of_overdue'
 * @param penaltyValue - Paise if flat, basis points if percentage
 * @param overdueAmountPaise - Total overdue amount in paise (used for percentage calculation)
 * @returns Penalty amount in paise (integer, rounded HALF_UP)
 */
export function calculatePenaltyAmount(
  penaltyType: string,
  penaltyValue: number,
  overdueAmountPaise: number,
): number {
  if (penaltyType === 'flat_per_period') {
    // Flat amount per period — penaltyValue is already in paise
    return penaltyValue;
  }

  if (penaltyType === 'percentage_of_overdue') {
    // penaltyValue is in basis points (e.g., 200 = 2%)
    // penalty = overdueAmount × penaltyValue / 10000
    // Rounding: ROUND_HALF_UP to nearest paisa
    const result = new Decimal(overdueAmountPaise)
      .mul(penaltyValue)
      .div(10000)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    return result.toNumber();
  }

  return 0;
}

// ─── Penalty Service ─────────────────────────────────────────────────────────

/**
 * Penalty service — overdue tracking, DPD calculation, penalty posting and waiver.
 *
 * Enforces:
 * - Atomic penalty posting with journal entry (Requirement 8.4)
 * - Duplicate prevention via unique (loan_id, installment_id, penalty_period) (Requirement 8.5)
 * - Maker-checker for penalty waiver (Requirement 8.9)
 * - Loan status transitions: active→overdue, overdue→active (Requirements 8.6, 8.7)
 */
@Injectable()
export class PenaltyService {
  private readonly logger = new Logger(PenaltyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly penaltyRepository: PenaltyRepository,
    private readonly accountingService: AccountingService,
    private readonly auditService: AuditService,
    private readonly loanService: LoanService,
  ) {}

  /**
   * Calculate and post a penalty atomically.
   *
   * Steps within a single transaction:
   * 1. Lock loan row (SELECT ... FOR UPDATE)
   * 2. Validate loan status (active or overdue)
   * 3. Validate installment is overdue past grace period
   * 4. Check for duplicate penalty (loan_id, installment_id, penalty_period)
   * 5. Calculate penalty amount per product configuration
   * 6. Create penalty record
   * 7. Create journal entry (DR Loans Receivable, CR Penalty Income)
   * 8. Update loan outstanding balance, DPD, overdue bucket
   * 9. Handle loan status transitions (active→overdue, overdue→active)
   * 10. Create audit log entry
   */
  async calculateAndPost(dto: CalculatePenaltyDto, actorId: string, actorRole: string) {
    return this.prisma.$transaction(async (tx) => {
      return this.executeCalculateAndPost(tx, dto, actorId, actorRole);
    });
  }

  private async executeCalculateAndPost(
    tx: TxClient,
    dto: CalculatePenaltyDto,
    actorId: string,
    actorRole: string,
  ) {
    // Step 1: Lock loan row
    const lockedLoan = await this.penaltyRepository.lockLoanForUpdate(dto.loanId, tx);
    if (!lockedLoan) {
      throw new NotFoundError(`Loan not found: ${dto.loanId}`);
    }

    // Step 2: Validate loan status
    if (lockedLoan.status !== 'active' && lockedLoan.status !== 'overdue') {
      throw new BusinessRuleError(
        `Cannot post penalty for loan in '${lockedLoan.status}' status. Loan must be active or overdue.`,
        'INVALID_LOAN_STATUS_FOR_PENALTY',
      );
    }

    // Fetch full loan details within transaction
    const loan = await this.penaltyRepository.getLoanForPenalty(dto.loanId, tx);
    if (!loan) {
      throw new NotFoundError(`Loan not found: ${dto.loanId}`);
    }

    // Step 3: Validate installment exists and is overdue
    const installment = loan.schedules.find((s) => s.id === dto.installmentId);
    if (!installment) {
      throw new NotFoundError(`Installment not found: ${dto.installmentId}`);
    }

    const referenceDate = dto.referenceDate ? new Date(dto.referenceDate) : new Date();
    const diffMs = referenceDate.getTime() - installment.due_date.getTime();
    const daysPastDue = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

    const graceDays = loan.product_version.penalty_grace_days ?? 0;
    if (daysPastDue <= graceDays) {
      throw new BusinessRuleError(
        `Installment is within grace period (${daysPastDue} days past due, grace: ${graceDays} days)`,
        'WITHIN_GRACE_PERIOD',
      );
    }

    // Verify installment is actually unpaid
    const principalDue = Number(installment.principal_paise);
    const interestDue = Number(installment.interest_paise);
    const principalPaid = Number(installment.principal_paid_paise);
    const interestPaid = Number(installment.interest_paid_paise);
    if (principalPaid >= principalDue && interestPaid >= interestDue) {
      throw new BusinessRuleError(
        'Cannot post penalty for a fully paid installment',
        'INSTALLMENT_FULLY_PAID',
      );
    }

    // Step 4: Check for duplicate penalty
    const exists = await this.penaltyRepository.penaltyExists(
      dto.loanId,
      dto.installmentId,
      dto.penaltyPeriod,
      tx,
    );
    if (exists) {
      throw new ConflictError(
        `Penalty already exists for loan ${dto.loanId}, installment ${dto.installmentId}, period ${dto.penaltyPeriod}`,
      );
    }

    // Step 5: Calculate penalty amount
    const penaltyType = loan.product_version.penalty_type;
    const penaltyValue = loan.product_version.penalty_value;
    if (!penaltyType || penaltyValue == null) {
      throw new BusinessRuleError(
        'Loan product does not have penalty configuration',
        'PENALTY_NOT_CONFIGURED',
      );
    }

    // Overdue amount = unpaid principal + unpaid interest for this installment
    const overdueAmountPaise = (principalDue - principalPaid) + (interestDue - interestPaid);
    const penaltyAmountPaise = calculatePenaltyAmount(penaltyType, penaltyValue, overdueAmountPaise);

    if (penaltyAmountPaise <= 0) {
      throw new BusinessRuleError(
        'Calculated penalty amount is zero or negative',
        'ZERO_PENALTY_AMOUNT',
      );
    }

    // Step 6 & 7: Look up accounts and create journal entry
    const loansReceivableAccount = await this.penaltyRepository.findAccountByCode('1100', tx);
    const penaltyIncomeAccount = await this.penaltyRepository.findAccountByCode('4003', tx);

    if (!loansReceivableAccount || !penaltyIncomeAccount) {
      throw new BusinessRuleError(
        'Required chart of accounts entries not found (Loans Receivable 1100 or Penalty Income 4003)',
        'ACCOUNTS_NOT_CONFIGURED',
      );
    }

    const journalEntry = await this.accountingService.createJournalEntry(
      {
        date: referenceDate.toISOString(),
        description: `Penalty for loan ${loan.loan_number}, installment #${installment.installment_number}, period ${dto.penaltyPeriod}`,
        sourceType: JournalSourceType.PENALTY,
        sourceId: dto.loanId,
        createdBy: actorId,
        lines: [
          {
            accountId: loansReceivableAccount.id,
            debitPaise: penaltyAmountPaise,
            creditPaise: 0,
          },
          {
            accountId: penaltyIncomeAccount.id,
            debitPaise: 0,
            creditPaise: penaltyAmountPaise,
          },
        ],
      },
      tx,
    );

    // Step 6: Create penalty record
    const penalty = await this.penaltyRepository.createPenalty(
      {
        loan_id: dto.loanId,
        installment_id: dto.installmentId,
        amount_paise: penaltyAmountPaise,
        penalty_period: dto.penaltyPeriod,
        calculation_details: {
          penalty_type: penaltyType,
          penalty_value: penaltyValue,
          overdue_amount_paise: overdueAmountPaise,
          days_past_due: daysPastDue,
          grace_days: graceDays,
        },
        journal_entry_id: journalEntry.id,
      },
      tx,
    );

    // Step 8: Update outstanding balance
    const currentOutstanding = Number(loan.cached_outstanding_paise ?? 0);
    const newOutstanding = currentOutstanding + penaltyAmountPaise;

    // Recalculate DPD and bucket
    const dpd = calculateDpd(loan.schedules, referenceDate);
    const overdueBucket = classifyOverdueBucket(dpd);

    await this.penaltyRepository.updateLoanOutstanding(
      dto.loanId,
      {
        cached_outstanding_paise: newOutstanding,
        dpd,
        overdue_bucket: overdueBucket,
      },
      tx,
    );

    // Step 9: Handle loan status transitions
    await this.handleStatusTransition(tx, dto.loanId, loan.status, dpd, actorId, actorRole);

    // Step 10: Create audit log
    await this.auditService.createAuditLog(
      {
        action_type: 'penalty_posted',
        actor_id: actorId,
        actor_role: actorRole,
        target_entity: 'penalty',
        target_id: penalty.id,
        after_state: {
          loan_id: dto.loanId,
          installment_id: dto.installmentId,
          penalty_period: dto.penaltyPeriod,
          amount_paise: penaltyAmountPaise,
          dpd,
          overdue_bucket: overdueBucket,
        },
      },
      tx,
    );

    this.logger.log({
      msg: 'Penalty posted',
      penaltyId: penalty.id,
      loanId: dto.loanId,
      installmentId: dto.installmentId,
      amountPaise: penaltyAmountPaise,
      dpd,
    });

    return {
      penalty,
      journalEntry,
      dpd,
      overdueBucket,
      newOutstandingPaise: newOutstanding,
    };
  }

  /**
   * Waive a penalty with maker-checker enforcement.
   *
   * Steps within a single transaction:
   * 1. Validate penalty exists and is not already waived/paid
   * 2. Enforce maker-checker: waiver requester ≠ approver
   * 3. Mark penalty as waived (not deleted)
   * 4. Update loan outstanding balance
   * 5. Recalculate DPD and overdue bucket
   * 6. Handle loan status transitions
   * 7. Create audit log with waiver details
   */
  async waivePenalty(penaltyId: string, dto: WaivePenaltyDto, actorId: string, actorRole: string) {
    return this.prisma.$transaction(async (tx) => {
      return this.executeWaivePenalty(tx, penaltyId, dto, actorId, actorRole);
    });
  }

  private async executeWaivePenalty(
    tx: TxClient,
    penaltyId: string,
    dto: WaivePenaltyDto,
    actorId: string,
    actorRole: string,
  ) {
    // Step 1: Validate penalty exists
    const penalty = await this.penaltyRepository.findByIdTx(penaltyId, tx);
    if (!penalty) {
      throw new NotFoundError(`Penalty not found: ${penaltyId}`);
    }

    if (penalty.is_waived) {
      throw new BusinessRuleError(
        'Penalty has already been waived',
        'PENALTY_ALREADY_WAIVED',
      );
    }

    if (penalty.is_paid) {
      throw new BusinessRuleError(
        'Cannot waive a penalty that has already been paid',
        'PENALTY_ALREADY_PAID',
      );
    }

    // Step 2: Maker-checker enforcement
    if (actorId === dto.approverId) {
      throw new BusinessRuleError(
        'Maker-checker violation: waiver requester and approver must be different users',
        'MAKER_CHECKER_VIOLATION',
      );
    }

    // Lock loan row
    const lockedLoan = await this.penaltyRepository.lockLoanForUpdate(penalty.loan_id, tx);
    if (!lockedLoan) {
      throw new NotFoundError(`Loan not found: ${penalty.loan_id}`);
    }

    // Step 3: Mark penalty as waived
    const waivedPenalty = await this.penaltyRepository.waivePenalty(
      penaltyId,
      {
        waived_by: actorId,
        waiver_approved_by: dto.approverId,
        waived_reason: dto.reason,
      },
      tx,
    );

    // Step 4: Update outstanding balance
    const penaltyAmount = Number(penalty.amount_paise);
    const currentOutstanding = Number(lockedLoan.cached_outstanding_paise ?? 0);
    const newOutstanding = Math.max(0, currentOutstanding - penaltyAmount);

    // Step 5: Recalculate DPD and bucket
    const loan = await this.penaltyRepository.getLoanForPenalty(penalty.loan_id, tx);
    if (!loan) {
      throw new NotFoundError(`Loan not found: ${penalty.loan_id}`);
    }

    const now = new Date();
    const dpd = calculateDpd(loan.schedules, now);
    const overdueBucket = classifyOverdueBucket(dpd);

    await this.penaltyRepository.updateLoanOutstanding(
      penalty.loan_id,
      {
        cached_outstanding_paise: newOutstanding,
        dpd,
        overdue_bucket: overdueBucket,
      },
      tx,
    );

    // Step 6: Handle loan status transitions
    await this.handleStatusTransition(tx, penalty.loan_id, loan.status, dpd, actorId, actorRole);

    // Step 7: Create audit log
    await this.auditService.createAuditLog(
      {
        action_type: 'penalty_waived',
        actor_id: actorId,
        actor_role: actorRole,
        target_entity: 'penalty',
        target_id: penaltyId,
        before_state: {
          is_waived: false,
          amount_paise: penaltyAmount,
        },
        after_state: {
          is_waived: true,
          waived_by: actorId,
          waiver_approved_by: dto.approverId,
          waived_reason: dto.reason,
        },
      },
      tx,
    );

    this.logger.log({
      msg: 'Penalty waived',
      penaltyId,
      loanId: penalty.loan_id,
      amountPaise: penaltyAmount,
      reason: dto.reason,
    });

    return {
      penalty: waivedPenalty,
      dpd,
      overdueBucket,
      newOutstandingPaise: newOutstanding,
    };
  }

  /**
   * Get all penalties for a loan.
   */
  async findByLoanId(loanId: string) {
    return this.penaltyRepository.findByLoanId(loanId);
  }

  /**
   * Get a penalty by ID.
   */
  async findById(penaltyId: string) {
    const penalty = await this.penaltyRepository.findById(penaltyId);
    if (!penalty) {
      throw new NotFoundError(`Penalty not found: ${penaltyId}`);
    }
    return penalty;
  }

  /**
   * Get DPD and overdue bucket for a loan (read-only, no transaction).
   */
  async getLoanDpdInfo(loanId: string) {
    const loan = await this.penaltyRepository.getLoanById(loanId);
    if (!loan) {
      throw new NotFoundError(`Loan not found: ${loanId}`);
    }

    const now = new Date();
    const dpd = calculateDpd(loan.schedules, now);
    const overdueBucket = classifyOverdueBucket(dpd);

    return { dpd, overdueBucket, loanStatus: loan.status };
  }

  /**
   * Handle loan status transitions based on DPD:
   * - active → overdue when DPD > 0 (installment past due)
   * - overdue → active when DPD returns to 0
   */
  private async handleStatusTransition(
    tx: TxClient,
    loanId: string,
    currentStatus: string,
    dpd: number,
    actorId: string,
    actorRole: string,
  ) {
    if (currentStatus === 'active' && dpd > 0) {
      // Transition active → overdue
      await this.penaltyRepository.updateLoanStatus(loanId, 'overdue', tx);
      await this.penaltyRepository.createStatusHistory(
        {
          loan_id: loanId,
          from_status: 'active',
          to_status: 'overdue',
          changed_by: actorId,
          metadata: { dpd },
        },
        tx,
      );

      await this.auditService.createAuditLog(
        {
          action_type: 'loan_overdue',
          actor_id: actorId,
          actor_role: actorRole,
          target_entity: 'loan',
          target_id: loanId,
          before_state: { status: 'active' },
          after_state: { status: 'overdue', dpd },
        },
        tx,
      );
    } else if (currentStatus === 'overdue' && dpd === 0) {
      // Transition overdue → active
      await this.penaltyRepository.updateLoanStatus(loanId, 'active', tx);
      await this.penaltyRepository.createStatusHistory(
        {
          loan_id: loanId,
          from_status: 'overdue',
          to_status: 'active',
          changed_by: actorId,
          reason: 'All overdue installments paid, DPD returned to 0',
        },
        tx,
      );

      await this.auditService.createAuditLog(
        {
          action_type: 'loan_active',
          actor_id: actorId,
          actor_role: actorRole,
          target_entity: 'loan',
          target_id: loanId,
          before_state: { status: 'overdue' },
          after_state: { status: 'active', dpd: 0 },
        },
        tx,
      );
    }
  }
}
