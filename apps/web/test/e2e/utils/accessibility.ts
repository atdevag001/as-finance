/**
 * Accessibility Testing Utilities
 *
 * Integrates axe-core for WCAG compliance testing.
 */

import { Page, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

export interface A11yViolation {
  id: string;
  impact: 'minor' | 'moderate' | 'serious' | 'critical';
  description: string;
  helpUrl: string;
  nodes: number;
}

export interface A11yResult {
  violations: A11yViolation[];
  passes: number;
  incomplete: number;
}

/**
 * Run accessibility audit on current page
 */
export async function runAccessibilityAudit(
  page: Page,
  options: {
    includedImpacts?: ('minor' | 'moderate' | 'serious' | 'critical')[];
    disableRules?: string[];
  } = {}
): Promise<A11yResult> {
  const { includedImpacts = ['serious', 'critical'], disableRules = [] } = options;

  const axeBuilder = new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .disableRules(disableRules);

  const results = await axeBuilder.analyze();

  const violations: A11yViolation[] = results.violations
    .filter(v => includedImpacts.includes(v.impact as any))
    .map(v => ({
      id: v.id,
      impact: v.impact as A11yViolation['impact'],
      description: v.description,
      helpUrl: v.helpUrl,
      nodes: v.nodes.length,
    }));

  return {
    violations,
    passes: results.passes.length,
    incomplete: results.incomplete.length,
  };
}

/**
 * Assert no critical accessibility violations
 */
export async function expectNoA11yViolations(
  page: Page,
  options: { allowMinor?: boolean } = {}
): Promise<void> {
  const { allowMinor = true } = options;

  const impacts: ('minor' | 'moderate' | 'serious' | 'critical')[] = allowMinor
    ? ['moderate', 'serious', 'critical']
    : ['minor', 'moderate', 'serious', 'critical'];

  const result = await runAccessibilityAudit(page, { includedImpacts: impacts });

  if (result.violations.length > 0) {
    const report = result.violations
      .map(v => `- [${v.impact.toUpperCase()}] ${v.id}: ${v.description} (${v.nodes} elements)`)
      .join('\n');

    throw new Error(`Accessibility violations found:\n${report}`);
  }
}

/**
 * Check specific accessibility requirements
 */
export async function checkA11yRequirements(page: Page): Promise<{
  hasSkipLink: boolean;
  hasLandmarks: boolean;
  hasHeadingHierarchy: boolean;
  focusableElementsHaveLabels: boolean;
}> {
  const results = {
    hasSkipLink: false,
    hasLandmarks: false,
    hasHeadingHierarchy: false,
    focusableElementsHaveLabels: false,
  };

  // Check for skip link
  const skipLink = page.locator('a[href="#main"], a[href="#content"], .skip-link');
  results.hasSkipLink = await skipLink.count() > 0;

  // Check for landmarks
  const landmarks = page.locator('main, [role="main"], nav, [role="navigation"], header, footer');
  results.hasLandmarks = await landmarks.count() >= 2;

  // Check heading hierarchy
  const h1Count = await page.locator('h1').count();
  const h2Count = await page.locator('h2').count();
  results.hasHeadingHierarchy = h1Count >= 1 && (h2Count >= 0 || h1Count === 1);

  // Check focusable elements have labels
  const buttons = page.locator('button:not([aria-label]):not([aria-labelledby])');
  const emptyButtons = await buttons.evaluateAll(els =>
    els.filter(el => !el.textContent?.trim() && !el.querySelector('svg[aria-label]')).length
  );
  results.focusableElementsHaveLabels = emptyButtons === 0;

  return results;
}

/**
 * Test keyboard navigation
 */
export async function testKeyboardNavigation(
  page: Page,
  options: { tabStops?: number } = {}
): Promise<{ reachableElements: number; trapDetected: boolean }> {
  const { tabStops = 20 } = options;

  const visited: string[] = [];
  let trapDetected = false;

  // Start from body
  await page.keyboard.press('Tab');

  for (let i = 0; i < tabStops; i++) {
    const activeElement = await page.evaluate(() => {
      const el = document.activeElement;
      return el ? {
        tag: el.tagName,
        id: el.id,
        className: el.className,
      } : null;
    });

    if (activeElement) {
      const identifier = `${activeElement.tag}#${activeElement.id}.${activeElement.className}`;

      // Check for focus trap
      if (visited.includes(identifier) && visited.length < tabStops / 2) {
        trapDetected = true;
        break;
      }

      visited.push(identifier);
    }

    await page.keyboard.press('Tab');
  }

  return {
    reachableElements: visited.length,
    trapDetected,
  };
}

/**
 * Check color contrast
 */
export async function checkColorContrast(page: Page): Promise<{
  violations: { element: string; ratio: number; required: number }[];
}> {
  // Use axe-core's color contrast check
  const result = await runAccessibilityAudit(page, {
    includedImpacts: ['minor', 'moderate', 'serious', 'critical'],
  });

  const contrastViolations = result.violations.filter(v => v.id === 'color-contrast');

  return {
    violations: contrastViolations.map(v => ({
      element: v.id,
      ratio: 0, // axe doesn't expose the actual ratio easily
      required: 4.5, // WCAG AA requirement
    })),
  };
}

/**
 * Generate accessibility report
 */
export async function generateA11yReport(page: Page): Promise<string> {
  const audit = await runAccessibilityAudit(page, {
    includedImpacts: ['minor', 'moderate', 'serious', 'critical'],
  });
  const requirements = await checkA11yRequirements(page);
  const keyboard = await testKeyboardNavigation(page);

  let report = '# Accessibility Report\n\n';

  report += '## Summary\n';
  report += `- Violations: ${audit.violations.length}\n`;
  report += `- Passes: ${audit.passes}\n`;
  report += `- Incomplete: ${audit.incomplete}\n\n`;

  report += '## Requirements Check\n';
  report += `- Skip Link: ${requirements.hasSkipLink ? '✓' : '✗'}\n`;
  report += `- Landmarks: ${requirements.hasLandmarks ? '✓' : '✗'}\n`;
  report += `- Heading Hierarchy: ${requirements.hasHeadingHierarchy ? '✓' : '✗'}\n`;
  report += `- Focusable Labels: ${requirements.focusableElementsHaveLabels ? '✓' : '✗'}\n\n`;

  report += '## Keyboard Navigation\n';
  report += `- Reachable Elements: ${keyboard.reachableElements}\n`;
  report += `- Focus Trap: ${keyboard.trapDetected ? 'DETECTED!' : 'None'}\n\n`;

  if (audit.violations.length > 0) {
    report += '## Violations\n';
    for (const v of audit.violations) {
      report += `\n### ${v.id} (${v.impact})\n`;
      report += `${v.description}\n`;
      report += `Affected: ${v.nodes} elements\n`;
      report += `Help: ${v.helpUrl}\n`;
    }
  }

  return report;
}
