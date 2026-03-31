import { describe, it, expect } from 'vitest';
import {
  allocate,
  type InstallmentState,
  type PenaltyState,
  type ComponentOrder,
} from '../allocation-engine';

/**
 * Outstanding Balance Drift Detection Tests (Task 26.1)
 *
 * Validates that cached_outstanding is always recomputable from
 * total_payable minus valid allocations, and that transactional
 * updates keep the cached value consistent.
 *
 * Validates: Requirements 75.1, 75.2, 75.4
 */

const DEFAULT_ORDER: ComponentOrder[] = ['penalty', 'interest', 'principal'];

function buildInstallments(count: number): InstallmentState[] {
  return Array.from({ length: count }, (_, i) => ({
    installmentId: `inst-${i}`,
    installmentNumber: i + 1,
    dueDate: new Date(2024, 0, 15 + i * 30),
    principalPaise: 10_000,
    interestPaise: 1_000,
    principalPaidPaise: 0,
    interestPaidPaise: 0,
  }));
}

function buildPenalties(count: number): PenaltyState[] {
  return Array.from({ length: count }, (_, i) => ({
    penaltyId: `pen-${i}`,
    amountPaise: 500,
    paidPaise: 0,
  }));
}

function computeOutstanding(installments: InstallmentState[], penalties: PenaltyState[]): number {
  let total = 0;
  for (const inst of installments) {
    total += (inst.principalPaise - inst.principalPaidPaise);
    total += (inst.interestPaise - inst.interestPaidPaise);
  }
  for (const pen of penalties) {
    total += (pen.amountPaise - pen.paidPaise);
  }
  return total;
}

function computeTotalPayable(installments: InstallmentState[], penalties: PenaltyState[]): number {
  let total = 0;
  for (const inst of installments) {
    total += inst.principalPaise + inst.interestPaise;
  }
  for (const pen of penalties) {
    total += pen.amountPaise;
  }
  return total;
}

function applyAllocation(
  installments: InstallmentState[],
  penalties: PenaltyState[],
  result: ReturnType<typeof allocate>,
): { installments: InstallmentState[]; penalties: PenaltyState[] } {
  const newInst = installments.map((i) => ({ ...i }));
  const newPen = penalties.map((p) => ({ ...p }));

  for (const line of result.allocations) {
    if (line.component === 'penalty' && line.penaltyId) {
      const pen = newPen.find((p) => p.penaltyId === line.penaltyId);
      if (pen) pen.paidPaise += line.amountPaise;
    }
    if (line.component === 'interest' && line.installmentId) {
      const inst = newInst.find((i) => i.installmentId === line.installmentId);
      if (inst) inst.interestPaidPaise += line.amountPaise;
    }
    if (line.component === 'principal' && line.installmentId) {
      const inst = newInst.find((i) => i.installmentId === line.installmentId);
      if (inst) inst.principalPaidPaise += line.amountPaise;
    }
  }

  return { installments: newInst, penalties: newPen };
}

function reverseAllocation(
  installments: InstallmentState[],
  penalties: PenaltyState[],
  result: ReturnType<typeof allocate>,
): { installments: InstallmentState[]; penalties: PenaltyState[] } {
  const newInst = installments.map((i) => ({ ...i }));
  const newPen = penalties.map((p) => ({ ...p }));

  for (const line of result.allocations) {
    if (line.component === 'penalty' && line.penaltyId) {
      const pen = newPen.find((p) => p.penaltyId === line.penaltyId);
      if (pen) pen.paidPaise -= line.amountPaise;
    }
    if (line.component === 'interest' && line.installmentId) {
      const inst = newInst.find((i) => i.installmentId === line.installmentId);
      if (inst) inst.interestPaidPaise -= line.amountPaise;
    }
    if (line.component === 'principal' && line.installmentId) {
      const inst = newInst.find((i) => i.installmentId === line.installmentId);
      if (inst) inst.principalPaidPaise -= line.amountPaise;
    }
  }

  return { installments: newInst, penalties: newPen };
}

describe('Outstanding Balance Drift Detection', () => {
  describe('cached_outstanding recomputable from total_payable minus valid allocations (Req 75.1)', () => {
    it('single collection: outstanding = totalPayable - allocated', () => {
      const installments = buildInstallments(3);
      const penalties = buildPenalties(1);
      const totalPayable = computeTotalPayable(installments, penalties);

      const result = allocate({
        amountPaise: 5_000,
        installments,
        pendingPenalties: penalties,
        allocationOrder: DEFAULT_ORDER,
      });

      const allocated = result.totalPenaltyAllocated + result.totalInterestAllocated + result.totalPrincipalAllocated;
      const updated = applyAllocation(installments, penalties, result);
      const actualOutstanding = computeOutstanding(updated.installments, updated.penalties);

      expect(actualOutstanding).toBe(totalPayable - allocated);
    });

    it('multiple sequential collections: outstanding tracks cumulative allocations', () => {
      let installments = buildInstallments(4);
      let penalties = buildPenalties(2);
      const totalPayable = computeTotalPayable(installments, penalties);
      let sumAllocated = 0;

      const payments = [3_000, 5_000, 8_000, 10_000];
      for (const payment of payments) {
        const outstanding = computeOutstanding(installments, penalties);
        if (outstanding <= 0) break;

        const amount = Math.min(payment, outstanding);
        const result = allocate({
          amountPaise: amount,
          installments,
          pendingPenalties: penalties,
          allocationOrder: DEFAULT_ORDER,
        });

        const allocated = result.totalPenaltyAllocated + result.totalInterestAllocated + result.totalPrincipalAllocated;
        sumAllocated += allocated;

        const updated = applyAllocation(installments, penalties, result);
        installments = updated.installments;
        penalties = updated.penalties;

        const actualOutstanding = computeOutstanding(installments, penalties);
        expect(actualOutstanding).toBe(totalPayable - sumAllocated);
      }
    });
  });

  describe('collections + reversals: cached matches independently computed outstanding (Req 75.2)', () => {
    it('collection then reversal restores original outstanding', () => {
      const installments = buildInstallments(3);
      const penalties = buildPenalties(1);
      const originalOutstanding = computeOutstanding(installments, penalties);

      const result = allocate({
        amountPaise: 5_000,
        installments,
        pendingPenalties: penalties,
        allocationOrder: DEFAULT_ORDER,
      });

      const afterCollect = applyAllocation(installments, penalties, result);
      const afterReverse = reverseAllocation(afterCollect.installments, afterCollect.penalties, result);
      const restoredOutstanding = computeOutstanding(afterReverse.installments, afterReverse.penalties);

      expect(restoredOutstanding).toBe(originalOutstanding);
    });

    it('interleaved collections and reversals maintain consistency', () => {
      let installments = buildInstallments(3);
      let penalties = buildPenalties(1);
      const totalPayable = computeTotalPayable(installments, penalties);
      let netAllocated = 0;

      // Collection 1
      const r1 = allocate({ amountPaise: 3_000, installments, pendingPenalties: penalties, allocationOrder: DEFAULT_ORDER });
      const a1 = r1.totalPenaltyAllocated + r1.totalInterestAllocated + r1.totalPrincipalAllocated;
      netAllocated += a1;
      const u1 = applyAllocation(installments, penalties, r1);
      installments = u1.installments;
      penalties = u1.penalties;
      expect(computeOutstanding(installments, penalties)).toBe(totalPayable - netAllocated);

      // Collection 2
      const r2 = allocate({ amountPaise: 5_000, installments, pendingPenalties: penalties, allocationOrder: DEFAULT_ORDER });
      const a2 = r2.totalPenaltyAllocated + r2.totalInterestAllocated + r2.totalPrincipalAllocated;
      netAllocated += a2;
      const u2 = applyAllocation(installments, penalties, r2);
      installments = u2.installments;
      penalties = u2.penalties;
      expect(computeOutstanding(installments, penalties)).toBe(totalPayable - netAllocated);

      // Reverse Collection 1
      const rev1 = reverseAllocation(installments, penalties, r1);
      netAllocated -= a1;
      installments = rev1.installments;
      penalties = rev1.penalties;
      expect(computeOutstanding(installments, penalties)).toBe(totalPayable - netAllocated);
    });
  });

  describe('transactional update of cached_outstanding (Req 75.4)', () => {
    it('full payment zeroes outstanding exactly', () => {
      const installments = buildInstallments(2);
      const penalties = buildPenalties(0);
      const totalPayable = computeTotalPayable(installments, penalties);

      const result = allocate({
        amountPaise: totalPayable,
        installments,
        pendingPenalties: penalties,
        allocationOrder: DEFAULT_ORDER,
      });

      const updated = applyAllocation(installments, penalties, result);
      expect(computeOutstanding(updated.installments, updated.penalties)).toBe(0);
      expect(result.excessAmount).toBe(0);
    });

    it('outstanding never goes negative even with overpayment', () => {
      const installments = buildInstallments(1);
      const penalties = buildPenalties(0);
      const totalPayable = computeTotalPayable(installments, penalties);

      const result = allocate({
        amountPaise: totalPayable + 5_000,
        installments,
        pendingPenalties: penalties,
        allocationOrder: DEFAULT_ORDER,
      });

      const updated = applyAllocation(installments, penalties, result);
      expect(computeOutstanding(updated.installments, updated.penalties)).toBe(0);
      expect(result.excessAmount).toBe(5_000);
    });
  });
});
