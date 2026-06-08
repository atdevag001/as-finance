'use client';

import { useState } from 'react';
import { ThumbsUp, ThumbsDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type { HelpLang } from '../_content/_types';

const LABEL: Record<HelpLang, { question: string; thanks: string; yes: string; no: string }> = {
  en: { question: 'Was this section helpful?', thanks: 'Thanks for the feedback!', yes: 'Yes', no: 'No' },
  hi: { question: 'क्या यह सेक्शन काम का था?', thanks: 'फीडबैक के लिए धन्यवाद!', yes: 'हाँ', no: 'नहीं' },
  hinglish: {
    question: 'Ye section helpful tha?',
    thanks: 'Feedback ke liye thanks!',
    yes: 'Haan',
    no: 'Nahi',
  },
};

export function Feedback({
  chapter,
  sectionId,
  lang,
  className,
}: {
  chapter: string;
  sectionId: string;
  lang: HelpLang;
  className?: string;
}) {
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit(vote: 'up' | 'down') {
    if (submitted || pending) return;
    setPending(true);
    try {
      await apiClient.post('/help/feedback', { chapter, sectionId, lang, vote });
    } catch {
      // Feedback is best-effort; never block the reader.
    } finally {
      setSubmitted(true);
      setPending(false);
    }
  }

  const t = LABEL[lang];

  if (submitted) {
    return (
      <div className={cn('mt-4 flex items-center gap-2 text-sm text-muted-foreground', className)}>
        <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" />
        <span>{t.thanks}</span>
      </div>
    );
  }

  return (
    <div className={cn('mt-4 flex flex-wrap items-center gap-3 text-sm', className)}>
      <span className="text-muted-foreground">{t.question}</span>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => submit('up')} disabled={pending}>
          <ThumbsUp className="mr-1.5 h-4 w-4" aria-hidden="true" /> {t.yes}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => submit('down')} disabled={pending}>
          <ThumbsDown className="mr-1.5 h-4 w-4" aria-hidden="true" /> {t.no}
        </Button>
      </div>
    </div>
  );
}
