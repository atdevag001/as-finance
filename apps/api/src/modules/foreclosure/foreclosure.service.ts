import { Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import { JournalSourceType } from '@as-finance/shared';
import { PrismaService } from '../../database/prisma.service';
import { ForeclosureRepository } from './foreclosure.repository';
import { AccountingService } from '../accounting/accounting.service';
import { AuditService } from '../audit/audit.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { ReceiptService } from '../receipt/receipt.service';
import { CreateForeclosureQuoteDto } from './dto/create-foreclosure-quote.dto';
import { ExecuteForeclosureDto } from './dto/execute-foreclosure.dto';
import { BusinessRuleError, NotFoundError } from '../../common/errors';
import { canBypassMakerChecker } from '../../common/constants/maker-checker';

// Configure Decimal.js: ROUND_HALF_UP for financial calculations
Decimal.set({ rounding: Decimal.ROUND_HALF_UP });

/**
 * Prisma transaction client type.
 */
type TxClient = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

/** Loan statuses that allow foreclosure. */
const FORECLOSABLE_STATUSES = new Set(['active', 'overdue']);

/** 24-hour quote validity period in milliseconds. */
const QUOTE_VALIDITY_MS = 24 * 60 * 60 * 1000;

// ─── Pure Functions (exported for property testing) ──────────────────────────

export interface ForeclosureSettlementInput {
  /** Outstanding principal in paise (sum of unpaid principal across installments) */
  outstandingPrincipalPaise: number;
  /** Accrued interest in paise */
  accruedInterestPaise: number;
  /** Pending penalties in paise */
  pendingPenaltiesPaise: number;
  /** Rebate/waiver in paise */
  rebatePaise: number;
}

export interface ForeclosureSettlementResult {
  outstandingPrincipalPaise: number;
  accruedInterestPaise: number;
  pendingPenaltiesPaise: number;
  rebatePaise: number;
  settlementAmountPaise: number;
}

/**
 * Pure function: Calculate foreclosure settlement amount.
 *
 * settlement = outstanding_principal + accrued_interest + pending_penalties - rebate
 *
 * All components must be non-negative integers (paise). Rebate reduces the total
 * but cannot make it negative — clamped to zero minimum.
 *
 * Exported for property testing (Property 32).
 */
export function calculateForeclosureSettlement(
  input: ForeclosureSettlementInput,
): ForeclosureSettlementResult {
  const principal = new Decimal(input.outstandingPrincipalPaise);
  const interest = new Decimal(input.accruedInterestPaise);
  const penalties = new Decimal(input.pendingPenaltiesPaise);
  const rebate = new Decimal(input.rebatePaise);

  // settlement = principal + interest + penalties - rebate, clamped to >= 0
  const settlement = Decimal.max(
    principal.plus(interest).plus(penalties).minus(rebate),
    0,
  ).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();

  return {
    outstandingPrincipalPaise: input.outstandingPrincipalPaise,
    accruedInterestPaise: input.accruedInterestPaise,
    pendingPenaltiesPaise: input.pendingPenaltiesPaise,
    rebatePaise: input.rebatePaise,
    settlementAmountPaise: settlement,
  };
}

/**
 * Pure function: Calculate accrued interest for flat interest loans.
 *
 * Pro-rata calculation: total_interest × (elapsed_days / total_days)
 * where total_days = days from disbursement to last due date.
 *
 * Rounding: ROUND_HALF_UP to nearest paisa.
 */
export function calculateFlatAccruedInterest(
  totalInterestPaise: number,
  disbursementDate: Date,
  lastDueDate: Date,
  settlementDate: Date,
): number {
  const totalDays = Math.max(
    1,
    Math.floor((lastDueDate.getTime() - disbursementDate.getTime()) / (1000 * 60 * 60 * 24)),
  );
  const elapsedDays = Math.max(
    0,
    Math.floor((settlementDate.getTime() - disbursementDate.getTime()) / (1000 * 60 * 60 * 24)),
  );

  // Pro-rata: totalInterest × elapsedDays / totalDays
  const accrued = new Decimal(totalInterestPaise)
    .mul(elapsedDays)
    .div(totalDays)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();

  return accrued;
}

/**
 * Pure function: Calculate accrued interest for reducing balance loans.
 *
 * Daily accrual: outstanding_principal × (annual_rate_bps / 10000 / 365) × days_since_last_payment
 *
 * For simplicity, we compute interest on the current outstanding principal
 * from the last payment date (or disbursement date if no payments) to the settlement date.
 *
 * Rounding: ROUND_HALF_UP to nearest paisa.
 */
export function calculateReducingBalanceAccruedInterest(
  outstandingPrincipalPaise: number,
  annualRateBps: number,
  lastPaymentOrDisbursementDate: Date,
  settlementDate: Date,
): number {
  const days = Math.max(
    0,
    Math.floor(
      (settlementDate.getTime() - lastPaymentOrDisbursementDate.getTime()) / (1000 * 60 * 60 * 24),
    ),
  );

  // daily_rate = annual_rate_bps / 10000 / 365
  // accrued = outstanding × daily_rate × days
  const dailyRate = new Decimal(annualRateBps).div(10000).div(365);
  const accrued = new Decimal(outstandingPrincipalPaise)
    .mul(dailyRate)
    .mul(days)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();

  return accrued;
}

// ─── Foreclosure Service ─────────────────────────────────────────────────────

/**
 * Foreclosure service — early loan closure with settlement calculation
 * and atomic settlement execution.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.7
 */
@Injectable()
export class ForeclosureService {
  private readonly logger = new Logger(ForeclosureService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly foreclosureRepository: ForeclosureRepository,
    private readonly accountingService: AccountingService,
    private readonly auditService: AuditService,
    private readonly idempotencyService: IdempotencyService,
    private readonly receiptService: ReceiptService,
  ) {}

  /**
   * Generate a foreclosure quote.
   *
   * Calculates settlement amount with itemized components and creates
   * a foreclosure record with status=quote and 24-hour expiry.
   */
  async createQuote(dto: CreateForeclosureQuoteDto, actorId: string, actorRole: string) {
    // Load loan details
    const loan = await this.foreclosureRepository.getLoanForForeclosure(dto.loanId);
    if (!loan) {
      throw new NotFoundError(`Loan not found: ${dto.loanId}`);
    }

    // Validate loan status
    if (!FORECLOSABLE_STATUSES.has(loan.status)) {
      throw new BusinessRuleError(
        `Cannot foreclose a loan with status '${loan.status}'. Loan must be active or overdue.`,
        'INVALID_LOAN_STATUS_FOR_FORECLOSURE',
      );
    }

    const now = new Date();

    // Calculate outstanding principal from schedule
    const outstandingPrincipalPaise = this.computeOutstandingPrincipal(loan.schedules);

    // Calculate accrued interest based on interest type
    const accruedInterestPaise = this.computeAccruedInterest(loan, now);

    // Calculate pending penalties
    const pendingPenalties = await this.foreclosureRepository.getPendingPenalties(dto.loanId);
    const pendingPenaltiesPaise = pendingPenalties.reduce(
      (sum, p) => sum + Number(p.amount_paise),
      0,
    );

    const rebatePaise = dto.rebatePaise ?? 0;

    // Calculate settlement using pure function
    const settlement = calculateForeclosureSettlement({
      outstandingPrincipalPaise,
      accruedInterestPaise,
      pendingPenaltiesPaise,
      rebatePaise,
    });

    // Create foreclosure record with 24-hour expiry
    const quoteExpiresAt = new Date(now.getTime() + QUOTE_VALIDITY_MS);

    const foreclosure = await this.foreclosureRepository.createForeclosure({
      loan_id: dto.loanId,
      outstanding_principal_paise: settlement.outstandingPrincipalPaise,
      accrued_interest_paise: settlement.accruedInterestPaise,
      pending_penalties_paise: settlement.pendingPenaltiesPaise,
      rebate_paise: settlement.rebatePaise,
      settlement_amount_paise: settlement.settlementAmountPaise,
      rebate_reason: dto.rebateReason,
      rebate_authorized_by: dto.rebateAuthorizedBy,
      requested_by: actorId,
      quote_expires_at: quoteExpiresAt,
    });

    // Audit log
    await this.auditService.createAuditLog({
      action_type: 'loan_foreclosed',
      actor_id: actorId,
      actor_role: actorRole,
      target_entity: 'foreclosure',
      target_id: foreclosure.id,
      after_state: {
        loan_id: dto.loanId,
        status: 'quote',
        outstanding_principal_paise: settlement.outstandingPrincipalPaise,
        accrued_interest_paise: settlement.accruedInterestPaise,
        pending_penalties_paise: settlement.pendingPenaltiesPaise,
        rebate_paise: settlement.rebatePaise,
        settlement_amount_paise: settlement.settlementAmountPaise,
        quote_expires_at: quoteExpiresAt.toISOString(),
      },
    });

    this.logger.log({
      msg: 'Foreclosure quote created',
      foreclosureId: foreclosure.id,
      loanId: dto.loanId,
      settlementAmountPaise: settlement.settlementAmountPaise,
    });

    return {
      foreclosureId: foreclosure.id,
      loanId: dto.loanId,
      loanNumber: loan.loan_number,
      ...settlement,
      quoteExpiresAt: quoteExpiresAt.toISOString(),
      status: 'quote',
    };
  }

  /**
   * Execute a foreclosure settlement atomically.
   *
   * Quote must not be expired.
   *
   * Steps within a single transaction:
   * 1. Lock loan row
   * 2. Verify quote not expired, loan still foreclosable
   * 3. Post settlement collection with journal entries
   * 4. Close all remaining schedule installments
   * 5. Update loan status to foreclosed
   * 6. Update foreclosure status to settled
   * 7. Mark pending penalties as paid
   * 8. Record rebate/waiver in audit log
   * 9. Create audit log entry
   * 10. Store idempotency result
   */
  async executeForeclosure(dto: ExecuteForeclosureDto, actorId: string, actorRole: string) {
    // Idempotency check
    const cached = await this.idempotencyService.find(dto.idempotencyKey);
    if (cached) {
      this.logger.log({
        msg: 'Returning cached foreclosure result (idempotency hit)',
        idempotencyKey: dto.idempotencyKey,
      });
      return { statusCode: cached.resultStatus, data: cached.resultBody };
    }

    // Execute atomic foreclosure transaction
    const result = await this.prisma.$transaction(async (tx) => {
      return this.executeForeclosureTransaction(tx, dto, actorId, actorRole);
    });

    return { statusCode: 201, data: result };
  }

  private async executeForeclosureTransaction(
    tx: TxClient,
    dto: ExecuteForeclosureDto,
    actorId: string,
    actorRole: string,
  ) {
    // Step 1: Fetch and validate foreclosure quote
    const foreclosure = await this.foreclosureRepository.findById(dto.foreclosureId, tx);
    if (!foreclosure) {
      throw new NotFoundError(`Foreclosure not found: ${dto.foreclosureId}`);
    }

    if (foreclosure.status !== 'quote') {
      throw new BusinessRuleError(
        `Foreclosure is in '${foreclosure.status}' status, expected 'quote'`,
        'INVALID_FORECLOSURE_STATUS',
      );
    }

    // Verify quote not expired
    const now = new Date();
    if (now > foreclosure.quote_expires_at) {
      throw new BusinessRuleError(
        'Foreclosure quote has expired. Please generate a new quote.',
        'FORECLOSURE_QUOTE_EXPIRED',
      );
    }

    // Maker-checker enforcement (bypass for allowed roles)
    if (actorId === foreclosure.requested_by && !canBypassMakerChecker(actorRole)) {
      throw new BusinessRuleError(
        'Maker-checker violation: foreclosure approver cannot be the same user who requested the quote',
        'MAKER_CHECKER_VIOLATION',
      );
    }

    // Step 2: Lock loan row
    const lockedLoan = await this.foreclosureRepository.lockLoanForUpdate(
      foreclosure.loan_id,
      tx,
    );
    if (!lockedLoan) {
      throw new NotFoundError(`Loan not found: ${foreclosure.loan_id}`);
    }

    // Verify loan status
    if (!FORECLOSABLE_STATUSES.has(lockedLoan.status)) {
      throw new BusinessRuleError(
        `Cannot foreclose a loan with status '${lockedLoan.status}'. Loan must be active or overdue.`,
        'INVALID_LOAN_STATUS_FOR_FORECLOSURE',
      );
    }

    // Load full loan details
    const loan = await this.foreclosureRepository.getLoanForForeclosure(
      foreclosure.loan_id,
      tx,
    );
    if (!loan) {
      throw new NotFoundError(`Loan not found: ${foreclosure.loan_id}`);
    }

    // Apply optional rebate override from execution request
    const rebatePaise = dto.rebatePaise ?? Number(foreclosure.rebate_paise);
    const rebateReason = dto.rebateReason ?? foreclosure.rebate_reason ?? undefined;
    const rebateAuthorizedBy = dto.rebateAuthorizedBy ?? foreclosure.rebate_authorized_by ?? undefined;

    // Recalculate settlement with potentially updated rebate
    const settlementResult = calculateForeclosureSettlement({
      outstandingPrincipalPaise: Number(foreclosure.outstanding_principal_paise),
      accruedInterestPaise: Number(foreclosure.accrued_interest_paise),
      pendingPenaltiesPaise: Number(foreclosure.pending_penalties_paise),
      rebatePaise,
    });

    const settlementAmountPaise = settlementResult.settlementAmountPaise;

    // Step 4: Look up accounts for journal entries
    const cashAccountCode = dto.paymentMode === 'cash' ? '1001' : '1002';
    const [
      cashAccount,
      loansReceivableAccount,
      interestIncomeAccount,
      penaltyIncomeAccount,
      discountExpenseAccount,
    ] = await Promise.all([
      this.foreclosureRepository.findAccountByCode(cashAccountCode, tx),
      this.foreclosureRepository.findAccountByCode('1100', tx),
      this.foreclosureRepository.findAccountByCode('4001', tx),
      this.foreclosureRepository.findAccountByCode('4003', tx),
      this.foreclosureRepository.findAccountByCode('5007', tx),
    ]);

    if (!cashAccount || !loansReceivableAccount || !interestIncomeAccount || !penaltyIncomeAccount) {
      throw new BusinessRuleError(
        'Required chart of accounts entries not found',
        'ACCOUNTS_NOT_CONFIGURED',
      );
    }

    // Hard-require Foreclosure Discount Expense (5007) when a rebate is applied.
    // Falling back to absorbing rebate into the principal credit understates
    // Loans Receivable and overstates net profit — silent accounting error.
    if (settlementResult.rebatePaise > 0 && !discountExpenseAccount) {
      throw new BusinessRuleError(
        'Foreclosure Discount Expense (code 5007) not seeded in chart_of_accounts; cannot post rebate.',
        'ACCOUNTS_NOT_CONFIGURED',
      );
    }

    // Build journal entry lines for settlement
    const journalLines = this.buildSettlementJournalLines(
      settlementResult,
      cashAccount.id,
      loansReceivableAccount.id,
      interestIncomeAccount.id,
      penaltyIncomeAccount.id,
      discountExpenseAccount?.id,
    );

    // Create journal entry
    const journalEntry = await this.accountingService.createJournalEntry(
      {
        date: now.toISOString(),
        description: `Foreclosure settlement for loan ${loan.loan_number}`,
        sourceType: JournalSourceType.FORECLOSURE,
        sourceId: foreclosure.id,
        createdBy: actorId,
        lines: journalLines,
      },
      tx,
    );

    // Create settlement collection record
    const collection = await tx.collections.create({
      data: {
        loan_id: foreclosure.loan_id,
        amount_paise: settlementAmountPaise,
        payment_date: now,
        payment_mode: dto.paymentMode as never,
        collected_by: actorId,
        journal_entry_id: journalEntry.id,
        idempotency_key: dto.idempotencyKey,
      },
      select: { id: true },
    });

    // Generate receipt
    const officerName = await this.foreclosureRepository.getOfficerName(actorId, tx);
    const receipt = await this.receiptService.generateReceipt(
      {
        collectionId: collection.id,
        loanId: foreclosure.loan_id,
        customerId: loan.customer_id,
        amountPaise: settlementAmountPaise,
        paymentDate: now,
        paymentMode: dto.paymentMode,
        penaltyComponentPaise: settlementResult.pendingPenaltiesPaise,
        interestComponentPaise: settlementResult.accruedInterestPaise,
        principalComponentPaise: settlementResult.outstandingPrincipalPaise,
        outstandingAfterPaise: 0,
        officerName,
        customerName: loan.customer.full_name,
        loanNumber: loan.loan_number,
      },
      tx,
    );

    // Step 5: Close all remaining schedule installments
    await this.foreclosureRepository.closeAllInstallments(foreclosure.loan_id, tx);

    // Mark pending penalties as paid
    const pendingPenalties = await this.foreclosureRepository.getPendingPenalties(
      foreclosure.loan_id,
      tx,
    );
    await this.foreclosureRepository.markPenaltiesAsPaid(
      pendingPenalties.map((p) => p.id),
      tx,
    );

    // Step 6: Update loan status to foreclosed
    await this.foreclosureRepository.updateLoan(
      foreclosure.loan_id,
      {
        status: 'foreclosed',
        cached_outstanding_paise: 0,
        dpd: 0,
        overdue_bucket: 'bucket_0',
      },
      tx,
    );

    // Create loan status history
    await this.foreclosureRepository.createStatusHistory(
      {
        loan_id: foreclosure.loan_id,
        from_status: lockedLoan.status,
        to_status: 'foreclosed',
        changed_by: actorId,
        reason: 'Foreclosure settlement',
        metadata: {
          foreclosure_id: foreclosure.id,
          settlement_amount_paise: settlementAmountPaise,
        },
      },
      tx,
    );

    // Step 7: Update foreclosure status to settled
    await this.foreclosureRepository.updateForeclosure(
      foreclosure.id,
      {
        status: 'settled',
        approved_by: actorId,
        collection_id: collection.id,
        settled_at: now,
        rebate_paise: rebatePaise,
        rebate_reason: rebateReason,
        rebate_authorized_by: rebateAuthorizedBy,
        settlement_amount_paise: settlementAmountPaise,
      },
      tx,
    );

    // Step 8: Record rebate/waiver in audit log if applicable
    if (rebatePaise > 0) {
      await this.auditService.createAuditLog(
        {
          action_type: 'loan_foreclosed',
          actor_id: actorId,
          actor_role: actorRole,
          target_entity: 'foreclosure',
          target_id: foreclosure.id,
          after_state: {
            rebate_paise: rebatePaise,
            rebate_reason: rebateReason,
            rebate_authorized_by: rebateAuthorizedBy,
          },
          remarks: `Rebate of ${rebatePaise} paise applied: ${rebateReason ?? 'no reason provided'}`,
        },
        tx,
      );
    }

    // Step 9: Create main audit log entry
    await this.auditService.createAuditLog(
      {
        action_type: 'loan_foreclosed',
        actor_id: actorId,
        actor_role: actorRole,
        target_entity: 'loan',
        target_id: foreclosure.loan_id,
        before_state: {
          status: lockedLoan.status,
          outstanding_paise: Number(lockedLoan.cached_outstanding_paise ?? 0),
        },
        after_state: {
          status: 'foreclosed',
          outstanding_paise: 0,
          settlement_amount_paise: settlementAmountPaise,
          foreclosure_id: foreclosure.id,
          collection_id: collection.id,
          receipt_id: receipt.id,
        },
      },
      tx,
    );

    // Step 10: Store idempotency result
    const resultBody = {
      foreclosureId: foreclosure.id,
      loanId: foreclosure.loan_id,
      loanNumber: loan.loan_number,
      collectionId: collection.id,
      journalEntryId: journalEntry.id,
      receiptId: receipt.id,
      receiptNumber: receipt.receipt_number,
      settlementAmountPaise,
      outstandingPrincipalPaise: settlementResult.outstandingPrincipalPaise,
      accruedInterestPaise: settlementResult.accruedInterestPaise,
      pendingPenaltiesPaise: settlementResult.pendingPenaltiesPaise,
      rebatePaise,
      finalOutstandingPaise: 0,
      status: 'settled',
    };

    await this.idempotencyService.store(
      dto.idempotencyKey,
      'foreclosure',
      201,
      resultBody,
      tx,
    );

    this.logger.log({
      msg: 'Foreclosure settled',
      foreclosureId: foreclosure.id,
      loanId: foreclosure.loan_id,
      loanNumber: loan.loan_number,
      settlementAmountPaise,
    });

    return resultBody;
  }

  /**
   * Get a foreclosure by ID.
   */
  async findById(id: string) {
    const foreclosure = await this.foreclosureRepository.findById(id);
    if (!foreclosure) {
      throw new NotFoundError(`Foreclosure not found: ${id}`);
    }
    return foreclosure;
  }

  /**
   * Find pending (unexpired quote) foreclosure by loan ID.
   * Returns null if no pending foreclosure exists.
   */
  async findPendingByLoanId(loanId: string) {
    return this.foreclosureRepository.findPendingByLoanId(loanId);
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  /**
   * Compute outstanding principal from schedule installments.
   * Outstanding principal = sum(principal_paise - principal_paid_paise) for all installments.
   */
  private computeOutstandingPrincipal(
    schedules: {
      principal_paise: bigint;
      principal_paid_paise: bigint;
    }[],
  ): number {
    let outstanding = new Decimal(0);
    for (const s of schedules) {
      outstanding = outstanding.plus(
        new Decimal(Number(s.principal_paise)).minus(Number(s.principal_paid_paise)),
      );
    }
    return Math.max(0, outstanding.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber());
  }

  /**
   * Compute accrued interest based on interest type.
   *
   * - Flat: pro-rata based on elapsed tenure
   * - Reducing balance: daily accrual on current outstanding principal
   */
  private computeAccruedInterest(
    loan: {
      total_interest_paise: bigint | null;
      disbursement_date: Date | null;
      last_due_date: Date | null;
      product_version: {
        interest_type: string;
        annual_rate_bps: number;
      };
      schedules: {
        principal_paise: bigint;
        principal_paid_paise: bigint;
        interest_paise: bigint;
        interest_paid_paise: bigint;
      }[];
    },
    settlementDate: Date,
  ): number {
    const interestType = loan.product_version.interest_type;

    if (interestType === 'flat') {
      // Pro-rata: unpaid interest portion
      // Accrued = total_interest × (elapsed_days / total_days) - interest_already_paid
      const totalInterest = Number(loan.total_interest_paise ?? 0);
      const disbursementDate = loan.disbursement_date ?? new Date();
      const lastDueDate = loan.last_due_date ?? new Date();

      const proRataInterest = calculateFlatAccruedInterest(
        totalInterest,
        disbursementDate,
        lastDueDate,
        settlementDate,
      );

      // Subtract interest already paid
      const interestPaid = loan.schedules.reduce(
        (sum, s) => sum + Number(s.interest_paid_paise),
        0,
      );

      return Math.max(0, proRataInterest - interestPaid);
    }

    // Reducing balance: daily accrual on outstanding principal
    const outstandingPrincipal = loan.schedules.reduce(
      (sum, s) => sum + Number(s.principal_paise) - Number(s.principal_paid_paise),
      0,
    );

    // Use disbursement date as fallback for last payment date
    const lastPaymentDate = loan.disbursement_date ?? new Date();

    const dailyAccrual = calculateReducingBalanceAccruedInterest(
      outstandingPrincipal,
      loan.product_version.annual_rate_bps,
      lastPaymentDate,
      settlementDate,
    );

    // Subtract interest already paid
    const interestPaid = loan.schedules.reduce(
      (sum, s) => sum + Number(s.interest_paid_paise),
      0,
    );

    return Math.max(0, dailyAccrual - interestPaid);
  }

  /**
   * Build journal entry lines for the foreclosure settlement.
   *
   * DR Cash/Bank (settlement amount)
   * CR Loans Receivable (principal component)
   * CR Interest Income (interest component)
   * CR Penalty Income (penalty component)
   *
   * Note: rebate reduces the total DR but the CR components reflect
   * the actual amounts. The rebate is absorbed proportionally or
   * from the principal component.
   */
  private buildSettlementJournalLines(
    settlement: ForeclosureSettlementResult,
    cashAccountId: string,
    loansReceivableAccountId: string,
    interestIncomeAccountId: string,
    penaltyIncomeAccountId: string,
    discountExpenseAccountId?: string,
  ) {
    const lines: { accountId: string; debitPaise: number; creditPaise: number }[] = [];

    // DR Cash/Bank for total settlement amount received from customer
    lines.push({
      accountId: cashAccountId,
      debitPaise: settlement.settlementAmountPaise,
      creditPaise: 0,
    });

    // DR Foreclosure Discount Expense for the rebate (P&L hit, not absorbed
    // into Loans Receivable — that previously left Receivable understated)
    if (settlement.rebatePaise > 0 && discountExpenseAccountId) {
      lines.push({
        accountId: discountExpenseAccountId,
        debitPaise: settlement.rebatePaise,
        creditPaise: 0,
      });
    }

    // CR Loans Receivable for the FULL outstanding principal (clears the asset).
    // Falls back to principal-minus-rebate if the discount expense account is
    // not seeded — preserves balance, but Receivable will be understated; log a
    // warning when this happens.
    const principalCredit = discountExpenseAccountId
      ? settlement.outstandingPrincipalPaise
      : Math.max(0, settlement.outstandingPrincipalPaise - settlement.rebatePaise);
    if (principalCredit > 0) {
      lines.push({
        accountId: loansReceivableAccountId,
        debitPaise: 0,
        creditPaise: principalCredit,
      });
    }

    if (settlement.accruedInterestPaise > 0) {
      lines.push({
        accountId: interestIncomeAccountId,
        debitPaise: 0,
        creditPaise: settlement.accruedInterestPaise,
      });
    }

    if (settlement.pendingPenaltiesPaise > 0) {
      lines.push({
        accountId: penaltyIncomeAccountId,
        debitPaise: 0,
        creditPaise: settlement.pendingPenaltiesPaise,
      });
    }

    return lines;
  }
}
