import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

/**
 * Prisma transaction client type.
 */
type TxClient = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

/**
 * Cashbook repository — data access for expenses, cash transactions, and handovers.
 */
@Injectable()
export class CashbookRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create an expense record.
   */
  async createExpense(
    data: {
      id?: string;
      category: string;
      amount_paise: bigint;
      expense_date: Date;
      description: string;
      document_file_id?: string;
      journal_entry_id: string;
      recorded_by: string;
    },
    tx?: TxClient,
  ) {
    const client = tx ?? this.prisma;
    return client.expenses.create({ data: data as never });
  }

  /**
   * Find an expense by ID.
   */
  async findExpenseById(id: string) {
    return this.prisma.expenses.findUnique({
      where: { id },
      include: {
        journal_entry: {
          select: { id: true, description: true, entry_date: true },
        },
        recorder: { select: { id: true, full_name: true } },
        document: { select: { id: true, original_filename: true } },
      },
    });
  }

  /**
   * List expenses with filters and pagination.
   */
  async findExpenses(params: {
    skip?: number;
    take?: number;
    category?: string;
    startDate?: Date;
    endDate?: Date;
  }) {
    const where: Record<string, unknown> = {};
    if (params.category) where['category'] = params.category;
    if (params.startDate || params.endDate) {
      const dateFilter: Record<string, Date> = {};
      if (params.startDate) dateFilter['gte'] = params.startDate;
      if (params.endDate) dateFilter['lte'] = params.endDate;
      where['expense_date'] = dateFilter;
    }

    const [data, total] = await Promise.all([
      this.prisma.expenses.findMany({
        where,
        skip: params.skip ?? 0,
        take: params.take ?? 20,
        include: {
          recorder: { select: { id: true, full_name: true } },
        },
        orderBy: { expense_date: 'desc' as const },
      }),
      this.prisma.expenses.count({ where }),
    ]);

    return { data, total };
  }

  /**
   * Create a cash handover record.
   */
  async createHandover(data: {
    collection_officer_id: string;
    receiving_officer_id: string;
    handover_date: Date;
    total_amount_paise: bigint;
  }) {
    return this.prisma.cash_handover_records.create({ data: data as never });
  }

  /**
   * Find a handover by ID.
   */
  async findHandoverById(id: string) {
    return this.prisma.cash_handover_records.findUnique({
      where: { id },
      include: {
        collection_officer: { select: { id: true, full_name: true } },
        receiving_officer: { select: { id: true, full_name: true } },
      },
    });
  }

  /**
   * Update handover verification status.
   */
  async updateHandoverVerification(
    id: string,
    data: {
      verification_status: string;
      discrepancy_amount_paise?: bigint | null;
      discrepancy_notes?: string | null;
      verified_at: Date;
    },
    tx?: TxClient,
  ) {
    const client = tx ?? this.prisma;
    return client.cash_handover_records.update({
      where: { id },
      data: data as never,
      include: {
        collection_officer: { select: { id: true, full_name: true } },
        receiving_officer: { select: { id: true, full_name: true } },
      },
    });
  }

  /**
   * List handovers with filters and pagination.
   */
  async findHandovers(params: {
    skip?: number;
    take?: number;
    officerId?: string;
    verificationStatus?: string;
    startDate?: Date;
    endDate?: Date;
  }) {
    const where: Record<string, unknown> = {};
    if (params.officerId) where['collection_officer_id'] = params.officerId;
    if (params.verificationStatus) where['verification_status'] = params.verificationStatus;
    if (params.startDate || params.endDate) {
      const dateFilter: Record<string, Date> = {};
      if (params.startDate) dateFilter['gte'] = params.startDate;
      if (params.endDate) dateFilter['lte'] = params.endDate;
      where['handover_date'] = dateFilter;
    }

    const [data, total] = await Promise.all([
      this.prisma.cash_handover_records.findMany({
        where,
        skip: params.skip ?? 0,
        take: params.take ?? 20,
        include: {
          collection_officer: { select: { id: true, full_name: true } },
          receiving_officer: { select: { id: true, full_name: true } },
        },
        orderBy: { handover_date: 'desc' as const },
      }),
      this.prisma.cash_handover_records.count({ where }),
    ]);

    return { data, total };
  }

  /**
   * Create a cash transaction record.
   */
  async createCashTransaction(
    data: {
      transaction_date: Date;
      type: string;
      category: string;
      amount_paise: bigint;
      description: string;
      source_type?: string;
      source_id?: string;
      recorded_by: string;
    },
    tx?: TxClient,
  ) {
    const client = tx ?? this.prisma;
    return client.cash_transactions.create({ data: data as never });
  }

  /**
   * Get cash transactions for a specific date, used for daily summary.
   */
  async getCashTransactionsForDate(date: Date) {
    return this.prisma.cash_transactions.findMany({
      where: { transaction_date: date },
      orderBy: { created_at: 'asc' as const },
    });
  }

  /**
   * Get the closing balance (sum of all inflows - outflows) up to but not including the given date.
   * This serves as the opening balance for the given date.
   */
  async getBalanceBeforeDate(date: Date): Promise<{ totalInflows: bigint; totalOutflows: bigint }> {
    const [inflowResult, outflowResult] = await Promise.all([
      this.prisma.cash_transactions.aggregate({
        where: { transaction_date: { lt: date }, type: 'inflow' },
        _sum: { amount_paise: true },
      }),
      this.prisma.cash_transactions.aggregate({
        where: { transaction_date: { lt: date }, type: 'outflow' },
        _sum: { amount_paise: true },
      }),
    ]);

    return {
      totalInflows: inflowResult._sum.amount_paise ?? 0n,
      totalOutflows: outflowResult._sum.amount_paise ?? 0n,
    };
  }

  /**
   * Get income journal lines for a date, classified by source account.
   */
  async getIncomeBySourceForDate(date: Date) {
    return this.prisma.journal_lines.findMany({
      where: {
        journal_entry: { entry_date: date },
        account: { category: 'income' },
        credit_paise: { gt: 0n },
      },
      select: {
        credit_paise: true,
        account: { select: { id: true, code: true, name: true } },
      },
    });
  }
}
