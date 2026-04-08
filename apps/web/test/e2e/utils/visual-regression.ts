/**
 * Visual Regression Testing Utilities
 *
 * Screenshot comparison for detecting visual changes.
 */

import { Page, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const SNAPSHOTS_DIR = path.join(__dirname, '..', '__snapshots__');
const DIFF_DIR = path.join(__dirname, '..', '__diffs__');

// Ensure directories exist
if (!fs.existsSync(SNAPSHOTS_DIR)) fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
if (!fs.existsSync(DIFF_DIR)) fs.mkdirSync(DIFF_DIR, { recursive: true });

export interface VisualComparisonOptions {
  /** Threshold for pixel difference (0-1). Default: 0.1 */
  threshold?: number;
  /** Max allowed different pixels. Default: 100 */
  maxDiffPixels?: number;
  /** Mask dynamic elements */
  mask?: string[];
  /** Wait for animations to complete */
  animations?: 'disabled' | 'allow';
  /** Full page screenshot */
  fullPage?: boolean;
}

/**
 * Take a screenshot and compare with baseline
 */
export async function compareScreenshot(
  page: Page,
  name: string,
  options: VisualComparisonOptions = {}
): Promise<void> {
  const {
    threshold = 0.1,
    maxDiffPixels = 100,
    mask = [],
    animations = 'disabled',
    fullPage = false,
  } = options;

  // Wait for page to stabilize
  await page.waitForLoadState('networkidle');

  // Disable animations if requested
  if (animations === 'disabled') {
    await page.addStyleTag({
      content: `
        *, *::before, *::after {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          transition-duration: 0s !important;
          transition-delay: 0s !important;
        }
      `,
    });
  }

  // Mask dynamic elements (like timestamps, avatars)
  for (const selector of mask) {
    await page.locator(selector).evaluateAll(els => {
      els.forEach(el => {
        (el as HTMLElement).style.visibility = 'hidden';
      });
    });
  }

  // Use Playwright's built-in visual comparison
  await expect(page).toHaveScreenshot(`${name}.png`, {
    threshold,
    maxDiffPixels,
    fullPage,
  });
}

/**
 * Compare specific element screenshot
 */
export async function compareElementScreenshot(
  page: Page,
  selector: string,
  name: string,
  options: VisualComparisonOptions = {}
): Promise<void> {
  const element = page.locator(selector);
  await expect(element).toBeVisible();

  await expect(element).toHaveScreenshot(`${name}.png`, {
    threshold: options.threshold || 0.1,
    maxDiffPixels: options.maxDiffPixels || 50,
  });
}

/**
 * Visual regression test for responsive design
 */
export async function testResponsiveDesign(
  page: Page,
  name: string,
  viewports: { width: number; height: number; name: string }[] = [
    { width: 1920, height: 1080, name: 'desktop' },
    { width: 1024, height: 768, name: 'tablet-landscape' },
    { width: 768, height: 1024, name: 'tablet-portrait' },
    { width: 375, height: 667, name: 'mobile' },
  ]
): Promise<void> {
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveScreenshot(`${name}-${viewport.name}.png`, {
      fullPage: true,
      threshold: 0.15,
    });
  }
}

/**
 * Common masks for dynamic content
 */
export const COMMON_MASKS = {
  timestamps: '[data-testid*="time"], [data-testid*="date"], .timestamp, time',
  avatars: '[data-testid*="avatar"], .avatar, img[alt*="avatar"]',
  counters: '[data-testid*="count"], .badge, .counter',
  charts: 'canvas, svg.recharts-surface',
  loading: '.skeleton, .loading, [data-loading]',
};

/**
 * Take screenshots of all critical pages
 */
export async function captureAllPages(
  page: Page,
  pages: { path: string; name: string }[],
  options: VisualComparisonOptions = {}
): Promise<{ path: string; name: string; error?: string }[]> {
  const results: { path: string; name: string; error?: string }[] = [];

  for (const pageInfo of pages) {
    try {
      await page.goto(pageInfo.path);
      await page.waitForLoadState('networkidle');

      await compareScreenshot(page, pageInfo.name, {
        ...options,
        mask: [COMMON_MASKS.timestamps, COMMON_MASKS.avatars],
      });

      results.push({ path: pageInfo.path, name: pageInfo.name });
    } catch (error) {
      results.push({
        path: pageInfo.path,
        name: pageInfo.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

/**
 * Update baseline screenshots
 */
export async function updateBaselines(
  page: Page,
  pages: { path: string; name: string }[]
): Promise<void> {
  console.log('Updating visual baselines...');

  for (const pageInfo of pages) {
    await page.goto(pageInfo.path);
    await page.waitForLoadState('networkidle');

    const screenshot = await page.screenshot({ fullPage: true });
    const baselinePath = path.join(SNAPSHOTS_DIR, `${pageInfo.name}.png`);

    fs.writeFileSync(baselinePath, screenshot);
    console.log(`Updated: ${baselinePath}`);
  }

  console.log('Baseline update complete');
}

/**
 * Generate visual regression report
 */
export function generateVisualReport(
  results: { path: string; name: string; error?: string }[]
): string {
  let report = '# Visual Regression Report\n\n';

  const passed = results.filter(r => !r.error);
  const failed = results.filter(r => r.error);

  report += `## Summary\n`;
  report += `- Total: ${results.length}\n`;
  report += `- Passed: ${passed.length}\n`;
  report += `- Failed: ${failed.length}\n\n`;

  if (failed.length > 0) {
    report += `## Failures\n`;
    for (const result of failed) {
      report += `\n### ${result.name}\n`;
      report += `Path: ${result.path}\n`;
      report += `Error: ${result.error}\n`;
    }
  }

  return report;
}
