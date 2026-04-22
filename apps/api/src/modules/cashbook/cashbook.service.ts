import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CashbookRepository } from './cashbook.repository';
import { AccountingService } from '../accounting/accounting.service';
import { AuditService } from '../audit/audit.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { CreateHandoverDto } from './dto/create-handover.dto';
import { VerifyHandoverDto } from './dto/verify-handover.dto';
import { BusinessRuleError, NotFoundError } from '../../common/errors';
import { AccountingRepository } from '../accounting/accounting.repository';

/**
 * Prisma transaction client type.
 */
type TxClient = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

/**
 * Income classification by source account.
 */
export interface IncomeBySource {
  accountId: string;
  accountCode: string;
  accountName: string;
  amountPaise: string;
}

/**
 * Daily summary input for the pure computation function.
 */
export interface DailySummaryInput {
  openingBalancePaise: bigint;
  transactions: { type: 'inflow' | 'outflow'; amountPaise: bigint; category: string }[];
}

/**
 * Daily summary output.
 */
export interface DailySummaryOutput {
  openingBalancePaise: string;
  cashInflowsPaise: string;
  cashOutflowsPaise: string;
  closingBalancePaise: string;
  hasDiscrepancy: boolean;
}

/**
 * Pure function: compute daily cash summary.
 *
 * opening_balance + cash_inflows - cash_outflows = closing_balance
 * Exported for property-based testing (Requirement 13.5, Property 27).
 *
 * Rounding: all values are integer paise, no rounding needed.
 */
export function computeDailySummary(input: DailySummaryInput): DailySummaryOutput {
  let cashInflowsPaise = 0n;
  let cashOutflowsPaise = 0n;

  for (const tx of input.transactions) {
    if (tx.type === 'inflow') {
      cashInflowsPaise += tx.amountPaise;
    } else {
      cashOutflowsPaise += tx.amountPaise;
    }
  }

  const closingBalancePaise = input.openingBalancePaise + cashInflowsPaise - cashOutflowsPaise;

  // Discrepancy flag: closing balance should never be negative in normal operations
  const hasDiscrepancy = closingBalancePaise < 0n;

  return {
    openingBalancePaise: input.openingBalancePaise.toString(),
    cashInflowsPaise: cashInflowsPaise.toString(),
    cashOutflowsPaise: cashOutflowsPaise.toString(),
    closingBalancePaise: closingBalancePaise.toString(),
    hasDiscrepancy,
  };
}

/**
 * Cashbook service — expense recording, cash handovers, and daily reconciliation.
 *
 * Enforces:
 * - Atomic expense recording with journal entry (DR Expense, CR Cash) (Requirement 13.4)
 * - Cash handover recording and verification (Requirement 13.2)
 * - Daily cash reconciliation: opening + inflows - outflows = closing (Requirement 13.5)
 * - Income classification by source (Requirement 13.6)
 */
@Injectable()
export class CashbookService {
  private readonly logger = new Logger(CashbookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cashbookRepository: CashbookRepository,
    private readonly accountingService: AccountingService,
    private readonly accountingRepository: AccountingRepository,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Record an expense atomically with journal entry (DR Expense, CR Cash/Bank).
   *
   * Creates expense record + journal entry + cash transaction + audit log
   * within a single database transaction.
   */
  async createExpense(dto: CreateExpenseDto, actorId: string, actorRole: string) {
    // Resolve expense account by category mapping
    const expenseAccountCode = this.mapCategoryToAccountCode(dto.category);

    // Determine credit account based on payment mode (default: cash)
    const paymentMode = dto.paymentMode ?? 'cash';
    const creditAccountCode = paymentMode === 'cash' ? '1001' : '1002'; // 1001=Cash, 1002=Bank

    // Look up account IDs
    const [expenseAccount, creditAccount] = await Promise.all([
      this.accountingRepository.findAccountByCode(expenseAccountCode),
      this.accountingRepository.findAccountByCode(creditAccountCode),
    ]);

    if (!expenseAccount) {
      throw new BusinessRuleError(
        `No expense account found for category: ${dto.category}`,
        'INVALID_EXPENSE_CATEGORY',
      );
    }
    if (!creditAccount) {
      const accountName = paymentMode === 'cash' ? 'Cash' : 'Bank';
      throw new BusinessRuleError(`${accountName} account (${creditAccountCode}) not found`, 'MISSING_ACCOUNT');
    }

    const result = await this.prisma.$transaction(async (tx: TxClient) => {
      // 1. Create journal entry: DR Expense, CR Cash/Bank
      const journalEntry = await this.accountingService.createJournalEntry(
        {
          date: dto.date,
          description: `Expense: ${dto.category} - ${dto.description}`,
          sourceType: 'expense' as never,
          sourceId: 'pending', // Will be updated after expense creation
          lines: [
            { accountId: expenseAccount.id, debitPaise: dto.amountPaise, creditPaise: 0 },
            { accountId: creditAccount.id, debitPaise: 0, creditPaise: dto.amountPaise },
          ],
          createdBy: actorId,
        },
        tx,
      );

      // 2. Create expense record
      const expense = await this.cashbookRepository.createExpense(
        {
          category: dto.category,
          amount_paise: BigInt(dto.amountPaise),
          expense_date: new Date(dto.date),
          description: dto.description,
          document_file_id: dto.documentFileId,
          journal_entry_id: journalEntry.id,
          recorded_by: actorId,
        },
        tx,
      );

      // 3. Create cash transaction record (outflow)
      await this.cashbookRepository.createCashTransaction(
        {
          transaction_date: new Date(dto.date),
          type: 'outflow',
          category: 'expense',
          amount_paise: BigInt(dto.amountPaise),
          description: `Expense: ${dto.category} - ${dto.description}`,
          source_type: 'expense',
          source_id: expense.id,
          recorded_by: actorId,
        },
        tx,
      );

      // 4. Create audit log
      await this.auditService.createAuditLog(
        {
          action_type: 'expense_recorded',
          actor_id: actorId,
          actor_role: actorRole,
          target_entity: 'expense',
          target_id: expense.id,
          after_state: {
            category: dto.category,
            amountPaise: dto.amountPaise,
            date: dto.date,
            description: dto.description,
          },
        },
        tx,
      );

      return { expense, journalEntry };
    });

    this.logger.log({
      msg: 'Expense recorded',
      expenseId: result.expense.id,
      category: dto.category,
      amountPaise: dto.amountPaise,
    });

    return result;
  }

  /**
   * Record a cash handover from collection officer to receiving officer.
   */
  async createHandover(dto: CreateHandoverDto, actorId: string, actorRole: string) {
    const handover = await this.cashbookRepository.createHandover({
      collection_officer_id: actorId,
      receiving_officer_id: dto.receivingOfficerId,
      handover_date: new Date(dto.handoverDate),
      total_amount_paise: BigInt(dto.totalAmountPaise),
    });

    // Create audit log for handover
    await this.auditService.createAuditLog({
      action_type: 'cash_handover',
      actor_id: actorId,
      actor_role: actorRole,
      target_entity: 'cash_handover',
      target_id: handover.id,
      after_state: {
        totalAmountPaise: dto.totalAmountPaise,
        receivingOfficerId: dto.receivingOfficerId,
        handoverDate: dto.handoverDate,
      },
    });

    this.logger.log({
      msg: 'Cash handover recorded',
      handoverId: handover.id,
      totalAmountPaise: dto.totalAmountPaise,
    });

    return handover;
  }

  /**
   * Verify a cash handover, optionally flagging discrepancies.
   */
  async verifyHandover(handoverId: string, dto: VerifyHandoverDto, actorId: string, actorRole: string) {
    const existing = await this.cashbookRepository.findHandoverById(handoverId);
    if (!existing) {
      throw new NotFoundError('Cash handover not found');
    }

    if (existing.verification_status !== 'pending') {
      throw new BusinessRuleError(
        `Handover already ${existing.verification_status}`,
        'HANDOVER_ALREADY_VERIFIED',
      );
    }

    if (dto.verificationStatus === 'discrepancy' && dto.discrepancyAmountPaise == null) {
      throw new BusinessRuleError(
        'Discrepancy amount is required when flagging a discrepancy',
        'MISSING_DISCREPANCY_AMOUNT',
      );
    }

    const updated = await this.cashbookRepository.updateHandoverVerification(handoverId, {
      verification_status: dto.verificationStatus,
      discrepancy_amount_paise:
        dto.discrepancyAmountPaise != null ? BigInt(dto.discrepancyAmountPaise) : null,
      discrepancy_notes: dto.discrepancyNotes ?? null,
      verified_at: new Date(),
    });

    this.logger.log({
      msg: 'Cash handover verified',
      handoverId,
      status: dto.verificationStatus,
    });

    return updated;
  }

  /**
   * Get daily cash summary: opening balance + inflows - outflows = closing balance.
   * Also classifies income by source (Requirement 13.6).
   */
  async getDailySummary(date?: string) {
    const summaryDate = date ? new Date(date) : new Date();
    // Normalize to date-only (strip time)
    const dateStr = summaryDate.toISOString().split('T')[0]!;
    const dateOnly = new Date(dateStr);

    // Get opening balance (all transactions before this date)
    const { totalInflows: priorInflows, totalOutflows: priorOutflows } =
      await this.cashbookRepository.getBalanceBeforeDate(dateOnly);
    const openingBalancePaise = priorInflows - priorOutflows;

    // Get today's transactions
    const transactions = await this.cashbookRepository.getCashTransactionsForDate(dateOnly);

    // Use pure function for computation
    const summary = computeDailySummary({
      openingBalancePaise,
      transactions: transactions.map((tx) => ({
        type: tx.type as 'inflow' | 'outflow',
        amountPaise: tx.amount_paise,
        category: tx.category,
      })),
    });

    // Classify income by source for the date
    const incomeLines = await this.cashbookRepository.getIncomeBySourceForDate(dateOnly);
    const incomeBySource = new Map<string, IncomeBySource>();
    for (const line of incomeLines) {
      const key = line.account.id;
      const existing = incomeBySource.get(key);
      if (existing) {
        const current = BigInt(existing.amountPaise);
        existing.amountPaise = (current + (line.credit_paise ?? 0n)).toString();
      } else {
        incomeBySource.set(key, {
          accountId: line.account.id,
          accountCode: line.account.code,
          accountName: line.account.name,
          amountPaise: (line.credit_paise ?? 0n).toString(),
        });
      }
    }

    return {
      date: dateOnly.toISOString().split('T')[0],
      ...summary,
      incomeBySource: [...incomeBySource.values()],
      transactionCount: transactions.length,
    };
  }

  /**
   * List expenses with filters.
   */
  async findExpenses(params: {
    skip?: number;
    take?: number;
    category?: string;
    startDate?: string;
    endDate?: string;
  }) {
    return this.cashbookRepository.findExpenses({
      skip: params.skip,
      take: params.take,
      category: params.category,
      startDate: params.startDate ? new Date(params.startDate) : undefined,
      endDate: params.endDate ? new Date(params.endDate) : undefined,
    });
  }

  /**
   * List handovers with filters.
   */
  async findHandovers(params: {
    skip?: number;
    take?: number;
    officerId?: string;
    verificationStatus?: string;
    startDate?: string;
    endDate?: string;
  }) {
    return this.cashbookRepository.findHandovers({
      skip: params.skip,
      take: params.take,
      officerId: params.officerId,
      verificationStatus: params.verificationStatus,
      startDate: params.startDate ? new Date(params.startDate) : undefined,
      endDate: params.endDate ? new Date(params.endDate) : undefined,
    });
  }

  /**
   * Map expense category string to chart of accounts code.
   * Falls back to Other Expense (5099) for unknown categories.
   */
  private mapCategoryToAccountCode(category: string): string {
    const mapping: Record<string, string> = {
      salary: '5001',
      rent: '5002',
      travel: '5003',
      office: '5004',
      office_supplies: '5004',
      utilities: '5005',
      maintenance: '5006',
      other: '5099',
    };
    return mapping[category.toLowerCase()] ?? '5099';
  }
}
