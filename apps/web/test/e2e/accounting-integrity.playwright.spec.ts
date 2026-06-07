import {
  test,
  expect,
  getTokenForRole,
  apiRequest,
  createTestCustomer,
  createTestLoan,
  advanceLoanToStatus,
  createTestCollection,
} from './fixtures';

/**
 * Accounting Data Integrity — Playwright E2E Tests
 *
 * Closes the gap left by `accounting.playwright.spec.ts`, which only asserts
 * that headings and Debit/Credit columns render. None of the existing specs
 * post a finance event and then verify the core double-entry invariants:
 *
 *   1. Trial Balance: total debits == total credits  (i.e. isBalanced)
 *   2. P&L net profit  == sum(income) - sum(expenses)
 *   3. Balance Sheet:  totalAssets == totalLiabilities + totalEquity + retainedEarnings
 *
 * These tests:
 *   - Seed a real finance event (loan disbursement + cash collection) via the
 *     authoritative API endpoints, so journal entries are written through the
 *     production code path (no manual JE writes).
 *   - Reload each accounting report through the API AND verify the UI surfaces
 *     the same balanced state — so a regression in either layer is caught.
 *   - Cover RBAC denial for the report endpoints (field_officer, collection_officer).
 *
 * The UI assertions key off `data-testid="trial-balance-unbalanced"` (already
 * present in the page) and the "Balanced: ..." banner text from the
 * balance-sheet page — both are stable, observable user-visible states.
 */

interface TrialBalanceResponse {
  asOfDate: string;
  rows: Array<{
    code: string;
    name: string;
    category: string;
    debitBalancePaise: string;
    creditBalancePaise: string;
  }>;
  totalDebitBalancePaise: string;
  totalCreditBalancePaise: string;
  isBalanced: boolean;
}

interface ProfitLossResponse {
  startDate: string;
  endDate: string;
  income: Array<{ name: string; amountPaise: string }>;
  expenses: Array<{ name: string; amountPaise: string }>;
  totalIncomePaise: string;
  totalExpensePaise: string;
  netProfitPaise: string;
}

interface BalanceSheetResponse {
  asOfDate: string;
  assets: Array<{ name: string; balancePaise: string }>;
  liabilities: Array<{ name: string; balancePaise: string }>;
  equity: Array<{ name: string; balancePaise: string }>;
  retainedEarningsPaise: string;
  totalAssetsPaise: string;
  totalLiabilitiesPaise: string;
  totalEquityPaise: string;
  totalLiabilitiesAndEquityPaise: string;
  isBalanced: boolean;
}

const todayISO = (): string => new Date().toISOString().split('T')[0]!;

test.describe('Accounting Data Integrity', () => {
  let managerToken: string;
  let seededLoanId: string;

  test.beforeAll(async () => {
    managerToken = await getTokenForRole('manager');

    // Seed a complete loan lifecycle so the GL has real journal entries to balance.
    // - Disbursement writes DR loan_receivable / CR cash (or bank).
    // - Collection writes DR cash / CR loan_receivable (+ interest income).
    const customerId = await createTestCustomer(managerToken, {
      fullName: `Accounting Integrity Customer ${Date.now()}`,
    });

    seededLoanId = await createTestLoan(managerToken, customerId, undefined, {
      principalPaise: 5_000_000, // ₹50,000
      tenureMonths: 12,
    });

    await advanceLoanToStatus(managerToken, seededLoanId, 'active');

    // Post a small cash collection so income (interest) and a debit-side
    // cash movement both land in the same accounting period as the disbursement.
    // Best-effort: if the loan has no due installments yet (e.g. first EMI in
    // future), the collection may be rejected — the disbursement alone is
    // sufficient for the trial balance invariant.
    try {
      await createTestCollection(managerToken, seededLoanId, 100_000); // ₹1,000
    } catch {
      // Ignore — disbursement already created enough journal activity.
    }
  });

  test.describe('Trial Balance invariant — total debits == total credits', () => {
    test('API trial balance is balanced after a real disbursement + collection', async () => {
      const trialBalance = await apiRequest<TrialBalanceResponse>(
        'GET',
        `/accounting/trial-balance?asOfDate=${todayISO()}`,
        managerToken,
      );

      // The seeded loan should have generated at least one journal entry,
      // so the report cannot be empty.
      expect(trialBalance.rows.length).toBeGreaterThan(0);

      // Core invariant: backend's own balanced flag must be true.
      expect(trialBalance.isBalanced).toBe(true);

      // Independently re-compute the totals to catch the case where
      // `isBalanced` is true but totals were corrupted in serialization.
      const recomputedDebit = trialBalance.rows.reduce(
        (sum, r) => sum + BigInt(r.debitBalancePaise),
        0n,
      );
      const recomputedCredit = trialBalance.rows.reduce(
        (sum, r) => sum + BigInt(r.creditBalancePaise),
        0n,
      );
      expect(recomputedDebit.toString()).toBe(trialBalance.totalDebitBalancePaise);
      expect(recomputedCredit.toString()).toBe(trialBalance.totalCreditBalancePaise);
      expect(recomputedDebit).toBe(recomputedCredit);
    });

    test('UI trial balance page does NOT show the unbalanced alert', async ({ accountantPage }) => {
      await accountantPage.goto(`/accounting/trial-balance`);
      await expect(
        accountantPage.getByRole('heading', { name: 'Trial Balance' }),
      ).toBeVisible({ timeout: 20_000 });
      await accountantPage.waitForLoadState('networkidle');

      // If the GL ever goes out of balance the page exposes a red alert with
      // data-testid="trial-balance-unbalanced". For a healthy GL it MUST be absent.
      await expect(
        accountantPage.getByTestId('trial-balance-unbalanced'),
      ).toHaveCount(0);

      // And the Debit/Credit column headers should still be visible.
      await expect(accountantPage.getByText('Debit', { exact: true }).first()).toBeVisible();
      await expect(accountantPage.getByText('Credit', { exact: true }).first()).toBeVisible();
    });
  });

  test.describe('Profit & Loss invariant — net profit == income - expenses', () => {
    test('API P&L net profit equals total income minus total expenses', async () => {
      const start = '2000-01-01'; // inception so we capture every JE
      const end = todayISO();

      const pl = await apiRequest<ProfitLossResponse>(
        'GET',
        `/accounting/profit-loss?startDate=${start}&endDate=${end}`,
        managerToken,
      );

      const sumIncome = pl.income.reduce(
        (sum, i) => sum + BigInt(i.amountPaise),
        0n,
      );
      const sumExpense = pl.expenses.reduce(
        (sum, e) => sum + BigInt(e.amountPaise),
        0n,
      );

      // Server-reported totals must match the per-account sums (no drift).
      expect(sumIncome.toString()).toBe(pl.totalIncomePaise);
      expect(sumExpense.toString()).toBe(pl.totalExpensePaise);

      // Net profit is the fundamental P&L equation.
      const computedNet = sumIncome - sumExpense;
      expect(computedNet.toString()).toBe(pl.netProfitPaise);
    });

    test('UI P&L page renders income/expense and a Net Profit total', async ({ accountantPage }) => {
      await accountantPage.goto('/accounting/profit-loss');
      await expect(
        accountantPage.getByRole('heading', { name: /profit/i }),
      ).toBeVisible({ timeout: 20_000 });

      // Set a wide date window so any seeded journal activity is included.
      const dateInputs = accountantPage.locator('input[type="date"]');
      await dateInputs.nth(0).fill('2000-01-01');
      await dateInputs.nth(1).fill(todayISO());
      await accountantPage.waitForLoadState('networkidle');

      // Net Profit row is the load-bearing assertion for this report.
      await expect(accountantPage.getByText('Net Profit')).toBeVisible({ timeout: 15_000 });
      await expect(accountantPage.getByText('Total Income')).toBeVisible();
      await expect(accountantPage.getByText('Total Expenses')).toBeVisible();
    });
  });

  test.describe('Balance Sheet invariant — Assets == Liabilities + Equity + Retained Earnings', () => {
    test('API balance sheet is balanced after a real disbursement', async () => {
      const bs = await apiRequest<BalanceSheetResponse>(
        'GET',
        `/accounting/balance-sheet?asOfDate=${todayISO()}`,
        managerToken,
      );

      // Server's own balanced flag.
      expect(bs.isBalanced).toBe(true);

      // Independently re-derive the accounting equation from category sums to
      // guard against a regression where isBalanced is true but the underlying
      // totals are wrong.
      const totalAssets = BigInt(bs.totalAssetsPaise);
      const totalLiab = BigInt(bs.totalLiabilitiesPaise);
      const totalEquity = BigInt(bs.totalEquityPaise);
      const retained = BigInt(bs.retainedEarningsPaise);
      const totalLiabEquity = BigInt(bs.totalLiabilitiesAndEquityPaise);

      expect(totalLiab + totalEquity + retained).toBe(totalLiabEquity);
      expect(totalAssets).toBe(totalLiabEquity);
    });

    test('UI balance-sheet page shows the green "Balanced" banner', async ({ accountantPage }) => {
      await accountantPage.goto('/accounting/balance-sheet');
      await expect(
        accountantPage.getByRole('heading', { name: /balance sheet/i }),
      ).toBeVisible({ timeout: 20_000 });
      await accountantPage.waitForLoadState('networkidle');

      // Banner text comes verbatim from the page component when isBalanced=true.
      await expect(
        accountantPage.getByText(/Balanced:\s+Assets\s+=\s+Liabilities\s+\+\s+Equity\s+\+\s+Retained Earnings/i),
      ).toBeVisible({ timeout: 15_000 });

      // The "Imbalanced" wording must NOT be present in a healthy state.
      await expect(accountantPage.getByText(/^Imbalanced:/i)).toHaveCount(0);
    });
  });

  test.describe('Cross-report consistency', () => {
    test('P&L net profit equals balance-sheet retained earnings (inception to today)', async () => {
      // When the date range is "since inception" the two values are by
      // construction the same number — any divergence is a bug in one of
      // the three report queries.
      const start = '2000-01-01';
      const end = todayISO();

      const [pl, bs] = await Promise.all([
        apiRequest<ProfitLossResponse>(
          'GET',
          `/accounting/profit-loss?startDate=${start}&endDate=${end}`,
          managerToken,
        ),
        apiRequest<BalanceSheetResponse>(
          'GET',
          `/accounting/balance-sheet?asOfDate=${end}`,
          managerToken,
        ),
      ]);

      expect(pl.netProfitPaise).toBe(bs.retainedEarningsPaise);
    });
  });

  test.describe('RBAC denial', () => {
    test('field_officer cannot read trial balance via API', async () => {
      const fieldToken = await getTokenForRole('field_officer');
      await expect(
        apiRequest('GET', `/accounting/trial-balance?asOfDate=${todayISO()}`, fieldToken),
      ).rejects.toThrow(/403|forbidden|permission/i);
    });

    test('collection_officer cannot read balance sheet via API', async () => {
      const collectionToken = await getTokenForRole('collection_officer');
      await expect(
        apiRequest('GET', `/accounting/balance-sheet?asOfDate=${todayISO()}`, collectionToken),
      ).rejects.toThrow(/403|forbidden|permission/i);
    });

    test('field_officer sees Access Denied on the trial balance UI', async ({ fieldOfficerPage }) => {
      await fieldOfficerPage.goto('/accounting/trial-balance');
      await expect(
        fieldOfficerPage.getByRole('heading', { name: 'Access Denied' }),
      ).toBeVisible({ timeout: 15_000 });
    });
  });

  test.describe('Validation / error handling', () => {
    test('invalid asOfDate is rejected by the API with a 4xx', async () => {
      // Asserts the report endpoint validates query input rather than
      // silently returning a degenerate (empty) report or 500.
      await expect(
        apiRequest('GET', `/accounting/trial-balance?asOfDate=not-a-date`, managerToken),
      ).rejects.toThrow(/40\d|invalid|bad request/i);
    });

    test('P&L endpoint rejects an inverted date range', async () => {
      // endDate < startDate — the DTO validator should reject this.
      // If the API currently allows it (returns 0 income / 0 expense),
      // this test documents the gap so we can tighten validation.
      await expect(
        apiRequest(
          'GET',
          `/accounting/profit-loss?startDate=2030-01-01&endDate=2020-01-01`,
          managerToken,
        ),
      ).rejects.toThrow(/40\d|invalid|range|date/i);
    });
  });
});
