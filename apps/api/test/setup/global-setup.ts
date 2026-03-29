/**
 * Vitest globalSetup — runs once before all E2E test suites.
 *
 * Responsibilities:
 *  1. Verify PostgreSQL connectivity via Prisma
 *  2. Run pending migrations (if needed)
 *  3. Verify API server health via GET /health/ready
 *  4. Seed baseline data (users, loan products, chart of accounts, holidays, settings)
 *  5. Generate and cache JWT tokens for each role
 *  6. Export SeedData on globalThis for test suites
 */

import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import { loadTestConfig } from './test-config.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LoanProductConfig {
  interestType: 'flat' | 'reducing_balance';
  annualRateBps: number;
  minPrincipalPaise: number;
  maxPrincipalPaise: number;
  minTenureMonths: number;
  maxTenureMonths: number;
  repaymentFrequency: 'daily' | 'weekly' | 'monthly';
  processingFeeType?: 'fixed' | 'percentage';
  processingFeeValue?: number;
  penaltyGraceDays?: number;
  penaltyType?: 'flat_per_period' | 'percentage_of_overdue';
  penaltyValue?: number;
  penaltyFrequency?: 'daily' | 'weekly' | 'monthly';
}

export interface SeedData {
  users: {
    superAdmin: { id: string; username: string; token: string };
    manager: { id: string; username: string; token: string };
    manager2: { id: string; username: string; token: string };
    fieldOfficer: { id: string; username: string; token: string };
    collectionOfficer: { id: string; username: string; token: string };
    accountant: { id: string; username: string; token: string };
    officeStaff: { id: string; username: string; token: string };
    viewerAuditor: { id: string; username: string; token: string };
  };
  products: {
    flatMonthly: { id: string; versionId: string; config: LoanProductConfig };
    reducingMonthly: { id: string; versionId: string; config: LoanProductConfig };
    flatWeekly: { id: string; versionId: string; config: LoanProductConfig };
    withProcessingFee: { id: string; versionId: string; config: LoanProductConfig };
  };
  accounts: {
    cash: { id: string; code: '1001' };
    bank: { id: string; code: '1002' };
    loansReceivable: { id: string; code: '1100' };
    interestIncome: { id: string; code: '4001' };
    processingFeeIncome: { id: string; code: '4002' };
    penaltyIncome: { id: string; code: '4003' };
    travelExpense: { id: string; code: '5003' };
    otherExpense: { id: string; code: '5099' };
  };
  holidays: Date[];
  settings: {
    holidayCalendar: Date[];
    defaultPenaltyGraceDays: number;
    maxPageSize: number;
  };
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TEST_PASSWORD = 'TestPass1';

const SEED_USERS = [
  { key: 'superAdmin', username: 'e2e_super_admin', fullName: 'E2E Super Admin', mobile: '9800000001', role: 'super_admin' },
  { key: 'manager', username: 'e2e_manager', fullName: 'E2E Manager', mobile: '9800000002', role: 'manager' },
  { key: 'manager2', username: 'e2e_manager2', fullName: 'E2E Manager 2', mobile: '9800000003', role: 'manager' },
  { key: 'fieldOfficer', username: 'e2e_field_officer', fullName: 'E2E Field Officer', mobile: '9800000004', role: 'field_officer' },
  { key: 'collectionOfficer', username: 'e2e_collection_officer', fullName: 'E2E Collection Officer', mobile: '9800000005', role: 'collection_officer' },
  { key: 'accountant', username: 'e2e_accountant', fullName: 'E2E Accountant', mobile: '9800000006', role: 'accountant' },
  { key: 'officeStaff', username: 'e2e_office_staff', fullName: 'E2E Office Staff', mobile: '9800000007', role: 'office_staff' },
  { key: 'viewerAuditor', username: 'e2e_viewer_auditor', fullName: 'E2E Viewer Auditor', mobile: '9800000008', role: 'viewer_auditor' },
] as const;


const CHART_OF_ACCOUNTS = [
  { code: '1001', name: 'Cash', category: 'asset' as const },
  { code: '1002', name: 'Bank', category: 'asset' as const },
  { code: '1100', name: 'Loans Receivable', category: 'asset' as const },
  { code: '4001', name: 'Interest Income', category: 'income' as const },
  { code: '4002', name: 'Processing Fee Income', category: 'income' as const },
  { code: '4003', name: 'Penalty Income', category: 'income' as const },
  { code: '5003', name: 'Travel Expense', category: 'expense' as const },
  { code: '5099', name: 'Other Expense', category: 'expense' as const },
];

const HOLIDAY_DATES = [
  '2025-01-26', // Republic Day
  '2025-03-14', // Holi
  '2025-08-15', // Independence Day
  '2025-10-02', // Gandhi Jayanti
  '2025-11-01', // Diwali
];

const PRODUCT_CONFIGS: Array<{
  key: keyof SeedData['products'];
  name: string;
  config: LoanProductConfig;
}> = [
  {
    key: 'flatMonthly',
    name: 'E2E Flat Monthly',
    config: {
      interestType: 'flat',
      annualRateBps: 1200,
      minPrincipalPaise: 1_000_00,
      maxPrincipalPaise: 5_00_000_00,
      minTenureMonths: 3,
      maxTenureMonths: 36,
      repaymentFrequency: 'monthly',
      penaltyGraceDays: 7,
      penaltyType: 'flat_per_period',
      penaltyValue: 100_00,
      penaltyFrequency: 'monthly',
    },
  },
  {
    key: 'reducingMonthly',
    name: 'E2E Reducing Monthly',
    config: {
      interestType: 'reducing_balance',
      annualRateBps: 1800,
      minPrincipalPaise: 5_000_00,
      maxPrincipalPaise: 10_00_000_00,
      minTenureMonths: 6,
      maxTenureMonths: 24,
      repaymentFrequency: 'monthly',
      penaltyGraceDays: 7,
      penaltyType: 'percentage_of_overdue',
      penaltyValue: 200,
      penaltyFrequency: 'monthly',
    },
  },
  {
    key: 'flatWeekly',
    name: 'E2E Flat Weekly',
    config: {
      interestType: 'flat',
      annualRateBps: 1500,
      minPrincipalPaise: 5_000_00,
      maxPrincipalPaise: 2_00_000_00,
      minTenureMonths: 3,
      maxTenureMonths: 12,
      repaymentFrequency: 'weekly',
      penaltyGraceDays: 3,
      penaltyType: 'flat_per_period',
      penaltyValue: 50_00,
      penaltyFrequency: 'weekly',
    },
  },
  {
    key: 'withProcessingFee',
    name: 'E2E With Processing Fee',
    config: {
      interestType: 'flat',
      annualRateBps: 1200,
      minPrincipalPaise: 1_000_00,
      maxPrincipalPaise: 5_00_000_00,
      minTenureMonths: 3,
      maxTenureMonths: 36,
      repaymentFrequency: 'monthly',
      processingFeeType: 'percentage',
      processingFeeValue: 200, // 2%
      penaltyGraceDays: 7,
      penaltyType: 'flat_per_period',
      penaltyValue: 100_00,
      penaltyFrequency: 'monthly',
    },
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function httpJson<T = unknown>(
  baseUrl: string,
  path: string,
  options: {
    method?: string;
    body?: unknown;
    token?: string;
    timeoutMs?: number;
  } = {},
): Promise<{ status: number; data: T }> {
  const { method = 'GET', body, token, timeoutMs = 15_000 } = options;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => null)) as T;
    return { status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

async function waitForHealth(baseUrl: string, endpoint: string, maxRetries = 30, intervalMs = 1000): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const { status } = await httpJson(baseUrl, endpoint, { timeoutMs: 3000 });
      if (status === 200) return;
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`API health check failed after ${maxRetries} retries at ${baseUrl}${endpoint}`);
}


// ─── Seed Functions ──────────────────────────────────────────────────────────

async function seedChartOfAccounts(prisma: PrismaClient): Promise<SeedData['accounts']> {
  const accounts: Record<string, { id: string; code: string }> = {};

  for (const acct of CHART_OF_ACCOUNTS) {
    const record = await prisma.chart_of_accounts.upsert({
      where: { code: acct.code },
      update: { name: acct.name, category: acct.category },
      create: {
        code: acct.code,
        name: acct.name,
        category: acct.category,
        is_system: true,
        is_active: true,
      },
    });
    accounts[acct.code] = { id: record.id, code: acct.code };
  }

  return {
    cash: { id: accounts['1001']!.id, code: '1001' },
    bank: { id: accounts['1002']!.id, code: '1002' },
    loansReceivable: { id: accounts['1100']!.id, code: '1100' },
    interestIncome: { id: accounts['4001']!.id, code: '4001' },
    processingFeeIncome: { id: accounts['4002']!.id, code: '4002' },
    penaltyIncome: { id: accounts['4003']!.id, code: '4003' },
    travelExpense: { id: accounts['5003']!.id, code: '5003' },
    otherExpense: { id: accounts['5099']!.id, code: '5099' },
  };
}

async function seedSettings(prisma: PrismaClient): Promise<SeedData['settings']> {
  const holidayDates = HOLIDAY_DATES;
  const defaultPenaltyGraceDays = 7;
  const maxPageSize = 100;

  const settingsToSeed = [
    { key: 'holiday_calendar', value: holidayDates, description: 'Holiday dates for E2E tests' },
    { key: 'default_penalty_grace_days', value: defaultPenaltyGraceDays, description: 'Default penalty grace days' },
    { key: 'max_page_size', value: maxPageSize, description: 'Maximum page size for pagination' },
    { key: 'max_annual_rate_bps', value: 36000, description: 'Maximum annual interest rate in bps' },
    { key: 'min_annual_rate_bps', value: 100, description: 'Minimum annual interest rate in bps' },
    { key: 'max_group_size', value: 15, description: 'Maximum group size' },
    { key: 'min_group_size', value: 5, description: 'Minimum group size' },
  ];

  for (const setting of settingsToSeed) {
    await prisma.settings.upsert({
      where: { key: setting.key },
      update: { value: setting.value as never, description: setting.description },
      create: { key: setting.key, value: setting.value as never, description: setting.description },
    });
  }

  return {
    holidayCalendar: holidayDates.map((d) => new Date(d)),
    defaultPenaltyGraceDays,
    maxPageSize,
  };
}

async function seedHolidays(_prisma: PrismaClient, superAdminToken: string, apiBaseUrl: string): Promise<Date[]> {
  // Use the API to set holidays if the endpoint is available, otherwise they're already in settings
  try {
    await httpJson(apiBaseUrl, '/settings/holidays', {
      method: 'PUT',
      body: { holidays: HOLIDAY_DATES },
      token: superAdminToken,
    });
  } catch {
    // Holidays already seeded via settings table directly
  }
  return HOLIDAY_DATES.map((d) => new Date(d));
}

async function seedUsers(
  prisma: PrismaClient,
  apiBaseUrl: string,
): Promise<SeedData['users']> {
  const result: Record<string, { id: string; username: string; token: string }> = {};

  // First, ensure the super_admin exists via direct Prisma (bootstrap user)
  // We need at least one user to authenticate and create others via the API
  const bcrypt = await import('bcryptjs');
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);

  // Upsert the super admin directly in DB
  const superAdmin = await prisma.users.upsert({
    where: { username: SEED_USERS[0].username },
    update: { password_hash: passwordHash, is_active: true, failed_login_attempts: 0, locked_until: null },
    create: {
      username: SEED_USERS[0].username,
      password_hash: passwordHash,
      full_name: SEED_USERS[0].fullName,
      mobile: SEED_USERS[0].mobile,
      role: SEED_USERS[0].role as never,
      is_active: true,
    },
  });

  // Login the super admin to get a token
  const loginRes = await httpJson<{ accessToken: string; user: { id: string } }>(
    apiBaseUrl,
    '/auth/login',
    { method: 'POST', body: { username: SEED_USERS[0].username, password: TEST_PASSWORD } },
  );

  if (loginRes.status !== 200 || !loginRes.data?.accessToken) {
    throw new Error(`Failed to login super admin: status=${loginRes.status}, data=${JSON.stringify(loginRes.data)}`);
  }

  const superAdminToken = loginRes.data.accessToken;
  result['superAdmin'] = { id: superAdmin.id, username: SEED_USERS[0].username, token: superAdminToken };

  // Create remaining users via the API (using super admin token)
  for (const user of SEED_USERS.slice(1)) {
    // Check if user already exists in DB
    let existingUser = await prisma.users.findUnique({ where: { username: user.username } });

    if (!existingUser) {
      const createRes = await httpJson<{ id: string }>(apiBaseUrl, '/users', {
        method: 'POST',
        body: {
          username: user.username,
          password: TEST_PASSWORD,
          fullName: user.fullName,
          mobile: user.mobile,
          role: user.role,
        },
        token: superAdminToken,
      });

      if (createRes.status !== 201 && createRes.status !== 200) {
        throw new Error(`Failed to create user ${user.username}: status=${createRes.status}, data=${JSON.stringify(createRes.data)}`);
      }

      existingUser = await prisma.users.findUnique({ where: { username: user.username } });
    } else {
      // Reset password and unlock in case of previous test run issues
      await prisma.users.update({
        where: { id: existingUser.id },
        data: { password_hash: passwordHash, is_active: true, failed_login_attempts: 0, locked_until: null },
      });
    }

    // Login to get JWT token
    const userLoginRes = await httpJson<{ accessToken: string }>(
      apiBaseUrl,
      '/auth/login',
      { method: 'POST', body: { username: user.username, password: TEST_PASSWORD } },
    );

    if (userLoginRes.status !== 200 || !userLoginRes.data?.accessToken) {
      throw new Error(`Failed to login ${user.username}: status=${userLoginRes.status}, data=${JSON.stringify(userLoginRes.data)}`);
    }

    result[user.key] = {
      id: existingUser!.id,
      username: user.username,
      token: userLoginRes.data.accessToken,
    };
  }

  return result as unknown as SeedData['users'];
}


async function seedLoanProducts(
  apiBaseUrl: string,
  managerToken: string,
  prisma: PrismaClient,
): Promise<SeedData['products']> {
  const result: Record<string, { id: string; versionId: string; config: LoanProductConfig }> = {};

  for (const product of PRODUCT_CONFIGS) {
    // Check if product already exists
    const existing = await prisma.loan_products.findUnique({
      where: { name: product.name },
      include: { current_version: true },
    });

    if (existing && existing.current_version) {
      result[product.key] = {
        id: existing.id,
        versionId: existing.current_version.id,
        config: product.config,
      };
      continue;
    }

    // Create via API
    const createRes = await httpJson<{ id: string; currentVersionId?: string; current_version_id?: string }>(
      apiBaseUrl,
      '/loan-products',
      {
        method: 'POST',
        body: {
          name: product.name,
          interestType: product.config.interestType,
          annualRateBps: product.config.annualRateBps,
          minPrincipalPaise: product.config.minPrincipalPaise,
          maxPrincipalPaise: product.config.maxPrincipalPaise,
          minTenureMonths: product.config.minTenureMonths,
          maxTenureMonths: product.config.maxTenureMonths,
          repaymentFrequency: product.config.repaymentFrequency,
          ...(product.config.processingFeeType && {
            processingFeeType: product.config.processingFeeType,
            processingFeeValue: product.config.processingFeeValue,
          }),
          ...(product.config.penaltyGraceDays !== undefined && {
            penaltyGraceDays: product.config.penaltyGraceDays,
          }),
          ...(product.config.penaltyType && {
            penaltyType: product.config.penaltyType,
            penaltyValue: product.config.penaltyValue,
            penaltyFrequency: product.config.penaltyFrequency,
          }),
        },
        token: managerToken,
      },
    );

    if (createRes.status !== 201 && createRes.status !== 200) {
      // The API may return 500 due to audit log issues even though the product was created.
      // Check the DB before throwing.
      const maybeCreated = await prisma.loan_products.findUnique({
        where: { name: product.name },
        include: { current_version: true },
      });
      if (maybeCreated && maybeCreated.current_version) {
        result[product.key] = {
          id: maybeCreated.id,
          versionId: maybeCreated.current_version.id,
          config: product.config,
        };
        continue;
      }
      throw new Error(
        `Failed to create loan product "${product.name}": status=${createRes.status}, data=${JSON.stringify(createRes.data)}`,
      );
    }

    // Fetch the created product with version from DB to get the version ID
    const created = await prisma.loan_products.findUnique({
      where: { name: product.name },
      include: { current_version: true },
    });

    if (!created || !created.current_version) {
      throw new Error(`Loan product "${product.name}" created but version not found in DB`);
    }

    result[product.key] = {
      id: created.id,
      versionId: created.current_version.id,
      config: product.config,
    };
  }

  return result as unknown as SeedData['products'];
}

// ─── Main Setup / Teardown ───────────────────────────────────────────────────

export async function setup(): Promise<void> {
  const config = loadTestConfig();
  const prisma = new PrismaClient({ datasources: { db: { url: config.database.url } } });

  console.log('\n🔧 E2E Global Setup starting...\n');

  // 1. Verify PostgreSQL connectivity
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    console.log('  ✓ PostgreSQL connected');
  } catch (err) {
    console.error('  ✗ PostgreSQL connection failed:', err);
    await prisma.$disconnect();
    throw new Error('Cannot connect to PostgreSQL. Is the database running?');
  }

  // 2. Run pending migrations
  try {
    execSync('npx prisma migrate deploy', {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: config.database.url },
      stdio: 'pipe',
    });
    console.log('  ✓ Migrations applied');
  } catch (err) {
    // Migrations may already be up to date — that's fine
    console.log('  ⚠ Migration deploy returned non-zero (may already be current)');
  }

  // 3. Verify API server health
  try {
    await waitForHealth(config.api.baseUrl, config.api.healthEndpoint);
    console.log('  ✓ API server healthy');
  } catch (err) {
    console.error('  ✗ API health check failed:', err);
    await prisma.$disconnect();
    throw new Error(`API server not reachable at ${config.api.baseUrl}${config.api.healthEndpoint}`);
  }

  // 4. Seed chart of accounts (direct Prisma — infrastructure data)
  const accounts = await seedChartOfAccounts(prisma);
  console.log('  ✓ Chart of accounts seeded');

  // 5. Seed system settings (direct Prisma — infrastructure data)
  const settings = await seedSettings(prisma);
  console.log('  ✓ System settings seeded');

  // 6. Seed users via API + login to get JWT tokens
  const users = await seedUsers(prisma, config.api.baseUrl);
  console.log('  ✓ Users seeded and tokens cached');

  // 7. Seed holidays via API (uses super admin token)
  const holidays = await seedHolidays(prisma, users.superAdmin.token, config.api.baseUrl);
  console.log('  ✓ Holiday calendar seeded');

  // 8. Seed loan products via API (uses manager token — managers have loan.create permission)
  const products = await seedLoanProducts(config.api.baseUrl, users.manager.token, prisma);
  console.log('  ✓ Loan products seeded');

  // 9. Store seed data on globalThis for test suites
  const seedData: SeedData = {
    users,
    products,
    accounts,
    holidays,
    settings,
  };

  (globalThis as Record<string, unknown>)['__SEED_DATA__'] = seedData;
  (globalThis as Record<string, unknown>)['__PRISMA_CLIENT__'] = prisma;
  (globalThis as Record<string, unknown>)['__API_BASE_URL__'] = config.api.baseUrl;

  // Also write seed data to a temp file so forked/threaded workers can access it
  const fs = await import('fs');
  const path = await import('path');
  const seedFilePath = path.join(__dirname, '.seed-data.json');
  fs.writeFileSync(seedFilePath, JSON.stringify({
    seedData,
    apiBaseUrl: config.api.baseUrl,
    databaseUrl: config.database.url,
  }));

  console.log('\n✅ E2E Global Setup complete\n');
}

export { teardown } from './global-teardown.js';
