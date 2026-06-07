import { Injectable } from '@nestjs/common';
import { ReceiptRepository, CreateReceiptData } from './receipt.repository';
import { NotFoundError } from '../../common/errors';
import { PrismaService } from '../../database/prisma.service';

/**
 * Prisma transaction client type.
 */
type TxClient = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

export interface GenerateReceiptInput {
  collectionId: string;
  loanId: string;
  customerId: string;
  amountPaise: number | bigint;
  paymentDate: Date;
  paymentMode: string;
  penaltyComponentPaise: number | bigint;
  interestComponentPaise: number | bigint;
  principalComponentPaise: number | bigint;
  outstandingAfterPaise: number | bigint;
  officerName: string;
  customerName: string;
  loanNumber: string;
  /** Set true when generating a compensating receipt for a reversal */
  isReversal?: boolean;
  /** Original receipt ID when this is a compensating receipt */
  originalReceiptId?: string;
}

/**
 * Receipt service — business logic for receipt generation and retrieval.
 *
 * Immutability enforced: no methods exist to update receipt content fields.
 * Only `markAsReversed` can change status and link to a compensating receipt.
 */
@Injectable()
export class ReceiptService {
  constructor(private readonly receiptRepository: ReceiptRepository) {}

  /**
   * Generate an immutable receipt with a unique sequential receipt number.
   *
   * Uses database sequence `receipt_number_seq` for concurrent-safe numbering.
   * All content fields are snapshot values captured at creation time and never modified.
   *
   * @param data - Receipt snapshot data
   * @param tx - Optional Prisma transaction client for atomic cross-module operations
   * @returns Created receipt record
   */
  async generateReceipt(data: GenerateReceiptInput, tx?: TxClient) {
    const receiptNumber = await this.receiptRepository.generateReceiptNumber(data.paymentDate, tx);

    const createData: CreateReceiptData = {
      receipt_number: receiptNumber,
      collection_id: data.collectionId,
      loan_id: data.loanId,
      customer_id: data.customerId,
      amount_paise: data.amountPaise,
      payment_date: data.paymentDate,
      payment_mode: data.paymentMode,
      penalty_component_paise: data.penaltyComponentPaise,
      interest_component_paise: data.interestComponentPaise,
      principal_component_paise: data.principalComponentPaise,
      outstanding_after_paise: data.outstandingAfterPaise,
      officer_name: data.officerName,
      customer_name: data.customerName,
      loan_number: data.loanNumber,
      is_reversal: data.isReversal,
      original_receipt_id: data.originalReceiptId,
    };

    return this.receiptRepository.create(createData, tx);
  }

  /**
   * Get a receipt by ID.
   * @throws NotFoundError if receipt does not exist
   */
  async getReceiptById(id: string) {
    const receipt = await this.receiptRepository.findById(id);
    if (!receipt) {
      throw new NotFoundError(`Receipt not found: ${id}`);
    }
    return receipt;
  }

  /**
   * Get a receipt formatted for printing (thermal/A4).
   * Returns the receipt data with a printable layout structure.
   * @throws NotFoundError if receipt does not exist
   */
  async getReceiptForPrint(id: string) {
    const receipt = await this.getReceiptById(id);

    return {
      ...receipt,
      printLayout: {
        companyName: 'AS FINANCE',
        title: receipt.is_reversal ? 'REVERSAL RECEIPT' : 'PAYMENT RECEIPT',
        receiptNumber: receipt.receipt_number,
        date: receipt.payment_date,
        customerName: receipt.customer_name,
        loanNumber: receipt.loan_number,
        amountPaise: receipt.amount_paise,
        paymentMode: receipt.payment_mode,
        allocation: {
          penaltyPaise: receipt.penalty_component_paise,
          interestPaise: receipt.interest_component_paise,
          principalPaise: receipt.principal_component_paise,
        },
        outstandingAfterPaise: receipt.outstanding_after_paise,
        officerName: receipt.officer_name,
        status: receipt.status,
        footer: 'This is a computer-generated receipt. No signature required.',
      },
    };
  }

  /**
   * Mark a receipt as reversed and link to the compensating receipt.
   *
   * This is the ONLY mutation allowed — changes status to 'reversed' and
   * sets the compensating_receipt_id. Content fields remain immutable.
   *
   * @param receiptId - The original receipt to mark as reversed
   * @param compensatingReceiptId - The new compensating receipt ID
   * @param tx - Optional Prisma transaction client
   */
  async markAsReversed(
    receiptId: string,
    compensatingReceiptId: string,
    tx?: TxClient,
  ) {
    return this.receiptRepository.markAsReversed(
      receiptId,
      compensatingReceiptId,
      tx,
    );
  }

  /** Find receipts by collection ID. */
  async getReceiptsByCollectionId(collectionId: string) {
    return this.receiptRepository.findByCollectionId(collectionId);
  }

  /** Find receipts by loan ID with pagination. */
  async getReceiptsByLoanId(loanId: string, skip?: number, take?: number) {
    return this.receiptRepository.findByLoanId(loanId, { skip, take });
  }

  /**
   * List receipts with optional filters and pagination.
   */
  async listReceipts(params: {
    loanId?: string;
    customerId?: string;
    receiptNumber?: string;
    skip?: number;
    take?: number;
  }) {
    const { loanId, customerId, receiptNumber, skip = 0, take = 20 } = params;

    // Receipt number is unique — short-circuit to a single-row lookup so users can
    // jump straight to a receipt by its printed number without scanning.
    if (receiptNumber) {
      const receipt = await this.receiptRepository.findByReceiptNumber(receiptNumber);
      return { data: receipt ? [receipt] : [], total: receipt ? 1 : 0 };
    }

    return this.receiptRepository.findMany({ loanId, customerId, skip, take });
  }
}
