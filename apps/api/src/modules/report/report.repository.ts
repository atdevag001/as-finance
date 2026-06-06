import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

/**
 * Report repository — read-only data access for report generation.
 *
 * All monetary totals are derived from journal_lines (ledger source of truth),
 * not from cached fields on loan or schedule records.
 */
@Injectable()
export class ReportRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─── RBAC Scope Helpers ──────────────────────────────────────────────────

  /** Get active area assignments for a user (for RBAC scope filtering). */
  async getActiveAreas(userId: string): Promise<string[]> {
    const assignments = await this.prisma['user_area_assignments'].findMany({
      where: { user_id: userId, is_active: true },
      select: { area_name: true },
    });
    return assignments.map((a: { area_name: string }) => a.area_name);
  }

  /** Get customer IDs assigned to a specific officer. */
  async getAssignedCustomerIds(officerId: string): Promise<string[]> {
    const customers = await this.prisma['customers'].findMany({
      where: { assigned_officer_id: officerId },
      select: { id: true },
    });
    return customers.map((c: { id: string }) => c.id);
  }

  /** Get loan IDs for customers in specific areas (via assigned officer area assignments). */
  async getLoanIdsForAreas(areas: string[]): Promise<string[]> {
    const loans = await this.prisma['loans'].findMany({
      where: {
        customer: {
          assigned_officer: {
            area_assignments: {
              some: { area_name: { in: areas }, is_active: true },
            },
          },
        },
      },
      select: { id: true },
    });
    return loans.map((l: { id: string }) => l.id);
  }

  // ─── Daily Collection Report ─────────────────────────────────────────────

  /**
   * Daily collection report — totals derived from journal_lines.
   * Returns collections with their journal-line-derived amounts.
   */
  async getDailyCollections(params: {
    startDate: Date;
    endDate: Date;
    loanIdScope?: string[];
    customerIdScope?: string[];
  }) {
    const where: Record<string, unknown> = {
      payment_date: { gte: params.startDate, lte: params.endDate },
      status: 'posted',
    };
    if (params.loanIdScope) {
      where['loan_id'] = { in: params.loanIdScope };
    }
    // Scope by assigned customers (field officer RBAC), not by loan creator.
    if (params.customerIdScope) {
      where['loan'] = { customer_id: { in: params.customerIdScope } };
    }

    const collections = await this.prisma['collections'].findMany({
      where,
      orderBy: { payment_date: 'asc' },
      select: {
        id: true,
        loan_id: true,
        amount_paise: true,
        payment_date: true,
        payment_mode: true,
        collected_by: true,
        journal_entry_id: true,
        loan: {
          select: {
            loan_number: true,
            customer: { select: { id: true, full_name: true } },
          },
        },
        collector: { select: { id: true, full_name: true } },
      },
    });

    // Derive monetary totals from journal_lines (ledger source of truth)
    const journalEntryIds = collections.map(
      (c: { journal_entry_id: string }) => c.journal_entry_id,
    );
    const journalLines = journalEntryIds.length
      ? await this.prisma['journal_lines'].findMany({
          where: { journal_entry_id: { in: journalEntryIds } },
          select: {
            journal_entry_id: true,
            debit_paise: true,
            credit_paise: true,
            account: { select: { code: true, name: true, category: true } },
          },
        })
      : [];

    return { collections, journalLines };
  }

  // ─── Overdue Report ──────────────────────────────────────────────────────

  /** Overdue loans with DPD and bucket info. */
  async getOverdueLoans(params: {
    loanIdScope?: string[];
    customerIdScope?: string[];
    bucket?: string;
  }) {
    const where: Record<string, unknown> = {
      status: { in: ['overdue', 'active'] },
      dpd: { gt: 0 },
    };
    if (params.loanIdScope) {
      where['id'] = { in: params.loanIdScope };
    }
    // Field officers see loans for their assigned customers, not loans they created.
    if (params.customerIdScope) {
      where['customer_id'] = { in: params.customerIdScope };
    }
    if (params.bucket) {
      where['overdue_bucket'] = params.bucket;
    }

    return this.prisma['loans'].findMany({
      where,
      orderBy: { dpd: 'desc' },
      select: {
        id: true,
        loan_number: true,
        principal_paise: true,
        total_payable_paise: true,
        cached_outstanding_paise: true,
        dpd: true,
        overdue_bucket: true,
        status: true,
        disbursement_date: true,
        customer: { select: { id: true, full_name: true, mobile: true } },
        creator: { select: { id: true, full_name: true } },
      },
    });
  }

  // ─── Loan Portfolio Report ───────────────────────────────────────────────

  /** Loan portfolio with status breakdown. */
  async getLoanPortfolio(params: {
    loanIdScope?: string[];
    customerIdScope?: string[];
    status?: string;
    productVersionId?: string;
  }) {
    const where: Record<string, unknown> = {};
    if (params.loanIdScope) {
      where['id'] = { in: params.loanIdScope };
    }
    // Field officers see loans for their assigned customers, not loans they created.
    if (params.customerIdScope) {
      where['customer_id'] = { in: params.customerIdScope };
    }
    if (params.status) {
      where['status'] = params.status;
    }
    if (params.productVersionId) {
      where['product_version_id'] = params.productVersionId;
    }

    return this.prisma['loans'].findMany({
      where,
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        loan_number: true,
        principal_paise: true,
        total_interest_paise: true,
        total_payable_paise: true,
        cached_outstanding_paise: true,
        tenure_months: true,
        status: true,
        dpd: true,
        overdue_bucket: true,
        disbursement_date: true,
        first_due_date: true,
        last_due_date: true,
        customer: { select: { id: true, full_name: true } },
        product_version: {
          select: {
            id: true,
            interest_type: true,
            annual_rate_bps: true,
            product: { select: { name: true } },
          },
        },
        creator: { select: { id: true, full_name: true } },
      },
    });
  }

  // ─── DPD Aging Report ────────────────────────────────────────────────────

  /**
   * DPD aging report — aggregates loans by overdue bucket.
   * Outstanding derived from journal_lines for accuracy.
   */
  async getDpdAging(params: { loanIdScope?: string[] }) {
    const where: Record<string, unknown> = {
      status: { in: ['active', 'overdue', 'defaulted'] },
    };
    if (params.loanIdScope) {
      where['id'] = { in: params.loanIdScope };
    }

    const loans = await this.prisma['loans'].findMany({
      where,
      select: {
        id: true,
        loan_number: true,
        principal_paise: true,
        total_payable_paise: true,
        cached_outstanding_paise: true,
        dpd: true,
        overdue_bucket: true,
        status: true,
        customer: { select: { id: true, full_name: true } },
      },
    });

    // Derive actual outstanding from journal_lines for each loan
    const loanIds = loans.map((l: { id: string }) => l.id);
    const journalTotals = loanIds.length
      ? await this.prisma['journal_lines'].groupBy({
          by: ['account_id'],
          where: {
            journal_entry: {
              source_id: { in: loanIds },
            },
          },
          _sum: { debit_paise: true, credit_paise: true },
        })
      : [];

    return { loans, journalTotals };
  }

  // ─── Disbursement Report ─────────────────────────────────────────────────

  async getDisbursements(params: {
    startDate: Date;
    endDate: Date;
    loanIdScope?: string[];
  }) {
    const where: Record<string, unknown> = {
      disbursed_at: { gte: params.startDate, lte: params.endDate },
    };
    if (params.loanIdScope) {
      where['loan_id'] = { in: params.loanIdScope };
    }

    return this.prisma['disbursements'].findMany({
      where,
      orderBy: { disbursed_at: 'desc' },
      select: {
        id: true,
        loan_id: true,
        amount_paise: true,
        mode: true,
        reference_number: true,
        disbursed_at: true,
        loan: {
          select: {
            loan_number: true,
            customer: { select: { id: true, full_name: true } },
            product_version: {
              select: { product: { select: { name: true } } },
            },
          },
        },
        disbursed_by_user: { select: { id: true, full_name: true } },
      },
    });
  }

  // ─── Trial Balance (from journal_lines) ──────────────────────────────────

  async getTrialBalanceData(asOfDate: Date) {
    return this.prisma['journal_lines'].groupBy({
      by: ['account_id'],
      where: {
        journal_entry: { entry_date: { lte: asOfDate } },
      },
      _sum: { debit_paise: true, credit_paise: true },
    });
  }

  async getAccountsMap() {
    const accounts = await this.prisma['chart_of_accounts'].findMany({
      where: { is_active: true },
      select: { id: true, code: true, name: true, category: true },
    });
    const map = new Map<string, { code: string; name: string; category: string }>();
    for (const a of accounts) {
      map.set(a.id, { code: a.code, name: a.name, category: a.category });
    }
    return map;
  }

  // ─── P&L (from journal_lines) ────────────────────────────────────────────

  async getProfitLossData(startDate: Date, endDate: Date) {
    return this.prisma['journal_lines'].findMany({
      where: {
        journal_entry: { entry_date: { gte: startDate, lte: endDate } },
      },
      select: {
        debit_paise: true,
        credit_paise: true,
        account: { select: { id: true, code: true, name: true, category: true } },
      },
    });
  }

  // ─── Balance Sheet (from journal_lines) ──────────────────────────────────

  async getBalanceSheetData(asOfDate: Date) {
    return this.prisma['journal_lines'].findMany({
      where: {
        journal_entry: { entry_date: { lte: asOfDate } },
      },
      select: {
        debit_paise: true,
        credit_paise: true,
        account: { select: { id: true, code: true, name: true, category: true } },
      },
    });
  }

  // ─── EMI Schedule Report ─────────────────────────────────────────────────

  async getEmiScheduleReport(params: {
    startDate: Date;
    endDate: Date;
    status?: string;
    loanIdScope?: string[];
    customerIdScope?: string[];
  }) {
    // Field officers see schedules for loans of their assigned customers.
    const loanFilter: Record<string, unknown> = {
      status: { in: ['active', 'overdue', 'disbursed'] },
    };
    if (params.customerIdScope) {
      loanFilter['customer_id'] = { in: params.customerIdScope };
    }

    const where: Record<string, unknown> = {
      due_date: { gte: params.startDate, lte: params.endDate },
      loan: loanFilter,
    };

    if (params.status && params.status !== 'all') {
      if (params.status === 'unpaid') {
        where['status'] = { in: ['pending', 'partial', 'overdue'] };
      } else {
        where['status'] = params.status;
      }
    }

    if (params.loanIdScope) {
      where['loan_id'] = { in: params.loanIdScope };
    }

    return this.prisma['loan_schedules'].findMany({
      where,
      orderBy: { due_date: 'asc' },
      select: {
        id: true,
        installment_number: true,
        due_date: true,
        total_paise: true,
        principal_paise: true,
        interest_paise: true,
        principal_paid_paise: true,
        interest_paid_paise: true,
        status: true,
        loan: {
          select: {
            id: true,
            loan_number: true,
            customer: { select: { id: true, full_name: true, mobile: true } },
          },
        },
      },
    });
  }
}
