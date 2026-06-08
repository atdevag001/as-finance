'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { HelpCircle } from 'lucide-react';
import { HELP_TOPICS, helpTopicHref, type HelpTopicId } from '@as-finance/shared';
import { cn } from '@/lib/utils';

type HelpLang = 'en' | 'hi' | 'hinglish';
const STORAGE_KEY = 'help-lang';

function readStoredLang(): HelpLang {
  if (typeof window === 'undefined') return 'en';
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (v === 'hi' || v === 'hinglish' || v === 'en') return v;
  return 'en';
}

/**
 * A small "?" icon button that takes the user to the right page in the user guide.
 * Use next to risky actions (Approve / Disburse / Reverse / Foreclose / Day-end).
 *
 *   <HelpLink topic="LOAN_APPROVE" />
 *
 * The href is built from HELP_TOPICS in @as-finance/shared, so a typo or stale topic
 * fails to typecheck — and the help-link-coverage test catches missing sections at build.
 */
export function HelpLink({
  topic,
  className,
  label,
}: {
  topic: HelpTopicId;
  className?: string;
  label?: string;
}) {
  const [lang, setLang] = useState<HelpLang>('en');

  useEffect(() => {
    setLang(readStoredLang());
  }, []);

  if (!HELP_TOPICS[topic]) return null;

  const href = helpTopicHref(topic, lang);
  const ariaLabel = label ?? `Help: ${topic.toLowerCase().replace(/_/g, ' ')}`;

  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <HelpCircle className="h-4 w-4" aria-hidden="true" />
    </Link>
  );
}
