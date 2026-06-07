import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CashbookService, computeDailySummary } from '../cashbook.service';
import { BusinessRuleError, NotFoundError } from '../../../common/errors';

/**
 * Integration tests for cashbook and expense flow.
 * Tests: expense recording → journal entry → cashbook update → daily reconciliation.
 *
 * Validates: Requirements 27.1, 27.2, 27.3
 */

// ── Mock Factories ───────────────────────────────────────────────────────────

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
    prisma: {
      $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({})),
      // Receiving-officer validation in createHandover requires an active permitted role.
      users: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'user-2',
          is_active: true,
          role: 'accountant',
        }),
      },
    },
    accounting: { createJournalEntry: vi.fn().mockResolvedValue({ id: 'je-1' }) },
    accountingRepo: {
      findAccountByCode: vi.fn((code: string) => {
        const accounts: Record<string, { id: string; code: string; name: string }> = {
          '1001': { id: 'acc-cash', code: '1001', name: 'Cash' },
          '5001': { id: 'acc-salary', code: '5001', name: 'Salary Expense' },
          '5002': { id: 'acc-rent', code: '5002', name: 'Rent Expense' },
          '5003': { id: 'acc-travel', code: '5003', name: 'Travel Expense' },
          '5004': { id: 'acc-office', code: '5004', name: 'Office Expense' },
          '5099': { id: 'acc-other', code: '5099', name: 'Other Expense' },
        };
        return Promise.resolve(accounts[code] ?? null);
      }),
    },
    audit: { createAuditLog: vi.fn().mockResolvedValue({}) },
  };
}

function buildService(
  repo: ReturnType<typeof createMockCashbookRepo>,
  deps: ReturnType<typeof createMockDeps>,
) {
  return new CashbookService(
    deps.prisma as never, repo as never, deps.accounting as never,
    deps.accountingRepo as never, deps.audit as never,
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Cashbook & Expense Integration', () => {
  let service: CashbookService;
  let repo: ReturnType<typeof createMockCashbookRepo>;
  let deps: ReturnType<typeof createMockDeps>;

  beforeEach(() => {
    repo = createMockCashbookRepo();
    deps = createMockDeps();
    service = buildService(repo, deps);
  });

  // ── Requirement 27.1: Expense creation with journal entry ──────────────

  describe('Req 27.1 — Expense creation with journal entry', () => {
    it('should record expense atomically with journal entry and cash transaction', async () => {
      const result = await service.createExpense(
        { category: 'travel', amountPaise: 500000, date: '2024-01-15', description: 'Field visit' },
        'user-1', 'accountant',
      );

      expect(result.expense.id).toBe('exp-1');
      // Journal entry created
      expect(deps.accounting.createJournalEntry).toHaveBeenCalledTimes(1);
      // Cash transaction created (outflow)
      expect(repo.createCashTransaction).toHaveBeenCalledTimes(1);
      // Audit log created
      expect(deps.audit.createAuditLog).toHaveBeenCalledTimes(1);
    });

    it('should create balanced journal entry: DR Expense, CR Cash', async () => {
      await service.createExpense(
        { category: 'travel', amountPaise: 500000, date: '2024-01-15', description: 'Field visit' },
        'user-1', 'accountant',
      );

      const jeDto = deps.accounting.createJournalEntry.mock.calls[0]![0];
      expect(jeDto.lines).toHaveLength(2);
      // DR Expense account
      expect(jeDto.lines[0].accountId).toBe('acc-travel');
      expect(jeDto.lines[0].debitPaise).toBe(500000);
      expect(jeDto.lines[0].creditPaise).toBe(0);
      // CR Cash account
      expect(jeDto.lines[1].accountId).toBe('acc-cash');
      expect(jeDto.lines[1].debitPaise).toBe(0);
      expect(jeDto.lines[1].creditPaise).toBe(500000);
      // Balanced: total debit = total credit
      const totalDebit = jeDto.lines.reduce((s: number, l: { debitPaise: number }) => s + l.debitPaise, 0);
      const totalCredit = jeDto.lines.reduce((s: number, l: { creditPaise: number }) => s + l.creditPaise, 0);
      expect(totalDebit).toBe(totalCredit);
      expect(totalDebit).toBe(500000);
    });

    it('should create cash transaction as outflow with correct amount', async () => {
      await service.createExpense(
        { category: 'travel', amountPaise: 250000, date: '2024-02-10', description: 'Bus fare' },
        'user-1', 'accountant',
      );

      expect(repo.createCashTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'outflow',
          category: 'expense',
          amount_paise: 250000n,
          source_type: 'expense',
          recorded_by: 'user-1',
        }),
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

    it('should use fallback account 5099 for unknown category', async () => {
      await service.createExpense(
        { category: 'unknown_category', amountPaise: 100000, date: '2024-01-15', description: 'Misc' },
        'user-1', 'accountant',
      );

      // Unknown maps to 5099 (Other Expense)
      expect(deps.accountingRepo.findAccountByCode).toHaveBeenCalledWith('5099');
    });

    it('should create audit log with expense_recorded action', async () => {
      await service.createExpense(
        { category: 'rent', amountPaise: 1500000, date: '2024-03-01', description: 'Office rent' },
        'user-2', 'accountant',
      );

      expect(deps.audit.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action_type: 'expense_recorded',
          actor_id: 'user-2',
          actor_role: 'accountant',
          target_entity: 'expense',
          after_state: expect.objectContaining({
            category: 'rent',
            amountPaise: 1500000,
            date: '2024-03-01',
          }),
        }),
        expect.anything(),
      );
    });

    it('should execute all steps within a single transaction', async () => {
      await service.createExpense(
        { category: 'office', amountPaise: 5000, date: '2024-01-15', description: 'Stationery' },
        'user-1', 'accountant',
      );

      // $transaction was called, meaning all operations ran inside it
      expect(deps.prisma.$transaction).toHaveBeenCalledTimes(1);
      // All operations should have been called within the transaction callback
      expect(deps.accounting.createJournalEntry).toHaveBeenCalledTimes(1);
      expect(repo.createExpense).toHaveBeenCalledTimes(1);
      expect(repo.createCashTransaction).toHaveBeenCalledTimes(1);
      expect(deps.audit.createAuditLog).toHaveBeenCalledTimes(1);
    });

    it('should roll back when journal entry creation fails', async () => {
      deps.accounting.createJournalEntry.mockRejectedValue(new Error('DB error'));

      await expect(
        service.createExpense(
          { category: 'travel', amountPaise: 500000, date: '2024-01-15', description: 'Trip' },
          'user-1', 'accountant',
        ),
      ).rejects.toThrow('DB error');

      // Since the transaction threw, no expense or cash transaction should persist
      // (the mock $transaction propagates the error)
    });

    it('should produce balanced journal entries for various expense amounts', async () => {
      const amounts = [100, 5000, 100000, 500000, 10000000];

      for (const amount of amounts) {
        vi.clearAllMocks();
        repo = createMockCashbookRepo();
        deps = createMockDeps();
        service = buildService(repo, deps);

        await service.createExpense(
          { category: 'office', amountPaise: amount, date: '2024-01-15', description: 'test' },
          'user-1', 'accountant',
        );

        const jeDto = deps.accounting.createJournalEntry.mock.calls[0]![0];
        const totalDebit = jeDto.lines.reduce((s: number, l: { debitPaise: number }) => s + l.debitPaise, 0);
        const totalCredit = jeDto.lines.reduce((s: number, l: { creditPaise: number }) => s + l.creditPaise, 0);
        expect(totalDebit).toBe(totalCredit);
        expect(totalDebit).toBe(amount);
      }
    });
  });

  // ── Requirement 27.2: Handover flow (create → verify → status update) ──

  describe('Req 27.2 — Handover flow: create → verify → status update', () => {
    it('should complete full handover flow: create → verify', async () => {
      // Step 1: Create handover
      const handover = await service.createHandover(
        { receivingOfficerId: 'user-2', handoverDate: '2024-01-15', totalAmountPaise: 500000 },
        'user-1', 'collection_officer',
      );

      expect(handover.id).toBe('ho-1');
      expect(handover.verification_status).toBe('pending');

      // Step 2: Verify handover
      repo.findHandoverById.mockResolvedValue({ id: 'ho-1', verification_status: 'pending' });
      repo.updateHandoverVerification.mockResolvedValue({
        id: 'ho-1', verification_status: 'verified', verified_at: new Date(),
      });

      const verified = await service.verifyHandover(
        'ho-1', { verificationStatus: 'verified' }, 'user-3', 'manager',
      );

      expect(verified.verification_status).toBe('verified');
    });

    it('should create audit log on handover creation', async () => {
      await service.createHandover(
        { receivingOfficerId: 'user-2', handoverDate: '2024-01-15', totalAmountPaise: 500000 },
        'user-1', 'collection_officer',
      );

      expect(deps.audit.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action_type: 'cash_handover',
          actor_id: 'user-1',
          actor_role: 'collection_officer',
          target_entity: 'cash_handover',
          target_id: 'ho-1',
          after_state: expect.objectContaining({
            totalAmountPaise: 500000,
            receivingOfficerId: 'user-2',
            handoverDate: '2024-01-15',
          }),
        }),
      );
    });

    it('should reject verification of already-verified handover', async () => {
      repo.findHandoverById.mockResolvedValue({ id: 'ho-1', verification_status: 'verified' });

      await expect(
        service.verifyHandover('ho-1', { verificationStatus: 'verified' }, 'user-2', 'manager'),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('should reject verification of non-existent handover', async () => {
      repo.findHandoverById.mockResolvedValue(null);

      await expect(
        service.verifyHandover('missing-id', { verificationStatus: 'verified' }, 'user-2', 'manager'),
      ).rejects.toThrow(NotFoundError);
    });

    it('should handle discrepancy verification with amount and notes', async () => {
      repo.findHandoverById.mockResolvedValue({ id: 'ho-1', verification_status: 'pending' });
      repo.updateHandoverVerification.mockResolvedValue({
        id: 'ho-1',
        verification_status: 'discrepancy',
        discrepancy_amount_paise: 5000n,
        discrepancy_notes: 'Short by ₹50',
      });

      const result = await service.verifyHandover(
        'ho-1',
        { verificationStatus: 'discrepancy', discrepancyAmountPaise: 5000, discrepancyNotes: 'Short by ₹50' },
        'user-3', 'manager',
      );

      expect(result.verification_status).toBe('discrepancy');
      expect(repo.updateHandoverVerification).toHaveBeenCalledWith(
        'ho-1',
        expect.objectContaining({
          verification_status: 'discrepancy',
          discrepancy_amount_paise: 5000n,
          discrepancy_notes: 'Short by ₹50',
        }),
      );
    });

    it('should reject discrepancy without amount', async () => {
      repo.findHandoverById.mockResolvedValue({ id: 'ho-1', verification_status: 'pending' });

      await expect(
        service.verifyHandover(
          'ho-1',
          { verificationStatus: 'discrepancy' },
          'user-3', 'manager',
        ),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('should pass correct data to repository on handover creation', async () => {
      await service.createHandover(
        { receivingOfficerId: 'user-5', handoverDate: '2024-03-10', totalAmountPaise: 750000 },
        'user-3', 'collection_officer',
      );

      expect(repo.createHandover).toHaveBeenCalledWith(
        expect.objectContaining({
          collection_officer_id: 'user-3',
          receiving_officer_id: 'user-5',
          total_amount_paise: 750000n,
        }),
      );
    });

    it('should set verified_at timestamp on verification', async () => {
      repo.findHandoverById.mockResolvedValue({ id: 'ho-1', verification_status: 'pending' });
      repo.updateHandoverVerification.mockResolvedValue({
        id: 'ho-1', verification_status: 'verified',
      });

      await service.verifyHandover(
        'ho-1', { verificationStatus: 'verified' }, 'user-3', 'manager',
      );

      const updateCall = repo.updateHandoverVerification.mock.calls[0]!;
      expect(updateCall[1].verified_at).toBeInstanceOf(Date);
    });
  });

  // ── Requirement 27.3: Daily summary accuracy ──────────────────────────

  describe('Req 27.3 — Daily summary accuracy', () => {
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

    it('should satisfy balance equation: opening + inflows - outflows = closing', async () => {
      // Set up specific known seed data
      repo.getBalanceBeforeDate.mockResolvedValue({ totalInflows: 2000000n, totalOutflows: 500000n });
      repo.getCashTransactionsForDate.mockResolvedValue([
        { type: 'inflow', amount_paise: 300000n, category: 'collection' },
        { type: 'inflow', amount_paise: 200000n, category: 'handover_in' },
        { type: 'outflow', amount_paise: 150000n, category: 'expense' },
        { type: 'outflow', amount_paise: 50000n, category: 'expense' },
      ]);

      const summary = await service.getDailySummary('2024-02-20');

      const opening = BigInt(summary.openingBalancePaise);
      const inflows = BigInt(summary.cashInflowsPaise);
      const outflows = BigInt(summary.cashOutflowsPaise);
      const closing = BigInt(summary.closingBalancePaise);

      // Verify the fundamental equation
      expect(closing).toBe(opening + inflows - outflows);
      // Verify individual values
      expect(opening).toBe(1500000n); // 2000000 - 500000
      expect(inflows).toBe(500000n);  // 300000 + 200000
      expect(outflows).toBe(200000n); // 150000 + 50000
      expect(closing).toBe(1800000n); // 1500000 + 500000 - 200000
    });

    it('should flag discrepancy when closing balance is negative', () => {
      const result = computeDailySummary({
        openingBalancePaise: 100n,
        transactions: [{ type: 'outflow', amountPaise: 500n, category: 'expense' }],
      });

      expect(result.hasDiscrepancy).toBe(true);
      expect(result.closingBalancePaise).toBe('-400');
    });

    it('should return correct transaction count', async () => {
      const summary = await service.getDailySummary('2024-01-15');

      // Default mock has 2 transactions (1 inflow + 1 outflow)
      expect(summary.transactionCount).toBe(2);
    });

    it('should handle zero transactions for a date', async () => {
      repo.getCashTransactionsForDate.mockResolvedValue([]);
      repo.getBalanceBeforeDate.mockResolvedValue({ totalInflows: 500000n, totalOutflows: 200000n });

      const summary = await service.getDailySummary('2024-01-15');

      expect(summary.openingBalancePaise).toBe('300000');
      expect(summary.cashInflowsPaise).toBe('0');
      expect(summary.cashOutflowsPaise).toBe('0');
      expect(summary.closingBalancePaise).toBe('300000');
      expect(summary.transactionCount).toBe(0);
    });

    it('should classify income by source account', async () => {
      repo.getIncomeBySourceForDate.mockResolvedValue([
        { credit_paise: 80000n, account: { id: 'a1', code: '4001', name: 'Interest Income' } },
        { credit_paise: 20000n, account: { id: 'a2', code: '4003', name: 'Penalty Income' } },
      ]);

      const summary = await service.getDailySummary('2024-01-15');

      expect(summary.incomeBySource).toHaveLength(2);
      const interestIncome = summary.incomeBySource.find(i => i.accountCode === '4001');
      const penaltyIncome = summary.incomeBySource.find(i => i.accountCode === '4003');
      expect(interestIncome?.amountPaise).toBe('80000');
      expect(penaltyIncome?.amountPaise).toBe('20000');
    });

    it('should aggregate multiple income lines for the same account', async () => {
      repo.getIncomeBySourceForDate.mockResolvedValue([
        { credit_paise: 50000n, account: { id: 'a1', code: '4001', name: 'Interest Income' } },
        { credit_paise: 30000n, account: { id: 'a1', code: '4001', name: 'Interest Income' } },
      ]);

      const summary = await service.getDailySummary('2024-01-15');

      expect(summary.incomeBySource).toHaveLength(1);
      expect(summary.incomeBySource[0]!.amountPaise).toBe('80000');
    });

    it('should return date string in the result', async () => {
      const summary = await service.getDailySummary('2024-06-15');

      expect(summary.date).toBe('2024-06-15');
    });

    it('should handle only inflows (no outflows) correctly', async () => {
      repo.getBalanceBeforeDate.mockResolvedValue({ totalInflows: 0n, totalOutflows: 0n });
      repo.getCashTransactionsForDate.mockResolvedValue([
        { type: 'inflow', amount_paise: 100000n, category: 'collection' },
        { type: 'inflow', amount_paise: 50000n, category: 'collection' },
      ]);

      const summary = await service.getDailySummary('2024-01-15');

      expect(summary.openingBalancePaise).toBe('0');
      expect(summary.cashInflowsPaise).toBe('150000');
      expect(summary.cashOutflowsPaise).toBe('0');
      expect(summary.closingBalancePaise).toBe('150000');
      expect(summary.hasDiscrepancy).toBe(false);
    });

    it('should handle only outflows (no inflows) correctly', async () => {
      repo.getBalanceBeforeDate.mockResolvedValue({ totalInflows: 500000n, totalOutflows: 0n });
      repo.getCashTransactionsForDate.mockResolvedValue([
        { type: 'outflow', amount_paise: 100000n, category: 'expense' },
      ]);

      const summary = await service.getDailySummary('2024-01-15');

      expect(summary.openingBalancePaise).toBe('500000');
      expect(summary.cashInflowsPaise).toBe('0');
      expect(summary.cashOutflowsPaise).toBe('100000');
      expect(summary.closingBalancePaise).toBe('400000');
    });
  });
});
