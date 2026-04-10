import { type FullConfig } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Global setup - validates that auth files exist and are fresh.
 * Actual authentication is handled by the auth-setup project.
 * This runs before all tests to perform health checks.
 */
async function globalSetup(config: FullConfig) {
  const authDir = path.join(__dirname, '.auth');
  const managerAuthFile = path.join(authDir, 'manager.json');

  // Check if auth file exists
  if (!fs.existsSync(managerAuthFile)) {
    console.log('⚠️  Auth files not found. Run auth-setup project first:');
    console.log('   npx playwright test --project=auth-setup');
    // Don't fail - let auth-setup handle it via dependencies
    return;
  }

  // Check if auth file is fresh (< 10 minutes old)
  const stats = fs.statSync(managerAuthFile);
  const ageMinutes = (Date.now() - stats.mtimeMs) / 1000 / 60;

  if (ageMinutes > 10) {
    console.log(`⚠️  Auth tokens may be stale (${Math.round(ageMinutes)} min old). Consider refreshing:`);
    console.log('   rm -f e2e/.auth/*.json && npx playwright test --project=auth-setup');
  } else {
    console.log(`✅ Auth files are fresh (${Math.round(ageMinutes)} min old)`);
  }
}

export default globalSetup;
