import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { passwordSchema } from '../schemas.js';

/**
 * Property 27: Password Validation Round-Trip
 *   — all valid passwords pass, all invalid fail
 *
 * **Validates: Requirements 47.4, 47.5**
 */

const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';
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

const noUppercaseArb = fc
  .stringOf(fc.constantFrom(...(LOWERCASE + DIGITS).split('')), { minLength: 8, maxLength: 50 })
  .filter((s) => /[a-z]/.test(s) && /\d/.test(s));

const noLowercaseArb = fc
  .stringOf(fc.constantFrom(...(UPPERCASE + DIGITS).split('')), { minLength: 8, maxLength: 50 })
  .filter((s) => /[A-Z]/.test(s) && /\d/.test(s));

const noDigitArb = fc
  .stringOf(fc.constantFrom(...(UPPERCASE + LOWERCASE).split('')), { minLength: 8, maxLength: 50 })
  .filter((s) => /[A-Z]/.test(s) && /[a-z]/.test(s));

const tooShortArb = fc
  .tuple(
    fc.constantFrom(...UPPERCASE.split('')),
    fc.constantFrom(...LOWERCASE.split('')),
    fc.constantFrom(...DIGITS.split('')),

    fc.stringOf(fc.constantFrom(...ALL_CHARS.split('')), { minLength: 0, maxLength: 4 }),
  )
  .map(([upper, lower, digit, rest]) => (upper + lower + digit + rest).slice(0, 7))
  .filter((s) => s.length >= 1 && s.length < 8);

describe('Property 27: Password Validation Round-Trip', () => {
  it('accepts all valid passwords (8+ chars, uppercase, lowercase, digit)', () => {
    fc.assert(
      fc.property(validPasswordArb, (password) => {
        const result = passwordSchema.safeParse(password);
        expect(result.success).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('rejects all passwords missing uppercase letter', () => {
    fc.assert(
      fc.property(noUppercaseArb, (password) => {
        const result = passwordSchema.safeParse(password);
        expect(result.success).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('rejects all passwords missing lowercase letter', () => {
    fc.assert(
      fc.property(noLowercaseArb, (password) => {
        const result = passwordSchema.safeParse(password);
        expect(result.success).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('rejects all passwords missing digit', () => {
    fc.assert(
      fc.property(noDigitArb, (password) => {
        const result = passwordSchema.safeParse(password);
        expect(result.success).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('rejects all passwords shorter than 8 characters', () => {
    fc.assert(
      fc.property(tooShortArb, (password) => {
        const result = passwordSchema.safeParse(password);
        expect(result.success).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
