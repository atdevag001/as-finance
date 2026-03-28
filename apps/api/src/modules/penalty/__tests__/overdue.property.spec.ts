import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { classifyOverdueBucket } from '../penalty.service';
import { PenaltyService } from '../penalty.service';
import { ConflictError } from '../../../common/errors';

/**
 * Property 25: Overdue Bucket Classification
 *
 * For all DPD values, the overdue bucket classification SHALL be:
 *   DPD 0 → bucket_0
 *   DPD 1-30 → bucket_1_30
 *   DPD 31-60 → bucket_31_60
 *   DPD 61-90 → bucket_61_90
 *   DPD > 90 → bucket_90_plus
 *
 * The classification function SHALL be total (defined for all non-negative
 * integers) and deterministic.
 *
 * **Validates: Requirements 8.2**
 *
 * ---
 *
 * Property 26: Penalty Uniqueness
 *
 * For all penalty posting attempts, no two penalties SHALL exist for the same
 * (loan_id, installment_id, penalty_period) combination. Duplicate penalty
 * posting attempts SHALL be rejected.
 *
 * **Validates: Requirements 8.5**
 */

// ===========================================================================
// Generators
// ===========================================================================

/** Non-negative integer DPD (0 – 10,000) */
const dpdArb = fc.integer({ min: 0, max: 10_000 });

const VALID_BUCKETS = new Set([
  'bucket_0',
  'bucket_1_30',
  'bucket_31_60',
  'bucket_61_90',
  'bucket_90_plus',
]);


// ===========================================================================
// Property 25: Overdue Bucket Classification
// ===========================================================================

describe('Property 25: Overdue Bucket Classification', () => {
  it(
    'for all non-negative DPD values, classifyOverdueBucket returns the correct bucket',
    () => {
      fc.assert(
        fc.property(dpdArb, (dpd) => {
          const bucket = classifyOverdueBucket(dpd);

          if (dpd === 0) {
            expect(bucket).toBe('bucket_0');
          } else if (dpd >= 1 && dpd <= 30) {
            expect(bucket).toBe('bucket_1_30');
          } else if (dpd >= 31 && dpd <= 60) {
            expect(bucket).toBe('bucket_31_60');
          } else if (dpd >= 61 && dpd <= 90) {
            expect(bucket).toBe('bucket_61_90');
          } else {
            expect(bucket).toBe('bucket_90_plus');
          }
        }),
        { numRuns: 1000 },
      );
    },
  );

  it(
    'for all non-negative DPD values, classifyOverdueBucket is total (always returns a valid bucket)',
    () => {
      fc.assert(
        fc.property(dpdArb, (dpd) => {
          const bucket = classifyOverdueBucket(dpd);
          expect(VALID_BUCKETS.has(bucket)).toBe(true);
        }),
        { numRuns: 1000 },
      );
    },
  );

  it(
    'for all non-negative DPD values, classifyOverdueBucket is deterministic (same input → same output)',
    () => {
      fc.assert(
        fc.property(dpdArb, (dpd) => {
          const first = classifyOverdueBucket(dpd);
          const second = classifyOverdueBucket(dpd);
          expect(first).toBe(second);
        }),
        { numRuns: 1000 },
      );
    },
  );

  it(
    'bucket boundaries are exact: 0, 30→31, 60→61, 90→91',
    () => {
      // Boundary values verified explicitly within property framework
      fc.assert(
        fc.property(
          fc.constantFrom(0, 1, 30, 31, 60, 61, 90, 91),
          (dpd) => {
            const bucket = classifyOverdueBucket(dpd);
            const expected: Record<number, string> = {
              0: 'bucket_0',
              1: 'bucket_1_30',
              30: 'bucket_1_30',
              31: 'bucket_31_60',
              60: 'bucket_31_60',
              61: 'bucket_61_90',
              90: 'bucket_61_90',
              91: 'bucket_90_plus',
            };
            expect(bucket).toBe(expected[dpd]);
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});


// ===========================================================================
// Property 26: Penalty Uniqueness
// ===========================================================================

// ── Mock factories for Property 26 ──

function createMockPenaltyRepo() {
  return {
    lockLoanForUpdate: vi.fn(),
    getLoanForPenalty: vi.fn(),
    getLoanById: vi.fn(),
    penaltyExists: vi.fn(),
    createPenalty: vi.fn(),
    findAccountByCode: vi.fn(),
    updateLoanOutstanding: vi.fn(),
    updateLoanStatus: vi.fn(),
    createStatusHistory: vi.fn(),
    findById: vi.fn(),
    findByIdTx: vi.fn(),
    findByLoanId: vi.fn(),
    waivePenalty: vi.fn(),
    getPendingPenalties: vi.fn(),
  };
}

const uuidArb = fc.uuid();

/** Penalty period string like "2024-01" */
const penaltyPeriodArb = fc
  .tuple(
    fc.integer({ min: 2020, max: 2030 }),
    fc.integer({ min: 1, max: 12 }),
  )
  .map(([y, m]) => `${y}-${String(m).padStart(2, '0')}`);

function buildBaseLoan(installmentId: string) {
  return {
    id: 'loan-1',
    loan_number: 'LN-2024-00001',
    customer_id: 'cust-1',
    principal_paise: 1000000n,
    status: 'active',
    total_payable_paise: 1100000n,
    cached_outstanding_paise: 500000n,
    dpd: 0,
    overdue_bucket: 'bucket_0',
    product_version: {
      id: 'pv-1',
      penalty_grace_days: 0,
      penalty_type: 'flat_per_period',
      penalty_value: 500,
      penalty_frequency: 'monthly',
    },
    schedules: [
      {
        id: installmentId,
        installment_number: 1,
        due_date: new Date('2024-01-01'),
        principal_paise: 100000n,
        interest_paise: 10000n,
        total_paise: 110000n,
        principal_paid_paise: 0n,
        interest_paid_paise: 0n,
        penalty_paid_paise: 0n,
        status: 'overdue',
      },
    ],
  };
}

describe('Property 26: Penalty Uniqueness', () => {
  it(
    'for all (loan_id, installment_id, penalty_period) tuples, duplicate penalty posting is rejected with ConflictError',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          uuidArb,
          uuidArb,
          penaltyPeriodArb,
          async (loanId, installmentId, penaltyPeriod) => {
            const mockPenaltyRepo = createMockPenaltyRepo();
            const mockPrisma = {
              $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
            };
            const mockAccountingService = {
              createJournalEntry: vi.fn().mockResolvedValue({ id: 'je-1' }),
            };
            const mockAuditService = {
              createAuditLog: vi.fn().mockResolvedValue({ id: 'audit-1' }),
            };
            const mockLoanService = { validateTransition: vi.fn() };

            const loan = buildBaseLoan(installmentId);
            loan.id = loanId;

            mockPenaltyRepo.lockLoanForUpdate.mockResolvedValue({
              id: loanId,
              status: 'active',
              cached_outstanding_paise: 500000n,
            });
            mockPenaltyRepo.getLoanForPenalty.mockResolvedValue(loan);

            // Simulate: penalty already exists for this tuple
            mockPenaltyRepo.penaltyExists.mockResolvedValue(true);

            const service = new PenaltyService(
              mockPrisma as never,
              mockPenaltyRepo as never,
              mockAccountingService as never,
              mockAuditService as never,
              mockLoanService as never,
            );

            const dto = {
              loanId,
              installmentId,
              penaltyPeriod,
              referenceDate: '2024-06-15',
            };

            await expect(
              service.calculateAndPost(dto, 'user-1', 'manager'),
            ).rejects.toThrow(ConflictError);

            // Verify penaltyExists was called with the exact tuple
            expect(mockPenaltyRepo.penaltyExists).toHaveBeenCalledWith(
              loanId,
              installmentId,
              penaltyPeriod,
              expect.anything(),
            );

            // Verify no penalty was created
            expect(mockPenaltyRepo.createPenalty).not.toHaveBeenCalled();
          },
        ),
        { numRuns: 200 },
      );
    },
  );

  it(
    'for all distinct penalty periods on the same (loan_id, installment_id), first posting succeeds and second with same period is rejected',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          uuidArb,
          uuidArb,
          penaltyPeriodArb,
          async (loanId, installmentId, penaltyPeriod) => {
            const mockPenaltyRepo = createMockPenaltyRepo();
            const mockPrisma = {
              $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
            };
            const mockAccountingService = {
              createJournalEntry: vi.fn().mockResolvedValue({ id: 'je-1' }),
            };
            const mockAuditService = {
              createAuditLog: vi.fn().mockResolvedValue({ id: 'audit-1' }),
            };
            const mockLoanService = { validateTransition: vi.fn() };

            const loan = buildBaseLoan(installmentId);
            loan.id = loanId;

            mockPenaltyRepo.lockLoanForUpdate.mockResolvedValue({
              id: loanId,
              status: 'active',
              cached_outstanding_paise: 500000n,
            });
            mockPenaltyRepo.getLoanForPenalty.mockResolvedValue(loan);
            mockPenaltyRepo.findAccountByCode.mockImplementation((code: string) => {
              if (code === '1100') return Promise.resolve({ id: 'acc-1100', code: '1100', name: 'Loans Receivable', category: 'asset' });
              if (code === '4003') return Promise.resolve({ id: 'acc-4003', code: '4003', name: 'Penalty Income', category: 'income' });
              return Promise.resolve(null);
            });
            mockPenaltyRepo.createPenalty.mockResolvedValue({
              id: 'penalty-1',
              loan_id: loanId,
              installment_id: installmentId,
              amount_paise: 500n,
              penalty_period: penaltyPeriod,
              is_paid: false,
              is_waived: false,
            });
            mockPenaltyRepo.updateLoanOutstanding.mockResolvedValue({});
            mockPenaltyRepo.updateLoanStatus.mockResolvedValue({});
            mockPenaltyRepo.createStatusHistory.mockResolvedValue({});

            // First call: penalty does not exist yet
            mockPenaltyRepo.penaltyExists.mockResolvedValueOnce(false);
            // Second call: penalty now exists
            mockPenaltyRepo.penaltyExists.mockResolvedValueOnce(true);

            const service = new PenaltyService(
              mockPrisma as never,
              mockPenaltyRepo as never,
              mockAccountingService as never,
              mockAuditService as never,
              mockLoanService as never,
            );

            const dto = {
              loanId,
              installmentId,
              penaltyPeriod,
              referenceDate: '2024-06-15',
            };

            // First posting succeeds
            const result = await service.calculateAndPost(dto, 'user-1', 'manager');
            expect(result.penalty).toBeDefined();

            // Second posting with same tuple is rejected
            await expect(
              service.calculateAndPost(dto, 'user-1', 'manager'),
            ).rejects.toThrow(ConflictError);
          },
        ),
        { numRuns: 200 },
      );
    },
  );
});
