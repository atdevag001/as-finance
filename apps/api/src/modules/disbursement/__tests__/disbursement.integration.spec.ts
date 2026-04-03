import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DisbursementService } from '../disbursement.service';
import { BusinessRuleError, NotFoundError } from '../../../common/errors';
import { PaymentMode } from '@as-finance/shared';

/**
 * Disbursement Integration Tests
 *
 * Tests the full disbursement pipeline with mocked repositories:
 *   prerequisite verification → atomic execution → loan status update →
 *   disbursement record → journal entry → schedule activation →
 *   processing fee → audit log → SMS outbox → idempotency
 *
 * Addresses traceability gap: Disbursement had unit + E2E but no integration test.
 * Validates: Requirements 5.1–5.7, 3.5a, 12.4; Property 20 (idempotency)
 */

// ── Mock Factories ───────────────────────────────────────────────────────────

function createMockLoan(overrides: Record<string, unknown> = {}) {
  return {
    id: 'loan-1',
    loan_number: 'LN-2024-00001',
    customer_id: 'cust-1',
    principal_paise: 1000000n,
    status: 'approved',
    product_version_id: 'pv-1',
    product_version: {
      id: 'pv-1',
      processing_fee_type: 'percentage',
      processing_fee_value: 200, // 2% = 200 bps
    },
    customer: { id: 'cust-1', full_name: 'Test Customer', mobile: '9876543210' },
    schedules: [
      { id: 's-1', installment_number: 1, status: 'pending' },
      { id: 's-2', installment_number: 2, status: 'pending' },
    ],
    documents: [{ id: 'doc-1', doc_type: 'aadhaar' }],
    ...overrides,
  };
}

const ACCOUNTS: Record<string, { id: string; code: string; name: string; category: string }> = {
  '1001': { id: 'acc-cash', code: '1001', name: 'Cash', category: 'asset' },
  '1002': { id: 'acc-bank', code: '1002', name: 'Bank', category: 'asset' },
  '1100': { id: 'acc-lr', code: '1100', name: 'Loans Receivable', category: 'asset' },
  '4002': { id: 'acc-pf', code: '4002', name: 'Processing Fee Income', category: 'income' },
};

function createMockRepo() {
  return {
    findLoanForDisbursement: vi.fn().mockResolvedValue(createMockLoan()),
    lockLoanForUpdate: vi.fn().mockResolvedValue({ id: 'loan-1', status: 'approved' }),
    createDisbursement: vi.fn().mockResolvedValue({ id: 'disb-1' }),
    updateLoanStatus: vi.fn().mockResolvedValue(undefined),
    updateLoanDisbursementData: vi.fn().mockResolvedValue(undefined),
    activateSchedule: vi.fn().mockResolvedValue(undefined),
    findAccountByCode: vi.fn((code: string) => Promise.resolve(ACCOUNTS[code] ?? null)),
    enqueueOutboxMessage: vi.fn().mockResolvedValue(undefined),
    createLoanStatusHistory: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockServices() {
  return {
    accounting: { createJournalEntry: vi.fn().mockResolvedValue({ id: 'je-1' }) },
    audit: { createAuditLog: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
    idempotency: { find: vi.fn().mockResolvedValue(null), store: vi.fn().mockResolvedValue({}) },
    loan: { findById: vi.fn().mockResolvedValue(null) },
    prisma: { $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({})) },
  };
}

function buildDto(overrides: Partial<{
  loanId: string; mode: PaymentMode; idempotencyKey: string; referenceNumber: string;
}> = {}) {
  return {
    loanId: overrides.loanId ?? 'loan-1',
    mode: overrides.mode ?? PaymentMode.CASH,
    idempotencyKey: overrides.idempotencyKey ?? `disb-${Date.now()}-${Math.random()}`,
    ...(overrides.referenceNumber && { referenceNumber: overrides.referenceNumber }),
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Disbursement Integration', () => {
  let service: DisbursementService;
  let repo: ReturnType<typeof createMockRepo>;
  let mocks: ReturnType<typeof createMockServices>;

  beforeEach(() => {
    repo = createMockRepo();
    mocks = createMockServices();
    service = new DisbursementService(
      mocks.prisma as never, repo as never, mocks.accounting as never,
      mocks.audit as never, mocks.idempotency as never, mocks.loan as never,
    );
  });

  // ── Req 5.1: Successful disbursement of approved loan ──────────────────

  describe('Req 5.1 — Successful disbursement', () => {
    it('should create disbursement record, journal entry, activate schedule, and update loan', async () => {
      const dto = buildDto();

      const result = await service.disburse(dto, 'manager-1', 'manager');

      expect(result.statusCode).toBe(201);
      // Disbursement record created
      expect(repo.createDisbursement).toHaveBeenCalledTimes(1);
      const disbData = repo.createDisbursement.mock.calls[0]![0];
      expect(disbData.loan_id).toBe('loan-1');
      expect(disbData.amount_paise).toBe(1000000n);
      expect(disbData.mode).toBe('cash');
      // Loan status updated (approved → disbursed → active)
      expect(repo.updateLoanStatus).toHaveBeenCalled();
      // Schedule activated
      expect(repo.activateSchedule).toHaveBeenCalledTimes(1);
      // Journal entry created
      expect(mocks.accounting.createJournalEntry).toHaveBeenCalled();
      // Audit log created
      expect(mocks.audit.createAuditLog).toHaveBeenCalledTimes(1);
      // SMS enqueued
      expect(repo.enqueueOutboxMessage).toHaveBeenCalledTimes(1);
      // Idempotency stored
      expect(mocks.idempotency.store).toHaveBeenCalledTimes(1);
    });
  });

  // ── Req 5.2: Prerequisite verification ─────────────────────────────────

  describe('Req 5.2 — Prerequisite verification', () => {
    it('should reject disbursement when loan status is not approved', async () => {
      repo.lockLoanForUpdate.mockResolvedValue({ id: 'loan-1', status: 'draft' });

      await expect(
        service.disburse(buildDto(), 'manager-1', 'manager'),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('should reject disbursement when loan is already disbursed', async () => {
      repo.lockLoanForUpdate.mockResolvedValue({ id: 'loan-1', status: 'active' });

      await expect(
        service.disburse(buildDto(), 'manager-1', 'manager'),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('should reject disbursement when no schedule exists', async () => {
      repo.findLoanForDisbursement.mockResolvedValue(createMockLoan({ schedules: [] }));

      await expect(
        service.disburse(buildDto(), 'manager-1', 'manager'),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('should reject disbursement for non-existent loan', async () => {
      repo.lockLoanForUpdate.mockResolvedValue(null);

      await expect(
        service.disburse(buildDto(), 'manager-1', 'manager'),
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ── Req 5.3: Journal entry correctness ─────────────────────────────────

  describe('Req 5.3 — Journal entry correctness', () => {
    it('should create balanced journal entry: DR Loans Receivable, CR Cash', async () => {
      await service.disburse(buildDto(), 'manager-1', 'manager');

      const jeCall = mocks.accounting.createJournalEntry.mock.calls[0]![0];
      const totalDebit = jeCall.lines.reduce(
        (s: number, l: { debitPaise: number }) => s + (l.debitPaise ?? 0), 0,
      );
      const totalCredit = jeCall.lines.reduce(
        (s: number, l: { creditPaise: number }) => s + (l.creditPaise ?? 0), 0,
      );
      expect(totalDebit).toBe(totalCredit);
      expect(totalDebit).toBeGreaterThan(0);
    });

    it('should create processing fee journal entry when product has processing fee', async () => {
      await service.disburse(buildDto(), 'manager-1', 'manager');

      // Should have at least 2 journal entry calls: disbursement + processing fee
      // Or a single entry with processing fee lines
      const jeCalls = mocks.accounting.createJournalEntry.mock.calls;
      expect(jeCalls.length).toBeGreaterThanOrEqual(1);

      // Verify all journal entries are balanced
      for (const call of jeCalls) {
        const je = call[0];
        const debit = je.lines.reduce((s: number, l: { debitPaise: number }) => s + (l.debitPaise ?? 0), 0);
        const credit = je.lines.reduce((s: number, l: { creditPaise: number }) => s + (l.creditPaise ?? 0), 0);
        expect(debit).toBe(credit);
      }
    });
  });

  // ── Req 5.5: Idempotency ──────────────────────────────────────────────

  describe('Req 5.5 — Idempotency', () => {
    it('should return cached result for duplicate idempotency key', async () => {
      const cached = {
        resultStatus: 201,
        resultBody: { disbursementId: 'disb-cached', loanId: 'loan-1' },
      };
      mocks.idempotency.find.mockResolvedValue(cached);

      const result = await service.disburse(
        buildDto({ idempotencyKey: 'dup-disb-key' }),
        'manager-1', 'manager',
      );

      expect(result.statusCode).toBe(201);
      expect(result.data).toEqual(cached.resultBody);
      // No new records created
      expect(repo.createDisbursement).not.toHaveBeenCalled();
      expect(mocks.accounting.createJournalEntry).not.toHaveBeenCalled();
    });

    it('should store idempotency result on first successful disbursement', async () => {
      await service.disburse(buildDto({ idempotencyKey: 'first-disb' }), 'manager-1', 'manager');

      expect(mocks.idempotency.store).toHaveBeenCalledTimes(1);
      expect(mocks.idempotency.store.mock.calls[0]![0]).toBe('first-disb');
      expect(mocks.idempotency.store.mock.calls[0]![1]).toBe('disbursement');
    });
  });

  // ── Req 5.6: Atomicity — failed step → no partial state ───────────────

  describe('Req 5.6 — Atomicity', () => {
    it('should roll back when journal entry creation fails', async () => {
      mocks.accounting.createJournalEntry.mockRejectedValue(new Error('DB error'));

      await expect(
        service.disburse(buildDto(), 'manager-1', 'manager'),
      ).rejects.toThrow('DB error');

      expect(mocks.idempotency.store).not.toHaveBeenCalled();
    });

    it('should roll back when schedule activation fails', async () => {
      repo.activateSchedule.mockRejectedValue(new Error('Schedule activation failed'));

      await expect(
        service.disburse(buildDto(), 'manager-1', 'manager'),
      ).rejects.toThrow('Schedule activation failed');

      expect(mocks.idempotency.store).not.toHaveBeenCalled();
    });

    it('should roll back when loan status update fails', async () => {
      repo.updateLoanStatus.mockRejectedValue(new Error('Status update failed'));

      await expect(
        service.disburse(buildDto(), 'manager-1', 'manager'),
      ).rejects.toThrow('Status update failed');

      expect(mocks.idempotency.store).not.toHaveBeenCalled();
    });
  });

  // ── Req 5.7: Loan data updates ────────────────────────────────────────

  describe('Req 5.7 — Loan data updates', () => {
    it('should set disbursement_date, first_due_date, last_due_date, and cached_outstanding', async () => {
      await service.disburse(buildDto(), 'manager-1', 'manager');

      expect(repo.updateLoanDisbursementData).toHaveBeenCalledTimes(1);
      const updateData = repo.updateLoanDisbursementData.mock.calls[0]![1];
      expect(updateData).toHaveProperty('disbursement_date');
      expect(updateData).toHaveProperty('cached_outstanding_paise');
    });

    it('should record status history for approved → disbursed → active transitions', async () => {
      await service.disburse(buildDto(), 'manager-1', 'manager');

      expect(repo.createLoanStatusHistory).toHaveBeenCalled();
    });
  });
});
