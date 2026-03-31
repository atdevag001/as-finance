import { buildEntity, randomUUID } from './helpers.js';

/**
 * InstallmentState — represents the current state of a loan installment
 * for allocation purposes. Maps to `loan_schedules` Prisma model fields.
 */
export interface InstallmentState {
  installmentId: string;
  installmentNumber: number;
  dueDate: Date;
  principalPaise: number;
  interestPaise: number;
  principalPaidPaise: number;
  interestPaidPaise: number;
}

/**
 * PenaltyState — represents a pending penalty for allocation.
 * Maps to `penalties` Prisma model fields.
 */
export interface PenaltyState {
  penaltyId: string;
  amountPaise: number;
  paidPaise: number;
}

export function buildInstallmentState(
  overrides?: Partial<InstallmentState>,
): InstallmentState {
  return buildEntity<InstallmentState>(
    {
      installmentId: randomUUID(),
      installmentNumber: 1,
      dueDate: new Date('2024-02-01'),
      principalPaise: 833_333,
      interestPaise: 100_000,
      principalPaidPaise: 0,
      interestPaidPaise: 0,
    },
    overrides,
  );
}

export function buildPenaltyState(
  overrides?: Partial<PenaltyState>,
): PenaltyState {
  return buildEntity<PenaltyState>(
    {
      penaltyId: randomUUID(),
      amountPaise: 500_00,
      paidPaise: 0,
    },
    overrides,
  );
}
