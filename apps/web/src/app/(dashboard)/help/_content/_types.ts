import type { UserRole } from '@as-finance/shared';

export type HelpLang = 'en' | 'hi' | 'hinglish';

export const HELP_LANGS: HelpLang[] = ['en', 'hi', 'hinglish'];

export const HELP_LANG_LABEL: Record<HelpLang, string> = {
  en: 'English',
  hi: 'हिंदी',
  hinglish: 'Hinglish',
};

/** ISO-639 language tag for <html lang>. Hinglish is Roman-script English from a screen-reader's POV. */
export const HELP_LANG_HTML_TAG: Record<HelpLang, string> = {
  en: 'en',
  hi: 'hi',
  hinglish: 'en',
};

export type ScreenshotRef = {
  src: string;
  alt: string;
  caption?: string;
  /** Phone-viewport variant; if absent, the desktop src is reused. */
  mobileSrc?: string;
};

export type Step = {
  text: string;
  screenshot?: ScreenshotRef;
};

export type Example = {
  title: string;
  body: string;
};

export type Section = {
  /** Stable anchor — matches HELP_TOPICS[*].section. */
  id: string;
  heading: string;
  body?: string;
  steps?: Step[];
  tip?: string;
  warning?: string;
  /** Blame-free copy ("mistakes happen — reversal is the right fix"). */
  reassure?: string;
  /** Worked numerical example — the kind that makes EMI math click. */
  example?: Example;
  screenshot?: ScreenshotRef;
  /** Failure-state screenshots so the panic moment is illustrated, not just the happy path. */
  errorGallery?: ScreenshotRef[];
};

export type LangContent = {
  title: string;
  intro: string;
  /** Renders as RoleBadge row at the top of the chapter. */
  whoCanDoThis?: UserRole[];
  sections: Section[];
};

export type ChapterMeta = {
  /** ISO date — drives the amber stale banner if >180 days old. */
  lastReviewed: string;
  reviewedBy: string;
  appVersion: string;
  relatedChapters?: string[];
};

export type ChapterContent = {
  /** URL slug for /help/<id>. */
  id: string;
  meta: ChapterMeta;
  langs: Record<HelpLang, LangContent>;
  /**
   * Screenshots shared across all languages (the app UI is English).
   * Keyed by section.id. Renderer uses these when a section has no per-language screenshot.
   */
  screenshots?: Record<string, ScreenshotRef>;
};
