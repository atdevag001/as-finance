/**
 * Worker Setup — runs in each Vitest worker thread/fork before tests.
 *
 * Reads the seed data written by global-setup.ts and populates globalThis
 * so that test helpers (seed.ts, db-utils.ts) can access it.
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const seedFilePath = path.join(__dirname, '.seed-data.json');

if (fs.existsSync(seedFilePath)) {
  const raw = fs.readFileSync(seedFilePath, 'utf-8');
  const data = JSON.parse(raw);

  (globalThis as Record<string, unknown>)['__SEED_DATA__'] = data.seedData;
  (globalThis as Record<string, unknown>)['__API_BASE_URL__'] = data.apiBaseUrl;

  // Create a Prisma client for this worker
  if (data.databaseUrl) {
    const prisma = new PrismaClient({
      datasources: { db: { url: data.databaseUrl } },
    });
    (globalThis as Record<string, unknown>)['__PRISMA_CLIENT__'] = prisma;
  }
}
