import { describe, it, expect } from 'vitest';
import { HELP_TOPICS } from '@as-finance/shared';
import { ALL_CHAPTERS } from '../_content';
import { HELP_LANGS } from '../_content/_types';

/**
 * Drift-proof guarantee: every <HelpLink topic="X"> in the app must point to a real
 * chapter + section in the content. If a section gets renamed or a topic gets added
 * without content, this test fails at CI — long before a user sees a broken (?) icon.
 */
describe('HELP_TOPICS coverage', () => {
  for (const [topicId, target] of Object.entries(HELP_TOPICS)) {
    it(`${topicId} → ${target.chapter}#${target.section} resolves in every language`, () => {
      const chapter = ALL_CHAPTERS[target.chapter];
      expect(chapter, `chapter '${target.chapter}' is missing`).toBeDefined();
      if (!chapter) return;

      for (const lang of HELP_LANGS) {
        const sections = chapter.langs[lang].sections;
        const found = sections.find((s) => s.id === target.section);
        expect(
          found,
          `chapter '${target.chapter}' (${lang}) has no section id '${target.section}'`,
        ).toBeDefined();
      }
    });
  }
});

describe('Chapter content invariants', () => {
  for (const [id, chapter] of Object.entries(ALL_CHAPTERS)) {
    it(`${id} — section ids are unique per language`, () => {
      for (const lang of HELP_LANGS) {
        const ids = chapter.langs[lang].sections.map((s) => s.id);
        const dupes = ids.filter((v, i) => ids.indexOf(v) !== i);
        expect(dupes, `${id}/${lang} has duplicate section ids: ${dupes.join(', ')}`).toHaveLength(0);
      }
    });

    it(`${id} — every language has at least one section`, () => {
      for (const lang of HELP_LANGS) {
        expect(chapter.langs[lang].sections.length, `${id}/${lang} has no sections`).toBeGreaterThan(0);
      }
    });

    it(`${id} — all languages share the same section ids in the same order (translation parity)`, () => {
      const enIds = chapter.langs.en.sections.map((s) => s.id);
      for (const lang of HELP_LANGS) {
        if (lang === 'en') continue;
        const ids = chapter.langs[lang].sections.map((s) => s.id);
        expect(ids, `${id}/${lang} section order differs from en`).toEqual(enIds);
      }
    });

    it(`${id} — meta has lastReviewed in ISO YYYY-MM-DD form`, () => {
      expect(chapter.meta.lastReviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  }
});
