import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForeclosureService, calculateForeclosureSettlement } from '../foreclosure.service';
import { BusinessRuleError, NotFoundError } from '../../../common/errors';

/**
 * Integration tests for foreclosure flow.
 * Tests: foreclosure quote → approval (maker-checker) → settlement → loan closed.
 *
 * Validates: Requirements 9.1, 9.4
 */

function createMockLoan() {
  return {
    id: 'loan-1', loan_number: 'LN-2024-00001', customer_id: 'cust-1', status: 'active',
    principal_paise: 10000000n, total_interest_paise: 1200000n,
    disbursement_date: new Date('2024-01-01'), last_due_date: new Date('2024-12-01'),
    cached_outstanding_paise: 8000000n,
    product_version: { interest_type: 'flat', annual_rate_bps: 1200 },
    customer: { id: 'cust-1', full_name: 'Test Customer', mobile: '9876543210' },
    schedules: [
      { principal_paise: 833333n, principal_paid_paise: 200000n, interest_paise: 100000n, interest_paid_paise: 50000n },
      { principal_paise: 833333n, principal_paid_paise: 0n, interest_paise: 100000n, interest_paid_paise: 0n },
    ],
  };
}

function createMockForeclosureRepo() {
  return {
    getLoanForForeclosure: vi.fn().mockResolvedValue(createMockLoan()),
    getPendingPenalties: vi.fn().mockResolvedValue([{ id: 'pen-1', amount_paise: 5000n }]),
    createForeclosure: vi.fn().mockResolvedValue({ id: 'fc-1' }),
    findById: vi.fn(),
    lockLoanForUpdate: vi.fn().mockResolvedValue({ id: 'loan-1', status: 'active', cached_outstanding_paise: 8000000n }),
    findAccountByCode: vi.fn((code: string) => {
      const accounts: Record<string, { id: string; code: string }> = {
        '1001': { id: 'acc-cash', code: '1001' },
        '1002': { id: 'acc-bank', code: '1002' },
        '1100': { id: 'acc-lr', code: '1100' },
        '4001': { id: 'acc-int', code: '4001' },
        '4003': { id: 'acc-pen', code: '4003' },
      };
      return Promise.resolve(accounts[code] ?? null);
    }),
    closeAllInstallments: vi.fn().mockResolvedValue(undefined),
    markPenaltiesAsPaid: vi.fn().mockResolvedValue(undefined),
    updateLoan: vi.fn().mockResolvedValue(undefined),
    createStatusHistory: vi.fn().mockResolvedValue(undefined),
    updateForeclosure: vi.fn().mockResolvedValue(undefined),
    getOfficerName: vi.fn().mockResolvedValue('Officer Name'),
  };
}

function createMockTx() {
  return {
    collections: {
      create: vi.fn().mockResolvedValue({ id: 'col-settle-1' }),
    },
  };
}

function createMockDeps() {
  const tx = createMockTx();
  return {
    tx,
    prisma: { $transaction: vi.fn((fn: (t: unknown) => Promise<unknown>) => fn(tx)) },
    accounting: { createJournalEntry: vi.fn().mockResolvedValue({ id: 'je-1' }) },
    audit: { createAuditLog: vi.fn().mockResolvedValue({}) },
    idempotency: { find: vi.fn().mockResolvedValue(null), store: vi.fn().mockResolvedValue({}) },
    receipt: { generateReceipt: vi.fn().mockResolvedValue({ id: 'rcp-1', receipt_number: 'RCP-2024-00001' }) },
  };
}

describe('Foreclosure Flow Integration', () => {
  let service: ForeclosureService;
  let repo: ReturnType<typeof createMockForeclosureRepo>;
  let deps: ReturnType<typeof createMockDeps>;

  beforeEach(() => {
    repo = createMockForeclosureRepo();
    deps = createMockDeps();
    service = new ForeclosureService(
      deps.prisma as never, repo as never, deps.accounting as never,
      deps.audit as never, deps.idempotency as never, deps.receipt as never,
    );
  });

  describe('Quote generation', () => {
    it('should generate a foreclosure quote with itemized settlement', async () => {
      const quote = await service.createQuote(
        { loanId: 'loan-1', rebatePaise: 1000, rebateReason: 'Good customer' },
        'user-requester', 'manager',
      );

      expect(quote.status).toBe('quote');
      expect(quote.loanId).toBe('loan-1');
      expect(quote.outstandingPrincipalPaise).toBeGreaterThan(0);
      expect(quote.settlementAmountPaise).toBeGreaterThan(0);
      expect(quote.quoteExpiresAt).toBeDefined();
      expect(repo.createForeclosure).toHaveBeenCalled();
      expect(deps.audit.createAuditLog).toHaveBeenCalled();
    });

    it('should reject quote for non-foreclosable loan status', async () => {
      repo.getLoanForForeclosure.mockResolvedValue({ ...createMockLoan(), status: 'closed' });

      await expect(
        service.createQuote({ loanId: 'loan-1' }, 'user-1', 'manager'),
      ).rejects.toThrow(BusinessRuleError);
    });
  });

  describe('Settlement execution', () => {
    beforeEach(() => {
      // Mock a valid quote
      repo.findById.mockResolvedValue({
        id: 'fc-1', loan_id: 'loan-1', status: 'quote',
        outstanding_principal_paise: 1466666n, accrued_interest_paise: 50000n,
        pending_penalties_paise: 5000n, rebate_paise: 0n,
        settlement_amount_paise: 1521666n,
        requested_by: 'user-requester', quote_expires_at: new Date(Date.now() + 86400000),
        rebate_reason: null, rebate_authorized_by: null,
      });
    });

    it('should execute foreclosure settlement atomically', async () => {
      const result = await service.executeForeclosure(
        { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'fc-key-1' },
        'user-approver', 'manager',
      );

      expect(result.statusCode).toBe(201);
      // Journal entry created
      expect(deps.accounting.createJournalEntry).toHaveBeenCalled();
      // All installments closed
      expect(repo.closeAllInstallments).toHaveBeenCalled();
      // Penalties marked as paid
      expect(repo.markPenaltiesAsPaid).toHaveBeenCalled();
      // Loan status updated to foreclosed
      expect(repo.updateLoan).toHaveBeenCalledWith('loan-1', expect.objectContaining({ status: 'foreclosed' }), expect.anything());
      // Foreclosure status updated to settled
      expect(repo.updateForeclosure).toHaveBeenCalledWith('fc-1', expect.objectContaining({ status: 'settled' }), expect.anything());
    });

    it('should enforce maker-checker: approver ≠ requester', async () => {
      await expect(
        service.executeForeclosure(
          { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'fc-key-2' },
          'user-requester', 'manager', // same as requester
        ),
      ).rejects.toThrow('Maker-checker violation');
    });

    it('should reject expired quote', async () => {
      repo.findById.mockResolvedValue({
        id: 'fc-1', loan_id: 'loan-1', status: 'quote',
        outstanding_principal_paise: 1466666n, accrued_interest_paise: 50000n,
        pending_penalties_paise: 5000n, rebate_paise: 0n,
        settlement_amount_paise: 1521666n,
        requested_by: 'user-requester',
        quote_expires_at: new Date(Date.now() - 1000), // expired
      });

      await expect(
        service.executeForeclosure(
          { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'fc-key-3' },
          'user-approver', 'manager',
        ),
      ).rejects.toThrow('expired');
    });
  });

  describe('Pure settlement calculation', () => {
    it('should compute settlement = principal + interest + penalties - rebate', () => {
      const result = calculateForeclosureSettlement({
        outstandingPrincipalPaise: 1000000,
        accruedInterestPaise: 50000,
        pendingPenaltiesPaise: 5000,
        rebatePaise: 10000,
      });
      expect(result.settlementAmountPaise).toBe(1045000);
    });

    it('should clamp settlement to zero when rebate exceeds total', () => {
      const result = calculateForeclosureSettlement({
        outstandingPrincipalPaise: 10000,
        accruedInterestPaise: 5000,
        pendingPenaltiesPaise: 0,
        rebatePaise: 999999,
      });
      expect(result.settlementAmountPaise).toBe(0);
    });
  });
});
