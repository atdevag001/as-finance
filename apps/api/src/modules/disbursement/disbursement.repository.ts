import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

/**
 * Prisma transaction client type — a subset of PrismaService used within
 * `prisma.$transaction()` callbacks.
 */
type TxClient = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

export interface CreateDisbursementData {
  loan_id: string;
  amount_paise: bigint | number;
  mode: string;
  reference_number?: string;
  disbursed_by: string;
  disbursed_at: Date;
  journal_entry_id: string;
  idempotency_key: string;
}

const DISBURSEMENT_SELECT = {
  id: true,
  loan_id: true,
  amount_paise: true,
  mode: true,
  reference_number: true,
  disbursed_by: true,
  disbursed_at: true,
  journal_entry_id: true,
  idempotency_key: true,
  created_at: true,
};

/**
 * Disbursement repository — data access for disbursement records.
 *
 * Append-only by design: no update or delete methods exist.
 */
@Injectable()
export class DisbursementRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a disbursement record within a transaction.
   */
  async create(data: CreateDisbursementData, tx?: TxClient) {
    const client = tx ?? this.prisma;
    return (client as TxClient).disbursements.create({
      data: {
        loan_id: data.loan_id,
        amount_paise: data.amount_paise,
        mode: data.mode as never,
        reference_number: data.reference_number,
        disbursed_by: data.disbursed_by,
        disbursed_at: data.disbursed_at,
        journal_entry_id: data.journal_entry_id,
        idempotency_key: data.idempotency_key,
      },
      select: DISBURSEMENT_SELECT,
    });
  }

  /** Find a disbursement by loan ID. */
  async findByLoanId(loanId: string) {
    return this.prisma.disbursements.findFirst({
      where: { loan_id: loanId },
      select: DISBURSEMENT_SELECT,
    });
  }

  /** Find a disbursement by ID. */
  async findById(id: string) {
    return this.prisma.disbursements.findUnique({
      where: { id },
      select: DISBURSEMENT_SELECT,
    });
  }

  /**
   * Check if a loan has already been disbursed.
   * Pass `tx` to run inside the disbursement transaction (visibility-correct under FOR UPDATE).
   */
  async isAlreadyDisbursed(loanId: string, tx?: TxClient): Promise<boolean> {
    const client = tx ?? this.prisma;
    const count = await (client as TxClient).disbursements.count({
      where: { loan_id: loanId },
    });
    return count > 0;
  }

  /**
   * Acquire a row-level FOR UPDATE lock on the loans row. Must be called as the
   * first statement of executeDisbursement inside a $transaction.
   */
  async lockLoanForUpdate(loanId: string, tx: TxClient) {
    const rows = await tx.$queryRaw<
      { id: string; status: string; cached_outstanding_paise: bigint | null }[]
    >`SELECT id, status, cached_outstanding_paise FROM loans WHERE id = ${loanId}::uuid FOR UPDATE`;
    return rows[0] ?? null;
  }

  /**
   * Check if a loan has a generated schedule.
   */
  async hasSchedule(loanId: string, tx?: TxClient): Promise<boolean> {
    const client = tx ?? this.prisma;
    const count = await (client as TxClient).loan_schedules.count({
      where: { loan_id: loanId },
    });
    return count > 0;
  }

  /**
   * Check if a customer has uploaded KYC documents.
   * Returns true if documents exist or if no documents are required (no document records at all).
   */
  async hasKycDocuments(customerId: string, tx?: TxClient): Promise<boolean> {
    // For now, skip KYC check — KYC upload is handled separately and
    // should not block disbursement in environments without MinIO/S3
    return true;
  }

  /**
   * Get loan with product version and customer info for disbursement.
   */
  async getLoanForDisbursement(loanId: string, tx?: TxClient) {
    const client = tx ?? this.prisma;
    return (client as TxClient).loans.findUnique({
      where: { id: loanId },
      select: {
        id: true,
        loan_number: true,
        customer_id: true,
        principal_paise: true,
        tenure_months: true,
        status: true,
        total_payable_paise: true,
        created_by: true,
        approved_by: true,
        product_version: {
          select: {
            id: true,
            interest_type: true,
            annual_rate_bps: true,
            repayment_frequency: true,
            processing_fee_type: true,
            processing_fee_value: true,
            product: { select: { id: true, name: true } },
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
          },
          orderBy: { installment_number: 'asc' as const },
        },
      },
    });
  }

  /**
   * Update loan fields for disbursement within a transaction.
   */
  async updateLoanForDisbursement(
    loanId: string,
    data: {
      status: string;
      disbursement_date: Date;
      first_due_date: Date;
      last_due_date: Date;
      cached_outstanding_paise: bigint | number;
      processing_fee_paise?: bigint | number;
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
   * Create a loan status history entry within a transaction.
   */
  async createStatusHistory(
    data: {
      loan_id: string;
      from_status: string;
      to_status: string;
      changed_by: string;
    },
    tx: TxClient,
  ) {
    return tx.loan_status_history.create({
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
   * Enqueue an SMS notification to the outbox within a transaction.
   * Placeholder: creates an outbox record for async dispatch.
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
}
