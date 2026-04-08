import { chromium, type FullConfig } from '@playwright/test';
import { login, TEST_USERS } from './fixtures/auth.fixture';
import * as path from 'path';

/**
 * Global setup - authenticate as manager once and save the session.
 * All tests will use this saved session instead of logging in each time.
 */
async function globalSetup(config: FullConfig) {
  const { baseURL } = config.projects[0].use;

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // Login as manager
  const manager = TEST_USERS.manager;

  // Navigate to login
  await page.goto(`${baseURL}/login`);
  await page.waitForLoadState('domcontentloaded');

  // Wait for the form
  await page.getByLabel('Username').waitFor({ state: 'visible', timeout: 15_000 });

  // Fill and submit
  await page.getByLabel('Username').fill(manager.username);
  await page.getByLabel('Password').fill(manager.password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Wait for redirect away from login
  await page.waitForURL(/^(?!.*\/login)/, { timeout: 30_000 });
  await page.waitForLoadState('networkidle');

  // Save storage state (cookies + localStorage)
  const storageStatePath = path.join(__dirname, '.auth', 'manager.json');
  await context.storageState({ path: storageStatePath });

  await browser.close();
}

export default globalSetup;
