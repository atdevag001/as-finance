import { test as base, type Page, type BrowserContext } from '@playwright/test';

export type AuthFixture = {
  loginAs: (role: 'super_admin' | 'manager' | 'field_officer' | 'collection_officer' | 'accountant' | 'office_staff' | 'viewer_auditor') => Promise<void>;
  authToken: string;
};

// Credentials must match the seeded users in prisma/seed.ts
const DEFAULT_PASSWORD = 'Admin@123';

const ROLE_CREDENTIALS: Record<string, { username: string; password: string }> = {
  // Primary role names
  super_admin: { username: 'admin', password: DEFAULT_PASSWORD },
  manager: { username: 'manager1', password: DEFAULT_PASSWORD },
  field_officer: { username: 'field1', password: DEFAULT_PASSWORD },
  collection_officer: { username: 'collector1', password: DEFAULT_PASSWORD },
  accountant: { username: 'accountant1', password: DEFAULT_PASSWORD },
  office_staff: { username: 'staff1', password: DEFAULT_PASSWORD },
  viewer_auditor: { username: 'auditor1', password: DEFAULT_PASSWORD },
  // Aliases for convenience (matching username patterns)
  admin: { username: 'admin', password: DEFAULT_PASSWORD },
  manager1: { username: 'manager1', password: DEFAULT_PASSWORD },
  field1: { username: 'field1', password: DEFAULT_PASSWORD },
  collector1: { username: 'collector1', password: DEFAULT_PASSWORD },
  accountant1: { username: 'accountant1', password: DEFAULT_PASSWORD },
  staff1: { username: 'staff1', password: DEFAULT_PASSWORD },
  auditor1: { username: 'auditor1', password: DEFAULT_PASSWORD },
};

async function loginViaApi(
  page: Page,
  context: BrowserContext,
  role: string,
): Promise<string> {
  const creds = ROLE_CREDENTIALS[role];
  if (!creds) throw new Error(`Unknown role: ${role}`);

  const apiUrl = process.env['API_URL'] || 'http://localhost:3001';
  const response = await context.request.post(`${apiUrl}/auth/login`, {
    data: { username: creds.username, password: creds.password },
  });

  if (!response.ok()) {
    throw new Error(`Login failed for ${role}: ${response.status()}`);
  }

  const { access_token } = await response.json();
  await context.addCookies([
    {
      name: 'access_token',
      value: access_token,
      domain: 'localhost',
      path: '/',
    },
  ]);

  return access_token;
}

export const test = base.extend<AuthFixture>({
  authToken: ['', { option: true }],

  loginAs: async ({ page, context }, use) => {
    let token = '';
    const loginAs = async (role: AuthFixture['loginAs'] extends (r: infer R) => any ? R : never) => {
      token = await loginViaApi(page, context, role);
    };
    await use(loginAs);
  },
});
