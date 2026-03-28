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
 * Apply an allocation result to installments and penalties in-place,
 * returning deep-copied updated state.
 */
function applyAllocation(
  installments: InstallmentState[],
  penalties: PenaltyState[],
  result: ReturnType<typeof allocate>,
): { installments: InstallmentState[]; penalties: PenaltyState[] } {
  // Deep copy
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

// ─── Property 8: Outstanding Balance Accuracy ───────────────────────────────

/**
 * Feature: as-finance-loan-management-system, Property 8: Outstanding Balance Accuracy
 *
 * For all valid sequences of collections/reversals, outstanding == total_payable
 * - sum(valid_allocated_payments) at every point. Outstanding SHALL never
 * silently drift from this derived value.
 *
 * We generate a loan with random installments and penalties, then apply a
 * sequence of random valid payments using the pure allocate() function.
 * After each payment, we verify the invariant holds.
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
          if (totalPayable === 0) return; // skip degenerate case

          let currentInstallments = installments.map((i) => ({ ...i }));
          let currentPenalties = penalties.map((p) => ({ ...p }));
          let sumAllocated = 0;

          for (const fraction of fractions) {
            const currentOutstanding = computeTotalOutstanding(
              currentInstallments,
              currentPenalties,
            );
            if (currentOutstanding <= 0) break; // fully paid

            // Payment is a fraction of current outstanding (always valid — won't exceed)
            const paymentAmount = Math.max(1, Math.floor(currentOutstanding * fraction));

            const result = allocate({
              amountPaise: paymentAmount,
              installments: currentInstallments,
              pendingPenalties: currentPenalties,
              allocationOrder: DEFAULT_ORDER,
            });

            // Sum of allocated (excluding excess) is what actually reduced outstanding
            const allocated =
              result.totalPenaltyAllocated +
              result.totalInterestAllocated +
              result.totalPrincipalAllocated;

            sumAllocated += allocated;

            // Apply allocation to state
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

          // Full payment should allocate everything with zero excess
          expect(allocated).toBe(totalPayable);
          expect(result.excessAmount).toBe(0);

          // After applying, outstanding should be exactly zero
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
 * For all loan states after any valid operation sequence, outstanding ≥ 0.
 * Collections causing negative outstanding are rejected. At the allocation
 * engine level, any payment exceeding total outstanding is tracked as
 * excessAmount — the allocated portion never exceeds what's owed.
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

            // Apply allocation
            const updated = applyAllocation(
              currentInstallments,
              currentPenalties,
              result,
            );
            currentInstallments = updated.installments;
            currentPenalties = updated.penalties;

            // INVARIANT: outstanding >= 0 after every payment
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

          // Pay more than total outstanding
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

          // Allocated portion must not exceed total payable
          expect(allocated).toBeLessThanOrEqual(totalPayable);

          // Excess captures the overpayment
          expect(result.excessAmount).toBe(overpayment - allocated);
          expect(result.excessAmount).toBeGreaterThan(0);

          // After applying allocation, outstanding must be >= 0
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

            // INVARIANT: no installment's paid exceeds its owed
            for (const inst of currentInstallments) {
              expect(inst.principalPaidPaise).toBeLessThanOrEqual(inst.principalPaise);
              expect(inst.interestPaidPaise).toBeLessThanOrEqual(inst.interestPaise);
            }

            // INVARIANT: no penalty's paid exceeds its amount
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
