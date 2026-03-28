import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

/**
 * Prisma transaction client type — a subset of PrismaService used within
 * `prisma.$transaction()` callbacks.
 */
type TxClient = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

export interface CreatePenaltyData {
  loan_id: string;
  installment_id: string;
  amount_paise: bigint | number;
  penalty_period: string;
  calculation_details: Record<string, unknown>;
  journal_entry_id: string;
}

const PENALTY_SELECT = {
  id: true,
  loan_id: true,
  installment_id: true,
  amount_paise: true,
  penalty_period: true,
  calculation_details: true,
  is_paid: true,
  is_waived: true,
  waived_by: true,
  waiver_approved_by: true,
  waived_reason: true,
  journal_entry_id: true,
  created_at: true,
};

/**
 * Penalty repository — data access for penalty records.
 *
 * Penalties are append-only. Waivers mark penalties as waived (not deleted).
 */
@Injectable()
export class PenaltyRepository {
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
   * Get loan with full details needed for penalty calculation within a transaction.
   */
  async getLoanForPenalty(loanId: string, tx: TxClient) {
    return tx.loans.findUnique({
      where: { id: loanId },
      select: {
        id: true,
        loan_number: true,
        customer_id: true,
        principal_paise: true,
        status: true,
        total_payable_paise: true,
        cached_outstanding_paise: true,
        dpd: true,
        overdue_bucket: true,
        product_version: {
          select: {
            id: true,
            penalty_grace_days: true,
            penalty_type: true,
            penalty_value: true,
            penalty_frequency: true,
          },
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
   * Get a loan by ID (non-transactional, for read-only operations).
   */
  async getLoanById(loanId: string) {
    return this.prisma.loans.findUnique({
      where: { id: loanId },
      select: {
        id: true,
        loan_number: true,
        status: true,
        dpd: true,
        overdue_bucket: true,
        cached_outstanding_paise: true,
        product_version: {
          select: {
            penalty_grace_days: true,
            penalty_type: true,
            penalty_value: true,
            penalty_frequency: true,
          },
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
            status: true,
          },
          orderBy: { due_date: 'asc' as const },
        },
      },
    });
  }

  /**
   * Create a penalty record within a transaction.
   */
  async createPenalty(data: CreatePenaltyData, tx: TxClient) {
    return tx.penalties.create({
      data: {
        loan_id: data.loan_id,
        installment_id: data.installment_id,
        amount_paise: data.amount_paise,
        penalty_period: data.penalty_period,
        calculation_details: data.calculation_details as never,
        journal_entry_id: data.journal_entry_id,
      },
      select: PENALTY_SELECT,
    });
  }

  /**
   * Check if a penalty already exists for the given (loan_id, installment_id, penalty_period).
   */
  async penaltyExists(
    loanId: string,
    installmentId: string,
    penaltyPeriod: string,
    tx: TxClient,
  ): Promise<boolean> {
    const count = await tx.penalties.count({
      where: {
        loan_id: loanId,
        installment_id: installmentId,
        penalty_period: penaltyPeriod,
      },
    });
    return count > 0;
  }

  /**
   * Get a penalty by ID.
   */
  async findById(penaltyId: string) {
    return this.prisma.penalties.findUnique({
      where: { id: penaltyId },
      select: PENALTY_SELECT,
    });
  }

  /**
   * Get a penalty by ID within a transaction.
   */
  async findByIdTx(penaltyId: string, tx: TxClient) {
    return tx.penalties.findUnique({
      where: { id: penaltyId },
      select: PENALTY_SELECT,
    });
  }

  /**
   * Get all penalties for a loan.
   */
  async findByLoanId(loanId: string) {
    return this.prisma.penalties.findMany({
      where: { loan_id: loanId },
      orderBy: { created_at: 'desc' },
      select: PENALTY_SELECT,
    });
  }

  /**
   * Mark a penalty as waived within a transaction.
   */
  async waivePenalty(
    penaltyId: string,
    data: { waived_by: string; waiver_approved_by: string; waived_reason: string },
    tx: TxClient,
  ) {
    return tx.penalties.update({
      where: { id: penaltyId },
      data: {
        is_waived: true,
        waived_by: data.waived_by,
        waiver_approved_by: data.waiver_approved_by,
        waived_reason: data.waived_reason,
      },
      select: PENALTY_SELECT,
    });
  }

  /**
   * Update loan cached outstanding, DPD, and overdue bucket within a transaction.
   */
  async updateLoanOutstanding(
    loanId: string,
    data: {
      cached_outstanding_paise: bigint | number;
      dpd: number;
      overdue_bucket: string | null;
    },
    tx: TxClient,
  ) {
    return tx.loans.update({
      where: { id: loanId },
      data: data as never,
    });
  }

  /**
   * Update loan status within a transaction.
   */
  async updateLoanStatus(loanId: string, status: string, tx: TxClient) {
    return tx.loans.update({
      where: { id: loanId },
      data: { status } as never,
    });
  }

  /**
   * Create a loan status history entry within a transaction.
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
   * Look up a chart of accounts entry by code within a transaction.
   */
  async findAccountByCode(code: string, tx: TxClient) {
    return tx.chart_of_accounts.findUnique({
      where: { code },
      select: { id: true, code: true, name: true, category: true },
    });
  }

  /**
   * Get pending (unpaid, unwaived) penalties for a loan within a transaction.
   */
  async getPendingPenalties(loanId: string, tx: TxClient) {
    return tx.penalties.findMany({
      where: {
        loan_id: loanId,
        is_paid: false,
        is_waived: false,
      },
      select: {
        id: true,
        amount_paise: true,
        installment_id: true,
        penalty_period: true,
      },
      orderBy: { created_at: 'asc' },
    });
  }
}
