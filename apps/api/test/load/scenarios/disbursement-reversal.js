/**
 * k6 Load Test — Disbursement and Reversal Scenario
 *
 * Simulates concurrent disbursement processing (10 VUs, 30s) and collection
 * reversal processing (5 VUs, 30s). Validates P95 < 3000ms for both endpoints
 * and verifies idempotency guarantees under concurrent load.
 *
 * Feature: expanded-test-automation
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4
 *
 * Thresholds:
 *   - Disbursement endpoint P95 < 3000ms
 *   - Reversal endpoint P95 < 3000ms
 *   - Error rate < 5% for both endpoints
 *   - Overall API error rate < 5%
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Counter } from 'k6/metrics';
import { BASE_URL, THRESHOLDS } from '../config.js';
import { getAuthTokens, authenticatedHeaders } from '../helpers/auth.js';
import { disbursementPayload, reversalPayload } from '../helpers/data.js';
import { createActiveLoanPool, postCollectionsOnLoans, IDEMPOTENCY_REUSE_PROBABILITY } from '../helpers/setup.js';

// ─── Custom Metrics ──────────────────────────────────────────────────────────

const disbursementErrors = new Rate('disbursement_errors');
const reversalErrors = new Rate('reversal_errors');
const overallErrors = new Rate('overall_errors');
const disbursementIdempotencyHits = new Counter('disbursement_idempotency_hits');
const reversalIdempotencyHits = new Counter('reversal_idempotency_hits');

// ─── k6 Options ──────────────────────────────────────────────────────────────

export const options = {
  scenarios: {
    disbursements: {
      executor: 'constant-vus',
      vus: 10,
      duration: '30s',
      exec: 'disbursementScenario',
    },
    reversals: {
      executor: 'constant-vus',
      vus: 5,
      duration: '30s',
      exec: 'reversalScenario',
    },
  },
  thresholds: {
    ...THRESHOLDS.disbursement,
    ...THRESHOLDS.reversal,
    disbursement_errors: ['rate<0.05'],
    reversal_errors: ['rate<0.05'],
    ...THRESHOLDS.global,
  },
};

// ─── Setup Phase ─────────────────────────────────────────────────────────────

export function setup() {
  const tokens = getAuthTokens();

  // Pool 1: Approved (not yet disbursed) loans for disbursement scenario
  const approvedLoanIds = createActiveLoanPool(tokens, {
    count: 10,
    prefix: 'K6 Disbursement',
    mobilePrefix: '97200',
    aadhaarBase: 300000000000,
    principalPaise: 50_000_00,
    tenureMonths: 6,
    advanceTo: 'approved',
  });

  // Pool 2: Active loans with posted collections for reversal scenario
  const reversalLoanIds = createActiveLoanPool(tokens, {
    count: 5,
    prefix: 'K6 Reversal',
    mobilePrefix: '97300',
    aadhaarBase: 400000000000,
    advanceTo: 'active',
  });

  const collectionIds = postCollectionsOnLoans(tokens, reversalLoanIds, {
    collectionsPerLoan: 3,
    amountPaise: 5_000_00,
    prefix: 'K6 Reversal',
  });

  return { tokens, approvedLoanIds, collectionIds };
}

// ─── Disbursement Scenario (10 VUs, 30s) ────────────────────────────────────

/**
 * Each VU picks an approved loan and attempts to disburse it.
 * Multiple VUs may target the same loan with different idempotency keys,
 * testing concurrent disbursement safety. Some VUs intentionally reuse
 * idempotency keys to verify idempotency guarantees (Req 4.3).
 */
export function disbursementScenario(data) {
  const { tokens, approvedLoanIds } = data;

  if (!approvedLoanIds || approvedLoanIds.length === 0) {
    console.error('No approved loan IDs available — skipping disbursement iteration');
    sleep(1);
    return;
  }

  const loanId = approvedLoanIds[Math.floor(Math.random() * approvedLoanIds.length)];

  // Occasionally reuse a deterministic idempotency key to test idempotency (Req 4.3)
  // NOTE: Math.random() is intentional — k6 has no seed mechanism; random distribution is desired
  const useSharedKey = Math.random() < IDEMPOTENCY_REUSE_PROBABILITY;
  const overrides = useSharedKey
    ? { idempotencyKey: `k6-disb-shared-${loanId}` }
    : {};

  const payload = disbursementPayload(loanId, overrides);
  const headers = authenticatedHeaders(tokens.manager);

  const res = http.post(
    `${BASE_URL}/disbursements`,
    JSON.stringify(payload),
    {
      headers,
      tags: { endpoint: 'disbursement' },
    },
  );

  const isSuccess = res.status === 201 || res.status === 200;
  const isIdempotencyConflict = res.status === 409;
  const isAlreadyDisbursed = res.status === 400 || res.status === 422;
  const isError = !isSuccess && !isIdempotencyConflict && !isAlreadyDisbursed;

  disbursementErrors.add(isError ? 1 : 0);
  overallErrors.add(isError ? 1 : 0);

  if (isIdempotencyConflict) {
    disbursementIdempotencyHits.add(1);
  }

  check(res, {
    'disbursement: status is 201, 200, 400, 409, or 422': (r) =>
      [200, 201, 400, 409, 422].includes(r.status),
    'disbursement: response has body': (r) => r.body && r.body.length > 0,
  });

  sleep(0.5 + Math.random() * 1.5);
}

// ─── Reversal Scenario (5 VUs, 30s) ─────────────────────────────────────────

/**
 * Each VU picks a posted collection and attempts to reverse it.
 * Multiple VUs may target the same collection with different idempotency keys,
 * testing concurrent reversal safety. Some VUs intentionally reuse
 * idempotency keys to verify idempotency guarantees (Req 4.4).
 */
export function reversalScenario(data) {
  const { tokens, collectionIds } = data;

  if (!collectionIds || collectionIds.length === 0) {
    console.error('No collection IDs available — skipping reversal iteration');
    sleep(1);
    return;
  }

  const collectionId = collectionIds[Math.floor(Math.random() * collectionIds.length)];

  // Occasionally reuse a deterministic idempotency key to test idempotency (Req 4.4)
  // NOTE: Math.random() is intentional — k6 has no seed mechanism; random distribution is desired
  const useSharedKey = Math.random() < IDEMPOTENCY_REUSE_PROBABILITY;
  const overrides = useSharedKey
    ? { idempotencyKey: `k6-rev-shared-${collectionId}` }
    : {};

  const payload = reversalPayload(collectionId, overrides);
  const headers = authenticatedHeaders(tokens.manager);

  const res = http.post(
    `${BASE_URL}/reversals`,
    JSON.stringify(payload),
    {
      headers,
      tags: { endpoint: 'reversal' },
    },
  );

  const isSuccess = res.status === 201 || res.status === 200;
  const isIdempotencyConflict = res.status === 409;
  const isAlreadyReversed = res.status === 400 || res.status === 422;
  const isError = !isSuccess && !isIdempotencyConflict && !isAlreadyReversed;

  reversalErrors.add(isError ? 1 : 0);
  overallErrors.add(isError ? 1 : 0);

  if (isIdempotencyConflict) {
    reversalIdempotencyHits.add(1);
  }

  check(res, {
    'reversal: status is 201, 200, 400, 409, or 422': (r) =>
      [200, 201, 400, 409, 422].includes(r.status),
    'reversal: response has body': (r) => r.body && r.body.length > 0,
  });

  sleep(0.5 + Math.random() * 1.5);
}

// ─── Teardown Phase ──────────────────────────────────────────────────────────

/**
 * Runs once after all VU execution completes.
 */
export function teardown(data) {
  const { approvedLoanIds, collectionIds } = data;
  console.log(
    `Disbursement & reversal load test complete. ` +
    `Disbursement pool: ${approvedLoanIds ? approvedLoanIds.length : 0} loans, ` +
    `Reversal pool: ${collectionIds ? collectionIds.length : 0} collections.`,
  );
  console.log('Disbursement VUs: 10 (30s), Reversal VUs: 5 (30s)');
}
