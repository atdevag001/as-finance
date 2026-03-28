import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AccountingRepository } from './accounting.repository';
import { CreateJournalEntryDto } from './dto/create-journal-entry.dto';
import { BusinessRuleError } from '../../common/errors';

/**
 * Prisma transaction client type — a subset of PrismaService used within
 * `prisma.$transaction()` callbacks.
 */
type TxClient = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

/**
 * Account balance with category info for financial statements.
 */
interface AccountBalance {
  accountId: string;
  code: string;
  name: string;
  category: string;
  debitPaise: bigint;
  creditPaise: bigint;
  balancePaise: bigint;
}

/**
 * Accounting service — double-entry journal management and financial reporting.
 *
 * Enforces:
 * - Journal entry balance: total debits == total credits (Requirement 12.7)
 * - Immutability: no update or delete of posted journal entries (Requirement 12.8)
 * - Source-to-journal mapping for all finance events (Requirement 12.4)
 */
@Injectable()
export class AccountingService {
  private readonly logger = new Logger(AccountingService.name);

  constructor(private readonly accountingRepository: AccountingRepository) {}

  /**
   * Create a journal entry with balance validation.
   *
   * Validates that total debits == total credits BEFORE persisting.
   * Rejects unbalanced entries with a BusinessRuleError.
   *
   * Accepts an optional Prisma transaction client so the journal entry
   * is written within the same transaction as the finance-affecting operation.
   */
  async createJournalEntry(dto: CreateJournalEntryDto, tx?: TxClient) {
    // Validate: every line must have non-negative amounts
    for (const line of dto.lines) {
      if (line.debitPaise < 0 || line.creditPaise < 0) {
        throw new BusinessRuleError(
          'Journal line amounts must be non-negative',
          'INVALID_JOURNAL_LINE',
        );
      }
      // Each line should have either a debit or credit, not both
      if (line.debitPaise > 0 && line.creditPaise > 0) {
        throw new BusinessRuleError(
          'A journal line cannot have both debit and credit amounts',
          'INVALID_JOURNAL_LINE',
        );
      }
      // Each line must have at least one non-zero amount
      if (line.debitPaise === 0 && line.creditPaise === 0) {
        throw new BusinessRuleError(
          'A journal line must have a non-zero debit or credit amount',
          'INVALID_JOURNAL_LINE',
        );
      }
    }

    // Calculate totals and validate balance BEFORE persistence
    const totalDebitPaise = dto.lines.reduce(
      (sum, line) => sum + BigInt(line.debitPaise),
      0n,
    );
    const totalCreditPaise = dto.lines.reduce(
      (sum, line) => sum + BigInt(line.creditPaise),
      0n,
    );

    if (totalDebitPaise !== totalCreditPaise) {
      throw new BusinessRuleError(
        `Journal entry is unbalanced: debits=${totalDebitPaise} credits=${totalCreditPaise}`,
        'UNBALANCED_JOURNAL_ENTRY',
      );
    }

    if (totalDebitPaise === 0n) {
      throw new BusinessRuleError(
        'Journal entry must have non-zero totals',
        'EMPTY_JOURNAL_ENTRY',
      );
    }

    const entry = await this.accountingRepository.createJournalEntry(
      {
        entry_date: new Date(dto.date),
        description: dto.description,
        source_type: dto.sourceType,
        source_id: dto.sourceId,
        total_debit_paise: totalDebitPaise,
        total_credit_paise: totalCreditPaise,
        created_by: dto.createdBy!,
        lines: dto.lines.map((line) => ({
          account_id: line.accountId,
          debit_paise: BigInt(line.debitPaise),
          credit_paise: BigInt(line.creditPaise),
        })),
      },
      tx,
    );

    this.logger.log({
      msg: 'Journal entry created',
      entryId: entry.id,
      sourceType: dto.sourceType,
      sourceId: dto.sourceId,
      totalDebitPaise: totalDebitPaise.toString(),
    });

    return entry;
  }

  /** Get all chart of accounts entries. */
  async getChartOfAccounts() {
    return this.accountingRepository.findAllAccounts();
  }

  /** Get journal entries for a date range (daybook view), chronological. */
  async getDaybook(startDate: string, endDate: string) {
    return this.accountingRepository.findJournalEntriesByDateRange(
      new Date(startDate),
      new Date(endDate),
    );
  }

  /** Get journal entries with filtering and pagination. */
  async getJournalEntries(params: {
    skip?: number;
    take?: number;
    sourceType?: string;
    sourceId?: string;
    startDate?: string;
    endDate?: string;
  }) {
    return this.accountingRepository.findJournalEntries({
      skip: params.skip,
      take: params.take,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      startDate: params.startDate ? new Date(params.startDate) : undefined,
      endDate: params.endDate ? new Date(params.endDate) : undefined,
    });
  }

  /**
   * Trial balance: sum of all debit balances == sum of all credit balances.
   *
   * For each account, compute the balance based on its category:
   * - Asset/Expense accounts: balance = total debits - total credits (debit-normal)
   * - Liability/Income/Equity accounts: balance = total credits - total debits (credit-normal)
   *
   * Then: sum of all debit balances == sum of all credit balances.
   */
  async getTrialBalance(asOfDate?: string) {
    const date = asOfDate ? new Date(asOfDate) : new Date();
    const rawBalances = await this.accountingRepository.getAccountBalances(date);
    const accounts = await this.accountingRepository.findAllAccounts();

    const accountMap = new Map(accounts.map((a) => [a.id, a]));

    const balances: AccountBalance[] = rawBalances.map((row) => {
      const account = accountMap.get(row.account_id);
      const totalDebit = row._sum.debit_paise ?? 0n;
      const totalCredit = row._sum.credit_paise ?? 0n;
      const category = account?.category ?? 'asset';

      // Debit-normal accounts: asset, expense
      // Credit-normal accounts: liability, income, equity
      const isDebitNormal = category === 'asset' || category === 'expense';
      const balancePaise = isDebitNormal
        ? totalDebit - totalCredit
        : totalCredit - totalDebit;

      return {
        accountId: row.account_id,
        code: account?.code ?? '',
        name: account?.name ?? '',
        category,
        debitPaise: totalDebit,
        creditPaise: totalCredit,
        balancePaise,
      };
    });

    // Separate into debit and credit balance columns
    let totalDebitBalance = 0n;
    let totalCreditBalance = 0n;

    const trialBalanceRows = balances.map((b) => {
      const isDebitNormal = b.category === 'asset' || b.category === 'expense';
      let debitBalance = 0n;
      let creditBalance = 0n;

      if (isDebitNormal) {
        if (b.balancePaise >= 0n) {
          debitBalance = b.balancePaise;
        } else {
          creditBalance = -b.balancePaise;
        }
      } else {
        if (b.balancePaise >= 0n) {
          creditBalance = b.balancePaise;
        } else {
          debitBalance = -b.balancePaise;
        }
      }

      totalDebitBalance += debitBalance;
      totalCreditBalance += creditBalance;

      return {
        accountId: b.accountId,
        code: b.code,
        name: b.name,
        category: b.category,
        debitBalancePaise: debitBalance.toString(),
        creditBalancePaise: creditBalance.toString(),
      };
    });

    return {
      asOfDate: date.toISOString().split('T')[0],
      rows: trialBalanceRows,
      totalDebitBalancePaise: totalDebitBalance.toString(),
      totalCreditBalancePaise: totalCreditBalance.toString(),
      isBalanced: totalDebitBalance === totalCreditBalance,
    };
  }

  /**
   * Profit & Loss: income minus expenses for a date range.
   *
   * Income accounts: credit-normal (balance = credits - debits)
   * Expense accounts: debit-normal (balance = debits - credits)
   * Net profit = total income - total expenses
   */
  async getProfitAndLoss(startDate: string, endDate: string) {
    const lines = await this.accountingRepository.getJournalLinesWithAccounts({
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    });

    const incomeAccounts = new Map<string, { code: string; name: string; balancePaise: bigint }>();
    const expenseAccounts = new Map<string, { code: string; name: string; balancePaise: bigint }>();

    for (const line of lines) {
      const category = line.account.category;
      const key = line.account.id;

      if (category === 'income') {
        const existing = incomeAccounts.get(key) ?? {
          code: line.account.code,
          name: line.account.name,
          balancePaise: 0n,
        };
        // Income is credit-normal
        existing.balancePaise += (line.credit_paise ?? 0n) - (line.debit_paise ?? 0n);
        incomeAccounts.set(key, existing);
      } else if (category === 'expense') {
        const existing = expenseAccounts.get(key) ?? {
          code: line.account.code,
          name: line.account.name,
          balancePaise: 0n,
        };
        // Expense is debit-normal
        existing.balancePaise += (line.debit_paise ?? 0n) - (line.credit_paise ?? 0n);
        expenseAccounts.set(key, existing);
      }
    }

    const incomeRows = [...incomeAccounts.entries()].map(([id, a]) => ({
      accountId: id,
      code: a.code,
      name: a.name,
      amountPaise: a.balancePaise.toString(),
    }));

    const expenseRows = [...expenseAccounts.entries()].map(([id, a]) => ({
      accountId: id,
      code: a.code,
      name: a.name,
      amountPaise: a.balancePaise.toString(),
    }));

    const totalIncomePaise = [...incomeAccounts.values()].reduce(
      (sum, a) => sum + a.balancePaise,
      0n,
    );
    const totalExpensePaise = [...expenseAccounts.values()].reduce(
      (sum, a) => sum + a.balancePaise,
      0n,
    );
    const netProfitPaise = totalIncomePaise - totalExpensePaise;

    return {
      startDate,
      endDate,
      income: incomeRows,
      expenses: expenseRows,
      totalIncomePaise: totalIncomePaise.toString(),
      totalExpensePaise: totalExpensePaise.toString(),
      netProfitPaise: netProfitPaise.toString(),
    };
  }

  /**
   * Balance sheet: assets = liabilities + equity at a point in time.
   *
   * Includes retained earnings (net P&L from inception to asOfDate)
   * folded into equity.
   */
  async getBalanceSheet(asOfDate?: string) {
    const date = asOfDate ? new Date(asOfDate) : new Date();
    const lines = await this.accountingRepository.getJournalLinesUpTo(date);

    const categoryTotals = new Map<
      string,
      Map<string, { code: string; name: string; balancePaise: bigint }>
    >();

    for (const line of lines) {
      const category = line.account.category;
      if (!categoryTotals.has(category)) {
        categoryTotals.set(category, new Map());
      }
      const accountMap = categoryTotals.get(category)!;
      const existing = accountMap.get(line.account.id) ?? {
        code: line.account.code,
        name: line.account.name,
        balancePaise: 0n,
      };

      const isDebitNormal = category === 'asset' || category === 'expense';
      if (isDebitNormal) {
        existing.balancePaise += (line.debit_paise ?? 0n) - (line.credit_paise ?? 0n);
      } else {
        existing.balancePaise += (line.credit_paise ?? 0n) - (line.debit_paise ?? 0n);
      }

      accountMap.set(line.account.id, existing);
    }

    const toRows = (category: string) =>
      [...(categoryTotals.get(category)?.entries() ?? [])].map(([id, a]) => ({
        accountId: id,
        code: a.code,
        name: a.name,
        balancePaise: a.balancePaise.toString(),
      }));

    const sumCategory = (category: string) =>
      [...(categoryTotals.get(category)?.values() ?? [])].reduce(
        (sum, a) => sum + a.balancePaise,
        0n,
      );

    const totalAssets = sumCategory('asset');
    const totalLiabilities = sumCategory('liability');
    const totalEquity = sumCategory('equity');

    // Retained earnings = income - expenses (from inception to asOfDate)
    const totalIncome = sumCategory('income');
    const totalExpenses = sumCategory('expense');
    const retainedEarnings = totalIncome - totalExpenses;

    const totalLiabilitiesAndEquity = totalLiabilities + totalEquity + retainedEarnings;

    return {
      asOfDate: date.toISOString().split('T')[0],
      assets: toRows('asset'),
      liabilities: toRows('liability'),
      equity: toRows('equity'),
      retainedEarningsPaise: retainedEarnings.toString(),
      totalAssetsPaise: totalAssets.toString(),
      totalLiabilitiesPaise: totalLiabilities.toString(),
      totalEquityPaise: totalEquity.toString(),
      totalLiabilitiesAndEquityPaise: totalLiabilitiesAndEquity.toString(),
      isBalanced: totalAssets === totalLiabilitiesAndEquity,
    };
  }
}
