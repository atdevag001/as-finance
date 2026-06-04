import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

/**
 * Prisma transaction client type — a subset of PrismaService used within
 * `prisma.$transaction()` callbacks.
 */
type TxClient = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

export interface CreateCollectionData {
  loan_id: string;
  amount_paise: bigint | number;
  payment_date: Date;
  payment_mode: string;
  collected_by: string;
  journal_entry_id: string;
  idempotency_key: string;
  receipt_id?: string;
}

export interface CreateAllocationData {
  collection_id: string;
  installment_id: string;
  /**
   * Optional FK to penalties — set only on rows that allocate to a penalty,
   * so reversals/reports can join collection_allocations → penalties without
   * round-tripping through installments. Null on pure interest/principal rows.
   */
  penalty_id?: string | null;
  penalty_paise: bigint | number;
  interest_paise: bigint | number;
  principal_paise: bigint | number;
  total_paise: bigint | number;
}

const COLLECTION_SELECT = {
  id: true,
  loan_id: true,
  amount_paise: true,
  payment_date: true,
  payment_mode: true,
  status: true,
  is_reversal: true,
  collected_by: true,
  journal_entry_id: true,
  receipt_id: true,
  idempotency_key: true,
  created_at: true,
};

/**
 * Collection repository — data access for collection records and allocations.
 *
 * Append-only by design for collections: no update or delete methods for
 * collection content. Only status can be changed (for reversals).
 */
@Injectable()
export class CollectionRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lock the loan row using SELECT ... FOR UPDATE within a transaction.
   * Prevents concurrent modifications to the same loan during collection posting.
   */
  async lockLoanForUpdate(loanId: string, tx: TxClient) {
    const rows = await tx.$queryRaw<
      { id: string; status: string; cached_outstanding_paise: bigint | null }[]
    >`SELECT id, status, cached_outstanding_paise FROM loans WHERE id = ${loanId}::uuid FOR UPDATE`;
    return rows[0] ?? null;
  }

  /**
   * Get loan with full details needed for collection posting within a transaction.
   */
  async getLoanForCollection(loanId: string, tx: TxClient) {
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
   * Get pending (unpaid, unwaived) penalties for a loan, ordered by oldest
   * penalty_period (then created_at as tiebreaker).
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
        paid_paise: true,
        installment_id: true,
        penalty_period: true,
      },
      orderBy: [{ penalty_period: 'asc' }, { created_at: 'asc' }],
    });
  }

  /**
   * Apply a partial or full payment to a penalty in a single atomic SQL UPDATE.
   * Increments paid_paise and conditionally flips is_paid in the same statement,
   * so there is no window between the two states. Caller MUST hold the
   * lockLoanForUpdate row lock on the loan for serialization across collections.
   */
  async applyPenaltyPayment(penaltyId: string, allocPaise: bigint, tx: TxClient) {
    // Single UPDATE: paid_paise becomes paid_paise + alloc; is_paid flips when
    // the new total reaches/exceeds amount_paise. Raw query for atomic
    // conditional column update — Prisma's update() can't express this.
    await tx.$executeRaw`
      UPDATE penalties
         SET paid_paise = paid_paise + ${allocPaise}::bigint,
             is_paid = (paid_paise + ${allocPaise}::bigint >= amount_paise)
       WHERE id = ${penaltyId}::uuid
    `;
  }

  /**
   * Reverse a penalty payment (used on collection reversal).
   * Decrements paid_paise and clears is_paid.
   */
  async reversePenaltyPayment(penaltyId: string, allocPaise: bigint, tx: TxClient) {
    await tx.penalties.update({
      where: { id: penaltyId },
      data: {
        paid_paise: { decrement: allocPaise },
        is_paid: false,
      },
    });
  }

  /**
   * Create a collection record within a transaction.
   */
  async createCollection(data: CreateCollectionData, tx: TxClient) {
    return tx.collections.create({
      data: {
        loan_id: data.loan_id,
        amount_paise: data.amount_paise,
        payment_date: data.payment_date,
        payment_mode: data.payment_mode as never,
        collected_by: data.collected_by,
        journal_entry_id: data.journal_entry_id,
        receipt_id: data.receipt_id,
        idempotency_key: data.idempotency_key,
      },
      select: COLLECTION_SELECT,
    });
  }

  /**
   * Create allocation records for a collection within a transaction.
   */
  async createAllocations(allocations: CreateAllocationData[], tx: TxClient) {
    if (allocations.length === 0) return [];
    return Promise.all(
      allocations.map((alloc) =>
        tx.collection_allocations.create({
          data: {
            collection_id: alloc.collection_id,
            installment_id: alloc.installment_id,
            // penalty_id is only set on rows that allocate to a penalty.
            // Cast as never to dodge the conditional types issue when the
            // Prisma client may have a partially-stale type while the
            // generated client is regenerated post-migration.
            penalty_id: (alloc.penalty_id ?? null) as never,
            penalty_paise: alloc.penalty_paise,
            interest_paise: alloc.interest_paise,
            principal_paise: alloc.principal_paise,
            total_paise: alloc.total_paise,
          },
        }),
      ),
    );
  }

  /**
   * Update installment paid amounts and status within a transaction.
   */
  async updateInstallment(
    installmentId: string,
    data: {
      principal_paid_paise: bigint | number;
      interest_paid_paise: bigint | number;
      penalty_paid_paise: bigint | number;
      status: string;
    },
    tx: TxClient,
  ) {
    return tx.loan_schedules.update({
      where: { id: installmentId },
      data: data as never,
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
   * Look up a chart of accounts entry by code within a transaction.
   */
  async findAccountByCode(code: string, tx: TxClient) {
    return tx.chart_of_accounts.findUnique({
      where: { code },
      select: { id: true, code: true, name: true, category: true },
    });
  }

  /**
   * Get the officer's full name for receipt generation.
   */
  async getOfficerName(userId: string, tx: TxClient): Promise<string> {
    const user = await tx.users.findUnique({
      where: { id: userId },
      select: { full_name: true },
    });
    return user?.full_name ?? 'Unknown Officer';
  }

  /**
   * Enqueue an SMS notification to the outbox within a transaction.
   */
  async enqueueOutboxMessage(
    data: {
      event_type: string;
      recipient_mobile: string;
      message_body: string;
      variables: Record<string, unknown>;
      source_type: string;
      source_id: string;
    },
    tx: TxClient,
  ) {
    return tx.outbox_messages.create({
      data: {
        event_type: data.event_type as never,
        recipient_mobile: data.recipient_mobile,
        message_body: data.message_body,
        variables: data.variables as never,
        source_type: data.source_type,
        source_id: data.source_id,
        status: 'pending' as never,
      },
    });
  }

  /**
   * Find collections by loan ID with pagination.
   */
  async findByLoanId(loanId: string, params?: { skip?: number; take?: number }) {
    const [data, total] = await Promise.all([
      this.prisma['collections'].findMany({
        where: { loan_id: loanId },
        skip: params?.skip ?? 0,
        take: params?.take ?? 50,
        orderBy: { created_at: 'desc' as const },
        select: {
          ...COLLECTION_SELECT,
          loan: {
            select: { loan_number: true, customer: { select: { full_name: true } } },
          },
        },
      }),
      this.prisma['collections'].count({ where: { loan_id: loanId } }),
    ]);
    return { data, total };
  }

  /**
   * Find all collections with optional filters and pagination.
   */
  async findAll(params?: {
    skip?: number;
    take?: number;
    loanId?: string;
    startDate?: string;
    endDate?: string;
    loanNumber?: string;
    aadhaarLastFour?: string;
  }) {
    const where: Record<string, unknown> = {};

    if (params?.loanId) {
      where['loan_id'] = params.loanId;
    }
    if (params?.startDate || params?.endDate) {
      where['payment_date'] = {};
      if (params?.startDate) {
        (where['payment_date'] as Record<string, unknown>)['gte'] = new Date(params.startDate);
      }
      if (params?.endDate) {
        (where['payment_date'] as Record<string, unknown>)['lte'] = new Date(params.endDate);
      }
    }

    // Build loan filter for loanNumber and/or aadhaarLastFour
    const loanFilter: Record<string, unknown> = {};
    if (params?.loanNumber) {
      loanFilter['loan_number'] = { contains: params.loanNumber, mode: 'insensitive' };
    }
    if (params?.aadhaarLastFour) {
      loanFilter['customer'] = { aadhaar_last_four: params.aadhaarLastFour };
    }
    if (Object.keys(loanFilter).length > 0) {
      where['loan'] = loanFilter;
    }

    const [data, total] = await Promise.all([
      this.prisma['collections'].findMany({
        where,
        skip: params?.skip ?? 0,
        take: params?.take ?? 50,
        orderBy: { created_at: 'desc' as const },
        select: {
          ...COLLECTION_SELECT,
          loan: {
            select: { loan_number: true, customer: { select: { full_name: true } } },
          },
        },
      }),
      this.prisma['collections'].count({ where }),
    ]);
    return { data, total };
  }
}
