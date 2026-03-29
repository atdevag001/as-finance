import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ConflictError } from '../../common/errors';

const LOAN_SELECT = {
  id: true,
  loan_number: true,
  customer_id: true,
  product_version_id: true,
  group_id: true,
  principal_paise: true,
  tenure_months: true,
  purpose: true,
  status: true,
  processing_fee_paise: true,
  total_interest_paise: true,
  total_payable_paise: true,
  cached_outstanding_paise: true,
  disbursement_date: true,
  first_due_date: true,
  last_due_date: true,
  dpd: true,
  overdue_bucket: true,
  created_by: true,
  approved_by: true,
  version: true,
  created_at: true,
  updated_at: true,
};

const LOAN_DETAIL_SELECT = {
  ...LOAN_SELECT,
  customer: {
    select: { id: true, full_name: true, mobile: true, status: true },
  },
  product_version: {
    select: {
      id: true,
      product_id: true,
      version_number: true,
      interest_type: true,
      annual_rate_bps: true,
      min_principal_paise: true,
      max_principal_paise: true,
      min_tenure_months: true,
      max_tenure_months: true,
      repayment_frequency: true,
      processing_fee_type: true,
      processing_fee_value: true,
      max_concurrent_loans: true,
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
    orderBy: { installment_number: 'asc' as const },
  },
  approvals: {
    select: {
      id: true,
      action: true,
      actor_id: true,
      remarks: true,
      created_at: true,
    },
    orderBy: { created_at: 'desc' as const },
  },
  status_history: {
    select: {
      id: true,
      from_status: true,
      to_status: true,
      changed_by: true,
      reason: true,
      metadata: true,
      created_at: true,
    },
    orderBy: { created_at: 'desc' as const },
  },
};

export interface CreateLoanData {
  loan_number: string;
  customer_id: string;
  product_version_id: string;
  principal_paise: bigint | number;
  tenure_months: number;
  purpose: string;
  created_by: string;
  group_id?: string;
}

@Injectable()
export class LoanRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateLoanData) {
    return this.prisma['loans'].create({
      data: data as never,
      select: LOAN_SELECT,
    });
  }

  async findById(id: string) {
    return this.prisma['loans'].findUnique({
      where: { id },
      select: LOAN_DETAIL_SELECT,
    });
  }

  async findAll(params: {
    skip?: number;
    take?: number;
    status?: string;
    customerId?: string;
    search?: string;
  }) {
    const where: Record<string, unknown> = {};

    if (params.status) {
      where['status'] = params.status;
    }
    if (params.customerId) {
      where['customer_id'] = params.customerId;
    }
    if (params.search) {
      where['loan_number'] = { contains: params.search, mode: 'insensitive' };
    }

    const [data, total] = await Promise.all([
      this.prisma['loans'].findMany({
        where,
        skip: params.skip ?? 0,
        take: params.take ?? 50,
        orderBy: { created_at: 'desc' as const },
        select: {
          ...LOAN_SELECT,
          customer: {
            select: { id: true, full_name: true, mobile: true },
          },
        },
      }),
      this.prisma['loans'].count({ where }),
    ]);

    return { data, total };
  }

  /**
   * Update loan status with optimistic locking.
   * Uses `updateMany` with version check to detect concurrent modifications.
   * Throws CONFLICT_OPTIMISTIC_LOCK if the version has changed since read.
   */
  async updateStatus(
    id: string,
    status: string,
    extra?: Record<string, unknown>,
    expectedVersion?: number,
  ) {
    if (expectedVersion !== undefined) {
      const result = await this.prisma['loans'].updateMany({
        where: { id, version: expectedVersion },
        data: {
          status,
          version: { increment: 1 },
          ...extra,
        } as never,
      });

      if (result.count === 0) {
        throw new ConflictError(
          'Loan was modified by another request. Please reload and retry.',
          'CONFLICT_OPTIMISTIC_LOCK',
        );
      }

      // Return the updated record
      return this.prisma['loans'].findUnique({
        where: { id },
        select: LOAN_SELECT,
      });
    }

    // Fallback: no version check (backward compatible)
    return this.prisma['loans'].update({
      where: { id },
      data: { status, version: { increment: 1 }, ...extra } as never,
      select: LOAN_SELECT,
    });
  }

  /**
   * Update an installment with optimistic locking.
   * Uses `updateMany` with version check to detect concurrent modifications.
   * Throws CONFLICT_OPTIMISTIC_LOCK if the version has changed since read.
   */
  async updateInstallmentWithVersion(
    installmentId: string,
    expectedVersion: number,
    data: Record<string, unknown>,
  ) {
    const result = await this.prisma['loan_schedules'].updateMany({
      where: { id: installmentId, version: expectedVersion },
      data: {
        ...data,
        version: { increment: 1 },
      } as never,
    });

    if (result.count === 0) {
      throw new ConflictError(
        'Installment was modified by another request. Please reload and retry.',
        'CONFLICT_OPTIMISTIC_LOCK',
      );
    }

    return this.prisma['loan_schedules'].findUnique({
      where: { id: installmentId },
    });
  }

  async createStatusHistory(data: {
    loan_id: string;
    from_status: string | null;
    to_status: string;
    changed_by: string;
    reason?: string;
    metadata?: unknown;
  }) {
    return this.prisma['loan_status_history'].create({
      data: data as never,
    });
  }

  async createApproval(data: {
    loan_id: string;
    action: string;
    actor_id: string;
    remarks?: string;
  }) {
    return this.prisma['loan_approvals'].create({
      data: data as never,
    });
  }

  async createAuditLog(data: {
    action_type: string;
    actor_id: string;
    actor_role: string;
    target_entity: string;
    target_id: string;
    ip_address?: string;
    request_id?: string;
    before_state?: unknown;
    after_state?: unknown;
    remarks?: string;
  }) {
    return this.prisma['audit_logs'].create({
      data: {
        ...data,
        ip_address: data.ip_address ?? '0.0.0.0',
        request_id: data.request_id ?? '00000000-0000-0000-0000-000000000000',
      } as never,
    });
  }

  /**
   * Persist generated schedule installments for a loan.
   */
  async createScheduleInstallments(
    loanId: string,
    installments: Array<{
      installmentNumber: number;
      dueDate: Date;
      principalPaise: number;
      interestPaise: number;
      totalPaise: number;
    }>,
  ) {
    for (const inst of installments) {
      await this.prisma['loan_schedules'].create({
        data: {
          loan_id: loanId,
          installment_number: inst.installmentNumber,
          due_date: inst.dueDate,
          principal_paise: inst.principalPaise,
          interest_paise: inst.interestPaise,
          total_paise: inst.totalPaise,
          principal_paid_paise: 0,
          interest_paid_paise: 0,
          penalty_paid_paise: 0,
          status: 'pending',
        } as never,
      });
    }
  }

  /**
   * Update loan with total interest and total payable amounts.
   */
  async updateLoanTotals(loanId: string, totalInterestPaise: number, totalPayablePaise: number) {
    return this.prisma['loans'].update({
      where: { id: loanId },
      data: {
        total_interest_paise: totalInterestPaise,
        total_payable_paise: totalPayablePaise,
      },
    });
  }

  /**
   * Generate a unique sequential loan number using the database sequence.
   * Format: LN-{year}-{padded_number} (e.g., LN-2024-00001)
   */
  async generateLoanNumber(): Promise<string> {
    const result = await this.prisma.$queryRaw<
      { nextval: bigint }[]
    >`SELECT nextval('loan_number_seq')`;
    const seq = Number(result[0]!.nextval);
    const year = new Date().getFullYear();
    const padded = String(seq).padStart(5, '0');
    return `LN-${year}-${padded}`;
  }

  /**
   * Count active/non-terminal loans for a customer under a specific product.
   */
  async countActiveLoansByCustomerAndProduct(
    customerId: string,
    productId: string,
  ): Promise<number> {
    return this.prisma['loans'].count({
      where: {
        customer_id: customerId,
        product_version: { product_id: productId },
        status: {
          in: ['draft', 'submitted', 'under_review', 'approved', 'disbursed', 'active', 'overdue'],
        },
      },
    });
  }

  /**
   * Check if customer has any defaulted loans.
   */
  async hasDefaultedLoans(customerId: string): Promise<boolean> {
    const count = await this.prisma['loans'].count({
      where: {
        customer_id: customerId,
        status: 'defaulted',
      },
    });
    return count > 0;
  }

  /**
   * Get customer status by ID.
   */
  async getCustomerStatus(
    customerId: string,
  ): Promise<{ id: string; status: string; full_name: string } | null> {
    return this.prisma['customers'].findUnique({
      where: { id: customerId },
      select: { id: true, status: true, full_name: true },
    });
  }

  /**
   * Get unpaid installments for a loan (not fully paid and not closed).
   * Used for loan closure prerequisite check.
   */
  async getUnpaidInstallments(loanId: string) {
    return this.prisma['loan_schedules'].findMany({
      where: {
        loan_id: loanId,
        status: { notIn: ['paid', 'closed'] },
      },
      select: {
        id: true,
        installment_number: true,
        status: true,
        principal_paise: true,
        interest_paise: true,
        principal_paid_paise: true,
        interest_paid_paise: true,
      },
    });
  }

  /**
   * Get unsettled penalties for a loan (not paid and not waived).
   * Used for loan closure prerequisite check.
   */
  async getUnsettledPenalties(loanId: string) {
    return this.prisma['penalties'].findMany({
      where: {
        loan_id: loanId,
        is_paid: false,
        is_waived: false,
      },
      select: {
        id: true,
        amount_paise: true,
        penalty_period: true,
        installment_id: true,
      },
    });
  }

  /**
   * Check for pending (non-reversed) reversals on a loan.
   * A "pending reversal" here means a collection that is posted but has
   * a reversal in progress (i.e., a reversal collection exists that is not yet finalized).
   * For closure, we check if any collection is in a non-terminal state that indicates
   * an in-progress reversal.
   */
  async getPendingReversals(loanId: string) {
    // Check for collections that are reversals and still in 'posted' status
    // but whose original collection is not yet marked as 'reversed'.
    // In practice, reversals are atomic, so we check for any collection
    // that is a reversal with status 'posted' whose original is still 'posted'.
    return this.prisma['collections'].findMany({
      where: {
        loan_id: loanId,
        is_reversal: true,
        status: 'posted',
        original_collection: {
          status: 'posted',
        },
      },
      select: {
        id: true,
        original_collection_id: true,
      },
    });
  }

  /**
   * Get the cached outstanding balance for a loan.
   */
  async getOutstandingBalance(loanId: string): Promise<bigint | null> {
    const loan = await this.prisma['loans'].findUnique({
      where: { id: loanId },
      select: { cached_outstanding_paise: true },
    });
    return loan?.cached_outstanding_paise ?? null;
  }

  /**
   * Get product version by ID with product info.
   */
  async getProductVersion(versionId: string) {
    return this.prisma['loan_product_versions'].findUnique({
      where: { id: versionId },
      select: {
        id: true,
        product_id: true,
        version_number: true,
        interest_type: true,
        annual_rate_bps: true,
        min_principal_paise: true,
        max_principal_paise: true,
        min_tenure_months: true,
        max_tenure_months: true,
        repayment_frequency: true,
        processing_fee_type: true,
        processing_fee_value: true,
        max_concurrent_loans: true,
        is_active: true,
        product: {
          select: { id: true, name: true, is_active: true },
        },
      },
    });
  }
}
