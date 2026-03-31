/**
 * Idempotency-related fast-check arbitraries.
 */
import fc from 'fast-check';

/** Arbitrary for idempotency keys (UUID-like strings) */
export const idempotencyKeyArb: fc.Arbitrary<string> = fc.uuid();

/** Arbitrary for operation types used in idempotency records */
export const operationTypeArb: fc.Arbitrary<string> = fc.constantFrom(
  'collection',
  'disbursement',
  'reversal',
  'penalty',
  'foreclosure',
);
