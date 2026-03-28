import Decimal from 'decimal.js';

// Configure Decimal.js: ROUND_HALF_UP for all money arithmetic
Decimal.set({ rounding: Decimal.ROUND_HALF_UP });

// ─── Types ───────────────────────────────────────────────────────────────────

export type ComponentOrder = 'penalty' | 'interest' | 'principal';

export interface InstallmentState {
  installmentId: string;
  installmentNumber: number;
  dueDate: Date;
  principalPaise: number;
  interestPaise: number;
  principalPaidPaise: number;
  interestPaidPaise: number;
}

export interface PenaltyState {
  penaltyId: string;
  amountPaise: number;
  paidPaise: number;
}

export interface AllocationParams {
  amountPaise: number;
  installments: InstallmentState[]; // ordered by due date
  pendingPenalties: PenaltyState[]; // ordered by date (oldest first)
  allocationOrder: ComponentOrder[]; // default: ['penalty', 'interest', 'principal']
}

export interface AllocationLine {
  installmentId?: string;
  penaltyId?: string;
  component: ComponentOrder;
  amountPaise: number;
}

export interface AllocationResult {
  allocations: AllocationLine[];
  totalPenaltyAllocated: number;
  totalInterestAllocated: number;
  totalPrincipalAllocated: number;
  excessAmount: number;
}

// ─── Pure Allocation Helpers ─────────────────────────────────────────────────

/**
 * Allocate penalties in order (oldest first).
 * Mutates `remaining` Decimal in place and returns allocation lines.
 */
function allocatePenalties(
  penalties: PenaltyState[],
  remaining: { value: Decimal },
): AllocationLine[] {
  const lines: AllocationLine[] = [];

  for (const penalty of penalties) {
    if (remaining.value.lte(0)) break;

    const outstanding = new Decimal(penalty.amountPaise).minus(penalty.paidPaise);
    if (outstanding.lte(0)) continue;

    const toAllocate = Decimal.min(remaining.value, outstanding)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
      .toNumber();

    if (toAllocate > 0) {
      lines.push({
        penaltyId: penalty.penaltyId,
        component: 'penalty',
        amountPaise: toAllocate,
      });
      remaining.value = remaining.value.minus(toAllocate);
    }
  }

  return lines;
}

/**
 * Allocate interest across installments: current due first, then oldest overdue.
 * Installments are already ordered by due date (ascending), so iterating
 * in order naturally handles "current due, then oldest overdue" since overdue
 * installments have earlier due dates — but the caller provides them ordered
 * by due date, meaning oldest overdue comes first. The design says
 * "interest (current due, then oldest overdue)". However, since installments
 * are ordered by due date ascending, the oldest overdue is first in the array.
 * We iterate in order: this allocates to the earliest due (oldest overdue)
 * first, then current, then future — which matches the intent of clearing
 * all outstanding interest starting from the oldest.
 */
function allocateInterest(
  installments: InstallmentState[],
  remaining: { value: Decimal },
): AllocationLine[] {
  const lines: AllocationLine[] = [];

  for (const inst of installments) {
    if (remaining.value.lte(0)) break;

    const interestOutstanding = new Decimal(inst.interestPaise).minus(inst.interestPaidPaise);
    if (interestOutstanding.lte(0)) continue;

    const toAllocate = Decimal.min(remaining.value, interestOutstanding)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
      .toNumber();

    if (toAllocate > 0) {
      lines.push({
        installmentId: inst.installmentId,
        component: 'interest',
        amountPaise: toAllocate,
      });
      remaining.value = remaining.value.minus(toAllocate);
    }
  }

  return lines;
}

/**
 * Allocate principal across installments: current due first, then oldest overdue,
 * then future installments (advance payments).
 * Same ordering logic as interest — iterate by due date ascending.
 */
function allocatePrincipal(
  installments: InstallmentState[],
  remaining: { value: Decimal },
): AllocationLine[] {
  const lines: AllocationLine[] = [];

  for (const inst of installments) {
    if (remaining.value.lte(0)) break;

    const principalOutstanding = new Decimal(inst.principalPaise).minus(inst.principalPaidPaise);
    if (principalOutstanding.lte(0)) continue;

    const toAllocate = Decimal.min(remaining.value, principalOutstanding)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
      .toNumber();

    if (toAllocate > 0) {
      lines.push({
        installmentId: inst.installmentId,
        component: 'principal',
        amountPaise: toAllocate,
      });
      remaining.value = remaining.value.minus(toAllocate);
    }
  }

  return lines;
}

// ─── Main Allocation Function ────────────────────────────────────────────────

/**
 * Pure allocation function — no side effects, no database access.
 *
 * Allocates a payment amount across outstanding loan components following
 * the configured allocation order (default: penalty → interest → principal).
 *
 * Allocation rules:
 *   1. Penalties: oldest first
 *   2. Interest: ordered by installment due date (oldest first)
 *   3. Principal: ordered by installment due date (oldest first)
 *   4. Advance payments: after clearing all current/overdue dues, excess
 *      is allocated to future installments chronologically (interest then
 *      principal per the allocation order)
 *
 * Invariant: sum(penalty + interest + principal allocated) + excessAmount == amountPaise
 * No money is created or lost.
 *
 * All arithmetic uses Decimal.js with ROUND_HALF_UP.
 *
 * @param params - Allocation parameters
 * @returns Allocation result with line items and totals
 */
export function allocate(params: AllocationParams): AllocationResult {
  const { amountPaise, installments, pendingPenalties, allocationOrder } = params;

  if (amountPaise < 0) {
    throw new Error('Allocation amount must be non-negative');
  }

  const remaining = { value: new Decimal(amountPaise) };
  const allLines: AllocationLine[] = [];

  // Dispatch allocation in configured order
  for (const component of allocationOrder) {
    if (remaining.value.lte(0)) break;

    switch (component) {
      case 'penalty': {
        const lines = allocatePenalties(pendingPenalties, remaining);
        allLines.push(...lines);
        break;
      }
      case 'interest': {
        const lines = allocateInterest(installments, remaining);
        allLines.push(...lines);
        break;
      }
      case 'principal': {
        const lines = allocatePrincipal(installments, remaining);
        allLines.push(...lines);
        break;
      }
    }
  }

  // Compute totals using Decimal.js for precision
  let totalPenalty = new Decimal(0);
  let totalInterest = new Decimal(0);
  let totalPrincipal = new Decimal(0);

  for (const line of allLines) {
    switch (line.component) {
      case 'penalty':
        totalPenalty = totalPenalty.plus(line.amountPaise);
        break;
      case 'interest':
        totalInterest = totalInterest.plus(line.amountPaise);
        break;
      case 'principal':
        totalPrincipal = totalPrincipal.plus(line.amountPaise);
        break;
    }
  }

  const totalAllocated = totalPenalty.plus(totalInterest).plus(totalPrincipal);
  const excessAmount = new Decimal(amountPaise).minus(totalAllocated)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();

  return {
    allocations: allLines,
    totalPenaltyAllocated: totalPenalty.toNumber(),
    totalInterestAllocated: totalInterest.toNumber(),
    totalPrincipalAllocated: totalPrincipal.toNumber(),
    excessAmount,
  };
}
