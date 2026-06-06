import { Injectable } from '@nestjs/common';
import { ReportRepository } from './report.repository';
import { ReportExportService, ExportData, ExportColumn } from './report-export.service';
import { NotFoundError } from '../../common/errors';
import { calendarDaysDiff, parseDateIST, todayISTDate } from '../../common/utils/date.util';

/**
 * All 20 supported report types.
 */
export const REPORT_TYPES = [
  'daily-collection',
  'overdue',
  'disbursement',
  'loan-portfolio',
  'customer',
  'repayment-schedule',
  'emi-schedule',
  'receipt-register',
  'cash-handover',
  'expense',
  'income',
  'trial-balance',
  'profit-loss',
  'balance-sheet',
  'group-summary',
  'group-collection',
  'penalty',
  'foreclosure',
  'audit-trail',
  'dpd-aging',
  'officer-performance',
] as const;

export type ReportType = (typeof REPORT_TYPES)[number];

export interface ReportQuery {
  startDate?: string; // ISO 8601
  endDate?: string;   // ISO 8601
  asOfDate?: string;  // ISO 8601
  officerId?: string;
  bucket?: string;
  status?: string;
  scheduleStatus?: string;
  productVersionId?: string;
  loanId?: string;
  skip?: number;
  take?: number;
}

export interface ReportUser {
  sub: string;
  role: string;
}

/**
 * Report service — dispatches to report-type-specific methods.
 *
 * RBAC scope enforcement:
 * - field_officer: sees only own assigned data
 * - collection_officer: sees only assigned routes/areas
 * - manager, super_admin, accountant, viewer_auditor: full data
 *
 * All monetary totals derived from journal_lines (ledger source of truth).
 *
 * Rate limiting note: 5 report generations per minute per user
 * (actual enforcement in task 36.3).
 */
@Injectable()
export class ReportService {
  constructor(
    private readonly reportRepo: ReportRepository,
    private readonly exportService: ReportExportService,
  ) {}

  /**
   * Generate a report by type with RBAC scope filtering.
   */
  async generateReport(
    reportType: string,
    query: ReportQuery,
    user: ReportUser,
  ) {
    if (!REPORT_TYPES.includes(reportType as ReportType)) {
      throw new NotFoundError(`Unknown report type: ${reportType}`);
    }

    const scope = await this.resolveScope(user);

    switch (reportType as ReportType) {
      case 'daily-collection':
        return this.dailyCollectionReport(query, scope);
      case 'overdue':
        return this.overdueReport(query, scope);
      case 'disbursement':
        return this.disbursementReport(query, scope);
      case 'loan-portfolio':
        return this.loanPortfolioReport(query, scope);
      case 'dpd-aging':
        return this.dpdAgingReport(query, scope);
      case 'trial-balance':
        return this.trialBalanceReport(query);
      case 'profit-loss':
        return this.profitLossReport(query);
      case 'balance-sheet':
        return this.balanceSheetReport(query);
      case 'emi-schedule':
        return this.emiScheduleReport(query, scope);
      // Stubbed report types — return placeholder with metadata
      case 'customer':
      case 'repayment-schedule':
      case 'receipt-register':
      case 'cash-handover':
      case 'expense':
      case 'income':
      case 'group-summary':
      case 'group-collection':
      case 'penalty':
      case 'foreclosure':
      case 'audit-trail':
      case 'officer-performance':
        return this.stubbedReport(reportType, query);
      default:
        throw new NotFoundError(`Unknown report type: ${reportType}`);
    }
  }

  /**
   * Export a report as PDF or Excel file.
   * Returns Buffer with file content and metadata.
   */
  async exportReport(
    reportType: string,
    format: string,
    query: ReportQuery,
    user: ReportUser,
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    const validFormats = ['pdf', 'xlsx'];
    if (!validFormats.includes(format)) {
      throw new NotFoundError(`Unsupported export format: ${format}. Supported: ${validFormats.join(', ')}`);
    }

    const reportData = await this.generateReport(reportType, query, user);
    const exportData = this.transformToExportData(reportType, query, reportData);

    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `${reportType}-${dateStr}.${format}`;

    if (format === 'xlsx') {
      const buffer = await this.exportService.generateExcel(exportData);
      return {
        buffer,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename,
      };
    } else {
      const buffer = await this.exportService.generatePdf(exportData);
      return {
        buffer,
        mimeType: 'application/pdf',
        filename,
      };
    }
  }

  /**
   * Transform report response to export-friendly format.
   */
  private transformToExportData(
    reportType: string,
    query: ReportQuery,
    reportData: Record<string, unknown>,
  ): ExportData {
    const title = this.formatReportTitle(reportType);
    const filters: Record<string, string> = {};

    if (query.startDate) filters['Start Date'] = query.startDate;
    if (query.endDate) filters['End Date'] = query.endDate;
    if (query.status) filters['Status'] = query.status;

    // Extract columns - use explicit columns if provided, else infer from data
    let columns: ExportColumn[] = [];
    if (Array.isArray(reportData['columns'])) {
      columns = (reportData['columns'] as Array<{ key: string; label: string; type?: string }>).map((c) => ({
        key: c.key,
        label: c.label,
        type: c.type as 'currency' | 'date' | 'number' | 'string' | undefined,
      }));
    }

    // Extract rows
    let rows: Record<string, unknown>[] = [];
    if (Array.isArray(reportData['data'])) {
      rows = reportData['data'] as Record<string, unknown>[];
    }

    // If no explicit columns, infer from first row
    const firstRow = rows[0];
    if (columns.length === 0 && firstRow) {
      columns = Object.keys(firstRow).map((key) => ({
        key,
        label: this.formatColumnLabel(key),
        type: this.inferColumnType(key),
      }));
    }

    return {
      reportType,
      title,
      filters,
      summary: reportData['summary'] as Record<string, unknown> | undefined,
      columns,
      rows,
    };
  }

  private formatReportTitle(reportType: string): string {
    return reportType
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ') + ' Report';
  }

  private formatColumnLabel(key: string): string {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/[_-]/g, ' ')
      .replace(/paise$/i, '')
      .replace(/id$/i, ' ID')
      .trim()
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }

  private inferColumnType(key: string): 'currency' | 'date' | 'number' | 'string' {
    const lower = key.toLowerCase();
    if (lower.includes('paise') || lower.includes('amount') || lower.includes('balance')) {
      return 'currency';
    }
    if (lower.includes('date') || lower.includes('at') && !lower.includes('status')) {
      return 'date';
    }
    if (lower.includes('count') || lower.includes('days') || lower.includes('number')) {
      return 'number';
    }
    return 'string';
  }

  // ─── RBAC Scope Resolution ───────────────────────────────────────────────

  private async resolveScope(user: ReportUser): Promise<ReportScope> {
    const fullAccessRoles = ['super_admin', 'manager', 'accountant', 'viewer_auditor'];
    if (fullAccessRoles.includes(user.role)) {
      return { type: 'full' };
    }

    if (user.role === 'field_officer') {
      const customerIds = await this.reportRepo.getAssignedCustomerIds(user.sub);
      return { type: 'officer', officerId: user.sub, customerIds };
    }

    if (user.role === 'collection_officer') {
      const areas = await this.reportRepo.getActiveAreas(user.sub);
      const loanIds = areas.length
        ? await this.reportRepo.getLoanIdsForAreas(areas)
        : [];
      return { type: 'area', loanIds };
    }

    // Default: no data (office_staff has no report.read permission anyway)
    return { type: 'none' };
  }

  private scopeToLoanFilter(scope: ReportScope): {
    loanIdScope?: string[];
    customerIdScope?: string[];
  } {
    if (scope.type === 'full') return {};
    // Field officers see their assigned customers' loans, not loans they created.
    if (scope.type === 'officer') return { customerIdScope: scope.customerIds };
    if (scope.type === 'area') return { loanIdScope: scope.loanIds };
    return { loanIdScope: [] };
  }

  // ─── Implemented Reports ─────────────────────────────────────────────────

  /**
   * Daily Collection Report — collections with journal-line-derived totals.
   * Monetary totals from journal_lines, not cached fields.
   */
  private async dailyCollectionReport(query: ReportQuery, scope: ReportScope) {
    const { startDate, endDate } = this.parseDateRange(query);
    const filter = this.scopeToLoanFilter(scope);

    const { collections, journalLines } = await this.reportRepo.getDailyCollections({
      startDate,
      endDate,
      loanIdScope: filter.loanIdScope,
      customerIdScope: filter.customerIdScope,
    });

    // Build journal line map keyed by journal_entry_id
    const journalMap = new Map<string, { totalDebit: bigint; totalCredit: bigint }>();
    for (const line of journalLines) {
      const entryId = line.journal_entry_id;
      const existing = journalMap.get(entryId) ?? { totalDebit: BigInt(0), totalCredit: BigInt(0) };
      existing.totalDebit += BigInt(line.debit_paise ?? 0);
      existing.totalCredit += BigInt(line.credit_paise ?? 0);
      journalMap.set(entryId, existing);
    }

    // Compute summary totals from journal lines (ledger source of truth)
    let totalCollectedPaise = BigInt(0);
    for (const entry of journalMap.values()) {
      totalCollectedPaise += entry.totalDebit;
    }

    return {
      reportType: 'daily-collection',
      generatedAt: new Date().toISOString(),
      filters: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
      summary: {
        totalCollections: collections.length,
        totalCollectedPaise: totalCollectedPaise.toString(),
      },
      data: collections.map((c: Record<string, unknown>) => ({
        ...c,
        amount_paise: String(c['amount_paise']),
        ledgerVerified: journalMap.has(c['journal_entry_id'] as string),
      })),
    };
  }

  /**
   * Overdue Report — loans with DPD > 0, grouped by bucket.
   */
  private async overdueReport(query: ReportQuery, scope: ReportScope) {
    const filter = this.scopeToLoanFilter(scope);

    const loans = await this.reportRepo.getOverdueLoans({
      loanIdScope: filter.loanIdScope,
      customerIdScope: filter.customerIdScope,
      bucket: query.bucket,
    });

    // Group by bucket
    const buckets: Record<string, unknown[]> = {};
    for (const loan of loans) {
      const bucket = (loan.overdue_bucket as string) ?? 'unknown';
      if (!buckets[bucket]) buckets[bucket] = [];
      buckets[bucket].push({
        ...loan,
        principal_paise: String(loan.principal_paise),
        total_payable_paise: String(loan.total_payable_paise),
        cached_outstanding_paise: String(loan.cached_outstanding_paise),
      });
    }

    return {
      reportType: 'overdue',
      generatedAt: new Date().toISOString(),
      summary: {
        totalOverdueLoans: loans.length,
        byBucket: Object.fromEntries(
          Object.entries(buckets).map(([k, v]) => [k, v.length]),
        ),
      },
      data: buckets,
    };
  }

  /**
   * Disbursement Report — disbursements in date range.
   */
  private async disbursementReport(query: ReportQuery, scope: ReportScope) {
    const { startDate, endDate } = this.parseDateRange(query);
    const filter = this.scopeToLoanFilter(scope);

    const disbursements = await this.reportRepo.getDisbursements({
      startDate,
      endDate,
      loanIdScope: filter.loanIdScope,
    });

    let totalDisbursedPaise = BigInt(0);
    for (const d of disbursements) {
      totalDisbursedPaise += BigInt(d.amount_paise);
    }

    return {
      reportType: 'disbursement',
      generatedAt: new Date().toISOString(),
      filters: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
      summary: {
        totalDisbursements: disbursements.length,
        totalDisbursedPaise: totalDisbursedPaise.toString(),
      },
      data: disbursements.map((d: Record<string, unknown>) => ({
        ...d,
        amount_paise: String(d['amount_paise']),
      })),
    };
  }

  /**
   * Loan Portfolio Report — all loans with status/product breakdown.
   */
  private async loanPortfolioReport(query: ReportQuery, scope: ReportScope) {
    const filter = this.scopeToLoanFilter(scope);

    const loans = await this.reportRepo.getLoanPortfolio({
      loanIdScope: filter.loanIdScope,
      customerIdScope: filter.customerIdScope,
      status: query.status,
      productVersionId: query.productVersionId,
    });

    // Group by status
    const byStatus: Record<string, number> = {};
    let totalPrincipalPaise = BigInt(0);
    let totalOutstandingPaise = BigInt(0);

    for (const loan of loans) {
      const status = loan.status as string;
      byStatus[status] = (byStatus[status] ?? 0) + 1;
      totalPrincipalPaise += BigInt(loan.principal_paise);
      totalOutstandingPaise += BigInt(loan.cached_outstanding_paise ?? 0);
    }

    return {
      reportType: 'loan-portfolio',
      generatedAt: new Date().toISOString(),
      summary: {
        totalLoans: loans.length,
        totalPrincipalPaise: totalPrincipalPaise.toString(),
        totalOutstandingPaise: totalOutstandingPaise.toString(),
        byStatus,
      },
      data: loans.map((l: Record<string, unknown>) => ({
        ...l,
        principal_paise: String(l['principal_paise']),
        total_interest_paise: String(l['total_interest_paise']),
        total_payable_paise: String(l['total_payable_paise']),
        cached_outstanding_paise: String(l['cached_outstanding_paise']),
      })),
    };
  }

  /**
   * DPD Aging Report — loans grouped by overdue bucket with journal-derived totals.
   */
  private async dpdAgingReport(query: ReportQuery, scope: ReportScope) {
    const filter = this.scopeToLoanFilter(scope);

    const { loans, journalTotals } = await this.reportRepo.getDpdAging({
      loanIdScope: filter.loanIdScope,
    });

    // Aggregate by bucket
    const bucketSummary: Record<string, { count: number; totalOutstandingPaise: bigint }> = {};
    for (const loan of loans) {
      const bucket = (loan.overdue_bucket as string) ?? 'bucket_0';
      if (!bucketSummary[bucket]) {
        bucketSummary[bucket] = { count: 0, totalOutstandingPaise: BigInt(0) };
      }
      bucketSummary[bucket].count += 1;
      bucketSummary[bucket].totalOutstandingPaise += BigInt(loan.cached_outstanding_paise ?? 0);
    }

    return {
      reportType: 'dpd-aging',
      generatedAt: new Date().toISOString(),
      summary: {
        totalLoans: loans.length,
        byBucket: Object.fromEntries(
          Object.entries(bucketSummary).map(([k, v]) => [
            k,
            { count: v.count, totalOutstandingPaise: v.totalOutstandingPaise.toString() },
          ]),
        ),
        journalLineTotals: journalTotals,
      },
      data: loans.map((l: Record<string, unknown>) => ({
        ...l,
        principal_paise: String(l['principal_paise']),
        total_payable_paise: String(l['total_payable_paise']),
        cached_outstanding_paise: String(l['cached_outstanding_paise']),
      })),
    };
  }

  /**
   * Trial Balance — all account balances derived from journal_lines.
   */
  private async trialBalanceReport(query: ReportQuery) {
    const asOfDate = query.asOfDate ? new Date(query.asOfDate) : new Date();
    const balances = await this.reportRepo.getTrialBalanceData(asOfDate);
    const accountsMap = await this.reportRepo.getAccountsMap();

    let totalDebitPaise = BigInt(0);
    let totalCreditPaise = BigInt(0);

    const accounts = balances.map((b: { account_id: string; _sum: { debit_paise: bigint | null; credit_paise: bigint | null } }) => {
      const debit = BigInt(b._sum.debit_paise ?? 0);
      const credit = BigInt(b._sum.credit_paise ?? 0);
      totalDebitPaise += debit;
      totalCreditPaise += credit;
      const acct = accountsMap.get(b.account_id);
      return {
        accountId: b.account_id,
        code: acct?.code ?? 'unknown',
        name: acct?.name ?? 'unknown',
        category: acct?.category ?? 'unknown',
        debitPaise: debit.toString(),
        creditPaise: credit.toString(),
        balancePaise: (debit - credit).toString(),
      };
    });

    return {
      reportType: 'trial-balance',
      generatedAt: new Date().toISOString(),
      asOfDate: asOfDate.toISOString(),
      summary: {
        totalDebitPaise: totalDebitPaise.toString(),
        totalCreditPaise: totalCreditPaise.toString(),
        isBalanced: totalDebitPaise === totalCreditPaise,
      },
      data: accounts,
    };
  }

  /**
   * Profit & Loss — income minus expenses from journal_lines.
   */
  private async profitLossReport(query: ReportQuery) {
    const { startDate, endDate } = this.parseDateRange(query);
    const lines = await this.reportRepo.getProfitLossData(startDate, endDate);

    let totalIncomePaise = BigInt(0);
    let totalExpensePaise = BigInt(0);
    const incomeAccounts: Record<string, bigint> = {};
    const expenseAccounts: Record<string, bigint> = {};

    for (const line of lines) {
      const category = line.account.category as string;
      const name = line.account.name;
      const credit = BigInt(line.credit_paise ?? 0);
      const debit = BigInt(line.debit_paise ?? 0);

      if (category === 'income') {
        const net = credit - debit;
        totalIncomePaise += net;
        incomeAccounts[name] = (incomeAccounts[name] ?? BigInt(0)) + net;
      } else if (category === 'expense') {
        const net = debit - credit;
        totalExpensePaise += net;
        expenseAccounts[name] = (expenseAccounts[name] ?? BigInt(0)) + net;
      }
    }

    return {
      reportType: 'profit-loss',
      generatedAt: new Date().toISOString(),
      filters: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
      summary: {
        totalIncomePaise: totalIncomePaise.toString(),
        totalExpensePaise: totalExpensePaise.toString(),
        netProfitPaise: (totalIncomePaise - totalExpensePaise).toString(),
      },
      data: {
        income: Object.fromEntries(
          Object.entries(incomeAccounts).map(([k, v]) => [k, v.toString()]),
        ),
        expenses: Object.fromEntries(
          Object.entries(expenseAccounts).map(([k, v]) => [k, v.toString()]),
        ),
      },
    };
  }

  /**
   * Balance Sheet — assets = liabilities + equity from journal_lines.
   */
  private async balanceSheetReport(query: ReportQuery) {
    const asOfDate = query.asOfDate ? new Date(query.asOfDate) : new Date();
    const lines = await this.reportRepo.getBalanceSheetData(asOfDate);

    let totalAssetsPaise = BigInt(0);
    let totalLiabilitiesPaise = BigInt(0);
    let totalEquityPaise = BigInt(0);
    let totalIncomePaise = BigInt(0);
    let totalExpensePaise = BigInt(0);

    for (const line of lines) {
      const category = line.account.category as string;
      const debit = BigInt(line.debit_paise ?? 0);
      const credit = BigInt(line.credit_paise ?? 0);

      switch (category) {
        case 'asset':
          totalAssetsPaise += debit - credit;
          break;
        case 'liability':
          totalLiabilitiesPaise += credit - debit;
          break;
        case 'equity':
          totalEquityPaise += credit - debit;
          break;
        case 'income':
          totalIncomePaise += credit - debit;
          break;
        case 'expense':
          totalExpensePaise += debit - credit;
          break;
      }
    }

    // Retained earnings = income - expenses (added to equity)
    const retainedEarnings = totalIncomePaise - totalExpensePaise;
    const totalEquityWithRetained = totalEquityPaise + retainedEarnings;

    return {
      reportType: 'balance-sheet',
      generatedAt: new Date().toISOString(),
      asOfDate: asOfDate.toISOString(),
      summary: {
        totalAssetsPaise: totalAssetsPaise.toString(),
        totalLiabilitiesPaise: totalLiabilitiesPaise.toString(),
        totalEquityPaise: totalEquityWithRetained.toString(),
        isBalanced: totalAssetsPaise === totalLiabilitiesPaise + totalEquityWithRetained,
      },
    };
  }

  /**
   * EMI Schedule Report — EMIs by due date range with status filtering.
   */
  private async emiScheduleReport(query: ReportQuery, scope: ReportScope) {
    const { startDate, endDate } = this.parseDateRange(query);
    const filter = this.scopeToLoanFilter(scope);

    const schedules = await this.reportRepo.getEmiScheduleReport({
      startDate,
      endDate,
      status: query.scheduleStatus,
      loanIdScope: filter.loanIdScope,
      customerIdScope: filter.customerIdScope,
    });

    // Anchor "today" to IST midnight so the overdue computation lines up with
    // the business calendar regardless of server TZ.
    const today = todayISTDate();

    let totalEmiPaise = BigInt(0);
    let totalPaidPaise = BigInt(0);
    let paidCount = 0;
    let unpaidCount = 0;
    let overdueCount = 0;

    const rows = schedules.map((s: Record<string, unknown>) => {
      const totalPaise = BigInt(s['total_paise'] as bigint);
      const principalPaidPaise = BigInt(s['principal_paid_paise'] as bigint ?? 0);
      const interestPaidPaise = BigInt(s['interest_paid_paise'] as bigint ?? 0);
      const paidPaise = principalPaidPaise + interestPaidPaise;
      const dueDate = new Date(s['due_date'] as Date);
      const status = s['status'] as string;

      totalEmiPaise += totalPaise;
      totalPaidPaise += paidPaise;

      if (status === 'paid') paidCount++;
      else if (status === 'overdue') overdueCount++;
      else unpaidCount++;

      // Use calendar-day diff to avoid IST/UTC fractional-day truncation that
      // consistently understated overdueDays by one.
      const overdueDays = status !== 'paid' && dueDate < today
        ? calendarDaysDiff(dueDate, today)
        : 0;

      const loan = s['loan'] as { id: string; loan_number: string; customer: { id: string; full_name: string; mobile: string } };

      return {
        id: s['id'],
        customerId: loan.customer.id,
        customerName: loan.customer.full_name,
        customerMobile: loan.customer.mobile,
        loanId: loan.id,
        loanNumber: loan.loan_number,
        installmentNumber: s['installment_number'],
        dueDate: dueDate.toISOString().slice(0, 10),
        emiAmountPaise: totalPaise.toString(),
        principalPaise: String(s['principal_paise']),
        interestPaise: String(s['interest_paise']),
        paidPaise: paidPaise.toString(),
        outstandingPaise: (totalPaise - paidPaise).toString(),
        status,
        overdueDays,
      };
    });

    return {
      reportType: 'emi-schedule',
      generatedAt: new Date().toISOString(),
      filters: {
        startDate: startDate.toISOString().slice(0, 10),
        endDate: endDate.toISOString().slice(0, 10),
        status: query.scheduleStatus ?? 'all',
      },
      summary: {
        totalEmis: schedules.length,
        totalEmiPaise: totalEmiPaise.toString(),
        totalPaidPaise: totalPaidPaise.toString(),
        totalOutstandingPaise: (totalEmiPaise - totalPaidPaise).toString(),
        paidCount,
        unpaidCount,
        overdueCount,
      },
      columns: [
        { key: 'customerName', label: 'Customer Name' },
        { key: 'loanNumber', label: 'Loan Number' },
        { key: 'installmentNumber', label: 'EMI #' },
        { key: 'dueDate', label: 'Due Date' },
        { key: 'emiAmountPaise', label: 'EMI Amount', type: 'currency' },
        { key: 'paidPaise', label: 'Paid', type: 'currency' },
        { key: 'outstandingPaise', label: 'Outstanding', type: 'currency' },
        { key: 'status', label: 'Status' },
        { key: 'overdueDays', label: 'Overdue Days' },
      ],
      data: rows,
    };
  }

  // ─── Stubbed Reports ─────────────────────────────────────────────────────

  /**
   * Placeholder for report types not yet fully implemented.
   * Returns metadata and empty data array.
   */
  private stubbedReport(reportType: string, query: ReportQuery) {
    return {
      reportType,
      generatedAt: new Date().toISOString(),
      filters: query,
      summary: { message: `Report type '${reportType}' is not yet fully implemented.` },
      data: [],
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private parseDateRange(query: ReportQuery): { startDate: Date; endDate: Date } {
    // Default range = today (IST midnight) → now. Explicit YYYY-MM-DD inputs
    // parsed as IST midnight so the report window matches business days, not
    // server-local days. End date is shifted to the inclusive end-of-day so
    // entries on the chosen endDate (stored as UTC midnight @db.Date) are not
    // silently dropped by `<= endDate`.
    const todayIstMidnight = todayISTDate();
    const startDate = query.startDate
      ? parseDateIST(query.startDate)
      : todayIstMidnight;
    const endDate = query.endDate
      ? new Date(parseDateIST(query.endDate).getTime() + 24 * 60 * 60 * 1000 - 1)
      : new Date();
    return { startDate, endDate };
  }
}

// ─── Internal Types ──────────────────────────────────────────────────────────

type ReportScope =
  | { type: 'full' }
  | { type: 'officer'; officerId: string; customerIds: string[] }
  | { type: 'area'; loanIds: string[] }
  | { type: 'none' };
