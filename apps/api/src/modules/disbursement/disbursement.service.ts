import { Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import { JournalSourceType, InterestType, Frequency } from '@as-finance/shared';
import { PrismaService } from '../../database/prisma.service';
import { DisbursementRepository } from './disbursement.repository';
import { AccountingService } from '../accounting/accounting.service';
import { AuditService } from '../audit/audit.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { LoanService } from '../loan/loan.service';
import { DisburseDto } from './dto/disburse.dto';
import { BusinessRuleError, NotFoundError } from '../../common/errors';
import { canBypassMakerChecker } from '../../common/constants/maker-checker';

// Configure Decimal.js: ROUND_HALF_UP for financial calculations
Decimal.set({ rounding: Decimal.ROUND_HALF_UP });

/**
 * Prisma transaction client type.
 */
type TxClient = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

/**
 * Disbursement service — orchestrates the atomic disbursement of approved loans.
 *
 * Responsibilities:
 * - Prerequisite verification (loan status, schedule, KYC, not already disbursed)
 * - Atomic execution within prisma.$transaction()
 * - Idempotency via IdempotencyService
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 3.5a, 12.4
 */
@Injectable()
export class DisbursementService {
  private readonly logger = new Logger(DisbursementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly disbursementRepository: DisbursementRepository,
    private readonly accountingService: AccountingService,
    private readonly auditService: AuditService,
    private readonly idempotencyService: IdempotencyService,
    private readonly loanService: LoanService,
  ) {}

  /**
   * Disburse an approved loan atomically.
   *
   * 1. Check idempotency — return cached result for duplicate key
   * 2. Verify all prerequisites
   * 3. Execute within prisma.$transaction():
   *    a. Transition loan status: approved → disbursed → active
   *    b. Create disbursement record
   *    c. Create journal entry (DR Loans Receivable, CR Cash/Bank)
   *    d. If processing fee configured, create fee journal entry
   *    e. Set loan dates and cached outstanding
   *    f. Create audit log entry
   *    g. Enqueue SMS notification to outbox
   *    h. Store idempotency result
   * 4. If any step fails, entire transaction rolls back
   */
  async disburse(dto: DisburseDto, actorId: string, actorRole: string) {
    // 1. Idempotency check — return cached result for duplicate key
    const cached = await this.idempotencyService.find(dto.idempotencyKey);
    if (cached) {
      this.logger.log({
        msg: 'Returning cached disbursement result (idempotency hit)',
        idempotencyKey: dto.idempotencyKey,
      });
      return { statusCode: cached.resultStatus, data: cached.resultBody };
    }

    // 2. Verify prerequisites outside the transaction (fast-fail)
    await this.verifyPrerequisites(dto.loanId);

    // 3. Execute atomic disbursement transaction
    const result = await this.prisma.$transaction(async (tx) => {
      return this.executeDisbursement(tx, dto, actorId, actorRole);
    });

    return { statusCode: 201, data: result };
  }

  /**
   * Verify all disbursement prerequisites.
   * Throws BusinessRuleError if any prerequisite is not met.
   */
  async verifyPrerequisites(loanId: string) {
    const loan = await this.disbursementRepository.getLoanForDisbursement(loanId);
    if (!loan) {
      throw new NotFoundError(`Loan not found: ${loanId}`);
    }

    // Loan must be in approved status
    if (loan.status !== 'approved') {
      throw new BusinessRuleError(
        `Loan must be in 'approved' status for disbursement. Current status: '${loan.status}'`,
        'LOAN_NOT_APPROVED',
      );
    }

    // Schedule must be generated
    const hasSchedule = await this.disbursementRepository.hasSchedule(loanId);
    if (!hasSchedule) {
      throw new BusinessRuleError(
        'Loan schedule must be generated before disbursement',
        'SCHEDULE_NOT_GENERATED',
      );
    }

    // KYC documents must be uploaded
    const hasKyc = await this.disbursementRepository.hasKycDocuments(loan.customer_id);
    if (!hasKyc) {
      throw new BusinessRuleError(
        'Customer KYC documents must be uploaded before disbursement',
        'KYC_DOCS_MISSING',
      );
    }

    // Must not already be disbursed
    const alreadyDisbursed = await this.disbursementRepository.isAlreadyDisbursed(loanId);
    if (alreadyDisbursed) {
      throw new BusinessRuleError(
        'Loan has already been disbursed',
        'ALREADY_DISBURSED',
      );
    }

    return { valid: true, loan };
  }

  /**
   * Execute the disbursement atomically within a transaction.
   * All steps use the tx client so failure rolls back everything.
   */
  private async executeDisbursement(
    tx: TxClient,
    dto: DisburseDto,
    actorId: string,
    actorRole: string,
  ) {
    // Re-fetch loan within transaction for consistency
    const loan = await this.disbursementRepository.getLoanForDisbursement(dto.loanId, tx);
    if (!loan) {
      throw new NotFoundError(`Loan not found: ${dto.loanId}`);
    }

    // Re-validate status within transaction (guard against race conditions)
    this.loanService.validateTransition(loan.status, 'disbursed');

    // Maker-checker enforcement (bypass for allowed roles)
    // Disbursing user must be different from approving user
    if (loan.approved_by === actorId && !canBypassMakerChecker(actorRole)) {
      throw new BusinessRuleError(
        'Maker-checker violation: disbursing user cannot be the same user who approved the loan',
        'MAKER_CHECKER_VIOLATION',
      );
    }

    const now = new Date();
    const disbursementDate = new Date(now.toISOString().split('T')[0]!); // IST business date

    // ── Step 1: Transition loan status approved → disbursed ──
    await this.disbursementRepository.updateLoanStatus(dto.loanId, 'disbursed', tx);
    await this.disbursementRepository.createStatusHistory(
      {
        loan_id: dto.loanId,
        from_status: 'approved',
        to_status: 'disbursed',
        changed_by: actorId,
      },
      tx,
    );

    // Transition disbursed → active
    await this.disbursementRepository.updateLoanStatus(dto.loanId, 'active', tx);
    await this.disbursementRepository.createStatusHistory(
      {
        loan_id: dto.loanId,
        from_status: 'disbursed',
        to_status: 'active',
        changed_by: actorId,
      },
      tx,
    );

    // ── Step 2: Look up account IDs by code ──
    const cashAccount = dto.mode === 'cash'
      ? await this.disbursementRepository.findAccountByCode('1001', tx)
      : await this.disbursementRepository.findAccountByCode('1002', tx);
    const loansReceivableAccount = await this.disbursementRepository.findAccountByCode('1100', tx);

    if (!cashAccount || !loansReceivableAccount) {
      throw new BusinessRuleError(
        'Required chart of accounts entries not found (Cash/Bank or Loans Receivable)',
        'ACCOUNTS_NOT_CONFIGURED',
      );
    }

    // ── Step 3: Calculate processing fee (deducted from disbursement) ──
    let processingFeePaise = 0n;
    const pv = loan.product_version;
    let processingFeeAccount: { id: string } | null = null;

    if (pv.processing_fee_type && pv.processing_fee_value) {
      processingFeePaise = this.calculateProcessingFee(
        BigInt(loan.principal_paise),
        pv.processing_fee_type,
        pv.processing_fee_value,
      );

      if (processingFeePaise > 0n) {
        processingFeeAccount = await this.disbursementRepository.findAccountByCode('4002', tx);
        if (!processingFeeAccount) {
          throw new BusinessRuleError(
            'Processing Fee Income account (4002) not found',
            'ACCOUNTS_NOT_CONFIGURED',
          );
        }
      }
    }

    // Calculate net disbursement amount (principal - processing fee)
    const grossAmountPaise = BigInt(loan.principal_paise);
    const netDisbursementPaise = grossAmountPaise - processingFeePaise;

    // ── Step 4: Create journal entry (single entry with net disbursement) ──
    // DR Loans Receivable (full principal - what customer owes)
    // CR Cash/Bank (net amount - what customer receives)
    // CR Processing Fee Income (fee - deducted upfront)
    const journalLines = [
      {
        accountId: loansReceivableAccount.id,
        debitPaise: Number(grossAmountPaise),
        creditPaise: 0,
      },
      {
        accountId: cashAccount.id,
        debitPaise: 0,
        creditPaise: Number(netDisbursementPaise),
      },
    ];

    // Add processing fee line if applicable
    if (processingFeePaise > 0n && processingFeeAccount) {
      journalLines.push({
        accountId: processingFeeAccount.id,
        debitPaise: 0,
        creditPaise: Number(processingFeePaise),
      });
    }

    const journalEntry = await this.accountingService.createJournalEntry(
      {
        date: disbursementDate.toISOString(),
        description: processingFeePaise > 0n
          ? `Disbursement for loan ${loan.loan_number} (net of ₹${Number(processingFeePaise) / 100} processing fee)`
          : `Disbursement for loan ${loan.loan_number}`,
        sourceType: JournalSourceType.DISBURSEMENT,
        sourceId: dto.loanId,
        createdBy: actorId,
        lines: journalLines,
      },
      tx,
    );

    // ── Step 5: Create disbursement record (stores net amount disbursed) ──
    const disbursement = await this.disbursementRepository.create(
      {
        loan_id: dto.loanId,
        amount_paise: netDisbursementPaise,
        mode: dto.mode,
        reference_number: dto.referenceNumber,
        disbursed_by: actorId,
        disbursed_at: now,
        journal_entry_id: journalEntry.id,
        idempotency_key: dto.idempotencyKey,
      },
      tx,
    );

    // ── Step 6: Handle first EMI date override if provided ──
    let schedules = loan.schedules;
    let totalPayable = loan.total_payable_paise ?? loan.principal_paise;

    // Track first/last due dates for later use
    let computedFirstDueDate: Date | undefined;
    let computedLastDueDate: Date | undefined;

    if (dto.firstEmiDate) {
      // Validate first EMI date is after disbursement date
      const firstEmi = new Date(dto.firstEmiDate);
      if (firstEmi <= disbursementDate) {
        throw new BusinessRuleError(
          'First EMI date must be after disbursement date',
          'FIRST_EMI_DATE_BEFORE_DISBURSEMENT',
        );
      }

      // Regenerate the schedule with the new first EMI date
      const pv = loan.product_version;
      const scheduleStartDate = this.calculateStartDateFromFirstEmi(firstEmi, pv.repayment_frequency);

      // Import and use schedule generator
      const { generateSchedule } = await import('../schedule/schedule.service');
      const newSchedule = generateSchedule({
        principalPaise: Number(loan.principal_paise),
        annualRateBps: pv.annual_rate_bps,
        tenureMonths: loan.tenure_months,
        interestType: pv.interest_type as InterestType,
        frequency: pv.repayment_frequency as Frequency,
        startDate: scheduleStartDate,
        holidays: [],
      });

      // Calculate new totals
      const totalInterestPaise = newSchedule.reduce((sum, inst) => sum + inst.interestPaise, 0);
      const totalPayablePaise = Number(loan.principal_paise) + totalInterestPaise;
      totalPayable = BigInt(totalPayablePaise);

      // Delete old schedule and create new one within transaction
      await tx['loan_schedules'].deleteMany({
        where: { loan_id: dto.loanId },
      });

      for (const inst of newSchedule) {
        await tx['loan_schedules'].create({
          data: {
            loan_id: dto.loanId,
            installment_number: inst.installmentNumber,
            due_date: inst.dueDate,
            principal_paise: inst.principalPaise,
            interest_paise: inst.interestPaise,
            total_paise: inst.totalPaise,
            principal_paid_paise: 0,
            interest_paid_paise: 0,
            penalty_paid_paise: 0,
            status: 'pending',
          } as never,
        });
      }

      // Update totals on loan
      await tx['loans'].update({
        where: { id: dto.loanId },
        data: {
          total_interest_paise: totalInterestPaise,
          total_payable_paise: totalPayablePaise,
        },
      });

      // Set computed due dates from new schedule
      computedFirstDueDate = newSchedule[0]?.dueDate;
      computedLastDueDate = newSchedule[newSchedule.length - 1]?.dueDate;
    }

    const firstDueDate = computedFirstDueDate ?? (schedules.length > 0 ? schedules[0]!.due_date : disbursementDate);
    const lastDueDate = computedLastDueDate ?? (schedules.length > 0 ? schedules[schedules.length - 1]!.due_date : disbursementDate);

    await this.disbursementRepository.updateLoanForDisbursement(
      dto.loanId,
      {
        status: 'active',
        disbursement_date: disbursementDate,
        first_due_date: firstDueDate,
        last_due_date: lastDueDate,
        cached_outstanding_paise: totalPayable,
        processing_fee_paise: processingFeePaise > 0n ? processingFeePaise : undefined,
      },
      tx,
    );

    // ── Step 7: Create audit log entry ──
    await this.auditService.createAuditLog(
      {
        action_type: 'loan_disbursed',
        actor_id: actorId,
        actor_role: actorRole,
        target_entity: 'loan',
        target_id: dto.loanId,
        before_state: { status: 'approved' },
        after_state: {
          status: 'active',
          disbursement_date: disbursementDate.toISOString(),
          gross_amount_paise: grossAmountPaise.toString(),
          net_amount_paise: netDisbursementPaise.toString(),
          processing_fee_paise: processingFeePaise.toString(),
          mode: dto.mode,
        },
      },
      tx,
    );

    // ── Step 8: Enqueue SMS notification to outbox ──
    // SMS shows net amount (what customer actually receives) with fee breakdown if applicable
    const smsMessage = processingFeePaise > 0n
      ? `Dear ${loan.customer.full_name}, your loan ${loan.loan_number} has been disbursed. Amount: Rs ${Number(netDisbursementPaise) / 100} (after deducting Rs ${Number(processingFeePaise) / 100} processing fee from Rs ${Number(grossAmountPaise) / 100}).`
      : `Dear ${loan.customer.full_name}, your loan ${loan.loan_number} of amount Rs ${Number(netDisbursementPaise) / 100} has been disbursed.`;

    await this.disbursementRepository.enqueueOutboxMessage(
      {
        event_type: 'disbursed',
        recipient_mobile: loan.customer.mobile,
        message_body: smsMessage,
        variables: {
          customer_name: loan.customer.full_name,
          loan_number: loan.loan_number,
          gross_amount_paise: grossAmountPaise.toString(),
          net_amount_paise: netDisbursementPaise.toString(),
          processing_fee_paise: processingFeePaise.toString(),
          mode: dto.mode,
        },
        source_type: 'disbursement',
        source_id: disbursement.id,
      },
      tx,
    );

    // ── Step 9: Store idempotency result ──
    const resultBody = {
      disbursementId: disbursement.id,
      loanId: dto.loanId,
      loanNumber: loan.loan_number,
      grossAmountPaise: grossAmountPaise.toString(),
      netAmountPaise: netDisbursementPaise.toString(),
      processingFeePaise: processingFeePaise.toString(),
      mode: dto.mode,
      referenceNumber: dto.referenceNumber,
      journalEntryId: journalEntry.id,
      disbursedAt: now.toISOString(),
    };

    await this.idempotencyService.store(
      dto.idempotencyKey,
      'disbursement',
      201,
      resultBody,
      tx,
    );

    this.logger.log({
      msg: 'Loan disbursed successfully',
      loanId: dto.loanId,
      loanNumber: loan.loan_number,
      grossAmountPaise: grossAmountPaise.toString(),
      netAmountPaise: netDisbursementPaise.toString(),
      processingFeePaise: processingFeePaise.toString(),
      disbursementId: disbursement.id,
    });

    return resultBody;
  }

  /**
   * Calculate the schedule start date from a desired first EMI date.
   * The schedule generator adds 1 frequency period to startDate for the first EMI,
   * so we need to subtract 1 period from the desired first EMI date.
   */
  private calculateStartDateFromFirstEmi(firstEmiDate: Date, frequency: string): Date {
    const startDate = new Date(firstEmiDate);
    switch (frequency) {
      case 'monthly':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'weekly':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'daily':
        startDate.setDate(startDate.getDate() - 1);
        break;
    }
    return startDate;
  }

  /**
   * Calculate processing fee based on product configuration.
   *
   * - fixed: fee_value is in paise
   * - percentage: fee_value is in basis points (e.g., 200 = 2%)
   *
   * Rounding: ROUND_HALF_UP to integer paise.
   */
  private calculateProcessingFee(
    principalPaise: bigint,
    feeType: string,
    feeValue: number,
  ): bigint {
    if (feeType === 'fixed') {
      return BigInt(feeValue);
    }

    if (feeType === 'percentage') {
      // feeValue is in basis points: 200 = 2%
      const fee = new Decimal(principalPaise.toString())
        .mul(feeValue)
        .div(10000)
        .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
      return BigInt(fee.toString());
    }

    return 0n;
  }
}
