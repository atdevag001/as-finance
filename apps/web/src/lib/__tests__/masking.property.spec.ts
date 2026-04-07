import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { maskAadhaar, maskPan, maskMobile } from '../masking';

/**
 * Property 3: PII masking round-trip consistency
 *
 * For any 4-digit string lastFour, maskAadhaar applied to any 12-digit Aadhaar
 * ending in lastFour should produce XXXX-XXXX-{lastFour}.
 * For any 4-character string lastFour, maskPan applied to any valid PAN
 * ending in lastFour should produce XXXXXX{lastFour}.
 * The last 4 characters of the masked output must always equal the last 4
 * characters of the input.
 *
 * **Validates: Requirements 6.2, 6.3, 25.1, 25.2**
 */

// --- Generators ---

/** Generates valid 12-digit Aadhaar numbers */
const aadhaarArb = fc.stringOf(fc.constantFrom(...'0123456789'.split('')), { minLength: 12, maxLength: 12 });

/** Generates valid PAN format: AAAAA9999A */
const panArb = fc
  .tuple(
    fc.stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')), { minLength: 5, maxLength: 5 }),
    fc.stringOf(fc.constantFrom(...'0123456789'.split('')), { minLength: 4, maxLength: 4 }),
    fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')),
  )
  .map(([letters, digits, lastLetter]) => `${letters}${digits}${lastLetter}`);

/** Generates valid 10-digit Indian mobile numbers starting with 6-9 */
const mobileArb = fc
  .tuple(
    fc.constantFrom('6', '7', '8', '9'),
    fc.stringOf(fc.constantFrom(...'0123456789'.split('')), { minLength: 9, maxLength: 9 }),
  )
  .map(([first, rest]) => `${first}${rest}`);

/** Generates any 4-digit string */
const last4DigitsArb = fc.stringOf(fc.constantFrom(...'0123456789'.split('')), { minLength: 4, maxLength: 4 });

/** Generates any 4-character alphanumeric string */
const last4CharsArb = fc.stringOf(
  fc.constantFrom(...'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')),
  { minLength: 4, maxLength: 4 },
);

// --- Property 3: PII masking round-trip consistency ---

describe('Property 3: PII masking round-trip consistency', () => {
  describe('Aadhaar masking', () => {
    it('last 4 chars of masked output always equal last 4 chars of input', () => {
      fc.assert(
        fc.property(aadhaarArb, (aadhaar) => {
          const masked = maskAadhaar(aadhaar);
          expect(masked.slice(-4)).toBe(aadhaar.slice(-4));
        }),
        { numRuns: 200 },
      );
    });

    it('masked output always matches pattern XXXX-XXXX-{4digits}', () => {
      fc.assert(
        fc.property(aadhaarArb, (aadhaar) => {
          const masked = maskAadhaar(aadhaar);
          expect(masked).toMatch(/^XXXX-XXXX-\d{4}$/);
        }),
        { numRuns: 200 },
      );
    });

    it('masked output length is always 14 characters', () => {
      fc.assert(
        fc.property(aadhaarArb, (aadhaar) => {
          const masked = maskAadhaar(aadhaar);
          expect(masked.length).toBe(14);
        }),
        { numRuns: 100 },
      );
    });

    it('given any last4, any Aadhaar ending in last4 produces same visible digits', () => {
      fc.assert(
        fc.property(last4DigitsArb, (last4) => {
          // Create an Aadhaar ending with this last4
          const aadhaar = '12345678' + last4;
          const masked = maskAadhaar(aadhaar);
          expect(masked).toBe(`XXXX-XXXX-${last4}`);
        }),
        { numRuns: 100 },
      );
    });

    it('different inputs with same last4 produce same masked output', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.stringOf(fc.constantFrom(...'0123456789'.split('')), { minLength: 8, maxLength: 8 }),
            fc.stringOf(fc.constantFrom(...'0123456789'.split('')), { minLength: 8, maxLength: 8 }),
            last4DigitsArb,
          ),
          ([prefix1, prefix2, last4]) => {
            const aadhaar1 = prefix1 + last4;
            const aadhaar2 = prefix2 + last4;
            expect(maskAadhaar(aadhaar1)).toBe(maskAadhaar(aadhaar2));
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('PAN masking', () => {
    it('last 4 chars of masked output always equal last 4 chars of input', () => {
      fc.assert(
        fc.property(panArb, (pan) => {
          const masked = maskPan(pan);
          expect(masked.slice(-4)).toBe(pan.slice(-4));
        }),
        { numRuns: 200 },
      );
    });

    it('masked output always matches pattern XXXXXX{4chars}', () => {
      fc.assert(
        fc.property(panArb, (pan) => {
          const masked = maskPan(pan);
          expect(masked).toMatch(/^XXXXXX.{4}$/);
        }),
        { numRuns: 200 },
      );
    });

    it('masked output length is always 10 characters', () => {
      fc.assert(
        fc.property(panArb, (pan) => {
          const masked = maskPan(pan);
          expect(masked.length).toBe(10);
        }),
        { numRuns: 100 },
      );
    });

    it('given any last4, any PAN ending in last4 produces same visible chars', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')), { minLength: 3, maxLength: 3 }),
            last4CharsArb,
          ),
          ([prefix, last4]) => {
            const pan = 'ABC' + prefix.slice(0, 3) + last4;
            const masked = maskPan(pan);
            expect(masked.slice(-4)).toBe(last4);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('Mobile masking', () => {
    it('last 4 chars of masked output always equal last 4 chars of input', () => {
      fc.assert(
        fc.property(mobileArb, (mobile) => {
          const masked = maskMobile(mobile);
          expect(masked.slice(-4)).toBe(mobile.slice(-4));
        }),
        { numRuns: 200 },
      );
    });

    it('masked output always matches pattern XXXXXX{4digits}', () => {
      fc.assert(
        fc.property(mobileArb, (mobile) => {
          const masked = maskMobile(mobile);
          expect(masked).toMatch(/^XXXXXX\d{4}$/);
        }),
        { numRuns: 200 },
      );
    });

    it('masked output length is always 10 characters', () => {
      fc.assert(
        fc.property(mobileArb, (mobile) => {
          const masked = maskMobile(mobile);
          expect(masked.length).toBe(10);
        }),
        { numRuns: 100 },
      );
    });

    it('given any last4, any mobile ending in last4 produces same visible digits', () => {
      fc.assert(
        fc.property(last4DigitsArb, (last4) => {
          // Create a mobile ending with this last4
          const mobile = '912345' + last4;
          const masked = maskMobile(mobile);
          expect(masked).toBe(`XXXXXX${last4}`);
        }),
        { numRuns: 100 },
      );
    });
  });
});

describe('Masking functions are pure', () => {
  it('maskAadhaar returns same output for same input', () => {
    fc.assert(
      fc.property(aadhaarArb, (aadhaar) => {
        const result1 = maskAadhaar(aadhaar);
        const result2 = maskAadhaar(aadhaar);
        expect(result1).toBe(result2);
      }),
      { numRuns: 100 },
    );
  });

  it('maskPan returns same output for same input', () => {
    fc.assert(
      fc.property(panArb, (pan) => {
        const result1 = maskPan(pan);
        const result2 = maskPan(pan);
        expect(result1).toBe(result2);
      }),
      { numRuns: 100 },
    );
  });

  it('maskMobile returns same output for same input', () => {
    fc.assert(
      fc.property(mobileArb, (mobile) => {
        const result1 = maskMobile(mobile);
        const result2 = maskMobile(mobile);
        expect(result1).toBe(result2);
      }),
      { numRuns: 100 },
    );
  });
});

describe('Masking hides first portion', () => {
  it('Aadhaar: first 8 digits are not recoverable from masked output', () => {
    fc.assert(
      fc.property(aadhaarArb, (aadhaar) => {
        const masked = maskAadhaar(aadhaar);
        const first8 = aadhaar.slice(0, 8);
        // The masked output should not contain the first 8 digits
        expect(masked).not.toContain(first8);
      }),
      { numRuns: 100 },
    );
  });

  it('PAN: first 6 chars are not recoverable from masked output', () => {
    fc.assert(
      fc.property(panArb, (pan) => {
        const masked = maskPan(pan);
        const first6 = pan.slice(0, 6);
        // The masked output should not contain the first 6 chars
        expect(masked).not.toContain(first6);
      }),
      { numRuns: 100 },
    );
  });

  it('Mobile: first 6 digits are not recoverable from masked output', () => {
    fc.assert(
      fc.property(mobileArb, (mobile) => {
        const masked = maskMobile(mobile);
        const first6 = mobile.slice(0, 6);
        // The masked output should not contain the first 6 digits
        expect(masked).not.toContain(first6);
      }),
      { numRuns: 100 },
    );
  });
});
