/**
 * Seed Data Helper for E2E Tests
 *
 * Thin accessor layer over the globalThis data populated by global-setup.ts.
 * Provides typed access to seed data (users, products, accounts, holidays, settings)
 * and the API base URL without requiring each test file to cast globalThis manually.
 */

// Re-export the SeedData type from global-setup
export type { SeedData, LoanProductConfig } from '../setup/global-setup.js';

import type { SeedData } from '../setup/global-setup.js';

// ─── Core Accessor ───────────────────────────────────────────────────────────

/**
 * Retrieve the full SeedData object stored on globalThis by global-setup.
 * Throws if global setup has not run.
 */
export function getSeedData(): SeedData {
  const data = (globalThis as Record<string, unknown>)['__SEED_DATA__'] as SeedData | undefined;

  if (!data) {
    throw new Error(
      'Seed data not available. Ensure global setup has run before accessing seed data.',
    );
  }

  return data;
}

/**
 * Retrieve the API base URL stored on globalThis by global-setup.
 * Throws if global setup has not run.
 */
export function getApiBaseUrl(): string {
  const url = (globalThis as Record<string, unknown>)['__API_BASE_URL__'] as string | undefined;

  if (!url) {
    throw new Error(
      'API base URL not available. Ensure global setup has run before accessing the base URL.',
    );
  }

  return url;
}

// ─── Convenience Accessors ───────────────────────────────────────────────────

/** Get all seeded users with their IDs, usernames, and JWT tokens. */
export function getUsers(): SeedData['users'] {
  return getSeedData().users;
}

/** Get all seeded loan products with their IDs, version IDs, and configs. */
export function getProducts(): SeedData['products'] {
  return getSeedData().products;
}

/** Get all seeded chart of accounts entries with their IDs and codes. */
export function getAccounts(): SeedData['accounts'] {
  return getSeedData().accounts;
}

/** Get the seeded holiday dates. */
export function getHolidays(): Date[] {
  return getSeedData().holidays;
}

/** Get the seeded system settings. */
export function getSettings(): SeedData['settings'] {
  return getSeedData().settings;
}

/**
 * Get a map of user role keys to their JWT tokens.
 * Useful for quickly building auth headers or passing to createAuthClients.
 */
export function getUserTokens(): Record<string, string> {
  const users = getUsers();
  const tokens: Record<string, string> = {};

  for (const [key, user] of Object.entries(users)) {
    tokens[key] = user.token;
  }

  return tokens;
}
