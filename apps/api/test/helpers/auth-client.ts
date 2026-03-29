/**
 * Authenticated HTTP Clients for E2E Tests
 *
 * Pre-configured Supertest agents with valid JWT authorization headers for each role.
 * Also provides unauthenticated, expired-JWT, and tampered-JWT agents for security testing.
 */

import supertest from 'supertest';
import * as jwt from 'jsonwebtoken';

// ─── Types ───────────────────────────────────────────────────────────────────

export type UserRole =
  | 'super_admin'
  | 'manager'
  | 'field_officer'
  | 'collection_officer'
  | 'accountant'
  | 'office_staff'
  | 'viewer_auditor';

export interface AuthClients {
  superAdmin: supertest.Agent;
  manager: supertest.Agent;
  manager2: supertest.Agent;
  fieldOfficer: supertest.Agent;
  collectionOfficer: supertest.Agent;
  accountant: supertest.Agent;
  officeStaff: supertest.Agent;
  viewerAuditor: supertest.Agent;
  unauthenticated: supertest.Agent;
  expired: supertest.Agent;
  tampered: supertest.Agent;
}

// ─── Token Helpers ───────────────────────────────────────────────────────────

/**
 * Generate an expired JWT token.
 * Signs a token with `exp` set 1 hour in the past so it's already expired.
 */
function generateExpiredToken(): string {
  const secret = process.env['JWT_SECRET'] ?? 'as-finance-dev-jwt-secret-change-in-production';
  const nowSec = Math.floor(Date.now() / 1000);

  return jwt.sign(
    {
      sub: '00000000-0000-0000-0000-000000000000',
      role: 'field_officer',
      iat: nowSec - 7200, // issued 2 hours ago
      exp: nowSec - 3600, // expired 1 hour ago
    },
    secret,
  );
}

/**
 * Generate a tampered JWT token.
 * Takes a valid token, decodes its payload, escalates the role to super_admin,
 * then re-encodes with a different (wrong) secret so the signature is invalid.
 */
function generateTamperedToken(validToken: string): string {
  const decoded = jwt.decode(validToken) as jwt.JwtPayload | null;

  if (!decoded) {
    // Fallback: create a token signed with a wrong secret
    return jwt.sign(
      { sub: 'tampered-user', role: 'super_admin' },
      'wrong-secret-for-tampered-jwt',
      { expiresIn: '1h' },
    );
  }

  // Escalate role to super_admin and sign with a wrong secret
  return jwt.sign(
    {
      sub: decoded.sub,
      role: 'super_admin',
      iat: decoded.iat,
    },
    'wrong-secret-for-tampered-jwt',
    { expiresIn: '1h' },
  );
}

// ─── Agent Factory ───────────────────────────────────────────────────────────

/**
 * Create a Supertest agent pre-configured with an Authorization Bearer header.
 */
function createAgentWithAuth(apiBaseUrl: string, token: string): supertest.Agent {
  const agent = supertest.agent(apiBaseUrl);
  agent.set('Authorization', `Bearer ${token}`);
  return agent;
}

/**
 * Create a Supertest agent with no Authorization header (unauthenticated).
 */
function createUnauthenticatedAgent(apiBaseUrl: string): supertest.Agent {
  return supertest.agent(apiBaseUrl);
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Create pre-configured Supertest agents for all roles plus special auth-test agents.
 *
 * @param apiBaseUrl - The base URL of the API server (e.g. http://localhost:3001)
 * @param tokens - A map of role keys to their cached JWT tokens from global setup
 * @returns AuthClients with agents for every role, plus unauthenticated/expired/tampered
 */
export function createAuthClients(
  apiBaseUrl: string,
  tokens: Record<string, string>,
): AuthClients {
  // Pick any valid token for generating the tampered version
  const anyValidToken =
    tokens['superAdmin'] ??
    tokens['manager'] ??
    Object.values(tokens)[0] ??
    '';

  return {
    superAdmin: createAgentWithAuth(apiBaseUrl, tokens['superAdmin']!),
    manager: createAgentWithAuth(apiBaseUrl, tokens['manager']!),
    manager2: createAgentWithAuth(apiBaseUrl, tokens['manager2']!),
    fieldOfficer: createAgentWithAuth(apiBaseUrl, tokens['fieldOfficer']!),
    collectionOfficer: createAgentWithAuth(apiBaseUrl, tokens['collectionOfficer']!),
    accountant: createAgentWithAuth(apiBaseUrl, tokens['accountant']!),
    officeStaff: createAgentWithAuth(apiBaseUrl, tokens['officeStaff']!),
    viewerAuditor: createAgentWithAuth(apiBaseUrl, tokens['viewerAuditor']!),
    unauthenticated: createUnauthenticatedAgent(apiBaseUrl),
    expired: createAgentWithAuth(apiBaseUrl, generateExpiredToken()),
    tampered: createAgentWithAuth(apiBaseUrl, generateTamperedToken(anyValidToken)),
  };
}
