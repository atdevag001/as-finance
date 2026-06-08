'use client';

import { useState } from 'react';
import { Link as LinkIcon, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function CopyLinkButton({
  anchor,
  className,
  label = 'Copy link',
}: {
  anchor: string;
  className?: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    if (typeof window === 'undefined') return;
    const url = `${window.location.origin}${window.location.pathname}${window.location.search}#${anchor}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API can fail in insecure contexts — silently degrade.
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handleClick}
      className={cn('h-auto gap-1 px-2 py-1 text-xs text-muted-foreground', className)}
      aria-label={copied ? 'Link copied' : label}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <LinkIcon className="h-3.5 w-3.5" />}
      <span className="hidden sm:inline">{copied ? 'Copied' : label}</span>
    </Button>
  );
}
