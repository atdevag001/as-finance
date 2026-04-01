/**
 * Pact Consumer Contract — Report Generation Interaction
 *
 * Defines expected API interaction for report generation:
 * - GET /reports/:type (happy path returning report data)
 *
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4
 */
import { describe, it, expect } from 'vitest';
import { createPact, MatchersV3, isoDateMatcher } from './setup';

const AUTH_HEADER = 'Bearer valid-jwt-token';

describe('Report Consumer Pact', () => {
  const pact = createPact();

  describe('GET /reports/:type', () => {
    it('returns report data for daily-collection report type', async () => {
      pact.addInteraction({
        states: [{ description: 'report data exists for daily-collection' }],
        uponReceiving: 'a request to generate a daily-collection report',
        withRequest: {
          method: 'GET',
          path: '/reports/daily-collection',
          headers: {
            Authorization: MatchersV3.like(AUTH_HEADER),
          },
        },
        willRespondWith: {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: {
            reportType: MatchersV3.like('daily-collection'),
            generatedAt: isoDateMatcher('2024-01-15T10:30:00Z'),
            data: MatchersV3.like({
              rows: MatchersV3.eachLike({
                label: MatchersV3.like('Collection Summary'),
                value: MatchersV3.like('100'),
              }),
            }),
          },
        },
      });

      await pact.executeTest(async (mockServer) => {
        const res = await fetch(`${mockServer.url}/reports/daily-collection`, {
          headers: { Authorization: AUTH_HEADER },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toHaveProperty('reportType');
        expect(body).toHaveProperty('generatedAt');
        expect(body).toHaveProperty('data');
      });
    });
  });
});
