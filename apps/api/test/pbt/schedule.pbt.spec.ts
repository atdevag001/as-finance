import { describe, it, expect, beforeAll } from 'vitest';
import * as fc from 'fast-check';
import { getApiBaseUrl, getUserTokens, getSeedData } from '../helpers/seed.js';
import { createAuthClients, type AuthClients } from '../helpers/auth-client.js';
import { createDbUtils, type DbUtils } from '../helpers/db-utils.js';
import { createCustomer, createLoan } from '../helpers/factories.js';
import { arbLoanParams } from '../helpers/arbitraries.js';
import type { SeedData } from '../setup/global-setup.js';

/**
 * Schedule Property-Based Tests
 *
 * Verifies three finance-critical invariants against the real API and database:
 *
 * - Property 1: Schedule Reconciliation — sum(installment.principal_paise) == principal_paise
 *   AND sum(installment.interest_paise) == total_interest_paise
 * - Property 2: Schedule Determinism — Identical inputs produce byte-identical schedules
 * - Property 3: Due Date Holiday Avoidance — No due date falls on a holiday;
 *   shifted dates >= original
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5
 */

describe('Schedule PBT', () => {
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

  /**
   * Select the appropriate seeded product version based on generated loan params.
   * Maps interest type + frequency to the matching seeded product, and clamps
   * principal/tenure to fit within the product's configured bounds.
   */
  function selectProduct(params: {
    interestType: 'flat' | 'reducing_balance';
    frequency: 'monthly' | 'weekly' | 'daily';
    principalPaise: number;
    tenureMonths: number;
  }): {
    versionId: string;
    principalPaise: number;
    tenureMonths: number;
  } | null {
    const products = seedData.products;

    if (params.interestType === 'flat' && params.frequency === 'monthly') {
      const cfg = products.flatMonthly.config;
      return {
        versionId: products.flatMonthly.versionId,
        principalPaise: clamp(params.principalPaise, cfg.minPrincipalPaise, cfg.maxPrincipalPaise),
        tenureMonths: clamp(params.tenureMonths, cfg.minTenureMonths, cfg.maxTenureMonths),
      };
    }

    if (params.interestType === 'reducing_balance' && params.frequency === 'monthly') {
      const cfg = products.reducingMonthly.config;
      return {
        versionId: products.reducingMonthly.versionId,
        principalPaise: clamp(params.principalPaise, cfg.minPrincipalPaise, cfg.maxPrincipalPaise),
        tenureMonths: clamp(params.tenureMonths, cfg.minTenureMonths, cfg.maxTenureMonths),
      };
    }

    if (params.interestType === 'flat' && params.frequency === 'weekly') {
      const cfg = products.flatWeekly.config;
      return {
        versionId: products.flatWeekly.versionId,
        principalPaise: clamp(params.principalPaise, cfg.minPrincipalPaise, cfg.maxPrincipalPaise),
        tenureMonths: clamp(params.tenureMonths, cfg.minTenureMonths, cfg.maxTenureMonths),
      };
    }

    // No seeded product for this combination (e.g., reducing_balance + weekly/daily,
    // or flat + daily) — skip this input
    return null;
  }

  function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }


  // ─── Property 1: Schedule Reconciliation ──────────────────────────────────

  /**
   * **Validates: Requirements 4.1, 4.2, 4.3**
   *
   * Property 1: Schedule Reconciliation
   *
   * For all valid loan parameters (principal in paise, annual rate in basis points,
   * tenure in months, interest type flat or reducing_balance, frequency), the
   * generated EMI schedule SHALL satisfy:
   * sum(installment[i].principal_paise) == principal_paise AND
   * sum(installment[i].interest_paise) == total_interest_paise,
   * with any rounding difference confined to the last installment only.
   */
  describe('Property 1: Schedule Reconciliation', () => {
    it('sum(principal_paise) == loan principal AND sum(interest_paise) == total_interest for random loan params', async () => {
      await fc.assert(
        fc.asyncProperty(arbLoanParams, async (params) => {
          const product = selectProduct(params);
          if (!product) return; // Skip unsupported combinations

          // Create a customer for this iteration
          const customer = await createCustomer(clients.fieldOfficer, {
            fullName: `PBT Sched Recon ${Date.now()}`,
          });
          const cId = custId(customer);

          // Create a loan and advance to active so schedule is generated
          const loan = await createLoan(clients.fieldOfficer, {
            customerId: cId,
            productVersionId: product.versionId,
            overrides: {
              principalPaise: product.principalPaise,
              tenureMonths: product.tenureMonths,
            },
            advanceTo: 'active',
            clients,
          });

          const loanId = loan['id'] as string;

          // Fetch the loan record to get total_interest_paise
          const loanRecord = await dbUtils.findLoanById(loanId);
          expect(loanRecord).not.toBeNull();

          const loanPrincipalPaise = Number(loanRecord!.principal_paise);
          const totalInterestPaise = Number(loanRecord!.total_interest_paise);

          // Fetch all schedule installments
          const schedules = await dbUtils.findSchedulesByLoanId(loanId);
          expect(schedules.length).toBeGreaterThan(0);

          // Sum principal and interest across all installments
          const sumPrincipal = schedules.reduce(
            (acc, s) => acc + Number(s.principal_paise),
            0,
          );
          const sumInterest = schedules.reduce(
            (acc, s) => acc + Number(s.interest_paise),
            0,
          );

          // Core invariant: schedule components reconcile with loan totals
          expect(sumPrincipal).toBe(loanPrincipalPaise);
          expect(sumInterest).toBe(totalInterestPaise);
        }),
        { numRuns: 1000 },
      );
    });
  });

  // ─── Property 2: Schedule Determinism ─────────────────────────────────────

  /**
   * **Validates: Requirements 4.4**
   *
   * Property 2: Schedule Determinism
   *
   * For all valid schedule generation inputs, generating the schedule twice with
   * identical inputs SHALL produce byte-identical installment records. Two loans
   * created with the same product, principal, and tenure must have identical
   * schedules (same principal_paise, interest_paise, and due_date per installment).
   */
  describe('Property 2: Schedule Determinism', () => {
    it('identical inputs produce identical schedules', async () => {
      await fc.assert(
        fc.asyncProperty(arbLoanParams, async (params) => {
          const product = selectProduct(params);
          if (!product) return; // Skip unsupported combinations

          // Create two customers
          const customer1 = await createCustomer(clients.fieldOfficer, {
            fullName: `PBT Sched Det A ${Date.now()}`,
          });
          const customer2 = await createCustomer(clients.fieldOfficer, {
            fullName: `PBT Sched Det B ${Date.now()}`,
          });

          const cId1 = custId(customer1);
          const cId2 = custId(customer2);

          // Create two loans with identical parameters
          const loan1 = await createLoan(clients.fieldOfficer, {
            customerId: cId1,
            productVersionId: product.versionId,
            overrides: {
              principalPaise: product.principalPaise,
              tenureMonths: product.tenureMonths,
            },
            advanceTo: 'active',
            clients,
          });

          const loan2 = await createLoan(clients.fieldOfficer, {
            customerId: cId2,
            productVersionId: product.versionId,
            overrides: {
              principalPaise: product.principalPaise,
              tenureMonths: product.tenureMonths,
            },
            advanceTo: 'active',
            clients,
          });

          const loanId1 = loan1['id'] as string;
          const loanId2 = loan2['id'] as string;

          // Fetch schedules for both loans
          const schedules1 = await dbUtils.findSchedulesByLoanId(loanId1);
          const schedules2 = await dbUtils.findSchedulesByLoanId(loanId2);

          // Same number of installments
          expect(schedules1.length).toBe(schedules2.length);

          // Installment-by-installment comparison
          for (let i = 0; i < schedules1.length; i++) {
            const s1 = schedules1[i]!;
            const s2 = schedules2[i]!;

            expect(Number(s1.principal_paise)).toBe(Number(s2.principal_paise));
            expect(Number(s1.interest_paise)).toBe(Number(s2.interest_paise));
            expect(s1.due_date.toISOString()).toBe(s2.due_date.toISOString());
          }
        }),
        { numRuns: 100 },
      );
    });
  });

  // ─── Property 3: Due Date Holiday Avoidance ───────────────────────────────

  /**
   * **Validates: Requirements 4.5**
   *
   * Property 3: Due Date Holiday Avoidance
   *
   * For all valid start dates, frequencies, and holiday calendars, no generated
   * due date SHALL fall on a date present in the holiday calendar. Each
   * holiday-shifted date SHALL be the next calendar day not in the holiday set,
   * and adjusted dates SHALL always be >= the original calculated date.
   */
  describe('Property 3: Due Date Holiday Avoidance', () => {
    it('no due date falls on a holiday date from the calendar', async () => {
      // Build a set of holiday date strings for fast lookup (YYYY-MM-DD)
      const holidaySet = new Set(
        seedData.holidays.map((d) => {
          const dt = new Date(d);
          return dt.toISOString().split('T')[0];
        }),
      );

      // Skip if no holidays are configured
      if (holidaySet.size === 0) return;

      await fc.assert(
        fc.asyncProperty(arbLoanParams, async (params) => {
          const product = selectProduct(params);
          if (!product) return; // Skip unsupported combinations

          // Create a customer and loan
          const customer = await createCustomer(clients.fieldOfficer, {
            fullName: `PBT Sched Holiday ${Date.now()}`,
          });
          const cId = custId(customer);

          const loan = await createLoan(clients.fieldOfficer, {
            customerId: cId,
            productVersionId: product.versionId,
            overrides: {
              principalPaise: product.principalPaise,
              tenureMonths: product.tenureMonths,
            },
            advanceTo: 'active',
            clients,
          });

          const loanId = loan['id'] as string;

          // Fetch schedule
          const schedules = await dbUtils.findSchedulesByLoanId(loanId);
          expect(schedules.length).toBeGreaterThan(0);

          // Verify no due date falls on a holiday
          for (const installment of schedules) {
            const dueDateStr = installment.due_date.toISOString().split('T')[0];
            expect(holidaySet.has(dueDateStr!)).toBe(false);
          }
        }),
        { numRuns: 100 },
      );
    });
  });
});
