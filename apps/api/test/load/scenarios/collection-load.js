/**
 * k6 Load Test — Collection Posting Scenario
 *
 * Simulates 20 concurrent virtual users posting collection payments for 60 seconds.
 * Validates P95 latency < 2000ms and error rate < 5% (excluding 409 idempotency conflicts).
 *
 * Feature: expanded-test-automation
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4
 */

import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { BASE_URL, THRESHOLDS, DEFAULTS } from '../config.js';
import { getAuthTokens, authenticatedHeaders } from '../helpers/auth.js';
import { collectionPayload } from '../helpers/data.js';
import { createActiveLoanPool } from '../helpers/setup.js';

// ─── Custom Metrics ──────────────────────────────────────────────────────────

const collectionErrors = new Rate('collection_errors');
const collectionDuration = new Trend('collection_duration', true);

// ─── k6 Options ──────────────────────────────────────────────────────────────

export const options = {
  vus: DEFAULTS.vus, // 20 VUs
  duration: DEFAULTS.duration, // 60s
  thresholds: {
    ...THRESHOLDS.collection,
    collection_errors: ['rate<0.05'],
  },
};

// ─── Setup Phase ─────────────────────────────────────────────────────────────

export function setup() {
  const tokens = getAuthTokens();
  const loanIds = createActiveLoanPool(tokens, {
    count: 5,
    prefix: 'K6 Collection Load',
    mobilePrefix: '97000',
    aadhaarBase: 100000000000,
  });
  return { tokens, loanIds };
}

// ─── VU Execution ────────────────────────────────────────────────────────────

/**
 * Main VU function — each VU posts collection payments in a loop.
 */
export default function main(data) {
  const { tokens, loanIds } = data;

  if (!loanIds || loanIds.length === 0) {
    console.error('No loan IDs available — skipping iteration');
    sleep(1);
    return;
  }

  // Pick a random loan from the pool
  const loanId = loanIds[Math.floor(Math.random() * loanIds.length)];

  // Generate a unique collection payload (unique idempotency key per call)
  const payload = collectionPayload(loanId);

  const headers = authenticatedHeaders(tokens.collectionOfficer);

  const startTime = Date.now();
  const res = http.post(
    `${BASE_URL}/collections`,
    JSON.stringify(payload),
    {
      headers,
      tags: { endpoint: 'collection' },
    },
  );
  const elapsed = Date.now() - startTime;

  // Track custom duration metric
  collectionDuration.add(elapsed);

  // 409 Conflict is expected for idempotency — exclude from error rate
  const isSuccess = res.status === 201 || res.status === 200;
  const isIdempotencyConflict = res.status === 409;
  const isError = !isSuccess && !isIdempotencyConflict;

  collectionErrors.add(isError ? 1 : 0);

  check(res, {
    'status is 201 or 409': (r) => r.status === 201 || r.status === 409 || r.status === 200,
    'response has body': (r) => r.body && r.body.length > 0,
  });

  // Brief pause between iterations to simulate realistic user behavior
  sleep(0.5 + Math.random() * 1.5);
}

// ─── Teardown Phase ──────────────────────────────────────────────────────────

/**
 * Runs once after all VU execution completes.
 * Logs summary information.
 */
export function teardown(data) {
  const { loanIds } = data;
  console.log(`Load test complete. Tested against ${loanIds ? loanIds.length : 0} loans.`);
  console.log('Run verify-collection-load.ts for post-run idempotency and allocation checks.');
}
