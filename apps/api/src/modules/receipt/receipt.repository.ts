import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

/**
 * Prisma transaction client type — a subset of PrismaService used within
 * `prisma.$transaction()` callbacks.
 */
type TxClient = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

export interface CreateReceiptData {
  receipt_number: string;
  collection_id: string;
  loan_id: string;
  customer_id: string;
  amount_paise: bigint | number;
  payment_date: Date;
  payment_mode: string;
  penalty_component_paise: bigint | number;
  interest_component_paise: bigint | number;
  principal_component_paise: bigint | number;
  outstanding_after_paise: bigint | number;
  officer_name: string;
  customer_name: string;
  loan_number: string;
  is_reversal?: boolean;
  original_receipt_id?: string;
}

const RECEIPT_SELECT = {
  id: true,
  receipt_number: true,
  collection_id: true,
  loan_id: true,
  customer_id: true,
  amount_paise: true,
  payment_date: true,
  payment_mode: true,
  penalty_component_paise: true,
  interest_component_paise: true,
  principal_component_paise: true,
  outstanding_after_paise: true,
  officer_name: true,
  customer_name: true,
  loan_number: true,
  status: true,
  compensating_receipt_id: true,
  is_reversal: true,
  original_receipt_id: true,
  created_at: true,
};

/**
 * Receipt repository — data access for receipts.
 *
 * Immutable by design: no update methods for content fields.
 * Only status and compensating_receipt_id can be modified (for reversal linking).
 */
@Injectable()
export class ReceiptRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate a unique sequential receipt number using the database sequence.
   * Format: RCP-{year}-{padded_number} (e.g., RCP-2024-00001)
   *
   * Uses PostgreSQL sequence `receipt_number_seq` for gap-free, concurrent-safe numbering.
   */
  async generateReceiptNumber(tx?: TxClient): Promise<string> {
    const client = tx ?? this.prisma;
    const result = await (client as TxClient).$queryRaw<
      { nextval: bigint }[]
    >`SELECT nextval('receipt_number_seq')`;
    const seq = Number(result[0]!.nextval);
    const year = new Date().getFullYear();
    const padded = String(seq).padStart(5, '0');
    return `RCP-${year}-${padded}`;
  }

  /**
   * Create a receipt with snapshot data.
   * Accepts an optional Prisma transaction client for cross-module transactions.
   */
  async create(data: CreateReceiptData, tx?: TxClient) {
    const client = tx ?? this.prisma;
    return (client as TxClient).receipts.create({
      data: {
        receipt_number: data.receipt_number,
        collection_id: data.collection_id,
        loan_id: data.loan_id,
        customer_id: data.customer_id,
        amount_paise: data.amount_paise,
        payment_date: data.payment_date,
        payment_mode: data.payment_mode as never,
        penalty_component_paise: data.penalty_component_paise,
        interest_component_paise: data.interest_component_paise,
        principal_component_paise: data.principal_component_paise,
        outstanding_after_paise: data.outstanding_after_paise,
        officer_name: data.officer_name,
        customer_name: data.customer_name,
        loan_number: data.loan_number,
        is_reversal: data.is_reversal ?? false,
        original_receipt_id: data.original_receipt_id,
      },
      select: RECEIPT_SELECT,
    });
  }

  /** Find a receipt by ID. */
  async findById(id: string) {
    return this.prisma.receipts.findUnique({
      where: { id },
      select: RECEIPT_SELECT,
    });
  }

  /**
   * Mark a receipt as reversed and link to the compensating receipt.
   *
   * This is the ONLY mutation allowed on a receipt — status and compensating link.
   * Content fields (amount, components, names, numbers) are never modified.
   */
  async markAsReversed(
    receiptId: string,
    compensatingReceiptId: string,
    tx?: TxClient,
  ) {
    const client = tx ?? this.prisma;
    return (client as TxClient).receipts.update({
      where: { id: receiptId },
      data: {
        status: 'reversed',
        compensating_receipt_id: compensatingReceiptId,
      },
      select: RECEIPT_SELECT,
    });
  }

  /** Find receipts by collection ID. */
  async findByCollectionId(collectionId: string) {
    return this.prisma.receipts.findMany({
      where: { collection_id: collectionId },
      select: RECEIPT_SELECT,
    });
  }

  /** Find receipts by loan ID with pagination. */
  async findByLoanId(loanId: string, params?: { skip?: number; take?: number }) {
    const [data, total] = await Promise.all([
      this.prisma.receipts.findMany({
        where: { loan_id: loanId },
        skip: params?.skip ?? 0,
        take: params?.take ?? 50,
        orderBy: { created_at: 'desc' },
        select: RECEIPT_SELECT,
      }),
      this.prisma.receipts.count({ where: { loan_id: loanId } }),
    ]);
    return { data, total };
  }
}
