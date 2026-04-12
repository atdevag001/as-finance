import { Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import { JournalSourceType } from '@as-finance/shared';
import { PrismaService } from '../../database/prisma.service';
import { CollectionRepository } from './collection.repository';
import { AccountingService } from '../accounting/accounting.service';
import { AuditService } from '../audit/audit.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { ReceiptService } from '../receipt/receipt.service';
import { PostCollectionDto } from './dto/post-collection.dto';
import { BusinessRuleError, NotFoundError } from '../../common/errors';
import {
  allocate,
  AllocationResult,
  ComponentOrder,
  InstallmentState,
  PenaltyState,
} from './allocation-engine';

// Configure Decimal.js: ROUND_HALF_UP for financial calculations
Decimal.set({ rounding: Decimal.ROUND_HALF_UP });

/**
 * Prisma transaction client type.
 */
type TxClient = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

/** Loan statuses that allow collection posting. */
const COLLECTABLE_STATUSES = new Set(['active', 'overdue']);

/** Loan statuses that are explicitly rejected with typed errors. */
const REJECTED_STATUSES: Record<string, string> = {
  closed: 'LOAN_CLOSED',
  defaulted: 'LOAN_DEFAULTED',
  rejected: 'LOAN_REJECTED',
  draft: 'LOAN_NOT_ACTIVE',
  submitted: 'LOAN_NOT_ACTIVE',
  under_review: 'LOAN_NOT_ACTIVE',
  approved: 'LOAN_NOT_ACTIVE',
  disbursed: 'LOAN_NOT_ACTIVE',
  foreclosed: 'LOAN_FORECLOSED',
};

/**
 * Collection service — orchestrates atomic collection posting with allocation,
 * journal entries, receipt generation, and loan state updates.
 *
 * Responsibilities:
 * - Idempotency via IdempotencyService
 * - Atomic execution within prisma.$transaction() with SELECT ... FOR UPDATE
 * - Allocation engine invocation
 * - Journal entry creation (DR Cash/Bank, CR Loans Receivable/Interest Income/Penalty Income)
 * - Receipt generation via ReceiptService
 * - Loan outstanding, DPD, and overdue bucket updates
 * - Audit logging and SMS notification enqueueing
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 12.4
 */
@Injectable()
export class CollectionService {
  private readonly logger = new Logger(CollectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly collectionRepository: CollectionRepository,
    private readonly accountingService: AccountingService,
    private readonly auditService: AuditService,
    private readonly idempotencyService: IdempotencyService,
    private readonly receiptService: ReceiptService,
  ) {}

  /**
   * Post a collection (payment) against a loan atomically.
   *
   * 1. Check idempotency — return cached result for duplicate key
   * 2. Execute within prisma.$transaction() with SELECT ... FOR UPDATE:
   *    a. Lock loan row
   *    b. Verify loan status (active/overdue), compute outstanding, verify amount ≤ outstanding
   *    c. Run allocation engine
   *    d. Create collection record
   *    e. Create allocation records
   *    f. Update installment paid amounts and statuses
   *    g. Create journal entry (DR Cash/Bank, CR Loans Receivable/Interest Income/Penalty Income)
   *    h. Generate receipt via receipt service
   *    i. Update loan cached_outstanding, DPD, overdue_bucket
   *    j. Create audit log entry
   *    k. Enqueue SMS receipt notification to outbox
   *    l. Store idempotency result
   * 3. If any step fails, entire transaction rolls back
   */
  async postCollection(dto: PostCollectionDto, actorId: string, actorRole: string) {
    // 1. Idempotency check — return cached result for duplicate key
    const cached = await this.idempotencyService.find(dto.idempotencyKey);
    if (cached) {
      this.logger.log({
        msg: 'Returning cached collection result (idempotency hit)',
        idempotencyKey: dto.idempotencyKey,
      });
      return { statusCode: cached.resultStatus, data: cached.resultBody };
    }

    // 2. Execute atomic collection transaction
    const result = await this.prisma.$transaction(async (tx) => {
      return this.executeCollection(tx, dto, actorId, actorRole);
    });

    return { statusCode: 201, data: result };
  }

  /**
   * Execute the collection atomically within a transaction.
   * All steps use the tx client so failure rolls back everything.
   */
  private async executeCollection(
    tx: TxClient,
    dto: PostCollectionDto,
    actorId: string,
    actorRole: string,
  ) {
    // ── Step a: Lock loan row with SELECT ... FOR UPDATE ──
    const lockedLoan = await this.collectionRepository.lockLoanForUpdate(dto.loanId, tx);
    if (!lockedLoan) {
      throw new NotFoundError(`Loan not found: ${dto.loanId}`);
    }

    // ── Step b: Verify loan status and outstanding ──
    this.validateLoanStatus(lockedLoan.status);

    const loan = await this.collectionRepository.getLoanForCollection(dto.loanId, tx);
    if (!loan) {
      throw new NotFoundError(`Loan not found: ${dto.loanId}`);
    }

    // Compute outstanding from schedule
    const outstanding = this.computeOutstanding(loan.schedules);
    const pendingPenalties = await this.collectionRepository.getPendingPenalties(dto.loanId, tx);
    const totalPenaltyOutstanding = pendingPenalties.reduce(
      (sum, p) => sum + Number(p.amount_paise),
      0,
    );
    const totalOutstanding = outstanding + totalPenaltyOutstanding;

    if (dto.amountPaise > totalOutstanding) {
      throw new BusinessRuleError(
        `Collection amount (${dto.amountPaise} paise) exceeds outstanding balance (${totalOutstanding} paise). This would cause negative outstanding.`,
        'COLLECTION_EXCEEDS_OUTSTANDING',
      );
    }

    // ── Step c: Run allocation engine ──
    const allocationOrder = (loan.product_version.allocation_order as ComponentOrder[]) ??
      ['penalty', 'interest', 'principal'];

    const installmentStates: InstallmentState[] = loan.schedules.map((s) => ({
      installmentId: s.id,
      installmentNumber: s.installment_number,
      dueDate: s.due_date,
      principalPaise: Number(s.principal_paise),
      interestPaise: Number(s.interest_paise),
      principalPaidPaise: Number(s.principal_paid_paise),
      interestPaidPaise: Number(s.interest_paid_paise),
    }));

    const penaltyStates: PenaltyState[] = pendingPenalties.map((p) => ({
      penaltyId: p.id,
      amountPaise: Number(p.amount_paise),
      paidPaise: 0, // Unpaid penalties (we only fetched is_paid=false)
    }));

    const allocationResult = allocate({
      amountPaise: dto.amountPaise,
      installments: installmentStates,
      pendingPenalties: penaltyStates,
      allocationOrder,
    });

    // ── Step d: Look up account IDs by code ──
    const cashAccountCode = dto.paymentMode === 'cash' ? '1001' : '1002';
    const [cashAccount, loansReceivableAccount, interestIncomeAccount, penaltyIncomeAccount] =
      await Promise.all([
        this.collectionRepository.findAccountByCode(cashAccountCode, tx),
        this.collectionRepository.findAccountByCode('1100', tx),
        this.collectionRepository.findAccountByCode('4001', tx),
        this.collectionRepository.findAccountByCode('4003', tx),
      ]);

    if (!cashAccount || !loansReceivableAccount || !interestIncomeAccount || !penaltyIncomeAccount) {
      throw new BusinessRuleError(
        'Required chart of accounts entries not found',
        'ACCOUNTS_NOT_CONFIGURED',
      );
    }

    // ── Step e: Create journal entry ──
    const journalLines = this.buildJournalLines(
      allocationResult,
      cashAccount.id,
      loansReceivableAccount.id,
      interestIncomeAccount.id,
      penaltyIncomeAccount.id,
    );

    const paymentDate = new Date(dto.paymentDate);

    const journalEntry = await this.accountingService.createJournalEntry(
      {
        date: paymentDate.toISOString(),
        description: `Collection for loan ${loan.loan_number}`,
        sourceType: JournalSourceType.COLLECTION,
        sourceId: dto.loanId,
        createdBy: actorId,
        lines: journalLines,
      },
      tx,
    );

    // ── Step f: Create collection record ──
    const collection = await this.collectionRepository.createCollection(
      {
        loan_id: dto.loanId,
        amount_paise: dto.amountPaise,
        payment_date: paymentDate,
        payment_mode: dto.paymentMode,
        collected_by: actorId,
        journal_entry_id: journalEntry.id,
        idempotency_key: dto.idempotencyKey,
      },
      tx,
    );

    // ── Step g: Create allocation records ──
    const allocationRecords = this.buildAllocationRecords(collection.id, allocationResult);
    await this.collectionRepository.createAllocations(allocationRecords, tx);

    // ── Step h: Update installment paid amounts and statuses ──
    await this.updateInstallments(loan.schedules, allocationResult, tx);

    // ── Step i: Compute new outstanding and update loan ──
    const newOutstanding = new Decimal(totalOutstanding).minus(dto.amountPaise).toNumber();
    const { dpd, overdueBucket } = this.computeDpdAndBucket(loan.schedules, allocationResult, paymentDate);

    await this.collectionRepository.updateLoanOutstanding(
      dto.loanId,
      {
        cached_outstanding_paise: BigInt(Math.max(0, newOutstanding)),
        dpd,
        overdue_bucket: overdueBucket,
      },
      tx,
    );

    // ── Step j: Generate receipt ──
    const officerName = await this.collectionRepository.getOfficerName(actorId, tx);

    const receipt = await this.receiptService.generateReceipt(
      {
        collectionId: collection.id,
        loanId: dto.loanId,
        customerId: loan.customer_id,
        amountPaise: dto.amountPaise,
        paymentDate,
        paymentMode: dto.paymentMode,
        penaltyComponentPaise: allocationResult.totalPenaltyAllocated,
        interestComponentPaise: allocationResult.totalInterestAllocated,
        principalComponentPaise: allocationResult.totalPrincipalAllocated,
        outstandingAfterPaise: Math.max(0, newOutstanding),
        officerName,
        customerName: loan.customer.full_name,
        loanNumber: loan.loan_number,
      },
      tx,
    );

    // ── Step k: Create audit log entry ──
    await this.auditService.createAuditLog(
      {
        action_type: 'collection_posted',
        actor_id: actorId,
        actor_role: actorRole,
        target_entity: 'collection',
        target_id: collection.id,
        before_state: {
          outstanding_paise: totalOutstanding,
          dpd: loan.dpd,
        },
        after_state: {
          outstanding_paise: Math.max(0, newOutstanding),
          dpd,
          amount_paise: dto.amountPaise,
          penalty_allocated: allocationResult.totalPenaltyAllocated,
          interest_allocated: allocationResult.totalInterestAllocated,
          principal_allocated: allocationResult.totalPrincipalAllocated,
        },
      },
      tx,
    );

    // ── Step l: Enqueue SMS receipt notification ──
    await this.collectionRepository.enqueueOutboxMessage(
      {
        event_type: 'collection_receipt',
        recipient_mobile: loan.customer.mobile,
        message_body: `Dear ${loan.customer.full_name}, payment of Rs ${dto.amountPaise / 100} received for loan ${loan.loan_number}. Receipt: ${receipt.receipt_number}. Outstanding: Rs ${Math.max(0, newOutstanding) / 100}.`,
        variables: {
          customer_name: loan.customer.full_name,
          loan_number: loan.loan_number,
          amount_paise: dto.amountPaise.toString(),
          receipt_number: receipt.receipt_number,
          outstanding_paise: Math.max(0, newOutstanding).toString(),
        },
        source_type: 'collection',
        source_id: collection.id,
      },
      tx,
    );

    // ── Step m: Store idempotency result ──
    const resultBody = {
      collectionId: collection.id,
      loanId: dto.loanId,
      loanNumber: loan.loan_number,
      amountPaise: dto.amountPaise,
      paymentDate: dto.paymentDate,
      paymentMode: dto.paymentMode,
      journalEntryId: journalEntry.id,
      receiptId: receipt.id,
      receiptNumber: receipt.receipt_number,
      allocations: {
        penaltyPaise: allocationResult.totalPenaltyAllocated,
        interestPaise: allocationResult.totalInterestAllocated,
        principalPaise: allocationResult.totalPrincipalAllocated,
        excessPaise: allocationResult.excessAmount,
      },
      outstandingAfterPaise: Math.max(0, newOutstanding),
    };

    await this.idempotencyService.store(
      dto.idempotencyKey,
      'collection',
      201,
      resultBody,
      tx,
    );

    this.logger.log({
      msg: 'Collection posted successfully',
      collectionId: collection.id,
      loanId: dto.loanId,
      loanNumber: loan.loan_number,
      amountPaise: dto.amountPaise,
      receiptNumber: receipt.receipt_number,
    });

    return resultBody;
  }

  /**
   * Validate that the loan status allows collection posting.
   * Throws BusinessRuleError with typed error code for rejected statuses.
   */
  private validateLoanStatus(status: string): void {
    if (COLLECTABLE_STATUSES.has(status)) return;

    const errorCode = REJECTED_STATUSES[status] ?? 'LOAN_NOT_COLLECTABLE';
    throw new BusinessRuleError(
      `Cannot post collection against a loan with status '${status}'`,
      errorCode,
    );
  }

  /**
   * Compute total outstanding from schedule installments.
   * Outstanding = sum(principal + interest - principal_paid - interest_paid) for all installments.
   */
  private computeOutstanding(
    schedules: {
      principal_paise: bigint;
      interest_paise: bigint;
      principal_paid_paise: bigint;
      interest_paid_paise: bigint;
    }[],
  ): number {
    let outstanding = new Decimal(0);
    for (const s of schedules) {
      const principalRemaining = new Decimal(Number(s.principal_paise)).minus(Number(s.principal_paid_paise));
      const interestRemaining = new Decimal(Number(s.interest_paise)).minus(Number(s.interest_paid_paise));
      outstanding = outstanding.plus(principalRemaining).plus(interestRemaining);
    }
    return outstanding.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
  }

  /**
   * Build journal entry lines for the collection.
   *
   * DR Cash/Bank (total amount)
   * CR Loans Receivable (principal component)
   * CR Interest Income (interest component)
   * CR Penalty Income (penalty component)
   */
  private buildJournalLines(
    allocationResult: AllocationResult,
    cashAccountId: string,
    loansReceivableAccountId: string,
    interestIncomeAccountId: string,
    penaltyIncomeAccountId: string,
  ) {
    const totalAmount =
      allocationResult.totalPrincipalAllocated +
      allocationResult.totalInterestAllocated +
      allocationResult.totalPenaltyAllocated;

    const lines: { accountId: string; debitPaise: number; creditPaise: number }[] = [];

    // DR Cash/Bank for total collection amount
    lines.push({
      accountId: cashAccountId,
      debitPaise: totalAmount,
      creditPaise: 0,
    });

    // CR Loans Receivable for principal component
    if (allocationResult.totalPrincipalAllocated > 0) {
      lines.push({
        accountId: loansReceivableAccountId,
        debitPaise: 0,
        creditPaise: allocationResult.totalPrincipalAllocated,
      });
    }

    // CR Interest Income for interest component
    if (allocationResult.totalInterestAllocated > 0) {
      lines.push({
        accountId: interestIncomeAccountId,
        debitPaise: 0,
        creditPaise: allocationResult.totalInterestAllocated,
      });
    }

    // CR Penalty Income for penalty component
    if (allocationResult.totalPenaltyAllocated > 0) {
      lines.push({
        accountId: penaltyIncomeAccountId,
        debitPaise: 0,
        creditPaise: allocationResult.totalPenaltyAllocated,
      });
    }

    return lines;
  }

  /**
   * Build allocation records grouped by installment for persistence.
   */
  private buildAllocationRecords(
    collectionId: string,
    allocationResult: AllocationResult,
  ) {
    // Group allocations by installment
    const byInstallment = new Map<
      string,
      { penalty: number; interest: number; principal: number }
    >();

    for (const line of allocationResult.allocations) {
      const instId = line.installmentId;
      if (!instId) continue; // Penalty allocations without installment ID

      const existing = byInstallment.get(instId) ?? { penalty: 0, interest: 0, principal: 0 };
      switch (line.component) {
        case 'penalty':
          existing.penalty += line.amountPaise;
          break;
        case 'interest':
          existing.interest += line.amountPaise;
          break;
        case 'principal':
          existing.principal += line.amountPaise;
          break;
      }
      byInstallment.set(instId, existing);
    }

    // Also handle penalty allocations that reference penaltyId but not installmentId
    // These need to be associated with an installment for the allocation record.
    // Penalties are linked to installments via the penalties table.
    // For simplicity, penalty allocations without installmentId are tracked
    // at the loan level (we skip them in per-installment records).

    return [...byInstallment.entries()].map(([installmentId, amounts]) => ({
      collection_id: collectionId,
      installment_id: installmentId,
      penalty_paise: amounts.penalty,
      interest_paise: amounts.interest,
      principal_paise: amounts.principal,
      total_paise: amounts.penalty + amounts.interest + amounts.principal,
    }));
  }

  /**
   * Update installment paid amounts and statuses based on allocation result.
   */
  private async updateInstallments(
    schedules: {
      id: string;
      principal_paise: bigint;
      interest_paise: bigint;
      principal_paid_paise: bigint;
      interest_paid_paise: bigint;
      penalty_paid_paise: bigint;
    }[],
    allocationResult: AllocationResult,
    tx: TxClient,
  ) {
    // Build a map of additional amounts per installment
    const additions = new Map<
      string,
      { principal: number; interest: number; penalty: number }
    >();

    for (const line of allocationResult.allocations) {
      const instId = line.installmentId;
      if (!instId) continue;

      const existing = additions.get(instId) ?? { principal: 0, interest: 0, penalty: 0 };
      switch (line.component) {
        case 'interest':
          existing.interest += line.amountPaise;
          break;
        case 'principal':
          existing.principal += line.amountPaise;
          break;
        case 'penalty':
          existing.penalty += line.amountPaise;
          break;
      }
      additions.set(instId, existing);
    }

    // Update each affected installment
    for (const schedule of schedules) {
      const add = additions.get(schedule.id);
      if (!add) continue;

      const newPrincipalPaid = Number(schedule.principal_paid_paise) + add.principal;
      const newInterestPaid = Number(schedule.interest_paid_paise) + add.interest;
      const newPenaltyPaid = Number(schedule.penalty_paid_paise) + add.penalty;

      const principalDue = Number(schedule.principal_paise);
      const interestDue = Number(schedule.interest_paise);

      // Determine new status
      const fullyPaid = newPrincipalPaid >= principalDue && newInterestPaid >= interestDue;
      const partiallyPaid = newPrincipalPaid > 0 || newInterestPaid > 0;
      const newStatus = fullyPaid ? 'paid' : partiallyPaid ? 'partial' : 'pending';

      await this.collectionRepository.updateInstallment(
        schedule.id,
        {
          principal_paid_paise: newPrincipalPaid,
          interest_paid_paise: newInterestPaid,
          penalty_paid_paise: newPenaltyPaid,
          status: newStatus,
        },
        tx,
      );
    }
  }

  /**
   * Compute DPD (Days Past Due) and overdue bucket after a collection.
   *
   * DPD = calendar days since the earliest unpaid installment due date.
   * If all installments are paid, DPD = 0.
   */
  private computeDpdAndBucket(
    schedules: {
      id: string;
      due_date: Date;
      principal_paise: bigint;
      interest_paise: bigint;
      principal_paid_paise: bigint;
      interest_paid_paise: bigint;
    }[],
    allocationResult: AllocationResult,
    paymentDate: Date,
  ): { dpd: number; overdueBucket: string | null } {
    // Build updated paid amounts
    const additions = new Map<string, { principal: number; interest: number }>();
    for (const line of allocationResult.allocations) {
      if (!line.installmentId) continue;
      const existing = additions.get(line.installmentId) ?? { principal: 0, interest: 0 };
      if (line.component === 'principal') existing.principal += line.amountPaise;
      if (line.component === 'interest') existing.interest += line.amountPaise;
      additions.set(line.installmentId, existing);
    }

    // Find earliest unpaid installment after applying this collection
    let earliestUnpaidDate: Date | null = null;
    for (const s of schedules) {
      const add = additions.get(s.id) ?? { principal: 0, interest: 0 };
      const principalPaid = Number(s.principal_paid_paise) + add.principal;
      const interestPaid = Number(s.interest_paid_paise) + add.interest;
      const principalDue = Number(s.principal_paise);
      const interestDue = Number(s.interest_paise);

      if (principalPaid < principalDue || interestPaid < interestDue) {
        if (!earliestUnpaidDate || s.due_date < earliestUnpaidDate) {
          earliestUnpaidDate = s.due_date;
        }
      }
    }

    if (!earliestUnpaidDate) {
      return { dpd: 0, overdueBucket: 'bucket_0' };
    }

    const today = paymentDate;
    const diffMs = today.getTime() - earliestUnpaidDate.getTime();
    const dpd = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

    let overdueBucket: string;
    if (dpd === 0) {
      overdueBucket = 'bucket_0';
    } else if (dpd <= 30) {
      overdueBucket = 'bucket_1_30';
    } else if (dpd <= 60) {
      overdueBucket = 'bucket_31_60';
    } else if (dpd <= 90) {
      overdueBucket = 'bucket_61_90';
    } else {
      overdueBucket = 'bucket_90_plus';
    }

    return { dpd, overdueBucket };
  }

  /**
   * List collections with optional filters and pagination.
   */
  async listCollections(params: {
    loanId?: string;
    skip?: number;
    take?: number;
    startDate?: string;
    endDate?: string;
    loanNumber?: string;
  }) {
    return this.collectionRepository.findAll(params);
  }
}
