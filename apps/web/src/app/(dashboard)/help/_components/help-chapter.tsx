'use client';

import { useEffect, useRef } from 'react';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useHelpLang } from './help-language-context';
import { LanguageSwitcher } from './language-switcher';
import { ChapterToc } from './chapter-toc';
import { StepList } from './step-list';
import { Screenshot } from './screenshot';
import { Tip, Warning, Reassure, ExampleBox } from './callouts';
import { RoleBadgeRow } from './role-badge';
import { CopyLinkButton } from './copy-link-button';
import { LastReviewed } from './last-reviewed';
import { Feedback } from './feedback';
import type { ChapterContent, HelpLang } from '../_content/_types';

const WHO_LABEL: Record<HelpLang, string> = {
  en: 'Who can do this:',
  hi: 'यह कौन कर सकता है:',
  hinglish: 'Ye kaun kar sakta hai:',
};

const PRINT_LABEL: Record<HelpLang, string> = {
  en: 'Print this chapter',
  hi: 'यह अध्याय प्रिंट करें',
  hinglish: 'Chapter print karein',
};

const ERROR_GALLERY_LABEL: Record<HelpLang, string> = {
  en: 'What it looks like when something goes wrong',
  hi: 'जब कुछ गड़बड़ हो तो ऐसा दिखता है',
  hinglish: 'Kuch galat ho to aisa dikhta hai',
};

export function HelpChapter({ chapter }: { chapter: ChapterContent }) {
  const { lang } = useHelpLang();
  const content = chapter.langs[lang];
  const h1Ref = useRef<HTMLHeadingElement>(null);

  // Reset focus to <h1> when language changes — screen readers re-announce.
  useEffect(() => {
    h1Ref.current?.focus();
  }, [lang]);

  // Scroll to hash anchor after content swaps in (URL #section may have loaded before content).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    const el = document.getElementById(hash);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [lang]);

  return (
    <article
      className="prose-help help-printable"
      role="region"
      aria-live="polite"
      aria-atomic="false"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 no-print">
        <LanguageSwitcher />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => typeof window !== 'undefined' && window.print()}
          className="gap-1.5"
        >
          <Printer className="h-4 w-4" aria-hidden="true" /> {PRINT_LABEL[lang]}
        </Button>
      </div>

      <h1
        ref={h1Ref}
        tabIndex={-1}
        className="text-3xl font-bold tracking-tight focus:outline-none"
      >
        {content.title}
      </h1>
      <p className="mt-3 text-lg text-muted-foreground">{content.intro}</p>

      {content.whoCanDoThis && content.whoCanDoThis.length > 0 ? (
        <div className="mt-4">
          <RoleBadgeRow roles={content.whoCanDoThis} lang={lang} labelText={WHO_LABEL[lang]} />
        </div>
      ) : null}

      <ChapterToc sections={content.sections} lang={lang} className="my-6 no-print" />

      {content.sections.map((section) => {
        const shot = section.screenshot ?? chapter.screenshots?.[section.id];
        return (
        <section key={section.id} id={section.id} className="mt-10 scroll-mt-24">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-2xl font-semibold tracking-tight">{section.heading}</h2>
            <CopyLinkButton anchor={section.id} label="Copy link" className="no-print" />
          </div>

          {section.body ? (
            <p className="mt-3 whitespace-pre-line leading-relaxed">{section.body}</p>
          ) : null}

          {shot ? <Screenshot shot={shot} /> : null}

          {section.steps && section.steps.length > 0 ? (
            <StepList steps={section.steps} className="mt-4" />
          ) : null}

          {section.tip ? <Tip>{section.tip}</Tip> : null}
          {section.warning ? <Warning>{section.warning}</Warning> : null}
          {section.reassure ? <Reassure>{section.reassure}</Reassure> : null}
          {section.example ? (
            <ExampleBox title={section.example.title}>{section.example.body}</ExampleBox>
          ) : null}

          {section.errorGallery && section.errorGallery.length > 0 ? (
            <div className="mt-6">
              <p className="mb-2 font-semibold">{ERROR_GALLERY_LABEL[lang]}</p>
              <div className="grid gap-4 sm:grid-cols-2">
                {section.errorGallery.map((shot, i) => (
                  <Screenshot key={i} shot={shot} />
                ))}
              </div>
            </div>
          ) : null}

          <Feedback chapter={chapter.id} sectionId={section.id} lang={lang} className="no-print" />
        </section>
        );
      })}

      <LastReviewed meta={chapter.meta} lang={lang} />
    </article>
  );
}
