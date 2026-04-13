'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';

export interface CardField {
  /** Label for the field (shown on left or as context) */
  label?: string;
  /** Value to display */
  value: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
}

export interface MobileCardItem {
  /** Unique identifier */
  id: string;
  /** Primary title (large, top-left) */
  title: React.ReactNode;
  /** Subtitle (below title, smaller) */
  subtitle?: React.ReactNode;
  /** Value on the right side (e.g., amount) */
  rightValue?: React.ReactNode;
  /** Status badge or tag */
  badge?: React.ReactNode;
  /** Secondary info row (bottom of card) */
  secondaryInfo?: React.ReactNode;
  /** Link to navigate when card is tapped */
  href?: string;
  /** Click handler (if no href) */
  onClick?: () => void;
  /** Additional action button */
  action?: React.ReactNode;
}

interface MobileCardListProps {
  items: MobileCardItem[];
  /** Empty state message */
  emptyMessage?: string;
  /** Additional CSS classes for the container */
  className?: string;
}

export function MobileCardList({ items, emptyMessage = 'No items found.', className }: MobileCardListProps) {
  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {items.map((item) => (
        <MobileCard key={item.id} item={item} />
      ))}
    </div>
  );
}

function MobileCard({ item }: { item: MobileCardItem }) {
  const content = (
    <div className="rounded-lg border bg-card p-4 shadow-sm transition-colors hover:bg-accent/50 active:bg-accent">
      {/* Top row: Title and Right Value */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground">{item.title}</div>
          {item.subtitle && (
            <div className="mt-0.5 truncate text-sm text-muted-foreground">{item.subtitle}</div>
          )}
        </div>
        {item.rightValue && (
          <div className="shrink-0 text-right text-sm font-medium">{item.rightValue}</div>
        )}
      </div>

      {/* Bottom row: Badge, Secondary Info, Action */}
      {(item.badge || item.secondaryInfo || item.action) && (
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {item.badge}
            {item.secondaryInfo && (
              <span className="text-xs text-muted-foreground">{item.secondaryInfo}</span>
            )}
          </div>
          {item.action && <div onClick={(e) => e.stopPropagation()}>{item.action}</div>}
        </div>
      )}
    </div>
  );

  if (item.href) {
    return (
      <Link href={item.href} className="block">
        {content}
      </Link>
    );
  }

  if (item.onClick) {
    return (
      <button type="button" onClick={item.onClick} className="block w-full text-left">
        {content}
      </button>
    );
  }

  return content;
}

/**
 * Helper component to create a tappable phone number
 */
export function TappablePhone({ phone, className }: { phone: string; className?: string }) {
  return (
    <a
      href={`tel:${phone}`}
      className={cn('text-primary hover:underline', className)}
      onClick={(e) => e.stopPropagation()}
    >
      {phone}
    </a>
  );
}
