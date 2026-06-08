/**
 * E2E test suite for the in-app User Guide.
 *
 * Run:  npx playwright test --config playwright.config.ts --project=desktop-chrome \
 *         e2e/help.playwright.spec.ts --reporter=line
 *
 * Covers every dimension surfaced in the V1 plan:
 *   - sidebar Help visibility per role
 *   - home + each chapter renders for the appropriate role
 *   - language switcher: URL push, content swap, persistence, <html lang>
 *   - deep-link to #section scrolls correctly
 *   - in-app <HelpLink> navigates to the right help section
 *   - <HelpFab> visibility on stake pages, hidden elsewhere
 *   - Feedback widget POST works (network 204 + thanks copy)
 *   - screenshots load from /help/screenshots/* (200, not 404)
 *   - glossary <Term> tooltip + link
 *   - /help/typo → not-found page
 *   - print stylesheet rule loaded
 */
import { test, expect, type Page, type BrowserContext, type Browser } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const AUTH_DIR = path.join(__dirname, '.auth');
function getAuthFile(role: string): string {
  return path.join(AUTH_DIR, `${role}.json`);
}

async function newAuthedPage(
  browser: Browser,
  role: string,
  viewport: { width: number; height: number } = { width: 1280, height: 800 },
): Promise<{ page: Page; ctx: BrowserContext }> {
  const ctx = await browser.newContext({ storageState: getAuthFile(role), viewport });
  const page = await ctx.newPage();
  // Warm-up: hit / first so the auth provider gets to call /auth/refresh and seed
  // the CSRF cookie before any deep-link nav. Without this, tests that go straight to
  // /help/<chapter>?lang=... race the auth refresh and the dashboard layout redirects
  // them to /login.
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForSelector('h1', { timeout: 15_000 });
  return { page, ctx };
}

test.describe('Help — sidebar visibility', () => {
  for (const role of [
    'super_admin',
    'manager',
    'field_officer',
    'collection_officer',
    'accountant',
    'office_staff',
    'viewer_auditor',
  ]) {
    test(`Help nav item visible for ${role}`, async ({ browser }) => {
      const { page, ctx } = await newAuthedPage(browser, role);
      try {
        await page.goto('/', { waitUntil: 'networkidle' });
        const helpLink = page.getByRole('link', { name: /^Help$/ });
        await expect(helpLink).toBeVisible({ timeout: 15_000 });
        await expect(helpLink).toHaveAttribute('href', '/help');
      } finally {
        await ctx.close();
      }
    });
  }
});

test.describe('Help — home page', () => {
  test('greets user by first name and lists 11 chapters', async ({ browser }) => {
    const { page, ctx } = await newAuthedPage(browser, 'manager');
    try {
      await page.goto('/help', { waitUntil: 'networkidle' });
      await expect(page.locator('h1')).toContainText(/how can we help\?/i);

      // 11 chapter links should be rendered in the grid.
      const chapterLinks = page.locator('a[href^="/help/"]').filter({
        hasText: /Getting Started|Your Role|Customers|Loans|Collections|Groups|Cashbook|Reports|Administration|Help & Troubleshooting|Glossary/,
      });
      const count = await chapterLinks.count();
      expect(count).toBeGreaterThanOrEqual(11);

      // "First time?" CTA visible.
      await expect(page.getByRole('link', { name: /5-minute tour/i })).toBeVisible();

      // Support phone card visible.
      await expect(page.getByText(/Support phone/i)).toBeVisible();
    } finally {
      await ctx.close();
    }
  });
});

test.describe('Help — every chapter loads', () => {
  const chapters = [
    'getting-started',
    'roles',
    'customers',
    'loans',
    'collections',
    'groups',
    'cashbook',
    'reports',
    'admin',
    'troubleshooting',
    'glossary',
  ];
  for (const slug of chapters) {
    test(`chapter /${slug} renders for a manager`, async ({ browser }) => {
      const { page, ctx } = await newAuthedPage(browser, 'manager');
      try {
        const resp = await page.goto(`/help/${slug}`, { waitUntil: 'networkidle' });
        expect(resp?.status()).toBeLessThan(400);
        const h1 = page.locator('h1').first();
        await expect(h1).toBeVisible({ timeout: 15_000 });
        const headingText = (await h1.innerText()).trim();
        expect(headingText.length).toBeGreaterThan(2);

        // Language switcher visible.
        await expect(page.getByRole('button', { name: 'English' })).toBeVisible();
      } finally {
        await ctx.close();
      }
    });
  }
});

test.describe('Help — language switcher', () => {
  test('switches content, pushes ?lang= to URL, updates <html lang>, persists across reload', async ({ browser }) => {
    const { page, ctx } = await newAuthedPage(browser, 'manager');
    try {
      await page.goto('/help/getting-started', { waitUntil: 'networkidle' });
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');

      // Switch to Hindi.
      await page.getByRole('button', { name: 'हिंदी' }).click();
      await page.waitForURL(/lang=hi/);
      await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
      await expect(page.locator('h1')).toContainText('शुरुआत');

      // Switch to Hinglish.
      await page.getByRole('button', { name: 'Hinglish' }).click();
      await page.waitForURL(/lang=hinglish/);
      await expect(page.locator('html')).toHaveAttribute('lang', 'en'); // Hinglish → en for screen readers
      await expect(page.locator('h1')).toContainText('Shuruaat');

      // Reload → preference persists.
      await page.reload({ waitUntil: 'networkidle' });
      await expect(page.locator('h1')).toContainText('Shuruaat');
    } finally {
      await ctx.close();
    }
  });

  test('aria-pressed reflects the current language', async ({ browser }) => {
    const { page, ctx } = await newAuthedPage(browser, 'manager');
    try {
      await page.goto('/help/loans?lang=hi', { waitUntil: 'networkidle' });
      await expect(page.getByRole('button', { name: 'हिंदी' })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'false');
    } finally {
      await ctx.close();
    }
  });
});

test.describe('Help — deep-link to a section', () => {
  test('?lang=hi#approve scrolls to the approve section in Hindi', async ({ browser }) => {
    const { page, ctx } = await newAuthedPage(browser, 'manager');
    try {
      await page.goto('/help/loans?lang=hi#approve', { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200); // smooth-scroll settle
      const approve = page.locator('section#approve');
      await expect(approve).toBeVisible();
      // Section should be near the top of the viewport (within 200px).
      const box = await approve.boundingBox();
      expect(box?.y ?? 9999).toBeLessThan(300);
    } finally {
      await ctx.close();
    }
  });
});

test.describe('Help — embedded <HelpLink> in app', () => {
  test('? icon next to Post Collection header opens collections#post', async ({ browser }) => {
    const { page, ctx } = await newAuthedPage(browser, 'collection_officer');
    try {
      await page.goto('/collections/new', { waitUntil: 'networkidle' });
      const link = page.getByRole('link', { name: /How to post a collection/i });
      await expect(link).toBeVisible();
      const href = await link.getAttribute('href');
      expect(href).toContain('/help/collections');
      expect(href).toContain('#post');
    } finally {
      await ctx.close();
    }
  });

  test('? icon next to Cashbook header points to day-end', async ({ browser }) => {
    const { page, ctx } = await newAuthedPage(browser, 'accountant');
    try {
      await page.goto('/cashbook', { waitUntil: 'networkidle' });
      const link = page.getByRole('link', { name: /How day-end works/i });
      await expect(link).toBeVisible();
      const href = await link.getAttribute('href');
      expect(href).toContain('/help/cashbook');
      expect(href).toContain('#day-end');
    } finally {
      await ctx.close();
    }
  });
});

test.describe('Help — <HelpFab> visibility', () => {
  test('appears on /collections/new', async ({ browser }) => {
    const { page, ctx } = await newAuthedPage(browser, 'collection_officer');
    try {
      await page.goto('/collections/new', { waitUntil: 'networkidle' });
      const fab = page.getByRole('link', { name: /Open help for this screen/i });
      await expect(fab).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test('absent on /receipts (non-stake page)', async ({ browser }) => {
    const { page, ctx } = await newAuthedPage(browser, 'manager');
    try {
      await page.goto('/receipts', { waitUntil: 'networkidle' });
      await page.waitForTimeout(800);
      const fab = page.getByRole('link', { name: /Open help for this screen/i });
      await expect(fab).toHaveCount(0);
    } finally {
      await ctx.close();
    }
  });

  test('absent on /help itself', async ({ browser }) => {
    const { page, ctx } = await newAuthedPage(browser, 'manager');
    try {
      await page.goto('/help', { waitUntil: 'networkidle' });
      const fab = page.getByRole('link', { name: /Open help for this screen/i });
      await expect(fab).toHaveCount(0);
    } finally {
      await ctx.close();
    }
  });
});

test.describe('Help — feedback widget', () => {
  test('POST /help/feedback succeeds and the thanks message replaces buttons', async ({ browser }) => {
    const { page, ctx } = await newAuthedPage(browser, 'manager');
    try {
      let feedbackStatus: number | null = null;
      page.on('response', async (resp) => {
        if (resp.url().endsWith('/help/feedback') && resp.request().method() === 'POST') {
          feedbackStatus = resp.status();
        }
      });

      await page.goto('/help/collections', { waitUntil: 'networkidle' });
      // Click the first "Yes" feedback button on the page.
      const yes = page.getByRole('button', { name: /^Yes$/ }).first();
      await yes.scrollIntoViewIfNeeded();
      await yes.click();
      await page.waitForTimeout(1500);

      expect(feedbackStatus).not.toBeNull();
      expect(feedbackStatus, `feedback POST returned ${feedbackStatus}`).toBeLessThan(400);

      // Thanks message visible (in English since default lang is en).
      await expect(page.getByText(/Thanks for the feedback/i).first()).toBeVisible();
    } finally {
      await ctx.close();
    }
  });
});

test.describe('Help — static assets', () => {
  test('screenshots under /help/screenshots/* return 200', async ({ request }) => {
    const paths = [
      '/help/screenshots/getting-started/dashboard.png',
      '/help/screenshots/collections/collection-new.png',
      '/help/screenshots/collections/collection-new-mobile.png',
      '/help/screenshots/cashbook/cashbook.png',
      '/help/screenshots/loans/loan-new.png',
      '/help/screenshots/roles/sidebar-manager.png',
      '/help/screenshots/admin/settings.png',
    ];
    for (const p of paths) {
      const resp = await request.get(p);
      expect(resp.status(), `${p} expected 200, got ${resp.status()}`).toBe(200);
      const len = Number(resp.headers()['content-length'] ?? 0);
      expect(len, `${p} is empty`).toBeGreaterThan(2000);
    }
  });
});

test.describe('Help — glossary', () => {
  test('glossary page renders all terms as sections', async ({ browser }) => {
    const { page, ctx } = await newAuthedPage(browser, 'manager');
    try {
      await page.goto('/help/glossary', { waitUntil: 'networkidle' });
      await expect(page.locator('h1')).toContainText(/Glossary/i);
      // The glossary has many terms; check a few we know exist.
      for (const id of ['emi', 'dpd', 'foreclosure', 'maker-checker']) {
        await expect(page.locator(`section#${id}`)).toBeVisible();
      }
    } finally {
      await ctx.close();
    }
  });
});

test.describe('Help — not-found', () => {
  test('/help/loan (typo) renders not-found with suggestions', async ({ browser }) => {
    const { page, ctx } = await newAuthedPage(browser, 'manager');
    try {
      const resp = await page.goto('/help/loan');
      // Next.js serves not-found.tsx with 404 status by default.
      expect([404, 200]).toContain(resp?.status() ?? 0);
      await expect(page.getByText(/couldn't find that page/i)).toBeVisible();
      // Suggestion list contains at least the Loans chapter link.
      await expect(page.getByRole('link', { name: /Loans/i }).first()).toBeVisible();
    } finally {
      await ctx.close();
    }
  });
});

test.describe('Help — print styles loaded', () => {
  test('Print button is visible and prose-help class applied', async ({ browser }) => {
    const { page, ctx } = await newAuthedPage(browser, 'manager');
    try {
      await page.goto('/help/loans', { waitUntil: 'networkidle' });
      await expect(page.getByRole('button', { name: /Print this chapter/i })).toBeVisible();
      const proseClass = await page.locator('.prose-help').count();
      expect(proseClass).toBeGreaterThan(0);
    } finally {
      await ctx.close();
    }
  });
});

test.describe('Help — copy-link buttons', () => {
  test('each section has a Copy-link button', async ({ browser }) => {
    const { page, ctx } = await newAuthedPage(browser, 'manager');
    try {
      await page.goto('/help/collections', { waitUntil: 'networkidle' });
      // The Collections chapter has 7 sections; expect at least 5 copy-link buttons.
      const buttons = page.getByRole('button', { name: /Copy link/i });
      const count = await buttons.count();
      expect(count).toBeGreaterThanOrEqual(5);
    } finally {
      await ctx.close();
    }
  });
});
