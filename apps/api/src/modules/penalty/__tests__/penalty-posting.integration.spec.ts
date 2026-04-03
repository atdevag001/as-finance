import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PenaltyService, calculateDpd, classifyOverdueBucket, calculatePenaltyAmount } from '../penalty.service';
import { BusinessRuleError, ConflictError } from '../../../common/errors';

/**
 * Penalty Posting Integration Tests
 *
 * Tests the full penalty calculation and posting pipeline with mocked repositories:
 *   DPD calculation → penalty amount → atomic posting → journal entry →
 *   outstanding update → status transition → audit log
 *
 * Addresses traceability gap: Penalty had unit + PBT + E2E but no integration test.
 * Validates: Requirements 10.1–10.9, 11.1–11.5; Properties 9, 10
 */

// ── Mock Factories ───────────────────────────────────────────────────────────

function createMockScheduleForDpd(overrides: Partial<{
  due_date: Date; principal_paise: number; interest_paise: number;
  principal_paid_paise: number; interest_paid_paise: number;
}> = {}) {
  return {
    due_date: overrides.due_date ?? new Date('2024-01-15'),
    principal_paise: overrides.principal_paise ?? 500000,
    interest_paise: overrides.interest_paise ?? 50000,
    principal_paid_paise: overrides.principal_paid_paise ?? 0,
    interest_paid_paise: overrides.interest_paid_paise ?? 0,
  };
}

function createMockLoan(overrides: Record<string, unknown> = {}) {
  return {
    id: 'loan-1',
    loan_number: 'LN-2024-00001',
    customer_id: 'cust-1',
    status: 'active',
    dpd: 0,
    overdue_bucket: 'bucket_0',
    cached_outstanding_paise: 1100000n,
    product_version: {
      id: 'pv-1',
      penalty_grace_days: 7,
      penalty_type: 'flat_per_period',
      penalty_value: 5000,
      penalty_frequency: 'monthly',
    },
    schedules: [
      { id: 's-1', installment_number: 1, due_date: new Date('2024-01-15'),
        principal_paise: 500000n, interest_paise: 50000n,
        principal_paid_paise: 0n, interest_paid_paise: 0n, status: 'pending' },
    ],
    ...overrides,
  };
}

const ACCOUNTS: Record<string, { id: string; code: string; name: string; category: string }> = {
  '1100': { id: 'acc-lr', code: '1100', name: 'Loans Receivable', category: 'asset' },
  '4003': { id: 'acc-pen', code: '4003', name: 'Penalty Income', category: 'income' },
};

function createMockRepo() {
  return {
    findLoanForPenalty: vi.fn().mockResolvedValue(createMockLoan()),
    lockLoanForUpdate: vi.fn().mockResolvedValue({ id: 'loan-1', status: 'active' }),
    getOverdueInstallments: vi.fn().mockResolvedValue([
      { id: 's-1', installment_number: 1, due_date: new Date('2024-01-15'),
        principal_paise: 500000n, interest_paise: 50000n,
        principal_paid_paise: 0n, interest_paid_paise: 0n, status: 'pending' },
    ]),
    findExistingPenalty: vi.fn().mockResolvedValue(null),
    createPenalty: vi.fn().mockResolvedValue({ id: 'pen-1', amount_paise: 5000n }),
    updateLoanOutstanding: vi.fn().mockResolvedValue(undefined),
    updateLoanDpdAndBucket: vi.fn().mockResolvedValue(undefined),
    updateLoanStatus: vi.fn().mockResolvedValue(undefined),
    findAccountByCode: vi.fn((code: string) => Promise.resolve(ACCOUNTS[code] ?? null)),
    enqueueOutboxMessage: vi.fn().mockResolvedValue(undefined),
    createLoanStatusHistory: vi.fn().mockResolvedValue(undefined),
    findPenaltyById: vi.fn().mockResolvedValue(null),
    updatePenalty: vi.fn().mockResolvedValue(undefined),
    findPenaltiesByLoanId: vi.fn().mockResolvedValue([]),
  };
}

function createMockServices() {
  return {
    accounting: { createJournalEntry: vi.fn().mockResolvedValue({ id: 'je-1' }) },
    audit: { createAuditLog: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
    loan: { findById: vi.fn().mockResolvedValue(null), updateStatus: vi.fn().mockResolvedValue(undefined) },
    prisma: { $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({})) },
  };
}

function buildDto(overrides: Partial<{
  loanId: string; installmentId: string; penaltyPeriod: string; referenceDate: string;
}> = {}) {
  return {
    loanId: overrides.loanId ?? 'loan-1',
    installmentId: overrides.installmentId ?? 's-1',
    penaltyPeriod: overrides.penaltyPeriod ?? '2024-02',
    ...(overrides.referenceDate && { referenceDate: overrides.referenceDate }),
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Penalty Posting Integration', () => {
  let service: PenaltyService;
  let repo: ReturnType<typeof createMockRepo>;
  let mocks: ReturnType<typeof createMockServices>;

  beforeEach(() => {
    repo = createMockRepo();
    mocks = createMockServices();
    service = new PenaltyService(
      mocks.prisma as never, repo as never,
      mocks.accounting as never, mocks.audit as never, mocks.loan as never,
    );
  });

  // ── Pure function tests: DPD, bucket, penalty amount ───────────────────

  describe('Pure functions — DPD and penalty calculation', () => {
    it('should calculate DPD correctly for overdue installment', () => {
      const schedules = [createMockScheduleForDpd({ due_date: new Date('2024-01-15') })];
      const dpd = calculateDpd(schedules, new Date('2024-02-14'));
      expect(dpd).toBe(30);
    });

    it('should return 0 DPD for installment not yet due', () => {
      const schedules = [createMockScheduleForDpd({ due_date: new Date('2024-02-15') })];
      const dpd = calculateDpd(schedules, new Date('2024-01-15'));
      expect(dpd).toBe(0);
    });

    it('should return 0 DPD when all installments are fully paid', () => {
      const schedules = [createMockScheduleForDpd({
        due_date: new Date('2024-01-15'),
        principal_paid_paise: 500000,
        interest_paid_paise: 50000,
      })];
      const dpd = calculateDpd(schedules, new Date('2024-02-15'));
      expect(dpd).toBe(0);
    });

    it('should classify overdue buckets correctly', () => {
      expect(classifyOverdueBucket(0)).toBe('bucket_0');
      expect(classifyOverdueBucket(1)).toBe('bucket_1_30');
      expect(classifyOverdueBucket(30)).toBe('bucket_1_30');
      expect(classifyOverdueBucket(31)).toBe('bucket_31_60');
      expect(classifyOverdueBucket(60)).toBe('bucket_31_60');
      expect(classifyOverdueBucket(61)).toBe('bucket_61_90');
      expect(classifyOverdueBucket(90)).toBe('bucket_61_90');
      expect(classifyOverdueBucket(91)).toBe('bucket_90_plus');
      expect(classifyOverdueBucket(365)).toBe('bucket_90_plus');
    });

    it('should calculate flat penalty amount correctly', () => {
      const amount = calculatePenaltyAmount('flat_per_period', 5000, 550000);
      expect(amount).toBe(5000);
    });

    it('should calculate percentage penalty amount correctly', () => {
      // 1000 bps = 10% of 550000 = 55000
      const amount = calculatePenaltyAmount('percentage_of_overdue', 1000, 550000);
      expect(amount).toBe(55000);
    });

    it('should return 0 for unknown penalty type', () => {
      const amount = calculatePenaltyAmount('unknown_type', 5000, 550000);
      expect(amount).toBe(0);
    });
  });

  // ── Req 10.4: Atomic penalty posting with journal entry ────────────────

  describe('Req 10.4 — Atomic penalty posting', () => {
    it('should create penalty record, journal entry, and update outstanding atomically', async () => {
      const dto = buildDto({ referenceDate: '2024-02-15' });

      const result = await service.calculateAndPost(dto, 'system', 'system');

      // Penalty record created
      expect(repo.createPenalty).toHaveBeenCalledTimes(1);
      // Journal entry created (DR Loans Receivable, CR Penalty Income)
      expect(mocks.accounting.createJournalEntry).toHaveBeenCalledTimes(1);
      const jeCall = mocks.accounting.createJournalEntry.mock.calls[0]![0];
      const totalDebit = jeCall.lines.reduce(
        (s: number, l: { debitPaise: number }) => s + (l.debitPaise ?? 0), 0,
      );
      const totalCredit = jeCall.lines.reduce(
        (s: number, l: { creditPaise: number }) => s + (l.creditPaise ?? 0), 0,
      );
      expect(totalDebit).toBe(totalCredit);
      expect(totalDebit).toBeGreaterThan(0);
      // Outstanding updated
      expect(repo.updateLoanOutstanding).toHaveBeenCalledTimes(1);
      // Audit log created
      expect(mocks.audit.createAuditLog).toHaveBeenCalledTimes(1);
    });
  });

  // ── Req 10.8: Grace period — no penalty within grace ───────────────────

  describe('Req 10.8 — Grace period enforcement', () => {
    it('should not post penalty when installment is within grace period', async () => {
      // Due date: Jan 15, reference: Jan 20 → DPD = 5, grace = 7 → no penalty
      repo.getOverdueInstallments.mockResolvedValue([
        { id: 's-1', installment_number: 1, due_date: new Date('2024-01-15'),
          principal_paise: 500000n, interest_paise: 50000n,
          principal_paid_paise: 0n, interest_paid_paise: 0n, status: 'pending' },
      ]);

      const dto = buildDto({ referenceDate: '2024-01-20' });
      await service.calculateAndPost(dto, 'system', 'system');

      // No penalty should be created (within grace period)
      expect(repo.createPenalty).not.toHaveBeenCalled();
      expect(mocks.accounting.createJournalEntry).not.toHaveBeenCalled();
    });
  });

  // ── Req 10.9: Duplicate penalty rejection ──────────────────────────────

  describe('Req 10.9 — Duplicate penalty rejection', () => {
    it('should reject duplicate penalty for same installment and period', async () => {
      repo.findExistingPenalty.mockResolvedValue({
        id: 'pen-existing',
        loan_id: 'loan-1',
        installment_id: 's-1',
        penalty_period: '2024-02',
      });

      const dto = buildDto({ referenceDate: '2024-02-15' });

      await expect(
        service.calculateAndPost(dto, 'system', 'system'),
      ).rejects.toThrow(ConflictError);

      expect(repo.createPenalty).not.toHaveBeenCalled();
    });
  });

  // ── Req 10.6: Status transition based on DPD ──────────────────────────

  describe('Req 10.6 — Status transition based on DPD', () => {
    it('should update DPD and bucket after penalty posting', async () => {
      const dto = buildDto({ referenceDate: '2024-02-15' });
      await service.calculateAndPost(dto, 'system', 'system');

      expect(repo.updateLoanDpdAndBucket).toHaveBeenCalled();
    });
  });

  // ── Atomicity — failed step → no partial state ─────────────────────────

  describe('Atomicity', () => {
    it('should roll back when journal entry creation fails', async () => {
      mocks.accounting.createJournalEntry.mockRejectedValue(new Error('Journal failed'));

      await expect(
        service.calculateAndPost(buildDto({ referenceDate: '2024-02-15' }), 'system', 'system'),
      ).rejects.toThrow('Journal failed');

      expect(repo.updateLoanOutstanding).not.toHaveBeenCalled();
    });

    it('should roll back when penalty record creation fails', async () => {
      repo.createPenalty.mockRejectedValue(new Error('Penalty insert failed'));

      await expect(
        service.calculateAndPost(buildDto({ referenceDate: '2024-02-15' }), 'system', 'system'),
      ).rejects.toThrow('Penalty insert failed');

      expect(mocks.accounting.createJournalEntry).not.toHaveBeenCalled();
    });
  });

  // ── Req 10.5: Penalty waiver ──────────────────────────────────────────

  describe('Req 10.5 — Penalty waiver', () => {
    it('should waive penalty with authorized role and mandatory reason', async () => {
      repo.findPenaltyById.mockResolvedValue({
        id: 'pen-1',
        loan_id: 'loan-1',
        amount_paise: 5000n,
        is_paid: false,
        is_waived: false,
      });

      const dto = { reason: 'Customer hardship waiver', approverId: 'approver-1' };
      const result = await service.waivePenalty('pen-1', dto, 'manager-1', 'manager');

      expect(repo.updatePenalty).toHaveBeenCalledTimes(1);
      expect(mocks.audit.createAuditLog).toHaveBeenCalledTimes(1);
    });

    it('should reject waiver of already-waived penalty', async () => {
      repo.findPenaltyById.mockResolvedValue({
        id: 'pen-1',
        loan_id: 'loan-1',
        amount_paise: 5000n,
        is_paid: false,
        is_waived: true,
      });

      await expect(
        service.waivePenalty('pen-1', { reason: 'Test waiver reason', approverId: 'approver-1' }, 'manager-1', 'manager'),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('should reject waiver of already-paid penalty', async () => {
      repo.findPenaltyById.mockResolvedValue({
        id: 'pen-1',
        loan_id: 'loan-1',
        amount_paise: 5000n,
        is_paid: true,
        is_waived: false,
      });

      await expect(
        service.waivePenalty('pen-1', { reason: 'Test waiver reason', approverId: 'approver-1' }, 'manager-1', 'manager'),
      ).rejects.toThrow(BusinessRuleError);
    });
  });
});
