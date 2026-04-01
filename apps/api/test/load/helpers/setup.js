/**
 * k6 Load Test — Shared Setup Helper
 *
 * Extracts the common customer→loan→submit→approve→disburse lifecycle
 * used across all k6 scenario setup() phases. Eliminates duplication.
 */

import http from 'k6/http';
import { BASE_URL } from '../config.js';
import { authenticatedHeaders } from './auth.js';
import { collectionPayload } from './data.js';

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * Configurable probability for idempotency key reuse in load tests.
 * 30% of requests will reuse a deterministic key per entity.
 * NOTE: Math.random() is intentional in k6 — k6 has no seed mechanism,
 * and random distribution across loans/collections is the desired behavior
 * for realistic load simulation.
 */
export const IDEMPOTENCY_REUSE_PROBABILITY = 0.3;

// ─── Customer + Loan Lifecycle ──────────────────────────────────────────────

/**
 * Create a customer via API.
 *
 * @param {object} tokens - Auth token map from getAuthTokens()
 * @param {object} opts - Customer options
 * @param {string} opts.prefix - Name prefix for identification (e.g. 'K6 Load Test')
 * @param {number} opts.index - Index for unique mobile/aadhaar generation
 * @param {string} opts.mobilePrefix - 5-digit mobile prefix (e.g. '97000')
 * @param {number} opts.aadhaarBase - Base aadhaar number (e.g. 100000000000)
 * @returns {string|null} Customer ID or null on failure
 */
export function createTestCustomer(tokens, opts) {
  const { prefix, index, mobilePrefix, aadhaarBase } = opts;

  const res = http.post(
    `${BASE_URL}/customers`,
    JSON.stringify({
      fullName: `${prefix} Customer ${index + 1}`,
      mobile: `${mobilePrefix}${String(10000 + index).padStart(5, '0')}`,
      aadhaarNumber: `${String(aadhaarBase + index)}`,
      gender: index % 2 === 0 ? 'male' : 'female',
      addressLine1: `${index + 1} ${prefix} Street`,
      city: 'TestCity',
      district: 'TestDistrict',
      state: 'TestState',
      pincode: '110001',
    }),
    { headers: authenticatedHeaders(tokens.fieldOfficer), tags: { endpoint: 'setup' } },
  );

  if (res.status !== 201 && res.status !== 200) {
    console.warn(`[${prefix}] Customer creation returned ${res.status}: ${res.body}`);
    return null;
  }

  const customer = JSON.parse(res.body);
  const customerId = customer.id || customer.data?.id;
  if (!customerId) {
    console.warn(`[${prefix}] No customer ID in response: ${res.body}`);
    return null;
  }

  return customerId;
}

/**
 * Create a loan and advance it to a target status.
 *
 * @param {object} tokens - Auth token map
 * @param {object} opts - Loan options
 * @param {string} opts.customerId - Customer UUID
 * @param {number} opts.principalPaise - Loan principal in paise
 * @param {number} opts.tenureMonths - Loan tenure
 * @param {string} opts.purpose - Loan purpose description
 * @param {string} opts.advanceTo - Target status: 'created' | 'under_review' | 'approved' | 'active'
 * @param {string} opts.prefix - Log prefix
 * @param {number} opts.index - Index for idempotency key uniqueness
 * @returns {string|null} Loan ID or null on failure
 */
export function createTestLoan(tokens, opts) {
  const {
    customerId,
    principalPaise = 100_000_00,
    tenureMonths = 12,
    purpose = 'K6 load test loan',
    advanceTo = 'active',
    prefix = 'K6',
    index = 0,
  } = opts;

  const loanRes = http.post(
    `${BASE_URL}/loans`,
    JSON.stringify({
      customerId,
      productVersionId: null,
      principalPaise,
      tenureMonths,
      purpose,
    }),
    { headers: authenticatedHeaders(tokens.fieldOfficer), tags: { endpoint: 'setup' } },
  );

  if (loanRes.status !== 201 && loanRes.status !== 200) {
    console.warn(`[${prefix}] Loan creation returned ${loanRes.status}: ${loanRes.body}`);
    return null;
  }

  const loan = JSON.parse(loanRes.body);
  const loanId = loan.id || loan.data?.id;
  if (!loanId) {
    console.warn(`[${prefix}] No loan ID in response: ${loanRes.body}`);
    return null;
  }

  if (advanceTo === 'created') return loanId;

  // Submit
  http.post(
    `${BASE_URL}/loans/${loanId}/submit`,
    JSON.stringify({}),
    { headers: authenticatedHeaders(tokens.fieldOfficer), tags: { endpoint: 'setup' } },
  );

  if (advanceTo === 'under_review') return loanId;

  // Approve
  http.post(
    `${BASE_URL}/loans/${loanId}/approve`,
    JSON.stringify({ remarks: `${prefix} approval` }),
    { headers: authenticatedHeaders(tokens.manager), tags: { endpoint: 'setup' } },
  );

  if (advanceTo === 'approved') return loanId;

  // Disburse
  http.post(
    `${BASE_URL}/disbursements`,
    JSON.stringify({
      loanId,
      mode: 'cash',
      idempotencyKey: `k6-setup-disb-${prefix.toLowerCase().replace(/\s+/g, '-')}-${index}-${Date.now()}`,
    }),
    { headers: authenticatedHeaders(tokens.manager), tags: { endpoint: 'setup' } },
  );

  return loanId;
}

/**
 * Create N active loans with customers. Returns array of loan IDs.
 * Falls back to querying existing active loans if creation fails.
 *
 * @param {object} tokens - Auth token map
 * @param {object} opts - Setup options
 * @param {number} opts.count - Number of loans to create
 * @param {string} opts.prefix - Name prefix
 * @param {string} opts.mobilePrefix - 5-digit mobile prefix
 * @param {number} opts.aadhaarBase - Base aadhaar number
 * @param {number} opts.principalPaise - Loan principal
 * @param {number} opts.tenureMonths - Loan tenure
 * @param {string} opts.advanceTo - Target loan status
 * @returns {string[]} Array of loan IDs
 */
export function createActiveLoanPool(tokens, opts) {
  const {
    count = 5,
    prefix = 'K6 Load Test',
    mobilePrefix = '97000',
    aadhaarBase = 100000000000,
    principalPaise = 100_000_00,
    tenureMonths = 12,
    advanceTo = 'active',
  } = opts;

  const loanIds = [];

  for (let i = 0; i < count; i++) {
    const customerId = createTestCustomer(tokens, {
      prefix,
      index: i,
      mobilePrefix,
      aadhaarBase,
    });
    if (!customerId) continue;

    const loanId = createTestLoan(tokens, {
      customerId,
      principalPaise,
      tenureMonths,
      purpose: `${prefix} loan`,
      advanceTo,
      prefix,
      index: i,
    });
    if (loanId) loanIds.push(loanId);
  }

  // Fallback: find existing active loans if none were created
  if (loanIds.length === 0 && advanceTo === 'active') {
    const loansRes = http.get(`${BASE_URL}/loans?status=active&limit=${count}`, {
      headers: authenticatedHeaders(tokens.manager),
      tags: { endpoint: 'setup' },
    });

    if (loansRes.status === 200) {
      const body = JSON.parse(loansRes.body);
      const loans = body.data || body;
      if (Array.isArray(loans)) {
        for (const loan of loans) {
          loanIds.push(loan.id);
        }
      }
    }
  }

  if (loanIds.length === 0) {
    console.error(`FATAL: No ${advanceTo} loans available for ${prefix}`);
  } else {
    console.log(`[${prefix}] ${loanIds.length} ${advanceTo} loans ready`);
  }

  return loanIds;
}

/**
 * Post collections on active loans and return collection IDs.
 *
 * @param {object} tokens - Auth token map
 * @param {string[]} loanIds - Active loan IDs
 * @param {object} opts - Options
 * @param {number} opts.collectionsPerLoan - Number of collections per loan
 * @param {number} opts.amountPaise - Collection amount in paise
 * @param {string} opts.prefix - Log prefix
 * @returns {string[]} Array of collection IDs
 */
export function postCollectionsOnLoans(tokens, loanIds, opts) {
  const {
    collectionsPerLoan = 3,
    amountPaise = 5_000_00,
    prefix = 'K6',
  } = opts;

  const collectionIds = [];

  for (let i = 0; i < loanIds.length; i++) {
    for (let j = 0; j < collectionsPerLoan; j++) {
      const payload = collectionPayload(loanIds[i], {
        amountPaise,
        idempotencyKey: `k6-${prefix.toLowerCase().replace(/\s+/g, '-')}-coll-${i}-${j}-${Date.now()}`,
      });

      const res = http.post(
        `${BASE_URL}/collections`,
        JSON.stringify(payload),
        { headers: authenticatedHeaders(tokens.collectionOfficer), tags: { endpoint: 'setup' } },
      );

      if (res.status === 201 || res.status === 200) {
        const collection = JSON.parse(res.body);
        const collectionId = collection.id || collection.data?.id || collection.data?.collectionId;
        if (collectionId) collectionIds.push(collectionId);
      } else {
        console.warn(`[${prefix}] Collection posting returned ${res.status}: ${res.body}`);
      }
    }
  }

  if (collectionIds.length === 0) {
    console.error(`WARNING: No collections created for ${prefix}`);
  } else {
    console.log(`[${prefix}] ${collectionIds.length} collections ready`);
  }

  return collectionIds;
}
