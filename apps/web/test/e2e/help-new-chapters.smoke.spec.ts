/**
 * Smoke test — captures the V1.5 new chapter pages so we can visually confirm
 * the wired screenshots render correctly inside the chapter body.
 */
import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const AUTH_DIR = path.join(__dirname, '.auth');
const OUT_DIR = path.join(__dirname, '..', '..', 'public', 'help', 'screenshots-src', '_meta');

const SHOTS = [
  { slug: 'chapter-loan-products-en', url: '/help/loan-products?lang=en' },
  { slug: 'chapter-accounting-en', url: '/help/accounting?lang=en' },
  { slug: 'chapter-settings-en', url: '/help/settings?lang=en' },
  { slug: 'chapter-notifications-en', url: '/help/notifications?lang=en' },
  { slug: 'chapter-audit-hi', url: '/help/audit?lang=hi' },
  { slug: 'chapter-penalties-hinglish', url: '/help/penalties?lang=hinglish' },
  { slug: 'chapter-workflows-en', url: '/help/workflows?lang=en' },
];

test.describe('V1.5 chapter smoke', () => {
  test.beforeAll(() => {
    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  });

  for (const shot of SHOTS) {
    test(`smoke: ${shot.slug}`, async ({ browser }) => {
      const ctx = await browser.newContext({
        storageState: path.join(AUTH_DIR, 'manager.json'),
        viewport: { width: 1280, height: 2400 },
      });
      const page = await ctx.newPage();
      try {
        await page.goto('/', { waitUntil: 'networkidle' });
        await page.waitForSelector('h1', { timeout: 15_000 });
        await page.goto(shot.url, { waitUntil: 'networkidle' });
        await page.waitForSelector('h1', { timeout: 15_000 });
        await page.waitForTimeout(1500);
        await page.screenshot({ path: path.join(OUT_DIR, `${shot.slug}.png`), fullPage: true });
      } finally {
        await ctx.close();
      }
    });
  }
});
