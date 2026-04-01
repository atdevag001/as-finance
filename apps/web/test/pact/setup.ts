/**
 * Pact consumer test infrastructure — shared setup, matchers, and constants.
 *
 * Uses @pact-foundation/pact PactV3 API.
 * Pact files are generated into apps/web/test/pact/pacts/.
 */
import { PactV3, MatchersV3 } from '@pact-foundation/pact';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Provider / Consumer name constants
// ---------------------------------------------------------------------------

export const PROVIDER_NAME = 'as-finance-api';
export const CONSUMER_NAME = 'as-finance-web';

// ---------------------------------------------------------------------------
// Pact output directory (generated contract JSON files)
// ---------------------------------------------------------------------------

export const PACT_DIR = path.resolve(__dirname, 'pacts');

// ---------------------------------------------------------------------------
// Factory: create a PactV3 instance with shared defaults
// ---------------------------------------------------------------------------

/**
 * Creates a PactV3 instance pre-configured with consumer/provider names,
 * dynamic port allocation (port: 0), and the shared pacts output directory.
 */
export function createPact(): PactV3 {
  return new PactV3({
    consumer: CONSUMER_NAME,
    provider: PROVIDER_NAME,
    dir: PACT_DIR,
    port: 0, // dynamic port allocation
  });
}

// ---------------------------------------------------------------------------
// Re-export core MatchersV3 for convenience
// ---------------------------------------------------------------------------

export { MatchersV3 };

// ---------------------------------------------------------------------------
// Shared matchers — finance domain
// ---------------------------------------------------------------------------

/**
 * Matcher for money fields stored as integer paise.
 * Ensures the value is matched as an integer type in the Pact contract.
 *
 * @param examplePaise - Example value in paise (defaults to 100_00 = ₹100)
 */
export function paiseMatcher(examplePaise: number = 10_000) {
  return MatchersV3.integer(examplePaise);
}

/**
 * Matcher for UUID string fields (e.g. entity IDs, idempotency keys).
 * Validates the value is a UUID v4 format string.
 */
export function uuidMatcher(example: string = '00000000-0000-4000-a000-000000000000') {
  return MatchersV3.regex(
    example,
    '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
  );
}

/**
 * Matcher for ISO 8601 date strings (e.g. "2024-06-15" or "2024-06-15T10:30:00Z").
 * Accepts both date-only and full datetime formats.
 */
export function isoDateMatcher(example: string = '2024-01-15') {
  return MatchersV3.regex(
    example,
    '\\d{4}-\\d{2}-\\d{2}(T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})?)?',
  );
}
