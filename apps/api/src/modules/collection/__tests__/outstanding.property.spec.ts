import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  allocate,
  type InstallmentState,
  type PenaltyState,
  type ComponentOrder,
} from '../allocation-engine';

// ─── Shared Generators ─────────────────────────────────────────────────────

const DEFAULT_ORDER: ComponentOrder[] = ['penalty', 'interest', 'principal'];

/** Generate a single installment with no payments yet applied */
const freshInstallmentArb = (index: number): fc.Arbitrary<InstallmentState> =>
  fc
    .record({
      principalPaise: fc.integer({ min: 1_000, max: 500_000 }),
      interestPaise: fc.integer({ min: 100, max: 100_000 }),
    })
    .map(({ principalPaise, interestPaise }) => ({
      installmentId: `inst-${index}`,
      installmentNumber: index + 1,
      dueDate: new Date(2024, 0, 15 + index * 30),
      principalPaise,
      interestPaise,
      principalPaidPaise: 0,
      interestPaidPaise: 0,
    }));

/** Generate 1–6 fresh installments ordered by due date */
const freshInstallmentsArb: fc.Arbitrary<InstallmentState[]> = fc
  .integer({ min: 1, max: 6 })
  .chain((count) =>
    fc.tuple(...Array.from({ length: count }, (_, i) => freshInstallmentArb(i))),
  )
  .map((arr) => [...arr].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime()));

/** Generate a single fresh penalty */
const freshPenaltyArb = (index: number): fc.Arbitrary<PenaltyState> =>
  fc.integer({ min: 100, max: 30_000 }).map((amountPaise) => ({
    penaltyId: `pen-${index}`,
    amountPaise,
    paidPaise: 0,
  }));

/** Generate 0–3 fresh penalties */
const freshPenaltiesArb: fc.Arbitrary<PenaltyState[]> = fc
  .integer({ min: 0, max: 3 })
  .chain((count) =>
    fc.tuple(...Array.from({ length: count }, (_, i) => freshPenaltyArb(i))),
  );

/** Generate 1–5 payment fractions that sum to <= 1.0, used to split total outstanding into payment sequence */
const paymentFractionsArb: fc.Arbitrary<number[]> = fc
  .integer({ min: 1, max: 5 })
  .chain((count) =>
    fc.array(fc.integer({ min: 1, max: 100 }), { minLength: count, maxLength: count }),
  )
  .map((rawWeights) => {
    const total = rawWeights.reduce((s, w) => s + w, 0);
    // Scale so sum of fractions <= 1.0 (leave some room so we don't overshoot)
    return rawWeights.map((w) => (w / total) * 0.95);
  });

/**
 * Compute total outstanding across installments and penalties.
 */
function computeTotalOutstanding(
  installments: InstallmentState[],
  penalties: PenaltyState[],
): number {
  let total = 0;
  for (const inst of installments) {
    total += inst.principalPaise - inst.principalPaidPaise;
    total += inst.interestPaise - inst.interestPaidPaise;
  }
  for (const pen of penalties) {
    total += pen.amountPaise - pen.paidPaise;
  }
  return total;
}

/**
 * Compute total payable (the full amount before any payments).
 */
function computeTotalPayable(
  installments: InstallmentState[],
  penalties: PenaltyState[],
): number {
  let total = 0;
  for (const inst of installments) {
    total += inst.principalPaise;
    total += inst.interestPaise;
  }
  for (const pen of penalties) {
    total += pen.amountPaise;
  }
  return total;
}

/**
 * Apply an allocation result to installments and penalties,
 * returning deep-copied updated state.
 */
function applyAllocation(
  installments: InstallmentState[],
  penalties: PenaltyState[],
  result: ReturnType<typeof allocate>,
): { installments: InstallmentState[]; penalties: PenaltyState[] } {
  const newInstallments = installments.map((inst) => ({ ...inst }));
  const newPenalties = penalties.map((pen) => ({ ...pen }));

  for (const line of result.allocations) {
    if (line.component === 'penalty' && line.penaltyId) {
      const pen = newPenalties.find((p) => p.penaltyId === line.penaltyId);
      if (pen) pen.paidPaise += line.amountPaise;
    }
    if (line.component === 'interest' && line.installmentId) {
      const inst = newInstallments.find((i) => i.installmentId === line.installmentId);
      if (inst) inst.interestPaidPaise += line.amountPaise;
    }
    if (line.component === 'principal' && line.installmentId) {
      const inst = newInstallments.find((i) => i.installmentId === line.installmentId);
      if (inst) inst.principalPaidPaise += line.amountPaise;
    }
  }

  return { installments: newInstallments, penalties: newPenalties };
}

/**
 * Reverse an allocation: subtract paid amounts that were added by the allocation.
 * Returns deep-copied updated state.
 */
function reverseAllocation(
  installments: InstallmentState[],
  penalties: PenaltyState[],
  result: ReturnType<typeof allocate>,
): { installments: InstallmentState[]; penalties: PenaltyState[] } {
  const newInstallments = installments.map((inst) => ({ ...inst }));
  const newPenalties = penalties.map((pen) => ({ ...pen }));

  for (const line of result.allocations) {
    if (line.component === 'penalty' && line.penaltyId) {
      const pen = newPenalties.find((p) => p.penaltyId === line.penaltyId);
      if (pen) pen.paidPaise -= line.amountPaise;
    }
    if (line.component === 'interest' && line.installmentId) {
      const inst = newInstallments.find((i) => i.installmentId === line.installmentId);
      if (inst) inst.interestPaidPaise -= line.amountPaise;
    }
    if (line.component === 'principal' && line.installmentId) {
      const inst = newInstallments.find((i) => i.installmentId === line.installmentId);
      if (inst) inst.principalPaidPaise -= line.amountPaise;
    }
  }

  return { installments: newInstallments, penalties: newPenalties };
}

// ─── Operation Sequence Generator for Collection + Reversal ─────────────────

type Operation =
  | { type: 'collect'; fraction: number }
  | { type: 'reverse'; targetIndex: number };

/**
 * Generate a sequence of 2–8 operations mixing collections and reversals.
 * Collections use a fraction of current outstanding; reversals target a
 * previous non-reversed collection by index (modulo available).
 */
const operationSequenceArb: fc.Arbitrary<Operation[]> = fc
  .integer({ min: 2, max: 8 })
  .chain((count) =>
    fc.array(
      fc.oneof(
        {
          weight: 3,
          arbitrary: fc
            .double({ min: 0.05, max: 0.6, noNaN: true })
            .map((fraction): Operation => ({ type: 'collect', fraction })),
        },
        {
          weight: 1,
          arbitrary: fc
            .nat({ max: 20 })
            .map((targetIndex): Operation => ({ type: 'reverse', targetIndex })),
        },
      ),
      { minLength: count, maxLength: count },
    ),
  );

// ─── Property 8: Outstanding Balance Accuracy ───────────────────────────────

/**
 * Feature: as-finance-loan-management-system, Property 8: Outstanding Balance Accuracy
 *
 * For all valid sequences of collections, outstanding == total_payable
 * - sum(valid_allocated_payments) at every point. Outstanding SHALL never
 * silently drift from this derived value.
 *
 * **Validates: Requirements 6.11, 25.2**
 */
describe('Property 8: Outstanding Balance Accuracy', () => {
  it('outstanding == total_payable - sum(allocated) after every payment in a sequence', () => {
    fc.assert(
      fc.property(
        freshInstallmentsArb,
        freshPenaltiesArb,
        paymentFractionsArb,
        (installments, penalties, fractions) => {
          const totalPayable = computeTotalPayable(installments, penalties);
          if (totalPayable === 0) return;

          let currentInstallments = installments.map((i) => ({ ...i }));
          let currentPenalties = penalties.map((p) => ({ ...p }));
          let sumAllocated = 0;

          for (const fraction of fractions) {
            const currentOutstanding = computeTotalOutstanding(
              currentInstallments,
              currentPenalties,
            );
            if (currentOutstanding <= 0) break;

            const paymentAmount = Math.max(1, Math.floor(currentOutstanding * fraction));

            const result = allocate({
              amountPaise: paymentAmount,
              installments: currentInstallments,
              pendingPenalties: currentPenalties,
              allocationOrder: DEFAULT_ORDER,
            });

            const allocated =
              result.totalPenaltyAllocated +
              result.totalInterestAllocated +
              result.totalPrincipalAllocated;

            sumAllocated += allocated;

            const updated = applyAllocation(
              currentInstallments,
              currentPenalties,
              result,
            );
            currentInstallments = updated.installments;
            currentPenalties = updated.penalties;

            // INVARIANT: outstanding == total_payable - sum(all allocated so far)
            const derivedOutstanding = totalPayable - sumAllocated;
            const actualOutstanding = computeTotalOutstanding(
              currentInstallments,
              currentPenalties,
            );

            expect(actualOutstanding).toBe(derivedOutstanding);
          }
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('single full payment zeroes outstanding exactly', () => {
    fc.assert(
      fc.property(
        freshInstallmentsArb,
        freshPenaltiesArb,
        (installments, penalties) => {
          const totalPayable = computeTotalPayable(installments, penalties);
          if (totalPayable === 0) return;

          const result = allocate({
            amountPaise: totalPayable,
            installments,
            pendingPenalties: penalties,
            allocationOrder: DEFAULT_ORDER,
          });

          const allocated =
            result.totalPenaltyAllocated +
            result.totalInterestAllocated +
            result.totalPrincipalAllocated;

          expect(allocated).toBe(totalPayable);
          expect(result.excessAmount).toBe(0);

          const updated = applyAllocation(installments, penalties, result);
          const remaining = computeTotalOutstanding(
            updated.installments,
            updated.penalties,
          );
          expect(remaining).toBe(0);
        },
      ),
      { numRuns: 1000 },
    );
  });
});

// ─── Property 9: Non-Negative Outstanding ───────────────────────────────────

/**
 * Feature: as-finance-loan-management-system, Property 9: Non-Negative Outstanding
 *
 * For all loan states after any valid operation sequence, outstanding >= 0.
 * At the allocation engine level, any payment exceeding total outstanding
 * is tracked as excessAmount — the allocated portion never exceeds what's owed.
 *
 * **Validates: Requirements 6.12, 25.8**
 */
describe('Property 9: Non-Negative Outstanding', () => {
  it('outstanding never goes negative after any valid payment sequence', () => {
    fc.assert(
      fc.property(
        freshInstallmentsArb,
        freshPenaltiesArb,
        paymentFractionsArb,
        (installments, penalties, fractions) => {
          const totalPayable = computeTotalPayable(installments, penalties);
          if (totalPayable === 0) return;

          let currentInstallments = installments.map((i) => ({ ...i }));
          let currentPenalties = penalties.map((p) => ({ ...p }));

          for (const fraction of fractions) {
            const currentOutstanding = computeTotalOutstanding(
              currentInstallments,
              currentPenalties,
            );
            if (currentOutstanding <= 0) break;

            const paymentAmount = Math.max(1, Math.floor(currentOutstanding * fraction));

            const result = allocate({
              amountPaise: paymentAmount,
              installments: currentInstallments,
              pendingPenalties: currentPenalties,
              allocationOrder: DEFAULT_ORDER,
            });

            const updated = applyAllocation(
              currentInstallments,
              currentPenalties,
              result,
            );
            currentInstallments = updated.installments;
            currentPenalties = updated.penalties;

            const outstanding = computeTotalOutstanding(
              currentInstallments,
              currentPenalties,
            );
            expect(outstanding).toBeGreaterThanOrEqual(0);
          }
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('overpayment produces excess, never negative outstanding', () => {
    fc.assert(
      fc.property(
        freshInstallmentsArb,
        freshPenaltiesArb,
        fc.integer({ min: 1, max: 5_000_000 }),
        (installments, penalties, extraPaise) => {
          const totalPayable = computeTotalPayable(installments, penalties);
          if (totalPayable === 0) return;

          const overpayment = totalPayable + extraPaise;

          const result = allocate({
            amountPaise: overpayment,
            installments,
            pendingPenalties: penalties,
            allocationOrder: DEFAULT_ORDER,
          });

          const allocated =
            result.totalPenaltyAllocated +
            result.totalInterestAllocated +
            result.totalPrincipalAllocated;

          expect(allocated).toBeLessThanOrEqual(totalPayable);
          expect(result.excessAmount).toBe(overpayment - allocated);
          expect(result.excessAmount).toBeGreaterThan(0);

          const updated = applyAllocation(installments, penalties, result);
          const remaining = computeTotalOutstanding(
            updated.installments,
            updated.penalties,
          );
          expect(remaining).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('each installment paid amounts never exceed owed amounts', () => {
    fc.assert(
      fc.property(
        freshInstallmentsArb,
        freshPenaltiesArb,
        paymentFractionsArb,
        (installments, penalties, fractions) => {
          const totalPayable = computeTotalPayable(installments, penalties);
          if (totalPayable === 0) return;

          let currentInstallments = installments.map((i) => ({ ...i }));
          let currentPenalties = penalties.map((p) => ({ ...p }));

          for (const fraction of fractions) {
            const currentOutstanding = computeTotalOutstanding(
              currentInstallments,
              currentPenalties,
            );
            if (currentOutstanding <= 0) break;

            const paymentAmount = Math.max(1, Math.floor(currentOutstanding * fraction));

            const result = allocate({
              amountPaise: paymentAmount,
              installments: currentInstallments,
              pendingPenalties: currentPenalties,
              allocationOrder: DEFAULT_ORDER,
            });

            const updated = applyAllocation(
              currentInstallments,
              currentPenalties,
              result,
            );
            currentInstallments = updated.installments;
            currentPenalties = updated.penalties;

            for (const inst of currentInstallments) {
              expect(inst.principalPaidPaise).toBeLessThanOrEqual(inst.principalPaise);
              expect(inst.interestPaidPaise).toBeLessThanOrEqual(inst.interestPaise);
            }

            for (const pen of currentPenalties) {
              expect(pen.paidPaise).toBeLessThanOrEqual(pen.amountPaise);
            }
          }
        },
      ),
      { numRuns: 1000 },
    );
  });
});

// ─── Property 14: Outstanding Drift ─────────────────────────────────────────

/**
 * Property 14: Outstanding Drift
 *
 * For any valid sequence of collection and reversal operations on a loan,
 * the cached_outstanding equals total_payable minus net allocated payments.
 * Net allocated = sum of all collection allocations minus sum of all reversed
 * collection allocations. This ensures outstanding never silently drifts
 * even when reversals are interleaved with collections.
 *
 * **Validates: Requirements 75.3, 75.5, 75.6**
 */
describe('Property 14: Outstanding Drift', () => {
  it('cached_outstanding equals total_payable minus net allocated payments for any valid operation sequence', () => {
    fc.assert(
      fc.property(
        freshInstallmentsArb,
        freshPenaltiesArb,
        operationSequenceArb,
        (installments, penalties, operations) => {
          const totalPayable = computeTotalPayable(installments, penalties);
          if (totalPayable === 0) return;

          let currentInstallments = installments.map((i) => ({ ...i }));
          let currentPenalties = penalties.map((p) => ({ ...p }));
          let netAllocated = 0;

          // Track collection results for potential reversal
          const collectionHistory: {
            result: ReturnType<typeof allocate>;
            allocated: number;
            reversed: boolean;
          }[] = [];

          for (const op of operations) {
            if (op.type === 'collect') {
              const currentOutstanding = computeTotalOutstanding(
                currentInstallments,
                currentPenalties,
              );
              if (currentOutstanding <= 0) continue;

              const paymentAmount = Math.max(
                1,
                Math.floor(currentOutstanding * op.fraction),
              );

              const result = allocate({
                amountPaise: paymentAmount,
                installments: currentInstallments,
                pendingPenalties: currentPenalties,
                allocationOrder: DEFAULT_ORDER,
              });

              const allocated =
                result.totalPenaltyAllocated +
                result.totalInterestAllocated +
                result.totalPrincipalAllocated;

              netAllocated += allocated;

              const updated = applyAllocation(
                currentInstallments,
                currentPenalties,
                result,
              );
              currentInstallments = updated.installments;
              currentPenalties = updated.penalties;

              collectionHistory.push({ result, allocated, reversed: false });
            } else {
              // Reverse a previous non-reversed collection
              const nonReversed = collectionHistory.filter((c) => !c.reversed);
              if (nonReversed.length === 0) continue;

              const targetIdx = op.targetIndex % nonReversed.length;
              const target = nonReversed[targetIdx]!;

              const restored = reverseAllocation(
                currentInstallments,
                currentPenalties,
                target.result,
              );
              currentInstallments = restored.installments;
              currentPenalties = restored.penalties;

              netAllocated -= target.allocated;
              target.reversed = true;
            }

            // INVARIANT: outstanding == total_payable - net_allocated
            const derivedOutstanding = totalPayable - netAllocated;
            const actualOutstanding = computeTotalOutstanding(
              currentInstallments,
              currentPenalties,
            );

            expect(actualOutstanding).toBe(derivedOutstanding);
          }
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('full collection then full reversal restores original outstanding', () => {
    fc.assert(
      fc.property(
        freshInstallmentsArb,
        freshPenaltiesArb,
        (installments, penalties) => {
          const totalPayable = computeTotalPayable(installments, penalties);
          if (totalPayable === 0) return;

          const result = allocate({
            amountPaise: totalPayable,
            installments,
            pendingPenalties: penalties,
            allocationOrder: DEFAULT_ORDER,
          });

          const afterCollect = applyAllocation(installments, penalties, result);
          expect(
            computeTotalOutstanding(afterCollect.installments, afterCollect.penalties),
          ).toBe(0);

          // Reverse the collection — outstanding should restore to original
          const afterReverse = reverseAllocation(
            afterCollect.installments,
            afterCollect.penalties,
            result,
          );

          const restoredOutstanding = computeTotalOutstanding(
            afterReverse.installments,
            afterReverse.penalties,
          );
          expect(restoredOutstanding).toBe(totalPayable);
        },
      ),
      { numRuns: 1000 },
    );
  });
});

// ─── Property 15: Non-Negative Outstanding (Collection + Reversal) ──────────

/**
 * Property 15: Non-Negative Outstanding
 *
 * Outstanding never becomes negative after any valid sequence of collection
 * and reversal operations. Collections reduce outstanding (capped at zero
 * via excess), and reversals restore it. At no point should outstanding
 * drop below zero.
 *
 * **Validates: Requirements 75.3, 75.5, 75.6**
 */
describe('Property 15: Non-Negative Outstanding (Collection + Reversal)', () => {
  it('outstanding never becomes negative after valid collection and reversal operations', () => {
    fc.assert(
      fc.property(
        freshInstallmentsArb,
        freshPenaltiesArb,
        operationSequenceArb,
        (installments, penalties, operations) => {
          const totalPayable = computeTotalPayable(installments, penalties);
          if (totalPayable === 0) return;

          let currentInstallments = installments.map((i) => ({ ...i }));
          let currentPenalties = penalties.map((p) => ({ ...p }));

          const collectionHistory: {
            result: ReturnType<typeof allocate>;
            reversed: boolean;
          }[] = [];

          for (const op of operations) {
            if (op.type === 'collect') {
              const currentOutstanding = computeTotalOutstanding(
                currentInstallments,
                currentPenalties,
              );
              if (currentOutstanding <= 0) continue;

              const paymentAmount = Math.max(
                1,
                Math.floor(currentOutstanding * op.fraction),
              );

              const result = allocate({
                amountPaise: paymentAmount,
                installments: currentInstallments,
                pendingPenalties: currentPenalties,
                allocationOrder: DEFAULT_ORDER,
              });

              const updated = applyAllocation(
                currentInstallments,
                currentPenalties,
                result,
              );
              currentInstallments = updated.installments;
              currentPenalties = updated.penalties;

              collectionHistory.push({ result, reversed: false });
            } else {
              const nonReversed = collectionHistory.filter((c) => !c.reversed);
              if (nonReversed.length === 0) continue;

              const targetIdx = op.targetIndex % nonReversed.length;
              const target = nonReversed[targetIdx]!;

              const restored = reverseAllocation(
                currentInstallments,
                currentPenalties,
                target.result,
              );
              currentInstallments = restored.installments;
              currentPenalties = restored.penalties;

              target.reversed = true;
            }

            // INVARIANT: outstanding >= 0 after every operation
            const outstanding = computeTotalOutstanding(
              currentInstallments,
              currentPenalties,
            );
            expect(outstanding).toBeGreaterThanOrEqual(0);
          }
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('outstanding never exceeds total_payable after any operation sequence', () => {
    fc.assert(
      fc.property(
        freshInstallmentsArb,
        freshPenaltiesArb,
        operationSequenceArb,
        (installments, penalties, operations) => {
          const totalPayable = computeTotalPayable(installments, penalties);
          if (totalPayable === 0) return;

          let currentInstallments = installments.map((i) => ({ ...i }));
          let currentPenalties = penalties.map((p) => ({ ...p }));

          const collectionHistory: {
            result: ReturnType<typeof allocate>;
            reversed: boolean;
          }[] = [];

          for (const op of operations) {
            if (op.type === 'collect') {
              const currentOutstanding = computeTotalOutstanding(
                currentInstallments,
                currentPenalties,
              );
              if (currentOutstanding <= 0) continue;

              const paymentAmount = Math.max(
                1,
                Math.floor(currentOutstanding * op.fraction),
              );

              const result = allocate({
                amountPaise: paymentAmount,
                installments: currentInstallments,
                pendingPenalties: currentPenalties,
                allocationOrder: DEFAULT_ORDER,
              });

              const updated = applyAllocation(
                currentInstallments,
                currentPenalties,
                result,
              );
              currentInstallments = updated.installments;
              currentPenalties = updated.penalties;

              collectionHistory.push({ result, reversed: false });
            } else {
              const nonReversed = collectionHistory.filter((c) => !c.reversed);
              if (nonReversed.length === 0) continue;

              const targetIdx = op.targetIndex % nonReversed.length;
              const target = nonReversed[targetIdx]!;

              const restored = reverseAllocation(
                currentInstallments,
                currentPenalties,
                target.result,
              );
              currentInstallments = restored.installments;
              currentPenalties = restored.penalties;

              target.reversed = true;
            }

            // INVARIANT: outstanding <= total_payable (can't owe more than original)
            const outstanding = computeTotalOutstanding(
              currentInstallments,
              currentPenalties,
            );
            expect(outstanding).toBeLessThanOrEqual(totalPayable);
          }
        },
      ),
      { numRuns: 1000 },
    );
  });
});
