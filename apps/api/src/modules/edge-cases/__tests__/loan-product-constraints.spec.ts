/**
 * Loan Product Constraint Validation Tests (Task 24.6)
 *
 * Tests that loan creation validates principal and tenure against
 * the product version's min/max bounds, and rejects deactivated products.
 *
 * Validates: Requirements 74.1–74.8
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LoanService } from '../../loan/loan.service';
import { BusinessRuleError, NotFoundError } from '../../../common/errors';

// ─── Mock Repository ─────────────────────────────────────────────────────────

function createMockLoanRepository() {
  return {
    getCustomerStatus: vi.fn(),
    hasDefaultedLoans: vi.fn(),
    getProductVersion: vi.fn(),
    countActiveLoansByCustomerAndProduct: vi.fn(),
    generateLoanNumber: vi.fn(),
    create: vi.fn(),
    createStatusHistory: vi.fn(),
    createAuditLog: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    updateStatus: vi.fn(),
    updateInstallmentWithVersion: vi.fn(),
    createApproval: vi.fn(),
    createScheduleInstallments: vi.fn(),
    updateLoanTotals: vi.fn(),
    getUnpaidInstallments: vi.fn(),
    getUnsettledPenalties: vi.fn(),
    getPendingReversals: vi.fn(),
    getOutstandingBalance: vi.fn(),
  };
}

function buildProductVersion(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pv-1',
    product_id: 'prod-1',
    version_number: 1,
    interest_type: 'flat',
    annual_rate_bps: 1200,
    min_principal_paise: 10_000_00n,   // 10,000 INR
    max_principal_paise: 5_00_000_00n, // 5,00,000 INR
    min_tenure_months: 3,
    max_tenure_months: 36,
    repayment_frequency: 'monthly',
    max_concurrent_loans: 1,
    is_active: true,
    product: { is_active: true },
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Loan Product Constraint Validation (Req 74)', () => {
  let service: LoanService;
  let mockRepo: ReturnType<typeof createMockLoanRepository>;

  const actorId = 'actor-1';
  const actorRole = 'field_officer';

  beforeEach(() => {
    mockRepo = createMockLoanRepository();
    service = new LoanService(mockRepo as never, null as any, null as any);

    // Default happy-path mocks
    mockRepo.getCustomerStatus.mockResolvedValue({ status: 'active' });
    mockRepo.hasDefaultedLoans.mockResolvedValue(false);
    mockRepo.countActiveLoansByCustomerAndProduct.mockResolvedValue(0);
    mockRepo.generateLoanNumber.mockResolvedValue('LN-2024-00001');
    mockRepo.create.mockResolvedValue({ id: 'loan-1', status: 'draft' });
    mockRepo.createStatusHistory.mockResolvedValue({});
    mockRepo.createAuditLog.mockResolvedValue({});
  });

  // ─── 74.1: Principal at min bound → accepted ────────────────────────────

  describe('74.1 — Principal at min bound', () => {
    it('accepts principal exactly equal to min_principal_paise', async () => {
      const pv = buildProductVersion();
      mockRepo.getProductVersion.mockResolvedValue(pv);

      await expect(
        service.create(
          {
            customerId: 'cust-1',
            productVersionId: 'pv-1',
            principalPaise: Number(pv.min_principal_paise),
            tenureMonths: 12,
            purpose: 'Test',
          } as never,
          actorId,
          actorRole,
        ),
      ).resolves.toBeDefined();
    });
  });

  // ─── 74.2: Principal at max bound → accepted ────────────────────────────

  describe('74.2 — Principal at max bound', () => {
    it('accepts principal exactly equal to max_principal_paise', async () => {
      const pv = buildProductVersion();
      mockRepo.getProductVersion.mockResolvedValue(pv);

      await expect(
        service.create(
          {
            customerId: 'cust-1',
            productVersionId: 'pv-1',
            principalPaise: Number(pv.max_principal_paise),
            tenureMonths: 12,
            purpose: 'Test',
          } as never,
          actorId,
          actorRole,
        ),
      ).resolves.toBeDefined();
    });
  });

  // ─── 74.3: Principal below min → ValidationError ─────────────────────────

  describe('74.3 — Principal below min', () => {
    it('rejects principal below min_principal_paise', async () => {
      const pv = buildProductVersion();
      mockRepo.getProductVersion.mockResolvedValue(pv);

      await expect(
        service.create(
          {
            customerId: 'cust-1',
            productVersionId: 'pv-1',
            principalPaise: Number(pv.min_principal_paise) - 1,
            tenureMonths: 12,
            purpose: 'Test',
          } as never,
          actorId,
          actorRole,
        ),
      ).rejects.toThrow(BusinessRuleError);
    });
  });

  // ─── 74.4: Principal above max → ValidationError ─────────────────────────

  describe('74.4 — Principal above max', () => {
    it('rejects principal above max_principal_paise', async () => {
      const pv = buildProductVersion();
      mockRepo.getProductVersion.mockResolvedValue(pv);

      await expect(
        service.create(
          {
            customerId: 'cust-1',
            productVersionId: 'pv-1',
            principalPaise: Number(pv.max_principal_paise) + 1,
            tenureMonths: 12,
            purpose: 'Test',
          } as never,
          actorId,
          actorRole,
        ),
      ).rejects.toThrow(BusinessRuleError);
    });
  });

  // ─── 74.5: Tenure at min bound → accepted ───────────────────────────────

  describe('74.5 — Tenure at min bound', () => {
    it('accepts tenure exactly equal to min_tenure_months', async () => {
      const pv = buildProductVersion();
      mockRepo.getProductVersion.mockResolvedValue(pv);

      await expect(
        service.create(
          {
            customerId: 'cust-1',
            productVersionId: 'pv-1',
            principalPaise: 100_000_00,
            tenureMonths: pv.min_tenure_months,
            purpose: 'Test',
          } as never,
          actorId,
          actorRole,
        ),
      ).resolves.toBeDefined();
    });
  });

  // ─── 74.6: Tenure at max bound → accepted ───────────────────────────────

  describe('74.6 — Tenure at max bound', () => {
    it('accepts tenure exactly equal to max_tenure_months', async () => {
      const pv = buildProductVersion();
      mockRepo.getProductVersion.mockResolvedValue(pv);

      await expect(
        service.create(
          {
            customerId: 'cust-1',
            productVersionId: 'pv-1',
            principalPaise: 100_000_00,
            tenureMonths: pv.max_tenure_months,
            purpose: 'Test',
          } as never,
          actorId,
          actorRole,
        ),
      ).resolves.toBeDefined();
    });
  });

  // ─── 74.7: Tenure outside range → ValidationError ───────────────────────

  describe('74.7 — Tenure outside range', () => {
    it('rejects tenure below min_tenure_months', async () => {
      const pv = buildProductVersion();
      mockRepo.getProductVersion.mockResolvedValue(pv);

      await expect(
        service.create(
          {
            customerId: 'cust-1',
            productVersionId: 'pv-1',
            principalPaise: 100_000_00,
            tenureMonths: pv.min_tenure_months - 1,
            purpose: 'Test',
          } as never,
          actorId,
          actorRole,
        ),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('rejects tenure above max_tenure_months', async () => {
      const pv = buildProductVersion();
      mockRepo.getProductVersion.mockResolvedValue(pv);

      await expect(
        service.create(
          {
            customerId: 'cust-1',
            productVersionId: 'pv-1',
            principalPaise: 100_000_00,
            tenureMonths: pv.max_tenure_months + 1,
            purpose: 'Test',
          } as never,
          actorId,
          actorRole,
        ),
      ).rejects.toThrow(BusinessRuleError);
    });
  });

  // ─── 74.8: Deactivated product → BusinessRuleError ──────────────────────

  describe('74.8 — Deactivated product', () => {
    it('rejects loan creation with inactive product version', async () => {
      const pv = buildProductVersion({ is_active: false });
      mockRepo.getProductVersion.mockResolvedValue(pv);

      await expect(
        service.create(
          {
            customerId: 'cust-1',
            productVersionId: 'pv-1',
            principalPaise: 100_000_00,
            tenureMonths: 12,
            purpose: 'Test',
          } as never,
          actorId,
          actorRole,
        ),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('rejects loan creation with inactive parent product', async () => {
      const pv = buildProductVersion({ product: { is_active: false } });
      mockRepo.getProductVersion.mockResolvedValue(pv);

      await expect(
        service.create(
          {
            customerId: 'cust-1',
            productVersionId: 'pv-1',
            principalPaise: 100_000_00,
            tenureMonths: 12,
            purpose: 'Test',
          } as never,
          actorId,
          actorRole,
        ),
      ).rejects.toThrow(BusinessRuleError);
    });
  });
});
