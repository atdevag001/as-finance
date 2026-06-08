import { notFound } from 'next/navigation';
import { ALL_CHAPTERS } from '../_content';
import { HelpChapter } from '../_components/help-chapter';

/**
 * Catch-all for `/help/<anything>` that isn't matched by a specific chapter route.
 *
 * Why this exists: Next.js renders the nearest `not-found.tsx` only when a request
 * resolves into the route segment AND something calls notFound(). Without this catch-all,
 * `/help/typo` falls through to the global 404 instead of our friendly help/not-found.tsx.
 *
 * We also accept legitimate chapter ids here, so a future chapter added to ALL_CHAPTERS
 * starts rendering immediately — the explicit per-chapter page.tsx files keep handing off
 * to this one as the safety net.
 */
export default function HelpCatchAllPage({ params }: { params: { slug: string[] } }) {
  const segments = params.slug ?? [];
  if (segments.length === 1) {
    const chapter = ALL_CHAPTERS[segments[0]!];
    if (chapter) return <HelpChapter chapter={chapter} />;
  }
  notFound();
}

export const dynamicParams = true;
