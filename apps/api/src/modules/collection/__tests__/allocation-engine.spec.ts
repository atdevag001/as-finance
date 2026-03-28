import { describe, it, expect } from 'vitest';
import {
  allocate,
  AllocationParams,
  InstallmentState,
  PenaltyState,
} from '../allocation-engine';

// ─── Test Helpers ────────────────────────────────────────────────────────────

function makeInstallment(overrides: Partial<InstallmentState> & { installmentId: string }): InstallmentState {
  return {
    installmentNumber: 1,
    dueDate: new Date('2024-01-15'),
    principalPaise: 10000,
    interestPaise: 1000,
    principalPaidPaise: 0,
    interestPaidPaise: 0,
    ...overrides,
  };
}

function makePenalty(overrides: Partial<PenaltyState> & { penaltyId: string }): PenaltyState {
  return {
    amountPaise: 500,
    paidPaise: 0,
    ...overrides,
  };
}

const DEFAULT_ORDER = ['penalty', 'interest', 'principal'] as const;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Allocation Engine', () => {
  describe('zero payment', () => {
    it('should return empty allocations for zero amount', () => {
      const result = allocate({
        amountPaise: 0,
        installments: [makeInstallment({ installmentId: 'i1' })],
        pendingPenalties: [],
        allocationOrder: [...DEFAULT_ORDER],
      });

      expect(result.allocations).toHaveLength(0);
      expect(result.totalPenaltyAllocated).toBe(0);
      expect(result.totalInterestAllocated).toBe(0);
      expect(result.totalPrincipalAllocated).toBe(0);
      expect(result.excessAmount).toBe(0);
    });
  });

  describe('penalty allocation', () => {
    it('should allocate to penalties first (oldest first)', () => {
      const result = allocate({
        amountPaise: 800,
        installments: [makeInstallment({ installmentId: 'i1' })],
        pendingPenalties: [
          makePenalty({ penaltyId: 'p1', amountPaise: 500, paidPaise: 0 }),
          makePenalty({ penaltyId: 'p2', amountPaise: 400, paidPaise: 0 }),
        ],
        allocationOrder: [...DEFAULT_ORDER],
      });

      expect(result.totalPenaltyAllocated).toBe(800);
      expect(result.totalInterestAllocated).toBe(0);
      expect(result.totalPrincipalAllocated).toBe(0);
      expect(result.excessAmount).toBe(0);

      // p1 fully paid, p2 partially paid
      expect(result.allocations[0]).toEqual({
        penaltyId: 'p1',
        component: 'penalty',
        amountPaise: 500,
      });
      expect(result.allocations[1]).toEqual({
        penaltyId: 'p2',
        component: 'penalty',
        amountPaise: 300,
      });
    });

    it('should skip fully paid penalties', () => {
      const result = allocate({
        amountPaise: 1000,
        installments: [makeInstallment({ installmentId: 'i1', interestPaise: 1000 })],
        pendingPenalties: [
          makePenalty({ penaltyId: 'p1', amountPaise: 500, paidPaise: 500 }),
        ],
        allocationOrder: [...DEFAULT_ORDER],
      });

      expect(result.totalPenaltyAllocated).toBe(0);
      expect(result.totalInterestAllocated).toBe(1000);
    });
  });

  describe('interest allocation', () => {
    it('should allocate interest after penalties, oldest installment first', () => {
      const result = allocate({
        amountPaise: 2500,
        installments: [
          makeInstallment({
            installmentId: 'i1',
            installmentNumber: 1,
            dueDate: new Date('2024-01-15'),
            interestPaise: 1000,
            principalPaise: 10000,
          }),
          makeInstallment({
            installmentId: 'i2',
            installmentNumber: 2,
            dueDate: new Date('2024-02-15'),
            interestPaise: 1000,
            principalPaise: 10000,
          }),
        ],
        pendingPenalties: [
          makePenalty({ penaltyId: 'p1', amountPaise: 500 }),
        ],
        allocationOrder: [...DEFAULT_ORDER],
      });

      // 500 penalty + 1000 interest(i1) + 1000 interest(i2) = 2500
      expect(result.totalPenaltyAllocated).toBe(500);
      expect(result.totalInterestAllocated).toBe(2000);
      expect(result.totalPrincipalAllocated).toBe(0);
      expect(result.excessAmount).toBe(0);
    });
  });

  describe('principal allocation', () => {
    it('should allocate principal after interest is fully paid', () => {
      const result = allocate({
        amountPaise: 11000,
        installments: [
          makeInstallment({
            installmentId: 'i1',
            interestPaise: 1000,
            principalPaise: 10000,
          }),
        ],
        pendingPenalties: [],
        allocationOrder: [...DEFAULT_ORDER],
      });

      expect(result.totalInterestAllocated).toBe(1000);
      expect(result.totalPrincipalAllocated).toBe(10000);
      expect(result.excessAmount).toBe(0);
    });
  });

  describe('partial payments', () => {
    it('should handle partial payment that only covers penalty and some interest', () => {
      const result = allocate({
        amountPaise: 700,
        installments: [
          makeInstallment({
            installmentId: 'i1',
            interestPaise: 1000,
            principalPaise: 10000,
          }),
        ],
        pendingPenalties: [
          makePenalty({ penaltyId: 'p1', amountPaise: 500 }),
        ],
        allocationOrder: [...DEFAULT_ORDER],
      });

      expect(result.totalPenaltyAllocated).toBe(500);
      expect(result.totalInterestAllocated).toBe(200);
      expect(result.totalPrincipalAllocated).toBe(0);
      expect(result.excessAmount).toBe(0);
    });

    it('should handle partial payment within a single component', () => {
      const result = allocate({
        amountPaise: 300,
        installments: [
          makeInstallment({
            installmentId: 'i1',
            interestPaise: 1000,
            principalPaise: 10000,
          }),
        ],
        pendingPenalties: [
          makePenalty({ penaltyId: 'p1', amountPaise: 500 }),
        ],
        allocationOrder: [...DEFAULT_ORDER],
      });

      expect(result.totalPenaltyAllocated).toBe(300);
      expect(result.totalInterestAllocated).toBe(0);
      expect(result.totalPrincipalAllocated).toBe(0);
      expect(result.excessAmount).toBe(0);
    });
  });

  describe('advance payments', () => {
    it('should allocate excess to future installments after clearing current/overdue', () => {
      const result = allocate({
        amountPaise: 33000,
        installments: [
          makeInstallment({
            installmentId: 'i1',
            installmentNumber: 1,
            dueDate: new Date('2024-01-15'),
            interestPaise: 1000,
            principalPaise: 10000,
          }),
          makeInstallment({
            installmentId: 'i2',
            installmentNumber: 2,
            dueDate: new Date('2024-02-15'),
            interestPaise: 1000,
            principalPaise: 10000,
          }),
          makeInstallment({
            installmentId: 'i3',
            installmentNumber: 3,
            dueDate: new Date('2024-03-15'),
            interestPaise: 1000,
            principalPaise: 10000,
          }),
        ],
        pendingPenalties: [],
        allocationOrder: [...DEFAULT_ORDER],
      });

      // 3 installments × (1000 interest + 10000 principal) = 33000
      expect(result.totalInterestAllocated).toBe(3000);
      expect(result.totalPrincipalAllocated).toBe(30000);
      expect(result.excessAmount).toBe(0);
    });

    it('should report excess when payment exceeds all outstanding', () => {
      const result = allocate({
        amountPaise: 15000,
        installments: [
          makeInstallment({
            installmentId: 'i1',
            interestPaise: 1000,
            principalPaise: 10000,
          }),
        ],
        pendingPenalties: [],
        allocationOrder: [...DEFAULT_ORDER],
      });

      expect(result.totalInterestAllocated).toBe(1000);
      expect(result.totalPrincipalAllocated).toBe(10000);
      expect(result.excessAmount).toBe(4000);
    });
  });

  describe('money conservation invariant', () => {
    it('should ensure sum(allocated) + excess == amountPaise', () => {
      const result = allocate({
        amountPaise: 5555,
        installments: [
          makeInstallment({
            installmentId: 'i1',
            interestPaise: 1234,
            principalPaise: 3000,
          }),
        ],
        pendingPenalties: [
          makePenalty({ penaltyId: 'p1', amountPaise: 321 }),
        ],
        allocationOrder: [...DEFAULT_ORDER],
      });

      const total =
        result.totalPenaltyAllocated +
        result.totalInterestAllocated +
        result.totalPrincipalAllocated +
        result.excessAmount;

      expect(total).toBe(5555);
    });
  });

  describe('already partially paid installments', () => {
    it('should only allocate remaining outstanding amounts', () => {
      const result = allocate({
        amountPaise: 6000,
        installments: [
          makeInstallment({
            installmentId: 'i1',
            interestPaise: 1000,
            interestPaidPaise: 600,
            principalPaise: 10000,
            principalPaidPaise: 5000,
          }),
        ],
        pendingPenalties: [],
        allocationOrder: [...DEFAULT_ORDER],
      });

      // Interest remaining: 400, Principal remaining: 5000
      expect(result.totalInterestAllocated).toBe(400);
      expect(result.totalPrincipalAllocated).toBe(5000);
      expect(result.excessAmount).toBe(600);
    });
  });

  describe('no installments or penalties', () => {
    it('should return all as excess when no installments and no penalties', () => {
      const result = allocate({
        amountPaise: 1000,
        installments: [],
        pendingPenalties: [],
        allocationOrder: [...DEFAULT_ORDER],
      });

      expect(result.allocations).toHaveLength(0);
      expect(result.excessAmount).toBe(1000);
    });
  });

  describe('custom allocation order', () => {
    it('should respect custom order: interest before penalty', () => {
      const result = allocate({
        amountPaise: 1000,
        installments: [
          makeInstallment({
            installmentId: 'i1',
            interestPaise: 800,
            principalPaise: 10000,
          }),
        ],
        pendingPenalties: [
          makePenalty({ penaltyId: 'p1', amountPaise: 500 }),
        ],
        allocationOrder: ['interest', 'penalty', 'principal'],
      });

      // Interest first: 800, then penalty: 200 (partial)
      expect(result.totalInterestAllocated).toBe(800);
      expect(result.totalPenaltyAllocated).toBe(200);
      expect(result.totalPrincipalAllocated).toBe(0);
    });
  });

  describe('negative amount', () => {
    it('should throw for negative allocation amount', () => {
      expect(() =>
        allocate({
          amountPaise: -100,
          installments: [],
          pendingPenalties: [],
          allocationOrder: [...DEFAULT_ORDER],
        }),
      ).toThrow('Allocation amount must be non-negative');
    });
  });

  describe('exact EMI payment', () => {
    it('should fully pay one installment with exact EMI amount', () => {
      const result = allocate({
        amountPaise: 11000,
        installments: [
          makeInstallment({
            installmentId: 'i1',
            installmentNumber: 1,
            dueDate: new Date('2024-01-15'),
            interestPaise: 1000,
            principalPaise: 10000,
          }),
          makeInstallment({
            installmentId: 'i2',
            installmentNumber: 2,
            dueDate: new Date('2024-02-15'),
            interestPaise: 1000,
            principalPaise: 10000,
          }),
        ],
        pendingPenalties: [],
        allocationOrder: [...DEFAULT_ORDER],
      });

      // Should pay all interest first (i1: 1000, i2: 1000), then principal (i1: 9000)
      expect(result.totalInterestAllocated).toBe(2000);
      expect(result.totalPrincipalAllocated).toBe(9000);
      expect(result.excessAmount).toBe(0);
    });
  });
});
