import { PaymentMode, ReceiptStatus } from '@as-finance/shared';
import { buildEntity, randomUUID } from './helpers.js';

/**
 * ReceiptData — represents an immutable receipt snapshot.
 * Maps to `receipts` Prisma model fields.
 */
export interface ReceiptData {
  id: string;
  receiptNumber: string;
  collectionId: string;
  loanId: string;
  customerId: string;
  amountPaise: number;
  paymentDate: Date;
  paymentMode: PaymentMode;
  penaltyComponentPaise: number;
  interestComponentPaise: number;
  principalComponentPaise: number;
  outstandingAfterPaise: number;
  officerName: string;
  customerName: string;
  loanNumber: string;
  status: ReceiptStatus;
  isReversal: boolean;
  originalReceiptId: string | null;
  compensatingReceiptId: string | null;
  createdAt: Date;
}

export function buildReceiptData(
  overrides?: Partial<ReceiptData>,
): ReceiptData {
  const now = new Date();
  const penaltyPaise = overrides?.penaltyComponentPaise ?? 0;
  const interestPaise = overrides?.interestComponentPaise ?? 100_000;
  const principalPaise = overrides?.principalComponentPaise ?? 833_333;
  const totalPaise = overrides?.amountPaise ?? penaltyPaise + interestPaise + principalPaise;

  return buildEntity<ReceiptData>(
    {
      id: randomUUID(),
      receiptNumber: `RCP-${Date.now()}`,
      collectionId: randomUUID(),
      loanId: randomUUID(),
      customerId: randomUUID(),
      amountPaise: totalPaise,
      paymentDate: now,
      paymentMode: PaymentMode.CASH,
      penaltyComponentPaise: penaltyPaise,
      interestComponentPaise: interestPaise,
      principalComponentPaise: principalPaise,
      outstandingAfterPaise: 9_066_667,
      officerName: 'Test Officer',
      customerName: 'Test Customer',
      loanNumber: 'LN-2024-00001',
      status: ReceiptStatus.ACTIVE,
      isReversal: false,
      originalReceiptId: null,
      compensatingReceiptId: null,
      createdAt: now,
    },
    overrides,
  );
}
