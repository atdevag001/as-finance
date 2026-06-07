import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

/**
 * Prisma transaction client type — a subset of PrismaService used within
 * `prisma.$transaction()` callbacks.
 */
type TxClient = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

export interface CreateJournalEntryData {
  entry_date: Date;
  description: string;
  source_type: string;
  source_id: string;
  total_debit_paise: bigint;
  total_credit_paise: bigint;
  created_by: string;
  lines: {
    account_id: string;
    debit_paise: bigint;
    credit_paise: bigint;
  }[];
}

const JOURNAL_ENTRY_SELECT = {
  id: true,
  entry_date: true,
  description: true,
  source_type: true,
  source_id: true,
  total_debit_paise: true,
  total_credit_paise: true,
  created_by: true,
  created_at: true,
  lines: {
    select: {
      id: true,
      account_id: true,
      debit_paise: true,
      credit_paise: true,
      account: {
        select: { id: true, code: true, name: true, category: true },
      },
    },
  },
};

const ACCOUNT_SELECT = {
  id: true,
  code: true,
  name: true,
  category: true,
  parent_id: true,
  is_system: true,
  is_active: true,
  created_at: true,
};

/**
 * Accounting repository — data access for chart of accounts and journal entries.
 *
 * Append-only for journal entries: no update or delete methods exist by design.
 */
@Injectable()
export class AccountingRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a journal entry with its lines atomically.
   * Accepts an optional Prisma transaction client for cross-module transactions.
   */
  async createJournalEntry(data: CreateJournalEntryData, tx?: TxClient) {
    const client = tx ?? this.prisma;
    return (client).journal_entries.create({
      data: {
        entry_date: data.entry_date,
        description: data.description,
        source_type: data.source_type as never,
        source_id: data.source_id,
        total_debit_paise: data.total_debit_paise,
        total_credit_paise: data.total_credit_paise,
        created_by: data.created_by,
        lines: {
          create: data.lines.map((line) => ({
            account_id: line.account_id,
            debit_paise: line.debit_paise,
            credit_paise: line.credit_paise,
          })),
        },
      },
      select: JOURNAL_ENTRY_SELECT,
    });
  }

  /** Get all chart of accounts entries. */
  async findAllAccounts() {
    return this.prisma.chart_of_accounts.findMany({
      where: { is_active: true },
      orderBy: { code: 'asc' },
      select: ACCOUNT_SELECT,
    });
  }

  /** Find a single account by ID. */
  async findAccountById(id: string) {
    return this.prisma.chart_of_accounts.findUnique({
      where: { id },
      select: ACCOUNT_SELECT,
    });
  }

  /** Find a single account by code. */
  async findAccountByCode(code: string) {
    return this.prisma.chart_of_accounts.findUnique({
      where: { code },
      select: ACCOUNT_SELECT,
    });
  }

  /** Get journal entries for a date range (daybook), chronological order. */
  async findJournalEntriesByDateRange(startDate: Date, endDate: Date) {
    return this.prisma.journal_entries.findMany({
      where: {
        entry_date: { gte: startDate, lte: endDate },
      },
      orderBy: { entry_date: 'asc' },
      select: JOURNAL_ENTRY_SELECT,
    });
  }

  /** Get journal entries with filtering and pagination. */
  async findJournalEntries(params: {
    skip?: number;
    take?: number;
    sourceType?: string;
    sourceId?: string;
    startDate?: Date;
    endDate?: Date;
  }) {
    const where: Record<string, unknown> = {};

    if (params.sourceType) {
      where['source_type'] = params.sourceType;
    }
    if (params.sourceId) {
      where['source_id'] = params.sourceId;
    }
    if (params.startDate || params.endDate) {
      const dateFilter: Record<string, Date> = {};
      if (params.startDate) dateFilter['gte'] = params.startDate;
      if (params.endDate) dateFilter['lte'] = params.endDate;
      where['entry_date'] = dateFilter;
    }

    const [data, total] = await Promise.all([
      this.prisma.journal_entries.findMany({
        where,
        skip: params.skip ?? 0,
        take: params.take ?? 50,
        orderBy: { entry_date: 'desc' },
        select: JOURNAL_ENTRY_SELECT,
      }),
      this.prisma.journal_entries.count({ where }),
    ]);

    return { data, total };
  }

  /**
   * Get aggregated debit/credit totals per account for trial balance.
   * Groups all journal lines by account up to the given date.
   */
  async getAccountBalances(asOfDate: Date) {
    const results = await this.prisma.journal_lines.groupBy({
      by: ['account_id'],
      where: {
        journal_entry: { entry_date: { lte: asOfDate } },
      },
      _sum: {
        debit_paise: true,
        credit_paise: true,
      },
    });

    return results;
  }

  /**
   * Get aggregated debit/credit totals per account for a date range.
   * Used for P&L. DB-side groupBy avoids loading millions of rows into memory.
   */
  async getAccountTotalsForRange(filter: { startDate?: Date; endDate?: Date }) {
    const dateFilter: Record<string, Date> = {};
    if (filter.startDate) dateFilter['gte'] = filter.startDate;
    if (filter.endDate) dateFilter['lte'] = filter.endDate;

    return this.prisma.journal_lines.groupBy({
      by: ['account_id'],
      where: Object.keys(dateFilter).length
        ? { journal_entry: { entry_date: dateFilter } }
        : {},
      _sum: {
        debit_paise: true,
        credit_paise: true,
      },
    });
  }

  /**
   * Get aggregated debit/credit totals per account up to a point in time.
   * Used for balance sheet. DB-side groupBy avoids unbounded in-memory aggregation.
   */
  async getAccountTotalsUpTo(asOfDate: Date) {
    return this.prisma.journal_lines.groupBy({
      by: ['account_id'],
      where: {
        journal_entry: { entry_date: { lte: asOfDate } },
      },
      _sum: {
        debit_paise: true,
        credit_paise: true,
      },
    });
  }
}
