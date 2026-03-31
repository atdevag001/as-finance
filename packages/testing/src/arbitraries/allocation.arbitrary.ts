/**
 * Allocation-related fast-check arbitraries.
 * Uses fc.chain to ensure paid amounts never exceed totals.
 */
import fc from 'fast-check';
import type { InstallmentState, PenaltyState } from '../factories/allocation-params.factory.js';

/**
 * Generates a valid InstallmentState where paid amounts ≤ total amounts.
 * Uses fc.chain so principalPaidPaise ≤ principalPaise and interestPaidPaise ≤ interestPaise.
 */
export const installmentStateArb = (index: number): fc.Arbitrary<InstallmentState> =>
  fc.record({
    principalPaise: fc.integer({ min: 100, max: 500_000 }),
    interestPaise: fc.integer({ min: 0, max: 100_000 }),
  }).chain(({ principalPaise, interestPaise }) =>
    fc.record({
      principalPaidPaise: fc.integer({ min: 0, max: principalPaise }),
      interestPaidPaise: fc.integer({ min: 0, max: interestPaise }),
    }).map(({ principalPaidPaise, interestPaidPaise }) => ({
      installmentId: `inst-${index}`,
      installmentNumber: index + 1,
      dueDate: new Date(2024, 0, 15 + index * 30),
      principalPaise,
      interestPaise,
      principalPaidPaise,
      interestPaidPaise,
    })),
  );

/** Generates an array of 1–12 valid installment states */
export const allocationParamsArb: fc.Arbitrary<{
  installments: InstallmentState[];
  penalties: PenaltyState[];
  amountPaise: number;
}> = fc.integer({ min: 1, max: 12 }).chain((count) => {
  const installmentsArb = fc.tuple(
    ...Array.from({ length: count }, (_, i) => installmentStateArb(i)),
  );
  const penaltiesArb = fc.array(
    fc.record({
      amountPaise: fc.integer({ min: 100, max: 50_000 }),
    }).chain(({ amountPaise }) =>
      fc.record({
        paidPaise: fc.integer({ min: 0, max: amountPaise }),
      }).map(({ paidPaise }) => ({
        penaltyId: `pen-${Math.random().toString(36).slice(2, 8)}`,
        amountPaise,
        paidPaise,
      })),
    ),
    { maxLength: 5 },
  );

  return fc.tuple(installmentsArb, penaltiesArb).chain(([installments, penalties]) => {
    // Max payable = sum of all outstanding components
    const maxPayable = installments.reduce(
      (sum, inst) =>
        sum +
        (inst.principalPaise - inst.principalPaidPaise) +
        (inst.interestPaise - inst.interestPaidPaise),
      0,
    ) + penalties.reduce((sum, p) => sum + (p.amountPaise - p.paidPaise), 0);

    const paymentMax = Math.max(1, maxPayable);
    return fc.integer({ min: 0, max: paymentMax }).map((amountPaise) => ({
      installments: installments as InstallmentState[],
      penalties,
      amountPaise,
    }));
  });
});
