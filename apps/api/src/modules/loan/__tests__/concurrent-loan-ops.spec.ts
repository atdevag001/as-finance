import { describe, it, expect } from 'vitest';
import { LoanService } from '../loan.service';
import { BusinessRuleError } from '../../../common/errors';

/**
 * Concurrent Loan Operations Tests (Task 31.2)
 *
 * Tests concurrent max_concurrent_loans enforcement and
 * concurrent loan creation for same customer respects product limit.
 *
 * Validates: Requirements 45.5, 74.8
 */

function buildMockRepo(overrides: {
  activeLoanCount?: number;
  maxConcurrentLoans?: number;
  customerStatus?: string;
  hasDefaulted?: boolean;
} = {}) {
  const maxConcurrent = overrides.maxConcurrentLoans ?? 3;
  return {
    getCustomerStatus: async () => ({
      id: 'cust-1',
      status: overrides.customerStatus ?? 'active',
    }),
    hasDefaultedLoans: async () => overrides.hasDefaulted ?? false,
    getProductVersion: async () => ({
      id: 'pv-1',
      product_id: 'prod-1',
      is_active: true,
      product: { is_active: true },
      min_principal_paise: 1_000_00n,
      max_principal_paise: 5_00_000_00n,
      min_tenure_months: 3,
      max_tenure_months: 36,
      annual_rate_bps: 1200,
      interest_type: 'flat',
      repayment_frequency: 'monthly',
      max_concurrent_loans: maxConcurrent,
    }),
    countActiveLoansByCustomerAndProduct: async () =>
      overrides.activeLoanCount ?? 0,
    generateLoanNumber: async () => 'LN-2024-00001',
    create: async (data: Record<string, unknown>) => ({
      id: 'loan-new',
      ...data,
      status: 'draft',
    }),
    createStatusHistory: async () => ({}),
    createAuditLog: async () => ({}),
  };
}

describe('Concurrent Loan Operations', () => {
  describe('max_concurrent_loans enforcement (Req 74.8)', () => {
    it('allows loan creation when under concurrent limit', async () => {
      const repo = buildMockRepo({ activeLoanCount: 0, maxConcurrentLoans: 3 });
      const service = new LoanService(repo as any);

      const result = await service.create(
        {
          customerId: 'cust-1',
          productVersionId: 'pv-1',
          principalPaise: 50_000_00,
          tenureMonths: 12,
          purpose: 'Test',
        } as any,
        'actor-1',
        'field_officer',
      );

      expect(result).toBeDefined();
      expect(result.status).toBe('draft');
    });

    it('allows loan creation at limit minus one', async () => {
      const repo = buildMockRepo({ activeLoanCount: 2, maxConcurrentLoans: 3 });
      const service = new LoanService(repo as any);

      const result = await service.create(
        {
          customerId: 'cust-1',
          productVersionId: 'pv-1',
          principalPaise: 50_000_00,
          tenureMonths: 12,
          purpose: 'Test',
        } as any,
        'actor-1',
        'field_officer',
      );

      expect(result).toBeDefined();
    });

    it('rejects loan creation when at concurrent limit', async () => {
      const repo = buildMockRepo({ activeLoanCount: 3, maxConcurrentLoans: 3 });
      const service = new LoanService(repo as any);

      await expect(
        service.create(
          {
            customerId: 'cust-1',
            productVersionId: 'pv-1',
            principalPaise: 50_000_00,
            tenureMonths: 12,
            purpose: 'Test',
          } as any,
          'actor-1',
          'field_officer',
        ),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('rejects with CONCURRENT_LOAN_LIMIT_EXCEEDED code', async () => {
      const repo = buildMockRepo({ activeLoanCount: 3, maxConcurrentLoans: 3 });
      const service = new LoanService(repo as any);

      try {
        await service.create(
          {
            customerId: 'cust-1',
            productVersionId: 'pv-1',
            principalPaise: 50_000_00,
            tenureMonths: 12,
            purpose: 'Test',
          } as any,
          'actor-1',
          'field_officer',
        );
        expect.unreachable('Expected BusinessRuleError');
      } catch (err) {
        expect(err).toBeInstanceOf(BusinessRuleError);
        expect((err as BusinessRuleError).code).toBe('CONCURRENT_LOAN_LIMIT_EXCEEDED');
      }
    });

    it('rejects when exceeding concurrent limit', async () => {
      const repo = buildMockRepo({ activeLoanCount: 5, maxConcurrentLoans: 3 });
      const service = new LoanService(repo as any);

      await expect(
        service.create(
          {
            customerId: 'cust-1',
            productVersionId: 'pv-1',
            principalPaise: 50_000_00,
            tenureMonths: 12,
            purpose: 'Test',
          } as any,
          'actor-1',
          'field_officer',
        ),
      ).rejects.toThrow(BusinessRuleError);
    });
  });

  describe('concurrent loan creation for same customer (Req 45.5)', () => {
    it('simulates two concurrent creates — second should fail if limit reached', async () => {
      let callCount = 0;
      const repo = buildMockRepo({ maxConcurrentLoans: 1 });
      // Override to simulate race: first call returns 0, second returns 1
      repo.countActiveLoansByCustomerAndProduct = async () => callCount++;
      const service = new LoanService(repo as any);

      const dto = {
        customerId: 'cust-1',
        productVersionId: 'pv-1',
        principalPaise: 50_000_00,
        tenureMonths: 12,
        purpose: 'Test',
      } as any;

      // First create succeeds (count=0 < limit=1)
      const first = await service.create(dto, 'actor-1', 'field_officer');
      expect(first).toBeDefined();

      // Second create fails (count=1 >= limit=1)
      await expect(
        service.create(dto, 'actor-2', 'field_officer'),
      ).rejects.toThrow(BusinessRuleError);
    });
  });
});
