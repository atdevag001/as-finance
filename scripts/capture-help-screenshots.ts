#!/usr/bin/env tsx
/**
 * Captures help screenshots by driving the app with Playwright while logged in as the
 * appropriate role. Writes PNGs to apps/web/public/help/screenshots-src/ and a
 * sha256 manifest to apps/web/public/help/screenshots.manifest.json.
 *
 *   Usage:  pnpm tsx scripts/capture-help-screenshots.ts
 *
 * Run a separate pnpm optimize:help-images afterwards (planned) to convert to WebP.
 *
 * SAFETY GUARDS (V1):
 *  - Refuses to run if NODE_ENV === 'production'.
 *  - Refuses to run unless DATABASE_URL points to the seed dev DB.
 *  - PII OCR check on outputs is V1.1 (scripts/check-help-pii.ts).
 */
/* eslint-disable no-console */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'apps/web/public/help/screenshots-src');
const MANIFEST = path.join(ROOT, 'apps/web/public/help/screenshots.manifest.json');

function assertSafeEnv(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run against production NODE_ENV.');
  }
  const dbUrl = process.env.DATABASE_URL ?? '';
  if (!/asfinance_lms|asfinance_dev|localhost|127\.0\.0\.1/.test(dbUrl)) {
    throw new Error(
      `Refusing to run: DATABASE_URL does not look like a local seed DB (got: ${dbUrl.slice(0, 40)}…).`,
    );
  }
}

/**
 * Each entry: a help screenshot to capture. The script is intentionally not yet wired to
 * a live Playwright session — that lands in the same PR as the screenshots themselves.
 * For now this acts as the manifest of what screens to capture and as the safety stub.
 */
type Shot = {
  slug: string;          // becomes <chapter>/<slug>.png
  chapter: string;
  role: 'admin' | 'manager' | 'fieldOfficer' | 'collectionOfficer' | 'accountant';
  url: string;
  viewport?: 'desktop' | 'mobile';
  // Optional steps to run before capturing (clicks, dialogs to open). Filled in when the
  // capture script becomes live.
  prepare?: Array<{ action: 'click' | 'type' | 'wait'; selector?: string; value?: string }>;
};

const SHOTS: Shot[] = [
  // Getting Started
  { slug: 'login', chapter: 'getting-started', role: 'manager', url: '/login' },
  { slug: 'dashboard', chapter: 'getting-started', role: 'manager', url: '/' },
  { slug: 'sidebar-desktop', chapter: 'getting-started', role: 'manager', url: '/', viewport: 'desktop' },
  { slug: 'sidebar-mobile', chapter: 'getting-started', role: 'manager', url: '/', viewport: 'mobile' },

  // Customers
  { slug: 'customers-list', chapter: 'customers', role: 'fieldOfficer', url: '/customers' },
  { slug: 'customer-new', chapter: 'customers', role: 'fieldOfficer', url: '/customers/new' },

  // Loans
  { slug: 'loans-list', chapter: 'loans', role: 'fieldOfficer', url: '/loans' },
  { slug: 'loan-new', chapter: 'loans', role: 'fieldOfficer', url: '/loans/new' },

  // Collections
  { slug: 'collections-list', chapter: 'collections', role: 'collectionOfficer', url: '/collections' },
  { slug: 'collection-new', chapter: 'collections', role: 'collectionOfficer', url: '/collections/new' },
  { slug: 'collection-new-mobile', chapter: 'collections', role: 'collectionOfficer', url: '/collections/new', viewport: 'mobile' },

  // Cashbook
  { slug: 'cashbook-summary', chapter: 'cashbook', role: 'accountant', url: '/cashbook' },

  // Reports
  { slug: 'reports-hub', chapter: 'reports', role: 'manager', url: '/reports' },

  // Admin
  { slug: 'users-list', chapter: 'admin', role: 'admin', url: '/users' },
];

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function writeManifest(entries: Array<{ slug: string; chapter: string; sha256: string; capturedAt: string }>): Promise<void> {
  await fs.writeFile(MANIFEST, JSON.stringify({ generatedAt: new Date().toISOString(), entries }, null, 2));
}

async function main(): Promise<void> {
  assertSafeEnv();
  await ensureDir(OUT_DIR);

  console.log(`📸 Capture stub ready. ${SHOTS.length} screenshots planned.`);
  console.log(`   Output dir: ${OUT_DIR}`);
  console.log(`   Manifest:   ${MANIFEST}`);
  console.log('');
  console.log('   ℹ️  The actual Playwright capture lands in the next PR alongside the');
  console.log('       live screenshot file. This stub locks in the safety guards and the');
  console.log('       list of screens to capture.');

  // Emit a placeholder manifest so the file exists and the optimize step can chain on it.
  const placeholder = SHOTS.map((s) => ({
    slug: s.slug,
    chapter: s.chapter,
    sha256: crypto.createHash('sha256').update(`${s.chapter}/${s.slug}`).digest('hex'),
    capturedAt: '1970-01-01T00:00:00.000Z',
  }));
  await writeManifest(placeholder);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
