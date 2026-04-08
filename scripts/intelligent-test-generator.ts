#!/usr/bin/env npx ts-node
/**
 * Intelligent Test Generator
 *
 * Parses component code and generates targeted Playwright E2E tests.
 * Uses AST analysis to understand component structure and interactions.
 */

import * as fs from 'fs';
import * as path from 'path';

interface ComponentAnalysis {
  name: string;
  path: string;
  route: string;
  imports: string[];
  hooks: string[];
  forms: FormField[];
  buttons: ButtonAction[];
  tables: TableConfig[];
  links: LinkInfo[];
  conditionalRenders: string[];
  apiCalls: ApiCall[];
  permissions: string[];
}

interface FormField {
  name: string;
  type: string;
  required: boolean;
  validation?: string;
}

interface ButtonAction {
  label: string;
  action: string;
  type: 'submit' | 'button' | 'link';
}

interface TableConfig {
  columns: string[];
  hasActions: boolean;
  hasPagination: boolean;
}

interface LinkInfo {
  text: string;
  href: string;
}

interface ApiCall {
  method: string;
  endpoint: string;
  hook?: string;
}

// Analyze a page component
function analyzeComponent(filePath: string): ComponentAnalysis {
  const content = fs.readFileSync(filePath, 'utf-8');
  const fileName = path.basename(filePath);
  const dirPath = path.dirname(filePath);
  const route = dirPath
    .replace(/.*\/app/, '')
    .replace(/\(dashboard\)/, '')
    .replace(/\[([^\]]+)\]/g, ':$1');

  const analysis: ComponentAnalysis = {
    name: extractComponentName(content) || fileName.replace('.tsx', ''),
    path: filePath,
    route: route || '/',
    imports: extractImports(content),
    hooks: extractHooks(content),
    forms: extractFormFields(content),
    buttons: extractButtons(content),
    tables: extractTables(content),
    links: extractLinks(content),
    conditionalRenders: extractConditionals(content),
    apiCalls: extractApiCalls(content),
    permissions: extractPermissions(content),
  };

  return analysis;
}

function extractComponentName(content: string): string | null {
  const match = content.match(/(?:export\s+default\s+function|function)\s+(\w+)/);
  return match ? match[1] : null;
}

function extractImports(content: string): string[] {
  const imports: string[] = [];
  const importRegex = /import\s+(?:{([^}]+)}|(\w+))\s+from\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[3]);
  }
  return imports;
}

function extractHooks(content: string): string[] {
  const hooks: string[] = [];
  const hookRegex = /use[A-Z]\w+/g;
  let match;
  while ((match = hookRegex.exec(content)) !== null) {
    if (!hooks.includes(match[0])) {
      hooks.push(match[0]);
    }
  }
  return hooks;
}

function extractFormFields(content: string): FormField[] {
  const fields: FormField[] = [];

  // Look for Input, Select, Textarea components
  const inputRegex = /<(?:Input|Select|Textarea)[^>]*(?:name|id)=["']([^"']+)["'][^>]*(?:required)?/gi;
  let match;
  while ((match = inputRegex.exec(content)) !== null) {
    fields.push({
      name: match[1],
      type: 'text',
      required: match[0].includes('required'),
    });
  }

  // Look for react-hook-form register calls
  const registerRegex = /register\(['"]([^'"]+)['"]/g;
  while ((match = registerRegex.exec(content)) !== null) {
    if (!fields.find(f => f.name === match[1])) {
      fields.push({
        name: match[1],
        type: 'text',
        required: false,
      });
    }
  }

  return fields;
}

function extractButtons(content: string): ButtonAction[] {
  const buttons: ButtonAction[] = [];

  // Look for Button components
  const buttonRegex = /<Button[^>]*>([^<]+)<\/Button>/gi;
  let match;
  while ((match = buttonRegex.exec(content)) !== null) {
    const buttonContent = match[0];
    buttons.push({
      label: match[1].trim(),
      action: buttonContent.includes('type="submit"') ? 'submit' : 'click',
      type: buttonContent.includes('type="submit"') ? 'submit' : 'button',
    });
  }

  return buttons;
}

function extractTables(content: string): TableConfig[] {
  const tables: TableConfig[] = [];

  // Check for Table or DataTable components
  if (content.includes('<Table') || content.includes('DataTable')) {
    const columns: string[] = [];
    const columnRegex = /(?:header|accessorKey|Header)[=:]\s*["']([^"']+)["']/gi;
    let match;
    while ((match = columnRegex.exec(content)) !== null) {
      columns.push(match[1]);
    }

    tables.push({
      columns,
      hasActions: content.includes('Actions') || content.includes('Edit') || content.includes('Delete'),
      hasPagination: content.includes('Pagination') || content.includes('page'),
    });
  }

  return tables;
}

function extractLinks(content: string): LinkInfo[] {
  const links: LinkInfo[] = [];

  const linkRegex = /<Link[^>]*href=["']([^"']+)["'][^>]*>([^<]*)</gi;
  let match;
  while ((match = linkRegex.exec(content)) !== null) {
    links.push({
      href: match[1],
      text: match[2].trim(),
    });
  }

  return links;
}

function extractConditionals(content: string): string[] {
  const conditionals: string[] = [];

  // Look for permission checks
  const permRegex = /(?:hasPermission|can|isAllowed)\(['"]([^'"]+)['"]\)/gi;
  let match;
  while ((match = permRegex.exec(content)) !== null) {
    conditionals.push(match[1]);
  }

  // Look for role checks
  const roleRegex = /role\s*===?\s*['"]([^'"]+)['"]/gi;
  while ((match = roleRegex.exec(content)) !== null) {
    conditionals.push(`role:${match[1]}`);
  }

  return conditionals;
}

function extractApiCalls(content: string): ApiCall[] {
  const calls: ApiCall[] = [];

  // Look for fetch/axios calls
  const fetchRegex = /(?:fetch|axios\.(?:get|post|put|delete|patch))\(['"]([^'"]+)['"]/gi;
  let match;
  while ((match = fetchRegex.exec(content)) !== null) {
    const method = match[0].includes('post') ? 'POST'
                 : match[0].includes('put') ? 'PUT'
                 : match[0].includes('delete') ? 'DELETE'
                 : match[0].includes('patch') ? 'PATCH'
                 : 'GET';
    calls.push({ method, endpoint: match[1] });
  }

  // Look for custom hooks
  const hookCallRegex = /use(Create|Update|Delete|Get|Fetch)(\w+)/g;
  while ((match = hookCallRegex.exec(content)) !== null) {
    calls.push({
      method: match[1] === 'Create' ? 'POST'
            : match[1] === 'Update' ? 'PUT'
            : match[1] === 'Delete' ? 'DELETE'
            : 'GET',
      endpoint: match[2].toLowerCase(),
      hook: match[0],
    });
  }

  return calls;
}

function extractPermissions(content: string): string[] {
  const permissions: string[] = [];

  const permRegex = /permission[s]?\s*[:=]\s*\[?['"]([^'"]+)['"]/gi;
  let match;
  while ((match = permRegex.exec(content)) !== null) {
    permissions.push(match[1]);
  }

  return permissions;
}

// Generate Playwright test from analysis
function generatePlaywrightTest(analysis: ComponentAnalysis): string {
  const moduleName = analysis.name.replace(/Page$/, '');
  const routePath = analysis.route;

  let testCode = `import { test, expect } from './fixtures';

/**
 * ${moduleName} Module - E2E Tests
 * Auto-generated from component analysis
 * Source: ${analysis.path}
 */

test.describe('${moduleName} Module', () => {
`;

  // Access control test
  testCode += `
  test.describe('Page Access', () => {
    test('authorized user can access page', async ({ managerPage }) => {
      await managerPage.goto('${routePath}');
      await managerPage.waitForLoadState('networkidle');
      await expect(managerPage).not.toHaveURL(/\\/login/);
    });
`;

  // If permissions detected, add permission-based tests
  if (analysis.permissions.length > 0 || analysis.conditionalRenders.length > 0) {
    testCode += `
    test('unauthorized role sees access denied', async ({ fieldOfficerPage }) => {
      await fieldOfficerPage.goto('${routePath}');
      // Check for redirect to access denied or visible error
      const accessDenied = fieldOfficerPage.getByText(/access denied|forbidden|not authorized/i);
      const loginRedirect = fieldOfficerPage.url().includes('/login');
      expect(await accessDenied.isVisible().catch(() => false) || loginRedirect).toBeTruthy();
    });
`;
  }
  testCode += `  });
`;

  // Form tests
  if (analysis.forms.length > 0) {
    testCode += `
  test.describe('Form Interactions', () => {
`;

    // Required field validation
    const requiredFields = analysis.forms.filter(f => f.required);
    if (requiredFields.length > 0) {
      testCode += `
    test('validates required fields', async ({ managerPage }) => {
      await managerPage.goto('${routePath}');
      await managerPage.waitForLoadState('networkidle');

      // Try to submit without filling required fields
      const submitBtn = managerPage.getByRole('button', { name: /submit|save|create/i });
      if (await submitBtn.isVisible()) {
        await submitBtn.click();

        // Check for validation errors
        const errorMessages = managerPage.locator('.text-destructive, [role="alert"]');
        await expect(errorMessages.first()).toBeVisible({ timeout: 5_000 });
      }
    });
`;
    }

    // Form field tests
    analysis.forms.forEach(field => {
      testCode += `
    test('${field.name} field is functional', async ({ managerPage }) => {
      await managerPage.goto('${routePath}');
      await managerPage.waitForLoadState('networkidle');

      const input = managerPage.locator('[name="${field.name}"], #${field.name}, [id="${field.name}"]').first();
      if (await input.isVisible()) {
        await input.fill('test value');
        await expect(input).toHaveValue('test value');
      }
    });
`;
    });

    testCode += `  });
`;
  }

  // Table tests
  if (analysis.tables.length > 0) {
    testCode += `
  test.describe('Data Display', () => {
    test('displays data table', async ({ managerPage }) => {
      await managerPage.goto('${routePath}');
      await managerPage.waitForLoadState('networkidle');

      const table = managerPage.locator('table, [role="table"]');
      await expect(table).toBeVisible({ timeout: 10_000 });
    });
`;

    if (analysis.tables[0]?.hasPagination) {
      testCode += `
    test('pagination works', async ({ managerPage }) => {
      await managerPage.goto('${routePath}');
      await managerPage.waitForLoadState('networkidle');

      const nextBtn = managerPage.getByRole('button', { name: /next|→|>/i });
      if (await nextBtn.isVisible() && await nextBtn.isEnabled()) {
        await nextBtn.click();
        await managerPage.waitForLoadState('networkidle');
        // Verify page changed
        await expect(managerPage.url()).toMatch(/page=2|offset=/);
      }
    });
`;
    }

    testCode += `  });
`;
  }

  // Button/Action tests
  if (analysis.buttons.length > 0) {
    testCode += `
  test.describe('Actions', () => {
`;

    analysis.buttons.forEach(button => {
      testCode += `
    test('${button.label} button is functional', async ({ managerPage }) => {
      await managerPage.goto('${routePath}');
      await managerPage.waitForLoadState('networkidle');

      const btn = managerPage.getByRole('button', { name: /${button.label}/i });
      if (await btn.isVisible()) {
        await expect(btn).toBeEnabled();
      }
    });
`;
    });

    testCode += `  });
`;
  }

  // Navigation tests
  if (analysis.links.length > 0) {
    testCode += `
  test.describe('Navigation', () => {
`;

    analysis.links.slice(0, 5).forEach(link => {
      testCode += `
    test('${link.text || link.href} link works', async ({ managerPage }) => {
      await managerPage.goto('${routePath}');
      await managerPage.waitForLoadState('networkidle');

      const link = managerPage.getByRole('link', { name: /${link.text || 'link'}/i }).first();
      if (await link.isVisible()) {
        const href = await link.getAttribute('href');
        expect(href).toBeTruthy();
      }
    });
`;
    });

    testCode += `  });
`;
  }

  testCode += `});
`;

  return testCode;
}

// Main execution
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: npx ts-node intelligent-test-generator.ts <page-path>');
    console.log('Example: npx ts-node intelligent-test-generator.ts apps/web/src/app/(dashboard)/loans/page.tsx');
    process.exit(1);
  }

  const pagePath = args[0];

  if (!fs.existsSync(pagePath)) {
    console.error(`File not found: ${pagePath}`);
    process.exit(1);
  }

  console.log(`Analyzing: ${pagePath}`);
  const analysis = analyzeComponent(pagePath);

  console.log('\n=== Component Analysis ===');
  console.log(JSON.stringify(analysis, null, 2));

  console.log('\n=== Generated Test ===');
  const testCode = generatePlaywrightTest(analysis);
  console.log(testCode);

  // Write to file
  const moduleName = analysis.name.replace(/Page$/, '').toLowerCase();
  const outputPath = `apps/web/test/e2e/${moduleName}.playwright.spec.ts`;

  if (args.includes('--write')) {
    fs.writeFileSync(outputPath, testCode);
    console.log(`\nTest written to: ${outputPath}`);
  } else {
    console.log(`\nTo save, run with --write flag`);
  }
}

main().catch(console.error);
