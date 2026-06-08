import type { ChapterContent, Section } from './_types';
import { GLOSSARY } from './glossary-terms';

const TITLES = {
  en: { en: 'English', heading: 'Glossary' },
  hi: { en: 'हिंदी', heading: 'शब्दावली' },
  hinglish: { en: 'Hinglish', heading: 'Glossary' },
} as const;

const INTRO = {
  en:
    'Microfinance and banking jargon, in plain words. Anywhere in the guide where a term is underlined, click it to jump back here.',
  hi:
    'माइक्रोफ़ाइनेंस और बैंकिंग की शब्दावली, आसान भाषा में। गाइड में जहाँ भी कोई शब्द रेखांकित है, क्लिक करें और सीधे यहाँ आ जाएँगे।',
  hinglish:
    'Microfinance aur banking ke terms, aasaan bhasha mein. Guide mein jahan bhi koi term underlined hai, click karke seedhe yahan aa jao.',
};

function sectionsFor(lang: 'en' | 'hi' | 'hinglish'): Section[] {
  return Object.entries(GLOSSARY).map(([id, defs]) => ({
    id,
    heading: id.toUpperCase().replace(/-/g, ' '),
    body: defs[lang],
  }));
}

export const glossary: ChapterContent = {
  id: 'glossary',
  meta: { lastReviewed: '2026-06-08', reviewedBy: 'help-maintainer', appVersion: '1.0.0' },
  langs: {
    en: { title: TITLES.en.heading, intro: INTRO.en, sections: sectionsFor('en') },
    hi: { title: TITLES.hi.heading, intro: INTRO.hi, sections: sectionsFor('hi') },
    hinglish: { title: TITLES.hinglish.heading, intro: INTRO.hinglish, sections: sectionsFor('hinglish') },
  },
};
