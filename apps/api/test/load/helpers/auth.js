/**
 * k6 Load Test — Authentication Helper
 *
 * Obtains JWT tokens by logging in as seed users via the /auth/login endpoint.
 * Tokens are fetched once during the k6 `setup()` phase and shared across all VUs.
 *
 * Seed user credentials match the E2E global-setup seed data:
 *   username: e2e_<role>  |  password: TestPass1
 *
 * Design note: tokens are obtained via HTTP login (not direct JWT signing) so
 * the load test exercises the real auth flow and works against any running API
 * instance without needing the JWT_SECRET.
 */

import http from 'k6/http';
import { BASE_URL, DEFAULT_HEADERS } from '../config.js';

// ─── Seed User Credentials ──────────────────────────────────────────────────

const TEST_PASSWORD = 'TestPass1';

const SEED_USERS = {
  superAdmin: 'e2e_super_admin',
  manager: 'e2e_manager',
  fieldOfficer: 'e2e_field_officer',
  collectionOfficer: 'e2e_collection_officer',
  accountant: 'e2e_accountant',
  officeStaff: 'e2e_office_staff',
  viewerAuditor: 'e2e_viewer_auditor',
};

// ─── Token Acquisition ──────────────────────────────────────────────────────

/**
 * Login as a seed user and return the access token.
 *
 * @param {string} username - Seed user username
 * @returns {string} JWT access token
 */
function loginAndGetToken(username) {
  const res = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ username, password: TEST_PASSWORD }),
    { headers: DEFAULT_HEADERS, tags: { endpoint: 'auth' } },
  );

  if (res.status !== 200) {
    throw new Error(
      `Login failed for ${username}: status=${res.status}, body=${res.body}`,
    );
  }

  const body = JSON.parse(res.body);
  if (!body.accessToken) {
    throw new Error(`No accessToken in login response for ${username}`);
  }

  return body.accessToken;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Fetch JWT tokens for all seed users.
 * Call this in the k6 `setup()` function — runs once, result is shared with VUs.
 *
 * @returns {{ [role: string]: string }} Map of role key → JWT token
 */
export function getAuthTokens() {
  const tokens = {};
  for (const [role, username] of Object.entries(SEED_USERS)) {
    tokens[role] = loginAndGetToken(username);
  }
  return tokens;
}

/**
 * Build an Authorization header object for a given token.
 *
 * @param {string} token - JWT access token
 * @returns {{ Authorization: string }} Header object to spread into request headers
 */
export function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

/**
 * Build complete request headers (default + auth) for a given token.
 *
 * @param {string} token - JWT access token
 * @returns {object} Merged headers
 */
export function authenticatedHeaders(token) {
  return Object.assign({}, DEFAULT_HEADERS, authHeader(token));
}
