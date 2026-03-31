import { PaymentMode } from '@as-finance/shared';
import { buildEntity, randomUUID } from './helpers.js';

/**
 * CollectionInput — input for posting a collection payment.
 * Maps to `collections` Prisma model fields.
 */
export interface CollectionInput {
  loanId: string;
  amountPaise: number;
  paymentDate: Date;
  paymentMode: PaymentMode;
  collectedBy: string;
  idempotencyKey: string;
}

export function buildCollectionInput(
  overrides?: Partial<CollectionInput>,
): CollectionInput {
  return buildEntity<CollectionInput>(
    {
      loanId: randomUUID(),
      amountPaise: 933_333,
      paymentDate: new Date('2024-02-15'),
      paymentMode: PaymentMode.CASH,
      collectedBy: randomUUID(),
      idempotencyKey: randomUUID(),
    },
    overrides,
  );
}
