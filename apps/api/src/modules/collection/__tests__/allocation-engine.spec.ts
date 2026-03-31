import { describe, it, expect } from 'vitest';
import {
  allocate,
  AllocationParams,
  InstallmentState,
  PenaltyState,
} from '../allocation-engine';
import {
  buildInstallmentState,
  buildPenaltyState,
} from '@as-finance/testing';

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

  // ─── Extended Tests (Requirement 3) ──────────────────────────────────────

  describe('default allocation order: penalty → interest → principal', () => {
    it('should allocate penalty first, then interest, then principal using factories', () => {
      const inst = buildInstallmentState({
        installmentId: 'inst-1',
        principalPaise: 5000_00,
        interestPaise: 500_00,
        principalPaidPaise: 0,
        interestPaidPaise: 0,
        dueDate: new Date('2024-03-01'),
      });
      const penalty = buildPenaltyState({
        penaltyId: 'pen-1',
        amountPaise: 200_00,
        paidPaise: 0,
      });

      const result = allocate({
        amountPaise: 5700_00,
        installments: [inst],
        pendingPenalties: [penalty],
        allocationOrder: ['penalty', 'interest', 'principal'],
      });

      expect(result.totalPenaltyAllocated).toBe(200_00);
      expect(result.totalInterestAllocated).toBe(500_00);
      expect(result.totalPrincipalAllocated).toBe(5000_00);
      expect(result.excessAmount).toBe(0);

      // Verify order of allocation lines
      const components = result.allocations.map((a) => a.component);
      expect(components).toEqual(['penalty', 'interest', 'principal']);
    });
  });

  describe('principal allocated oldest-first', () => {
    it('should allocate principal to oldest installment before newer ones', () => {
      const result = allocate({
        amountPaise: 15000,
        installments: [
          makeInstallment({
            installmentId: 'old',
            installmentNumber: 1,
            dueDate: new Date('2024-01-15'),
            interestPaise: 0,
            interestPaidPaise: 0,
            principalPaise: 10000,
          }),
          makeInstallment({
            installmentId: 'new',
            installmentNumber: 2,
            dueDate: new Date('2024-02-15'),
            interestPaise: 0,
            interestPaidPaise: 0,
            principalPaise: 10000,
          }),
        ],
        pendingPenalties: [],
        allocationOrder: [...DEFAULT_ORDER],
      });

      const principalLines = result.allocations.filter((a) => a.component === 'principal');
      expect(principalLines[0]).toMatchObject({ installmentId: 'old', amountPaise: 10000 });
      expect(principalLines[1]).toMatchObject({ installmentId: 'new', amountPaise: 5000 });
    });
  });

  describe('partial payment covering only penalties', () => {
    it('should allocate entirely to penalties with nothing left for interest or principal', () => {
      const result = allocate({
        amountPaise: 400,
        installments: [
          makeInstallment({ installmentId: 'i1', interestPaise: 1000, principalPaise: 10000 }),
        ],
        pendingPenalties: [
          makePenalty({ penaltyId: 'p1', amountPaise: 500 }),
          makePenalty({ penaltyId: 'p2', amountPaise: 300 }),
        ],
        allocationOrder: [...DEFAULT_ORDER],
      });

      expect(result.totalPenaltyAllocated).toBe(400);
      expect(result.totalInterestAllocated).toBe(0);
      expect(result.totalPrincipalAllocated).toBe(0);
      expect(result.excessAmount).toBe(0);
      expect(result.allocations).toHaveLength(1);
      expect(result.allocations[0]).toMatchObject({ penaltyId: 'p1', amountPaise: 400 });
    });
  });

  describe('exact full payment (all penalties + all installments)', () => {
    it('should fully pay everything with zero excess', () => {
      const result = allocate({
        amountPaise: 500 + 1000 + 10000 + 1000 + 10000,
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
        pendingPenalties: [makePenalty({ penaltyId: 'p1', amountPaise: 500 })],
        allocationOrder: [...DEFAULT_ORDER],
      });

      expect(result.totalPenaltyAllocated).toBe(500);
      expect(result.totalInterestAllocated).toBe(2000);
      expect(result.totalPrincipalAllocated).toBe(20000);
      expect(result.excessAmount).toBe(0);
    });
  });

  describe('overpayment with excess calculation', () => {
    it('should compute correct excess when payment exceeds all outstanding', () => {
      const result = allocate({
        amountPaise: 20000,
        installments: [
          makeInstallment({
            installmentId: 'i1',
            interestPaise: 1000,
            principalPaise: 10000,
          }),
        ],
        pendingPenalties: [makePenalty({ penaltyId: 'p1', amountPaise: 500 })],
        allocationOrder: [...DEFAULT_ORDER],
      });

      expect(result.totalPenaltyAllocated).toBe(500);
      expect(result.totalInterestAllocated).toBe(1000);
      expect(result.totalPrincipalAllocated).toBe(10000);
      expect(result.excessAmount).toBe(8500);
      // Money conservation
      const total =
        result.totalPenaltyAllocated +
        result.totalInterestAllocated +
        result.totalPrincipalAllocated +
        result.excessAmount;
      expect(total).toBe(20000);
    });
  });

  describe('custom allocation order: interest → principal → penalty', () => {
    it('should allocate interest first, then principal, then penalty', () => {
      const result = allocate({
        amountPaise: 2000,
        installments: [
          makeInstallment({
            installmentId: 'i1',
            interestPaise: 800,
            principalPaise: 5000,
          }),
        ],
        pendingPenalties: [makePenalty({ penaltyId: 'p1', amountPaise: 600 })],
        allocationOrder: ['interest', 'principal', 'penalty'],
      });

      // Interest: 800, then principal: 1200 (partial of 5000), penalty: 0
      expect(result.totalInterestAllocated).toBe(800);
      expect(result.totalPrincipalAllocated).toBe(1200);
      expect(result.totalPenaltyAllocated).toBe(0);
      expect(result.excessAmount).toBe(0);

      // Verify allocation line order
      const components = result.allocations.map((a) => a.component);
      expect(components).toEqual(['interest', 'principal']);
    });

    it('should allocate penalty last when order is interest → principal → penalty', () => {
      const result = allocate({
        amountPaise: 6500,
        installments: [
          makeInstallment({
            installmentId: 'i1',
            interestPaise: 800,
            principalPaise: 5000,
          }),
        ],
        pendingPenalties: [makePenalty({ penaltyId: 'p1', amountPaise: 600 })],
        allocationOrder: ['interest', 'principal', 'penalty'],
      });

      expect(result.totalInterestAllocated).toBe(800);
      expect(result.totalPrincipalAllocated).toBe(5000);
      expect(result.totalPenaltyAllocated).toBe(600);
      expect(result.excessAmount).toBe(100);
    });
  });

  describe('no pending penalties', () => {
    it('should skip penalty phase and allocate directly to interest then principal', () => {
      const result = allocate({
        amountPaise: 5000,
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

      expect(result.totalPenaltyAllocated).toBe(0);
      expect(result.totalInterestAllocated).toBe(1000);
      expect(result.totalPrincipalAllocated).toBe(4000);
      expect(result.allocations.every((a) => a.component !== 'penalty')).toBe(true);
    });
  });

  describe('no outstanding interest', () => {
    it('should skip interest phase when all interest is already paid', () => {
      const result = allocate({
        amountPaise: 5000,
        installments: [
          makeInstallment({
            installmentId: 'i1',
            interestPaise: 1000,
            interestPaidPaise: 1000,
            principalPaise: 10000,
            principalPaidPaise: 0,
          }),
        ],
        pendingPenalties: [],
        allocationOrder: [...DEFAULT_ORDER],
      });

      expect(result.totalInterestAllocated).toBe(0);
      expect(result.totalPrincipalAllocated).toBe(5000);
      expect(result.allocations.every((a) => a.component !== 'interest')).toBe(true);
    });
  });

  describe('mixed paid/unpaid installments', () => {
    it('should skip fully paid installments and allocate to unpaid ones', () => {
      const result = allocate({
        amountPaise: 11000,
        installments: [
          makeInstallment({
            installmentId: 'i1-paid',
            installmentNumber: 1,
            dueDate: new Date('2024-01-15'),
            interestPaise: 1000,
            interestPaidPaise: 1000,
            principalPaise: 10000,
            principalPaidPaise: 10000,
          }),
          makeInstallment({
            installmentId: 'i2-unpaid',
            installmentNumber: 2,
            dueDate: new Date('2024-02-15'),
            interestPaise: 1000,
            interestPaidPaise: 0,
            principalPaise: 10000,
            principalPaidPaise: 0,
          }),
        ],
        pendingPenalties: [],
        allocationOrder: [...DEFAULT_ORDER],
      });

      expect(result.totalInterestAllocated).toBe(1000);
      expect(result.totalPrincipalAllocated).toBe(10000);
      expect(result.excessAmount).toBe(0);
      // All allocations should reference the unpaid installment
      expect(result.allocations.every((a) => a.installmentId === 'i2-unpaid')).toBe(true);
    });

    it('should allocate to partially paid installment for remaining amount only', () => {
      const inst = buildInstallmentState({
        installmentId: 'partial',
        installmentNumber: 1,
        dueDate: new Date('2024-01-15'),
        principalPaise: 8000_00,
        principalPaidPaise: 3000_00,
        interestPaise: 1000_00,
        interestPaidPaise: 500_00,
      });

      const result = allocate({
        amountPaise: 5500_00,
        installments: [inst],
        pendingPenalties: [],
        allocationOrder: [...DEFAULT_ORDER],
      });

      // Interest remaining: 500_00, Principal remaining: 5000_00
      expect(result.totalInterestAllocated).toBe(500_00);
      expect(result.totalPrincipalAllocated).toBe(5000_00);
      expect(result.excessAmount).toBe(0);
    });
  });

  describe('advance payment across multiple future installments', () => {
    it('should clear overdue then advance into future installments', () => {
      const result = allocate({
        amountPaise: 25000,
        installments: [
          makeInstallment({
            installmentId: 'overdue',
            installmentNumber: 1,
            dueDate: new Date('2024-01-15'),
            interestPaise: 1000,
            principalPaise: 5000,
          }),
          makeInstallment({
            installmentId: 'current',
            installmentNumber: 2,
            dueDate: new Date('2024-02-15'),
            interestPaise: 1000,
            principalPaise: 5000,
          }),
          makeInstallment({
            installmentId: 'future',
            installmentNumber: 3,
            dueDate: new Date('2024-03-15'),
            interestPaise: 1000,
            principalPaise: 5000,
          }),
        ],
        pendingPenalties: [makePenalty({ penaltyId: 'p1', amountPaise: 500 })],
        allocationOrder: [...DEFAULT_ORDER],
      });

      // Penalty: 500, Interest: 3×1000=3000, Principal: 3×5000=15000, total=18500
      // Payment=25000, excess=25000-18500=6500
      expect(result.totalPenaltyAllocated).toBe(500);
      expect(result.totalInterestAllocated).toBe(3000);
      expect(result.totalPrincipalAllocated).toBe(15000);
      expect(result.excessAmount).toBe(6500);
    });
  });

  describe('no allocation lines exceed outstanding', () => {
    it('should never allocate more than outstanding for any component', () => {
      const result = allocate({
        amountPaise: 999999,
        installments: [
          makeInstallment({
            installmentId: 'i1',
            interestPaise: 500,
            principalPaise: 3000,
          }),
        ],
        pendingPenalties: [makePenalty({ penaltyId: 'p1', amountPaise: 200 })],
        allocationOrder: [...DEFAULT_ORDER],
      });

      for (const line of result.allocations) {
        expect(line.amountPaise).toBeGreaterThan(0);
      }
      expect(result.totalPenaltyAllocated).toBe(200);
      expect(result.totalInterestAllocated).toBe(500);
      expect(result.totalPrincipalAllocated).toBe(3000);
      expect(result.excessAmount).toBe(999999 - 200 - 500 - 3000);
    });
  });
});
