import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReceiptService, type GenerateReceiptInput } from '../receipt.service';
import type { ReceiptRepository } from '../receipt.repository';
import { NotFoundError } from '../../../common/errors';

function makeReceiptInput(overrides?: Partial<GenerateReceiptInput>): GenerateReceiptInput {
  return {
    collectionId: 'col-1',
    loanId: 'loan-1',
    customerId: 'cust-1',
    amountPaise: 500000,
    paymentDate: new Date('2024-01-15'),
    paymentMode: 'cash',
    penaltyComponentPaise: 20000,
    interestComponentPaise: 180000,
    principalComponentPaise: 300000,
    outstandingAfterPaise: 4500000,
    officerName: 'Officer A',
    customerName: 'Customer B',
    loanNumber: 'LN-2024-00015',
    ...overrides,
  };
}

function makeReceiptRecord(overrides?: Record<string, unknown>) {
  return {
    id: 'receipt-1',
    receipt_number: 'RCP-2024-00001',
    collection_id: 'col-1',
    loan_id: 'loan-1',
    customer_id: 'cust-1',
    amount_paise: BigInt(500000),
    payment_date: new Date('2024-01-15'),
    payment_mode: 'cash',
    penalty_component_paise: BigInt(20000),
    interest_component_paise: BigInt(180000),
    principal_component_paise: BigInt(300000),
    outstanding_after_paise: BigInt(4500000),
    officer_name: 'Officer A',
    customer_name: 'Customer B',
    loan_number: 'LN-2024-00015',
    status: 'active',
    compensating_receipt_id: null,
    is_reversal: false,
    original_receipt_id: null,
    created_at: new Date(),
    ...overrides,
  };
}

describe('ReceiptService', () => {
  let service: ReceiptService;
  let repo: {
    generateReceiptNumber: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    markAsReversed: ReturnType<typeof vi.fn>;
    findByCollectionId: ReturnType<typeof vi.fn>;
    findByLoanId: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    repo = {
      generateReceiptNumber: vi.fn().mockResolvedValue('RCP-2024-00001'),
      create: vi.fn().mockResolvedValue(makeReceiptRecord()),
      findById: vi.fn().mockResolvedValue(makeReceiptRecord()),
      markAsReversed: vi.fn().mockResolvedValue(
        makeReceiptRecord({ status: 'reversed', compensating_receipt_id: 'receipt-2' }),
      ),
      findByCollectionId: vi.fn().mockResolvedValue([makeReceiptRecord()]),
      findByLoanId: vi.fn().mockResolvedValue({ data: [makeReceiptRecord()], total: 1 }),
    };
    service = new ReceiptService(repo as unknown as ReceiptRepository);
  });

  // --- Requirement 23.1: generateReceipt() with sequential receipt number ---
  describe('generateReceipt', () => {
    it('should generate a receipt number and create a receipt', async () => {
      const input = makeReceiptInput();
      const result = await service.generateReceipt(input);

      expect(repo.generateReceiptNumber).toHaveBeenCalledOnce();
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          receipt_number: 'RCP-2024-00001',
          collection_id: 'col-1',
          customer_name: 'Customer B',
          loan_number: 'LN-2024-00015',
        }),
        undefined,
      );
      expect(result.receipt_number).toBe('RCP-2024-00001');
    });

    it('should map all input fields to repository create data correctly', async () => {
      const input = makeReceiptInput();
      await service.generateReceipt(input);

      expect(repo.create).toHaveBeenCalledWith(
        {
          receipt_number: 'RCP-2024-00001',
          collection_id: 'col-1',
          loan_id: 'loan-1',
          customer_id: 'cust-1',
          amount_paise: 500000,
          payment_date: new Date('2024-01-15'),
          payment_mode: 'cash',
          penalty_component_paise: 20000,
          interest_component_paise: 180000,
          principal_component_paise: 300000,
          outstanding_after_paise: 4500000,
          officer_name: 'Officer A',
          customer_name: 'Customer B',
          loan_number: 'LN-2024-00015',
          is_reversal: undefined,
          original_receipt_id: undefined,
        },
        undefined,
      );
    });

    it('should pass transaction client through to repository', async () => {
      const fakeTx = {} as never;
      const input = makeReceiptInput();
      await service.generateReceipt(input, fakeTx);

      expect(repo.generateReceiptNumber).toHaveBeenCalledWith(input.paymentDate, fakeTx);
      expect(repo.create).toHaveBeenCalledWith(expect.any(Object), fakeTx);
    });

    it('should support reversal receipt generation with is_reversal and original_receipt_id', async () => {
      const input = makeReceiptInput({
        isReversal: true,
        originalReceiptId: 'receipt-orig',
      });
      await service.generateReceipt(input);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          is_reversal: true,
          original_receipt_id: 'receipt-orig',
        }),
        undefined,
      );
    });

    it('should use the receipt number from the repository sequence', async () => {
      repo.generateReceiptNumber.mockResolvedValue('RCP-2025-00042');
      repo.create.mockResolvedValue(makeReceiptRecord({ receipt_number: 'RCP-2025-00042' }));

      const input = makeReceiptInput();
      const result = await service.generateReceipt(input);

      expect(result.receipt_number).toBe('RCP-2025-00042');
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ receipt_number: 'RCP-2025-00042' }),
        undefined,
      );
    });

    it('should handle BigInt amount values', async () => {
      const input = makeReceiptInput({
        amountPaise: BigInt(9_999_999_999),
        penaltyComponentPaise: BigInt(100000),
        interestComponentPaise: BigInt(4_999_949_999),
        principalComponentPaise: BigInt(4_999_950_000),
        outstandingAfterPaise: BigInt(0),
      });
      await service.generateReceipt(input);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount_paise: BigInt(9_999_999_999),
          penalty_component_paise: BigInt(100000),
          interest_component_paise: BigInt(4_999_949_999),
          principal_component_paise: BigInt(4_999_950_000),
          outstanding_after_paise: BigInt(0),
        }),
        undefined,
      );
    });
  });

  // --- Requirement 23.2: getReceiptForPrint() with print layout ---
  describe('getReceiptById', () => {
    it('should return receipt when found', async () => {
      const result = await service.getReceiptById('receipt-1');
      expect(result.id).toBe('receipt-1');
      expect(repo.findById).toHaveBeenCalledWith('receipt-1');
    });

    it('should throw NotFoundError when receipt does not exist', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.getReceiptById('nonexistent')).rejects.toThrow(NotFoundError);
    });
  });

  describe('getReceiptForPrint', () => {
    it('should return receipt with complete print layout structure', async () => {
      const result = await service.getReceiptForPrint('receipt-1');

      expect(result.printLayout).toBeDefined();
      expect(result.printLayout.companyName).toBe('AS FINANCE');
      expect(result.printLayout.title).toBe('PAYMENT RECEIPT');
      expect(result.printLayout.receiptNumber).toBe('RCP-2024-00001');
      expect(result.printLayout.date).toEqual(new Date('2024-01-15'));
      expect(result.printLayout.customerName).toBe('Customer B');
      expect(result.printLayout.loanNumber).toBe('LN-2024-00015');
      expect(result.printLayout.amountPaise).toBe(BigInt(500000));
      expect(result.printLayout.paymentMode).toBe('cash');
      expect(result.printLayout.officerName).toBe('Officer A');
      expect(result.printLayout.status).toBe('active');
      expect(result.printLayout.footer).toContain('computer-generated');
    });

    it('should include allocation breakdown in print layout', async () => {
      const result = await service.getReceiptForPrint('receipt-1');

      expect(result.printLayout.allocation).toBeDefined();
      expect(result.printLayout.allocation.penaltyPaise).toBe(BigInt(20000));
      expect(result.printLayout.allocation.interestPaise).toBe(BigInt(180000));
      expect(result.printLayout.allocation.principalPaise).toBe(BigInt(300000));
    });

    it('should include outstanding after payment in print layout', async () => {
      const result = await service.getReceiptForPrint('receipt-1');
      expect(result.printLayout.outstandingAfterPaise).toBe(BigInt(4500000));
    });

    it('should show REVERSAL RECEIPT title for reversal receipts', async () => {
      repo.findById.mockResolvedValue(makeReceiptRecord({ is_reversal: true }));
      const result = await service.getReceiptForPrint('receipt-1');
      expect(result.printLayout.title).toBe('REVERSAL RECEIPT');
    });

    it('should show PAYMENT RECEIPT title for normal receipts', async () => {
      repo.findById.mockResolvedValue(makeReceiptRecord({ is_reversal: false }));
      const result = await service.getReceiptForPrint('receipt-1');
      expect(result.printLayout.title).toBe('PAYMENT RECEIPT');
    });

    it('should throw NotFoundError for non-existent receipt', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.getReceiptForPrint('nonexistent')).rejects.toThrow(NotFoundError);
    });

    it('should preserve all original receipt fields alongside print layout', async () => {
      const result = await service.getReceiptForPrint('receipt-1');

      // Original receipt fields should still be present
      expect(result.id).toBe('receipt-1');
      expect(result.receipt_number).toBe('RCP-2024-00001');
      expect(result.collection_id).toBe('col-1');
      expect(result.loan_id).toBe('loan-1');
      expect(result.customer_id).toBe('cust-1');
      expect(result.status).toBe('active');
    });
  });

  // --- Requirement 23.3: markAsReversed() — only status and compensating_receipt_id modified ---
  describe('markAsReversed', () => {
    it('should delegate to repository with correct params', async () => {
      const result = await service.markAsReversed('receipt-1', 'receipt-2');

      expect(repo.markAsReversed).toHaveBeenCalledWith('receipt-1', 'receipt-2', undefined);
      expect(result.status).toBe('reversed');
      expect(result.compensating_receipt_id).toBe('receipt-2');
    });

    it('should pass transaction client through', async () => {
      const fakeTx = {} as never;
      await service.markAsReversed('receipt-1', 'receipt-2', fakeTx);
      expect(repo.markAsReversed).toHaveBeenCalledWith('receipt-1', 'receipt-2', fakeTx);
    });

    it('should only modify status and compensating_receipt_id, not content fields', async () => {
      const original = makeReceiptRecord();
      const reversed = makeReceiptRecord({
        status: 'reversed',
        compensating_receipt_id: 'receipt-2',
      });
      repo.markAsReversed.mockResolvedValue(reversed);

      const result = await service.markAsReversed('receipt-1', 'receipt-2');

      // Content fields remain unchanged
      expect(result.receipt_number).toBe(original.receipt_number);
      expect(result.amount_paise).toBe(original.amount_paise);
      expect(result.penalty_component_paise).toBe(original.penalty_component_paise);
      expect(result.interest_component_paise).toBe(original.interest_component_paise);
      expect(result.principal_component_paise).toBe(original.principal_component_paise);
      expect(result.outstanding_after_paise).toBe(original.outstanding_after_paise);
      expect(result.officer_name).toBe(original.officer_name);
      expect(result.customer_name).toBe(original.customer_name);
      expect(result.loan_number).toBe(original.loan_number);
      expect(result.payment_mode).toBe(original.payment_mode);
      expect(result.payment_date).toEqual(original.payment_date);

      // Only these two fields changed
      expect(result.status).toBe('reversed');
      expect(result.compensating_receipt_id).toBe('receipt-2');
    });
  });

  // --- Requirement 23.4: Immutability enforcement — no update/delete methods for content ---
  describe('immutability enforcement', () => {
    it('should not expose any method to update receipt content fields', () => {
      const svc = service as unknown as Record<string, unknown>;
      expect(svc['updateReceipt']).toBeUndefined();
      expect(svc['updateReceiptContent']).toBeUndefined();
      expect(svc['editReceipt']).toBeUndefined();
      expect(svc['patchReceipt']).toBeUndefined();
    });

    it('should not expose any method to delete receipts', () => {
      const svc = service as unknown as Record<string, unknown>;
      expect(svc['deleteReceipt']).toBeUndefined();
      expect(svc['removeReceipt']).toBeUndefined();
      expect(svc['softDeleteReceipt']).toBeUndefined();
    });

    it('should only expose markAsReversed as the sole mutation method', () => {
      // Verify that the only method that can modify a receipt is markAsReversed
      const methodNames = Object.getOwnPropertyNames(Object.getPrototypeOf(service))
        .filter((name) => name !== 'constructor');

      const mutationMethods = methodNames.filter(
        (name) =>
          name.startsWith('update') ||
          name.startsWith('delete') ||
          name.startsWith('remove') ||
          name.startsWith('edit') ||
          name.startsWith('patch'),
      );

      expect(mutationMethods).toEqual([]);

      // markAsReversed is the only allowed mutation
      expect(methodNames).toContain('markAsReversed');
    });
  });

  // --- Requirement 23.5: getReceiptsByLoanId() pagination ---
  describe('getReceiptsByLoanId', () => {
    it('should return paginated receipts for a loan', async () => {
      const result = await service.getReceiptsByLoanId('loan-1', 0, 10);
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(repo.findByLoanId).toHaveBeenCalledWith('loan-1', { skip: 0, take: 10 });
    });

    it('should pass skip and take parameters for pagination', async () => {
      await service.getReceiptsByLoanId('loan-1', 20, 5);
      expect(repo.findByLoanId).toHaveBeenCalledWith('loan-1', { skip: 20, take: 5 });
    });

    it('should handle undefined pagination params', async () => {
      await service.getReceiptsByLoanId('loan-1');
      expect(repo.findByLoanId).toHaveBeenCalledWith('loan-1', { skip: undefined, take: undefined });
    });

    it('should return total count alongside data for pagination metadata', async () => {
      repo.findByLoanId.mockResolvedValue({
        data: [makeReceiptRecord(), makeReceiptRecord({ id: 'receipt-2', receipt_number: 'RCP-2024-00002' })],
        total: 15,
      });

      const result = await service.getReceiptsByLoanId('loan-1', 0, 2);
      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(15);
    });

    it('should return empty data when no receipts exist for loan', async () => {
      repo.findByLoanId.mockResolvedValue({ data: [], total: 0 });

      const result = await service.getReceiptsByLoanId('loan-nonexistent');
      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  // --- Requirement 23.6: Reversal receipt flags ---
  describe('reversal receipt flags', () => {
    it('should generate a reversal receipt with is_reversal=true', async () => {
      const reversalRecord = makeReceiptRecord({
        id: 'receipt-reversal',
        is_reversal: true,
        original_receipt_id: 'receipt-1',
      });
      repo.create.mockResolvedValue(reversalRecord);

      const input = makeReceiptInput({
        isReversal: true,
        originalReceiptId: 'receipt-1',
      });
      const result = await service.generateReceipt(input);

      expect(result.is_reversal).toBe(true);
      expect(result.original_receipt_id).toBe('receipt-1');
    });

    it('should generate a normal receipt with is_reversal defaulting to undefined when not set', async () => {
      const input = makeReceiptInput();
      await service.generateReceipt(input);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          is_reversal: undefined,
          original_receipt_id: undefined,
        }),
        undefined,
      );
    });

    it('should set is_reversal=false explicitly when provided', async () => {
      const input = makeReceiptInput({ isReversal: false });
      await service.generateReceipt(input);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ is_reversal: false }),
        undefined,
      );
    });

    it('should reference original receipt via original_receipt_id on reversal receipts', async () => {
      const input = makeReceiptInput({
        isReversal: true,
        originalReceiptId: 'receipt-original-123',
      });
      await service.generateReceipt(input);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          is_reversal: true,
          original_receipt_id: 'receipt-original-123',
        }),
        undefined,
      );
    });
  });

  // --- Additional: getReceiptsByCollectionId ---
  describe('getReceiptsByCollectionId', () => {
    it('should return receipts for a collection', async () => {
      const result = await service.getReceiptsByCollectionId('col-1');
      expect(result).toHaveLength(1);
      expect(repo.findByCollectionId).toHaveBeenCalledWith('col-1');
    });

    it('should return empty array when no receipts exist for collection', async () => {
      repo.findByCollectionId.mockResolvedValue([]);
      const result = await service.getReceiptsByCollectionId('col-nonexistent');
      expect(result).toHaveLength(0);
    });
  });
});
