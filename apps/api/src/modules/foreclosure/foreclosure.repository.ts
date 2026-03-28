import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

/**
 * Prisma transaction client type.
 */
type TxClient = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

export interface CreateForeclosureData {
  loan_id: string;
  outstanding_principal_paise: bigint | number;
  accrued_interest_paise: bigint | number;
  pending_penalties_paise: bigint | number;
  rebate_paise: bigint | number;
  settlement_amount_paise: bigint | number;
  rebate_reason?: string;
  rebate_authorized_by?: string;
  requested_by: string;
  quote_expires_at: Date;
}

/**
 * Foreclosure repository — data access for foreclosure records.
 */
@Injectable()
export class ForeclosureRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lock the loan row using SELECT ... FOR UPDATE within a transaction.
   */
  async lockLoanForUpdate(loanId: string, tx: TxClient) {
    const rows = await tx.$queryRaw<
      { id: string; status: string; cached_outstanding_paise: bigint | null }[]
    >`SELECT id, status, cached_outstanding_paise FROM loans WHERE id = ${loanId}::uuid FOR UPDATE`;
    return rows[0] ?? null;
  }

  /**
   * Get loan with full details needed for foreclosure calculation.
   */
  async getLoanForForeclosure(loanId: string, tx?: TxClient) {
    const client = tx ?? this.prisma;
    return (client as PrismaService).loans.findUnique({
      where: { id: loanId },
      select: {
        id: true,
        loan_number: true,
        customer_id: true,
        principal_paise: true,
        status: true,
        total_interest_paise: true,
        total_payable_paise: true,
        cached_outstanding_paise: true,
        disbursement_date: true,
        last_due_date: true,
        dpd: true,
        overdue_bucket: true,
        created_by: true,
        product_version: {
          select: {
            id: true,
            interest_type: true,
            annual_rate_bps: true,
            repayment_frequency: true,
            allocation_order: true,
          },
        },
        customer: {
          select: { id: true, full_name: true, mobile: true },
        },
        schedules: {
          select: {
            id: true,
            installment_number: true,
            due_date: true,
            principal_paise: true,
            interest_paise: true,
            total_paise: true,
            principal_paid_paise: true,
            interest_paid_paise: true,
            penalty_paid_paise: true,
            status: true,
          },
          orderBy: { due_date: 'asc' as const },
        },
      },
    });
  }

  /**
   * Get pending (unpaid, unwaived) penalties for a loan.
   */
  async getPendingPenalties(loanId: string, tx?: TxClient) {
    const client = tx ?? this.prisma;
    return client.penalties.findMany({
      where: {
        loan_id: loanId,
        is_paid: false,
        is_waived: false,
      },
      select: {
        id: true,
        amount_paise: true,
        installment_id: true,
      },
      orderBy: { created_at: 'asc' },
    });
  }

  /**
   * Create a foreclosure record.
   */
  async createForeclosure(data: CreateForeclosureData, tx?: TxClient) {
    const client = tx ?? this.prisma;
    return client.foreclosures.create({
      data: {
        loan_id: data.loan_id,
        outstanding_principal_paise: data.outstanding_principal_paise,
        accrued_interest_paise: data.accrued_interest_paise,
        pending_penalties_paise: data.pending_penalties_paise,
        rebate_paise: data.rebate_paise,
        settlement_amount_paise: data.settlement_amount_paise,
        rebate_reason: data.rebate_reason,
        rebate_authorized_by: data.rebate_authorized_by,
        requested_by: data.requested_by,
        quote_expires_at: data.quote_expires_at,
      },
    });
  }

  /**
   * Find a foreclosure by ID.
   */
  async findById(id: string, tx?: TxClient) {
    const client = tx ?? this.prisma;
    return client.foreclosures.findUnique({
      where: { id },
    });
  }

  /**
   * Update foreclosure status and related fields.
   */
  async updateForeclosure(
    id: string,
    data: {
      status?: string;
      approved_by?: string;
      collection_id?: string;
      settled_at?: Date;
      rebate_paise?: bigint | number;
      rebate_reason?: string;
      rebate_authorized_by?: string;
      settlement_amount_paise?: bigint | number;
    },
    tx: TxClient,
  ) {
    return tx.foreclosures.update({
      where: { id },
      data: data as never,
    });
  }

  /**
   * Close all remaining schedule installments (set status to 'closed').
   */
  async closeAllInstallments(loanId: string, tx: TxClient) {
    return tx.loan_schedules.updateMany({
      where: {
        loan_id: loanId,
        status: { notIn: ['paid', 'closed'] },
      },
      data: { status: 'closed' as never },
    });
  }

  /**
   * Update loan status and outstanding.
   */
  async updateLoan(
    loanId: string,
    data: {
      status?: string;
      cached_outstanding_paise?: bigint | number;
      dpd?: number;
      overdue_bucket?: string | null;
    },
    tx: TxClient,
  ) {
    return tx.loans.update({
      where: { id: loanId },
      data: data as never,
    });
  }

  /**
   * Create loan status history entry.
   */
  async createStatusHistory(
    data: {
      loan_id: string;
      from_status: string;
      to_status: string;
      changed_by: string;
      reason?: string;
      metadata?: unknown;
    },
    tx: TxClient,
  ) {
    return tx.loan_status_history.create({
      data: data as never,
    });
  }

  /**
   * Look up a chart of accounts entry by code.
   */
  async findAccountByCode(code: string, tx: TxClient) {
    return tx.chart_of_accounts.findUnique({
      where: { code },
      select: { id: true, code: true, name: true, category: true },
    });
  }

  /**
   * Get the officer's full name.
   */
  async getOfficerName(userId: string, tx: TxClient): Promise<string> {
    const user = await tx.users.findUnique({
      where: { id: userId },
      select: { full_name: true },
    });
    return user?.full_name ?? 'Unknown Officer';
  }

  /**
   * Mark penalties as paid within a transaction.
   */
  async markPenaltiesAsPaid(penaltyIds: string[], tx: TxClient) {
    if (penaltyIds.length === 0) return;
    await tx.penalties.updateMany({
      where: { id: { in: penaltyIds } },
      data: { is_paid: true },
    });
  }
}
