import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForeclosureService, calculateForeclosureSettlement } from '../foreclosure.service';
import { BusinessRuleError, NotFoundError } from '../../../common/errors';

/**
 * Integration tests for foreclosure flow.
 * Tests the full multi-step foreclosure pipeline with mocked repositories:
 *   quote creation → approval → atomic settlement → loan closure
 *
 * Validates: Requirements 13.1, 13.2, 13.3, 13.4
 */

// ── Mock Factories ───────────────────────────────────────────────────────────

function createMockLoan(overrides: Record<string, unknown> = {}) {
  return {
    id: 'loan-1',
    loan_number: 'LN-2024-00001',
    customer_id: 'cust-1',
    status: 'active',
    principal_paise: 10000000n,
    total_interest_paise: 1200000n,
    total_payable_paise: 11200000n,
    cached_outstanding_paise: 8000000n,
    disbursement_date: new Date('2024-01-01'),
    last_due_date: new Date('2024-12-01'),
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
        principal_paise: 833333n, interest_paise: 100000n, total_paise: 933333n,
        principal_paid_paise: 200000n, interest_paid_paise: 50000n,
        penalty_paid_paise: 0n, status: 'partial',
      },
      {
        id: 's-2', installment_number: 2, due_date: new Date('2024-03-01'),
        principal_paise: 833333n, interest_paise: 100000n, total_paise: 933333n,
        principal_paid_paise: 0n, interest_paid_paise: 0n,
        penalty_paid_paise: 0n, status: 'pending',
      },
      {
        id: 's-3', installment_number: 3, due_date: new Date('2024-04-01'),
        principal_paise: 833334n, interest_paise: 100000n, total_paise: 933334n,
        principal_paid_paise: 0n, interest_paid_paise: 0n,
        penalty_paid_paise: 0n, status: 'pending',
      },
    ],
    ...overrides,
  };
}

const ACCOUNTS: Record<string, { id: string; code: string; name: string; category: string }> = {
  '1001': { id: 'acc-cash', code: '1001', name: 'Cash', category: 'asset' },
  '1002': { id: 'acc-bank', code: '1002', name: 'Bank', category: 'asset' },
  '1100': { id: 'acc-lr', code: '1100', name: 'Loans Receivable', category: 'asset' },
  '4001': { id: 'acc-int', code: '4001', name: 'Interest Income', category: 'income' },
  '4003': { id: 'acc-pen', code: '4003', name: 'Penalty Income', category: 'income' },
};

function createMockForeclosureRepo() {
  return {
    getLoanForForeclosure: vi.fn().mockResolvedValue(createMockLoan()),
    getPendingPenalties: vi.fn().mockResolvedValue([
      { id: 'pen-1', amount_paise: 5000n, installment_id: 's-1' },
    ]),
    createForeclosure: vi.fn().mockResolvedValue({ id: 'fc-1' }),
    findById: vi.fn(),
    lockLoanForUpdate: vi.fn().mockResolvedValue({
      id: 'loan-1', status: 'active', cached_outstanding_paise: 8000000n,
    }),
    findAccountByCode: vi.fn((code: string) => Promise.resolve(ACCOUNTS[code] ?? null)),
    closeAllInstallments: vi.fn().mockResolvedValue({ count: 3 }),
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
    receipt: {
      generateReceipt: vi.fn().mockResolvedValue({
        id: 'rcp-1', receipt_number: 'RCP-2024-00001',
      }),
    },
  };
}


// Quote must match what the service computes live from createMockLoan()
// (H16 quote-staleness check rejects drift > 100 paise).
//   outstanding   = (833333 − 200000) + 833333 + 833334 = 2_300_000
//   flat accrued  = total_interest 1_200_000 (settlement > last_due)
//                   − interest already paid 50_000        = 1_150_000
//   penalties     = 5_000
//   settlement    = 2_300_000 + 1_150_000 + 5_000         = 3_455_000
function buildQuoteRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'fc-1',
    loan_id: 'loan-1',
    status: 'quote',
    outstanding_principal_paise: 2_300_000n,
    accrued_interest_paise: 1_150_000n,
    pending_penalties_paise: 5_000n,
    rebate_paise: 0n,
    settlement_amount_paise: 3_455_000n,
    requested_by: 'user-requester',
    quote_expires_at: new Date(Date.now() + 86400000),
    rebate_reason: null,
    rebate_authorized_by: null,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Foreclosure Flow Integration', () => {
  let service: ForeclosureService;
  let repo: ReturnType<typeof createMockForeclosureRepo>;
  let deps: ReturnType<typeof createMockDeps>;

  let loanService: { validateTransition: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    repo = createMockForeclosureRepo();
    deps = createMockDeps();
    loanService = { validateTransition: vi.fn() };
    service = new ForeclosureService(
      deps.prisma as never, repo as never, deps.accounting as never,
      deps.audit as never, deps.idempotency as never, deps.receipt as never,
      loanService as never,
    );
  });

  // ── Requirement 13.1: Full foreclosure flow ──────────────────────────────

  describe('Req 13.1 — Full flow: quote → approve → execute → loan closed', () => {
    beforeEach(() => {
      repo.findById.mockResolvedValue(buildQuoteRecord());
    });

    it('should create a foreclosure quote with itemized settlement components', async () => {
      const quote = await service.createQuote(
        { loanId: 'loan-1' },
        'user-requester', 'manager',
      );

      expect(quote.status).toBe('quote');
      expect(quote.loanId).toBe('loan-1');
      expect(quote.loanNumber).toBe('LN-2024-00001');
      expect(quote.outstandingPrincipalPaise).toBeGreaterThan(0);
      expect(quote.accruedInterestPaise).toBeGreaterThanOrEqual(0);
      expect(quote.pendingPenaltiesPaise).toBe(5000);
      expect(quote.settlementAmountPaise).toBeGreaterThan(0);
      expect(quote.quoteExpiresAt).toBeDefined();
      expect(repo.createForeclosure).toHaveBeenCalledTimes(1);
      expect(deps.audit.createAuditLog).toHaveBeenCalledTimes(1);
    });

    it('should execute settlement atomically: collection, journal, installments, loan status', async () => {
      const result = await service.executeForeclosure(
        { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'fc-key-1' },
        'user-approver', 'manager',
      );

      const data = result as Record<string, unknown>;
      expect(data['status']).toBe('settled');
      expect(data['finalOutstandingPaise']).toBe(0);
      expect(data['foreclosureId']).toBe('fc-1');
      expect(data['loanId']).toBe('loan-1');
      expect(data['collectionId']).toBe('col-settle-1');
      expect(data['journalEntryId']).toBe('je-1');
      expect(data['receiptId']).toBe('rcp-1');
      expect(data['receiptNumber']).toBe('RCP-2024-00001');
    });

    it('should create settlement collection record with correct amount', async () => {
      await service.executeForeclosure(
        { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'fc-key-col' },
        'user-approver', 'manager',
      );

      expect(deps.tx.collections.create).toHaveBeenCalledTimes(1);
      const createCall = deps.tx.collections.create.mock.calls[0]![0];
      expect(createCall.data.loan_id).toBe('loan-1');
      expect(createCall.data.payment_mode).toBe('cash');
      expect(createCall.data.collected_by).toBe('user-approver');
      expect(createCall.data.idempotency_key).toBe('fc-key-col');
      expect(createCall.data.journal_entry_id).toBe('je-1');
      // Settlement amount should be a positive integer
      expect(createCall.data.amount_paise).toBeGreaterThan(0);
    });

    it('should create balanced journal entry (total debits = total credits)', async () => {
      await service.executeForeclosure(
        { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'fc-key-je' },
        'user-approver', 'manager',
      );

      expect(deps.accounting.createJournalEntry).toHaveBeenCalledTimes(1);
      const jeCall = deps.accounting.createJournalEntry.mock.calls[0]![0];
      const lines = jeCall.lines as { debitPaise: number; creditPaise: number; accountId: string }[];

      const totalDebit = lines.reduce((s, l) => s + l.debitPaise, 0);
      const totalCredit = lines.reduce((s, l) => s + l.creditPaise, 0);
      expect(totalDebit).toBe(totalCredit);
      expect(totalDebit).toBeGreaterThan(0);

      // DR Cash account for settlement amount
      const cashLine = lines.find(l => l.accountId === 'acc-cash');
      expect(cashLine).toBeDefined();
      expect(cashLine!.debitPaise).toBe(totalDebit);
      expect(cashLine!.creditPaise).toBe(0);

      // CR Loans Receivable for principal component
      const lrLine = lines.find(l => l.accountId === 'acc-lr');
      expect(lrLine).toBeDefined();
      expect(lrLine!.creditPaise).toBeGreaterThan(0);
      expect(lrLine!.debitPaise).toBe(0);
    });

    it('should close all remaining installments', async () => {
      await service.executeForeclosure(
        { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'fc-key-inst' },
        'user-approver', 'manager',
      );

      expect(repo.closeAllInstallments).toHaveBeenCalledTimes(1);
      expect(repo.closeAllInstallments).toHaveBeenCalledWith('loan-1', expect.anything());
    });

    it('should mark all pending penalties as paid', async () => {
      await service.executeForeclosure(
        { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'fc-key-pen' },
        'user-approver', 'manager',
      );

      expect(repo.markPenaltiesAsPaid).toHaveBeenCalledTimes(1);
      expect(repo.markPenaltiesAsPaid).toHaveBeenCalledWith(
        ['pen-1'], expect.anything(),
      );
    });

    it('should update loan status to foreclosed with zero outstanding', async () => {
      await service.executeForeclosure(
        { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'fc-key-loan' },
        'user-approver', 'manager',
      );

      expect(repo.updateLoan).toHaveBeenCalledTimes(1);
      expect(repo.updateLoan).toHaveBeenCalledWith(
        'loan-1',
        expect.objectContaining({
          status: 'foreclosed',
          cached_outstanding_paise: 0,
          dpd: 0,
        }),
        expect.anything(),
      );
    });

    it('should update foreclosure record to settled with approver', async () => {
      await service.executeForeclosure(
        { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'fc-key-fc' },
        'user-approver', 'manager',
      );

      expect(repo.updateForeclosure).toHaveBeenCalledTimes(1);
      expect(repo.updateForeclosure).toHaveBeenCalledWith(
        'fc-1',
        expect.objectContaining({
          status: 'settled',
          approved_by: 'user-approver',
          collection_id: 'col-settle-1',
        }),
        expect.anything(),
      );
    });

    it('should create loan status history from active to foreclosed', async () => {
      await service.executeForeclosure(
        { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'fc-key-hist' },
        'user-approver', 'manager',
      );

      expect(repo.createStatusHistory).toHaveBeenCalledTimes(1);
      expect(repo.createStatusHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          loan_id: 'loan-1',
          from_status: 'active',
          to_status: 'foreclosed',
          changed_by: 'user-approver',
        }),
        expect.anything(),
      );
    });

    it('should generate receipt with zero outstanding after settlement', async () => {
      await service.executeForeclosure(
        { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'fc-key-rcp' },
        'user-approver', 'manager',
      );

      expect(deps.receipt.generateReceipt).toHaveBeenCalledTimes(1);
      const receiptCall = deps.receipt.generateReceipt.mock.calls[0]![0];
      expect(receiptCall.loanId).toBe('loan-1');
      expect(receiptCall.customerId).toBe('cust-1');
      expect(receiptCall.outstandingAfterPaise).toBe(0);
      expect(receiptCall.amountPaise).toBeGreaterThan(0);
      expect(receiptCall.customerName).toBe('Test Customer');
      expect(receiptCall.loanNumber).toBe('LN-2024-00001');
    });

    it('should store idempotency result after successful settlement', async () => {
      await service.executeForeclosure(
        { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'fc-idem-store' },
        'user-approver', 'manager',
      );

      expect(deps.idempotency.store).toHaveBeenCalledTimes(1);
      const storeArgs = deps.idempotency.store.mock.calls[0]!;
      expect(storeArgs[0]).toBe('fc-idem-store');
      expect(storeArgs[1]).toBe('foreclosure');
      expect(storeArgs[2]).toBe(201);
      const resultBody = storeArgs[3] as Record<string, unknown>;
      expect(resultBody['status']).toBe('settled');
      expect(resultBody['finalOutstandingPaise']).toBe(0);
    });

    it('should return cached result for duplicate idempotency key', async () => {
      deps.idempotency.find.mockResolvedValue({
        resultStatus: 201,
        resultBody: { foreclosureId: 'fc-1', status: 'settled' },
      });

      const result = await service.executeForeclosure(
        { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'fc-dup-key' },
        'user-approver', 'manager',
      );

      expect(result).toEqual({ foreclosureId: 'fc-1', status: 'settled' });
      // Transaction should NOT have been called
      expect(deps.prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should allow requester to also execute foreclosure', async () => {
      const result = await service.executeForeclosure(
        { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'fc-mc-1' },
        'user-requester', 'manager', // same as quote requester
      );
      expect((result as { status: string }).status).toBe('settled');
    });

    it('should create audit log entries for the settlement', async () => {
      await service.executeForeclosure(
        { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'fc-audit-1' },
        'user-approver', 'manager',
      );

      // At least one audit log for the main foreclosure action
      expect(deps.audit.createAuditLog).toHaveBeenCalled();
      const auditCalls = deps.audit.createAuditLog.mock.calls;
      const mainAudit = auditCalls.find(
        (c: unknown[]) => {
          const arg = c[0] as Record<string, unknown>;
          return arg['target_entity'] === 'loan' && arg['action_type'] === 'loan_foreclosed';
        },
      );
      expect(mainAudit).toBeDefined();
      const mainArg = mainAudit![0] as Record<string, unknown>;
      expect(mainArg['actor_id']).toBe('user-approver');
      expect((mainArg['after_state'] as Record<string, unknown>)['status']).toBe('foreclosed');
    });

    it('should use bank account code for bank_transfer payment mode', async () => {
      await service.executeForeclosure(
        { foreclosureId: 'fc-1', paymentMode: 'bank_transfer', idempotencyKey: 'fc-bank-1' },
        'user-approver', 'manager',
      );

      expect(repo.findAccountByCode).toHaveBeenCalledWith('1002', expect.anything());
    });
  });

  // ── Requirement 13.2: Atomicity ──────────────────────────────────────────

  describe('Req 13.2 — Atomicity: failed step → no partial state', () => {
    beforeEach(() => {
      repo.findById.mockResolvedValue(buildQuoteRecord());
    });

    it('should roll back when journal entry creation fails', async () => {
      deps.accounting.createJournalEntry.mockRejectedValue(
        new Error('Journal service unavailable'),
      );

      await expect(
        service.executeForeclosure(
          { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'fc-atom-je' },
          'user-approver', 'manager',
        ),
      ).rejects.toThrow('Journal service unavailable');

      expect(deps.idempotency.store).not.toHaveBeenCalled();
    });

    it('should roll back when receipt generation fails', async () => {
      deps.receipt.generateReceipt.mockRejectedValue(
        new Error('Receipt service down'),
      );

      await expect(
        service.executeForeclosure(
          { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'fc-atom-rcp' },
          'user-approver', 'manager',
        ),
      ).rejects.toThrow('Receipt service down');

      expect(deps.idempotency.store).not.toHaveBeenCalled();
    });

    it('should roll back when installment closure fails', async () => {
      repo.closeAllInstallments.mockRejectedValue(
        new Error('Installment closure failed'),
      );

      await expect(
        service.executeForeclosure(
          { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'fc-atom-inst' },
          'user-approver', 'manager',
        ),
      ).rejects.toThrow('Installment closure failed');

      expect(deps.idempotency.store).not.toHaveBeenCalled();
    });

    it('should roll back when loan status update fails', async () => {
      repo.updateLoan.mockRejectedValue(
        new Error('Loan update failed'),
      );

      await expect(
        service.executeForeclosure(
          { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'fc-atom-loan' },
          'user-approver', 'manager',
        ),
      ).rejects.toThrow('Loan update failed');

      expect(deps.idempotency.store).not.toHaveBeenCalled();
    });

    it('should roll back when foreclosure status update fails', async () => {
      repo.updateForeclosure.mockRejectedValue(
        new Error('Foreclosure update failed'),
      );

      await expect(
        service.executeForeclosure(
          { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'fc-atom-fc' },
          'user-approver', 'manager',
        ),
      ).rejects.toThrow('Foreclosure update failed');

      expect(deps.idempotency.store).not.toHaveBeenCalled();
    });

    it('should roll back when audit log creation fails', async () => {
      deps.audit.createAuditLog.mockRejectedValue(
        new Error('Audit service unavailable'),
      );

      await expect(
        service.executeForeclosure(
          { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'fc-atom-audit' },
          'user-approver', 'manager',
        ),
      ).rejects.toThrow('Audit service unavailable');

      expect(deps.idempotency.store).not.toHaveBeenCalled();
    });

    it('should roll back when collection creation fails', async () => {
      deps.tx.collections.create.mockRejectedValue(
        new Error('Collection insert failed'),
      );

      await expect(
        service.executeForeclosure(
          { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'fc-atom-col' },
          'user-approver', 'manager',
        ),
      ).rejects.toThrow('Collection insert failed');

      expect(deps.idempotency.store).not.toHaveBeenCalled();
    });

    it('should reject when foreclosure record is not found', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(
        service.executeForeclosure(
          { foreclosureId: 'fc-missing', paymentMode: 'cash', idempotencyKey: 'fc-atom-nf' },
          'user-approver', 'manager',
        ),
      ).rejects.toThrow(NotFoundError);
    });

    it('should reject when loan is not found during execution', async () => {
      repo.lockLoanForUpdate.mockResolvedValue(null);

      await expect(
        service.executeForeclosure(
          { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'fc-atom-noloan' },
          'user-approver', 'manager',
        ),
      ).rejects.toThrow(NotFoundError);
    });

    it('should reject when loan status changed to non-foreclosable between quote and execution', async () => {
      repo.lockLoanForUpdate.mockResolvedValue({
        id: 'loan-1', status: 'closed', cached_outstanding_paise: 0n,
      });

      await expect(
        service.executeForeclosure(
          { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'fc-atom-status' },
          'user-approver', 'manager',
        ),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('should reject when required chart of accounts entries are missing', async () => {
      repo.findAccountByCode.mockResolvedValue(null);

      await expect(
        service.executeForeclosure(
          { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'fc-atom-acct' },
          'user-approver', 'manager',
        ),
      ).rejects.toThrow(BusinessRuleError);
    });
  });

  // ── Requirement 13.3: Expired quote rejection ────────────────────────────

  describe('Req 13.3 — Expired quote (>24 hours) rejected on execution', () => {
    it('should reject execution of an expired quote', async () => {
      repo.findById.mockResolvedValue(
        buildQuoteRecord({
          quote_expires_at: new Date(Date.now() - 1000), // expired 1 second ago
        }),
      );

      await expect(
        service.executeForeclosure(
          { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'fc-exp-1' },
          'user-approver', 'manager',
        ),
      ).rejects.toThrow('expired');
    });

    it('should reject execution of a quote expired by 24+ hours', async () => {
      repo.findById.mockResolvedValue(
        buildQuoteRecord({
          quote_expires_at: new Date(Date.now() - 86400000 - 1000), // 24h + 1s ago
        }),
      );

      await expect(
        service.executeForeclosure(
          { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'fc-exp-2' },
          'user-approver', 'manager',
        ),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('should not create any records when expired quote is rejected', async () => {
      repo.findById.mockResolvedValue(
        buildQuoteRecord({
          quote_expires_at: new Date(Date.now() - 5000),
        }),
      );

      try {
        await service.executeForeclosure(
          { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'fc-exp-3' },
          'user-approver', 'manager',
        );
      } catch {
        // expected
      }

      expect(deps.tx.collections.create).not.toHaveBeenCalled();
      expect(deps.accounting.createJournalEntry).not.toHaveBeenCalled();
      expect(deps.receipt.generateReceipt).not.toHaveBeenCalled();
      expect(repo.closeAllInstallments).not.toHaveBeenCalled();
      expect(repo.updateLoan).not.toHaveBeenCalled();
      expect(repo.updateForeclosure).not.toHaveBeenCalled();
      expect(deps.idempotency.store).not.toHaveBeenCalled();
    });

    it('should accept execution of a quote that is not yet expired', async () => {
      repo.findById.mockResolvedValue(
        buildQuoteRecord({
          quote_expires_at: new Date(Date.now() + 60000), // 1 minute from now
        }),
      );

      const result = await service.executeForeclosure(
        { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'fc-exp-valid' },
        'user-approver', 'manager',
      );

      expect((result as { status: string }).status).toBe('settled');
    });

    it('should reject execution of a cancelled quote', async () => {
      repo.findById.mockResolvedValue(
        buildQuoteRecord({ status: 'cancelled' }),
      );

      await expect(
        service.executeForeclosure(
          { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'fc-cancelled' },
          'user-approver', 'manager',
        ),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('should reject execution of an already-settled quote', async () => {
      repo.findById.mockResolvedValue(
        buildQuoteRecord({ status: 'settled' }),
      );

      await expect(
        service.executeForeclosure(
          { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'fc-settled' },
          'user-approver', 'manager',
        ),
      ).rejects.toThrow(BusinessRuleError);
    });
  });

  // ── Requirement 13.4: Rebate with authorization ──────────────────────────

  describe('Req 13.4 — Foreclosure with rebate amount and authorization', () => {
    beforeEach(() => {
      repo.findById.mockResolvedValue(buildQuoteRecord());
    });

    it('should apply rebate to quote and reduce settlement amount', async () => {
      const quoteWithRebate = await service.createQuote(
        {
          loanId: 'loan-1',
          rebatePaise: 10000,
          rebateReason: 'Loyal customer discount',
          rebateAuthorizedBy: 'mgr-auth-1',
        },
        'user-requester', 'manager',
      );

      const quoteWithoutRebate = await service.createQuote(
        { loanId: 'loan-1' },
        'user-requester', 'manager',
      );

      expect(quoteWithRebate.rebatePaise).toBe(10000);
      expect(quoteWithRebate.settlementAmountPaise).toBe(
        quoteWithoutRebate.settlementAmountPaise - 10000,
      );
    });

    it('should store rebate details in the foreclosure record', async () => {
      await service.createQuote(
        {
          loanId: 'loan-1',
          rebatePaise: 5000,
          rebateReason: 'Early settlement incentive',
          rebateAuthorizedBy: 'mgr-auth-2',
        },
        'user-requester', 'manager',
      );

      // H13: rebate_authorized_by is server-derived from the actor, not client-supplied
      expect(repo.createForeclosure).toHaveBeenCalledWith(
        expect.objectContaining({
          rebate_paise: 5000,
          rebate_reason: 'Early settlement incentive',
          rebate_authorized_by: 'user-requester',
        }),
      );
    });

    it('should allow rebate override at execution time', async () => {
      await service.executeForeclosure(
        {
          foreclosureId: 'fc-1',
          paymentMode: 'cash',
          idempotencyKey: 'fc-rebate-override',
          rebatePaise: 8000,
          rebateReason: 'Manager override rebate',
          rebateAuthorizedBy: 'mgr-auth-3',
        },
        'user-approver', 'manager',
      );

      // H13: rebate_authorized_by is server-derived from the actor, not client-supplied
      expect(repo.updateForeclosure).toHaveBeenCalledWith(
        'fc-1',
        expect.objectContaining({
          rebate_paise: 8000,
          rebate_reason: 'Manager override rebate',
          rebate_authorized_by: 'user-approver',
        }),
        expect.anything(),
      );
    });

    it('should create rebate audit log when rebate is applied during execution', async () => {
      await service.executeForeclosure(
        {
          foreclosureId: 'fc-1',
          paymentMode: 'cash',
          idempotencyKey: 'fc-rebate-audit',
          rebatePaise: 3000,
          rebateReason: 'Goodwill gesture',
          rebateAuthorizedBy: 'mgr-auth-4',
        },
        'user-approver', 'manager',
      );

      const auditCalls = deps.audit.createAuditLog.mock.calls;
      // Should have at least 2 audit calls: rebate + main foreclosure
      expect(auditCalls.length).toBeGreaterThanOrEqual(2);

      const rebateAudit = auditCalls.find(
        (c: unknown[]) => {
          const arg = c[0] as Record<string, unknown>;
          const afterState = arg['after_state'] as Record<string, unknown> | undefined;
          return afterState?.['rebate_paise'] === 3000;
        },
      );
      expect(rebateAudit).toBeDefined();
      const rebateArg = rebateAudit![0] as Record<string, unknown>;
      expect(rebateArg['remarks']).toContain('3000');
    });

    it('should not create rebate audit log when rebate is zero', async () => {
      repo.findById.mockResolvedValue(
        buildQuoteRecord({ rebate_paise: 0n }),
      );

      await service.executeForeclosure(
        { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'fc-no-rebate' },
        'user-approver', 'manager',
      );

      const auditCalls = deps.audit.createAuditLog.mock.calls;
      const rebateAudit = auditCalls.find(
        (c: unknown[]) => {
          const arg = c[0] as Record<string, unknown>;
          const afterState = arg['after_state'] as Record<string, unknown> | undefined;
          return afterState?.['rebate_paise'] !== undefined &&
            arg['target_entity'] === 'foreclosure';
        },
      );
      // No rebate audit log when rebate is 0
      expect(rebateAudit).toBeUndefined();
    });

    it('should clamp settlement to zero when rebate exceeds total components', async () => {
      const result = calculateForeclosureSettlement({
        outstandingPrincipalPaise: 10000,
        accruedInterestPaise: 5000,
        pendingPenaltiesPaise: 2000,
        rebatePaise: 999999,
      });
      expect(result.settlementAmountPaise).toBe(0);
    });

    it('should handle foreclosure on overdue loan with rebate', async () => {
      repo.getLoanForForeclosure.mockResolvedValue(
        createMockLoan({ status: 'overdue', dpd: 30 }),
      );
      repo.lockLoanForUpdate.mockResolvedValue({
        id: 'loan-1', status: 'overdue', cached_outstanding_paise: 8000000n,
      });

      const quote = await service.createQuote(
        { loanId: 'loan-1', rebatePaise: 5000, rebateReason: 'Overdue rebate' },
        'user-requester', 'manager',
      );

      expect(quote.status).toBe('quote');
      expect(quote.rebatePaise).toBe(5000);
      expect(quote.settlementAmountPaise).toBeGreaterThan(0);
    });
  });

  // ── Cross-cutting: Journal balance invariant ─────────────────────────────

  describe('Journal balance invariant', () => {
    beforeEach(() => {
      repo.findById.mockResolvedValue(buildQuoteRecord());
    });

    it('should produce balanced journal for settlement with all components', async () => {
      // Quote with principal + interest + penalties. Override the loan and
      // penalty mocks so the live recomputation matches the quote within
      // H16 tolerance.
      repo.getLoanForForeclosure.mockResolvedValue(createMockLoan({
        total_interest_paise: 8_000n,
        last_due_date: new Date('2024-12-01'),
        schedules: [
          {
            id: 's-1', installment_number: 1, due_date: new Date('2024-02-01'),
            principal_paise: 100_000n, interest_paise: 8_000n, total_paise: 108_000n,
            principal_paid_paise: 0n, interest_paid_paise: 0n,
            penalty_paid_paise: 0n, status: 'pending',
          },
        ],
      }));
      repo.getPendingPenalties.mockResolvedValue([
        { id: 'pen-1', amount_paise: 3_000n, installment_id: 's-1' },
      ]);
      repo.findById.mockResolvedValue(
        buildQuoteRecord({
          outstanding_principal_paise: 100000n,
          accrued_interest_paise: 8000n,
          pending_penalties_paise: 3000n,
          rebate_paise: 0n,
          settlement_amount_paise: 111000n,
        }),
      );

      await service.executeForeclosure(
        { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'fc-bal-all' },
        'user-approver', 'manager',
      );

      const jeCall = deps.accounting.createJournalEntry.mock.calls[0]![0];
      const lines = jeCall.lines as { debitPaise: number; creditPaise: number }[];
      const totalDebit = lines.reduce((s, l) => s + l.debitPaise, 0);
      const totalCredit = lines.reduce((s, l) => s + l.creditPaise, 0);
      expect(totalDebit).toBe(totalCredit);
      expect(totalDebit).toBe(111000);
    });

    it('should produce balanced journal for settlement with rebate', async () => {
      // Live state must match the (rebate-adjusted) quote. Compare uses
      // quote.rebate_paise = 5000, so live settlement = 100k+8k+3k − 5k = 106k.
      repo.getLoanForForeclosure.mockResolvedValue(createMockLoan({
        total_interest_paise: 8_000n,
        last_due_date: new Date('2024-12-01'),
        schedules: [
          {
            id: 's-1', installment_number: 1, due_date: new Date('2024-02-01'),
            principal_paise: 100_000n, interest_paise: 8_000n, total_paise: 108_000n,
            principal_paid_paise: 0n, interest_paid_paise: 0n,
            penalty_paid_paise: 0n, status: 'pending',
          },
        ],
      }));
      repo.getPendingPenalties.mockResolvedValue([
        { id: 'pen-1', amount_paise: 3_000n, installment_id: 's-1' },
      ]);
      repo.findById.mockResolvedValue(
        buildQuoteRecord({
          outstanding_principal_paise: 100000n,
          accrued_interest_paise: 8000n,
          pending_penalties_paise: 3000n,
          rebate_paise: 5000n,
          settlement_amount_paise: 106000n,
        }),
      );

      await service.executeForeclosure(
        { foreclosureId: 'fc-1', paymentMode: 'cash', idempotencyKey: 'fc-bal-rebate' },
        'user-approver', 'manager',
      );

      const jeCall = deps.accounting.createJournalEntry.mock.calls[0]![0];
      const lines = jeCall.lines as { debitPaise: number; creditPaise: number }[];
      const totalDebit = lines.reduce((s, l) => s + l.debitPaise, 0);
      const totalCredit = lines.reduce((s, l) => s + l.creditPaise, 0);
      expect(totalDebit).toBe(totalCredit);
      expect(totalDebit).toBe(106000);
    });
  });

  // ── Cross-cutting: Pure settlement calculation ───────────────────────────

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

    it('should handle zero components correctly', () => {
      const result = calculateForeclosureSettlement({
        outstandingPrincipalPaise: 50000,
        accruedInterestPaise: 0,
        pendingPenaltiesPaise: 0,
        rebatePaise: 0,
      });
      expect(result.settlementAmountPaise).toBe(50000);
    });
  });
});
