import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { maskAadhaar, maskPan, maskMobile } from '../masking.js';

/**
 * Property 28: PII Masking Safety — masked output never contains full original value
 *
 * For all valid Aadhaar, PAN, and mobile numbers, the masked output:
 * 1. Never contains the full original value
 * 2. Follows the expected masking format
 * 3. Preserves only the last 4 characters
 *
 * **Validates: Requirements 47.4, 47.5**
 */

// --- Generators ---

/** Generates a valid 12-digit Aadhaar string */
const aadhaarArb = fc.stringOf(fc.constantFrom(...'0123456789'.split('')), {
  minLength: 12,
  maxLength: 12,
});

/** Generates a valid PAN: [A-Z]{5}[0-9]{4}[A-Z] */
const panArb = fc
  .tuple(
    fc.stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')), {
      minLength: 5,
      maxLength: 5,
    }),
    fc.stringOf(fc.constantFrom(...'0123456789'.split('')), { minLength: 4, maxLength: 4 }),
    fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')),
  )
  .map(([letters, digits, lastChar]) => `${letters}${digits}${lastChar}`);

/** Generates a valid Indian mobile: 10 digits starting with 6-9 */
const mobileArb = fc
  .tuple(
    fc.constantFrom('6', '7', '8', '9'),
    fc.stringOf(fc.constantFrom(...'0123456789'.split('')), { minLength: 9, maxLength: 9 }),
  )
  .map(([first, rest]) => `${first}${rest}`);

// --- Property 28: PII Masking Safety ---

describe('Property 28: PII Masking Safety', () => {
  it('masked Aadhaar never contains the full original value', () => {
    fc.assert(
      fc.property(aadhaarArb, (aadhaar) => {
        const masked = maskAadhaar(aadhaar);
        // Full original must not appear in masked output
        expect(masked).not.toContain(aadhaar);
        // Correct format: XXXX-XXXX-{last4}
        const last4 = aadhaar.slice(-4);
        expect(masked).toBe(`XXXX-XXXX-${last4}`);
        expect(masked).toHaveLength(14);
      }),
      { numRuns: 100 },
    );
  });

  it('masked PAN never contains the full original value', () => {
    fc.assert(
      fc.property(panArb, (pan) => {
        const masked = maskPan(pan);
        // Full original must not appear in masked output
        expect(masked).not.toContain(pan);
        // Correct format: XXXXXX{last4}
        const last4 = pan.slice(-4);
        expect(masked).toBe(`XXXXXX${last4}`);
        expect(masked).toHaveLength(10);
      }),
      { numRuns: 100 },
    );
  });

  it('masked mobile never contains the full original value', () => {
    fc.assert(
      fc.property(mobileArb, (mobile) => {
        const masked = maskMobile(mobile);
        // Full original must not appear in masked output
        expect(masked).not.toContain(mobile);
        // Correct format: XXXXXX{last4}
        const last4 = mobile.slice(-4);
        expect(masked).toBe(`XXXXXX${last4}`);
        expect(masked).toHaveLength(10);
      }),
      { numRuns: 100 },
    );
  });

  it('masked output only preserves last 4 characters of original', () => {
    fc.assert(
      fc.property(
        fc.oneof(aadhaarArb, panArb, mobileArb),
        (value) => {
          const last4 = value.slice(-4);
          const prefix = value.slice(0, -4);

          // Apply the appropriate masking function
          let masked: string;
          if (value.length === 12 && /^\d{12}$/.test(value)) {
            masked = maskAadhaar(value);
          } else if (value.length === 10 && /^[A-Z]{5}\d{4}[A-Z]$/.test(value)) {
            masked = maskPan(value);
          } else {
            masked = maskMobile(value);
          }

          // Last 4 chars are preserved
          expect(masked.slice(-4)).toBe(last4);
          // The prefix portion of the original is NOT present in the masked output
          if (prefix.length > 0) {
            expect(masked).not.toContain(prefix);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
