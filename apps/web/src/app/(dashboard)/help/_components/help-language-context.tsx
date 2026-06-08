'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { HELP_LANGS, HELP_LANG_HTML_TAG, type HelpLang } from '../_content/_types';

type HelpLangContextValue = {
  lang: HelpLang;
  setLang: (lang: HelpLang) => void;
};

const HelpLangContext = createContext<HelpLangContextValue | null>(null);

const STORAGE_KEY = 'help-lang';

function isHelpLang(value: unknown): value is HelpLang {
  return typeof value === 'string' && (HELP_LANGS as string[]).includes(value);
}

function resolveInitialLang(urlLang: string | null): HelpLang {
  if (isHelpLang(urlLang)) return urlLang;
  if (typeof window !== 'undefined') {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isHelpLang(stored)) return stored;
  }
  return 'en';
}

export function HelpLangProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlLang = searchParams.get('lang');

  const [lang, setLangState] = useState<HelpLang>(() => resolveInitialLang(urlLang));

  useEffect(() => {
    if (isHelpLang(urlLang) && urlLang !== lang) {
      setLangState(urlLang);
    }
  }, [urlLang, lang]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.lang = HELP_LANG_HTML_TAG[lang];
  }, [lang]);

  const setLang = useCallback(
    (next: HelpLang) => {
      setLangState(next);
      const params = new URLSearchParams(searchParams.toString());
      params.set('lang', next);
      const hash = typeof window !== 'undefined' ? window.location.hash : '';
      router.replace(`?${params.toString()}${hash}`, { scroll: false });
    },
    [router, searchParams],
  );

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);

  return <HelpLangContext.Provider value={value}>{children}</HelpLangContext.Provider>;
}

export function useHelpLang(): HelpLangContextValue {
  const ctx = useContext(HelpLangContext);
  if (!ctx) {
    throw new Error('useHelpLang must be used inside <HelpLangProvider>');
  }
  return ctx;
}
