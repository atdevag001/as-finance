import { describe, it, expect, beforeAll } from 'vitest';
import * as fc from 'fast-check';
import { getApiBaseUrl, getUserTokens, getSeedData } from '../helpers/seed.js';
import { createAuthClients, type AuthClients } from '../helpers/auth-client.js';
import { createDbUtils, type DbUtils } from '../helpers/db-utils.js';
import { recordExpense } from '../helpers/factories.js';
import { arbPaiseAmount } from '../helpers/arbitraries.js';
import type { SeedData } from '../setup/global-setup.js';

/**
 * Cashbook Reconciliation Property-Based Tests
 *
 * Verifies the cashbook balance invariant against the real API and database:
 *
 * - Property 26: Cashbook Reconciliation — closing_balance == opening_balance +
 *   sum(inflows) − sum(outflows). The cashbook balance never silently drifts
 *   from the sum of its constituent transactions.
 *
 * Validates: Requirements 13.1, 13.2
 */

describe('Cashbook Reconciliation PBT', () => {
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

  // ─── Property 26: Cashbook Reconciliation ───────────────────────────────

  /**
   * **Validates: Requirements 13.1, 13.2**
   *
   * Property 26: Cashbook Reconciliation
   *
   * For all date ranges queried against the cashbook, the closing balance SHALL
   * equal: opening_balance + sum(inflows) − sum(outflows). The cashbook balance
   * SHALL never silently drift from the sum of its constituent transactions.
   */
  describe('Property 26: Cashbook Reconciliation', () => {
    it('closing_balance == opening_balance + sum(inflows) - sum(outflows) after random expenses', async () => {
      // Use a fixed date for all iterations to accumulate expenses on the same day
      const testDate = new Date().toISOString().split('T')[0]!;

      // Constrain expense amounts to a reasonable range (₹1 to ₹10,000)
      const expenseAmountArb = fc.integer({ min: 100, max: 10_000_00 });

      await fc.assert(
        fc.asyncProperty(expenseAmountArb, async (amountPaise) => {
          // 1. Record the cashbook balance BEFORE the operation via dbUtils
          const balanceBefore = await dbUtils.getCashbookBalance(testDate);

          // Verify the invariant holds before the operation
          expect(balanceBefore.closing).toBe(
            balanceBefore.opening + balanceBefore.inflows - balanceBefore.outflows,
          );

          // 2. Record an expense via the API (POST /cashbook/expenses)
          const expense = await recordExpense(clients.accountant, {
            category: 'travel',
            amountPaise,
            date: testDate,
            description: `PBT cashbook reconciliation ${Date.now()}_${Math.random()}`,
          });

          expect(expense).toBeDefined();

          // 3. Record the cashbook balance AFTER the operation
          const balanceAfter = await dbUtils.getCashbookBalance(testDate);

          // 4. Verify: closing_balance == opening_balance + sum(inflows) - sum(outflows)
          expect(balanceAfter.closing).toBe(
            balanceAfter.opening + balanceAfter.inflows - balanceAfter.outflows,
          );

          // 5. Verify the balance never silently drifts:
          //    - Opening balance should remain the same (transactions before this date unchanged)
          expect(balanceAfter.opening).toBe(balanceBefore.opening);

          //    - Outflows should have increased by exactly the expense amount
          expect(balanceAfter.outflows).toBe(
            balanceBefore.outflows + BigInt(amountPaise),
          );

          //    - Inflows should remain unchanged (expense is an outflow only)
          expect(balanceAfter.inflows).toBe(balanceBefore.inflows);

          //    - Closing balance should have decreased by exactly the expense amount
          expect(balanceAfter.closing).toBe(
            balanceBefore.closing - BigInt(amountPaise),
          );
        }),
        { numRuns: 100 },
      );
    });
  });
});
