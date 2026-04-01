/**
 * Pact Consumer Contract — Collection Posting Interactions
 *
 * Defines expected API interactions for collection posting:
 * - POST /collections happy path (201 with full allocation response)
 * - POST /collections missing fields (400)
 * - POST /collections unauthenticated (401)
 *
 * Money fields use integer matchers (paiseMatcher) per Property 3.
 *
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 7.1, 7.2, 7.3, 7.4
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

describe('Collection Consumer Pact', () => {
  const pact = createPact();

  describe('POST /collections — happy path', () => {
    it('returns 201 with collection data and allocations', async () => {
      pact.addInteraction({
        states: [{ description: 'an active loan exists for collection' }],
        uponReceiving: 'a valid collection posting request',
        withRequest: {
          method: 'POST',
          path: '/collections',
          headers: {
            'Content-Type': 'application/json',
            Authorization: MatchersV3.like(AUTH_HEADER),
          },
          body: {
            loanId: MatchersV3.like('loan-uuid-001'),
            amountPaise: MatchersV3.integer(100_00),
            paymentDate: '2024-01-15',
            paymentMode: 'cash',
            idempotencyKey: MatchersV3.like('idem-key-001'),
          },
        },
        willRespondWith: {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
          body: {
            data: {
              collectionId: uuidMatcher(),
              loanNumber: MatchersV3.like('LN-2024-0001'),
              amountPaise: paiseMatcher(100_00),
              allocations: {
                penaltyPaise: paiseMatcher(0),
                interestPaise: paiseMatcher(30_00),
                principalPaise: paiseMatcher(70_00),
              },
              outstandingAfterPaise: paiseMatcher(900_00),
            },
          },
        },
      });

      await pact.executeTest(async (mockServer) => {
        const res = await fetch(`${mockServer.url}/collections`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: AUTH_HEADER,
          },
          body: JSON.stringify({
            loanId: 'loan-uuid-001',
            amountPaise: 100_00,
            paymentDate: '2024-01-15',
            paymentMode: 'cash',
            idempotencyKey: 'idem-key-001',
          }),
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.data).toHaveProperty('collectionId');
        expect(body.data).toHaveProperty('loanNumber');
        expect(typeof body.data.amountPaise).toBe('number');
        expect(Number.isInteger(body.data.amountPaise)).toBe(true);
        expect(body.data.allocations).toHaveProperty('penaltyPaise');
        expect(body.data.allocations).toHaveProperty('interestPaise');
        expect(body.data.allocations).toHaveProperty('principalPaise');
        expect(Number.isInteger(body.data.allocations.penaltyPaise)).toBe(true);
        expect(Number.isInteger(body.data.allocations.interestPaise)).toBe(true);
        expect(Number.isInteger(body.data.allocations.principalPaise)).toBe(true);
        expect(Number.isInteger(body.data.outstandingAfterPaise)).toBe(true);
      });
    });
  });

  describe('POST /collections — missing fields', () => {
    it('returns 400 when required fields are missing', async () => {
      pact.addInteraction({
        states: [{ description: 'an authenticated user exists' }],
        uponReceiving: 'a collection posting request with missing fields',
        withRequest: {
          method: 'POST',
          path: '/collections',
          headers: {
            'Content-Type': 'application/json',
            Authorization: MatchersV3.like(AUTH_HEADER),
          },
          body: {},
        },
        willRespondWith: {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
          body: {
            statusCode: MatchersV3.integer(400),
            message: MatchersV3.like('Validation failed'),
          },
        },
      });

      await pact.executeTest(async (mockServer) => {
        const res = await fetch(`${mockServer.url}/collections`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: AUTH_HEADER,
          },
          body: JSON.stringify({}),
        });

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body).toHaveProperty('statusCode', 400);
        expect(body).toHaveProperty('message');
      });
    });
  });

  describe('POST /collections — unauthenticated', () => {
    it('returns 401 when no auth token is provided', async () => {
      pact.addInteraction({
        states: [{ description: 'no authentication token provided' }],
        uponReceiving: 'an unauthenticated collection posting request',
        withRequest: {
          method: 'POST',
          path: '/collections',
          headers: {
            'Content-Type': 'application/json',
          },
          body: {
            loanId: 'loan-uuid-001',
            amountPaise: 100_00,
            paymentDate: '2024-01-15',
            paymentMode: 'cash',
            idempotencyKey: 'idem-key-unauth',
          },
        },
        willRespondWith: {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
          body: {
            statusCode: MatchersV3.integer(401),
            message: MatchersV3.like('Unauthorized'),
          },
        },
      });

      await pact.executeTest(async (mockServer) => {
        const res = await fetch(`${mockServer.url}/collections`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            loanId: 'loan-uuid-001',
            amountPaise: 100_00,
            paymentDate: '2024-01-15',
            paymentMode: 'cash',
            idempotencyKey: 'idem-key-unauth',
          }),
        });

        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body).toHaveProperty('statusCode', 401);
        expect(body).toHaveProperty('message');
      });
    });
  });
});
