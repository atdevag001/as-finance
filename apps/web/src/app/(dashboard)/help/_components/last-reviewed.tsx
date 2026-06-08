import { cn } from '@/lib/utils';
import type { ChapterMeta } from '../_content/_types';

const STALE_AFTER_DAYS = 180;

const DATE_LABEL: Record<'en' | 'hi' | 'hinglish', string> = {
  en: 'Last reviewed',
  hi: 'अंतिम समीक्षा',
  hinglish: 'Last reviewed',
};

const STALE_BANNER: Record<'en' | 'hi' | 'hinglish', string> = {
  en: 'This chapter was last reviewed more than 6 months ago. The app may have changed since — check with your manager if something looks off.',
  hi: 'इस अध्याय की समीक्षा 6 महीने से अधिक पहले हुई थी। तब से ऐप में बदलाव हो सकते हैं — अगर कुछ अलग दिखे तो अपने मैनेजर से पूछें।',
  hinglish:
    'Is chapter ki review 6 mahine se zyada pehle hui thi. App mein kuch change ho sakta hai — agar kuch alag lage to manager se confirm kar lo.',
};

/** Compares the ISO date string against today. No Date.now() to keep workflow-resumable. */
function daysSince(iso: string): number {
  // We accept a small loss of precision (ms→days) and let the comparison be deterministic
  // by floor-dividing against ms-per-day on Date objects that we don't compare with "now"
  // in business logic. For rendering only.
  if (typeof window === 'undefined' && typeof globalThis.Date === 'undefined') return 0;
  const now = new Date();
  const then = new Date(iso);
  const ms = now.getTime() - then.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export function LastReviewed({
  meta,
  lang,
}: {
  meta: ChapterMeta;
  lang: 'en' | 'hi' | 'hinglish';
}) {
  const stale = daysSince(meta.lastReviewed) > STALE_AFTER_DAYS;

  return (
    <div className="mt-12 space-y-3 border-t pt-4 text-xs text-muted-foreground">
      {stale ? (
        <div
          role="alert"
          className={cn(
            'rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900',
            'dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100',
          )}
        >
          {STALE_BANNER[lang]}
        </div>
      ) : null}
      <p>
        {DATE_LABEL[lang]}: <time dateTime={meta.lastReviewed}>{meta.lastReviewed}</time>
        {meta.reviewedBy ? ` · ${meta.reviewedBy}` : null}
        {meta.appVersion ? ` · v${meta.appVersion}` : null}
      </p>
    </div>
  );
}
