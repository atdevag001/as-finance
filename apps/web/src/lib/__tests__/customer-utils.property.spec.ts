import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { maskAadhaar, maskPan } from '../masking';
import {
  aadhaarSchema,
  panSchema,
  mobileSchema,
  pincodeSchema,
  passwordSchema,
} from '@as-finance/shared/validation';

// ─── Generators ───────────────────────────────────────────────────────────────

const DIGITS = '0123456789';
const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';

/** 4-digit string for Aadhaar last-four */
const lastFourDigitsArb = fc.stringOf(fc.constantFrom(...DIGITS.split('')), {
  minLength: 4,
  maxLength: 4,
});

/** First 8 digits of an Aadhaar (the masked portion) */
const aadhaarPrefixArb = fc.stringOf(fc.constantFrom(...DIGITS.split('')), {
  minLength: 8,
  maxLength: 8,
});

/** Valid 12-digit Aadhaar string */
const aadhaarArb = fc
  .tuple(aadhaarPrefixArb, lastFourDigitsArb)
  .map(([prefix, last4]) => `${prefix}${last4}`);

/** Last 4 characters of a PAN (1 digit + 3 chars from the tail, but actually it's [0-9]{1}[A-Z]{1} at positions 9-10 — let's generate the full PAN) */
const panArb = fc
  .tuple(
    fc.stringOf(fc.constantFrom(...UPPERCASE.split('')), { minLength: 5, maxLength: 5 }),
    fc.stringOf(fc.constantFrom(...DIGITS.split('')), { minLength: 4, maxLength: 4 }),
    fc.constantFrom(...UPPERCASE.split('')),
  )
  .map(([letters, digits, lastChar]) => `${letters}${digits}${lastChar}`);

/** Valid Indian mobile: 10 digits starting with 6-9 */
const validMobileArb = fc
  .tuple(
    fc.constantFrom('6', '7', '8', '9'),
    fc.stringOf(fc.constantFrom(...DIGITS.split('')), { minLength: 9, maxLength: 9 }),
  )
  .map(([first, rest]) => `${first}${rest}`);

/** Valid 6-digit pincode */
const validPincodeArb = fc.stringOf(fc.constantFrom(...DIGITS.split('')), {
  minLength: 6,
  maxLength: 6,
});

/** Valid password: ≥8 chars with at least one uppercase, one lowercase, one digit */
const ALL_CHARS = UPPERCASE + LOWERCASE + DIGITS;
const validPasswordArb = fc
  .tuple(
    fc.constantFrom(...UPPERCASE.split('')),
    fc.constantFrom(...LOWERCASE.split('')),
    fc.constantFrom(...DIGITS.split('')),
    fc.stringOf(fc.constantFrom(...ALL_CHARS.split('')), { minLength: 5, maxLength: 50 }),
  )
  .chain(([upper, lower, digit, rest]) => {
    const chars = [upper, lower, digit, ...rest.split('')];
    return fc
      .shuffledSubarray(chars, { minLength: chars.length, maxLength: chars.length })
      .map((shuffled) => shuffled.join(''));
  });


// ─── Property 3: PII masking round-trip consistency ───────────────────────────
// **Validates: Requirements 6.2, 6.3, 25.1, 25.2**

describe('Property 3: PII masking round-trip consistency', () => {
  it('maskAadhaar produces XXXX-XXXX-{lastFour} for any 12-digit Aadhaar', () => {
    fc.assert(
      fc.property(aadhaarArb, (aadhaar) => {
        const lastFour = aadhaar.slice(-4);
        const masked = maskAadhaar(aadhaar);
        expect(masked).toBe(`XXXX-XXXX-${lastFour}`);
      }),
      { numRuns: 100 },
    );
  });

  it('maskPan produces XXXXXX{lastFour} for any valid PAN', () => {
    fc.assert(
      fc.property(panArb, (pan) => {
        const lastFour = pan.slice(-4);
        const masked = maskPan(pan);
        expect(masked).toBe(`XXXXXX${lastFour}`);
      }),
      { numRuns: 100 },
    );
  });

  it('last 4 characters of masked Aadhaar equal last 4 of input', () => {
    fc.assert(
      fc.property(aadhaarArb, (aadhaar) => {
        const masked = maskAadhaar(aadhaar);
        expect(masked.slice(-4)).toBe(aadhaar.slice(-4));
      }),
      { numRuns: 100 },
    );
  });

  it('last 4 characters of masked PAN equal last 4 of input', () => {
    fc.assert(
      fc.property(panArb, (pan) => {
        const masked = maskPan(pan);
        expect(masked.slice(-4)).toBe(pan.slice(-4));
      }),
      { numRuns: 100 },
    );
  });

  it('maskAadhaar output has fixed length 14 (XXXX-XXXX-NNNN)', () => {
    fc.assert(
      fc.property(aadhaarArb, (aadhaar) => {
        expect(maskAadhaar(aadhaar)).toHaveLength(14);
      }),
      { numRuns: 100 },
    );
  });

  it('maskPan output has fixed length 10 (XXXXXXNNNN)', () => {
    fc.assert(
      fc.property(panArb, (pan) => {
        expect(maskPan(pan)).toHaveLength(10);
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 4: Shared validation schema correctness ─────────────────────────
// **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 18.3**

describe('Property 4: Shared validation schema correctness', () => {
  // --- Aadhaar ---
  it('aadhaarSchema accepts all 12-digit strings', () => {
    fc.assert(
      fc.property(aadhaarArb, (aadhaar) => {
        expect(aadhaarSchema.safeParse(aadhaar).success).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('aadhaarSchema rejects strings that are not exactly 12 digits', () => {
    const invalidAadhaarArb = fc
      .string({ minLength: 1, maxLength: 20 })
      .filter((s) => !/^\d{12}$/.test(s));
    fc.assert(
      fc.property(invalidAadhaarArb, (input) => {
        expect(aadhaarSchema.safeParse(input).success).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  // --- PAN ---
  it('panSchema accepts all valid PAN format strings', () => {
    fc.assert(
      fc.property(panArb, (pan) => {
        expect(panSchema.safeParse(pan).success).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('panSchema rejects strings not matching [A-Z]{5}[0-9]{4}[A-Z]', () => {
    const invalidPanArb = fc
      .string({ minLength: 1, maxLength: 15 })
      .filter((s) => !/^[A-Z]{5}\d{4}[A-Z]$/.test(s));
    fc.assert(
      fc.property(invalidPanArb, (input) => {
        expect(panSchema.safeParse(input).success).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  // --- Mobile ---
  it('mobileSchema accepts all 10-digit strings starting with 6-9', () => {
    fc.assert(
      fc.property(validMobileArb, (mobile) => {
        expect(mobileSchema.safeParse(mobile).success).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('mobileSchema rejects strings not matching 10-digit starting with 6-9', () => {
    const invalidMobileArb = fc
      .string({ minLength: 1, maxLength: 15 })
      .filter((s) => !/^[6-9]\d{9}$/.test(s));
    fc.assert(
      fc.property(invalidMobileArb, (input) => {
        expect(mobileSchema.safeParse(input).success).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  // --- Pincode ---
  it('pincodeSchema accepts all 6-digit strings', () => {
    fc.assert(
      fc.property(validPincodeArb, (pincode) => {
        expect(pincodeSchema.safeParse(pincode).success).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('pincodeSchema rejects strings that are not exactly 6 digits', () => {
    const invalidPincodeArb = fc
      .string({ minLength: 1, maxLength: 10 })
      .filter((s) => !/^\d{6}$/.test(s));
    fc.assert(
      fc.property(invalidPincodeArb, (input) => {
        expect(pincodeSchema.safeParse(input).success).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  // --- Password ---
  it('passwordSchema accepts strings with ≥8 chars, uppercase, lowercase, and digit', () => {
    fc.assert(
      fc.property(validPasswordArb, (password) => {
        expect(passwordSchema.safeParse(password).success).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('passwordSchema rejects strings shorter than 8 characters', () => {
    const tooShortArb = fc
      .stringOf(fc.constantFrom(...ALL_CHARS.split('')), { minLength: 1, maxLength: 7 });
    fc.assert(
      fc.property(tooShortArb, (input) => {
        expect(passwordSchema.safeParse(input).success).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('passwordSchema rejects strings missing uppercase letter', () => {
    const noUpperArb = fc
      .stringOf(fc.constantFrom(...(LOWERCASE + DIGITS).split('')), { minLength: 8, maxLength: 30 })
      .filter((s) => /[a-z]/.test(s) && /\d/.test(s));
    fc.assert(
      fc.property(noUpperArb, (input) => {
        expect(passwordSchema.safeParse(input).success).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('passwordSchema rejects strings missing lowercase letter', () => {
    const noLowerArb = fc
      .stringOf(fc.constantFrom(...(UPPERCASE + DIGITS).split('')), { minLength: 8, maxLength: 30 })
      .filter((s) => /[A-Z]/.test(s) && /\d/.test(s));
    fc.assert(
      fc.property(noLowerArb, (input) => {
        expect(passwordSchema.safeParse(input).success).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('passwordSchema rejects strings missing digit', () => {
    const noDigitArb = fc
      .stringOf(fc.constantFrom(...(UPPERCASE + LOWERCASE).split('')), { minLength: 8, maxLength: 30 })
      .filter((s) => /[A-Z]/.test(s) && /[a-z]/.test(s));
    fc.assert(
      fc.property(noDigitArb, (input) => {
        expect(passwordSchema.safeParse(input).success).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
