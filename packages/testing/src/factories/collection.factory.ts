import { CollectionStatus, PaymentMode } from '@as-finance/shared';
import { buildEntity, randomUUID } from './helpers.js';

export interface TestCollection {
  id: string;
  loanId: string;
  amountPaise: number;
  paymentDate: Date;
  paymentMode: PaymentMode;
  status: CollectionStatus;
  collectedBy: string;
  reversedCollectionId: string | null;
  journalEntryId: string | null;
  receiptId: string | null;
  idempotencyKey: string;
  remarks: string | null;
  createdAt: Date;
}

export function createCollection(overrides?: Partial<TestCollection>): TestCollection {
  const now = new Date();
  return buildEntity<TestCollection>(
    {
      id: randomUUID(),
      loanId: randomUUID(),
      amountPaise: 1000000, // ₹10,000
      paymentDate: now,
      paymentMode: PaymentMode.CASH,
      status: CollectionStatus.POSTED,
      collectedBy: randomUUID(),
      reversedCollectionId: null,
      journalEntryId: null,
      receiptId: null,
      idempotencyKey: randomUUID(),
      remarks: null,
      createdAt: now,
    },
    overrides,
  );
}
