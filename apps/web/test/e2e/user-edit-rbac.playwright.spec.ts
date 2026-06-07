import { test, expect, getTokenForRole, apiRequest, TEST_USERS } from './fixtures';

/**
 * User Edit + Role Change RBAC + Deactivation — E2E
 *
 * Closes the gap left by users.playwright.spec.ts:
 *   - users.spec only verified that the edit form loads and the save button is visible.
 *   - There were no tests asserting an actual edit persisted, no tests asserting that
 *     role-change controls are gated by `user.change_role` (manager/super_admin only),
 *     and no test confirming that an account marked inactive can no longer log in.
 *
 * Each test seeds its own user via the API so it is hermetic; no test depends on the
 * mutable state left by another. The form is exercised through the real UI (Save Changes
 * button) and persistence is then re-verified via GET /users/:id.
 */

type ApiUser = {
  id: string;
  username: string;
  full_name: string;
  email: string | null;
  mobile: string;
  role: string;
  is_active: boolean;
};

// Generate a mobile that satisfies the backend regex /^[6-9]\d{9}$/.
// We deliberately keep this short to avoid colliding across parallel workers.
function uniqueMobile(): string {
  const tail = String(Date.now()).slice(-8) + Math.floor(Math.random() * 10);
  return `9${tail}`.slice(0, 10);
}

function uniqueUsername(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

async function seedUser(
  adminToken: string,
  overrides: Partial<{ role: string; isActive: boolean; fullName: string }> = {},
): Promise<ApiUser> {
  const username = uniqueUsername('edituser');
  const created = await apiRequest<ApiUser>('POST', '/users', adminToken, {
    username,
    password: 'SeedUser@2026',
    fullName: overrides.fullName ?? `Seed User ${username}`,
    mobile: uniqueMobile(),
    role: overrides.role ?? 'field_officer',
  });

  // If the seed needs to start inactive, flip the flag via the same API the form will use.
  if (overrides.isActive === false) {
    await apiRequest('PATCH', `/users/${created.id}`, adminToken, { isActive: false });
    return { ...created, is_active: false };
  }
  return created;
}

test.describe('User edit — save & persistence (golden path)', () => {
  test('admin can edit full name + mobile and the change persists', async ({ adminPage }) => {
    const adminToken = await getTokenForRole('super_admin');
    const seeded = await seedUser(adminToken);

    await adminPage.goto(`/users/${seeded.id}/edit`);
    // Form rendered means the user was fetched successfully.
    await expect(adminPage.locator('input[name="fullName"]')).toBeVisible({ timeout: 30_000 });
    await expect(adminPage.locator('input[name="fullName"]')).toHaveValue(seeded.full_name, {
      timeout: 15_000,
    });

    const newName = `Edited ${seeded.username}`;
    const newMobile = uniqueMobile();
    await adminPage.locator('input[name="fullName"]').fill(newName);
    await adminPage.locator('input[name="mobile"]').fill(newMobile);

    await adminPage.getByRole('button', { name: /save changes/i }).click();

    // Behavioural assertion: success redirects to /users (per page.tsx).
    await adminPage.waitForURL(/\/users(\?.*)?$/, { timeout: 20_000 });

    // Persistence assertion: the API now returns the new values.
    const fetched = await apiRequest<ApiUser>('GET', `/users/${seeded.id}`, adminToken);
    expect(fetched.full_name).toBe(newName);
    expect(fetched.mobile).toBe(newMobile);
  });

  test('admin can clear email by emptying the field and PATCH stores null', async ({ adminPage }) => {
    const adminToken = await getTokenForRole('super_admin');
    const seeded = await seedUser(adminToken);
    // Give the seed an email first so we can verify the clear path.
    await apiRequest('PATCH', `/users/${seeded.id}`, adminToken, {
      email: `${seeded.username}@example.com`,
    });

    await adminPage.goto(`/users/${seeded.id}/edit`);
    await expect(adminPage.locator('input[name="email"]')).toBeVisible({ timeout: 30_000 });
    await expect(adminPage.locator('input[name="email"]')).toHaveValue(
      `${seeded.username}@example.com`,
      { timeout: 15_000 },
    );

    await adminPage.locator('input[name="email"]').fill('');
    await adminPage.getByRole('button', { name: /save changes/i }).click();
    await adminPage.waitForURL(/\/users(\?.*)?$/, { timeout: 20_000 });

    const fetched = await apiRequest<ApiUser>('GET', `/users/${seeded.id}`, adminToken);
    expect(fetched.email == null || fetched.email === '').toBe(true);
  });
});

test.describe('User edit — validation (error path)', () => {
  test('invalid mobile is rejected client-side and PATCH is never sent', async ({ adminPage }) => {
    const adminToken = await getTokenForRole('super_admin');
    const seeded = await seedUser(adminToken);

    await adminPage.goto(`/users/${seeded.id}/edit`);
    await expect(adminPage.locator('input[name="mobile"]')).toBeVisible({ timeout: 30_000 });

    // The form's mobileSchema enforces a 10-digit Indian mobile starting 6-9; "12345" fails both.
    await adminPage.locator('input[name="mobile"]').fill('12345');
    await adminPage.getByRole('button', { name: /save changes/i }).click();

    // We should NOT redirect on validation failure.
    await expect(adminPage).toHaveURL(/\/users\/[^/]+\/edit$/, { timeout: 5_000 });

    // A field-level error should be visible. We check the destructive-styled <p>
    // emitted by the Field helper in edit/page.tsx.
    await expect(
      adminPage.locator('p.text-destructive').filter({ hasText: /mobile|invalid/i }).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Persistence assertion: nothing changed server-side.
    const fetched = await apiRequest<ApiUser>('GET', `/users/${seeded.id}`, adminToken);
    expect(fetched.mobile).toBe(seeded.mobile);
  });
});

test.describe('Role-change control — gated by user.change_role permission', () => {
  // Per packages/shared/src/constants/permissions.ts:
  //   user.update + user.change_role => [SUPER_ADMIN, MANAGER]
  //   user.update is NOT granted to other roles (they hit AccessDenied first),
  // so there is no role that has user.update but lacks user.change_role today.
  // We therefore test the positive case (manager + admin see a real <select>) and the
  // negative case (a role without user.update is blocked entirely, which is the stronger
  // guarantee for the deny path).

  test('manager sees the role <select> with all 7 roles', async ({ managerPage }) => {
    const adminToken = await getTokenForRole('super_admin');
    const seeded = await seedUser(adminToken);

    await managerPage.goto(`/users/${seeded.id}/edit`);
    await expect(managerPage.locator('input[name="fullName"]')).toBeVisible({ timeout: 30_000 });

    const roleSelect = managerPage.locator('select[name="role"]');
    await expect(roleSelect).toBeVisible({ timeout: 10_000 });
    await expect(roleSelect).toBeEnabled();
    const optionValues = await roleSelect.locator('option').evaluateAll(
      (opts) => (opts as HTMLOptionElement[]).map((o) => o.value),
    );
    expect(optionValues).toEqual(
      expect.arrayContaining([
        'super_admin',
        'manager',
        'field_officer',
        'collection_officer',
        'accountant',
        'office_staff',
        'viewer_auditor',
      ]),
    );
  });

  test('manager can change a user role and the change persists', async ({ managerPage }) => {
    const adminToken = await getTokenForRole('super_admin');
    const seeded = await seedUser(adminToken, { role: 'field_officer' });

    await managerPage.goto(`/users/${seeded.id}/edit`);
    await expect(managerPage.locator('select[name="role"]')).toBeVisible({ timeout: 30_000 });

    await managerPage.locator('select[name="role"]').selectOption('accountant');
    await managerPage.getByRole('button', { name: /save changes/i }).click();
    await managerPage.waitForURL(/\/users(\?.*)?$/, { timeout: 20_000 });

    const fetched = await apiRequest<ApiUser>('GET', `/users/${seeded.id}`, adminToken);
    expect(fetched.role).toBe('accountant');
  });

  test('field_officer cannot reach the edit page at all (RBAC denial)', async ({ fieldOfficerPage }) => {
    const adminToken = await getTokenForRole('super_admin');
    const seeded = await seedUser(adminToken);

    await fieldOfficerPage.goto(`/users/${seeded.id}/edit`);

    // page.tsx returns <AccessDenied /> when hasPermission(role, 'user.update') is false.
    // The role-change <select> must NOT render — that is the gate we care about.
    await expect(
      fieldOfficerPage.getByRole('heading', { name: 'Access Denied' }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(fieldOfficerPage.locator('select[name="role"]')).toHaveCount(0);
  });
});

test.describe('Deactivation — toggling Active off prevents future logins', () => {
  test('admin deactivates a user; subsequent /auth/login returns 401', async ({ adminPage }) => {
    const adminToken = await getTokenForRole('super_admin');
    // We need the plaintext password we used at seed time to attempt a login after deactivation.
    const username = uniqueUsername('deact');
    const password = 'SeedUser@2026';
    const created = await apiRequest<ApiUser>('POST', '/users', adminToken, {
      username,
      password,
      fullName: `Deactivation Target ${username}`,
      mobile: uniqueMobile(),
      role: 'office_staff',
    });

    // Sanity: the freshly-seeded account can log in.
    const loginOk = await fetch('http://localhost:3001/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    expect(loginOk.ok).toBe(true);

    await adminPage.goto(`/users/${created.id}/edit`);
    await expect(adminPage.locator('input[name="isActive"]')).toBeVisible({ timeout: 30_000 });

    // Box should start checked (seed users are created active).
    await expect(adminPage.locator('input[name="isActive"]')).toBeChecked();
    await adminPage.locator('input[name="isActive"]').uncheck();
    await adminPage.getByRole('button', { name: /save changes/i }).click();
    await adminPage.waitForURL(/\/users(\?.*)?$/, { timeout: 20_000 });

    // Persistence assertion via the same API the form uses.
    const fetched = await apiRequest<ApiUser>('GET', `/users/${created.id}`, adminToken);
    expect(fetched.is_active).toBe(false);

    // Behavioural assertion: the deactivated user can no longer log in.
    const loginAfter = await fetch('http://localhost:3001/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    expect(loginAfter.ok).toBe(false);
    // 401 Unauthorized is the documented response; we accept 401 or 403 to avoid
    // coupling to exact status code choice without making the assertion meaningless.
    expect([401, 403]).toContain(loginAfter.status);
  });

  test('seeded test fixtures are unaffected — re-activation also works', async ({ adminPage }) => {
    // Guard rail: make sure we don't accidentally regress the canonical seed accounts
    // (used by every other spec via the storage state files).
    const adminToken = await getTokenForRole('super_admin');
    const list = await apiRequest<{ data: ApiUser[]; total: number }>(
      'GET',
      `/users?take=100`,
      adminToken,
    );
    const managerSeed = list.data.find((u) => u.username === TEST_USERS.manager.username);
    expect(managerSeed, 'seeded manager1 must exist').toBeTruthy();
    expect(managerSeed!.is_active).toBe(true);

    // Round-trip: seed an inactive user, then re-activate via the form.
    const seeded = await seedUser(adminToken, { isActive: false });
    expect(seeded.is_active).toBe(false);

    await adminPage.goto(`/users/${seeded.id}/edit`);
    await expect(adminPage.locator('input[name="isActive"]')).toBeVisible({ timeout: 30_000 });
    await expect(adminPage.locator('input[name="isActive"]')).not.toBeChecked();
    await adminPage.locator('input[name="isActive"]').check();
    await adminPage.getByRole('button', { name: /save changes/i }).click();
    await adminPage.waitForURL(/\/users(\?.*)?$/, { timeout: 20_000 });

    const fetched = await apiRequest<ApiUser>('GET', `/users/${seeded.id}`, adminToken);
    expect(fetched.is_active).toBe(true);
  });
});
