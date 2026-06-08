'use client';

import { cn } from '@/lib/utils';
import type { Section } from '../_content/_types';

const HEADING: Record<'en' | 'hi' | 'hinglish', string> = {
  en: 'On this page',
  hi: 'इस पेज पर',
  hinglish: 'Is page par',
};

export function ChapterToc({
  sections,
  lang,
  className,
}: {
  sections: Section[];
  lang: 'en' | 'hi' | 'hinglish';
  className?: string;
}) {
  if (sections.length < 2) return null;
  return (
    <nav
      aria-label={HEADING[lang]}
      className={cn('rounded-md border bg-muted/40 p-3 text-sm', className)}
    >
      <p className="mb-2 font-semibold text-foreground">{HEADING[lang]}</p>
      <ul className="space-y-1">
        {sections.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className="block rounded px-2 py-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              {s.heading}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
