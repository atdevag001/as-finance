/**
 * Pact Consumer Contract — Loan Lifecycle Interactions
 *
 * Defines expected API interactions for loan lifecycle:
 * - POST /loans (create)
 * - POST /loans/:id/approve (approve)
 * - POST /disbursements (disburse)
 *
 * Money fields use integer matchers (paiseMatcher) per Property 3.
 *
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5
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

describe('Loan Consumer Pact', () => {
  const pact = createPact();

  describe('POST /loans — create', () => {
    it('creates a loan and returns loan object', async () => {
      pact.addInteraction({
        states: [{ description: 'a customer and product version exist' }],
        uponReceiving: 'a request to create a new loan',
        withRequest: {
          method: 'POST',
          path: '/loans',
          headers: {
            'Content-Type': 'application/json',
            Authorization: MatchersV3.like(AUTH_HEADER),
          },
          body: {
            customerId: MatchersV3.like('customer-uuid-001'),
            productVersionId: MatchersV3.like('product-version-uuid-001'),
            principalPaise: MatchersV3.integer(100_000_00),
            tenureMonths: MatchersV3.integer(12),
            purpose: 'Business expansion',
          },
        },
        willRespondWith: {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
          body: {
            id: uuidMatcher(),
            loan_number: MatchersV3.like('LN-2024-0001'),
            status: MatchersV3.like('draft'),
            principal_paise: paiseMatcher(100_000_00),
            tenure_months: MatchersV3.integer(12),
            customer_id: uuidMatcher(),
            product_version_id: uuidMatcher(),
            created_at: isoDateMatcher('2024-01-15T10:30:00Z'),
            created_by: uuidMatcher(),
          },
        },
      });

      await pact.executeTest(async (mockServer) => {
        const res = await fetch(`${mockServer.url}/loans`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: AUTH_HEADER,
          },
          body: JSON.stringify({
            customerId: 'customer-uuid-001',
            productVersionId: 'product-version-uuid-001',
            principalPaise: 100_000_00,
            tenureMonths: 12,
            purpose: 'Business expansion',
          }),
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body).toHaveProperty('id');
        expect(body).toHaveProperty('loan_number');
        expect(body.status).toBe('draft');
        expect(Number.isInteger(body.principal_paise)).toBe(true);
      });
    });
  });

  describe('POST /loans/:id/approve', () => {
    it('approves a submitted loan', async () => {
      const loanId = '00000000-0000-4000-a000-000000000020';

      pact.addInteraction({
        states: [{ description: 'a loan in under_review status exists' }],
        uponReceiving: 'a request to approve a loan',
        withRequest: {
          method: 'POST',
          path: `/loans/${loanId}/approve`,
          headers: {
            'Content-Type': 'application/json',
            Authorization: MatchersV3.like(AUTH_HEADER),
          },
          body: {
            remarks: 'Approved after review',
          },
        },
        willRespondWith: {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: {
            id: uuidMatcher(loanId),
            loan_number: MatchersV3.like('LN-2024-0001'),
            status: MatchersV3.like('approved'),
            approved_by: uuidMatcher(),
          },
        },
      });

      await pact.executeTest(async (mockServer) => {
        const res = await fetch(`${mockServer.url}/loans/${loanId}/approve`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: AUTH_HEADER,
          },
          body: JSON.stringify({ remarks: 'Approved after review' }),
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.status).toBe('approved');
        expect(body).toHaveProperty('approved_by');
      });
    });
  });

  describe('POST /disbursements — disburse', () => {
    it('disburses an approved loan', async () => {
      const loanId = '00000000-0000-4000-a000-000000000030';

      pact.addInteraction({
        states: [{ description: 'an approved loan exists ready for disbursement' }],
        uponReceiving: 'a request to disburse a loan',
        withRequest: {
          method: 'POST',
          path: '/disbursements',
          headers: {
            'Content-Type': 'application/json',
            Authorization: MatchersV3.like(AUTH_HEADER),
          },
          body: {
            loanId: MatchersV3.like(loanId),
            disbursementDate: '2024-01-15',
            mode: 'bank_transfer',
            idempotencyKey: MatchersV3.like('disburse-idem-001'),
          },
        },
        willRespondWith: {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
          body: {
            id: uuidMatcher(),
            loan_id: uuidMatcher(loanId),
            amount_paise: paiseMatcher(100_000_00),
            status: MatchersV3.like('completed'),
            disbursement_date: isoDateMatcher('2024-01-15'),
          },
        },
      });

      await pact.executeTest(async (mockServer) => {
        const res = await fetch(`${mockServer.url}/disbursements`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: AUTH_HEADER,
          },
          body: JSON.stringify({
            loanId,
            disbursementDate: '2024-01-15',
            mode: 'bank_transfer',
            idempotencyKey: 'disburse-idem-001',
          }),
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body).toHaveProperty('id');
        expect(Number.isInteger(body.amount_paise)).toBe(true);
      });
    });
  });
});
