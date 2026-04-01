/**
 * k6 Load Test — Mixed Workload Scenario
 *
 * Simulates concurrent collection posting (10 VUs) and report generation (5 VUs)
 * for 60 seconds. Validates that report generation remains responsive under
 * concurrent payment load.
 *
 * Feature: expanded-test-automation
 * Validates: Requirements 3.1, 3.2, 3.3
 *
 * Thresholds:
 *   - Report endpoint P95 < 5000ms
 *   - Zero HTTP 500 errors on report endpoint
 *   - Overall API error rate < 5%
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Counter } from 'k6/metrics';
import { BASE_URL, THRESHOLDS, DEFAULT_HEADERS } from '../config.js';
import { getAuthTokens, authenticatedHeaders } from '../helpers/auth.js';
import { collectionPayload } from '../helpers/data.js';
import { createActiveLoanPool } from '../helpers/setup.js';

// ─── Custom Metrics ──────────────────────────────────────────────────────────

const report500Errors = new Counter('report_500_errors');
const overallErrors = new Rate('overall_errors');

// ─── Report Types ────────────────────────────────────────────────────────────

const REPORT_TYPES = [
  'daily-collection',
  'overdue',
  'disbursement',
  'loan-portfolio',
  'customer',
  'dpd-aging',
];

// ─── k6 Options ──────────────────────────────────────────────────────────────

export const options = {
  scenarios: {
    collections: {
      executor: 'constant-vus',
      vus: 10,
      duration: '60s',
      exec: 'collectionScenario',
    },
    reports: {
      executor: 'constant-vus',
      vus: 5,
      duration: '60s',
      exec: 'reportScenario',
    },
  },
  thresholds: {
    ...THRESHOLDS.report,
    ...THRESHOLDS.collection,
    report_500_errors: ['count==0'],
    ...THRESHOLDS.global,
  },
};

// ─── Setup Phase ─────────────────────────────────────────────────────────────

export function setup() {
  const tokens = getAuthTokens();
  const loanIds = createActiveLoanPool(tokens, {
    count: 5,
    prefix: 'K6 Mixed Workload',
    mobilePrefix: '97100',
    aadhaarBase: 200000000000,
  });
  return { tokens, loanIds };
}

// ─── Collection Scenario (10 VUs) ───────────────────────────────────────────

/**
 * Posts collection payments — mirrors the collection-load scenario
 * but with 10 VUs instead of 20.
 */
export function collectionScenario(data) {
  const { tokens, loanIds } = data;

  if (!loanIds || loanIds.length === 0) {
    console.error('No loan IDs available — skipping collection iteration');
    sleep(1);
    return;
  }

  const loanId = loanIds[Math.floor(Math.random() * loanIds.length)];
  const payload = collectionPayload(loanId);
  const headers = authenticatedHeaders(tokens.collectionOfficer);

  const res = http.post(
    `${BASE_URL}/collections`,
    JSON.stringify(payload),
    {
      headers,
      tags: { endpoint: 'collection' },
    },
  );

  const isSuccess = res.status === 201 || res.status === 200;
  const isIdempotencyConflict = res.status === 409;
  const isError = !isSuccess && !isIdempotencyConflict;

  overallErrors.add(isError ? 1 : 0);

  check(res, {
    'collection: status is 201 or 409': (r) =>
      r.status === 201 || r.status === 409 || r.status === 200,
    'collection: response has body': (r) => r.body && r.body.length > 0,
  });

  sleep(0.5 + Math.random() * 1.5);
}

// ─── Report Scenario (5 VUs) ────────────────────────────────────────────────

/**
 * Requests report generation — cycles through different report types.
 * Tracks 500 errors separately for the zero-500 threshold.
 */
export function reportScenario(data) {
  const { tokens } = data;

  // Cycle through report types
  const reportType =
    REPORT_TYPES[Math.floor(Math.random() * REPORT_TYPES.length)];

  const headers = authenticatedHeaders(tokens.accountant);

  const res = http.get(
    `${BASE_URL}/reports/${reportType}`,
    {
      headers,
      tags: { endpoint: 'report' },
    },
  );

  // Track 500 errors specifically (Req 3.2)
  if (res.status === 500) {
    report500Errors.add(1);
  }

  const isSuccess = res.status >= 200 && res.status < 400;
  overallErrors.add(isSuccess ? 0 : 1);

  check(res, {
    'report: status is not 500': (r) => r.status !== 500,
    'report: status is 2xx or 3xx': (r) => r.status >= 200 && r.status < 400,
    'report: response has body': (r) => r.body && r.body.length > 0,
  });

  sleep(1 + Math.random() * 2);
}

// ─── Teardown Phase ──────────────────────────────────────────────────────────

/**
 * Runs once after all VU execution completes.
 */
export function teardown(data) {
  const { loanIds } = data;
  console.log(
    `Mixed workload test complete. Tested against ${loanIds ? loanIds.length : 0} loans.`,
  );
  console.log('Collection VUs: 10, Report VUs: 5, Duration: 60s');
}
