/**
 * Help Screenshot Capture — runs as a Playwright test and writes PNGs to
 * apps/web/public/help/screenshots-src/ ready for optimization.
 *
 *   pnpm --filter @as-finance/web exec playwright test \
 *     --config test/playwright.config.ts \
 *     --project=desktop-chrome \
 *     e2e/help-screenshots.capture.ts \
 *     --reporter=line
 *
 * Idempotent — re-running overwrites existing PNGs.
 *
 * Safety guards:
 *   - Refuses to run if NODE_ENV === 'production'.
 *   - Refuses to run unless DATABASE_URL points to a local seed DB.
 */
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const AUTH_DIR = path.join(__dirname, '.auth');
function getAuthFile(role: string): string {
  return path.join(AUTH_DIR, `${role}.json`);
}

const OUT_DIR = path.join(__dirname, '..', '..', 'public', 'help', 'screenshots-src');
const MANIFEST = path.join(__dirname, '..', '..', 'public', 'help', 'screenshots.manifest.json');

function assertSafeEnv(): void {
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('Refusing to run screenshot capture against NODE_ENV=production.');
  }
  const dbUrl = process.env['DATABASE_URL'] ?? '';
  if (dbUrl && !/asfinance_lms|asfinance_dev|localhost|127\.0\.0\.1/.test(dbUrl)) {
    throw new Error(
      `Refusing to run: DATABASE_URL does not look like a local seed DB (got: ${dbUrl.slice(0, 40)}…).`,
    );
  }
}

type Role = 'super_admin' | 'manager' | 'field_officer' | 'collection_officer' | 'accountant' | 'office_staff' | 'viewer_auditor';
type Viewport = 'desktop' | 'mobile';

type Shot = {
  slug: string;        // e.g. "dashboard"
  chapter: string;     // e.g. "getting-started"
  role: Role;
  url: string;
  viewport: Viewport;
  /** CSS selector to wait for before snapping. */
  waitFor?: string;
  /** Optional clicks/actions before snapping (e.g. open a dialog). */
  before?: Array<{ click?: string }>;
};

const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: 390, height: 844 },
} as const;

const SHOTS: Shot[] = [
  // Getting Started
  { slug: 'dashboard', chapter: 'getting-started', role: 'manager', url: '/', viewport: 'desktop', waitFor: 'h1' },
  { slug: 'dashboard-mobile', chapter: 'getting-started', role: 'manager', url: '/', viewport: 'mobile', waitFor: 'h1' },

  // Roles — overview of sidebar permission gating
  { slug: 'sidebar-manager', chapter: 'roles', role: 'manager', url: '/', viewport: 'desktop', waitFor: 'h1' },
  { slug: 'sidebar-field-officer', chapter: 'roles', role: 'field_officer', url: '/', viewport: 'desktop', waitFor: 'h1' },
  { slug: 'sidebar-accountant', chapter: 'roles', role: 'accountant', url: '/', viewport: 'desktop', waitFor: 'h1' },

  // Customers
  { slug: 'customers-list', chapter: 'customers', role: 'field_officer', url: '/customers', viewport: 'desktop', waitFor: 'h1' },
  { slug: 'customer-new', chapter: 'customers', role: 'field_officer', url: '/customers/new', viewport: 'desktop', waitFor: 'h1' },

  // Loans
  { slug: 'loans-list', chapter: 'loans', role: 'field_officer', url: '/loans', viewport: 'desktop', waitFor: 'h1' },
  { slug: 'loan-new', chapter: 'loans', role: 'field_officer', url: '/loans/new', viewport: 'desktop', waitFor: 'h1' },

  // Collections
  { slug: 'collections-list', chapter: 'collections', role: 'collection_officer', url: '/collections', viewport: 'desktop', waitFor: 'h1' },
  { slug: 'collection-new', chapter: 'collections', role: 'collection_officer', url: '/collections/new', viewport: 'desktop', waitFor: 'h1' },
  { slug: 'collection-new-mobile', chapter: 'collections', role: 'collection_officer', url: '/collections/new', viewport: 'mobile', waitFor: 'h1' },

  // Groups
  { slug: 'groups-list', chapter: 'groups', role: 'field_officer', url: '/groups', viewport: 'desktop', waitFor: 'h1' },

  // Cashbook
  { slug: 'cashbook', chapter: 'cashbook', role: 'accountant', url: '/cashbook', viewport: 'desktop', waitFor: 'h1' },

  // Reports
  { slug: 'reports-hub', chapter: 'reports', role: 'manager', url: '/reports', viewport: 'desktop', waitFor: 'h1' },

  // Admin
  { slug: 'users-list', chapter: 'admin', role: 'super_admin', url: '/users', viewport: 'desktop', waitFor: 'h1' },
  { slug: 'settings', chapter: 'admin', role: 'super_admin', url: '/settings', viewport: 'desktop', waitFor: 'h1' },
  { slug: 'audit-log', chapter: 'admin', role: 'super_admin', url: '/audit', viewport: 'desktop', waitFor: 'h1' },

  // Help itself — meta screenshots
  { slug: 'help-home', chapter: 'getting-started', role: 'manager', url: '/help', viewport: 'desktop', waitFor: 'h1' },
];

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

test.describe('Capture help screenshots', () => {
  test.beforeAll(() => {
    assertSafeEnv();
    ensureDir(OUT_DIR);
  });

  const captured: Array<{ slug: string; chapter: string; role: Role; viewport: Viewport; capturedAt: string }> = [];

  for (const shot of SHOTS) {
    test(`${shot.chapter}/${shot.slug} as ${shot.role} @${shot.viewport}`, async ({ browser }) => {
      const authFilePath = getAuthFile(shot.role);
      if (!fs.existsSync(authFilePath)) {
        test.skip(true, `Missing auth state ${authFilePath} — run auth-setup first`);
      }

      const context = await browser.newContext({
        storageState: authFilePath,
        viewport: VIEWPORTS[shot.viewport],
      });
      const page = await context.newPage();

      try {
        await page.goto(shot.url, { waitUntil: 'networkidle' });
        if (shot.waitFor) await page.waitForSelector(shot.waitFor, { timeout: 15_000 });
        // Give animations / lazy data a moment to settle.
        await page.waitForTimeout(800);

        for (const step of shot.before ?? []) {
          if (step.click) await page.click(step.click);
          await page.waitForTimeout(400);
        }

        const chapterDir = path.join(OUT_DIR, shot.chapter);
        ensureDir(chapterDir);
        const outFile = path.join(chapterDir, `${shot.slug}.png`);
        await page.screenshot({ path: outFile, fullPage: false });

        // Sanity: file exists and is non-trivial size.
        const stat = fs.statSync(outFile);
        expect(stat.size).toBeGreaterThan(2000);

        captured.push({
          slug: shot.slug,
          chapter: shot.chapter,
          role: shot.role,
          viewport: shot.viewport,
          capturedAt: new Date().toISOString(),
        });
      } finally {
        await context.close();
      }
    });
  }

  test.afterAll(() => {
    if (captured.length === 0) return;
    const manifest = {
      generatedAt: new Date().toISOString(),
      entries: captured,
    };
    fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  });
});
