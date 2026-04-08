import { test as setup, expect } from '@playwright/test';
import { TEST_USERS, type UserRole } from './fixtures/auth.fixture';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Auth Setup - Creates authenticated storage states for all 7 roles.
 *
 * This runs before the main test suite and saves browser state (cookies + localStorage)
 * for each role. Tests can then use these saved states instead of logging in each time.
 */

const AUTH_DIR = path.join(__dirname, '.auth');

// Ensure auth directory exists
if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

/**
 * Helper to get the storage state file path for a role
 */
export function getAuthFile(role: UserRole): string {
  return path.join(AUTH_DIR, `${role}.json`);
}

/**
 * Check if auth file exists and is recent (less than 1 hour old)
 */
function authFileValid(authFile: string): boolean {
  if (!fs.existsSync(authFile)) return false;
  const stats = fs.statSync(authFile);
  const ageMs = Date.now() - stats.mtimeMs;
  const oneHour = 60 * 60 * 1000;
  return ageMs < oneHour;
}

// All roles to authenticate
const ROLES: UserRole[] = [
  'super_admin',
  'manager',
  'field_officer',
  'collection_officer',
  'accountant',
  'office_staff',
  'viewer_auditor',
];

/**
 * Single setup test that authenticates all roles sequentially.
 * This avoids browser context switching issues and ensures proper rate limiting.
 */
setup('authenticate all roles', async ({ page }) => {
  setup.setTimeout(10 * 60 * 1000); // 10 minutes for all 7 logins

  for (const role of ROLES) {
    const user = TEST_USERS[role];
    const authFile = getAuthFile(role);

    // Skip if auth file already exists and is recent
    if (authFileValid(authFile)) {
      console.log(`  ⏭ Skipping ${role} - auth file already exists`);
      continue;
    }

    console.log(`Authenticating as ${role} (${user.username})...`);

    // Navigate to login (clear any existing session)
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');

    // Wait for form to be ready
    const usernameInput = page.getByLabel('Username');
    await usernameInput.waitFor({ state: 'visible', timeout: 15_000 });

    // Fill credentials
    await usernameInput.fill(user.username);
    await page.getByLabel('Password').fill(user.password);

    // Submit
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Wait for successful redirect (away from login page)
    // Login can take 10+ seconds due to bcrypt hashing
    await page.waitForURL(/^(?!.*\/login)/, { timeout: 90_000 });
    // Wait for DOM to be ready (skip networkidle as dashboard may have continuous polling)
    await page.waitForLoadState('domcontentloaded');

    // Verify we're logged in by checking for sidebar nav (use exact match to avoid ambiguity)
    await expect(page.getByRole('link', { name: 'Customers', exact: true })).toBeVisible({ timeout: 30_000 });

    // Save storage state
    await page.context().storageState({ path: authFile });
    console.log(`  ✓ Saved auth state to ${authFile}`);

    // Clear cookies and storage before next login (to get fresh session)
    await page.context().clearCookies();
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    // Wait between logins to avoid rate limiting (10 req/60s)
    // Space out requests to ensure we stay under the limit
    console.log(`  ⏳ Waiting 15 seconds before next login...`);
    await page.waitForTimeout(15_000);
  }

  console.log('✅ All auth states created');
});
