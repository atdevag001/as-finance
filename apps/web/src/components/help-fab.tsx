'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { HelpCircle } from 'lucide-react';
import { HELP_TOPICS, helpTopicHref, type HelpTopicId } from '@as-finance/shared';
import { cn } from '@/lib/utils';

type HelpLang = 'en' | 'hi' | 'hinglish';
const STORAGE_KEY = 'help-lang';

/**
 * Path → help topic, ordered by specificity. The first match wins.
 * Anything that isn't on this list shows no FAB — we only want it where stakes are high.
 */
const PATH_TO_TOPIC: Array<{ test: (path: string) => boolean; topic: HelpTopicId }> = [
  { test: (p) => p === '/collections/new', topic: 'COLLECTION_POST' },
  { test: (p) => p === '/collections', topic: 'COLLECTION_POST' },
  { test: (p) => p === '/loans/new', topic: 'LOAN_CREATE' },
  { test: (p) => /^\/loans\/[^/]+$/.test(p), topic: 'LOAN_APPROVE' },
  { test: (p) => p === '/cashbook', topic: 'CASHBOOK_DAY_END' },
  { test: (p) => p === '/cashbook/expenses/new', topic: 'CASHBOOK_EXPENSE' },
  { test: (p) => /^\/groups\/[^/]+\/collect$/.test(p), topic: 'GROUP_COLLECT' },
  { test: (p) => p === '/customers/new', topic: 'CUSTOMER_NEW' },
];

function pickTopic(path: string | null): HelpTopicId | null {
  if (!path) return null;
  for (const { test, topic } of PATH_TO_TOPIC) {
    if (test(path)) return topic;
  }
  return null;
}

function readStoredLang(): HelpLang {
  if (typeof window === 'undefined') return 'en';
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (v === 'hi' || v === 'hinglish' || v === 'en') return v;
  return 'en';
}

/**
 * Floating "?" button that appears on high-stakes pages. Tap → jump to the right help section.
 * On phones it sits above the bottom nav (env safe area aware).
 */
export function HelpFab() {
  const pathname = usePathname();
  const topic = useMemo(() => pickTopic(pathname), [pathname]);
  const [lang, setLang] = useState<HelpLang>('en');

  useEffect(() => {
    setLang(readStoredLang());
  }, []);

  if (!topic) return null;
  if (pathname?.startsWith('/help')) return null;

  return (
    <Link
      href={helpTopicHref(topic, lang)}
      aria-label="Open help for this screen"
      className={cn(
        'fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95',
        // Above the mobile bottom-nav (which uses env(safe-area-inset-bottom)). Plenty of clearance on desktop.
        'bottom-20 lg:bottom-6',
      )}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <HelpCircle className="h-7 w-7" aria-hidden="true" />
    </Link>
  );
}
