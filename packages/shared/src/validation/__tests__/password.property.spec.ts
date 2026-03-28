import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { passwordSchema } from '../schemas.js';

/**
 * Property 35: Password Validation
 *
 * For all password strings, the validator SHALL accept only passwords with
 * minimum 8 characters containing at least one uppercase letter, one lowercase
 * letter, and one digit. All other passwords SHALL be rejected.
 *
 * **Validates: Requirements 16.3**
 */

// --- Generators ---

const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';
const ALL_CHARS = UPPERCASE + LOWERCASE + DIGITS;

/** Generates a valid password: 8+ chars with at least one uppercase, one lowercase, one digit */
const validPasswordArb = fc
  .tuple(
    fc.constantFrom(...UPPERCASE.split('')),
    fc.constantFrom(...LOWERCASE.split('')),
    fc.constantFrom(...DIGITS.split('')),
    // Fill remaining 5+ chars from the full charset
    fc.stringOf(fc.constantFrom(...ALL_CHARS.split('')), { minLength: 5, maxLength: 50 }),
  )
  .chain(([upper, lower, digit, rest]) => {
    const chars = [upper, lower, digit, ...rest.split('')];
    // Shuffle to avoid predictable positions
    return fc.shuffledSubarray(chars, { minLength: chars.length, maxLength: chars.length })
      .map((shuffled) => shuffled.join(''));
  });

/** Generates a password missing uppercase (only lowercase + digits, 8+ chars) */
const noUppercaseArb = fc
  .stringOf(fc.constantFrom(...(LOWERCASE + DIGITS).split('')), { minLength: 8, maxLength: 50 })
  .filter((s) => /[a-z]/.test(s) && /\d/.test(s));

/** Generates a password missing lowercase (only uppercase + digits, 8+ chars) */
const noLowercaseArb = fc
  .stringOf(fc.constantFrom(...(UPPERCASE + DIGITS).split('')), { minLength: 8, maxLength: 50 })
  .filter((s) => /[A-Z]/.test(s) && /\d/.test(s));

/** Generates a password missing digit (only uppercase + lowercase, 8+ chars) */
const noDigitArb = fc
  .stringOf(fc.constantFrom(...(UPPERCASE + LOWERCASE).split('')), { minLength: 8, maxLength: 50 })
  .filter((s) => /[A-Z]/.test(s) && /[a-z]/.test(s));

/** Generates a too-short password (1-7 chars) that otherwise meets all char requirements */
const tooShortArb = fc
  .tuple(
    fc.constantFrom(...UPPERCASE.split('')),
    fc.constantFrom(...LOWERCASE.split('')),
    fc.constantFrom(...DIGITS.split('')),
    fc.stringOf(fc.constantFrom(...ALL_CHARS.split('')), { minLength: 0, maxLength: 4 }),
  )
  .map(([upper, lower, digit, rest]) => (upper + lower + digit + rest).slice(0, 7))
  .filter((s) => s.length >= 1 && s.length < 8);

// --- Property 35: Password Validation ---

describe('Property 35: Password Validation', () => {
  it('accepts valid passwords (8+ chars, uppercase, lowercase, digit)', () => {
    fc.assert(
      fc.property(validPasswordArb, (password) => {
        const result = passwordSchema.safeParse(password);
        expect(result.success).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('rejects passwords missing uppercase letter', () => {
    fc.assert(
      fc.property(noUppercaseArb, (password) => {
        const result = passwordSchema.safeParse(password);
        expect(result.success).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('rejects passwords missing lowercase letter', () => {
    fc.assert(
      fc.property(noLowercaseArb, (password) => {
        const result = passwordSchema.safeParse(password);
        expect(result.success).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('rejects passwords missing digit', () => {
    fc.assert(
      fc.property(noDigitArb, (password) => {
        const result = passwordSchema.safeParse(password);
        expect(result.success).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('rejects passwords shorter than 8 characters', () => {
    fc.assert(
      fc.property(tooShortArb, (password) => {
        const result = passwordSchema.safeParse(password);
        expect(result.success).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
