/**
 * SMS template-related fast-check arbitraries.
 */
import fc from 'fast-check';

/** Arbitrary for template strings with {{placeholder}} variables */
export const templateArb: fc.Arbitrary<string> = fc
  .array(
    fc.oneof(
      fc.string({ minLength: 1, maxLength: 30 }).filter((s) => !s.includes('{') && !s.includes('}')),
      fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{0,15}$/).map((key) => `{{${key}}}`),
    ),
    { minLength: 1, maxLength: 10 },
  )
  .map((parts) => parts.join(' '));

/** Arbitrary for a variable map (key → value) used in template rendering */
export const variableMapArb: fc.Arbitrary<Record<string, string>> = fc.dictionary(
  fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{0,15}$/),
  fc.string({ minLength: 1, maxLength: 50 }),
  { minKeys: 0, maxKeys: 10 },
);
