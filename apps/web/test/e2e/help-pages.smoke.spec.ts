/**
 * Smoke test — captures one help chapter page so we can visually confirm
 * that the chapter renders (language switcher, sections, screenshots all visible).
 */
import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const AUTH_DIR = path.join(__dirname, '.auth');
const OUT_DIR = path.join(__dirname, '..', '..', 'public', 'help', 'screenshots-src', '_meta');

const SHOTS = [
  { slug: 'chapter-collections-en', url: '/help/collections?lang=en', role: 'manager' },
  { slug: 'chapter-collections-hi', url: '/help/collections?lang=hi', role: 'manager' },
  { slug: 'chapter-collections-hinglish', url: '/help/collections?lang=hinglish', role: 'manager' },
  { slug: 'chapter-loans-en', url: '/help/loans?lang=en#disburse', role: 'manager' },
];

test.describe('Help chapter smoke', () => {
  test.beforeAll(() => {
    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  });

  for (const shot of SHOTS) {
    test(`smoke: ${shot.slug}`, async ({ browser }) => {
      const ctx = await browser.newContext({
        storageState: path.join(AUTH_DIR, `${shot.role}.json`),
        viewport: { width: 1280, height: 1800 },
      });
      const page = await ctx.newPage();
      try {
        await page.goto(shot.url, { waitUntil: 'networkidle' });
        await page.waitForSelector('h1', { timeout: 15_000 });
        await page.waitForTimeout(1200);
        await page.screenshot({ path: path.join(OUT_DIR, `${shot.slug}.png`), fullPage: true });
      } finally {
        await ctx.close();
      }
    });
  }
});
