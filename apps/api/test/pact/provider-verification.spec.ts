/**
 * Pact Provider Verification
 *
 * Verifies all consumer-generated Pact files from apps/web/test/pact/pacts/
 * against the running API server. Uses JWT auth via request filters and
 * state handlers to set up required test data before each interaction.
 *
 * Run via: npm run test:pact:verify
 * Config: vitest.e2e.ts (uses global setup for seed data + API server)
 *
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5
 */
import { describe, it, beforeAll } from 'vitest';
import { Verifier } from '@pact-foundation/pact';
import path from 'node:path';
import fs from 'node:fs';
import type { SeedData } from '../setup/global-setup';
import { createStateHandlers, resetStateContext } from './state-handlers';

// ─── Constants ───────────────────────────────────────────────────────────────

const PACT_DIR = path.resolve(__dirname, '../../../web/test/pact/pacts');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getSeedData(): SeedData {
  const seed = (globalThis as Record<string, unknown>)['__SEED_DATA__'] as SeedData | undefined;
  if (!seed) throw new Error('Seed data not available — ensure global setup has run');
  return seed;
}

function getApiBaseUrl(): string {
  return (
    ((globalThis as Record<string, unknown>)['__API_BASE_URL__'] as string) ??
    'http://localhost:3001'
  );
}

/**
 * Collect all Pact JSON files from the pacts directory.
 */
function getPactFiles(): string[] {
  if (!fs.existsSync(PACT_DIR)) {
    throw new Error(
      `Pact directory not found at ${PACT_DIR}. ` +
        'Run consumer tests first: cd apps/web && npm run test:pact',
    );
  }

  const files = fs
    .readdirSync(PACT_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.join(PACT_DIR, f));

  if (files.length === 0) {
    throw new Error(
      `No Pact files found in ${PACT_DIR}. ` +
        'Run consumer tests first: cd apps/web && npm run test:pact',
    );
  }

  return files;
}

// ─── Provider Verification ───────────────────────────────────────────────────

describe('Pact Provider Verification', () => {
  let providerBaseUrl: string;
  let managerToken: string;

  beforeAll(() => {
    providerBaseUrl = getApiBaseUrl();
    const seed = getSeedData();
    // Use manager token — has broad permissions across endpoints
    managerToken = seed.users.manager.token;
  });

  it('verifies all consumer Pact contracts against the running API', async () => {
    const pactFiles = getPactFiles();
    const stateHandlers = createStateHandlers();

    const verifier = new Verifier({
      providerBaseUrl,
      pactUrls: pactFiles,
      provider: 'as-finance-api',
      logLevel: 'warn',

      // State handlers set up test data for each provider state
      stateHandlers,

      // Request filter injects a valid JWT Authorization header
      // into every outgoing verification request so protected
      // endpoints don't return 401.
      requestFilter: (req, _res, next) => {
        req.headers['authorization'] = `Bearer ${managerToken}`;
        next();
      },

      // Reset shared state context after each interaction
      afterEach: async () => {
        // We don't reset between interactions to allow state reuse,
        // but we could add per-interaction cleanup here if needed.
      },
    });

    // Verify — throws on failure with detailed diff output
    await verifier.verifyProvider();

    // Clean up shared state after all verifications complete
    resetStateContext();
  }, 120_000); // 2 minute timeout for full verification suite
});
