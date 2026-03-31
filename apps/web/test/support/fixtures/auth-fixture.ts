import { test as base, type Page, type BrowserContext } from '@playwright/test';

export type AuthFixture = {
  loginAs: (role: 'super_admin' | 'manager' | 'field_officer' | 'collection_officer' | 'accountant' | 'office_staff' | 'viewer_auditor') => Promise<void>;
  authToken: string;
};

const ROLE_CREDENTIALS: Record<string, { username: string; password: string }> = {
  super_admin: { username: 'superadmin', password: 'Admin@1234' },
  manager: { username: 'manager1', password: 'Manager@1234' },
  field_officer: { username: 'fieldofficer1', password: 'Field@1234' },
  collection_officer: { username: 'collector1', password: 'Collect@1234' },
  accountant: { username: 'accountant1', password: 'Account@1234' },
  office_staff: { username: 'staff1', password: 'Staff@1234' },
  viewer_auditor: { username: 'auditor1', password: 'Audit@1234' },
};

async function loginViaApi(
  page: Page,
  context: BrowserContext,
  role: string,
): Promise<string> {
  const creds = ROLE_CREDENTIALS[role];
  if (!creds) throw new Error(`Unknown role: ${role}`);

  const apiUrl = process.env.API_URL || 'http://localhost:3001';
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
