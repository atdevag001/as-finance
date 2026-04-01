/**
 * Chaos Test — Shared Bootstrap
 *
 * Extracts the common bootstrap logic (seed data loading, Prisma client creation,
 * auth client setup) used across all chaos test specs.
 *
 * Usage:
 *   const ctx = bootstrapChaosTest();
 *   // ctx.prisma, ctx.dbUtils, ctx.clients, ctx.seedData, ctx.apiBaseUrl
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { createAuthClients, type AuthClients } from '../helpers/auth-client.js';
import { createDbUtils, type DbUtils } from '../helpers/db-utils.js';
import type { SeedData } from '../setup/global-setup.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ChaosTestContext {
  prisma: PrismaClient;
  dbUtils: DbUtils;
  clients: AuthClients;
  seedData: SeedData;
  apiBaseUrl: string;
}

// ─── Seed Data Loading ──────────────────────────────────────────────────────

function loadSeedDataFromFile(): {
  seedData: SeedData;
  apiBaseUrl: string;
  databaseUrl: string;
} {
  const seedFilePath = path.join(__dirname, '../setup/.seed-data.json');
  if (!fs.existsSync(seedFilePath)) {
    throw new Error(
      'Seed data file not found. Run E2E global setup first (npm run test:e2e).',
    );
  }
  const raw = fs.readFileSync(seedFilePath, 'utf-8');
  return JSON.parse(raw);
}

// ─── Bootstrap ──────────────────────────────────────────────────────────────

/**
 * Bootstrap a chaos test context. Call in beforeAll().
 * Returns prisma, dbUtils, auth clients, seed data, and API base URL.
 */
export function bootstrapChaosTest(): ChaosTestContext {
  const data = loadSeedDataFromFile();

  const prisma = new PrismaClient({
    datasources: { db: { url: data.databaseUrl } },
  });

  const dbUtils = createDbUtils(prisma);

  const tokens: Record<string, string> = {};
  for (const [key, user] of Object.entries(data.seedData.users)) {
    tokens[key] = user.token;
  }
  const clients = createAuthClients(data.apiBaseUrl, tokens);

  return {
    prisma,
    dbUtils,
    clients,
    seedData: data.seedData,
    apiBaseUrl: data.apiBaseUrl,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Generate a unique idempotency key for chaos tests. */
export function chaosIdempKey(prefix = 'chaos'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Extract customer ID from factory response (handles both shapes). */
export function extractCustomerId(c: Record<string, unknown>): string {
  return (
    ((c['customer'] as Record<string, unknown>)?.['id'] as string) ??
    (c['id'] as string)
  );
}
