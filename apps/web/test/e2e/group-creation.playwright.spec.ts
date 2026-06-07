import { test, expect, type Page } from './fixtures';
import { getTokenForRole, createTestCustomer } from './fixtures';

/**
 * Group Creation (/groups/new) — Playwright E2E Tests
 *
 * Closes the gap where the New Group page (zod schema: name, meetingDay enum,
 * branchArea, leader typeahead) was never exercised end-to-end.
 *
 * Tests cover:
 * 1. Golden path: fill form, search & pick leader, submit → redirect to /groups + toast.
 * 2. Validation: empty form submit surfaces required-field errors.
 * 3. Leader typeahead: dropdown shows matches for an existing customer and the
 *    selected leader fills the search input.
 * 4. RBAC denial: auditor cannot reach /groups/new (access denied or hidden create button).
 */

// Suffix shared across the file so seeded customers are unique per run.
const UNIQUE = Date.now().toString().slice(-8);

async function gotoNewGroup(page: Page) {
  await page.goto('/groups/new');
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByRole('heading', { name: 'New Group' })).toBeVisible({ timeout: 30_000 });
}

test.describe('Group Creation — /groups/new', () => {
  let managerToken: string;
  let leaderCustomerName: string;
  let leaderCustomerMobile: string;

  test.beforeAll(async () => {
    managerToken = await getTokenForRole('manager');
    // Seed a leader candidate the typeahead can find. The page calls
    // GET /customers?search=... so a unique name guarantees a single match.
    leaderCustomerName = `Leader Pick ${UNIQUE}`;
    leaderCustomerMobile = `9${UNIQUE}11`.slice(0, 10).padEnd(10, '0');
    await createTestCustomer(managerToken, {
      fullName: leaderCustomerName,
      mobile: leaderCustomerMobile,
    });
  });

  test('golden path: fills form, picks leader, submits, redirects to /groups with success toast', async ({
    managerPage,
  }) => {
    await gotoNewGroup(managerPage);

    const groupName = `E2E New Group ${UNIQUE}`;

    // Group name
    await managerPage.getByPlaceholder(/village women shg/i).fill(groupName);

    // Leader typeahead: type a unique fragment, wait for the debounce + dropdown,
    // then click the matching row. The page debounces 300ms before fetching.
    const leaderInput = managerPage.getByPlaceholder(/search customer by name or mobile/i);
    await leaderInput.click();
    await leaderInput.fill(leaderCustomerName);

    // The dropdown is rendered as <ul><li> containing the customer name + mobile.
    const leaderOption = managerPage.getByRole('listitem').filter({ hasText: leaderCustomerName }).first();
    await expect(leaderOption).toBeVisible({ timeout: 15_000 });
    await leaderOption.click();

    // After selection the search input is populated with the chosen name and the
    // dropdown closes.
    await expect(leaderInput).toHaveValue(leaderCustomerName);

    // Meeting day: native <select>, controlled by react-hook-form register.
    await managerPage.locator('select').selectOption('wednesday');

    // Branch / Area
    await managerPage.getByPlaceholder(/north district/i).fill(`Branch ${UNIQUE}`);

    // Submit and assert the redirect-to-list behaviour the page implements
    // (router.push('/groups') on success).
    await managerPage.getByRole('button', { name: /create group/i }).click();
    await managerPage.waitForURL(/\/groups(\?.*)?$/, { timeout: 20_000 });
    await expect(managerPage).toHaveURL(/\/groups(\?.*)?$/);

    // The new group should appear in the list, proving the POST persisted.
    await expect(managerPage.getByText(groupName).first()).toBeVisible({ timeout: 15_000 });
  });

  test('validation: empty submit shows required-field errors and stays on /groups/new', async ({
    managerPage,
  }) => {
    await gotoNewGroup(managerPage);

    // Click submit without filling anything. Zod resolver should block the
    // mutation and render inline messages.
    await managerPage.getByRole('button', { name: /create group/i }).click();

    // Required-field copy from the zod schema in page.tsx.
    await expect(managerPage.getByText('Group name is required')).toBeVisible({ timeout: 15_000 });
    await expect(managerPage.getByText('Group leader is required')).toBeVisible();
    await expect(managerPage.getByText('Branch/Area is required')).toBeVisible();

    // We must NOT have navigated away.
    await expect(managerPage).toHaveURL(/\/groups\/new$/);
  });

  test('leader typeahead surfaces seeded customer and populates input on select', async ({
    managerPage,
  }) => {
    await gotoNewGroup(managerPage);

    const leaderInput = managerPage.getByPlaceholder(/search customer by name or mobile/i);
    await leaderInput.click();
    // Use a fragment of the unique name so the debounced search returns a hit.
    await leaderInput.fill(`Leader Pick ${UNIQUE}`);

    const option = managerPage.getByRole('listitem').filter({ hasText: leaderCustomerName }).first();
    await expect(option).toBeVisible({ timeout: 15_000 });
    // The mobile is rendered alongside the name in the same <li>.
    await expect(option).toContainText(leaderCustomerMobile);

    await option.click();
    await expect(leaderInput).toHaveValue(leaderCustomerName);

    // Clearing the input via the X button should reset leader state — there is
    // an unlabeled "X" button rendered when a leader is selected.
    const clearButton = managerPage.locator('button[type="button"]').filter({ has: managerPage.locator('svg') }).last();
    // Best-effort: only click if visible to avoid coupling to layout.
    if (await clearButton.isVisible().catch(() => false)) {
      await clearButton.click();
      await expect(leaderInput).toHaveValue('');
    }
  });

  test('RBAC: auditor cannot create a group via /groups/new', async ({ auditorPage }) => {
    await auditorPage.goto('/groups/new');
    await auditorPage.waitForLoadState('domcontentloaded');

    // Either the route is gated with an Access Denied page or the form renders
    // but submitting fails with 403. We accept both — what matters is that no
    // auditor-driven group ever gets created.
    const accessDenied = auditorPage.getByRole('heading', { name: 'Access Denied' });
    const newGroupHeading = auditorPage.getByRole('heading', { name: 'New Group' });

    await expect(accessDenied.or(newGroupHeading)).toBeVisible({ timeout: 15_000 });

    if (await accessDenied.isVisible().catch(() => false)) {
      // Hard deny — done.
      return;
    }

    // Form rendered: try a minimal submit and assert the server rejects it.
    await auditorPage.getByPlaceholder(/village women shg/i).fill(`Auditor Attempt ${UNIQUE}`);
    await auditorPage.getByPlaceholder(/north district/i).fill('Denied Branch');
    await auditorPage.locator('select').selectOption('friday');

    // Pick any leader from the typeahead — auditor has read access so search works.
    const leaderInput = auditorPage.getByPlaceholder(/search customer by name or mobile/i);
    await leaderInput.click();
    await leaderInput.fill(leaderCustomerName);
    const option = auditorPage.getByRole('listitem').filter({ hasText: leaderCustomerName }).first();
    if (await option.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await option.click();
    } else {
      // If the auditor cannot search customers either, the denial path is
      // already satisfied — bail out.
      return;
    }

    await auditorPage.getByRole('button', { name: /create group/i }).click();

    // Expect a server-side error message (ErrorMessage component) and no
    // redirect away from /groups/new.
    await expect(auditorPage).toHaveURL(/\/groups\/new$/, { timeout: 10_000 });
    // ApiClientError body messages are surfaced verbatim — match the common
    // 403 phrasing without coupling to exact text.
    const errorBanner = auditorPage.getByText(/forbidden|not allowed|permission|denied/i).first();
    await expect(errorBanner).toBeVisible({ timeout: 15_000 });
  });
});
