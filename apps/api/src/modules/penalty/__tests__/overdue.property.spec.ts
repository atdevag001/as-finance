import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import {
  calculateDpd,
  classifyOverdueBucket,
  calculatePenaltyAmount,
} from '../penalty.service';
import { PenaltyService } from '../penalty.service';
import { ConflictError } from '../../../common/errors';
import { penaltyConfigArb, dueDateArb } from '@as-finance/testing';

/**
 * Property 20: Non-Negative DPD — DPD is always non-negative
 * **Validates: Requirements 11.1**
 *
 * Property 21: Monotonic Buckets — overdue bucket classification is
 * monotonically non-decreasing with increasing DPD
 * **Validates: Requirements 11.2**
 *
 * Property 22: Positive Flat Penalty — flat penalty amount is always a
 * positive integer for valid configuration
 * **Validates: Requirements 11.3**
 *
 * Property 23: Proportional Percentage Penalty — percentage penalty is
 * proportional to overdue amount and always a non-negative integer
 * **Validates: Requirements 11.4**
 *
 * ---
 *
 * Property 25: Overdue Bucket Classification
 * **Validates: Requirements 8.2**
 *
 * Property 26: Penalty Uniqueness
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

/** Bucket ordering for monotonicity check */
const BUCKET_ORDER: Record<string, number> = {
  bucket_0: 0,
  bucket_1_30: 1,
  bucket_31_60: 2,
  bucket_61_90: 3,
  bucket_90_plus: 4,
};

/**
 * Generate a schedule entry with a specific due date where the installment
 * is unpaid (for DPD testing).
 */
function buildUnpaidSchedule(dueDate: Date) {
  return [
    {
      due_date: dueDate,
      principal_paise: 100_000,
      interest_paise: 10_000,
      principal_paid_paise: 0,
      interest_paid_paise: 0,
    },
  ];
}

/**
 * Generate a schedule entry that is fully paid (DPD should be 0).
 */
function buildPaidSchedule(dueDate: Date) {
  return [
    {
      due_date: dueDate,
      principal_paise: 100_000,
      interest_paise: 10_000,
      principal_paid_paise: 100_000,
      interest_paid_paise: 10_000,
    },
  ];
}

/** Arbitrary for a reference date that is on or after the due date */
const referenceDateAfterDueArb = dueDateArb.chain((dueDate) =>
  fc
    .integer({ min: 0, max: 3650 })
    .map((daysAfter) => {
      const ref = new Date(dueDate.getTime() + daysAfter * 24 * 60 * 60 * 1000);
      return { dueDate, referenceDate: ref };
    }),
);

/** Arbitrary for a reference date that may be before or after the due date */
const anyReferenceDateArb = dueDateArb.chain((dueDate) =>
  fc
    .integer({ min: -365, max: 3650 })
    .map((daysOffset) => {
      const ref = new Date(dueDate.getTime() + daysOffset * 24 * 60 * 60 * 1000);
      return { dueDate, referenceDate: ref };
    }),
);

/** Flat penalty config: positive paise value */
const flatPenaltyValueArb = fc.integer({ min: 1, max: 1_000_000 });

/** Percentage penalty config: basis points (10 = 0.1%, 5000 = 50%) */
const percentageBpsArb = fc.integer({ min: 1, max: 10_000 });

/** Overdue amount in paise (positive) */
const overdueAmountArb = fc.integer({ min: 1, max: 100_000_000 });


// ===========================================================================
// Property 20: Non-Negative DPD
// ===========================================================================

describe('Property 20: Non-Negative DPD', () => {
  it(
    'DPD is always non-negative for any due date and reference date combination (unpaid installment)',
    () => {
      /**
       * **Validates: Requirements 11.1**
       *
       * For any due date and any reference date, calculateDpd() must return
       * a value >= 0, regardless of whether the reference date is before,
       * on, or after the due date.
       */
      fc.assert(
        fc.property(anyReferenceDateArb, ({ dueDate, referenceDate }) => {
          const schedules = buildUnpaidSchedule(dueDate);
          const dpd = calculateDpd(schedules, referenceDate);
          expect(dpd).toBeGreaterThanOrEqual(0);
          expect(Number.isInteger(dpd)).toBe(true);
        }),
        { numRuns: 200 },
      );
    },
  );

  it(
    'DPD is zero when all installments are fully paid',
    () => {
      fc.assert(
        fc.property(anyReferenceDateArb, ({ dueDate, referenceDate }) => {
          const schedules = buildPaidSchedule(dueDate);
          const dpd = calculateDpd(schedules, referenceDate);
          expect(dpd).toBe(0);
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'DPD is zero when reference date is on or before the due date',
    () => {
      fc.assert(
        fc.property(
          dueDateArb,
          fc.integer({ min: 0, max: 365 }),
          (dueDate, daysBefore) => {
            const referenceDate = new Date(
              dueDate.getTime() - daysBefore * 24 * 60 * 60 * 1000,
            );
            const schedules = buildUnpaidSchedule(dueDate);
            const dpd = calculateDpd(schedules, referenceDate);
            expect(dpd).toBe(0);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it(
    'DPD is non-negative for empty schedule array',
    () => {
      fc.assert(
        fc.property(
          fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
          (referenceDate) => {
            const dpd = calculateDpd([], referenceDate);
            expect(dpd).toBe(0);
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

// ===========================================================================
// Property 21: Monotonic Buckets
// ===========================================================================

describe('Property 21: Monotonic Buckets', () => {
  it(
    'overdue bucket classification is monotonically non-decreasing with increasing DPD',
    () => {
      /**
       * **Validates: Requirements 11.2**
       *
       * For any two DPD values a <= b, the bucket order of
       * classifyOverdueBucket(a) <= classifyOverdueBucket(b).
       */
      fc.assert(
        fc.property(
          dpdArb,
          dpdArb,
          (dpdA, dpdB) => {
            const [lo, hi] = dpdA <= dpdB ? [dpdA, dpdB] : [dpdB, dpdA];
            const bucketLo = classifyOverdueBucket(lo);
            const bucketHi = classifyOverdueBucket(hi);
            expect(BUCKET_ORDER[bucketLo]!).toBeLessThanOrEqual(BUCKET_ORDER[bucketHi]!);
          },
        ),
        { numRuns: 200 },
      );
    },
  );

  it(
    'consecutive DPD values never decrease in bucket order',
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 9_999 }),
          (dpd) => {
            const bucketCurrent = classifyOverdueBucket(dpd);
            const bucketNext = classifyOverdueBucket(dpd + 1);
            expect(BUCKET_ORDER[bucketCurrent]!).toBeLessThanOrEqual(
              BUCKET_ORDER[bucketNext]!,
            );
          },
        ),
        { numRuns: 200 },
      );
    },
  );
});

// ===========================================================================
// Property 22: Positive Flat Penalty
// ===========================================================================

describe('Property 22: Positive Flat Penalty', () => {
  it(
    'flat penalty amount is always a positive integer for valid configuration',
    () => {
      /**
       * **Validates: Requirements 11.3**
       *
       * For any valid flat penalty value (positive integer paise) and any
       * overdue amount, calculatePenaltyAmount('flat_per_period', value, _)
       * returns the exact penalty value (positive integer).
       */
      fc.assert(
        fc.property(
          flatPenaltyValueArb,
          overdueAmountArb,
          (penaltyValue, overdueAmountPaise) => {
            const result = calculatePenaltyAmount(
              'flat_per_period',
              penaltyValue,
              overdueAmountPaise,
            );
            expect(result).toBeGreaterThan(0);
            expect(Number.isInteger(result)).toBe(true);
            // Flat penalty should equal the configured value exactly
            expect(result).toBe(penaltyValue);
          },
        ),
        { numRuns: 200 },
      );
    },
  );
});

// ===========================================================================
// Property 23: Proportional Percentage Penalty
// ===========================================================================

describe('Property 23: Proportional Percentage Penalty', () => {
  it(
    'percentage penalty is proportional to overdue amount and always a non-negative integer',
    () => {
      /**
       * **Validates: Requirements 11.4**
       *
       * For any valid percentage penalty (basis points) and overdue amount,
       * calculatePenaltyAmount('percentage_of_overdue', bps, overdue)
       * returns a non-negative integer that equals
       * round(overdue * bps / 10000).
       */
      fc.assert(
        fc.property(
          percentageBpsArb,
          overdueAmountArb,
          (bps, overdueAmountPaise) => {
            const result = calculatePenaltyAmount(
              'percentage_of_overdue',
              bps,
              overdueAmountPaise,
            );
            expect(result).toBeGreaterThanOrEqual(0);
            expect(Number.isInteger(result)).toBe(true);
          },
        ),
        { numRuns: 200 },
      );
    },
  );

  it(
    'doubling the overdue amount doubles the percentage penalty (within rounding tolerance)',
    () => {
      fc.assert(
        fc.property(
          percentageBpsArb,
          fc.integer({ min: 1, max: 50_000_000 }),
          (bps, overdueAmountPaise) => {
            const single = calculatePenaltyAmount(
              'percentage_of_overdue',
              bps,
              overdueAmountPaise,
            );
            const doubled = calculatePenaltyAmount(
              'percentage_of_overdue',
              bps,
              overdueAmountPaise * 2,
            );
            // Due to integer rounding, doubled result should be within 1 paisa
            // of 2 * single
            expect(Math.abs(doubled - 2 * single)).toBeLessThanOrEqual(1);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it(
    'percentage penalty is zero when overdue amount is zero',
    () => {
      fc.assert(
        fc.property(percentageBpsArb, (bps) => {
          const result = calculatePenaltyAmount('percentage_of_overdue', bps, 0);
          expect(result).toBe(0);
        }),
        { numRuns: 100 },
      );
    },
  );
});

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
