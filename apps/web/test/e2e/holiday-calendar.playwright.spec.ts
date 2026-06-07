import { test, expect, getTokenForRole, apiRequest } from './fixtures';

/**
 * Holiday Calendar (HolidaySection) — Playwright E2E Tests
 *
 * Covers a previously-uncovered critical area on /settings: the HolidaySection
 * component drives the system-wide holiday calendar that every loan schedule
 * (EMI shift, working-day rollover) reads. The existing settings spec only
 * asserts the page heading; this file exercises the actual flows:
 *
 *   1. Golden path — admin can add a future-dated holiday and see it in the table
 *   2. Validation — duplicate dates and past dates are rejected client-side
 *      with a visible inline error and the PUT is NOT issued
 *   3. Remove flow — clicking the trash icon opens a ConfirmDialog; confirm
 *      removes the row, cancel leaves it untouched (no silent destruction)
 *   4. RBAC — manager (settings.read only) sees the section but neither the
 *      Add form nor the per-row Remove buttons; field_officer is denied entirely
 *
 * Seeding is done via the /settings/holidays PUT endpoint using a super_admin
 * token (apiRequest) so each test starts from a known calendar state without
 * coupling to whatever seed.ts left behind.
 */

// Anchor everything to the current IST year so the UI's "Holiday Calendar — YYYY"
// year filter actually shows the seeded dates. Using new Date() locally is fine
// here — the cross-tz boundary risk noted in the component only matters around
// IST midnight, and the test will retry/refetch on flake.
const CURRENT_YEAR = new Date().getFullYear();

// Use dates deep inside the current year so we're not racing year-rollover and
// so "past date" / "future date" assertions are unambiguous regardless of when
// the suite runs (any day from Jan 2 through Dec 30 yields valid past+future).
const PAST_HOLIDAY = `${CURRENT_YEAR}-01-01`;
const FUTURE_HOLIDAY = `${CURRENT_YEAR}-12-25`;
const DUPLICATE_HOLIDAY = `${CURRENT_YEAR}-08-15`; // Independence Day — safe duplicate target

/**
 * Replace the entire holiday calendar with the given list. The backend uses
 * PUT semantics (full replace), so callers don't need to merge.
 */
async function seedHolidays(holidays: string[]): Promise<void> {
  const token = await getTokenForRole('super_admin');
  await apiRequest('PUT', '/settings/holidays', token, { holidays });
}

test.describe('Holiday Calendar — Add Flow', () => {
  test.beforeEach(async () => {
    // Empty calendar so "add" assertions don't collide with stale data and so
    // the duplicate test can deterministically seed exactly one row.
    await seedHolidays([]);
  });

  test('admin can add a future-dated holiday and it appears in the table', async ({ adminPage }) => {
    await adminPage.goto('/settings');
    await expect(
      adminPage.getByRole('heading', { name: `Holiday Calendar — ${CURRENT_YEAR}` }),
    ).toBeVisible({ timeout: 15_000 });

    // Empty-state copy proves the seed worked (no leftover rows)
    await expect(
      adminPage.getByText(`No holidays configured for ${CURRENT_YEAR}.`),
    ).toBeVisible({ timeout: 15_000 });

    // Date input is wired to <Label htmlFor="holiday-date">Date</Label>
    await adminPage.getByLabel('Date', { exact: true }).fill(FUTURE_HOLIDAY);
    await adminPage.getByRole('button', { name: 'Add Holiday' }).click();

    // Behaviour assertion: a row with the new date renders, AND the success
    // toast fires. Together these prove the PUT was issued and React Query
    // invalidated the holidays cache.
    const newRow = adminPage.getByRole('row').filter({
      has: adminPage.locator(`time[datetime="${FUTURE_HOLIDAY}"]`),
    });
    await expect(newRow).toBeVisible({ timeout: 15_000 });

    await expect(
      adminPage.getByRole('status').filter({ hasText: 'Holiday added' }),
    ).toBeVisible({ timeout: 15_000 });

    // The date input is cleared after a successful add — guards against the
    // regression where double-click would re-submit the same date.
    await expect(adminPage.getByLabel('Date', { exact: true })).toHaveValue('');
  });

  test('rejects duplicate dates with an inline error and does not issue the PUT', async ({ adminPage }) => {
    await seedHolidays([DUPLICATE_HOLIDAY]);

    await adminPage.goto('/settings');
    await expect(
      adminPage.getByRole('heading', { name: `Holiday Calendar — ${CURRENT_YEAR}` }),
    ).toBeVisible({ timeout: 15_000 });

    // Confirm the seeded row is present before we try to duplicate it.
    await expect(
      adminPage.locator(`time[datetime="${DUPLICATE_HOLIDAY}"]`),
    ).toBeVisible({ timeout: 15_000 });

    // Spy on the PUT — duplicate detection is client-side, so the network
    // call must NOT fire. This is the only way to prove "silent dedupe"
    // doesn't leak through.
    let putCount = 0;
    await adminPage.route('**/settings/holidays', async (route) => {
      if (route.request().method() === 'PUT') putCount += 1;
      await route.continue();
    });

    await adminPage.getByLabel('Date', { exact: true }).fill(DUPLICATE_HOLIDAY);
    await adminPage.getByRole('button', { name: 'Add Holiday' }).click();

    // The component renders the error via <ErrorMessage> which is role=alert.
    await expect(
      adminPage.getByRole('alert').filter({
        hasText: `${DUPLICATE_HOLIDAY} is already in the holiday calendar.`,
      }),
    ).toBeVisible({ timeout: 15_000 });

    // Give any (incorrectly issued) request a moment to land before asserting 0.
    await adminPage.waitForTimeout(500);
    expect(putCount).toBe(0);
  });

  test('rejects past dates with an inline error', async ({ adminPage }) => {
    await adminPage.goto('/settings');
    await expect(
      adminPage.getByRole('heading', { name: `Holiday Calendar — ${CURRENT_YEAR}` }),
    ).toBeVisible({ timeout: 15_000 });

    let putCount = 0;
    await adminPage.route('**/settings/holidays', async (route) => {
      if (route.request().method() === 'PUT') putCount += 1;
      await route.continue();
    });

    await adminPage.getByLabel('Date', { exact: true }).fill(PAST_HOLIDAY);
    await adminPage.getByRole('button', { name: 'Add Holiday' }).click();

    await expect(
      adminPage.getByRole('alert').filter({
        hasText: 'Cannot add a holiday in the past.',
      }),
    ).toBeVisible({ timeout: 15_000 });

    await adminPage.waitForTimeout(500);
    expect(putCount).toBe(0);
  });
});

test.describe('Holiday Calendar — Remove Flow', () => {
  test('clicking remove opens a confirm dialog and confirming deletes the row', async ({ adminPage }) => {
    await seedHolidays([FUTURE_HOLIDAY]);

    await adminPage.goto('/settings');
    const row = adminPage.locator(`time[datetime="${FUTURE_HOLIDAY}"]`);
    await expect(row).toBeVisible({ timeout: 15_000 });

    // The per-row remove button uses aria-label="Remove holiday {dateStr}".
    await adminPage
      .getByRole('button', { name: `Remove holiday ${FUTURE_HOLIDAY}` })
      .click();

    // ConfirmDialog renders as role=dialog with title "Remove holiday?" — this
    // is the safety net that prevents a misclick from rewriting every loan's
    // working-day schedule, so we assert it appeared.
    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText('Remove holiday?')).toBeVisible();
    await expect(
      dialog.getByText(/This affects all future loan schedules/i),
    ).toBeVisible();

    await dialog.getByRole('button', { name: 'Remove' }).click();

    // Behaviour: the row disappears AND the success toast fires. The empty
    // state then re-renders since this was the only holiday.
    await expect(row).not.toBeVisible({ timeout: 15_000 });
    await expect(
      adminPage.getByRole('status').filter({ hasText: 'Holiday removed' }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      adminPage.getByText(`No holidays configured for ${CURRENT_YEAR}.`),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('cancelling the confirm dialog leaves the holiday untouched and issues no PUT', async ({ adminPage }) => {
    await seedHolidays([FUTURE_HOLIDAY]);

    await adminPage.goto('/settings');
    const row = adminPage.locator(`time[datetime="${FUTURE_HOLIDAY}"]`);
    await expect(row).toBeVisible({ timeout: 15_000 });

    let putCount = 0;
    await adminPage.route('**/settings/holidays', async (route) => {
      if (route.request().method() === 'PUT') putCount += 1;
      await route.continue();
    });

    await adminPage
      .getByRole('button', { name: `Remove holiday ${FUTURE_HOLIDAY}` })
      .click();

    const dialog = adminPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    // Dialog should close.
    await expect(dialog).not.toBeVisible({ timeout: 15_000 });

    // Row should still be there — cancelling must be a no-op for the calendar.
    await expect(row).toBeVisible();

    // And critically, no destructive PUT must have fired.
    await adminPage.waitForTimeout(500);
    expect(putCount).toBe(0);
  });
});

test.describe('Holiday Calendar — RBAC', () => {
  test('manager (read-only) sees the calendar but no Add form or Remove buttons', async ({ managerPage }) => {
    // Seed a row so the manager has something to (not) be able to remove.
    await seedHolidays([FUTURE_HOLIDAY]);

    await managerPage.goto('/settings');
    await expect(
      managerPage.getByRole('heading', { name: `Holiday Calendar — ${CURRENT_YEAR}` }),
    ).toBeVisible({ timeout: 15_000 });

    // Row renders for the manager.
    await expect(
      managerPage.locator(`time[datetime="${FUTURE_HOLIDAY}"]`),
    ).toBeVisible({ timeout: 15_000 });

    // The Add form is gated by canUpdate — the date input and Add Holiday
    // button must NOT be in the DOM for a manager.
    await expect(
      managerPage.getByRole('button', { name: 'Add Holiday' }),
    ).toHaveCount(0);
    await expect(
      managerPage.getByLabel('Date', { exact: true }),
    ).toHaveCount(0);

    // The per-row Remove button is also gated by canUpdate.
    await expect(
      managerPage.getByRole('button', { name: `Remove holiday ${FUTURE_HOLIDAY}` }),
    ).toHaveCount(0);
  });

  test('field_officer is denied access to the settings page entirely', async ({ fieldOfficerPage }) => {
    await fieldOfficerPage.goto('/settings');

    // settings.read is restricted to SUPER_ADMIN + MANAGER, so the page
    // short-circuits to <AccessDenied />. The HolidaySection must not render.
    await expect(
      fieldOfficerPage.getByRole('heading', { name: 'Access Denied' }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      fieldOfficerPage.getByRole('heading', { name: /Holiday Calendar/ }),
    ).toHaveCount(0);
  });
});
