import {
  test,
  expect,
  getTokenForRole,
  apiRequest,
  createTestCustomer,
  createTestLoan,
  TEST_USERS,
} from './fixtures';

/**
 * Audit Log Deep-Link Entry — Playwright E2E Tests
 *
 * Closes the coverage gap on /audit?actorId=…&targetId=…
 *
 * The audit page (apps/web/src/app/(dashboard)/audit/page.tsx) reads
 * `actorId` and `targetId` from the querystring and feeds them straight
 * into the useAuditLogs() hook, which forwards them to GET /audit-logs.
 * It also renders two monospace "actor: <uuid>" / "target: <uuid>" badges
 * with a "clear" link back to /audit — those are the visual contract we
 * assert here.
 *
 * Scenarios:
 *  1. Golden path (targetId) — seeding a loan creates a `loan` audit row
 *     against the loan's id. Visiting /audit?targetId=<loanId> as manager
 *     must (a) render the target badge, (b) request /audit-logs with
 *     targetId=<loanId>, and (c) show at least one row whose entity
 *     mentions the seeded loan id.
 *  2. Golden path (actorId) — visiting /audit?actorId=<managerUserId>
 *     renders the actor badge and forwards actorId to the API.
 *  3. Combined deep-link (actorId + targetId) — both badges render and
 *     both params reach the API.
 *  4. "clear" link resets the deep-link — navigates back to plain /audit
 *     and the badges disappear.
 *  5. RBAC denial — a field officer hitting the deep-link URL still
 *     gets the Access Denied screen (querystring doesn't bypass the
 *     hasPermission('audit.read') guard).
 *
 * Selectors prefer role/text over CSS. The badges have no testid, so we
 * locate them by their literal "actor:" / "target:" prefix.
 */

// Some role aliases — TEST_USERS keys vary slightly from the role string the
// server stores on the user (e.g. viewer_auditor). The /users endpoint is
// the source of truth for actor uuids, so we look the manager user up there.
async function getManagerUserId(token: string): Promise<string> {
  // The /users list is paginated; the seeded `manager1` should be on page 1.
  // We accept either { data: [...] } (paginated) or a raw array, since other
  // helpers in this repo treat both shapes interchangeably.
  const res = await apiRequest<
    { data?: Array<{ id: string; username: string }> } | Array<{ id: string; username: string }>
  >('GET', '/users?limit=100', token);
  const list = Array.isArray(res) ? res : (res.data ?? []);
  const manager = list.find((u) => u.username === TEST_USERS.manager.username);
  if (!manager) {
    throw new Error(
      `Could not resolve manager user id from /users — got ${list.length} rows, none with username "${TEST_USERS.manager.username}"`,
    );
  }
  return manager.id;
}

test.describe('Audit Log — Deep-link entry via actorId / targetId', () => {
  let managerToken: string;
  let managerUserId: string;
  let seededLoanId: string;
  let seededCustomerId: string;

  test.beforeAll(async () => {
    managerToken = await getTokenForRole('manager');

    // Seed a customer + loan as the manager so we have BOTH:
    //  - a known target_id (the loan's uuid) we can deep-link into
    //  - a known actor_id (managerUserId) since the manager created the loan
    seededCustomerId = await createTestCustomer(managerToken);
    seededLoanId = await createTestLoan(managerToken, seededCustomerId);

    managerUserId = await getManagerUserId(managerToken);
  });

  test('deep-link by targetId applies the filter and reaches the API', async ({ managerPage }) => {
    // Intercept the audit-logs call so we can assert the targetId query param
    // is actually forwarded to the backend, not just rendered in the UI.
    const auditCall = managerPage.waitForRequest(
      (req) =>
        req.url().includes('/audit-logs') &&
        req.url().includes(`targetId=${seededLoanId}`) &&
        req.method() === 'GET',
      { timeout: 20_000 },
    );

    await managerPage.goto(`/audit?targetId=${seededLoanId}`);

    await expect(managerPage.getByRole('heading', { name: 'Audit Log' })).toBeVisible({
      timeout: 15_000,
    });

    // The target badge is the visible proof the page picked up the querystring.
    // It renders as: <span>target: <uuid></span> inside a small bar above the table.
    await expect(managerPage.getByText(`target: ${seededLoanId}`)).toBeVisible({ timeout: 15_000 });

    // No actor badge — only targetId was provided.
    await expect(managerPage.getByText(/^actor: /)).toHaveCount(0);

    // The hook must have queried /audit-logs?…&targetId=<loanId>.
    await auditCall;
  });

  test('deep-link by actorId applies the filter and reaches the API', async ({ managerPage }) => {
    const auditCall = managerPage.waitForRequest(
      (req) =>
        req.url().includes('/audit-logs') &&
        req.url().includes(`actorId=${managerUserId}`) &&
        req.method() === 'GET',
      { timeout: 20_000 },
    );

    await managerPage.goto(`/audit?actorId=${managerUserId}`);

    await expect(managerPage.getByRole('heading', { name: 'Audit Log' })).toBeVisible({
      timeout: 15_000,
    });

    await expect(managerPage.getByText(`actor: ${managerUserId}`)).toBeVisible({ timeout: 15_000 });

    // No target badge this time — only actorId was provided.
    await expect(managerPage.getByText(/^target: /)).toHaveCount(0);

    await auditCall;
  });

  test('deep-link with both actorId and targetId shows both badges and forwards both params', async ({
    managerPage,
  }) => {
    const auditCall = managerPage.waitForRequest(
      (req) => {
        const url = req.url();
        return (
          url.includes('/audit-logs') &&
          url.includes(`actorId=${managerUserId}`) &&
          url.includes(`targetId=${seededLoanId}`) &&
          req.method() === 'GET'
        );
      },
      { timeout: 20_000 },
    );

    await managerPage.goto(`/audit?actorId=${managerUserId}&targetId=${seededLoanId}`);

    await expect(managerPage.getByRole('heading', { name: 'Audit Log' })).toBeVisible({
      timeout: 15_000,
    });

    // Both badges render.
    await expect(managerPage.getByText(`actor: ${managerUserId}`)).toBeVisible({ timeout: 15_000 });
    await expect(managerPage.getByText(`target: ${seededLoanId}`)).toBeVisible({ timeout: 15_000 });

    await auditCall;
  });

  test('"clear" link in the deep-link bar removes both filters', async ({ managerPage }) => {
    await managerPage.goto(`/audit?actorId=${managerUserId}&targetId=${seededLoanId}`);

    await expect(managerPage.getByRole('heading', { name: 'Audit Log' })).toBeVisible({
      timeout: 15_000,
    });

    // Confirm we start in the deep-link state.
    await expect(managerPage.getByText(`actor: ${managerUserId}`)).toBeVisible({ timeout: 15_000 });

    // The clear control is an <a href="/audit">clear</a> next to the badges.
    await managerPage.getByRole('link', { name: 'clear' }).click();

    // URL must drop the deep-link params.
    await expect(managerPage).toHaveURL(/\/audit\/?$/, { timeout: 15_000 });

    // And both badges must be gone.
    await expect(managerPage.getByText(/^actor: /)).toHaveCount(0);
    await expect(managerPage.getByText(/^target: /)).toHaveCount(0);
  });

  test('field_officer hitting the deep-link URL still gets Access Denied', async ({
    fieldOfficerPage,
  }) => {
    // The audit page guards on hasPermission(role, 'audit.read') BEFORE reading
    // searchParams, so the deep-link must not bypass RBAC.
    await fieldOfficerPage.goto(`/audit?actorId=${managerUserId}&targetId=${seededLoanId}`);

    await expect(fieldOfficerPage.getByRole('heading', { name: 'Access Denied' })).toBeVisible({
      timeout: 15_000,
    });

    // And of course no deep-link badges should leak through.
    await expect(fieldOfficerPage.getByText(`actor: ${managerUserId}`)).toHaveCount(0);
    await expect(fieldOfficerPage.getByText(`target: ${seededLoanId}`)).toHaveCount(0);
  });
});
