import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReceiptService, GenerateReceiptInput } from '../receipt.service';
import { ReceiptRepository } from '../receipt.repository';
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

    it('should pass transaction client through to repository', async () => {
      const fakeTx = {} as never;
      const input = makeReceiptInput();
      await service.generateReceipt(input, fakeTx);

      expect(repo.generateReceiptNumber).toHaveBeenCalledWith(fakeTx);
      expect(repo.create).toHaveBeenCalledWith(expect.any(Object), fakeTx);
    });

    it('should support reversal receipt generation', async () => {
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
  });

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
    it('should return receipt with print layout', async () => {
      const result = await service.getReceiptForPrint('receipt-1');

      expect(result.printLayout).toBeDefined();
      expect(result.printLayout.companyName).toBe('AS FINANCE');
      expect(result.printLayout.title).toBe('PAYMENT RECEIPT');
      expect(result.printLayout.receiptNumber).toBe('RCP-2024-00001');
      expect(result.printLayout.footer).toContain('computer-generated');
    });

    it('should show REVERSAL RECEIPT title for reversal receipts', async () => {
      repo.findById.mockResolvedValue(makeReceiptRecord({ is_reversal: true }));
      const result = await service.getReceiptForPrint('receipt-1');
      expect(result.printLayout.title).toBe('REVERSAL RECEIPT');
    });

    it('should throw NotFoundError for non-existent receipt', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.getReceiptForPrint('nonexistent')).rejects.toThrow(NotFoundError);
    });
  });

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
  });

  describe('getReceiptsByCollectionId', () => {
    it('should return receipts for a collection', async () => {
      const result = await service.getReceiptsByCollectionId('col-1');
      expect(result).toHaveLength(1);
      expect(repo.findByCollectionId).toHaveBeenCalledWith('col-1');
    });
  });

  describe('getReceiptsByLoanId', () => {
    it('should return paginated receipts for a loan', async () => {
      const result = await service.getReceiptsByLoanId('loan-1', 0, 10);
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(repo.findByLoanId).toHaveBeenCalledWith('loan-1', { skip: 0, take: 10 });
    });
  });
});
