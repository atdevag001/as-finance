import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { maskAadhaar, maskPan, maskMobile } from '../masking.js';
import { aadhaarSchema, panSchema, mobileSchema } from '../../validation/schemas.js';

/**
 * Property 23: PII Masking
 * For all Aadhaar numbers, masking produces XXXX-XXXX-{last4};
 * for all PAN numbers, masking produces XXXXXX{last4}
 *
 * Property 24: Input Format Validation
 * Aadhaar validator accepts only 12-digit strings;
 * PAN validator accepts only [A-Z]{5}[0-9]{4}[A-Z];
 * mobile validator accepts only 10-digit strings starting with 6-9
 *
 * **Validates: Requirements 1.2, 1.10, 1.11**
 */

// --- Generators ---

/** Generates a valid 12-digit Aadhaar string */
const aadhaarArb = fc.stringOf(fc.constantFrom(...'0123456789'.split('')), {
  minLength: 12,
  maxLength: 12,
});

/** Generates a valid PAN: [A-Z]{5}[0-9]{4}[A-Z] */
const panArb = fc.tuple(
  fc.stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')), { minLength: 5, maxLength: 5 }),
  fc.stringOf(fc.constantFrom(...'0123456789'.split('')), { minLength: 4, maxLength: 4 }),
  fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')),
).map(([letters, digits, lastChar]) => `${letters}${digits}${lastChar}`);

/** Generates a valid Indian mobile: 10 digits starting with 6-9 */
const mobileArb = fc.tuple(
  fc.constantFrom('6', '7', '8', '9'),
  fc.stringOf(fc.constantFrom(...'0123456789'.split('')), { minLength: 9, maxLength: 9 }),
).map(([first, rest]) => `${first}${rest}`);

/** Generates an invalid Aadhaar (not exactly 12 digits) */
const invalidAadhaarArb = fc.oneof(
  // Wrong length (1-11 or 13-20 digits)
  fc.integer({ min: 1, max: 20 }).filter(n => n !== 12).chain(len =>
    fc.stringOf(fc.constantFrom(...'0123456789'.split('')), { minLength: len, maxLength: len }),
  ),
  // Contains non-digit characters (12 chars)
  fc.stringOf(fc.char(), { minLength: 12, maxLength: 12 }).filter(s => !/^\d{12}$/.test(s)),
  // Empty string
  fc.constant(''),
);

/** Generates an invalid PAN */
const invalidPanArb = fc.oneof(
  // Wrong length
  fc.integer({ min: 1, max: 15 }).filter(n => n !== 10).chain(len =>
    fc.stringOf(fc.char(), { minLength: len, maxLength: len }),
  ),
  // Correct length but wrong format
  fc.stringOf(fc.char(), { minLength: 10, maxLength: 10 }).filter(s => !/^[A-Z]{5}\d{4}[A-Z]$/.test(s)),
  // Empty string
  fc.constant(''),
);

/** Generates an invalid mobile number */
const invalidMobileArb = fc.oneof(
  // Wrong length
  fc.integer({ min: 1, max: 15 }).filter(n => n !== 10).chain(len =>
    fc.stringOf(fc.constantFrom(...'0123456789'.split('')), { minLength: len, maxLength: len }),
  ),
  // Correct length but starts with 0-5
  fc.tuple(
    fc.constantFrom('0', '1', '2', '3', '4', '5'),
    fc.stringOf(fc.constantFrom(...'0123456789'.split('')), { minLength: 9, maxLength: 9 }),
  ).map(([first, rest]) => `${first}${rest}`),
  // Empty string
  fc.constant(''),
);

// --- Property 23: PII Masking ---

describe('Property 23: PII Masking', () => {
  it('maskAadhaar produces XXXX-XXXX-{last4} for all valid Aadhaar numbers', () => {
    fc.assert(
      fc.property(aadhaarArb, (aadhaar) => {
        const masked = maskAadhaar(aadhaar);
        const last4 = aadhaar.slice(-4);
        expect(masked).toBe(`XXXX-XXXX-${last4}`);
        // Verify the masked output never contains the full Aadhaar
        expect(masked).not.toContain(aadhaar);
        // Verify fixed format length: "XXXX-XXXX-" (10) + 4 = 14
        expect(masked).toHaveLength(14);
      }),
      { numRuns: 100 },
    );
  });

  it('maskPan produces XXXXXX{last4} for all valid PAN numbers', () => {
    fc.assert(
      fc.property(panArb, (pan) => {
        const masked = maskPan(pan);
        const last4 = pan.slice(-4);
        expect(masked).toBe(`XXXXXX${last4}`);
        // Verify the masked output never contains the full PAN
        expect(masked).not.toContain(pan);
        // Verify fixed format length: "XXXXXX" (6) + 4 = 10
        expect(masked).toHaveLength(10);
      }),
      { numRuns: 100 },
    );
  });

  it('maskMobile produces XXXXXX{last4} for all valid mobile numbers', () => {
    fc.assert(
      fc.property(mobileArb, (mobile) => {
        const masked = maskMobile(mobile);
        const last4 = mobile.slice(-4);
        expect(masked).toBe(`XXXXXX${last4}`);
        // Verify the masked output never contains the full mobile
        expect(masked).not.toContain(mobile);
        // Verify fixed format length: "XXXXXX" (6) + 4 = 10
        expect(masked).toHaveLength(10);
      }),
      { numRuns: 100 },
    );
  });
});

// --- Property 24: Input Format Validation ---

describe('Property 24: Input Format Validation', () => {
  it('aadhaarSchema accepts all 12-digit strings', () => {
    fc.assert(
      fc.property(aadhaarArb, (aadhaar) => {
        const result = aadhaarSchema.safeParse(aadhaar);
        expect(result.success).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('aadhaarSchema rejects non-12-digit strings', () => {
    fc.assert(
      fc.property(invalidAadhaarArb, (invalid) => {
        const result = aadhaarSchema.safeParse(invalid);
        expect(result.success).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('panSchema accepts all strings matching [A-Z]{5}[0-9]{4}[A-Z]', () => {
    fc.assert(
      fc.property(panArb, (pan) => {
        const result = panSchema.safeParse(pan);
        expect(result.success).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('panSchema rejects strings not matching [A-Z]{5}[0-9]{4}[A-Z]', () => {
    fc.assert(
      fc.property(invalidPanArb, (invalid) => {
        const result = panSchema.safeParse(invalid);
        expect(result.success).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('mobileSchema accepts all 10-digit strings starting with 6-9', () => {
    fc.assert(
      fc.property(mobileArb, (mobile) => {
        const result = mobileSchema.safeParse(mobile);
        expect(result.success).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('mobileSchema rejects strings not matching 10-digit starting with 6-9', () => {
    fc.assert(
      fc.property(invalidMobileArb, (invalid) => {
        const result = mobileSchema.safeParse(invalid);
        expect(result.success).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
