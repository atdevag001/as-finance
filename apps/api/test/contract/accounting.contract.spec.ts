import { describe, it, expect, beforeAll } from 'vitest';
import { getApiBaseUrl, getUserTokens } from '../helpers/seed.js';
import { createAuthClients, type AuthClients } from '../helpers/auth-client.js';

/**
 * Accounting API Contract Tests
 *
 * Verifies request/response shapes, validation errors (400), and auth errors (401)
 * for all accounting endpoints:
 *   GET /accounting/chart-of-accounts
 *   GET /accounting/daybook
 *   GET /accounting/trial-balance
 *   GET /accounting/profit-and-loss (profit-loss)
 *   GET /accounting/balance-sheet
 *
 * Contract tests focus on verifying the API surface: correct status codes,
 * response field names/types, and error handling behavior.
 *
 * Validates: Requirements 40.11, 40.18, 40.19
 */

describe('Accounting Contract Tests', () => {
  let clients: AuthClients;

  beforeAll(() => {
    const apiBaseUrl = getApiBaseUrl();
    const tokens = getUserTokens();
    clients = createAuthClients(apiBaseUrl, tokens);
  });

  // ─── GET /accounting/chart-of-accounts ─────────────────────────────────

  describe('GET /accounting/chart-of-accounts', () => {
    describe('response shape', () => {
      it('should return an array of account objects', async () => {
        const res = await clients.accountant.get('/accounting/chart-of-accounts');

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
      });

      it('should include expected fields on each account', async () => {
        const res = await clients.accountant.get('/accounting/chart-of-accounts');

        expect(res.status).toBe(200);
        if (res.body.length > 0) {
          const account = res.body[0];
          expect(typeof account.id).toBe('string');
          expect(typeof account.code).toBe('string');
          expect(typeof account.name).toBe('string');
          expect(typeof account.category).toBe('string');
          expect(account).toHaveProperty('is_active');
          expect(account).toHaveProperty('is_system');
          expect(account).toHaveProperty('created_at');
        }
      });

      it('should return accounts sorted by code', async () => {
        const res = await clients.accountant.get('/accounting/chart-of-accounts');

        expect(res.status).toBe(200);
        if (res.body.length > 1) {
          for (let i = 1; i < res.body.length; i++) {
            expect(res.body[i].code >= res.body[i - 1].code).toBe(true);
          }
        }
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const res = await clients.unauthenticated.get('/accounting/chart-of-accounts');

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 401 when token is expired', async () => {
        const res = await clients.expired.get('/accounting/chart-of-accounts');

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });

      it('should return 401 when token is tampered', async () => {
        const res = await clients.tampered.get('/accounting/chart-of-accounts');

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });
  });

  // ─── GET /accounting/daybook ───────────────────────────────────────────

  describe('GET /accounting/daybook', () => {
    describe('response shape', () => {
      it('should return an array of journal entries for a valid date range', async () => {
        const res = await clients.accountant
          .get('/accounting/daybook')
          .query({ startDate: '2024-01-01', endDate: '2024-12-31' });

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
      });

      it('should include expected fields on each journal entry', async () => {
        const res = await clients.accountant
          .get('/accounting/daybook')
          .query({ startDate: '2020-01-01', endDate: '2030-12-31' });

        expect(res.status).toBe(200);
        if (res.body.length > 0) {
          const entry = res.body[0];
          expect(typeof entry.id).toBe('string');
          expect(entry).toHaveProperty('entry_date');
          expect(typeof entry.description).toBe('string');
          expect(entry).toHaveProperty('source_type');
          expect(entry).toHaveProperty('source_id');
          expect(entry).toHaveProperty('total_debit_paise');
          expect(entry).toHaveProperty('total_credit_paise');
          expect(entry).toHaveProperty('created_by');
          expect(entry).toHaveProperty('created_at');
          expect(entry).toHaveProperty('lines');
          expect(Array.isArray(entry.lines)).toBe(true);
        }
      });

      it('should include account info on journal lines', async () => {
        const res = await clients.accountant
          .get('/accounting/daybook')
          .query({ startDate: '2020-01-01', endDate: '2030-12-31' });

        expect(res.status).toBe(200);
        const entryWithLines = res.body.find(
          (e: Record<string, unknown>) => Array.isArray(e['lines']) && (e['lines'] as unknown[]).length > 0,
        );
        if (entryWithLines) {
          const line = entryWithLines['lines'][0];
          expect(typeof line.id).toBe('string');
          expect(line).toHaveProperty('account_id');
          expect(line).toHaveProperty('debit_paise');
          expect(line).toHaveProperty('credit_paise');
          expect(line).toHaveProperty('account');
          expect(typeof line.account.code).toBe('string');
          expect(typeof line.account.name).toBe('string');
          expect(typeof line.account.category).toBe('string');
        }
      });
    });

    describe('validation errors (400)', () => {
      it('should return 400 when startDate is missing', async () => {
        const res = await clients.accountant
          .get('/accounting/daybook')
          .query({ endDate: '2024-12-31' });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when endDate is missing', async () => {
        const res = await clients.accountant
          .get('/accounting/daybook')
          .query({ startDate: '2024-01-01' });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when startDate is not a valid ISO date', async () => {
        const res = await clients.accountant
          .get('/accounting/daybook')
          .query({ startDate: 'not-a-date', endDate: '2024-12-31' });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when endDate is not a valid ISO date', async () => {
        const res = await clients.accountant
          .get('/accounting/daybook')
          .query({ startDate: '2024-01-01', endDate: 'invalid' });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when both dates are missing', async () => {
        const res = await clients.accountant.get('/accounting/daybook');

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const res = await clients.unauthenticated
          .get('/accounting/daybook')
          .query({ startDate: '2024-01-01', endDate: '2024-12-31' });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 401 when token is expired', async () => {
        const res = await clients.expired
          .get('/accounting/daybook')
          .query({ startDate: '2024-01-01', endDate: '2024-12-31' });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });

      it('should return 401 when token is tampered', async () => {
        const res = await clients.tampered
          .get('/accounting/daybook')
          .query({ startDate: '2024-01-01', endDate: '2024-12-31' });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });
  });

  // ─── GET /accounting/trial-balance ─────────────────────────────────────

  describe('GET /accounting/trial-balance', () => {
    describe('response shape', () => {
      it('should return trial balance with expected structure', async () => {
        const res = await clients.accountant.get('/accounting/trial-balance');

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('asOfDate');
        expect(typeof res.body.asOfDate).toBe('string');
        expect(res.body).toHaveProperty('rows');
        expect(Array.isArray(res.body.rows)).toBe(true);
        expect(res.body).toHaveProperty('totalDebitBalancePaise');
        expect(typeof res.body.totalDebitBalancePaise).toBe('string');
        expect(res.body).toHaveProperty('totalCreditBalancePaise');
        expect(typeof res.body.totalCreditBalancePaise).toBe('string');
        expect(res.body).toHaveProperty('isBalanced');
        expect(typeof res.body.isBalanced).toBe('boolean');
      });

      it('should include expected fields on each trial balance row', async () => {
        const res = await clients.accountant.get('/accounting/trial-balance');

        expect(res.status).toBe(200);
        if (res.body.rows.length > 0) {
          const row = res.body.rows[0];
          expect(typeof row.accountId).toBe('string');
          expect(typeof row.code).toBe('string');
          expect(typeof row.name).toBe('string');
          expect(typeof row.category).toBe('string');
          expect(typeof row.debitBalancePaise).toBe('string');
          expect(typeof row.creditBalancePaise).toBe('string');
        }
      });

      it('should accept optional asOfDate query param', async () => {
        const res = await clients.accountant
          .get('/accounting/trial-balance')
          .query({ asOfDate: '2024-06-30' });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('asOfDate');
        expect(res.body).toHaveProperty('rows');
        expect(res.body).toHaveProperty('isBalanced');
      });

      it('should default asOfDate to today when not provided', async () => {
        const res = await clients.accountant.get('/accounting/trial-balance');

        expect(res.status).toBe(200);
        const today = new Date().toISOString().split('T')[0];
        expect(res.body.asOfDate).toBe(today);
      });
    });

    describe('validation errors (400)', () => {
      it('should return 400 when asOfDate is not a valid ISO date', async () => {
        const res = await clients.accountant
          .get('/accounting/trial-balance')
          .query({ asOfDate: 'not-a-date' });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const res = await clients.unauthenticated.get('/accounting/trial-balance');

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 401 when token is expired', async () => {
        const res = await clients.expired.get('/accounting/trial-balance');

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });

      it('should return 401 when token is tampered', async () => {
        const res = await clients.tampered.get('/accounting/trial-balance');

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });
  });

  // ─── GET /accounting/profit-loss ───────────────────────────────────────

  describe('GET /accounting/profit-loss', () => {
    describe('response shape', () => {
      it('should return P&L with expected structure', async () => {
        const res = await clients.accountant
          .get('/accounting/profit-loss')
          .query({ startDate: '2024-01-01', endDate: '2024-12-31' });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('startDate', '2024-01-01');
        expect(res.body).toHaveProperty('endDate', '2024-12-31');
        expect(res.body).toHaveProperty('income');
        expect(Array.isArray(res.body.income)).toBe(true);
        expect(res.body).toHaveProperty('expenses');
        expect(Array.isArray(res.body.expenses)).toBe(true);
        expect(res.body).toHaveProperty('totalIncomePaise');
        expect(typeof res.body.totalIncomePaise).toBe('string');
        expect(res.body).toHaveProperty('totalExpensePaise');
        expect(typeof res.body.totalExpensePaise).toBe('string');
        expect(res.body).toHaveProperty('netProfitPaise');
        expect(typeof res.body.netProfitPaise).toBe('string');
      });

      it('should include expected fields on income/expense rows', async () => {
        const res = await clients.accountant
          .get('/accounting/profit-loss')
          .query({ startDate: '2020-01-01', endDate: '2030-12-31' });

        expect(res.status).toBe(200);
        const allRows = [...res.body.income, ...res.body.expenses];
        if (allRows.length > 0) {
          const row = allRows[0];
          expect(typeof row.accountId).toBe('string');
          expect(typeof row.code).toBe('string');
          expect(typeof row.name).toBe('string');
          expect(typeof row.amountPaise).toBe('string');
        }
      });
    });

    describe('validation errors (400)', () => {
      it('should return 400 when startDate is missing', async () => {
        const res = await clients.accountant
          .get('/accounting/profit-loss')
          .query({ endDate: '2024-12-31' });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when endDate is missing', async () => {
        const res = await clients.accountant
          .get('/accounting/profit-loss')
          .query({ startDate: '2024-01-01' });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when startDate is not a valid ISO date', async () => {
        const res = await clients.accountant
          .get('/accounting/profit-loss')
          .query({ startDate: 'bad-date', endDate: '2024-12-31' });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when both dates are missing', async () => {
        const res = await clients.accountant.get('/accounting/profit-loss');

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const res = await clients.unauthenticated
          .get('/accounting/profit-loss')
          .query({ startDate: '2024-01-01', endDate: '2024-12-31' });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 401 when token is expired', async () => {
        const res = await clients.expired
          .get('/accounting/profit-loss')
          .query({ startDate: '2024-01-01', endDate: '2024-12-31' });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });

      it('should return 401 when token is tampered', async () => {
        const res = await clients.tampered
          .get('/accounting/profit-loss')
          .query({ startDate: '2024-01-01', endDate: '2024-12-31' });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });
  });

  // ─── GET /accounting/balance-sheet ─────────────────────────────────────

  describe('GET /accounting/balance-sheet', () => {
    describe('response shape', () => {
      it('should return balance sheet with expected structure', async () => {
        const res = await clients.accountant.get('/accounting/balance-sheet');

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('asOfDate');
        expect(typeof res.body.asOfDate).toBe('string');
        expect(res.body).toHaveProperty('assets');
        expect(Array.isArray(res.body.assets)).toBe(true);
        expect(res.body).toHaveProperty('liabilities');
        expect(Array.isArray(res.body.liabilities)).toBe(true);
        expect(res.body).toHaveProperty('equity');
        expect(Array.isArray(res.body.equity)).toBe(true);
        expect(res.body).toHaveProperty('retainedEarningsPaise');
        expect(typeof res.body.retainedEarningsPaise).toBe('string');
        expect(res.body).toHaveProperty('totalAssetsPaise');
        expect(typeof res.body.totalAssetsPaise).toBe('string');
        expect(res.body).toHaveProperty('totalLiabilitiesPaise');
        expect(typeof res.body.totalLiabilitiesPaise).toBe('string');
        expect(res.body).toHaveProperty('totalEquityPaise');
        expect(typeof res.body.totalEquityPaise).toBe('string');
        expect(res.body).toHaveProperty('totalLiabilitiesAndEquityPaise');
        expect(typeof res.body.totalLiabilitiesAndEquityPaise).toBe('string');
        expect(res.body).toHaveProperty('isBalanced');
        expect(typeof res.body.isBalanced).toBe('boolean');
      });

      it('should include expected fields on asset/liability/equity rows', async () => {
        const res = await clients.accountant.get('/accounting/balance-sheet');

        expect(res.status).toBe(200);
        const allRows = [...res.body.assets, ...res.body.liabilities, ...res.body.equity];
        if (allRows.length > 0) {
          const row = allRows[0];
          expect(typeof row.accountId).toBe('string');
          expect(typeof row.code).toBe('string');
          expect(typeof row.name).toBe('string');
          expect(typeof row.balancePaise).toBe('string');
        }
      });

      it('should accept optional asOfDate query param', async () => {
        const res = await clients.accountant
          .get('/accounting/balance-sheet')
          .query({ asOfDate: '2024-06-30' });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('asOfDate');
        expect(res.body).toHaveProperty('assets');
        expect(res.body).toHaveProperty('isBalanced');
      });

      it('should default asOfDate to today when not provided', async () => {
        const res = await clients.accountant.get('/accounting/balance-sheet');

        expect(res.status).toBe(200);
        const today = new Date().toISOString().split('T')[0];
        expect(res.body.asOfDate).toBe(today);
      });
    });

    describe('validation errors (400)', () => {
      it('should return 400 when asOfDate is not a valid ISO date', async () => {
        const res = await clients.accountant
          .get('/accounting/balance-sheet')
          .query({ asOfDate: 'not-a-date' });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const res = await clients.unauthenticated.get('/accounting/balance-sheet');

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 401 when token is expired', async () => {
        const res = await clients.expired.get('/accounting/balance-sheet');

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });

      it('should return 401 when token is tampered', async () => {
        const res = await clients.tampered.get('/accounting/balance-sheet');

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });
  });
});
