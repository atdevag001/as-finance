import { defineConfig, devices } from '@playwright/test';
import path from 'path';

const BASE_URL = process.env['BASE_URL'] || 'http://localhost:3000';
const CI = !!process.env['CI'];

// Auth state file paths
const AUTH_DIR = path.join(__dirname, 'e2e', '.auth');
const authFile = (role: string) => path.join(AUTH_DIR, `${role}.json`);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true, // Enable parallel execution
  forbidOnly: CI,
  retries: CI ? 2 : 1, // Retry once locally, twice in CI
  workers: CI ? 4 : 2, // More workers for faster execution
  timeout: 60_000,
  expect: { timeout: 10_000 },

  reporter: CI
    ? [['html', { open: 'never' }], ['junit', { outputFile: 'test-results/junit.xml' }], ['list']]
    : [['html', { open: 'on-failure' }], ['list']],

  outputDir: 'test-results',

  use: {
    baseURL: BASE_URL,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    // === Auth Setup Project ===
    // Runs first to create authenticated storage states for all roles
    {
      name: 'auth-setup',
      testMatch: /auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },

    // === Main Test Projects ===
    // These depend on auth-setup and use pre-authenticated storage states

    // Default project uses manager role (most common for tests)
    {
      name: 'desktop-chrome',
      testIgnore: /auth\.setup\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: authFile('manager'),
      },
      dependencies: ['auth-setup'],
    },

    // Mobile project also uses manager role
    {
      name: 'mobile-android',
      testIgnore: /auth\.setup\.ts/,
      use: {
        ...devices['Pixel 5'],
        storageState: authFile('manager'),
      },
      dependencies: ['auth-setup'],
    },

    // === Role-Specific Projects ===
    // Use these when testing role-specific functionality

    {
      name: 'as-admin',
      testIgnore: /auth\.setup\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: authFile('super_admin'),
      },
      dependencies: ['auth-setup'],
    },

    {
      name: 'as-manager',
      testIgnore: /auth\.setup\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: authFile('manager'),
      },
      dependencies: ['auth-setup'],
    },

    {
      name: 'as-field-officer',
      testIgnore: /auth\.setup\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: authFile('field_officer'),
      },
      dependencies: ['auth-setup'],
    },

    {
      name: 'as-collection-officer',
      testIgnore: /auth\.setup\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: authFile('collection_officer'),
      },
      dependencies: ['auth-setup'],
    },

    {
      name: 'as-accountant',
      testIgnore: /auth\.setup\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: authFile('accountant'),
      },
      dependencies: ['auth-setup'],
    },

    {
      name: 'as-office-staff',
      testIgnore: /auth\.setup\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: authFile('office_staff'),
      },
      dependencies: ['auth-setup'],
    },

    {
      name: 'as-auditor',
      testIgnore: /auth\.setup\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: authFile('viewer_auditor'),
      },
      dependencies: ['auth-setup'],
    },

    // === Unauthenticated Project ===
    // For testing login flows and unauthenticated access
    {
      name: 'unauthenticated',
      testIgnore: /auth\.setup\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: undefined, // No auth state
      },
      // No dependency on auth-setup
    },
  ],

  // WebServer configuration - only start in CI
  // In local dev, start servers manually: pnpm --filter @as-finance/api dev & pnpm --filter @as-finance/web dev
  ...(CI ? {
    webServer: [
      {
        command: 'pnpm --filter @as-finance/api dev',
        url: 'http://localhost:3001/health/live',
        reuseExistingServer: false,
        timeout: 120_000,
      },
      {
        command: 'pnpm --filter @as-finance/web dev',
        url: BASE_URL,
        reuseExistingServer: false,
        timeout: 120_000,
      },
    ],
  } : {}),
});
