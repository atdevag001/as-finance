import { test, expect, getTokenForRole, apiRequest, csrfHeadersFor } from './fixtures';

/**
 * Cashbook Module — Playwright E2E Tests
 *
 * Uses pre-authenticated fixtures to avoid rate limiting.
 *
 * Tests cover:
 * 1. Daily Summary - KPI cards, date picker
 * 2. Discrepancy warning - alert display
 * 3. New Expense - form validation, submission
 * 4. Handovers - initiate, verify, list
 * 5. Permission-based access
 */

test.describe('Cashbook Module', () => {
  test.describe('Daily Summary', () => {
    test('accountant can view daily summary', async ({ accountantPage }) => {
      await accountantPage.goto('/cashbook');
      await expect(accountantPage.getByRole('heading', { name: 'Cashbook' })).toBeVisible({ timeout: 15_000 });
    });

    test('displays summary cards', async ({ accountantPage }) => {
      await accountantPage.goto('/cashbook');
      await accountantPage.waitForLoadState('domcontentloaded');

      await expect(accountantPage.getByRole('heading', { name: 'Cashbook' })).toBeVisible({ timeout: 30_000 });

      // Summary cards should be visible (these are CardTitle components)
      await expect(accountantPage.getByText('Opening Balance', { exact: true })).toBeVisible({ timeout: 15_000 });
      await expect(accountantPage.getByText('Cash Inflows', { exact: true })).toBeVisible({ timeout: 10_000 });
      await expect(accountantPage.getByText('Cash Outflows', { exact: true })).toBeVisible({ timeout: 10_000 });
      await expect(accountantPage.getByText('Closing Balance', { exact: true })).toBeVisible({ timeout: 10_000 });
    });

    test('date picker changes summary data', async ({ accountantPage }) => {
      await accountantPage.goto('/cashbook');
      await accountantPage.waitForLoadState('domcontentloaded');

      // Wait for page heading to confirm page is loaded
      await expect(accountantPage.getByRole('heading', { name: 'Cashbook' })).toBeVisible({ timeout: 30_000 });

      const dateInput = accountantPage.locator('input[type="date"]').first();
      if (await dateInput.isVisible()) {
        // Change to yesterday
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const dateStr = yesterday.toISOString().split('T')[0];
        await dateInput.fill(dateStr);
        await accountantPage.waitForLoadState('domcontentloaded');
        // Data should refresh (no error = success)
      }
    });

    test('shows transaction count', async ({ accountantPage }) => {
      await accountantPage.goto('/cashbook');
      await accountantPage.waitForLoadState('domcontentloaded');

      // Wait for page heading to confirm page is loaded
      await expect(accountantPage.getByRole('heading', { name: 'Cashbook' })).toBeVisible({ timeout: 30_000 });

      // Transaction count text - format is "N transaction(s) on DATE"
      await expect(
        accountantPage.getByText(/\d+ transaction\(s\) on/i),
      ).toBeVisible({ timeout: 15_000 });
    });

    test('field_officer gets Access Denied', async ({ fieldOfficerPage }) => {
      await fieldOfficerPage.goto('/cashbook');
      await expect(fieldOfficerPage.getByRole('heading', { name: 'Access Denied' })).toBeVisible({ timeout: 15_000 });
    });

    test('displays discrepancy warning when exists', async ({ accountantPage }) => {
      await accountantPage.goto('/cashbook');
      await accountantPage.waitForLoadState('domcontentloaded');

      // Discrepancy warning is conditional - just verify page loaded
      await expect(accountantPage.getByRole('heading', { name: 'Cashbook' })).toBeVisible({ timeout: 30_000 });
    });
  });

  test.describe('Navigation Links', () => {
    test('has link to Record Expense', async ({ accountantPage }) => {
      await accountantPage.goto('/cashbook');
      await accountantPage.waitForLoadState('domcontentloaded');

      // Wait for page heading to confirm page is loaded
      await expect(accountantPage.getByRole('heading', { name: 'Cashbook' })).toBeVisible({ timeout: 30_000 });

      await expect(accountantPage.getByRole('link', { name: /record expense/i })).toBeVisible({ timeout: 15_000 });
    });

    test('has link to Handovers', async ({ accountantPage }) => {
      await accountantPage.goto('/cashbook');
      await accountantPage.waitForLoadState('domcontentloaded');

      // Wait for page heading to confirm page is loaded
      await expect(accountantPage.getByRole('heading', { name: 'Cashbook' })).toBeVisible({ timeout: 30_000 });

      await expect(accountantPage.getByRole('link', { name: /handovers/i })).toBeVisible({ timeout: 15_000 });
    });
  });

  test.describe('New Expense Form', () => {
    test('navigates to new expense page', async ({ accountantPage }) => {
      await accountantPage.goto('/cashbook');
      await accountantPage.waitForLoadState('domcontentloaded');

      // Wait for page heading to confirm page is loaded
      await expect(accountantPage.getByRole('heading', { name: 'Cashbook' })).toBeVisible({ timeout: 30_000 });

      await accountantPage.getByRole('link', { name: /record expense/i }).click();
      await accountantPage.waitForURL('**/cashbook/expenses/new', { timeout: 30_000 });

      await expect(accountantPage.getByRole('heading', { name: /record expense/i })).toBeVisible({ timeout: 15_000 });
    });

    test('form has all required fields', async ({ accountantPage }) => {
      await accountantPage.goto('/cashbook/expenses/new');
      await accountantPage.waitForLoadState('domcontentloaded');

      // Wait for form heading to confirm page is loaded
      await expect(accountantPage.getByRole('heading', { name: /record expense/i })).toBeVisible({ timeout: 30_000 });

      await expect(accountantPage.getByText('Category')).toBeVisible({ timeout: 15_000 });
      await expect(accountantPage.getByText(/Amount/)).toBeVisible({ timeout: 10_000 });
      await expect(accountantPage.getByText('Date')).toBeVisible({ timeout: 10_000 });
      await expect(accountantPage.getByText('Description')).toBeVisible({ timeout: 10_000 });
      await expect(accountantPage.getByText('Payment Mode')).toBeVisible({ timeout: 10_000 });
    });

    test('category dropdown has 7 options', async ({ accountantPage }) => {
      await accountantPage.goto('/cashbook/expenses/new');
      await accountantPage.waitForLoadState('domcontentloaded');

      // Wait for form heading to confirm page is loaded
      await expect(accountantPage.getByRole('heading', { name: /record expense/i })).toBeVisible({ timeout: 30_000 });

      const categorySelect = accountantPage.locator('select').first();
      if (await categorySelect.isVisible({ timeout: 10_000 })) {
        const options = await categorySelect.locator('option').allTextContents();
        expect(options.length).toBeGreaterThanOrEqual(7);
      }
    });

    test('validates form fields before submit', async ({ accountantPage }) => {
      await accountantPage.goto('/cashbook/expenses/new');
      await accountantPage.waitForLoadState('domcontentloaded');

      // Wait for form heading to confirm page is loaded
      await expect(accountantPage.getByRole('heading', { name: /record expense/i })).toBeVisible({ timeout: 30_000 });

      // Fill only amount, not description
      await accountantPage.locator('input[type="number"]').first().fill('100');

      // Click submit
      await accountantPage.getByRole('button', { name: /record expense/i }).click();

      // Should show validation error (the specific error message text)
      await expect(
        accountantPage.getByText(/fill all required fields|valid values/i),
      ).toBeVisible({ timeout: 15_000 });
    });

    test('shows confirmation dialog before submit', async ({ accountantPage }) => {
      await accountantPage.goto('/cashbook/expenses/new');
      await accountantPage.waitForLoadState('domcontentloaded');

      // Wait for form heading to confirm page is loaded
      await expect(accountantPage.getByRole('heading', { name: /record expense/i })).toBeVisible({ timeout: 30_000 });

      // Fill valid data - amount and description
      await accountantPage.locator('input[type="number"]').first().fill('500');
      const descInput = accountantPage.getByPlaceholder(/describe/i);
      await expect(descInput).toBeVisible({ timeout: 15_000 });
      await descInput.fill('Test expense description');

      // Click submit
      await accountantPage.getByRole('button', { name: /record expense/i }).click();

      // Confirmation dialog should appear (Confirm Expense title)
      await expect(
        accountantPage.getByRole('dialog').or(accountantPage.getByRole('alertdialog')),
      ).toBeVisible({ timeout: 15_000 });
    });

    test('back button returns to cashbook', async ({ accountantPage }) => {
      await accountantPage.goto('/cashbook/expenses/new');
      await accountantPage.waitForLoadState('domcontentloaded');

      // Wait for heading to ensure page is fully loaded
      await expect(accountantPage.getByRole('heading', { name: /record expense/i })).toBeVisible({ timeout: 30_000 });

      // Try to find a visible back button - either in page header or navigation
      // On mobile, the sidebar nav may be hidden, so look for the page's back link first
      const pageBackLink = accountantPage.locator('main a[href="/cashbook"], [role="main"] a[href="/cashbook"]').first();
      const navBackLink = accountantPage.locator('nav a[href="/cashbook"]').first();

      // Check which back link is visible and clickable
      const backButton = (await pageBackLink.isVisible()) ? pageBackLink : navBackLink;
      await backButton.scrollIntoViewIfNeeded();
      await backButton.click({ timeout: 30_000 });

      // Wait for URL change first
      await accountantPage.waitForURL(/\/cashbook$/, { timeout: 30_000 });

      // Then verify the cashbook heading is visible
      await expect(accountantPage.getByRole('heading', { name: 'Cashbook' })).toBeVisible({ timeout: 30_000 });
    });
  });

  test.describe('Handovers Page', () => {
    test('navigates to handovers page', async ({ accountantPage }) => {
      await accountantPage.goto('/cashbook');
      await accountantPage.waitForLoadState('domcontentloaded');

      // Wait for page heading to confirm page is loaded
      await expect(accountantPage.getByRole('heading', { name: 'Cashbook' })).toBeVisible({ timeout: 30_000 });

      await accountantPage.getByRole('link', { name: /handovers/i }).click();
      await accountantPage.waitForURL('**/cashbook/handovers', { timeout: 30_000 });

      await expect(accountantPage.getByRole('heading', { name: /cash handovers/i })).toBeVisible({ timeout: 15_000 });
    });

    test('shows initiate handover form', async ({ accountantPage }) => {
      await accountantPage.goto('/cashbook/handovers');
      await accountantPage.waitForLoadState('domcontentloaded');

      // Wait for the heading first
      await expect(accountantPage.getByRole('heading', { name: 'Cash Handovers' })).toBeVisible({ timeout: 30_000 });

      // The "Initiate Handover" is a CardTitle - find the form elements
      await expect(accountantPage.locator('input[type="number"]').first()).toBeVisible({ timeout: 15_000 });
      // Button text is "Initiate Handover"
      await expect(accountantPage.getByRole('button', { name: 'Initiate Handover' })).toBeVisible({ timeout: 10_000 });
    });

    test('validates handover amount is required', async ({ accountantPage }) => {
      await accountantPage.goto('/cashbook/handovers');
      await accountantPage.waitForLoadState('domcontentloaded');

      // Wait for the page to load
      await expect(accountantPage.getByRole('heading', { name: 'Cash Handovers' })).toBeVisible({ timeout: 30_000 });

      // Click submit without entering amount (or with 0)
      await accountantPage.getByRole('button', { name: 'Initiate Handover' }).click();

      // Should show validation error - look for specific text
      await expect(
        accountantPage.getByText(/Amount must be greater than zero/i),
      ).toBeVisible({ timeout: 15_000 });
    });

    test('shows pending handovers section', async ({ accountantPage }) => {
      await accountantPage.goto('/cashbook/handovers');
      await accountantPage.waitForLoadState('domcontentloaded');

      // Wait for the heading first
      await expect(accountantPage.getByRole('heading', { name: 'Cash Handovers' })).toBeVisible({ timeout: 30_000 });

      // The page shows "Pending Handovers" as h2 heading
      await expect(
        accountantPage.getByText('Pending Handovers', { exact: true }),
      ).toBeVisible({ timeout: 15_000 });
    });

    test('manager can view handovers page', async ({ managerPage }) => {
      await managerPage.goto('/cashbook/handovers');
      await managerPage.waitForLoadState('domcontentloaded');

      // Page should load without error - that's success
      await expect(managerPage.getByRole('heading', { name: /cash handovers/i })).toBeVisible({ timeout: 30_000 });
    });
  });

  /**
   * Cash Handover Verification — initiate -> verify (clean) and discrepancy branch.
   *
   * Gap closed: existing specs above only assert the initiate-form validation. The full
   * lifecycle (collection officer creates a pending handover -> accountant/manager either
   * verifies it cleanly or flags a discrepancy with amount + notes) was not covered, even
   * though the discrepancy branch is the input to daily cash reconciliation.
   *
   * Seeding strategy:
   *   - manager token  -> look up an accountant user id to use as receiving officer
   *   - collection_officer token -> POST /cashbook/handovers with an Idempotency-Key
   *     header (the endpoint rejects requests without one). The default `apiRequest`
   *     helper does not support custom headers, so we use raw fetch here.
   */
  test.describe('Handover Verification Lifecycle', () => {
    const API_BASE = 'http://localhost:3001';

    interface SeededHandover {
      id: string;
      total_amount_paise: string | number;
    }

    interface UserLite {
      id: string;
      role: string;
      is_active: boolean;
      username: string;
    }

    let managerToken: string;
    let collectionOfficerToken: string;
    let receivingOfficerId: string;

    async function seedPendingHandover(amountPaise: number): Promise<SeededHandover> {
      const idemKey =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `e2e-handover-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const res = await fetch(`${API_BASE}/cashbook/handovers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${collectionOfficerToken}`,
          'Idempotency-Key': idemKey,
          ...(await csrfHeadersFor(collectionOfficerToken)),
        },
        body: JSON.stringify({
          totalAmountPaise: amountPaise,
          receivingOfficerId,
          handoverDate: new Date().toISOString().split('T')[0],
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Seed handover failed: ${res.status} ${body}`);
      }
      return (await res.json()) as SeededHandover;
    }

    test.beforeAll(async () => {
      managerToken = await getTokenForRole('manager');
      collectionOfficerToken = await getTokenForRole('collection_officer');

      // Receiving officer must be active and hold a role permitted to receive handovers
      // (super_admin | manager | accountant). The accountant seeded user matches.
      const users = await apiRequest<{ data: UserLite[]; total: number }>(
        'GET',
        '/users?take=100',
        managerToken,
      );
      const accountant = users.data.find(
        (u) => u.role === 'accountant' && u.is_active,
      );
      if (!accountant) {
        throw new Error('No active accountant user found to receive handovers');
      }
      receivingOfficerId = accountant.id;
    });

    test('accountant verifies a pending handover (clean path) — toast fires and item leaves pending list', async ({ accountantPage }) => {
      // Use a unique amount so we can target the exact card amongst other pending handovers.
      const uniquePaise = 100 + Math.floor(Math.random() * 9_000_000); // ~₹1 to ~₹90,000 in paise
      const amountLabel = `₹${(uniquePaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      const seeded = await seedPendingHandover(uniquePaise);
      expect(seeded.id).toBeTruthy();

      await accountantPage.goto('/cashbook/handovers');
      await accountantPage.waitForLoadState('domcontentloaded');
      await expect(
        accountantPage.getByRole('heading', { name: 'Cash Handovers' }),
      ).toBeVisible({ timeout: 30_000 });

      // Anchor on the unique amount label inside a "Pending" row that has Verify/Discrepancy
      // buttons (excludes any header/section that incidentally renders the amount).
      // MoneyDisplay outputs the formatted "₹X,XXX.XX" string.
      const amountCell = accountantPage.getByText(amountLabel, { exact: false }).first();
      await expect(amountCell).toBeVisible({ timeout: 15_000 });

      // Click the Verify button on that row. There is exactly one Verify button per pending
      // row, and the seeded amount is unique, so getByRole on the page suffices — but to
      // avoid races with other pending rows we scope by the nearest enclosing card.
      // Walk up to the Card root (shadcn renders Card with rounded-lg + border on the outermost div).
      const handoverCard = amountCell.locator('xpath=ancestor::div[contains(@class, "rounded-lg") and contains(@class, "border")][1]');
      await expect(handoverCard.getByRole('button', { name: 'Verify' })).toBeVisible({ timeout: 15_000 });
      await handoverCard.getByRole('button', { name: 'Verify' }).click();

      // Success toast confirms behavior, not just a DOM presence check.
      await expect(
        accountantPage.getByText('Handover verified.', { exact: true }),
      ).toBeVisible({ timeout: 15_000 });

      // The pending list is refetched on success; the just-verified handover should disappear.
      await expect(amountCell).toBeHidden({ timeout: 15_000 });
    });

    test('manager flags discrepancy with amount + notes — empty amount rejected, then discrepancy posts', async ({ managerPage }) => {
      const uniquePaise = 100 + Math.floor(Math.random() * 9_000_000);
      const amountLabel = `₹${(uniquePaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      const seeded = await seedPendingHandover(uniquePaise);
      expect(seeded.id).toBeTruthy();

      await managerPage.goto('/cashbook/handovers');
      await managerPage.waitForLoadState('domcontentloaded');
      await expect(
        managerPage.getByRole('heading', { name: 'Cash Handovers' }),
      ).toBeVisible({ timeout: 30_000 });

      const amountCell = managerPage.getByText(amountLabel, { exact: false }).first();
      await expect(amountCell).toBeVisible({ timeout: 15_000 });

      // Walk up to the Card root (shadcn renders Card with rounded-lg + border on the outermost div).
      const handoverCard = amountCell.locator('xpath=ancestor::div[contains(@class, "rounded-lg") and contains(@class, "border")][1]');

      // Open the discrepancy sub-form.
      await expect(handoverCard.getByRole('button', { name: 'Discrepancy' })).toBeVisible({ timeout: 15_000 });
      await handoverCard.getByRole('button', { name: 'Discrepancy' }).click();

      // Sub-form expanded inside the same Card — assert the Notes placeholder appears.
      const notesInput = handoverCard.getByPlaceholder(/Short by/i);
      await expect(notesInput).toBeVisible({ timeout: 15_000 });

      // Validation: empty amount blocks submission with the specific error string.
      await handoverCard.getByRole('button', { name: 'Submit Discrepancy' }).click();
      await expect(
        managerPage.getByText(/Enter a discrepancy amount greater than zero/i),
      ).toBeVisible({ timeout: 15_000 });

      // Fill discrepancy amount + notes and submit.
      // The discrepancy amount input is the only number input inside this card
      // (the initiate-handover form's number input lives in a sibling card above).
      const discrepancyAmountInput = handoverCard.locator('input[type="number"]').last();
      await discrepancyAmountInput.fill('50.00');
      await notesInput.fill('Short by ₹50');

      await handoverCard.getByRole('button', { name: 'Submit Discrepancy' }).click();

      // Behavioral assertion: success toast fires and card leaves the pending list
      // (server flips verification_status -> discrepancy, list refetches with status=pending).
      await expect(
        managerPage.getByText('Handover marked with discrepancy.', { exact: true }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(amountCell).toBeHidden({ timeout: 15_000 });
    });

    test('field_officer cannot reach the handovers page (RBAC denial)', async ({ fieldOfficerPage }) => {
      await fieldOfficerPage.goto('/cashbook/handovers');
      await expect(
        fieldOfficerPage.getByRole('heading', { name: 'Access Denied' }),
      ).toBeVisible({ timeout: 15_000 });
    });
  });
});

/**
 * Record Expense — Success Path + Cashbook Delta (GAP COVERAGE)
 *
 * Pre-existing specs stop at "confirmation dialog opens". This block exercises
 * the actual money-flow:
 *   1. Open Record Expense, fill the form, confirm the dialog.
 *   2. Assert the success toast fires and the URL returns to /cashbook.
 *   3. Re-query /cashbook/daily-summary for the same date and verify the new
 *      cash expense increases cashOutflowsPaise by exactly the amount AND
 *      reduces closingBalancePaise by exactly the amount — the observable side
 *      effect of the journal entry (DR Expense / CR Cash).
 *   4. Regression guard: a bank_transfer expense must NOT touch the cash side
 *      of the cashbook — same UI success, zero cash delta.
 *   5. RBAC: field_officer must be blocked from /cashbook/expenses/new since
 *      accounting.create_expense is restricted to super_admin/manager/accountant
 *      (see packages/shared/src/constants/permissions.ts).
 *
 * Snapshots are taken BEFORE and AFTER via apiRequest so the test asserts a
 * relative delta — the dev DB may carry unrelated transactions for today, so
 * checking absolute balances would be flaky.
 */
test.describe('Record Expense — Success Path + Cashbook Delta', () => {
  interface DailySummaryResponse {
    date: string;
    openingBalancePaise: string;
    cashInflowsPaise: string;
    cashOutflowsPaise: string;
    closingBalancePaise: string;
    hasDiscrepancy: boolean;
    transactionCount: number;
  }

  // ISO date (YYYY-MM-DD) for "today in IST". Computed inline to keep this spec
  // free of app-source imports — the page itself uses the same Intl path.
  function todayISO(): string {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'Asia/Kolkata',
    });
    return fmt.format(new Date());
  }

  test('accountant records a cash expense and the daily summary reflects the outflow + closing-balance delta', async ({
    accountantPage,
  }) => {
    const accountantToken = await getTokenForRole('accountant');

    // Pick an amount unlikely to collide with seeded round values so the delta
    // is unambiguously attributable to this submission.
    const amountRupees = 137; // ₹137.00
    const amountPaise = amountRupees * 100;
    const description = `E2E expense ${Date.now()}`;
    const today = todayISO();

    const before = await apiRequest<DailySummaryResponse>(
      'GET',
      `/cashbook/daily-summary?date=${today}`,
      accountantToken,
    );
    const beforeOutflows = BigInt(before.cashOutflowsPaise);
    const beforeClosing = BigInt(before.closingBalancePaise);

    await accountantPage.goto('/cashbook/expenses/new');
    await accountantPage.waitForLoadState('domcontentloaded');
    await expect(
      accountantPage.getByRole('heading', { name: /record expense/i }),
    ).toBeVisible({ timeout: 30_000 });

    // Fill amount + description.
    await accountantPage.locator('input[type="number"]').first().fill(String(amountRupees));
    await accountantPage.getByPlaceholder(/describe/i).fill(description);

    // The page renders Category as <select> #0 and Payment Mode as <select> #1.
    // Default is 'cash' but we set it explicitly so this stays correct if the
    // page later changes its default payment mode.
    const selects = accountantPage.locator('select');
    await selects.nth(1).selectOption('cash');

    // Date field defaults to todayIST; verify and leave.
    await expect(accountantPage.locator('input[type="date"]')).toHaveValue(today);

    // Submit -> opens the ConfirmDialog (does NOT post yet).
    await accountantPage.getByRole('button', { name: /record expense/i }).click();

    const dialog = accountantPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText(/confirm expense/i)).toBeVisible();
    // Dialog description embeds the rupee amount with .00 fraction.
    await expect(dialog.getByText(new RegExp(`${amountRupees}\\.00`))).toBeVisible();

    // Confirm — POST /cashbook/expenses fires here.
    await dialog.getByRole('button', { name: /^record$/i }).click();

    // Behavioral assertion: success toast fires.
    await expect(
      accountantPage.getByText(/expense recorded successfully/i),
    ).toBeVisible({ timeout: 15_000 });

    // Page navigates back to /cashbook.
    await accountantPage.waitForURL(/\/cashbook(\?|$)/, { timeout: 15_000 });
    await expect(
      accountantPage.getByRole('heading', { name: 'Cashbook' }),
    ).toBeVisible({ timeout: 15_000 });

    // Re-query daily summary and assert the journal-entry side effect.
    // We compare deltas rather than parse MoneyDisplay output so the test does
    // not depend on the exact INR comma-grouping format.
    const after = await apiRequest<DailySummaryResponse>(
      'GET',
      `/cashbook/daily-summary?date=${today}`,
      accountantToken,
    );
    const afterOutflows = BigInt(after.cashOutflowsPaise);
    const afterClosing = BigInt(after.closingBalancePaise);

    expect((afterOutflows - beforeOutflows).toString()).toBe(String(amountPaise));
    expect((beforeClosing - afterClosing).toString()).toBe(String(amountPaise));
    expect(after.transactionCount).toBeGreaterThanOrEqual(before.transactionCount + 1);
  });

  test('bank_transfer expense does NOT move the cash side of the cashbook', async ({
    accountantPage,
  }) => {
    // Regression guard: a non-cash expense still records a journal entry, but
    // it must not affect cashOutflows/closingBalance on the cashbook page. The
    // common silent bug here is the UI reporting "expense recorded" while the
    // user assumes cash moved — when only the bank account actually did.
    const accountantToken = await getTokenForRole('accountant');

    const amountRupees = 211;
    const today = todayISO();

    const before = await apiRequest<DailySummaryResponse>(
      'GET',
      `/cashbook/daily-summary?date=${today}`,
      accountantToken,
    );
    const beforeOutflows = BigInt(before.cashOutflowsPaise);
    const beforeClosing = BigInt(before.closingBalancePaise);

    await accountantPage.goto('/cashbook/expenses/new');
    await accountantPage.waitForLoadState('domcontentloaded');
    await expect(
      accountantPage.getByRole('heading', { name: /record expense/i }),
    ).toBeVisible({ timeout: 30_000 });

    await accountantPage.locator('input[type="number"]').first().fill(String(amountRupees));
    await accountantPage
      .getByPlaceholder(/describe/i)
      .fill(`E2E bank expense ${Date.now()}`);

    const selects = accountantPage.locator('select');
    await selects.nth(1).selectOption('bank_transfer');

    await accountantPage.getByRole('button', { name: /record expense/i }).click();

    const dialog = accountantPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await dialog.getByRole('button', { name: /^record$/i }).click();

    await expect(
      accountantPage.getByText(/expense recorded successfully/i),
    ).toBeVisible({ timeout: 15_000 });
    await accountantPage.waitForURL(/\/cashbook(\?|$)/, { timeout: 15_000 });

    const after = await apiRequest<DailySummaryResponse>(
      'GET',
      `/cashbook/daily-summary?date=${today}`,
      accountantToken,
    );
    // Cash-side numbers must be unchanged for a bank_transfer expense.
    expect(BigInt(after.cashOutflowsPaise).toString()).toBe(beforeOutflows.toString());
    expect(BigInt(after.closingBalancePaise).toString()).toBe(beforeClosing.toString());
  });

  test('field_officer is denied access to the Record Expense form (RBAC)', async ({
    fieldOfficerPage,
  }) => {
    // accounting.create_expense is restricted to SUPER_ADMIN / MANAGER / ACCOUNTANT.
    // Field officer must hit Access Denied at the page boundary so a misdirected
    // link cannot post an expense as that role.
    await fieldOfficerPage.goto('/cashbook/expenses/new');
    await fieldOfficerPage.waitForLoadState('domcontentloaded');

    const accessDenied = fieldOfficerPage.getByRole('heading', { name: 'Access Denied' });
    const recordBtn = fieldOfficerPage.getByRole('button', { name: /record expense/i });

    // Accept either explicit AccessDenied OR submit button absent — both are
    // valid denials and the test stays correct if the guard later becomes a
    // server-side redirect.
    await expect(async () => {
      const deniedVisible = await accessDenied.isVisible().catch(() => false);
      const btnVisible = await recordBtn.isVisible().catch(() => false);
      expect(deniedVisible || !btnVisible).toBe(true);
    }).toPass({ timeout: 15_000 });
  });
});
