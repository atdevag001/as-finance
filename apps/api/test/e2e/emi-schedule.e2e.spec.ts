import { describe, it, expect, beforeAll } from 'vitest';
import { getApiBaseUrl, getUserTokens, getSeedData } from '../helpers/seed.js';
import { createAuthClients, type AuthClients } from '../helpers/auth-client.js';
import { createDbUtils, type DbUtils } from '../helpers/db-utils.js';
import { createCustomer, createLoan } from '../helpers/factories.js';
import type { SeedData } from '../setup/global-setup.js';

/**
 * EMI Schedule Generation E2E Tests
 *
 * Verifies that EMI schedule generation produces mathematically correct,
 * deterministic schedules against real database persistence. Covers flat
 * and reducing balance calculations, schedule reconciliation, determinism,
 * holiday adjustments, and rounding correctness.
 *
 * Validates: Requirements 4.1–4.6; Properties 1, 2, 3
 */

describe('EMI Schedule E2E', () => {
  let clients: AuthClients;
  let dbUtils: DbUtils;
  let seedData: SeedData;

  beforeAll(() => {
    const apiBaseUrl = getApiBaseUrl();
    const tokens = getUserTokens();
    clients = createAuthClients(apiBaseUrl, tokens);
    dbUtils = createDbUtils();
    seedData = getSeedData();
  });

  /** Extract customer ID from factory response. */
  function custId(c: Record<string, unknown>): string {
    return (c['customer'] as Record<string, unknown>)?.['id'] as string ?? c['id'] as string;
  }

  /** Extract loan ID from factory response. */
  function loanId(l: Record<string, unknown>): string {
    return l['id'] as string;
  }

  // ─── 4.1 Flat Interest Schedule ───────────────────────────────────────

  describe('flat interest schedule: total interest = principal × rate × tenure / 12, equal installments', () => {
    it('should generate a flat schedule with correct total interest and equal installments', async () => {
      const customer = await createCustomer(clients.fieldOfficer, {
        fullName: 'EMI Flat Schedule Customer',
      });
      const principalPaise = 10_000_00; // ₹10,000
      const annualRateBps = seedData.products.flatMonthly.config.annualRateBps; // 1200 = 12%
      const tenureMonths = 12;

      // Create loan and advance to active (schedule generated at approval/disbursement)
      const loan = await createLoan(clients.fieldOfficer, {
        customerId: custId(customer),
        productVersionId: seedData.products.flatMonthly.versionId,
        overrides: { principalPaise, tenureMonths },
        advanceTo: 'active',
        clients,
      });

      // Fetch schedule from DB
      const schedules = await dbUtils.findSchedulesByLoanId(loanId(loan));
      expect(schedules.length).toBe(tenureMonths);

      // Expected total interest: P × R/10000 × T/12, rounded HALF_UP
      const expectedTotalInterest = Math.round(
        (principalPaise * annualRateBps * tenureMonths) / (10000 * 12),
      );

      // Verify total interest across all installments
      const actualTotalInterest = schedules.reduce(
        (sum, s) => sum + Number(s.interest_paise),
        0,
      );
      expect(actualTotalInterest).toBe(expectedTotalInterest);

      // Verify equal installments (first N-1 should be identical)
      const regularInstallments = schedules.slice(0, -1);
      if (regularInstallments.length > 1) {
        const firstPrincipal = Number(regularInstallments[0]!.principal_paise);
        const firstInterest = Number(regularInstallments[0]!.interest_paise);

        for (const inst of regularInstallments) {
          expect(Number(inst.principal_paise)).toBe(firstPrincipal);
          expect(Number(inst.interest_paise)).toBe(firstInterest);
        }
      }

      // Verify installment numbers are sequential 1..N
      for (let i = 0; i < schedules.length; i++) {
        expect(schedules[i]!.installment_number).toBe(i + 1);
      }
    });
  });

  // ─── 4.2 Reducing Balance Schedule ──────────────────────────────────

  describe('reducing balance schedule: standard amortization formula, interest on outstanding principal', () => {
    it('should generate a reducing balance schedule with decreasing interest and increasing principal', async () => {
      const customer = await createCustomer(clients.fieldOfficer, {
        fullName: 'EMI Reducing Schedule Customer',
      });
      const principalPaise = 50_000_00; // ₹50,000
      const tenureMonths = 12;

      const loan = await createLoan(clients.fieldOfficer, {
        customerId: custId(customer),
        productVersionId: seedData.products.reducingMonthly.versionId,
        overrides: { principalPaise, tenureMonths },
        advanceTo: 'active',
        clients,
      });

      const schedules = await dbUtils.findSchedulesByLoanId(loanId(loan));
      expect(schedules.length).toBe(tenureMonths);

      // Verify interest decreases over time (reducing balance characteristic)
      // First installment should have higher interest than last
      const firstInterest = Number(schedules[0]!.interest_paise);
      const lastInterest = Number(schedules[schedules.length - 1]!.interest_paise);
      expect(firstInterest).toBeGreaterThan(lastInterest);

      // Verify principal increases over time
      const firstPrincipal = Number(schedules[0]!.principal_paise);
      const lastPrincipal = Number(schedules[schedules.length - 1]!.principal_paise);
      expect(lastPrincipal).toBeGreaterThan(firstPrincipal);

      // Verify EMI is roughly constant for first N-1 installments
      // (last installment absorbs rounding difference)
      const regularInstallments = schedules.slice(0, -1);
      if (regularInstallments.length > 1) {
        const firstTotal = Number(regularInstallments[0]!.total_paise);
        for (const inst of regularInstallments) {
          expect(Number(inst.total_paise)).toBe(firstTotal);
        }
      }

      // Verify total_paise = principal_paise + interest_paise for each installment
      for (const inst of schedules) {
        expect(Number(inst.total_paise)).toBe(
          Number(inst.principal_paise) + Number(inst.interest_paise),
        );
      }
    });
  });

  // ─── 4.3 Schedule Reconciliation ────────────────────────────────────

  describe('schedule reconciliation: sum of principal components = loan principal, sum of interest = total interest', () => {
    it('should reconcile flat schedule: sum(principal) = loan principal', async () => {
      const customer = await createCustomer(clients.fieldOfficer, {
        fullName: 'EMI Reconcile Flat Customer',
      });
      const principalPaise = 15_000_00;
      const tenureMonths = 6;

      const loan = await createLoan(clients.fieldOfficer, {
        customerId: custId(customer),
        productVersionId: seedData.products.flatMonthly.versionId,
        overrides: { principalPaise, tenureMonths },
        advanceTo: 'active',
        clients,
      });

      const schedules = await dbUtils.findSchedulesByLoanId(loanId(loan));

      // Sum of all principal components must equal loan principal
      const totalPrincipal = schedules.reduce(
        (sum, s) => sum + Number(s.principal_paise),
        0,
      );
      expect(totalPrincipal).toBe(principalPaise);

      // Sum of all interest components must equal total interest
      const totalInterest = schedules.reduce(
        (sum, s) => sum + Number(s.interest_paise),
        0,
      );
      // Total interest for flat: P × R/10000 × T/12, rounded HALF_UP
      const annualRateBps = seedData.products.flatMonthly.config.annualRateBps;
      const expectedTotalInterest = Math.round(
        (principalPaise * annualRateBps * tenureMonths) / (10000 * 12),
      );
      expect(totalInterest).toBe(expectedTotalInterest);

      // Sum of all total_paise must equal principal + total interest
      const totalPayable = schedules.reduce(
        (sum, s) => sum + Number(s.total_paise),
        0,
      );
      expect(totalPayable).toBe(principalPaise + expectedTotalInterest);
    });

    it('should reconcile reducing balance schedule: sum(principal) = loan principal', async () => {
      const customer = await createCustomer(clients.fieldOfficer, {
        fullName: 'EMI Reconcile Reducing Customer',
      });
      const principalPaise = 1_00_000_00; // ₹1,00,000
      const tenureMonths = 12;

      const loan = await createLoan(clients.fieldOfficer, {
        customerId: custId(customer),
        productVersionId: seedData.products.reducingMonthly.versionId,
        overrides: { principalPaise, tenureMonths },
        advanceTo: 'active',
        clients,
      });

      const schedules = await dbUtils.findSchedulesByLoanId(loanId(loan));

      // Sum of all principal components must equal loan principal exactly
      const totalPrincipal = schedules.reduce(
        (sum, s) => sum + Number(s.principal_paise),
        0,
      );
      expect(totalPrincipal).toBe(principalPaise);

      // Sum of interest must be positive (reducing balance generates interest)
      const totalInterest = schedules.reduce(
        (sum, s) => sum + Number(s.interest_paise),
        0,
      );
      expect(totalInterest).toBeGreaterThan(0);

      // Each installment: total = principal + interest
      for (const inst of schedules) {
        expect(Number(inst.total_paise)).toBe(
          Number(inst.principal_paise) + Number(inst.interest_paise),
        );
      }
    });
  });

  // ─── 4.4 Schedule Determinism ────────────────────────────────────────

  describe('schedule determinism: identical inputs produce identical output', () => {
    it('should produce identical schedules for two loans with identical parameters', async () => {
      const principalPaise = 20_000_00;
      const tenureMonths = 12;
      const productVersionId = seedData.products.flatMonthly.versionId;

      // Create two customers and two loans with identical parameters
      const customer1 = await createCustomer(clients.fieldOfficer, {
        fullName: 'EMI Determinism Customer 1',
      });
      const customer2 = await createCustomer(clients.fieldOfficer, {
        fullName: 'EMI Determinism Customer 2',
      });

      const loan1 = await createLoan(clients.fieldOfficer, {
        customerId: custId(customer1),
        productVersionId,
        overrides: { principalPaise, tenureMonths },
        advanceTo: 'active',
        clients,
      });

      const loan2 = await createLoan(clients.fieldOfficer, {
        customerId: custId(customer2),
        productVersionId,
        overrides: { principalPaise, tenureMonths },
        advanceTo: 'active',
        clients,
      });

      const schedules1 = await dbUtils.findSchedulesByLoanId(loanId(loan1));
      const schedules2 = await dbUtils.findSchedulesByLoanId(loanId(loan2));

      // Same number of installments
      expect(schedules1.length).toBe(schedules2.length);

      // Each installment should have identical principal, interest, and total
      for (let i = 0; i < schedules1.length; i++) {
        expect(Number(schedules1[i]!.principal_paise)).toBe(
          Number(schedules2[i]!.principal_paise),
        );
        expect(Number(schedules1[i]!.interest_paise)).toBe(
          Number(schedules2[i]!.interest_paise),
        );
        expect(Number(schedules1[i]!.total_paise)).toBe(
          Number(schedules2[i]!.total_paise),
        );
      }
    });

    it('should produce identical reducing balance schedules for identical parameters', async () => {
      const principalPaise = 50_000_00;
      const tenureMonths = 12;
      const productVersionId = seedData.products.reducingMonthly.versionId;

      const customer1 = await createCustomer(clients.fieldOfficer, {
        fullName: 'EMI Determinism Reducing 1',
      });
      const customer2 = await createCustomer(clients.fieldOfficer, {
        fullName: 'EMI Determinism Reducing 2',
      });

      const loan1 = await createLoan(clients.fieldOfficer, {
        customerId: custId(customer1),
        productVersionId,
        overrides: { principalPaise, tenureMonths },
        advanceTo: 'active',
        clients,
      });

      const loan2 = await createLoan(clients.fieldOfficer, {
        customerId: custId(customer2),
        productVersionId,
        overrides: { principalPaise, tenureMonths },
        advanceTo: 'active',
        clients,
      });

      const schedules1 = await dbUtils.findSchedulesByLoanId(loanId(loan1));
      const schedules2 = await dbUtils.findSchedulesByLoanId(loanId(loan2));

      expect(schedules1.length).toBe(schedules2.length);

      for (let i = 0; i < schedules1.length; i++) {
        expect(Number(schedules1[i]!.principal_paise)).toBe(
          Number(schedules2[i]!.principal_paise),
        );
        expect(Number(schedules1[i]!.interest_paise)).toBe(
          Number(schedules2[i]!.interest_paise),
        );
        expect(Number(schedules1[i]!.total_paise)).toBe(
          Number(schedules2[i]!.total_paise),
        );
      }
    });
  });

  // ─── 4.5 Holiday Adjustment ─────────────────────────────────────────

  describe('holiday adjustment: due dates shifted to next business day', () => {
    it('should not have any due date falling on a seeded holiday', async () => {
      const customer = await createCustomer(clients.fieldOfficer, {
        fullName: 'EMI Holiday Adjustment Customer',
      });

      const loan = await createLoan(clients.fieldOfficer, {
        customerId: custId(customer),
        productVersionId: seedData.products.flatMonthly.versionId,
        overrides: { principalPaise: 10_000_00, tenureMonths: 12 },
        advanceTo: 'active',
        clients,
      });

      const schedules = await dbUtils.findSchedulesByLoanId(loanId(loan));

      // Build a set of holiday date strings (YYYY-MM-DD) from seed data
      const holidaySet = new Set(
        seedData.holidays.map((h) => {
          const d = new Date(h);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }),
      );

      // No due date should fall on a holiday
      for (const inst of schedules) {
        const dueDate = new Date(inst.due_date);
        const dateKey = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}-${String(dueDate.getDate()).padStart(2, '0')}`;
        expect(holidaySet.has(dateKey)).toBe(false);
      }
    });

    it('should have due dates in chronological order', async () => {
      const customer = await createCustomer(clients.fieldOfficer, {
        fullName: 'EMI Holiday Order Customer',
      });

      const loan = await createLoan(clients.fieldOfficer, {
        customerId: custId(customer),
        productVersionId: seedData.products.flatMonthly.versionId,
        overrides: { principalPaise: 10_000_00, tenureMonths: 12 },
        advanceTo: 'active',
        clients,
      });

      const schedules = await dbUtils.findSchedulesByLoanId(loanId(loan));

      // Due dates should be in strictly ascending order
      for (let i = 1; i < schedules.length; i++) {
        const prev = new Date(schedules[i - 1]!.due_date).getTime();
        const curr = new Date(schedules[i]!.due_date).getTime();
        expect(curr).toBeGreaterThan(prev);
      }
    });
  });

  // ─── 4.6 Rounding: Decimal.js ROUND_HALF_UP, Difference Absorbed by Last Installment ─

  describe('rounding: Decimal.js ROUND_HALF_UP, difference absorbed by last installment', () => {
    it('should absorb rounding difference in the last installment for flat schedule', async () => {
      const customer = await createCustomer(clients.fieldOfficer, {
        fullName: 'EMI Rounding Flat Customer',
      });
      // Use a principal that creates rounding: 10001 paise / 12 installments
      const principalPaise = 10_001_00;
      const tenureMonths = 12;

      const loan = await createLoan(clients.fieldOfficer, {
        customerId: custId(customer),
        productVersionId: seedData.products.flatMonthly.versionId,
        overrides: { principalPaise, tenureMonths },
        advanceTo: 'active',
        clients,
      });

      const schedules = await dbUtils.findSchedulesByLoanId(loanId(loan));
      expect(schedules.length).toBe(tenureMonths);

      // Sum of principal must exactly equal the loan principal (no money lost or created)
      const totalPrincipal = schedules.reduce(
        (sum, s) => sum + Number(s.principal_paise),
        0,
      );
      expect(totalPrincipal).toBe(principalPaise);

      // All values must be non-negative integers (no floating point)
      for (const inst of schedules) {
        expect(Number(inst.principal_paise)).toBeGreaterThanOrEqual(0);
        expect(Number(inst.interest_paise)).toBeGreaterThanOrEqual(0);
        expect(Number(inst.total_paise)).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(Number(inst.principal_paise))).toBe(true);
        expect(Number.isInteger(Number(inst.interest_paise))).toBe(true);
        expect(Number.isInteger(Number(inst.total_paise))).toBe(true);
      }

      // The last installment may differ from regular installments (absorbs rounding)
      const regularInstallments = schedules.slice(0, -1);
      const lastInstallment = schedules[schedules.length - 1]!;

      if (regularInstallments.length > 1) {
        const regularPrincipal = Number(regularInstallments[0]!.principal_paise);
        const lastPrincipal = Number(lastInstallment.principal_paise);

        // The difference between last and regular should be small (rounding only)
        const diff = Math.abs(lastPrincipal - regularPrincipal);
        // Rounding difference should be at most N-1 paise (one per regular installment)
        expect(diff).toBeLessThanOrEqual(tenureMonths - 1);
      }
    });

    it('should absorb rounding difference in the last installment for reducing balance schedule', async () => {
      const customer = await createCustomer(clients.fieldOfficer, {
        fullName: 'EMI Rounding Reducing Customer',
      });
      const principalPaise = 33_333_00; // Odd amount to force rounding
      const tenureMonths = 7; // Odd tenure

      const loan = await createLoan(clients.fieldOfficer, {
        customerId: custId(customer),
        productVersionId: seedData.products.reducingMonthly.versionId,
        overrides: { principalPaise, tenureMonths },
        advanceTo: 'active',
        clients,
      });

      const schedules = await dbUtils.findSchedulesByLoanId(loanId(loan));
      expect(schedules.length).toBe(tenureMonths);

      // Sum of principal must exactly equal the loan principal
      const totalPrincipal = schedules.reduce(
        (sum, s) => sum + Number(s.principal_paise),
        0,
      );
      expect(totalPrincipal).toBe(principalPaise);

      // All values must be non-negative integers
      for (const inst of schedules) {
        expect(Number(inst.principal_paise)).toBeGreaterThanOrEqual(0);
        expect(Number(inst.interest_paise)).toBeGreaterThanOrEqual(0);
        expect(Number(inst.total_paise)).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(Number(inst.principal_paise))).toBe(true);
        expect(Number.isInteger(Number(inst.interest_paise))).toBe(true);
        expect(Number.isInteger(Number(inst.total_paise))).toBe(true);
      }

      // Each installment: total = principal + interest
      for (const inst of schedules) {
        expect(Number(inst.total_paise)).toBe(
          Number(inst.principal_paise) + Number(inst.interest_paise),
        );
      }
    });
  });
});
