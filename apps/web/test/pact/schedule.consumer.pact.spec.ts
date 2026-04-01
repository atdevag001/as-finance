/**
 * Pact Consumer Contract — Loan Schedule Retrieval
 *
 * Defines expected API interactions for loan detail + schedule:
 * - GET /loans/:id happy path (loan detail with schedules array)
 * - GET /loans/:id 404 for non-existent loan
 *
 * Money fields use integer matchers (paiseMatcher) per Property 3.
 *
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 8.1, 8.2, 8.3
 */
import { describe, it, expect } from 'vitest';
import {
  createPact,
  MatchersV3,
  paiseMatcher,
  uuidMatcher,
  isoDateMatcher,
} from './setup';

const AUTH_HEADER = 'Bearer valid-jwt-token';

describe('Schedule Consumer Pact', () => {
  const pact = createPact();

  describe('GET /loans/:id — happy path', () => {
    it('returns loan detail with schedules array', async () => {
      const loanId = '00000000-0000-4000-a000-000000000010';

      pact.addInteraction({
        states: [{ description: 'an active loan with schedules exists' }],
        uponReceiving: 'a request to get loan detail with schedules',
        withRequest: {
          method: 'GET',
          path: `/loans/${loanId}`,
          headers: {
            Authorization: MatchersV3.like(AUTH_HEADER),
          },
        },
        willRespondWith: {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: {
            loan_number: MatchersV3.like('LN-2024-0001'),
            principal_paise: paiseMatcher(100_000_00),
            status: MatchersV3.like('active'),
            cached_outstanding_paise: paiseMatcher(90_000_00),
            schedules: MatchersV3.eachLike({
              installment_number: MatchersV3.integer(1),
              due_date: isoDateMatcher('2024-02-15'),
              principal_paise: paiseMatcher(8_333_00),
              interest_paise: paiseMatcher(1_667_00),
              total_paise: paiseMatcher(10_000_00),
              status: MatchersV3.like('pending'),
            }),
          },
        },
      });

      await pact.executeTest(async (mockServer) => {
        const res = await fetch(`${mockServer.url}/loans/${loanId}`, {
          headers: { Authorization: AUTH_HEADER },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toHaveProperty('loan_number');
        expect(Number.isInteger(body.principal_paise)).toBe(true);
        expect(body).toHaveProperty('status');
        expect(Number.isInteger(body.cached_outstanding_paise)).toBe(true);
        expect(Array.isArray(body.schedules)).toBe(true);
        expect(body.schedules.length).toBeGreaterThan(0);

        const installment = body.schedules[0];
        expect(Number.isInteger(installment.installment_number)).toBe(true);
        expect(installment).toHaveProperty('due_date');
        expect(Number.isInteger(installment.principal_paise)).toBe(true);
        expect(Number.isInteger(installment.interest_paise)).toBe(true);
        expect(Number.isInteger(installment.total_paise)).toBe(true);
        expect(installment).toHaveProperty('status');
      });
    });
  });

  describe('GET /loans/:id — not found', () => {
    it('returns 404 for non-existent loan', async () => {
      const fakeLoanId = '00000000-0000-0000-0000-000000000000';

      pact.addInteraction({
        states: [{ description: 'no loan exists with the given ID' }],
        uponReceiving: 'a request to get a non-existent loan',
        withRequest: {
          method: 'GET',
          path: `/loans/${fakeLoanId}`,
          headers: {
            Authorization: MatchersV3.like(AUTH_HEADER),
          },
        },
        willRespondWith: {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
          body: {
            statusCode: MatchersV3.integer(404),
            message: MatchersV3.like('Loan not found'),
          },
        },
      });

      await pact.executeTest(async (mockServer) => {
        const res = await fetch(`${mockServer.url}/loans/${fakeLoanId}`, {
          headers: { Authorization: AUTH_HEADER },
        });

        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body).toHaveProperty('statusCode', 404);
        expect(body).toHaveProperty('message');
      });
    });
  });
});
