'use client';

import Link from 'next/link';
import { useHelpLang } from './help-language-context';
import { GLOSSARY } from '../_content/glossary-terms';

/**
 * Inline glossary term: <Term id="emi">EMI</Term>
 * Renders the visible word with a native title-attribute tooltip (definition in current lang)
 * AND a link to the glossary section. Lo-fi but works offline, screen-readable, and zero JS.
 */
export function Term({ id, children }: { id: string; children: React.ReactNode }) {
  const { lang } = useHelpLang();
  const entry = GLOSSARY[id];
  const definition = entry?.[lang] ?? entry?.en ?? '';

  return (
    <Link
      href={`/help/glossary?lang=${lang}#${id}`}
      title={definition}
      className="underline decoration-dotted decoration-muted-foreground underline-offset-4 hover:decoration-foreground"
    >
      {children}
    </Link>
  );
}
