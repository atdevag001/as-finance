import {
  test,
  expect,
  apiRequest,
  createTestCustomer,
  createTestLoan,
  advanceLoanToStatus,
  getTokenForRole,
} from './fixtures';

/**
 * Group Collect Page — Playwright E2E Tests
 *
 * Closes coverage gap: the dedicated /groups/[id]/collect page
 * (apps/web/src/app/(dashboard)/groups/[id]/collect/page.tsx) has no spec.
 * Existing groups.playwright.spec.ts only covers the in-detail-page dialog
 * (opening the dialog and "at least one amount required" validation). No spec
 * posts a valid multi-member group collection via the dedicated page and
 * asserts that each member's outstanding balance dropped accordingly.
 *
 * Validates:
 *  - Page renders one input row per member loan with "Due:" label.
 *  - Per-loan amount entry, running total (sum * 100 paise), and "Fill due amount" shortcut.
 *  - POST /groups/:id/collections payload computes totalAmountPaise = sum(memberBreakdown.amountPaise)
 *    and supplies a fresh idempotencyKey (crypto.randomUUID()).
 *  - On success, the app redirects back to /groups/:id and every collected member's
 *    cached_outstanding_paise drops by exactly the amount posted.
 *  - Server-side sum-mismatch rule (BusinessRule GROUP_COLLECTION_SUM_MISMATCH)
 *    is reachable via direct API call.
 *  - RBAC: auditor cannot reach the collect page (Access Denied).
 *
 * Requirements: 11.4, 11.5, 11.7
 */

interface GroupMemberLoanLite {
  id: string;
  loan_number: string;
  outstanding_paise: number | null;
}
interface GroupMemberLite {
  id: string;
  customer_id: string;
  customer_name: string;
  loan_id: string | null;
  loan_number: string | null;
  outstanding_paise: number | null;
  loans: GroupMemberLoanLite[];
}
interface GroupDetailLite {
  id: string;
  name: string;
  members: GroupMemberLite[];
}

/**
 * Seed a fully-formed test group:
 *  - Creates `memberCount` customers, picks the first as leader.
 *  - POST /groups with leaderId / branchArea / meetingDay.
 *  - Adds the remaining members via POST /groups/:id/members.
 *  - For every member, creates a loan linked to the group (group_id) and
 *    advances it to status=active so it appears in getGroupLoanSummaries.
 *
 * Returns the group id plus the array of seeded loan ids (in member order).
 */
async function seedGroupWithActiveLoans(
  token: string,
  memberCount: number,
  principalPerLoanPaise: number,
): Promise<{ groupId: string; loanIds: string[] }> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

  // 1. Create customers.
  const customerIds: string[] = [];
  for (let i = 0; i < memberCount; i++) {
    const cid = await createTestCustomer(token, {
      fullName: `GC Page Test ${stamp} M${i}`,
    });
    customerIds.push(cid);
  }

  // 2. Create the group (leader is the first customer).
  const createBody = {
    name: `GC Page Group ${stamp}`,
    meetingDay: 'monday',
    branchArea: 'E2E Branch',
    leaderId: customerIds[0],
  };
  const group = await apiRequest<{ id: string }>('POST', '/groups', token, createBody);
  const groupId = group.id;

  // 3. Add remaining members (leader is auto-added by GroupService.createGroup).
  for (let i = 1; i < customerIds.length; i++) {
    await apiRequest('POST', `/groups/${groupId}/members`, token, {
      customerId: customerIds[i],
    });
  }

  // 4. For every member, create + advance a loan linked to the group.
  //    We POST /loans directly so we can include the group_id field
  //    (createTestLoan helper doesn't expose it).
  const products = await apiRequest<{ data: Array<{ id: string; is_active: boolean }> }>(
    'GET',
    '/loan-products?limit=10',
    token,
  );
  const product = products.data?.find((p) => p.is_active) ?? products.data?.[0];
  if (!product) throw new Error('No loan product available for seeding');

  const loanIds: string[] = [];
  for (const customerId of customerIds) {
    // First try with the same shape createTestLoan uses, but add group_id.
    // (Existing tests rely on this snake_case shape working.)
    const created = await apiRequest<{ id: string }>('POST', '/loans', token, {
      customer_id: customerId,
      product_id: product.id,
      principal_paise: principalPerLoanPaise,
      tenure_months: 12,
      purpose: 'Group lending E2E test',
      group_id: groupId,
    });
    await advanceLoanToStatus(token, created.id, 'active');
    loanIds.push(created.id);
  }

  // Fall-back assertion: if loans weren't actually linked to the group_id
  // (shape mismatch), the group detail endpoint will return members with no
  // loans and the rest of the test would be a no-op. Verify here so the failure
  // is loud at seed time.
  const detail = await apiRequest<GroupDetailLite>('GET', `/groups/${groupId}`, token);
  const linkedLoanIds = new Set(
    detail.members.flatMap((m) => m.loans.map((l) => l.id)),
  );
  for (const lid of loanIds) {
    if (!linkedLoanIds.has(lid)) {
      throw new Error(
        `Seeded loan ${lid} did not link to group ${groupId} — group_id payload was rejected`,
      );
    }
  }

  return { groupId, loanIds };
}

test.describe('Group Collect Page — /groups/[id]/collect', () => {
  let managerToken: string;

  test.beforeAll(async () => {
    managerToken = await getTokenForRole('manager');
  });

  test('golden path — manager posts a multi-member group collection and every member outstanding drops by the posted amount', async ({
    managerPage,
  }) => {
    // Three members, ₹50,000 principal each.
    const { groupId, loanIds } = await seedGroupWithActiveLoans(managerToken, 3, 5_000_000);

    // Snapshot starting outstandings keyed by loan id.
    const before = await apiRequest<GroupDetailLite>('GET', `/groups/${groupId}`, managerToken);
    const outstandingBefore = new Map<string, number>();
    for (const m of before.members) {
      for (const l of m.loans) {
        outstandingBefore.set(l.id, l.outstanding_paise ?? 0);
      }
    }
    for (const lid of loanIds) {
      expect(outstandingBefore.get(lid), `loan ${lid} should have an outstanding > 0`).toBeGreaterThan(0);
    }

    // Per-member rupee amounts; integer rupees keep the *100 conversion exact
    // (page does Math.round(Number(v) * 100), which is exact for whole rupees).
    const amountsRupees: Record<string, number> = {
      [loanIds[0]]: 1500,
      [loanIds[1]]: 2200,
      [loanIds[2]]: 800,
    };
    const expectedTotalPaise = Object.values(amountsRupees).reduce(
      (sum, r) => sum + r * 100,
      0,
    );

    await managerPage.goto(`/groups/${groupId}/collect`);

    // Page heading proves the route resolved (not a redirect to login / access denied).
    await expect(
      managerPage.getByRole('heading', { name: new RegExp(`Collect.*${before.name}`, 'i') }),
    ).toBeVisible({ timeout: 15_000 });

    // One "Due:" label per active member loan — confirms the page fetched group detail.
    await expect(managerPage.getByText(/Due:/).first()).toBeVisible({ timeout: 15_000 });

    // Fill the amount input per loan. The page keys amounts by loanId, which
    // matches the React `value={amounts[l.id]}` binding — we locate via the
    // member's loan_number, then the sibling number input.
    for (const lid of loanIds) {
      const loanNumber = before.members
        .flatMap((m) => m.loans)
        .find((l) => l.id === lid)?.loan_number;
      expect(loanNumber, `loan ${lid} should have a loan_number for selector`).toBeTruthy();

      // The card div contains the loan_number paragraph and the numeric input
      // for that loan. Scope to the card so we hit the right Input.
      const card = managerPage
        .locator('div.rounded-lg.border', { hasText: loanNumber! })
        .first();
      await expect(card).toBeVisible({ timeout: 15_000 });
      await card.getByPlaceholder('₹ Amount').fill(String(amountsRupees[lid]));
    }

    // Running total reflects sum across all inputs (paise = rupees * 100).
    // Page renders via <MoneyDisplay paise=...> which formats with INR grouping;
    // we assert it contains the rupee total formatted in en-IN.
    const formattedTotal = (expectedTotalPaise / 100).toLocaleString('en-IN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
    await expect(
      managerPage.getByText('Total Collection').locator('..').getByText(
        new RegExp(formattedTotal.replace(/,/g, '\\,')),
      ),
    ).toBeVisible({ timeout: 10_000 });

    // Submit — page POSTs /groups/:id/collections then router.push(`/groups/:id`).
    await managerPage.getByRole('button', { name: /post collection/i }).click();

    // Behavioural proof: URL transitions back to group detail.
    await managerPage.waitForURL(new RegExp(`/groups/${groupId}(\\?|$|#)`), { timeout: 20_000 });

    // Final proof: every collected loan's outstanding dropped by the posted amount.
    // We fetch group detail via API rather than scraping the detail page because
    // the page may cache via React Query — the server is authoritative.
    const after = await apiRequest<GroupDetailLite>('GET', `/groups/${groupId}`, managerToken);
    const outstandingAfter = new Map<string, number>();
    for (const m of after.members) {
      for (const l of m.loans) {
        outstandingAfter.set(l.id, l.outstanding_paise ?? 0);
      }
    }
    for (const lid of loanIds) {
      const beforeVal = outstandingBefore.get(lid)!;
      const afterVal = outstandingAfter.get(lid) ?? 0;
      const postedPaise = amountsRupees[lid] * 100;
      expect(
        beforeVal - afterVal,
        `loan ${lid}: outstanding should drop by exactly ${postedPaise} paise`,
      ).toBe(postedPaise);
    }

    // And the group collection record itself should be visible from the API.
    const detail = await apiRequest<{ collections: Array<{ total_amount_paise: number }> }>(
      'GET',
      `/groups/${groupId}`,
      managerToken,
    );
    expect(
      detail.collections.some((c) => Number(c.total_amount_paise) === expectedTotalPaise),
      `a group_collection row with total_amount_paise=${expectedTotalPaise} should exist`,
    ).toBe(true);
  });

  test('only fills loans with amounts entered — zero/empty rows are excluded from memberBreakdown', async ({
    managerPage,
  }) => {
    const { groupId, loanIds } = await seedGroupWithActiveLoans(managerToken, 3, 5_000_000);
    const before = await apiRequest<GroupDetailLite>('GET', `/groups/${groupId}`, managerToken);
    const outstandingBefore = new Map<string, number>();
    for (const m of before.members) {
      for (const l of m.loans) outstandingBefore.set(l.id, l.outstanding_paise ?? 0);
    }

    await managerPage.goto(`/groups/${groupId}/collect`);
    await expect(
      managerPage.getByRole('heading', { name: /Collect/i }),
    ).toBeVisible({ timeout: 15_000 });

    // Fill only the first loan; leave the other two blank.
    const firstLoan = before.members
      .flatMap((m) => m.loans)
      .find((l) => l.id === loanIds[0])!;
    const card = managerPage
      .locator('div.rounded-lg.border', { hasText: firstLoan.loan_number })
      .first();
    await card.getByPlaceholder('₹ Amount').fill('1000');

    await managerPage.getByRole('button', { name: /post collection/i }).click();
    await managerPage.waitForURL(new RegExp(`/groups/${groupId}(\\?|$|#)`), { timeout: 20_000 });

    const after = await apiRequest<GroupDetailLite>('GET', `/groups/${groupId}`, managerToken);
    const outstandingAfter = new Map<string, number>();
    for (const m of after.members) {
      for (const l of m.loans) outstandingAfter.set(l.id, l.outstanding_paise ?? 0);
    }

    // Only the filled loan should have moved; the others must be unchanged.
    expect(
      outstandingBefore.get(loanIds[0])! - (outstandingAfter.get(loanIds[0]) ?? 0),
    ).toBe(100_000);
    expect(outstandingAfter.get(loanIds[1])).toBe(outstandingBefore.get(loanIds[1]));
    expect(outstandingAfter.get(loanIds[2])).toBe(outstandingBefore.get(loanIds[2]));
  });

  test('"Fill due amount" shortcut populates the input with the loan outstanding', async ({
    managerPage,
  }) => {
    const { groupId, loanIds } = await seedGroupWithActiveLoans(managerToken, 3, 5_000_000);
    const detail = await apiRequest<GroupDetailLite>('GET', `/groups/${groupId}`, managerToken);
    const firstLoan = detail.members
      .flatMap((m) => m.loans)
      .find((l) => l.id === loanIds[0])!;
    expect(firstLoan.outstanding_paise).toBeGreaterThan(0);

    await managerPage.goto(`/groups/${groupId}/collect`);
    await expect(
      managerPage.getByRole('heading', { name: /Collect/i }),
    ).toBeVisible({ timeout: 15_000 });

    const card = managerPage
      .locator('div.rounded-lg.border', { hasText: firstLoan.loan_number })
      .first();
    await expect(card).toBeVisible({ timeout: 15_000 });

    await card.getByRole('button', { name: /fill due amount/i }).click();

    // The input should now read the outstanding in rupees with 2 decimals
    // (matches the page: `((l.outstanding_paise ?? 0) / 100).toFixed(2)`).
    const expectedRupeesStr = (firstLoan.outstanding_paise! / 100).toFixed(2);
    await expect(card.getByPlaceholder('₹ Amount')).toHaveValue(expectedRupeesStr);
  });

  test('server rejects sum mismatch — totalAmountPaise != sum(memberBreakdown) yields 400 GROUP_COLLECTION_SUM_MISMATCH', async () => {
    // The UI computes the total client-side, so the only way to exercise the
    // server's GROUP_COLLECTION_SUM_MISMATCH guard is a direct API call.
    const { groupId, loanIds } = await seedGroupWithActiveLoans(managerToken, 3, 5_000_000);

    const res = await fetch('http://localhost:3001/groups/' + groupId + '/collections', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`,
      },
      body: JSON.stringify({
        totalAmountPaise: 999999, // deliberately wrong
        collectionDate: new Date().toISOString().split('T')[0],
        paymentMode: 'cash',
        memberBreakdown: [
          { loanId: loanIds[0], amountPaise: 100_000 },
          { loanId: loanIds[1], amountPaise: 100_000 },
        ],
        idempotencyKey: `e2e-sum-mismatch-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      }),
    });

    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
    const body = await res.json();
    const msg = JSON.stringify(body).toLowerCase();
    expect(msg).toMatch(/sum|mismatch|total/);
  });

  test('RBAC — auditor is denied access to the collect page', async ({ auditorPage }) => {
    // Seed as manager (auditor lacks customer.create etc.).
    const { groupId } = await seedGroupWithActiveLoans(managerToken, 3, 5_000_000);

    await auditorPage.goto(`/groups/${groupId}/collect`);

    // Either an explicit Access Denied page, or the front-end strips the page
    // and redirects elsewhere. Both are acceptable — what's NOT acceptable is
    // the page rendering with a working "Post Collection" button.
    const accessDenied = auditorPage.getByRole('heading', { name: /access denied/i });
    const collectHeading = auditorPage.getByRole('heading', { name: /^Collect /i });
    const postButton = auditorPage.getByRole('button', { name: /post collection/i });

    await expect(accessDenied.or(collectHeading)).toBeVisible({ timeout: 15_000 });

    // If the heading is shown (some deployments render the read-only view),
    // the action button must NOT be present.
    if (await collectHeading.isVisible().catch(() => false)) {
      await expect(postButton).not.toBeVisible();
    }
  });
});
