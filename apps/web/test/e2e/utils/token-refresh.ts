/**
 * Token Refresh Utilities
 *
 * Handles JWT token refresh to prevent auth expiration during long test runs.
 * JWT tokens expire in 15 minutes, so this provides automatic refresh.
 */

import * as fs from 'fs';
import * as path from 'path';
import { type Page } from '@playwright/test';

const API_BASE = process.env['API_URL'] || 'http://localhost:3001';
const AUTH_DIR = path.join(__dirname, '..', '.auth');

// Token expiration buffer - refresh 2 minutes before expiry
const EXPIRY_BUFFER_MS = 2 * 60 * 1000;

// JWT expiry time (15 minutes)
const JWT_EXPIRY_MS = 15 * 60 * 1000;

/**
 * Parse JWT and get expiration time.
 */
function getJwtExpiry(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    const decoded = JSON.parse(Buffer.from(payload, 'base64').toString());
    return decoded.exp ? decoded.exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * Check if auth file has expired or will expire soon.
 */
export function authFileNeedsRefresh(role: string): boolean {
  const authFile = path.join(AUTH_DIR, `${role}.json`);

  if (!fs.existsSync(authFile)) {
    return true;
  }

  try {
    const content = JSON.parse(fs.readFileSync(authFile, 'utf-8'));
    const cookies = content.cookies || [];

    // Find the access_token or refresh_token cookie
    const accessToken = cookies.find((c: { name: string }) => c.name === 'access_token');

    if (accessToken?.value) {
      const expiry = getJwtExpiry(accessToken.value);
      if (expiry) {
        const timeUntilExpiry = expiry - Date.now();
        return timeUntilExpiry < EXPIRY_BUFFER_MS;
      }
    }

    // Fallback: check file modification time
    const stats = fs.statSync(authFile);
    const fileAge = Date.now() - stats.mtimeMs;
    return fileAge > (JWT_EXPIRY_MS - EXPIRY_BUFFER_MS);
  } catch {
    return true;
  }
}

/**
 * Refresh token via API.
 */
export async function refreshTokenViaApi(refreshToken: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `refresh_token=${refreshToken}`,
      },
    });

    if (res.ok) {
      const body = await res.json();
      return body.accessToken || null;
    }
  } catch {
    // Refresh failed
  }
  return null;
}

/**
 * Middleware to refresh auth before each test if needed.
 * Use this in a Playwright fixture.
 */
export async function ensureFreshAuth(page: Page, role: string): Promise<void> {
  const authFile = path.join(AUTH_DIR, `${role}.json`);

  if (!authFileNeedsRefresh(role)) {
    return; // Auth is still valid
  }

  console.log(`Refreshing auth for ${role}...`);

  try {
    // Get current cookies
    const cookies = await page.context().cookies();
    const refreshToken = cookies.find((c) => c.name === 'refresh_token')?.value;

    if (refreshToken) {
      const newAccessToken = await refreshTokenViaApi(refreshToken);

      if (newAccessToken) {
        // Update the page cookies
        await page.context().addCookies([
          {
            name: 'access_token',
            value: newAccessToken,
            domain: 'localhost',
            path: '/',
          },
        ]);

        // Update storage state file
        await page.context().storageState({ path: authFile });
        console.log(`Auth refreshed for ${role}`);
        return;
      }
    }

    // If refresh failed, we need to re-login
    console.warn(`Token refresh failed for ${role}, re-login required`);
  } catch (err) {
    console.error(`Error refreshing auth for ${role}:`, err);
  }
}

/**
 * Get estimated time until auth expires for a role.
 */
export function getAuthTimeRemaining(role: string): number {
  const authFile = path.join(AUTH_DIR, `${role}.json`);

  if (!fs.existsSync(authFile)) {
    return 0;
  }

  try {
    const stats = fs.statSync(authFile);
    const fileAge = Date.now() - stats.mtimeMs;
    const remaining = JWT_EXPIRY_MS - fileAge;
    return Math.max(0, remaining);
  } catch {
    return 0;
  }
}

/**
 * Format time remaining as human-readable string.
 */
export function formatTimeRemaining(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/**
 * Print auth status for all roles.
 */
export function printAuthStatus(): void {
  const roles = ['super_admin', 'manager', 'field_officer', 'collection_officer', 'accountant', 'office_staff', 'viewer_auditor'];

  console.log('\nAuth Token Status:');
  console.log('-'.repeat(40));

  for (const role of roles) {
    const remaining = getAuthTimeRemaining(role);
    const status = remaining > EXPIRY_BUFFER_MS ? '✓' : remaining > 0 ? '⚠' : '✗';
    const timeStr = remaining > 0 ? formatTimeRemaining(remaining) : 'expired';
    console.log(`  ${status} ${role.padEnd(20)} ${timeStr}`);
  }

  console.log('');
}
