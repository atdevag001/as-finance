import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { getChangedSettings } from '../page';

/**
 * Property 19: Settings dirty tracking — only changed values submitted
 *
 * For any set of settings where a subset has been modified by the user,
 * the PATCH request payload should contain only the keys whose values
 * differ from the original fetched values. Unmodified settings should
 * not be included in the request.
 *
 * **Validates: Requirements 19.2**
 */
describe('Property 19: Settings dirty tracking — only changed values submitted', () => {
  // Use realistic setting key names (alphanumeric + underscore) to avoid
  // JS prototype property collisions (toString, __proto__, etc.)
  const settingKeyArb = fc
    .stringMatching(/^[a-z][a-z0-9_]{0,19}$/)
    .filter((s) => s.length >= 1);

  const settingsArb = fc.dictionary(settingKeyArb, fc.string({ minLength: 0, maxLength: 50 }), {
    minKeys: 1,
    maxKeys: 15,
  });

  it('should return empty object when nothing is changed', () => {
    fc.assert(
      fc.property(settingsArb, (original) => {
        const current = { ...original };
        const changed = getChangedSettings(original, current);
        expect(Object.keys(changed)).toHaveLength(0);
      }),
      { numRuns: 200 },
    );
  });

  it('should include only keys whose values differ from original', () => {
    fc.assert(
      fc.property(settingsArb, fc.integer({ min: 0, max: 100 }), (original, seed) => {
        const keys = Object.keys(original);
        if (keys.length === 0) return;

        const current = { ...original };
        const modifiedKeys = new Set<string>();
        for (let i = 0; i < keys.length; i++) {
          if ((seed + i) % 2 === 0) {
            const key = keys[i]!;
            current[key] = original[key]! + '_modified';
            modifiedKeys.add(key);
          }
        }

        const changed = getChangedSettings(original, current);
        const changedKeySet = new Set(Object.keys(changed));

        // Every key in changed must actually differ from original
        for (const key of Object.keys(changed)) {
          expect(changed[key]).not.toBe(original[key]);
        }

        // Every modified key must appear in changed
        for (const key of modifiedKeys) {
          expect(changedKeySet.has(key)).toBe(true);
        }

        // No unmodified key should appear in changed
        for (const key of keys) {
          if (!modifiedKeys.has(key)) {
            expect(changedKeySet.has(key)).toBe(false);
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it('should return all keys when every value is changed', () => {
    fc.assert(
      fc.property(settingsArb, (original) => {
        const current: Record<string, string> = {};
        for (const key of Object.keys(original)) {
          current[key] = original[key]! + '_changed';
        }

        const changed = getChangedSettings(original, current);
        expect(Object.keys(changed).sort()).toEqual(Object.keys(original).sort());
      }),
      { numRuns: 200 },
    );
  });

  it('should not include keys set back to original value', () => {
    fc.assert(
      fc.property(settingsArb, (original) => {
        const keys = Object.keys(original);
        if (keys.length === 0) return;

        const current: Record<string, string> = {};
        const expectedChanged = new Set<string>();
        for (let i = 0; i < keys.length; i++) {
          const key = keys[i]!;
          if (i % 2 === 0) {
            current[key] = original[key]! + '_modified';
            expectedChanged.add(key);
          } else {
            current[key] = original[key]!; // reverted
          }
        }

        const changed = getChangedSettings(original, current);
        expect(new Set(Object.keys(changed))).toEqual(expectedChanged);
      }),
      { numRuns: 200 },
    );
  });
});
