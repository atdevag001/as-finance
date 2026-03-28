import { LoanStatus, OverdueBucket } from '@as-finance/shared';
import { buildEntity, randomUUID } from './helpers.js';

export interface TestLoan {
  id: string;
  loanNumber: string;
  customerId: string;
  productVersionId: string;
  groupId: string | null;
  principalPaise: number;
  tenureMonths: number;
  purpose: string;
  status: LoanStatus;
  processingFeePaise: number | null;
  totalInterestPaise: number | null;
  totalPayablePaise: number | null;
  cachedOutstandingPaise: number | null;
  disbursementDate: Date | null;
  firstDueDate: Date | null;
  lastDueDate: Date | null;
  dpd: number;
  overdueBucket: OverdueBucket | null;
  createdBy: string;
  approvedBy: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export function createLoan(overrides?: Partial<TestLoan>): TestLoan {
  const now = new Date();
  const year = now.getFullYear();
  const seq = Math.floor(Math.random() * 99999) + 1;
  return buildEntity<TestLoan>(
    {
      id: randomUUID(),
      loanNumber: `LN-${year}-${String(seq).padStart(5, '0')}`,
      customerId: randomUUID(),
      productVersionId: randomUUID(),
      groupId: null,
      principalPaise: 10000000, // ₹1,00,000
      tenureMonths: 12,
      purpose: 'Business expansion',
      status: LoanStatus.DRAFT,
      processingFeePaise: null,
      totalInterestPaise: null,
      totalPayablePaise: null,
      cachedOutstandingPaise: null,
      disbursementDate: null,
      firstDueDate: null,
      lastDueDate: null,
      dpd: 0,
      overdueBucket: null,
      createdBy: randomUUID(),
      approvedBy: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    },
    overrides,
  );
}
