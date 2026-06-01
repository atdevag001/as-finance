import { Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import { JournalSourceType } from '@as-finance/shared';
import { PrismaService } from '../../database/prisma.service';
import { CollectionRepository } from '../collection/collection.repository';
import { AccountingService } from '../accounting/accounting.service';
import { AuditService } from '../audit/audit.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { ReceiptService } from '../receipt/receipt.service';
import { ReverseCollectionDto } from './dto/reverse-collection.dto';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../common/errors';

// Configure Decimal.js: ROUND_HALF_UP for financial calculations
Decimal.set({ rounding: Decimal.ROUND_HALF_UP });

/**
 * Prisma transaction client type.
 */
type TxClient = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

/**
 * Reversal service — orchestrates atomic collection reversal with compensating
 * entries, schedule rollback, ledger mirror, and receipt management.
 *
 * Responsibilities:
 * - Idempotency via IdempotencyService
 * - Atomic execution within prisma.$transaction()
 * - Compensating collection record (negative amount, is_reversal=true)
 * - Reverse allocation records (negate originals)
 * - Restore installment paid amounts and statuses to pre-collection state
 * - Mirror journal entry (original debits→credits, credits→debits)
 * - Mark original receipt as reversed, generate compensating receipt
 * - Update loan cached_outstanding, DPD, overdue_bucket
 * - Audit logging with reversal reason
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8
 */
@Injectable()
export class ReversalService {
  private readonly logger = new Logger(ReversalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly collectionRepository: CollectionRepository,
    private readonly accountingService: AccountingService,
    private readonly auditService: AuditService,
    private readonly idempotencyService: IdempotencyService,
    private readonly receiptService: ReceiptService,
  ) {}

  /**
   * Reverse a collection atomically.
   *
   * 1. Check idempotency — return cached result for duplicate key
   * 2. Execute within prisma.$transaction():
   *    a. Verify collection not already reversed, not a reversal itself
   *    b. Create compensating collection record (negative amount, is_reversal=true)
   *    c. Create reverse allocation records (negate originals)
   *    d. Restore installment paid amounts and statuses to pre-collection state
   *    e. Create mirror journal entry (original debits→credits, credits→debits)
   *    f. Mark original receipt as reversed, generate compensating receipt
   *    g. Update loan cached_outstanding, DPD, overdue_bucket
   *    h. Create audit log with reversal reason
   *    i. Store idempotency result
   * 3. If any step fails, entire transaction rolls back
   */
  async reverseCollection(dto: ReverseCollectionDto, actorId: string, actorRole: string) {
    // 1. Idempotency check
    const cached = await this.idempotencyService.find(dto.idempotencyKey);
    if (cached) {
      this.logger.log({
        msg: 'Returning cached reversal result (idempotency hit)',
        idempotencyKey: dto.idempotencyKey,
      });
      return { statusCode: cached.resultStatus, data: cached.resultBody };
    }

    // 2. Execute atomic reversal transaction
    const result = await this.prisma.$transaction(async (tx: TxClient) => {
      return this.executeReversal(tx, dto, actorId, actorRole);
    });

    return { statusCode: 201, data: result };
  }

  /**
   * Execute the reversal atomically within a transaction.
   */
  private async executeReversal(
    tx: TxClient,
    dto: ReverseCollectionDto,
    actorId: string,
    actorRole: string,
  ) {
    // ── Step a: Fetch and validate original collection ──
    const original = await this.getOriginalCollection(dto.collectionId, tx);

    // ── Lock the loan row ──
    const lockedLoan = await this.collectionRepository.lockLoanForUpdate(original.loan_id, tx);
    if (!lockedLoan) {
      throw new NotFoundError(`Loan not found: ${original.loan_id}`);
    }

    // Fetch full loan details for DPD/outstanding recalculation
    const loan = await this.collectionRepository.getLoanForCollection(original.loan_id, tx);
    if (!loan) {
      throw new NotFoundError(`Loan not found: ${original.loan_id}`);
    }

    // ── Step b: Create compensating collection record ──
    const originalAllocations = await this.getOriginalAllocations(dto.collectionId, tx);

    // Look up account IDs for journal entry
    const originalJournal = await this.getOriginalJournalEntry(original.journal_entry_id, tx);

    const reversalCollection = await tx.collections.create({
      data: {
        loan_id: original.loan_id,
        amount_paise: -Number(original.amount_paise),
        payment_date: new Date(),
        payment_mode: original.payment_mode as never,
        status: 'posted' as never,
        is_reversal: true,
        original_collection_id: original.id,
        reversal_reason: dto.reason,
        collected_by: actorId,
        journal_entry_id: original.journal_entry_id, // placeholder, updated below
        idempotency_key: dto.idempotencyKey,
      },
      select: { id: true, loan_id: true, amount_paise: true, payment_date: true },
    });

    // ── Step c: Create reverse allocation records ──
    for (const alloc of originalAllocations) {
      await tx.collection_allocations.create({
        data: {
          collection_id: reversalCollection.id,
          installment_id: alloc.installment_id,
          penalty_paise: -Number(alloc.penalty_paise),
          interest_paise: -Number(alloc.interest_paise),
          principal_paise: -Number(alloc.principal_paise),
          total_paise: -Number(alloc.total_paise),
        },
      });
    }

    // ── Step c2: Reverse penalty payments ──
    // For each original allocation that paid penalty on an installment, find the
    // penalty(ies) on that installment and reverse paid_paise / clear is_paid.
    for (const alloc of originalAllocations) {
      const penaltyPaise = BigInt(alloc.penalty_paise);
      if (penaltyPaise <= 0n) continue;

      const paidPenalties = await tx.penalties.findMany({
        where: {
          installment_id: alloc.installment_id,
          paid_paise: { gt: 0n },
        },
        orderBy: [{ penalty_period: 'desc' }, { created_at: 'desc' }],
        select: { id: true, paid_paise: true },
      });

      let remaining = penaltyPaise;
      for (const p of paidPenalties) {
        if (remaining <= 0n) break;
        const dec = remaining < p.paid_paise ? remaining : p.paid_paise;
        await tx.penalties.update({
          where: { id: p.id },
          data: {
            paid_paise: { decrement: dec },
            is_paid: false,
          },
        });
        remaining -= dec;
      }
    }

    // ── Step d: Restore installment paid amounts and statuses ──
    await this.restoreInstallments(originalAllocations, loan.schedules, tx);

    // ── Step e: Create mirror journal entry ──
    const mirrorJournalLines = originalJournal.lines.map((line: { account_id: string; credit_paise: bigint; debit_paise: bigint }) => ({
      accountId: line.account_id,
      debitPaise: Number(line.credit_paise),
      creditPaise: Number(line.debit_paise),
    }));

    const mirrorJournal = await this.accountingService.createJournalEntry(
      {
        date: new Date().toISOString(),
        description: `Reversal of collection ${original.id} for loan ${loan.loan_number}`,
        sourceType: JournalSourceType.REVERSAL,
        sourceId: reversalCollection.id,
        createdBy: actorId,
        lines: mirrorJournalLines,
      },
      tx,
    );

    // Update the reversal collection with the correct journal entry ID
    await tx.collections.update({
      where: { id: reversalCollection.id },
      data: { journal_entry_id: mirrorJournal.id },
    });

    // ── Step f: Mark original receipt as reversed, generate compensating receipt ──
    const originalReceipts = await tx.receipts.findMany({
      where: { collection_id: original.id },
      select: { id: true, amount_paise: true, payment_mode: true },
    });

    // Mark original collection as reversed
    await tx.collections.update({
      where: { id: original.id },
      data: { status: 'reversed' as never },
    });

    const officerName = await this.collectionRepository.getOfficerName(actorId, tx);

    // Compute totals from original allocations for receipt components
    let totalPenalty = 0;
    let totalInterest = 0;
    let totalPrincipal = 0;
    for (const alloc of originalAllocations) {
      totalPenalty += Number(alloc.penalty_paise);
      totalInterest += Number(alloc.interest_paise);
      totalPrincipal += Number(alloc.principal_paise);
    }

    // Compute new outstanding after reversal
    const currentOutstanding = Number(loan.cached_outstanding_paise ?? 0);
    const reversalAmount = Number(original.amount_paise);
    const newOutstanding = currentOutstanding + reversalAmount;

    let compensatingReceipt: { id: string; receipt_number: string } | null = null;

    if (originalReceipts.length > 0) {
      const originalReceipt = originalReceipts[0]!;

      // Generate compensating receipt
      compensatingReceipt = await this.receiptService.generateReceipt(
        {
          collectionId: reversalCollection.id,
          loanId: original.loan_id,
          customerId: loan.customer_id,
          amountPaise: -reversalAmount,
          paymentDate: new Date(),
          paymentMode: original.payment_mode,
          penaltyComponentPaise: -totalPenalty,
          interestComponentPaise: -totalInterest,
          principalComponentPaise: -totalPrincipal,
          outstandingAfterPaise: newOutstanding,
          officerName,
          customerName: loan.customer.full_name,
          loanNumber: loan.loan_number,
          isReversal: true,
          originalReceiptId: originalReceipt.id,
        },
        tx,
      );

      // Mark original receipt as reversed and link to compensating receipt
      if (compensatingReceipt) {
        await this.receiptService.markAsReversed(
          originalReceipt.id,
          compensatingReceipt.id,
          tx,
        );
      }
    }

    // ── Step g: Update loan cached_outstanding, DPD, overdue_bucket ──
    const { dpd, overdueBucket } = this.computeDpdAndBucket(loan.schedules, originalAllocations);

    await this.collectionRepository.updateLoanOutstanding(
      original.loan_id,
      {
        cached_outstanding_paise: BigInt(Math.max(0, newOutstanding)),
        dpd,
        overdue_bucket: overdueBucket,
      },
      tx,
    );

    // ── Step h: Create audit log with reversal reason ──
    await this.auditService.createAuditLog(
      {
        action_type: 'collection_reversed',
        actor_id: actorId,
        actor_role: actorRole,
        target_entity: 'collection',
        target_id: original.id,
        before_state: {
          collection_id: original.id,
          amount_paise: Number(original.amount_paise),
          outstanding_paise: currentOutstanding,
        },
        after_state: {
          reversal_collection_id: reversalCollection.id,
          outstanding_paise: newOutstanding,
          dpd,
        },
        remarks: dto.reason,
      },
      tx,
    );

    // ── Step i: Store idempotency result ──
    const resultBody = {
      reversalCollectionId: reversalCollection.id,
      originalCollectionId: original.id,
      loanId: original.loan_id,
      loanNumber: loan.loan_number,
      reversedAmountPaise: Number(original.amount_paise),
      mirrorJournalEntryId: mirrorJournal.id,
      compensatingReceiptId: compensatingReceipt?.id ?? null,
      compensatingReceiptNumber: compensatingReceipt?.receipt_number ?? null,
      outstandingAfterPaise: newOutstanding,
      reason: dto.reason,
    };

    await this.idempotencyService.store(
      dto.idempotencyKey,
      'reversal',
      201,
      resultBody,
      tx,
    );

    this.logger.log({
      msg: 'Collection reversed successfully',
      originalCollectionId: original.id,
      reversalCollectionId: reversalCollection.id,
      loanId: original.loan_id,
      loanNumber: loan.loan_number,
      reversedAmountPaise: Number(original.amount_paise),
    });

    return resultBody;
  }

  /**
   * Fetch and validate the original collection for reversal.
   *
   * Throws:
   * - NotFoundError if collection does not exist
   * - ConflictError if collection is already reversed (COLLECTION_ALREADY_REVERSED)
   * - BusinessRuleError if collection is itself a reversal (CANNOT_REVERSE_REVERSAL)
   */
  private async getOriginalCollection(collectionId: string, tx: TxClient) {
    const collection = await tx.collections.findUnique({
      where: { id: collectionId },
      select: {
        id: true,
        loan_id: true,
        amount_paise: true,
        payment_date: true,
        payment_mode: true,
        status: true,
        is_reversal: true,
        journal_entry_id: true,
      },
    });

    if (!collection) {
      throw new NotFoundError(`Collection not found: ${collectionId}`);
    }

    // Prevent reversal of a reversal (no chained reversals)
    if (collection.is_reversal) {
      throw new BusinessRuleError(
        'Cannot reverse a reversal. Chained reversals are not supported.',
        'CANNOT_REVERSE_REVERSAL',
      );
    }

    // Prevent double reversal
    if (collection.status === 'reversed') {
      throw new ConflictError(
        'Collection has already been reversed.',
        'COLLECTION_ALREADY_REVERSED',
      );
    }

    return collection;
  }

  /**
   * Fetch original allocation records for the collection.
   */
  private async getOriginalAllocations(collectionId: string, tx: TxClient) {
    return tx.collection_allocations.findMany({
      where: { collection_id: collectionId },
      select: {
        id: true,
        installment_id: true,
        penalty_paise: true,
        interest_paise: true,
        principal_paise: true,
        total_paise: true,
      },
    });
  }

  /**
   * Fetch the original journal entry with its lines for mirroring.
   */
  private async getOriginalJournalEntry(journalEntryId: string, tx: TxClient) {
    const entry = await tx.journal_entries.findUnique({
      where: { id: journalEntryId },
      select: {
        id: true,
        lines: {
          select: {
            account_id: true,
            debit_paise: true,
            credit_paise: true,
          },
        },
      },
    });

    if (!entry) {
      throw new NotFoundError(`Journal entry not found: ${journalEntryId}`);
    }

    return entry;
  }

  /**
   * Restore installment paid amounts and statuses to pre-collection state.
   *
   * For each allocation, subtract the allocated amounts from the installment's
   * paid totals and recompute the status.
   */
  private async restoreInstallments(
    allocations: {
      installment_id: string;
      penalty_paise: bigint;
      interest_paise: bigint;
      principal_paise: bigint;
    }[],
    schedules: {
      id: string;
      principal_paise: bigint;
      interest_paise: bigint;
      principal_paid_paise: bigint;
      interest_paid_paise: bigint;
      penalty_paid_paise: bigint;
    }[],
    tx: TxClient,
  ) {
    // Build a map of amounts to subtract per installment
    const subtractions = new Map<
      string,
      { principal: number; interest: number; penalty: number }
    >();

    for (const alloc of allocations) {
      const existing = subtractions.get(alloc.installment_id) ?? {
        principal: 0,
        interest: 0,
        penalty: 0,
      };
      existing.principal += Number(alloc.principal_paise);
      existing.interest += Number(alloc.interest_paise);
      existing.penalty += Number(alloc.penalty_paise);
      subtractions.set(alloc.installment_id, existing);
    }

    // Update each affected installment
    for (const schedule of schedules) {
      const sub = subtractions.get(schedule.id);
      if (!sub) continue;

      const newPrincipalPaid = Math.max(0, Number(schedule.principal_paid_paise) - sub.principal);
      const newInterestPaid = Math.max(0, Number(schedule.interest_paid_paise) - sub.interest);
      const newPenaltyPaid = Math.max(0, Number(schedule.penalty_paid_paise) - sub.penalty);

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
   * Compute DPD and overdue bucket after reversal.
   *
   * After reversal, the installment paid amounts have been restored.
   * We need to find the earliest unpaid installment and compute DPD from today.
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
    originalAllocations: {
      installment_id: string;
      principal_paise: bigint;
      interest_paise: bigint;
    }[],
  ): { dpd: number; overdueBucket: string | null } {
    // Build subtraction map from original allocations (these are being reversed)
    const subtractions = new Map<string, { principal: number; interest: number }>();
    for (const alloc of originalAllocations) {
      const existing = subtractions.get(alloc.installment_id) ?? { principal: 0, interest: 0 };
      existing.principal += Number(alloc.principal_paise);
      existing.interest += Number(alloc.interest_paise);
      subtractions.set(alloc.installment_id, existing);
    }

    // Find earliest unpaid installment after reversal
    let earliestUnpaidDate: Date | null = null;
    for (const s of schedules) {
      const sub = subtractions.get(s.id) ?? { principal: 0, interest: 0 };
      const principalPaid = Math.max(0, Number(s.principal_paid_paise) - sub.principal);
      const interestPaid = Math.max(0, Number(s.interest_paid_paise) - sub.interest);
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

    const today = new Date();
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
}
