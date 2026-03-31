/**
 * Receipt-related fast-check arbitraries.
 * Generates receipt data where components sum to total amount.
 */
import fc from 'fast-check';
import { PaymentMode, ReceiptStatus } from '@as-finance/shared';
import type { ReceiptData } from '../factories/receipt-data.factory.js';

/**
 * Generates a valid ReceiptData where penalty + interest + principal = amountPaise.
 */
export const receiptDataArb: fc.Arbitrary<ReceiptData> = fc
  .record({
    penaltyComponentPaise: fc.integer({ min: 0, max: 100_000 }),
    interestComponentPaise: fc.integer({ min: 0, max: 500_000 }),
    principalComponentPaise: fc.integer({ min: 0, max: 1_000_000 }),
  })
  .chain(({ penaltyComponentPaise, interestComponentPaise, principalComponentPaise }) => {
    const amountPaise = penaltyComponentPaise + interestComponentPaise + principalComponentPaise;
    return fc
      .record({
        id: fc.uuid(),
        receiptNumber: fc.stringMatching(/^RCP-\d{8,13}$/),
        collectionId: fc.uuid(),
        loanId: fc.uuid(),
        customerId: fc.uuid(),
        paymentDate: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
        paymentMode: fc.constantFrom(PaymentMode.CASH, PaymentMode.BANK_TRANSFER, PaymentMode.ONLINE),
        outstandingAfterPaise: fc.integer({ min: 0, max: 10_000_000 }),
        officerName: fc.string({ minLength: 1, maxLength: 50 }),
        customerName: fc.string({ minLength: 1, maxLength: 50 }),
        loanNumber: fc.stringMatching(/^LN-\d{4}-\d{5}$/),
        status: fc.constantFrom(ReceiptStatus.ACTIVE, ReceiptStatus.REVERSED),
        createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
      })
      .map((fields) => ({
        ...fields,
        amountPaise,
        penaltyComponentPaise,
        interestComponentPaise,
        principalComponentPaise,
        isReversal: false,
        originalReceiptId: null,
        compensatingReceiptId: null,
      }));
  });
