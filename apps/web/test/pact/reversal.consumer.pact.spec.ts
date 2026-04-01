/**
 * Pact Consumer Contract — Reversal Interaction
 *
 * Defines expected API interaction for collection reversal:
 * - POST /reversals (happy path with collectionId, reason, idempotencyKey)
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

describe('Reversal Consumer Pact', () => {
  const pact = createPact();

  describe('POST /reversals', () => {
    it('reverses a posted collection and returns reversal result', async () => {
      pact.addInteraction({
        states: [{ description: 'a posted collection exists for reversal' }],
        uponReceiving: 'a request to reverse a collection',
        withRequest: {
          method: 'POST',
          path: '/reversals',
          headers: {
            'Content-Type': 'application/json',
            Authorization: MatchersV3.like(AUTH_HEADER),
          },
          body: {
            collectionId: MatchersV3.like('collection-uuid-001'),
            reason: 'Customer requested reversal',
            idempotencyKey: MatchersV3.like('rev-idem-001'),
          },
        },
        willRespondWith: {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
          body: {
            data: {
              reversalId: uuidMatcher(),
              collectionId: uuidMatcher(),
              amountPaise: paiseMatcher(100_00),
              reason: MatchersV3.like('Customer requested reversal'),
              status: MatchersV3.like('reversed'),
            },
          },
        },
      });

      await pact.executeTest(async (mockServer) => {
        const res = await fetch(`${mockServer.url}/reversals`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: AUTH_HEADER,
          },
          body: JSON.stringify({
            collectionId: 'collection-uuid-001',
            reason: 'Customer requested reversal',
            idempotencyKey: 'rev-idem-001',
          }),
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.data).toHaveProperty('reversalId');
        expect(body.data).toHaveProperty('collectionId');
        expect(Number.isInteger(body.data.amountPaise)).toBe(true);
        expect(body.data).toHaveProperty('reason');
        expect(body.data).toHaveProperty('status');
      });
    });
  });
});
