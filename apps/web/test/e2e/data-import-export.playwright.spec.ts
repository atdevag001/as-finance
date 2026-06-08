/**
 * E2E tests for Excel import/export — V1.
 *
 * Exercises the user-visible parts: button visibility per role, file download,
 * import modal lifecycle, and the no-permission case.
 */
import { test, expect, type Browser } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const AUTH_DIR = path.join(__dirname, '.auth');
const authFile = (role: string) => path.join(AUTH_DIR, `${role}.json`);

async function newAuthedPage(browser: Browser, role: string) {
  const ctx = await browser.newContext({
    storageState: authFile(role),
    viewport: { width: 1280, height: 800 },
  });
  const page = await ctx.newPage();
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForSelector('h1', { timeout: 15_000 });
  return { page, ctx };
}

test.describe('Excel Export', () => {
  test('Customers page shows the Export button to manager', async ({ browser }) => {
    const { page, ctx } = await newAuthedPage(browser, 'manager');
    try {
      await page.goto('/customers', { waitUntil: 'networkidle' });
      const btn = page.getByRole('button', { name: /Excel/ });
      await expect(btn.first()).toBeVisible({ timeout: 10_000 });
    } finally {
      await ctx.close();
    }
  });

  test('Customers page does NOT show the Export button to office_staff', async ({ browser }) => {
    const { page, ctx } = await newAuthedPage(browser, 'office_staff');
    try {
      await page.goto('/customers', { waitUntil: 'networkidle' });
      await page.waitForSelector('h1', { timeout: 10_000 });
      const btn = page.getByRole('button', { name: /^Excel$/ });
      await expect(btn).toHaveCount(0);
    } finally {
      await ctx.close();
    }
  });

  test('clicking Export to Excel downloads an .xlsx file', async ({ browser }) => {
    const { page, ctx } = await newAuthedPage(browser, 'manager');
    try {
      await page.goto('/customers', { waitUntil: 'networkidle' });
      const btn = page.getByRole('button', { name: /Excel/ }).first();
      await expect(btn).toBeVisible();
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 30_000 }),
        btn.click(),
      ]);
      const fname = download.suggestedFilename();
      expect(fname).toMatch(/\.xlsx$/);
      const tmp = await download.path();
      expect(tmp).toBeTruthy();
      if (tmp) {
        const size = fs.statSync(tmp).size;
        expect(size).toBeGreaterThan(2000);
      }
    } finally {
      await ctx.close();
    }
  });

  test('Loans and Groups pages also expose Export to manager', async ({ browser }) => {
    const { page, ctx } = await newAuthedPage(browser, 'manager');
    try {
      await page.goto('/loans', { waitUntil: 'networkidle' });
      await expect(page.getByRole('button', { name: /Excel/ }).first()).toBeVisible();
      await page.goto('/groups', { waitUntil: 'networkidle' });
      await expect(page.getByRole('button', { name: /Excel/ }).first()).toBeVisible();
    } finally {
      await ctx.close();
    }
  });
});

test.describe('Excel Import', () => {
  test('Settings page shows the Import Holidays + Import Settings buttons to super_admin', async ({ browser }) => {
    const { page, ctx } = await newAuthedPage(browser, 'super_admin');
    try {
      await page.goto('/settings', { waitUntil: 'networkidle' });
      await expect(page.getByRole('button', { name: /Import Holidays/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /Import Settings/i })).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test('manager does NOT see Import buttons (settings.import is super_admin-only)', async ({ browser }) => {
    const { page, ctx } = await newAuthedPage(browser, 'manager');
    try {
      await page.goto('/settings', { waitUntil: 'networkidle' });
      await expect(page.getByRole('button', { name: /Import Holidays/i })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /Import Settings/i })).toHaveCount(0);
    } finally {
      await ctx.close();
    }
  });

  test('Import Holidays modal opens with upload state', async ({ browser }) => {
    const { page, ctx } = await newAuthedPage(browser, 'super_admin');
    try {
      await page.goto('/settings', { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: /Import Holidays/i }).click();
      await expect(page.getByText(/Import Holiday Calendar/i)).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(/Choose \.xlsx or \.csv file/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /Download blank template/i })).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test('Loan Products page exposes Import Products to super_admin', async ({ browser }) => {
    const { page, ctx } = await newAuthedPage(browser, 'super_admin');
    try {
      await page.goto('/loan-products', { waitUntil: 'networkidle' });
      await expect(page.getByRole('button', { name: /Import Products/i })).toBeVisible();
    } finally {
      await ctx.close();
    }
  });
});

test.describe('Data Import/Export help chapter', () => {
  test('Help home includes the new chapter card', async ({ browser }) => {
    const { page, ctx } = await newAuthedPage(browser, 'manager');
    try {
      await page.goto('/help', { waitUntil: 'networkidle' });
      const link = page.getByRole('link', { name: /Data Import/i });
      await expect(link.first()).toBeVisible({ timeout: 10_000 });
    } finally {
      await ctx.close();
    }
  });

  test('Help chapter renders all sections', async ({ browser }) => {
    const { page, ctx } = await newAuthedPage(browser, 'manager');
    try {
      await page.goto('/help/data-import-export', { waitUntil: 'networkidle' });
      await expect(page.locator('h1')).toContainText(/Data Import \/ Export/);
      await expect(page.locator('section#exporting')).toBeVisible();
      await expect(page.locator('section#importing-holidays')).toBeVisible();
      await expect(page.locator('section#cant-import')).toBeVisible();
    } finally {
      await ctx.close();
    }
  });
});
