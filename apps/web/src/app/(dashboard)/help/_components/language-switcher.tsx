'use client';

import { Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { HELP_LANGS, HELP_LANG_LABEL, type HelpLang } from '../_content/_types';
import { useHelpLang } from './help-language-context';

export function LanguageSwitcher({ className }: { className?: string }) {
  const { lang, setLang } = useHelpLang();

  return (
    <div
      role="group"
      aria-label="Help language"
      className={cn('inline-flex items-center gap-1 rounded-md border bg-background p-1', className)}
    >
      <Globe className="ml-1 h-4 w-4 text-muted-foreground" aria-hidden="true" />
      {HELP_LANGS.map((code) => {
        const isActive = code === lang;
        return (
          <button
            key={code}
            type="button"
            onClick={() => setLang(code)}
            aria-pressed={isActive}
            className={cn(
              'rounded px-3 py-1.5 text-sm font-medium transition-colors min-h-[36px]',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            {HELP_LANG_LABEL[code as HelpLang]}
          </button>
        );
      })}
    </div>
  );
}
