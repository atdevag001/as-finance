import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calculateForeclosureSettlement,
  calculateFlatAccruedInterest,
  calculateReducingBalanceAccruedInterest,
  ForeclosureService,
} from '../foreclosure.service';
import { BusinessRuleError, NotFoundError } from '../../../common/errors';

/**
 * Unit tests for ForeclosureService.
 *
 * Tests calculateForeclosureSettlement(), calculateFlatAccruedInterest(),
 * calculateReducingBalanceAccruedInterest(), createQuote(), executeForeclosure(),
 * computeOutstandingPrincipal(), buildSettlementJournalLines().
 *
 * Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 12.9
 */

// ─── Pure Function Tests ─────────────────────────────────────────────────────

describe('calculateForeclosureSettlement', () => {
  it('calculates settlement as principal + interest + penalties - rebate (Req 12.1)', () => {
    const result = calculateForeclosureSettlement({
      outstandingPrincipalPaise: 100000,
      accruedInterestPaise: 5000,
      pendingPenaltiesPaise: 2000,
      rebatePaise: 1000,
    });
    expect(result.settlementAmountPaise).toBe(106000);
    expect(result.outstandingPrincipalPaise).toBe(100000);
    expect(result.accruedInterestPaise).toBe(5000);
    expect(result.pendingPenaltiesPaise).toBe(2000);
    expect(result.rebatePaise).toBe(1000);
  });

  it('clamps to zero when rebate exceeds total', () => {
    const result = calculateForeclosureSettlement({
      outstandingPrincipalPaise: 1000,
      accruedInterestPaise: 500,
      pendingPenaltiesPaise: 200,
      rebatePaise: 5000,
    });
    expect(result.settlementAmountPaise).toBe(0);
  });

  it('handles zero rebate', () => {
    const result = calculateForeclosureSettlement({
      outstandingPrincipalPaise: 50000,
      accruedInterestPaise: 3000,
      pendingPenaltiesPaise: 1000,
      rebatePaise: 0,
    });
    expect(result.settlementAmountPaise).toBe(54000);
  });

  it('handles zero penalties', () => {
    const result = calculateForeclosureSettlement({
      outstandingPrincipalPaise: 50000,
      accruedInterestPaise: 3000,
      pendingPenaltiesPaise: 0,
      rebatePaise: 0,
    });
    expect(result.settlementAmountPaise).toBe(53000);
  });

  it('handles all zeros', () => {
    const result = calculateForeclosureSettlement({
      outstandingPrincipalPaise: 0,
      accruedInterestPaise: 0,
      pendingPenaltiesPaise: 0,
      rebatePaise: 0,
    });
    expect(result.settlementAmountPaise).toBe(0);
  });

  it('handles rebate equal to total', () => {
    const result = calculateForeclosureSettlement({
      outstandingPrincipalPaise: 10000,
      accruedInterestPaise: 2000,
      pendingPenaltiesPaise: 1000,
      rebatePaise: 13000,
    });
    expect(result.settlementAmountPaise).toBe(0);
  });

  it('handles large values without overflow', () => {
    const result = calculateForeclosureSettlement({
      outstandingPrincipalPaise: 1_000_000_000,
      accruedInterestPaise: 100_000_000,
      pendingPenaltiesPaise: 10_000_000,
      rebatePaise: 5_000_000,
    });
    expect(result.settlementAmountPaise).toBe(1_105_000_000);
  });

  it('preserves all input fields in the result', () => {
    const input = {
      outstandingPrincipalPaise: 50000,
      accruedInterestPaise: 3000,
      pendingPenaltiesPaise: 1000,
      rebatePaise: 500,
    };
    const result = calculateForeclosureSettlement(input);
    expect(result.outstandingPrincipalPaise).toBe(50000);
    expect(result.accruedInterestPaise).toBe(3000);
    expect(result.pendingPenaltiesPaise).toBe(1000);
    expect(result.rebatePaise).toBe(500);
  });
});

describe('calculateFlatAccruedInterest', () => {
  it('calculates pro-rata interest for flat loans (Req 12.2)', () => {
    const disbursement = new Date('2024-01-01');
    const lastDue = new Date('2025-01-01'); // 366 days (leap year)
    const settlement = new Date('2024-07-01'); // 182 days elapsed
    const totalInterest = 120000;
    const accrued = calculateFlatAccruedInterest(totalInterest, disbursement, lastDue, settlement);
    const expected = Math.round(120000 * 182 / 366);
    expect(accrued).toBe(expected);
  });

  it('returns 0 when settlement is at disbursement date', () => {
    const d = new Date('2024-01-01');
    const accrued = calculateFlatAccruedInterest(100000, d, new Date('2025-01-01'), d);
    expect(accrued).toBe(0);
  });

  it('returns full interest when settlement equals last due date', () => {
    const disbursement = new Date('2024-01-01');
    const lastDue = new Date('2025-01-01');
    const accrued = calculateFlatAccruedInterest(100000, disbursement, lastDue, lastDue);
    expect(accrued).toBe(100000);
  });

  it('returns proportional interest for mid-tenure settlement', () => {
    const disbursement = new Date('2024-01-01');
    const lastDue = new Date('2024-04-01'); // 91 days
    const settlement = new Date('2024-02-01'); // 31 days elapsed
    const accrued = calculateFlatAccruedInterest(91000, disbursement, lastDue, settlement);
    expect(accrued).toBe(31000); // 91000 * 31 / 91
  });

  it('returns 0 when settlement is before disbursement', () => {
    const accrued = calculateFlatAccruedInterest(
      100000, new Date('2024-06-01'), new Date('2025-06-01'), new Date('2024-05-01'),
    );
    expect(accrued).toBe(0);
  });

  it('returns 0 for zero total interest', () => {
    const accrued = calculateFlatAccruedInterest(
      0, new Date('2024-01-01'), new Date('2025-01-01'), new Date('2024-07-01'),
    );
    expect(accrued).toBe(0);
  });
});

describe('calculateReducingBalanceAccruedInterest', () => {
  it('calculates daily accrual on outstanding principal (Req 12.3)', () => {
    const lastPayment = new Date('2024-06-01');
    const settlement = new Date('2024-07-01'); // 30 days
    const accrued = calculateReducingBalanceAccruedInterest(100000, 1200, lastPayment, settlement);
    expect(accrued).toBeGreaterThan(0);
    expect(accrued).toBeLessThan(100000);
    // ~100000 * 0.12/365 * 30 ≈ 986
    expect(accrued).toBeGreaterThanOrEqual(980);
    expect(accrued).toBeLessThanOrEqual(990);
  });

  it('returns 0 when settlement is same day as last payment', () => {
    const d = new Date('2024-06-01');
    expect(calculateReducingBalanceAccruedInterest(100000, 1200, d, d)).toBe(0);
  });

  it('returns 0 when outstanding principal is 0', () => {
    expect(calculateReducingBalanceAccruedInterest(
      0, 1200, new Date('2024-06-01'), new Date('2024-07-01'),
    )).toBe(0);
  });

  it('returns 0 when annual rate is 0', () => {
    expect(calculateReducingBalanceAccruedInterest(
      100000, 0, new Date('2024-06-01'), new Date('2024-07-01'),
    )).toBe(0);
  });

  it('scales approximately linearly with days elapsed', () => {
    const lp = new Date('2024-06-01');
    const a30 = calculateReducingBalanceAccruedInterest(100000, 1200, lp, new Date('2024-07-01'));
    const a60 = calculateReducingBalanceAccruedInterest(100000, 1200, lp, new Date('2024-07-31'));
    // Allow 1 paisa rounding tolerance
    expect(Math.abs(a60 - a30 * 2)).toBeLessThanOrEqual(1);
  });

  it('scales approximately linearly with outstanding principal', () => {
    const lp = new Date('2024-06-01');
    const s = new Date('2024-07-01');
    const a100k = calculateReducingBalanceAccruedInterest(100000, 1200, lp, s);
    const a200k = calculateReducingBalanceAccruedInterest(200000, 1200, lp, s);
    // Allow 1 paisa rounding tolerance
    expect(Math.abs(a200k - a100k * 2)).toBeLessThanOrEqual(1);
  });

  it('returns 0 when settlement is before last payment', () => {
    expect(calculateReducingBalanceAccruedInterest(
      100000, 1200, new Date('2024-07-01'), new Date('2024-06-01'),
    )).toBe(0);
  });
});

// ─── ForeclosureService Tests ────────────────────────────────────────────────

describe('ForeclosureService', () => {
  let service: ForeclosureService;
  let mockPrisma: any;
  let mockForeclosureRepo: any;
  let mockAccountingService: any;
  let mockAuditService: any;
  let mockIdempotencyService: any;
  let mockReceiptService: any;
  let mockLoanService: any;
  let mockTx: any;

  function buildLoan(overrides?: Record<string, any>) {
    return {
      id: 'loan-1',
      loan_number: 'LN-2024-001',
      customer_id: 'cust-1',
      principal_paise: 100000n,
      status: 'active',
      total_interest_paise: 12000n,
      total_payable_paise: 112000n,
      cached_outstanding_paise: 112000n,
      disbursement_date: new Date('2024-01-01'),
      last_due_date: new Date('2025-01-01'),
      dpd: 0,
      overdue_bucket: 'bucket_0',
      created_by: 'user-0',
      product_version: {
        id: 'pv-1',
        interest_type: 'flat',
        annual_rate_bps: 1200,
        repayment_frequency: 'monthly',
        allocation_order: ['penalty', 'interest', 'principal'],
      },
      customer: { id: 'cust-1', full_name: 'Test Customer', mobile: '9876543210' },
      schedules: [
        {
          id: 's-1', installment_number: 1, due_date: new Date('2024-02-01'),
          principal_paise: 50000n, interest_paise: 6000n, total_paise: 56000n,
          principal_paid_paise: 0n, interest_paid_paise: 0n,
          penalty_paid_paise: 0n, status: 'pending',
        },
        {
          id: 's-2', installment_number: 2, due_date: new Date('2024-03-01'),
          principal_paise: 50000n, interest_paise: 6000n, total_paise: 56000n,
          principal_paid_paise: 0n, interest_paid_paise: 0n,
          penalty_paid_paise: 0n, status: 'pending',
        },
      ],
      ...overrides,
    };
  }

  beforeEach(() => {
    mockTx = {
      collections: { create: vi.fn().mockResolvedValue({ id: 'col-1' }) },
    };
    mockPrisma = { $transaction: vi.fn((fn: any) => fn(mockTx)) };
    mockForeclosureRepo = {
      getLoanForForeclosure: vi.fn(),
      getPendingPenalties: vi.fn().mockResolvedValue([]),
      createForeclosure: vi.fn().mockResolvedValue({ id: 'fc-1' }),
      findById: vi.fn(),
      lockLoanForUpdate: vi.fn(),
      updateForeclosure: vi.fn(),
      closeAllInstallments: vi.fn(),
      updateLoan: vi.fn(),
      createStatusHistory: vi.fn(),
      findAccountByCode: vi.fn(),
      getOfficerName: vi.fn().mockResolvedValue('Test Officer'),
      markPenaltiesAsPaid: vi.fn(),
    };
    mockAccountingService = {
      createJournalEntry: vi.fn().mockResolvedValue({ id: 'je-1' }),
    };
    mockAuditService = {
      createAuditLog: vi.fn().mockResolvedValue({ id: 'al-1' }),
    };
    mockIdempotencyService = {
      find: vi.fn().mockResolvedValue(null),
      store: vi.fn(),
    };
    mockReceiptService = {
      generateReceipt: vi.fn().mockResolvedValue({
        id: 'rcp-1', receipt_number: 'RCP-2024-001',
      }),
    };
    mockLoanService = {
      validateTransition: vi.fn(),
    };
    service = new ForeclosureService(
      mockPrisma, mockForeclosureRepo, mockAccountingService,
      mockAuditService, mockIdempotencyService, mockReceiptService,
      mockLoanService,
    );
  });

  // ─── createQuote ─────────────────────────────────────────────────────────

  describe('createQuote', () => {
    it('creates a foreclosure quote for an active loan (Req 12.4)', async () => {
      mockForeclosureRepo.getLoanForForeclosure.mockResolvedValue(buildLoan());
      const result = await service.createQuote({ loanId: 'loan-1' }, 'user-1', 'manager');
      expect(result.loanId).toBe('loan-1');
      expect(result.loanNumber).toBe('LN-2024-001');
      expect(result.status).toBe('quote');
      expect(result.outstandingPrincipalPaise).toBe(100000);
      expect(result.settlementAmountPaise).toBeGreaterThan(0);
      expect(result.quoteExpiresAt).toBeDefined();
      expect(mockForeclosureRepo.createForeclosure).toHaveBeenCalledWith(
        expect.objectContaining({
          loan_id: 'loan-1',
          outstanding_principal_paise: 100000,
          requested_by: 'user-1',
        }),
      );
      expect(mockAuditService.createAuditLog).toHaveBeenCalled();
    });

    it('creates a quote for an overdue loan', async () => {
      mockForeclosureRepo.getLoanForForeclosure.mockResolvedValue(
        buildLoan({ status: 'overdue', dpd: 45 }),
      );
      const result = await service.createQuote({ loanId: 'loan-1' }, 'user-1', 'manager');
      expect(result.status).toBe('quote');
      expect(result.settlementAmountPaise).toBeGreaterThan(0);
    });

    it('includes pending penalties in settlement', async () => {
      mockForeclosureRepo.getLoanForForeclosure.mockResolvedValue(buildLoan());
      mockForeclosureRepo.getPendingPenalties.mockResolvedValue([
        { id: 'pen-1', amount_paise: 500n, installment_id: 's-1' },
        { id: 'pen-2', amount_paise: 300n, installment_id: 's-2' },
      ]);
      const result = await service.createQuote({ loanId: 'loan-1' }, 'user-1', 'manager');
      expect(result.pendingPenaltiesPaise).toBe(800);
    });

    it('applies rebate to settlement calculation', async () => {
      mockForeclosureRepo.getLoanForForeclosure.mockResolvedValue(buildLoan());
      const withRebate = await service.createQuote(
        { loanId: 'loan-1', rebatePaise: 5000, rebateReason: 'Good customer', rebateAuthorizedBy: 'mgr-1' },
        'user-1', 'manager',
      );
      expect(withRebate.rebatePaise).toBe(5000);
      const withoutRebate = await service.createQuote({ loanId: 'loan-1' }, 'user-1', 'manager');
      expect(withRebate.settlementAmountPaise).toBe(withoutRebate.settlementAmountPaise - 5000);
    });

    it('sets 24-hour quote expiry', async () => {
      mockForeclosureRepo.getLoanForForeclosure.mockResolvedValue(buildLoan());
      const before = Date.now();
      const result = await service.createQuote({ loanId: 'loan-1' }, 'user-1', 'manager');
      const after = Date.now();
      const expiresAt = new Date(result.quoteExpiresAt).getTime();
      const dayMs = 24 * 60 * 60 * 1000;
      expect(expiresAt).toBeGreaterThanOrEqual(before + dayMs);
      expect(expiresAt).toBeLessThanOrEqual(after + dayMs);
    });

    it('rejects foreclosure for non-foreclosable statuses', async () => {
      for (const status of ['closed', 'draft', 'submitted', 'rejected', 'defaulted', 'foreclosed']) {
        mockForeclosureRepo.getLoanForForeclosure.mockResolvedValue(buildLoan({ status }));
        await expect(
          service.createQuote({ loanId: 'loan-1' }, 'user-1', 'manager'),
        ).rejects.toThrow(BusinessRuleError);
      }
    });

    it('throws NotFoundError for non-existent loan', async () => {
      mockForeclosureRepo.getLoanForForeclosure.mockResolvedValue(null);
      await expect(
        service.createQuote({ loanId: 'nonexistent' }, 'user-1', 'manager'),
      ).rejects.toThrow(NotFoundError);
    });

    it('computes accrued interest for reducing balance loans', async () => {
      mockForeclosureRepo.getLoanForForeclosure.mockResolvedValue(buildLoan({
        product_version: {
          id: 'pv-1', interest_type: 'reducing_balance',
          annual_rate_bps: 1200, repayment_frequency: 'monthly',
          allocation_order: ['penalty', 'interest', 'principal'],
        },
      }));
      const result = await service.createQuote({ loanId: 'loan-1' }, 'user-1', 'manager');
      expect(result.accruedInterestPaise).toBeGreaterThanOrEqual(0);
      expect(result.settlementAmountPaise).toBeGreaterThan(0);
    });
  });

  // ─── executeForeclosure ──────────────────────────────────────────────────

  describe('executeForeclosure', () => {
    // Quote must match what the service would compute live from buildLoan()
    // (H16 quote-staleness check rejects drift > 100 paise). buildLoan() has
    // outstanding principal 100000 (no payments) and total_interest 12000,
    // with last_due 2025-01-01 < now, so flat accrued = full 12000; pending
    // penalties (500 + 300) = 800.  Quoted settlement = 100000+12000+800.
    function buildQuoteRecord(overrides?: Record<string, any>) {
      return {
        id: 'fc-1', loan_id: 'loan-1', status: 'quote',
        requested_by: 'user-1',
        quote_expires_at: new Date(Date.now() + 86400000),
        outstanding_principal_paise: 100000n,
        accrued_interest_paise: 12000n,
        pending_penalties_paise: 800n,
        rebate_paise: 0n,
        settlement_amount_paise: 112800n,
        rebate_reason: null,
        rebate_authorized_by: null,
        ...overrides,
      };
    }

    function setupSuccessfulExecution() {
      mockForeclosureRepo.findById.mockResolvedValue(buildQuoteRecord());
      mockForeclosureRepo.lockLoanForUpdate.mockResolvedValue({
        id: 'loan-1', status: 'active', cached_outstanding_paise: 105800n,
      });
      mockForeclosureRepo.getLoanForForeclosure.mockResolvedValue(buildLoan());
      mockForeclosureRepo.getPendingPenalties.mockResolvedValue([
        { id: 'pen-1', amount_paise: 500n },
        { id: 'pen-2', amount_paise: 300n },
      ]);
      mockForeclosureRepo.findAccountByCode.mockImplementation((code: string) => {
        const accts: Record<string, any> = {
          '1001': { id: 'acc-cash', code: '1001', name: 'Cash', category: 'asset' },
          '1002': { id: 'acc-bank', code: '1002', name: 'Bank', category: 'asset' },
          '1100': { id: 'acc-lr', code: '1100', name: 'Loans Receivable', category: 'asset' },
          '4001': { id: 'acc-ii', code: '4001', name: 'Interest Income', category: 'income' },
          '4003': { id: 'acc-pi', code: '4003', name: 'Penalty Income', category: 'income' },
          '5007': { id: 'acc-discount', code: '5007', name: 'Foreclosure Discount Expense', category: 'expense' },
        };
        return Promise.resolve(accts[code] ?? null);
      });
    }

    it('executes foreclosure successfully (Req 12.5)', async () => {
      setupSuccessfulExecution();
      const result = await service.executeForeclosure(
        { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'key-1' },
        'user-2', 'manager',
      );
      const data = result as any;
      expect(data.foreclosureId).toBe('fc-1');
      expect(data.loanId).toBe('loan-1');
      expect(data.status).toBe('settled');
      expect(data.finalOutstandingPaise).toBe(0);
      // Journal entry created
      expect(mockAccountingService.createJournalEntry).toHaveBeenCalledWith(
        expect.objectContaining({ sourceType: 'foreclosure', sourceId: 'fc-1' }),
        expect.anything(),
      );
      // Collection created
      expect(mockTx.collections.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            loan_id: 'loan-1', payment_mode: 'cash', idempotency_key: 'key-1',
          }),
        }),
      );
      // Receipt generated
      expect(mockReceiptService.generateReceipt).toHaveBeenCalledWith(
        expect.objectContaining({ loanId: 'loan-1', outstandingAfterPaise: 0 }),
        expect.anything(),
      );
      // Installments closed
      expect(mockForeclosureRepo.closeAllInstallments).toHaveBeenCalledWith(
        'loan-1', expect.anything(),
      );
      // Penalties marked paid
      expect(mockForeclosureRepo.markPenaltiesAsPaid).toHaveBeenCalledWith(
        ['pen-1', 'pen-2'], expect.anything(),
      );
      // Loan updated to foreclosed
      expect(mockForeclosureRepo.updateLoan).toHaveBeenCalledWith(
        'loan-1',
        expect.objectContaining({ status: 'foreclosed', cached_outstanding_paise: 0 }),
        expect.anything(),
      );
      // Foreclosure updated to settled
      expect(mockForeclosureRepo.updateForeclosure).toHaveBeenCalledWith(
        'fc-1',
        expect.objectContaining({ status: 'settled', approved_by: 'user-2' }),
        expect.anything(),
      );
      // Status history created
      expect(mockForeclosureRepo.createStatusHistory).toHaveBeenCalledWith(
        expect.objectContaining({ from_status: 'active', to_status: 'foreclosed' }),
        expect.anything(),
      );
      // Idempotency stored
      expect(mockIdempotencyService.store).toHaveBeenCalledWith(
        'key-1', 'foreclosure', 201,
        expect.objectContaining({ status: 'settled' }),
        expect.anything(),
      );
    });

    it('returns cached result for duplicate idempotency key', async () => {
      mockIdempotencyService.find.mockResolvedValue({
        resultStatus: 201, resultBody: { foreclosureId: 'fc-1' },
      });
      const result = await service.executeForeclosure(
        { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'dup-key' },
        'user-2', 'manager',
      );
      expect(result).toEqual({ foreclosureId: 'fc-1' });
      expect(mockForeclosureRepo.findById).not.toHaveBeenCalled();
    });

    it('rejects expired quotes (Req 12.6)', async () => {
      mockForeclosureRepo.findById.mockResolvedValue(
        buildQuoteRecord({ quote_expires_at: new Date(Date.now() - 1000) }),
      );
      await expect(
        service.executeForeclosure(
          { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'key-1' },
          'user-2', 'manager',
        ),
      ).rejects.toThrow('Foreclosure quote has expired');
    });

    it('rejects cancelled quote (Req 12.7)', async () => {
      mockForeclosureRepo.findById.mockResolvedValue(
        buildQuoteRecord({ status: 'cancelled' }),
      );
      await expect(
        service.executeForeclosure(
          { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'key-1' },
          'user-2', 'manager',
        ),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('rejects already-settled quote (Req 12.7)', async () => {
      mockForeclosureRepo.findById.mockResolvedValue(
        buildQuoteRecord({ status: 'settled' }),
      );
      await expect(
        service.executeForeclosure(
          { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'key-1' },
          'user-2', 'manager',
        ),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('rejects execution when approver is the same as requester (manager role)', async () => {
      setupSuccessfulExecution();

      await expect(
        service.executeForeclosure(
          { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'key-1' },
          'user-1', 'manager', // same as requester (user-1 created the quote)
        ),
      ).rejects.toThrow(BusinessRuleError);

      try {
        await service.executeForeclosure(
          { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'key-2' },
          'user-1', 'manager',
        );
      } catch (err) {
        expect((err as BusinessRuleError).code).toBe('MAKER_CHECKER_VIOLATION');
      }
    });

    it('allows super_admin to execute their own foreclosure quote (bypass maker-checker)', async () => {
      setupSuccessfulExecution();

      const result = await service.executeForeclosure(
        { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'key-1' },
        'user-1', 'super_admin', // same as requester but super_admin can bypass
      );
      expect((result as { status: string }).status).toBe('settled');
    });

    it('allows different user to execute foreclosure regardless of role', async () => {
      setupSuccessfulExecution();

      const result = await service.executeForeclosure(
        { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'key-1' },
        'user-2', 'manager', // different from requester (user-1)
      );
      expect((result as { status: string }).status).toBe('settled');
    });

    it('throws NotFoundError for non-existent foreclosure', async () => {
      mockForeclosureRepo.findById.mockResolvedValue(null);
      await expect(
        service.executeForeclosure(
          { foreclosureId: 'fc-999', paymentMode: 'cash', idempotencyKey: 'key-1' },
          'user-2', 'manager',
        ),
      ).rejects.toThrow(NotFoundError);
    });

    it('rejects when loan status is no longer foreclosable', async () => {
      mockForeclosureRepo.findById.mockResolvedValue(buildQuoteRecord());
      mockForeclosureRepo.lockLoanForUpdate.mockResolvedValue({
        id: 'loan-1', status: 'closed', cached_outstanding_paise: 0n,
      });
      await expect(
        service.executeForeclosure(
          { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'key-1' },
          'user-2', 'manager',
        ),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('uses bank account for non-cash payment mode', async () => {
      setupSuccessfulExecution();
      await service.executeForeclosure(
        { foreclosureId: 'fc-1', paymentMode: 'bank_transfer', idempotencyKey: 'key-2' },
        'user-2', 'manager',
      );
      // Should look up account code 1002 (bank) instead of 1001 (cash)
      expect(mockForeclosureRepo.findAccountByCode).toHaveBeenCalledWith('1002', expect.anything());
    });

    it('applies rebate override from execution dto', async () => {
      setupSuccessfulExecution();
      await service.executeForeclosure(
        {
          foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'key-3',
          rebatePaise: 2000, rebateReason: 'Override rebate', rebateAuthorizedBy: 'mgr-1',
        },
        'user-2', 'manager',
      );
      // Foreclosure should be updated with the override rebate
      expect(mockForeclosureRepo.updateForeclosure).toHaveBeenCalledWith(
        'fc-1',
        expect.objectContaining({ rebate_paise: 2000, rebate_reason: 'Override rebate' }),
        expect.anything(),
      );
    });

    it('creates rebate audit log when rebate > 0', async () => {
      setupSuccessfulExecution();
      await service.executeForeclosure(
        {
          foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'key-4',
          rebatePaise: 3000, rebateReason: 'Loyalty discount',
        },
        'user-2', 'manager',
      );
      // Should have at least 2 audit log calls: one for rebate, one for main
      const auditCalls = mockAuditService.createAuditLog.mock.calls;
      expect(auditCalls.length).toBeGreaterThanOrEqual(2);
      const rebateCall = auditCalls.find(
        (c: any[]) => c[0]?.after_state?.rebate_paise === 3000,
      );
      expect(rebateCall).toBeDefined();
    });
  });

  // ─── computeOutstandingPrincipal (tested via createQuote) (Req 12.8) ─────

  describe('computeOutstandingPrincipal (via createQuote)', () => {
    it('computes outstanding as sum of unpaid principal across installments', async () => {
      mockForeclosureRepo.getLoanForForeclosure.mockResolvedValue(buildLoan({
        schedules: [
          {
            id: 's-1', installment_number: 1, due_date: new Date('2024-02-01'),
            principal_paise: 50000n, interest_paise: 6000n, total_paise: 56000n,
            principal_paid_paise: 20000n, interest_paid_paise: 6000n,
            penalty_paid_paise: 0n, status: 'partial',
          },
          {
            id: 's-2', installment_number: 2, due_date: new Date('2024-03-01'),
            principal_paise: 50000n, interest_paise: 6000n, total_paise: 56000n,
            principal_paid_paise: 0n, interest_paid_paise: 0n,
            penalty_paid_paise: 0n, status: 'pending',
          },
        ],
      }));
      const result = await service.createQuote({ loanId: 'loan-1' }, 'user-1', 'manager');
      // Outstanding = (50000-20000) + (50000-0) = 80000
      expect(result.outstandingPrincipalPaise).toBe(80000);
    });

    it('returns 0 when all principal is fully paid', async () => {
      mockForeclosureRepo.getLoanForForeclosure.mockResolvedValue(buildLoan({
        schedules: [
          {
            id: 's-1', installment_number: 1, due_date: new Date('2024-02-01'),
            principal_paise: 50000n, interest_paise: 6000n, total_paise: 56000n,
            principal_paid_paise: 50000n, interest_paid_paise: 6000n,
            penalty_paid_paise: 0n, status: 'paid',
          },
          {
            id: 's-2', installment_number: 2, due_date: new Date('2024-03-01'),
            principal_paise: 50000n, interest_paise: 6000n, total_paise: 56000n,
            principal_paid_paise: 50000n, interest_paid_paise: 6000n,
            penalty_paid_paise: 0n, status: 'paid',
          },
        ],
      }));
      const result = await service.createQuote({ loanId: 'loan-1' }, 'user-1', 'manager');
      expect(result.outstandingPrincipalPaise).toBe(0);
    });
  });

  // ─── buildSettlementJournalLines (tested via executeForeclosure) (Req 12.9)

  describe('buildSettlementJournalLines (via executeForeclosure)', () => {
    function setupWithAccounts() {
      // Quote matches live computed from buildLoan() (H16): 100000 outstanding
      // + 12000 flat accrued (full, since settlement > last_due_date) + 0 penalties.
      mockForeclosureRepo.findById.mockResolvedValue({
        id: 'fc-1', loan_id: 'loan-1', status: 'quote',
        requested_by: 'user-1',
        quote_expires_at: new Date(Date.now() + 86400000),
        outstanding_principal_paise: 100000n,
        accrued_interest_paise: 12000n,
        pending_penalties_paise: 0n,
        rebate_paise: 0n,
        settlement_amount_paise: 112000n,
        rebate_reason: null, rebate_authorized_by: null,
      });
      mockForeclosureRepo.lockLoanForUpdate.mockResolvedValue({
        id: 'loan-1', status: 'active', cached_outstanding_paise: 112000n,
      });
      mockForeclosureRepo.getLoanForForeclosure.mockResolvedValue(buildLoan());
      mockForeclosureRepo.getPendingPenalties.mockResolvedValue([]);
      mockForeclosureRepo.findAccountByCode.mockImplementation((code: string) => {
        const accts: Record<string, any> = {
          '1001': { id: 'acc-cash', code: '1001', name: 'Cash', category: 'asset' },
          '1002': { id: 'acc-bank', code: '1002', name: 'Bank', category: 'asset' },
          '1100': { id: 'acc-lr', code: '1100', name: 'Loans Receivable', category: 'asset' },
          '4001': { id: 'acc-ii', code: '4001', name: 'Interest Income', category: 'income' },
          '4003': { id: 'acc-pi', code: '4003', name: 'Penalty Income', category: 'income' },
          '5007': { id: 'acc-discount', code: '5007', name: 'Foreclosure Discount Expense', category: 'expense' },
        };
        return Promise.resolve(accts[code] ?? null);
      });
    }

    it('creates balanced journal lines: DR cash = sum of CR components', async () => {
      setupWithAccounts();
      await service.executeForeclosure(
        { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'key-jl-1' },
        'user-2', 'manager',
      );
      const journalCall = mockAccountingService.createJournalEntry.mock.calls[0][0];
      const lines = journalCall.lines;
      const totalDebit = lines.reduce((s: number, l: any) => s + l.debitPaise, 0);
      const totalCredit = lines.reduce((s: number, l: any) => s + l.creditPaise, 0);
      expect(totalDebit).toBe(totalCredit);
    });

    it('debits cash account for settlement amount', async () => {
      setupWithAccounts();
      await service.executeForeclosure(
        { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'key-jl-2' },
        'user-2', 'manager',
      );
      const journalCall = mockAccountingService.createJournalEntry.mock.calls[0][0];
      const cashLine = journalCall.lines.find((l: any) => l.accountId === 'acc-cash');
      expect(cashLine).toBeDefined();
      expect(cashLine.debitPaise).toBeGreaterThan(0);
      expect(cashLine.creditPaise).toBe(0);
    });

    it('credits loans receivable for principal component', async () => {
      setupWithAccounts();
      await service.executeForeclosure(
        { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'key-jl-3' },
        'user-2', 'manager',
      );
      const journalCall = mockAccountingService.createJournalEntry.mock.calls[0][0];
      const lrLine = journalCall.lines.find((l: any) => l.accountId === 'acc-lr');
      expect(lrLine).toBeDefined();
      expect(lrLine.creditPaise).toBeGreaterThan(0);
      expect(lrLine.debitPaise).toBe(0);
    });

    it('credits interest income for interest component', async () => {
      setupWithAccounts();
      await service.executeForeclosure(
        { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'key-jl-4' },
        'user-2', 'manager',
      );
      const journalCall = mockAccountingService.createJournalEntry.mock.calls[0][0];
      const iiLine = journalCall.lines.find((l: any) => l.accountId === 'acc-ii');
      expect(iiLine).toBeDefined();
      expect(iiLine.creditPaise).toBeGreaterThan(0);
    });

    it('credits penalty income when penalties exist', async () => {
      // Setup with penalties — quote must match live (H16). Live = 100000
      // principal + 12000 flat interest + 2000 penalties.
      mockForeclosureRepo.findById.mockResolvedValue({
        id: 'fc-1', loan_id: 'loan-1', status: 'quote',
        requested_by: 'user-1',
        quote_expires_at: new Date(Date.now() + 86400000),
        outstanding_principal_paise: 100000n,
        accrued_interest_paise: 12000n,
        pending_penalties_paise: 2000n,
        rebate_paise: 0n,
        settlement_amount_paise: 114000n,
        rebate_reason: null, rebate_authorized_by: null,
      });
      mockForeclosureRepo.lockLoanForUpdate.mockResolvedValue({
        id: 'loan-1', status: 'active', cached_outstanding_paise: 114000n,
      });
      mockForeclosureRepo.getLoanForForeclosure.mockResolvedValue(buildLoan());
      mockForeclosureRepo.getPendingPenalties.mockResolvedValue([
        { id: 'pen-1', amount_paise: 2000n },
      ]);
      mockForeclosureRepo.findAccountByCode.mockImplementation((code: string) => {
        const accts: Record<string, any> = {
          '1001': { id: 'acc-cash', code: '1001', name: 'Cash', category: 'asset' },
          '1100': { id: 'acc-lr', code: '1100', name: 'Loans Receivable', category: 'asset' },
          '4001': { id: 'acc-ii', code: '4001', name: 'Interest Income', category: 'income' },
          '4003': { id: 'acc-pi', code: '4003', name: 'Penalty Income', category: 'income' },
        };
        return Promise.resolve(accts[code] ?? null);
      });

      await service.executeForeclosure(
        { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'key-jl-5' },
        'user-2', 'manager',
      );
      const journalCall = mockAccountingService.createJournalEntry.mock.calls[0][0];
      const piLine = journalCall.lines.find((l: any) => l.accountId === 'acc-pi');
      expect(piLine).toBeDefined();
      expect(piLine.creditPaise).toBe(2000);
    });

    it('books rebate as Discount Expense + credits full principal (not principal − rebate)', async () => {
      // Quote matches live (no rebate): 100000 principal + 12000 interest.
      // Execution applies a 10000 rebate override → settlement drops to 102000.
      mockForeclosureRepo.findById.mockResolvedValue({
        id: 'fc-1', loan_id: 'loan-1', status: 'quote',
        requested_by: 'user-1',
        quote_expires_at: new Date(Date.now() + 86400000),
        outstanding_principal_paise: 100000n,
        accrued_interest_paise: 12000n,
        pending_penalties_paise: 0n,
        rebate_paise: 0n,
        settlement_amount_paise: 112000n,
        rebate_reason: null, rebate_authorized_by: null,
      });
      mockForeclosureRepo.lockLoanForUpdate.mockResolvedValue({
        id: 'loan-1', status: 'active', cached_outstanding_paise: 112000n,
      });
      mockForeclosureRepo.getLoanForForeclosure.mockResolvedValue(buildLoan());
      mockForeclosureRepo.getPendingPenalties.mockResolvedValue([]);
      mockForeclosureRepo.findAccountByCode.mockImplementation((code: string) => {
        const accts: Record<string, any> = {
          '1001': { id: 'acc-cash', code: '1001', name: 'Cash', category: 'asset' },
          '1100': { id: 'acc-lr', code: '1100', name: 'Loans Receivable', category: 'asset' },
          '4001': { id: 'acc-ii', code: '4001', name: 'Interest Income', category: 'income' },
          '4003': { id: 'acc-pi', code: '4003', name: 'Penalty Income', category: 'income' },
          '5007': { id: 'acc-discount', code: '5007', name: 'Foreclosure Discount Expense', category: 'expense' },
        };
        return Promise.resolve(accts[code] ?? null);
      });

      // Execute with rebate override of 10000
      await service.executeForeclosure(
        {
          foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'key-jl-6',
          rebatePaise: 10000,
        },
        'user-2', 'manager',
      );
      const journalCall = mockAccountingService.createJournalEntry.mock.calls[0][0];
      const lrLine = journalCall.lines.find((l: any) => l.accountId === 'acc-lr');
      // POST-FIX: credit FULL outstanding principal (100000), book rebate as Discount Expense
      expect(lrLine.creditPaise).toBe(100000);
      const discountLine = journalCall.lines.find((l: any) => l.accountId === 'acc-discount');
      expect(discountLine).toBeDefined();
      expect(discountLine.debitPaise).toBe(10000);
    });
  });

  // ─── findById ────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('returns foreclosure when found', async () => {
      const fc = { id: 'fc-1', status: 'quote' };
      mockForeclosureRepo.findById.mockResolvedValue(fc);
      const result = await service.findById('fc-1');
      expect(result).toEqual(fc);
    });

    it('throws NotFoundError when not found', async () => {
      mockForeclosureRepo.findById.mockResolvedValue(null);
      await expect(service.findById('fc-999')).rejects.toThrow(NotFoundError);
    });
  });
});
