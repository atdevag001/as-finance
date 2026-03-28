import { InstallmentStatus } from '@as-finance/shared';
import { buildEntity, randomUUID } from './helpers.js';

export interface TestInstallment {
  id: string;
  loanId: string;
  installmentNumber: number;
  dueDate: Date;
  principalPaise: number;
  interestPaise: number;
  totalPaise: number;
  principalPaidPaise: number;
  interestPaidPaise: number;
  penaltyPaidPaise: number;
  status: InstallmentStatus;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export function createInstallment(overrides?: Partial<TestInstallment>): TestInstallment {
  const now = new Date();
  const principalPaise = overrides?.principalPaise ?? 833333;
  const interestPaise = overrides?.interestPaise ?? 100000;
  return buildEntity<TestInstallment>(
    {
      id: randomUUID(),
      loanId: randomUUID(),
      installmentNumber: 1,
      dueDate: new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()),
      principalPaise,
      interestPaise,
      totalPaise: principalPaise + interestPaise,
      principalPaidPaise: 0,
      interestPaidPaise: 0,
      penaltyPaidPaise: 0,
      status: InstallmentStatus.PENDING,
      version: 1,
      createdAt: now,
      updatedAt: now,
    },
    overrides,
  );
}
