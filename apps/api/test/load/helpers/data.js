/**
 * k6 Load Test — Payload Generators
 *
 * Generates valid request payloads for collection, disbursement, and reversal
 * endpoints. Each generator produces a fresh payload with a unique idempotency
 * key to avoid 409 conflicts between VU iterations.
 *
 * Money values are integer paise as required by the API.
 */

// ─── Unique Key Generation ──────────────────────────────────────────────────

let _counter = 0;

/**
 * Generate a unique idempotency key.
 * Combines VU id, iteration, timestamp, and a monotonic counter.
 *
 * @param {string} prefix - Key prefix (e.g. 'coll', 'disb', 'rev')
 * @returns {string} Unique idempotency key
 */
function idempotencyKey(prefix) {
  _counter++;
  // __VU and __ITER are k6 built-in execution context variables
  const vu = typeof __VU !== 'undefined' ? __VU : 0;
  const iter = typeof __ITER !== 'undefined' ? __ITER : 0;
  return `k6-${prefix}-${vu}-${iter}-${Date.now()}-${_counter}`;
}

// ─── Payment Modes ──────────────────────────────────────────────────────────

const PAYMENT_MODES = ['cash', 'bank_transfer'];

/**
 * Pick a random payment mode.
 * @returns {string}
 */
function randomPaymentMode() {
  return PAYMENT_MODES[Math.floor(Math.random() * PAYMENT_MODES.length)];
}

/**
 * Today's date as ISO string (YYYY-MM-DD).
 * @returns {string}
 */
function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ─── Collection Payload ─────────────────────────────────────────────────────

/**
 * Generate a collection (payment) request payload.
 *
 * @param {string} loanId - UUID of the active loan
 * @param {object} [overrides] - Optional field overrides
 * @param {number} [overrides.amountPaise] - Payment amount in paise (default: random 500–5000 INR)
 * @param {string} [overrides.paymentMode] - Payment mode (default: random)
 * @param {string} [overrides.paymentDate] - ISO date (default: today)
 * @param {string} [overrides.idempotencyKey] - Custom idempotency key
 * @returns {object} POST /collections request body
 */
export function collectionPayload(loanId, overrides) {
  const opts = overrides || {};
  // Random amount between 500_00 and 5000_00 paise (₹500 – ₹5,000)
  const defaultAmount = Math.floor(Math.random() * 450_001) + 500_00;

  return {
    loanId,
    amountPaise: opts.amountPaise || defaultAmount,
    paymentMode: opts.paymentMode || randomPaymentMode(),
    paymentDate: opts.paymentDate || todayISO(),
    idempotencyKey: opts.idempotencyKey || idempotencyKey('coll'),
  };
}

// ─── Disbursement Payload ───────────────────────────────────────────────────

/**
 * Generate a disbursement request payload.
 *
 * @param {string} loanId - UUID of the approved loan
 * @param {object} [overrides] - Optional field overrides
 * @param {string} [overrides.mode] - Disbursement mode (default: 'cash')
 * @param {string} [overrides.referenceNumber] - Bank reference (for bank_transfer)
 * @param {string} [overrides.idempotencyKey] - Custom idempotency key
 * @returns {object} POST /disbursements request body
 */
export function disbursementPayload(loanId, overrides) {
  const opts = overrides || {};
  return {
    loanId,
    mode: opts.mode || 'cash',
    idempotencyKey: opts.idempotencyKey || idempotencyKey('disb'),
    ...(opts.referenceNumber ? { referenceNumber: opts.referenceNumber } : {}),
  };
}

// ─── Reversal Payload ───────────────────────────────────────────────────────

/**
 * Generate a reversal request payload.
 *
 * @param {string} collectionId - UUID of the collection to reverse
 * @param {object} [overrides] - Optional field overrides
 * @param {string} [overrides.reason] - Reversal reason (default: 'Load test reversal')
 * @param {string} [overrides.idempotencyKey] - Custom idempotency key
 * @returns {object} POST /reversals request body
 */
export function reversalPayload(collectionId, overrides) {
  const opts = overrides || {};
  return {
    collectionId,
    reason: opts.reason || 'Load test reversal',
    idempotencyKey: opts.idempotencyKey || idempotencyKey('rev'),
  };
}
