import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CashbookService, computeDailySummary } from '../cashbook.service';
import { BusinessRuleError, NotFoundError } from '../../../common/errors';

/**
 * Integration tests for cashbook and expense flow.
 * Tests: expense recording → journal entry → cashbook update → daily reconciliation.
 *
 * Validates: Requirements 13.3, 13.4, 13.5
 */

function createMockCashbookRepo() {
  return {
    createExpense: vi.fn().mockResolvedValue({ id: 'exp-1', category: 'travel', amount_paise: 500000n }),
    createCashTransaction: vi.fn().mockResolvedValue({ id: 'ct-1' }),
    createHandover: vi.fn().mockResolvedValue({ id: 'ho-1', verification_status: 'pending' }),
    findHandoverById: vi.fn(),
    updateHandoverVerification: vi.fn(),
    getBalanceBeforeDate: vi.fn().mockResolvedValue({ totalInflows: 1000000n, totalOutflows: 200000n }),
    getCashTransactionsForDate: vi.fn().mockResolvedValue([
      { type: 'inflow', amount_paise: 500000n, category: 'collection' },
      { type: 'outflow', amount_paise: 100000n, category: 'expense' },
    ]),
    getIncomeBySourceForDate: vi.fn().mockResolvedValue([]),
    findExpenses: vi.fn(),
    findHandovers: vi.fn(),
  };
}

function createMockDeps() {
  return {
    prisma: { $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({})) },
    accounting: { createJournalEntry: vi.fn().mockResolvedValue({ id: 'je-1' }) },
    accountingRepo: {
      findAccountByCode: vi.fn((code: string) => {
        const accounts: Record<string, { id: string; code: string; name: string }> = {
          '1001': { id: 'acc-cash', code: '1001', name: 'Cash' },
          '5003': { id: 'acc-travel', code: '5003', name: 'Travel Expense' },
          '5099': { id: 'acc-other', code: '5099', name: 'Other Expense' },
        };
        return Promise.resolve(accounts[code] ?? null);
      }),
    },
    audit: { createAuditLog: vi.fn().mockResolvedValue({}) },
  };
}

describe('Cashbook & Expense Integration', () => {
  let service: CashbookService;
  let repo: ReturnType<typeof createMockCashbookRepo>;
  let deps: ReturnType<typeof createMockDeps>;

  beforeEach(() => {
    repo = createMockCashbookRepo();
    deps = createMockDeps();
    service = new CashbookService(
      deps.prisma as never, repo as never, deps.accounting as never,
      deps.accountingRepo as never, deps.audit as never,
    );
  });

  describe('Expense recording', () => {
    it('should record expense atomically with journal entry and cash transaction', async () => {
      const result = await service.createExpense(
        { category: 'travel', amountPaise: 500000, date: '2024-01-15', description: 'Field visit' },
        'user-1', 'accountant',
      );

      expect(result.expense.id).toBe('exp-1');
      // Journal entry created: DR Expense, CR Cash
      expect(deps.accounting.createJournalEntry).toHaveBeenCalled();
      const jeDto = deps.accounting.createJournalEntry.mock.calls[0]![0];
      expect(jeDto.lines).toHaveLength(2);
      expect(jeDto.lines[0].debitPaise).toBe(500000); // DR Expense
      expect(jeDto.lines[1].creditPaise).toBe(500000); // CR Cash
      // Cash transaction created (outflow)
      expect(repo.createCashTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'outflow', amount_paise: 500000n }),
        expect.anything(),
      );
      // Audit log created
      expect(deps.audit.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action_type: 'expense_recorded' }),
        expect.anything(),
      );
    });

    it('should map expense category to correct account code', async () => {
      await service.createExpense(
        { category: 'travel', amountPaise: 100000, date: '2024-01-15', description: 'Trip' },
        'user-1', 'accountant',
      );

      // Travel maps to 5003
      expect(deps.accountingRepo.findAccountByCode).toHaveBeenCalledWith('5003');
    });

    it('should use fallback account for unknown category', async () => {
      await service.createExpense(
        { category: 'unknown_category', amountPaise: 100000, date: '2024-01-15', description: 'Misc' },
        'user-1', 'accountant',
      );

      // Unknown maps to 5099 (Other Expense)
      expect(deps.accountingRepo.findAccountByCode).toHaveBeenCalledWith('5099');
    });
  });

  describe('Daily reconciliation', () => {
    it('should compute daily summary: opening + inflows - outflows = closing', async () => {
      const summary = await service.getDailySummary('2024-01-15');

      // Opening = 1000000 - 200000 = 800000
      expect(summary.openingBalancePaise).toBe('800000');
      // Inflows = 500000, Outflows = 100000
      expect(summary.cashInflowsPaise).toBe('500000');
      expect(summary.cashOutflowsPaise).toBe('100000');
      // Closing = 800000 + 500000 - 100000 = 1200000
      expect(summary.closingBalancePaise).toBe('1200000');
      expect(summary.hasDiscrepancy).toBe(false);
    });

    it('should flag discrepancy when closing balance is negative', () => {
      const result = computeDailySummary({
        openingBalancePaise: 100n,
        transactions: [{ type: 'outflow', amountPaise: 500n, category: 'expense' }],
      });

      expect(result.hasDiscrepancy).toBe(true);
      expect(result.closingBalancePaise).toBe('-400');
    });
  });

  describe('Cash handover', () => {
    it('should record and verify cash handover', async () => {
      const handover = await service.createHandover(
        { receivingOfficerId: 'user-2', handoverDate: '2024-01-15', totalAmountPaise: 500000 },
        'user-1', 'collection_officer',
      );

      expect(handover.id).toBe('ho-1');
      expect(deps.audit.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action_type: 'cash_handover' }),
      );
    });

    it('should reject verification of already-verified handover', async () => {
      repo.findHandoverById.mockResolvedValue({ id: 'ho-1', verification_status: 'verified' });

      await expect(
        service.verifyHandover('ho-1', { verificationStatus: 'verified' }, 'user-2', 'manager'),
      ).rejects.toThrow(BusinessRuleError);
    });
  });
});
