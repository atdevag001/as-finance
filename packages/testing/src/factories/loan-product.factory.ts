import { InterestType, Frequency } from '@as-finance/shared';
import { buildEntity, randomUUID } from './helpers.js';

export interface TestLoanProduct {
  id: string;
  name: string;
  isActive: boolean;
  currentVersionId: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TestLoanProductVersion {
  id: string;
  productId: string;
  versionNumber: number;
  interestType: InterestType;
  annualRateBps: number;
  minPrincipalPaise: number;
  maxPrincipalPaise: number;
  minTenureMonths: number;
  maxTenureMonths: number;
  repaymentFrequency: Frequency;
  processingFeeType: string | null;
  processingFeeValue: number | null;
  penaltyGraceDays: number;
  penaltyType: string | null;
  penaltyValue: number | null;
  penaltyFrequency: Frequency | null;
  maxConcurrentLoans: number;
  allocationOrder: string[];
  isActive: boolean;
  createdAt: Date;
}

/**
 * Creates a valid loan product with a default version.
 * Returns both the product and its version for convenience.
 */
export function createLoanProduct(
  overrides?: Partial<TestLoanProduct & TestLoanProductVersion>,
): { product: TestLoanProduct; version: TestLoanProductVersion } {
  const now = new Date();
  const productId = overrides?.id ?? randomUUID();
  const versionId = overrides?.currentVersionId ?? randomUUID();

  const product = buildEntity<TestLoanProduct>(
    {
      id: productId,
      name: `Test Product ${randomUUID().slice(0, 6)}`,
      isActive: true,
      currentVersionId: versionId,
      createdBy: randomUUID(),
      createdAt: now,
      updatedAt: now,
    },
    {
      id: overrides?.id,
      name: overrides?.name,
      isActive: overrides?.isActive,
      currentVersionId: overrides?.currentVersionId,
      createdBy: overrides?.createdBy,
      createdAt: overrides?.createdAt,
      updatedAt: overrides?.updatedAt,
    },
  );

  const version = buildEntity<TestLoanProductVersion>(
    {
      id: versionId,
      productId,
      versionNumber: 1,
      interestType: InterestType.FLAT,
      annualRateBps: 1200, // 12%
      minPrincipalPaise: 1000000, // ₹10,000
      maxPrincipalPaise: 50000000, // ₹5,00,000
      minTenureMonths: 3,
      maxTenureMonths: 36,
      repaymentFrequency: Frequency.MONTHLY,
      processingFeeType: null,
      processingFeeValue: null,
      penaltyGraceDays: 7,
      penaltyType: null,
      penaltyValue: null,
      penaltyFrequency: null,
      maxConcurrentLoans: 1,
      allocationOrder: ['penalty', 'interest', 'principal'],
      isActive: true,
      createdAt: now,
    },
    {
      id: overrides?.currentVersionId ?? undefined,
      productId: overrides?.id,
      versionNumber: overrides?.versionNumber,
      interestType: overrides?.interestType,
      annualRateBps: overrides?.annualRateBps,
      minPrincipalPaise: overrides?.minPrincipalPaise,
      maxPrincipalPaise: overrides?.maxPrincipalPaise,
      minTenureMonths: overrides?.minTenureMonths,
      maxTenureMonths: overrides?.maxTenureMonths,
      repaymentFrequency: overrides?.repaymentFrequency,
      processingFeeType: overrides?.processingFeeType,
      processingFeeValue: overrides?.processingFeeValue,
      penaltyGraceDays: overrides?.penaltyGraceDays,
      penaltyType: overrides?.penaltyType,
      penaltyValue: overrides?.penaltyValue,
      penaltyFrequency: overrides?.penaltyFrequency,
      maxConcurrentLoans: overrides?.maxConcurrentLoans,
      allocationOrder: overrides?.allocationOrder,
      isActive: overrides?.isActive,
      createdAt: overrides?.createdAt,
    },
  );

  return { product, version };
}
