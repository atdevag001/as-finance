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
  /**
   * Parent installment this penalty was levied against.
   *
   * Optional in the type to keep unit-test fixtures (which historically omitted it)
   * compatible, but in production it is always populated — penalties.installment_id
   * is NOT NULL in the schema. When present, the allocation engine threads it onto
   * the penalty AllocationLine so the persistence layer can satisfy
   * collection_allocations.installment_id (NOT NULL) on penalty rows.
   */
  installmentId?: string;
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
 *
 * Each line carries the parent installment_id (sourced from penalty.installmentId)
 * so the persistence layer can satisfy the NOT NULL installment_id constraint on
 * collection_allocations while still scoping the row to its penalty via penalty_id.
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
        installmentId: penalty.installmentId,
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

  let totalAllocated = totalPenalty.plus(totalInterest).plus(totalPrincipal);
  let excessAmount = new Decimal(amountPaise).minus(totalAllocated)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();

  // (C5) Keep the journal balanced under rounding.
  //
  // When `amountPaise <= totalOutstanding`, the user paid only what was owed,
  // so excess MUST be zero — otherwise the DR Cash side will not equal the
  // CR side and the journal entry is unbalanced. Per-line ROUND_HALF_UP can
  // strand 1 paisa under (e.g. allocating 5555 across components rounded to
  // 5554), leaving a stray excess. Fold the stray paise into the LAST
  // principal line so all money lands somewhere and totals reconcile.
  //
  // We do NOT do this for true overpayments (amount > outstanding) — those
  // legitimately produce excess.
  if (excessAmount > 0) {
    // Did the caller pay at most what was owed? If so, the stray excess
    // is rounding — not a true overpayment.
    let totalOutstanding = new Decimal(0);
    for (const p of pendingPenalties) {
      const out = new Decimal(p.amountPaise).minus(p.paidPaise);
      if (out.gt(0)) totalOutstanding = totalOutstanding.plus(out);
    }
    for (const inst of installments) {
      const prinOut = new Decimal(inst.principalPaise).minus(inst.principalPaidPaise);
      const intOut = new Decimal(inst.interestPaise).minus(inst.interestPaidPaise);
      if (prinOut.gt(0)) totalOutstanding = totalOutstanding.plus(prinOut);
      if (intOut.gt(0)) totalOutstanding = totalOutstanding.plus(intOut);
    }

    if (new Decimal(amountPaise).lte(totalOutstanding)) {
      // Find the LAST principal line (insertion order) and fold the stray
      // paise into it. If no principal line exists (rare — only penalty or
      // interest allocations), fall back to the last allocation line of any
      // component so totals still reconcile.
      let lastIdx = -1;
      for (let i = allLines.length - 1; i >= 0; i--) {
        if (allLines[i]!.component === 'principal') {
          lastIdx = i;
          break;
        }
      }
      if (lastIdx === -1) {
        for (let i = allLines.length - 1; i >= 0; i--) {
          if (allLines[i]!.component === 'interest' || allLines[i]!.component === 'penalty') {
            lastIdx = i;
            break;
          }
        }
      }
      if (lastIdx !== -1) {
        const last = allLines[lastIdx]!;
        last.amountPaise += excessAmount;
        // Update component totals to reflect the folded paise.
        switch (last.component) {
          case 'principal':
            totalPrincipal = totalPrincipal.plus(excessAmount);
            break;
          case 'interest':
            totalInterest = totalInterest.plus(excessAmount);
            break;
          case 'penalty':
            totalPenalty = totalPenalty.plus(excessAmount);
            break;
        }
        totalAllocated = totalAllocated.plus(excessAmount);
        excessAmount = 0;
      }
    }
  }

  return {
    allocations: allLines,
    totalPenaltyAllocated: totalPenalty.toNumber(),
    totalInterestAllocated: totalInterest.toNumber(),
    totalPrincipalAllocated: totalPrincipal.toNumber(),
    excessAmount,
  };
}
