/**
 * k6 Load Test — Shared Configuration
 *
 * Provides configurable base URL, default headers, and shared threshold
 * definitions used across all load test scenarios.
 *
 * k6 runs in a Go runtime (not Node.js), so this is plain ES module JS.
 */

// ─── Base URL ────────────────────────────────────────────────────────────────

/** API base URL — override via K6_BASE_URL env var. */
export const BASE_URL = __ENV.K6_BASE_URL || 'http://localhost:3001';

// ─── Default Headers ─────────────────────────────────────────────────────────

/**
 * Default headers applied to every request.
 * Auth headers are added per-request by the auth helper.
 */
export const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
};

// ─── Shared Thresholds ──────────────────────────────────────────────────────

/**
 * Reusable threshold definitions for common metrics.
 * Scenarios import and merge these into their `options.thresholds`.
 */
export const THRESHOLDS = {
  /** Collection endpoint: P95 < 2000ms, error rate < 5% */
  collection: {
    'http_req_duration{endpoint:collection}': ['p(95)<2000'],
    'http_req_failed{endpoint:collection}': ['rate<0.05'],
  },

  /** Report endpoint: P95 < 5000ms, zero 500 errors */
  report: {
    'http_req_duration{endpoint:report}': ['p(95)<5000'],
  },

  /** Disbursement endpoint: P95 < 3000ms */
  disbursement: {
    'http_req_duration{endpoint:disbursement}': ['p(95)<3000'],
    'http_req_failed{endpoint:disbursement}': ['rate<0.05'],
  },

  /** Reversal endpoint: P95 < 3000ms */
  reversal: {
    'http_req_duration{endpoint:reversal}': ['p(95)<3000'],
    'http_req_failed{endpoint:reversal}': ['rate<0.05'],
  },

  /** Global: overall error rate < 5% */
  global: {
    http_req_failed: ['rate<0.05'],
  },
};

// ─── Scenario Defaults ──────────────────────────────────────────────────────

/** Default VU count and duration — overridable per scenario. */
export const DEFAULTS = {
  vus: 20,
  duration: '60s',
};
