import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import { ReceiptService, GenerateReceiptInput } from '../receipt.service';
import { ReceiptRepository } from '../receipt.repository';

/**
 * Property 18: Receipt Reconciliation
 *
 * For any valid receipt, penalty_component + interest_component +
 * principal_component SHALL equal the receipt amountPaise.
 *
 * **Validates: Requirements 24.1**
 *
 * ---
 *
 * Receipt Immutability (supplementary)
 *
 * For all receipts, reading the receipt at any time after creation SHALL return
 * identical content (amount, components, customer name, loan number, receipt
 * number, officer name). Receipt content fields are snapshot values that never
 * change.
 *
 * **Validates: Requirements 23.4**
 *
 * ---
 *
 * Property 19: Receipt Uniqueness and Sequentiality
 *
 * For all generated receipts, receipt numbers SHALL be unique. For any two
 * receipts R1 and R2 where R1 was created before R2, the numeric portion of
 * R1's receipt number SHALL be less than R2's.
 *
 * **Validates: Requirements 24.2, 24.3**
 */

// --- Generators ---

const uuidArb = fc.uuid();

const paymentModeArb = fc.constantFrom('cash', 'bank_transfer', 'online');

const nameArb = fc
  .stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz '.split('')), {
    minLength: 2,
    maxLength: 40,
  })
  .map((s) => s.trim() || 'Name');

const loanNumberArb = fc
  .integer({ min: 1, max: 99999 })
  .map((n) => `LN-2024-${String(n).padStart(5, '0')}`);

/** Generates a valid GenerateReceiptInput with consistent component breakdown */
const receiptInputArb = fc
  .record({
    collectionId: uuidArb,
    loanId: uuidArb,
    customerId: uuidArb,
    penaltyComponentPaise: fc.integer({ min: 0, max: 5_000_000 }),
    interestComponentPaise: fc.integer({ min: 0, max: 20_000_000 }),
    principalComponentPaise: fc.integer({ min: 100, max: 50_000_000 }),
    outstandingAfterPaise: fc.integer({ min: 0, max: 100_000_000 }),
    paymentDate: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
    paymentMode: paymentModeArb,
    officerName: nameArb,
    customerName: nameArb,
    loanNumber: loanNumberArb,
  })
  .map((r) => ({
    ...r,
    amountPaise: r.penaltyComponentPaise + r.interestComponentPaise + r.principalComponentPaise,
  }));

// --- In-Memory Store ---

/**
 * Content fields that must be immutable after receipt creation.
 * These are the snapshot values captured at creation time.
 */
const IMMUTABLE_CONTENT_FIELDS = [
  'receipt_number',
  'amount_paise',
  'penalty_component_paise',
  'interest_component_paise',
  'principal_component_paise',
  'outstanding_after_paise',
  'officer_name',
  'customer_name',
  'loan_number',
  'payment_date',
  'payment_mode',
] as const;

interface StoredReceipt {
  id: string;
  receipt_number: string;
  collection_id: string;
  loan_id: string;
  customer_id: string;
  amount_paise: bigint;
  payment_date: Date;
  payment_mode: string;
  penalty_component_paise: bigint;
  interest_component_paise: bigint;
  principal_component_paise: bigint;
  outstanding_after_paise: bigint;
  officer_name: string;
  customer_name: string;
  loan_number: string;
  status: string;
  compensating_receipt_id: string | null;
  is_reversal: boolean;
  original_receipt_id: string | null;
  created_at: Date;
}

/**
 * Creates a ReceiptService backed by an in-memory store.
 * The store simulates the database sequence for receipt numbers and
 * enforces immutability by only allowing status/compensating_receipt_id changes.
 */
function createServiceWithInMemoryStore() {
  let sequenceCounter = 0;
  const store = new Map<string, StoredReceipt>();

  const mockRepo = {
    generateReceiptNumber: vi.fn().mockImplementation(async () => {
      sequenceCounter++;
      const year = new Date().getFullYear();
      const padded = String(sequenceCounter).padStart(5, '0');
      return `RCP-${year}-${padded}`;
    }),

    create: vi.fn().mockImplementation(async (data: Record<string, unknown>) => {
      const receipt: StoredReceipt = {
        id: crypto.randomUUID(),
        receipt_number: data['receipt_number'] as string,
        collection_id: data['collection_id'] as string,
        loan_id: data['loan_id'] as string,
        customer_id: data['customer_id'] as string,
        amount_paise: BigInt(data['amount_paise'] as number),
        payment_date: data['payment_date'] as Date,
        payment_mode: data['payment_mode'] as string,
        penalty_component_paise: BigInt(data['penalty_component_paise'] as number),
        interest_component_paise: BigInt(data['interest_component_paise'] as number),
        principal_component_paise: BigInt(data['principal_component_paise'] as number),
        outstanding_after_paise: BigInt(data['outstanding_after_paise'] as number),
        officer_name: data['officer_name'] as string,
        customer_name: data['customer_name'] as string,
        loan_number: data['loan_number'] as string,
        status: 'active',
        compensating_receipt_id: null,
        is_reversal: (data['is_reversal'] as boolean) ?? false,
        original_receipt_id: (data['original_receipt_id'] as string) ?? null,
        created_at: new Date(),
      };
      store.set(receipt.id, receipt);
      return { ...receipt };
    }),

    findById: vi.fn().mockImplementation(async (id: string) => {
      const receipt = store.get(id);
      return receipt ? { ...receipt } : null;
    }),

    markAsReversed: vi.fn().mockImplementation(
      async (receiptId: string, compensatingReceiptId: string) => {
        const receipt = store.get(receiptId);
        if (!receipt) return null;
        // Only status and compensating link change — content stays immutable
        receipt.status = 'reversed';
        receipt.compensating_receipt_id = compensatingReceiptId;
        return { ...receipt };
      },
    ),

    findByCollectionId: vi.fn().mockResolvedValue([]),
    findByLoanId: vi.fn().mockResolvedValue({ data: [], total: 0 }),
  };

  const service = new ReceiptService(mockRepo as unknown as ReceiptRepository);

  return { service, store, mockRepo, getSequence: () => sequenceCounter };
}

// --- Property Tests ---

describe('Property 18: Receipt Reconciliation — penalty + interest + principal = receipt amount', () => {
  /**
   * **Validates: Requirements 24.1**
   *
   * For any valid receipt input where components are generated independently,
   * the service must persist a receipt whose penalty + interest + principal
   * components exactly equal the receipt amountPaise.
   */
  it('for all valid receipt inputs, penalty + interest + principal components equal amountPaise', async () => {
    await fc.assert(
      fc.asyncProperty(receiptInputArb, async (input) => {
        const { service } = createServiceWithInMemoryStore();

        const receipt = await service.generateReceipt(input as GenerateReceiptInput);

        const penalty = Number(receipt.penalty_component_paise);
        const interest = Number(receipt.interest_component_paise);
        const principal = Number(receipt.principal_component_paise);
        const total = Number(receipt.amount_paise);

        expect(penalty + interest + principal).toBe(total);
      }),
      { numRuns: 200 },
    );
  });

  it('for all valid receipt inputs, components are non-negative integers', async () => {
    await fc.assert(
      fc.asyncProperty(receiptInputArb, async (input) => {
        const { service } = createServiceWithInMemoryStore();

        const receipt = await service.generateReceipt(input as GenerateReceiptInput);

        const penalty = Number(receipt.penalty_component_paise);
        const interest = Number(receipt.interest_component_paise);
        const principal = Number(receipt.principal_component_paise);
        const total = Number(receipt.amount_paise);

        expect(penalty).toBeGreaterThanOrEqual(0);
        expect(interest).toBeGreaterThanOrEqual(0);
        expect(principal).toBeGreaterThanOrEqual(0);
        expect(total).toBeGreaterThanOrEqual(0);

        // All values must be integers (paise)
        expect(Number.isInteger(penalty)).toBe(true);
        expect(Number.isInteger(interest)).toBe(true);
        expect(Number.isInteger(principal)).toBe(true);
        expect(Number.isInteger(total)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it('reconciliation holds after reading back from store', async () => {
    await fc.assert(
      fc.asyncProperty(receiptInputArb, async (input) => {
        const { service } = createServiceWithInMemoryStore();

        const created = await service.generateReceipt(input as GenerateReceiptInput);
        const readBack = await service.getReceiptById(created.id);

        const penalty = Number(readBack.penalty_component_paise);
        const interest = Number(readBack.interest_component_paise);
        const principal = Number(readBack.principal_component_paise);
        const total = Number(readBack.amount_paise);

        expect(penalty + interest + principal).toBe(total);
      }),
      { numRuns: 200 },
    );
  });
});

describe('Receipt Immutability (supplementary)', () => {
  it('for all valid receipt inputs, reading a receipt after creation returns identical content fields', async () => {
    await fc.assert(
      fc.asyncProperty(receiptInputArb, async (input) => {
        const { service } = createServiceWithInMemoryStore();

        const created = await service.generateReceipt(input as GenerateReceiptInput);
        const readBack = await service.getReceiptById(created.id);

        // Every immutable content field must match exactly
        for (const field of IMMUTABLE_CONTENT_FIELDS) {
          expect(readBack[field]).toEqual(created[field]);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('for all valid receipts, content fields remain identical even after markAsReversed', async () => {
    await fc.assert(
      fc.asyncProperty(receiptInputArb, async (input) => {
        const { service } = createServiceWithInMemoryStore();

        const created = await service.generateReceipt(input as GenerateReceiptInput);

        // Snapshot content before reversal
        const contentBefore: Record<string, unknown> = {};
        for (const field of IMMUTABLE_CONTENT_FIELDS) {
          contentBefore[field] = created[field];
        }

        // Mark as reversed — only status and compensating link should change
        await service.markAsReversed(created.id, 'compensating-receipt-id');

        const readAfterReversal = await service.getReceiptById(created.id);

        // Content fields must be unchanged
        for (const field of IMMUTABLE_CONTENT_FIELDS) {
          expect(readAfterReversal[field]).toEqual(contentBefore[field]);
        }

        // Status should have changed (this is the only allowed mutation)
        expect(readAfterReversal.status).toBe('reversed');
      }),
      { numRuns: 200 },
    );
  });

  it('ReceiptService exposes no update methods for content fields (structural immutability)', () => {
    const { service } = createServiceWithInMemoryStore();
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(service)).filter(
      (name) => name !== 'constructor' && typeof (service as unknown as Record<string, unknown>)[name] === 'function',
    );

    const CONTENT_MUTATION_PATTERNS = [
      /^update/i,
      /^edit/i,
      /^modify/i,
      /^patch/i,
      /^setAmount/i,
      /^setCustomer/i,
      /^setOfficer/i,
      /^setLoan/i,
      /^rename/i,
    ];

    for (const method of methods) {
      const isMutation = CONTENT_MUTATION_PATTERNS.some((p) => p.test(method));
      expect(isMutation, `ReceiptService should not have content mutation method: ${method}`).toBe(false);
    }
  });
});

describe('Property 19: Receipt Uniqueness and Sequentiality', () => {
  it('for all sequences of receipts, every receipt number is unique', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(receiptInputArb, { minLength: 2, maxLength: 10 }),
        async (inputs) => {
          const { service } = createServiceWithInMemoryStore();

          const receipts = [];
          for (const input of inputs) {
            const receipt = await service.generateReceipt(input as GenerateReceiptInput);
            receipts.push(receipt);
          }

          const receiptNumbers = receipts.map((r) => r.receipt_number);
          const uniqueNumbers = new Set(receiptNumbers);

          expect(uniqueNumbers.size).toBe(receiptNumbers.length);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('for all receipt pairs R1 created before R2, R1 numeric portion < R2 numeric portion', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(receiptInputArb, { minLength: 2, maxLength: 10 }),
        async (inputs) => {
          const { service } = createServiceWithInMemoryStore();

          const receipts = [];
          for (const input of inputs) {
            const receipt = await service.generateReceipt(input as GenerateReceiptInput);
            receipts.push(receipt);
          }

          // Extract numeric portion from RCP-{year}-{padded}
          function extractNumeric(receiptNumber: string): number {
            const parts = receiptNumber.split('-');
            return Number(parts[2]);
          }

          // For every pair where i < j (R_i created before R_j),
          // the numeric portion of R_i must be less than R_j
          for (let i = 0; i < receipts.length; i++) {
            for (let j = i + 1; j < receipts.length; j++) {
              const numI = extractNumeric(receipts[i]!.receipt_number);
              const numJ = extractNumeric(receipts[j]!.receipt_number);
              expect(numI).toBeLessThan(numJ);
            }
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('for all generated receipt numbers, format matches RCP-{year}-{padded5+}', async () => {
    await fc.assert(
      fc.asyncProperty(receiptInputArb, async (input) => {
        const { service } = createServiceWithInMemoryStore();

        const receipt = await service.generateReceipt(input as GenerateReceiptInput);

        // Verify format: RCP-YYYY-NNNNN
        expect(receipt.receipt_number).toMatch(/^RCP-\d{4}-\d{5,}$/);
      }),
      { numRuns: 200 },
    );
  });
});
