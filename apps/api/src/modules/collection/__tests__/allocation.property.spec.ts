import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  allocate,
  type InstallmentState,
  type PenaltyState,
  type ComponentOrder,
} from '../allocation-engine';
import { allocationParamsArb } from '@as-finance/testing';

// ─── Shared Generators ─────────────────────────────────────────────────────

/** Generate a valid paise amount: 1 paisa to ₹10,00,000 */
const paiseArb = fc.integer({ min: 1, max: 10_000_000 });

/** Generate a single installment with random outstanding amounts */
const installmentArb = (index: number): fc.Arbitrary<InstallmentState> =>
  fc
    .record({
      principalPaise: fc.integer({ min: 100, max: 500_000 }),
      interestPaise: fc.integer({ min: 0, max: 100_000 }),
    })
    .chain(({ principalPaise, interestPaise }) =>
      fc
        .record({
          principalPaidPaise: fc.integer({ min: 0, max: principalPaise }),
          interestPaidPaise: fc.integer({ min: 0, max: interestPaise }),
        })
        .map(({ principalPaidPaise, interestPaidPaise }) => ({
          installmentId: `inst-${index}`,
          installmentNumber: index + 1,
          dueDate: new Date(2024, 0, 15 + index * 30), // spaced ~monthly
          principalPaise,
          interestPaise,
          principalPaidPaise,
          interestPaidPaise,
        })),
    );

/** Generate 1–8 installments ordered by due date */
const installmentsArb: fc.Arbitrary<InstallmentState[]> = fc
  .integer({ min: 1, max: 8 })
  .chain((count) => fc.tuple(...Array.from({ length: count }, (_, i) => installmentArb(i))))
  .map((arr) => [...arr].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime()));

/** Generate a single penalty with random outstanding amount */
const penaltyArb = (index: number): fc.Arbitrary<PenaltyState> =>
  fc.integer({ min: 1, max: 50_000 }).chain((amountPaise) =>
    fc.integer({ min: 0, max: amountPaise }).map((paidPaise) => ({
      penaltyId: `pen-${index}`,
      amountPaise,
      paidPaise,
    })),
  );


/** Generate 0–5 penalties ordered oldest first */
const penaltiesArb: fc.Arbitrary<PenaltyState[]> = fc
  .integer({ min: 0, max: 5 })
  .chain((count) => fc.tuple(...Array.from({ length: count }, (_, i) => penaltyArb(i))));

/** Default allocation order */
const DEFAULT_ORDER: ComponentOrder[] = ['penalty', 'interest', 'principal'];

/** All possible allocation orders (permutations of the 3 components) */
const allocationOrderArb: fc.Arbitrary<ComponentOrder[]> = fc.constantFrom(
  ['penalty', 'interest', 'principal'] as ComponentOrder[],
  ['penalty', 'principal', 'interest'] as ComponentOrder[],
  ['interest', 'penalty', 'principal'] as ComponentOrder[],
  ['interest', 'principal', 'penalty'] as ComponentOrder[],
  ['principal', 'penalty', 'interest'] as ComponentOrder[],
  ['principal', 'interest', 'penalty'] as ComponentOrder[],
);

// ─── Property 6: Allocation Preservation ────────────────────────────────────

/**
 * Feature: as-finance-loan-management-system, Property 6: Allocation Preservation
 *
 * For all valid collections against a loan, the sum of all allocation components
 * SHALL equal the collection amount exactly:
 *   sum(allocation.penalty_paise) + sum(allocation.interest_paise)
 *   + sum(allocation.principal_paise) == collection.amount_paise
 * No money is created or lost during allocation.
 *
 * The invariant: sum(allocated) + excessAmount == amountPaise
 *
 * **Validates: Requirements 6.7, 25.4**
 */
describe('Property 6: Allocation Preservation', () => {
  it('sum(penalty) + sum(interest) + sum(principal) + excess == collection amount for all valid inputs', () => {
    fc.assert(
      fc.property(
        installmentsArb,
        penaltiesArb,
        paiseArb,
        (installments, penalties, amountPaise) => {
          const result = allocate({
            amountPaise,
            installments,
            pendingPenalties: penalties,
            allocationOrder: DEFAULT_ORDER,
          });

          // Money conservation: allocated components + excess == input amount
          const totalAllocated =
            result.totalPenaltyAllocated +
            result.totalInterestAllocated +
            result.totalPrincipalAllocated +
            result.excessAmount;

          expect(totalAllocated).toBe(amountPaise);

          // Also verify that individual allocation lines sum to the component totals
          let linePenalty = 0;
          let lineInterest = 0;
          let linePrincipal = 0;
          for (const line of result.allocations) {
            switch (line.component) {
              case 'penalty':
                linePenalty += line.amountPaise;
                break;
              case 'interest':
                lineInterest += line.amountPaise;
                break;
              case 'principal':
                linePrincipal += line.amountPaise;
                break;
            }
          }
          expect(linePenalty).toBe(result.totalPenaltyAllocated);
          expect(lineInterest).toBe(result.totalInterestAllocated);
          expect(linePrincipal).toBe(result.totalPrincipalAllocated);

          // All allocation amounts must be non-negative
          for (const line of result.allocations) {
            expect(line.amountPaise).toBeGreaterThan(0);
          }

          // Excess must be non-negative
          expect(result.excessAmount).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('zero payment always produces zero allocations and zero excess', () => {
    fc.assert(
      fc.property(installmentsArb, penaltiesArb, (installments, penalties) => {
        const result = allocate({
          amountPaise: 0,
          installments,
          pendingPenalties: penalties,
          allocationOrder: DEFAULT_ORDER,
        });

        expect(result.totalPenaltyAllocated).toBe(0);
        expect(result.totalInterestAllocated).toBe(0);
        expect(result.totalPrincipalAllocated).toBe(0);
        expect(result.excessAmount).toBe(0);
        expect(result.allocations).toHaveLength(0);
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 7: Allocation Order Correctness ───────────────────────────────

/**
 * Feature: as-finance-loan-management-system, Property 7: Allocation Order Correctness
 *
 * For all valid partial or advance payments against a loan with outstanding penalties,
 * interest, and principal, the allocation engine SHALL allocate in the order:
 *   penalty (oldest first) → interest (current due, then oldest overdue)
 *   → principal (current due, then oldest overdue)
 *
 * No principal SHALL be allocated while interest remains unpaid on the same or
 * older installment, and no interest SHALL be allocated while penalties remain unpaid.
 *
 * **Validates: Requirements 6.5, 6.6**
 */
describe('Property 7: Allocation Order Correctness', () => {
  it('no principal allocated while interest remains unpaid on same/older installment', () => {
    fc.assert(
      fc.property(
        installmentsArb,
        penaltiesArb,
        paiseArb,
        (installments, penalties, amountPaise) => {
          const result = allocate({
            amountPaise,
            installments,
            pendingPenalties: penalties,
            allocationOrder: DEFAULT_ORDER,
          });

          // Build a map of interest allocated per installment
          const interestAllocated = new Map<string, number>();
          const principalAllocated = new Map<string, number>();

          for (const line of result.allocations) {
            if (!line.installmentId) continue;
            if (line.component === 'interest') {
              interestAllocated.set(
                line.installmentId,
                (interestAllocated.get(line.installmentId) ?? 0) + line.amountPaise,
              );
            }
            if (line.component === 'principal') {
              principalAllocated.set(
                line.installmentId,
                (principalAllocated.get(line.installmentId) ?? 0) + line.amountPaise,
              );
            }
          }

          // For each installment that received principal allocation,
          // verify that interest is fully paid on this and all older installments
          for (const inst of installments) {
            const princAlloc = principalAllocated.get(inst.installmentId) ?? 0;
            if (princAlloc === 0) continue;

            // Check this installment and all older (earlier due date) installments
            for (const olderInst of installments) {
              if (olderInst.dueDate > inst.dueDate) continue;

              const interestOutstanding =
                olderInst.interestPaise - olderInst.interestPaidPaise;
              const intAlloc = interestAllocated.get(olderInst.installmentId) ?? 0;
              const interestRemaining = interestOutstanding - intAlloc;

              // No interest should remain unpaid on same or older installment
              expect(interestRemaining).toBeLessThanOrEqual(0);
            }
          }
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('no interest allocated while penalties remain unpaid', () => {
    fc.assert(
      fc.property(
        installmentsArb,
        penaltiesArb,
        paiseArb,
        (installments, penalties, amountPaise) => {
          const result = allocate({
            amountPaise,
            installments,
            pendingPenalties: penalties,
            allocationOrder: DEFAULT_ORDER,
          });

          // If any interest was allocated, all penalties must be fully covered
          if (result.totalInterestAllocated > 0) {
            const totalPenaltyOutstanding = penalties.reduce(
              (sum, p) => sum + Math.max(0, p.amountPaise - p.paidPaise),
              0,
            );
            // All penalty outstanding must be covered by allocation
            expect(result.totalPenaltyAllocated).toBe(
              Math.min(totalPenaltyOutstanding, amountPaise),
            );
            // Specifically: penalty allocated must equal total penalty outstanding
            // (since interest was allocated, there was enough money for all penalties)
            expect(result.totalPenaltyAllocated).toBe(totalPenaltyOutstanding);
          }
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('allocation lines follow penalty→interest→principal component ordering', () => {
    fc.assert(
      fc.property(
        installmentsArb,
        penaltiesArb,
        paiseArb,
        (installments, penalties, amountPaise) => {
          const result = allocate({
            amountPaise,
            installments,
            pendingPenalties: penalties,
            allocationOrder: DEFAULT_ORDER,
          });

          // Verify that in the allocation lines array, all penalty lines come
          // before interest lines, and all interest lines come before principal lines
          const componentOrder: ComponentOrder[] = [];
          for (const line of result.allocations) {
            if (
              componentOrder.length === 0 ||
              componentOrder[componentOrder.length - 1] !== line.component
            ) {
              componentOrder.push(line.component);
            }
          }

          // The unique component sequence must be a subsequence of ['penalty', 'interest', 'principal']
          const validOrder: ComponentOrder[] = ['penalty', 'interest', 'principal'];
          let validIdx = 0;
          for (const comp of componentOrder) {
            while (validIdx < validOrder.length && validOrder[validIdx] !== comp) {
              validIdx++;
            }
            expect(validIdx).toBeLessThan(validOrder.length);
            validIdx++;
          }
        },
      ),
      { numRuns: 1000 },
    );
  });
});


// ─── Property 9: Money Conservation ─────────────────────────────────────────

/**
 * Property 9: Money Conservation
 *
 * For all valid AllocationParams, the sum of allocated penalty, interest,
 * principal, and excess equals the input amountPaise exactly.
 * No money is created or lost during allocation.
 *
 * **Validates: Requirements 4.1**
 */
describe('Property 9: Money Conservation', () => {
  it('totalPenalty + totalInterest + totalPrincipal + excess = input amount', () => {
    fc.assert(
      fc.property(allocationParamsArb, ({ installments, penalties, amountPaise }) => {
        const result = allocate({
          amountPaise,
          installments,
          pendingPenalties: penalties,
          allocationOrder: DEFAULT_ORDER,
        });

        const totalAllocated =
          result.totalPenaltyAllocated +
          result.totalInterestAllocated +
          result.totalPrincipalAllocated +
          result.excessAmount;

        expect(totalAllocated).toBe(amountPaise);
      }),
      { numRuns: 1000 },
    );
  });
});


// ─── Property 10: No Over-Allocation ────────────────────────────────────────

/**
 * Property 10: No Over-Allocation
 *
 * No individual allocation line exceeds the outstanding amount for its
 * target component (penalty outstanding, interest outstanding, or principal
 * outstanding per installment).
 *
 * **Validates: Requirements 4.2**
 */
describe('Property 10: No Over-Allocation', () => {
  it('no allocation line exceeds outstanding for its component', () => {
    fc.assert(
      fc.property(allocationParamsArb, ({ installments, penalties, amountPaise }) => {
        const result = allocate({
          amountPaise,
          installments,
          pendingPenalties: penalties,
          allocationOrder: DEFAULT_ORDER,
        });

        // Build maps of outstanding per component
        const penaltyOutstanding = new Map<string, number>();
        for (const p of penalties) {
          penaltyOutstanding.set(p.penaltyId, p.amountPaise - p.paidPaise);
        }

        const interestOutstanding = new Map<string, number>();
        const principalOutstanding = new Map<string, number>();
        for (const inst of installments) {
          interestOutstanding.set(inst.installmentId, inst.interestPaise - inst.interestPaidPaise);
          principalOutstanding.set(inst.installmentId, inst.principalPaise - inst.principalPaidPaise);
        }

        for (const line of result.allocations) {
          if (line.component === 'penalty' && line.penaltyId) {
            expect(line.amountPaise).toBeLessThanOrEqual(penaltyOutstanding.get(line.penaltyId)!);
          }
          if (line.component === 'interest' && line.installmentId) {
            expect(line.amountPaise).toBeLessThanOrEqual(interestOutstanding.get(line.installmentId)!);
          }
          if (line.component === 'principal' && line.installmentId) {
            expect(line.amountPaise).toBeLessThanOrEqual(principalOutstanding.get(line.installmentId)!);
          }
        }
      }),
      { numRuns: 1000 },
    );
  });
});


// ─── Property 11: Non-Negative Allocations ──────────────────────────────────

/**
 * Property 11: Non-Negative Allocations
 *
 * All allocation amounts (line items, component totals, and excess) are
 * non-negative integers. No fractional paise, no negative values.
 *
 * **Validates: Requirements 4.3**
 */
describe('Property 11: Non-Negative Allocations', () => {
  it('all allocation amounts are non-negative integers', () => {
    fc.assert(
      fc.property(allocationParamsArb, ({ installments, penalties, amountPaise }) => {
        const result = allocate({
          amountPaise,
          installments,
          pendingPenalties: penalties,
          allocationOrder: DEFAULT_ORDER,
        });

        // Component totals are non-negative integers
        expect(result.totalPenaltyAllocated).toBeGreaterThanOrEqual(0);
        expect(result.totalInterestAllocated).toBeGreaterThanOrEqual(0);
        expect(result.totalPrincipalAllocated).toBeGreaterThanOrEqual(0);
        expect(result.excessAmount).toBeGreaterThanOrEqual(0);

        expect(Number.isInteger(result.totalPenaltyAllocated)).toBe(true);
        expect(Number.isInteger(result.totalInterestAllocated)).toBe(true);
        expect(Number.isInteger(result.totalPrincipalAllocated)).toBe(true);
        expect(Number.isInteger(result.excessAmount)).toBe(true);

        // Every allocation line amount is a positive integer
        for (const line of result.allocations) {
          expect(line.amountPaise).toBeGreaterThan(0);
          expect(Number.isInteger(line.amountPaise)).toBe(true);
        }
      }),
      { numRuns: 1000 },
    );
  });
});


// ─── Property 12: Order Respect ─────────────────────────────────────────────

/**
 * Property 12: Order Respect
 *
 * The allocation order of component types in the result respects the
 * configured allocationOrder parameter. For any permutation of
 * ['penalty', 'interest', 'principal'], the allocation lines appear
 * in that configured order.
 *
 * **Validates: Requirements 4.4**
 */
describe('Property 12: Order Respect', () => {
  it('allocation order respects configured allocationOrder parameter', () => {
    fc.assert(
      fc.property(
        allocationParamsArb,
        allocationOrderArb,
        ({ installments, penalties, amountPaise }, order) => {
          const result = allocate({
            amountPaise,
            installments,
            pendingPenalties: penalties,
            allocationOrder: order,
          });

          // Extract the unique component sequence from allocation lines
          const seenComponents: ComponentOrder[] = [];
          for (const line of result.allocations) {
            if (seenComponents.length === 0 || seenComponents[seenComponents.length - 1] !== line.component) {
              seenComponents.push(line.component);
            }
          }

          // seenComponents must be a subsequence of the configured order
          let orderIdx = 0;
          for (const comp of seenComponents) {
            while (orderIdx < order.length && order[orderIdx] !== comp) {
              orderIdx++;
            }
            expect(orderIdx).toBeLessThan(order.length);
            orderIdx++;
          }
        },
      ),
      { numRuns: 1000 },
    );
  });
});


// ─── Property 13: Non-Negative Outstanding ──────────────────────────────────

/**
 * Property 13: Non-Negative Outstanding
 *
 * After allocation, the outstanding balance for every installment component
 * (interest and principal) and every penalty is non-negative. The allocation
 * engine never over-allocates beyond what is owed.
 *
 * **Validates: Requirements 4.5, 4.6**
 */
describe('Property 13: Non-Negative Outstanding', () => {
  it('outstanding after allocation is non-negative per component', () => {
    fc.assert(
      fc.property(allocationParamsArb, ({ installments, penalties, amountPaise }) => {
        const result = allocate({
          amountPaise,
          installments,
          pendingPenalties: penalties,
          allocationOrder: DEFAULT_ORDER,
        });

        // Build allocated-per-target maps
        const penaltyAllocMap = new Map<string, number>();
        const interestAllocMap = new Map<string, number>();
        const principalAllocMap = new Map<string, number>();

        for (const line of result.allocations) {
          if (line.component === 'penalty' && line.penaltyId) {
            penaltyAllocMap.set(line.penaltyId, (penaltyAllocMap.get(line.penaltyId) ?? 0) + line.amountPaise);
          }
          if (line.component === 'interest' && line.installmentId) {
            interestAllocMap.set(line.installmentId, (interestAllocMap.get(line.installmentId) ?? 0) + line.amountPaise);
          }
          if (line.component === 'principal' && line.installmentId) {
            principalAllocMap.set(line.installmentId, (principalAllocMap.get(line.installmentId) ?? 0) + line.amountPaise);
          }
        }

        // Verify non-negative outstanding for each penalty
        for (const p of penalties) {
          const allocated = penaltyAllocMap.get(p.penaltyId) ?? 0;
          const remaining = (p.amountPaise - p.paidPaise) - allocated;
          expect(remaining).toBeGreaterThanOrEqual(0);
        }

        // Verify non-negative outstanding for each installment component
        for (const inst of installments) {
          const intAllocated = interestAllocMap.get(inst.installmentId) ?? 0;
          const intRemaining = (inst.interestPaise - inst.interestPaidPaise) - intAllocated;
          expect(intRemaining).toBeGreaterThanOrEqual(0);

          const princAllocated = principalAllocMap.get(inst.installmentId) ?? 0;
          const princRemaining = (inst.principalPaise - inst.principalPaidPaise) - princAllocated;
          expect(princRemaining).toBeGreaterThanOrEqual(0);
        }
      }),
      { numRuns: 1000 },
    );
  });
});