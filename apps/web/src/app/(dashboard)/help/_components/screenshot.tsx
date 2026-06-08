'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ZoomIn, X } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { ScreenshotRef } from '../_content/_types';

export function Screenshot({
  shot,
  width = 1280,
  height = 800,
  className,
}: {
  shot: ScreenshotRef;
  width?: number;
  height?: number;
  className?: string;
}) {
  const [zoom, setZoom] = useState(false);

  if (!shot.alt) {
    // Caught at build time would be better; this is the runtime safety net.
    throw new Error(`Screenshot is missing alt text: ${shot.src}`);
  }

  return (
    <figure className={cn('my-4', className)}>
      <button
        type="button"
        onClick={() => setZoom(true)}
        className="group relative block w-full overflow-hidden rounded-lg border bg-muted transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Open larger view: ${shot.alt}`}
      >
        <Image
          src={shot.src}
          alt={shot.alt}
          width={width}
          height={height}
          loading="lazy"
          sizes="(max-width: 768px) 100vw, 800px"
          className="h-auto w-full"
        />
        <span className="pointer-events-none absolute right-2 top-2 rounded bg-black/60 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100">
          <ZoomIn className="h-4 w-4" aria-hidden="true" />
        </span>
      </button>
      {shot.caption ? (
        <figcaption className="mt-2 text-sm text-muted-foreground">{shot.caption}</figcaption>
      ) : null}

      <Dialog open={zoom} onOpenChange={setZoom}>
        <DialogContent className="max-w-[95vw] p-2 sm:max-w-[90vw]">
          <Image
            src={shot.src}
            alt={shot.alt}
            width={width * 2}
            height={height * 2}
            className="h-auto w-full"
            sizes="95vw"
          />
          {shot.caption ? (
            <p className="mt-2 text-center text-sm text-muted-foreground">{shot.caption}</p>
          ) : null}
        </DialogContent>
      </Dialog>
    </figure>
  );
}
