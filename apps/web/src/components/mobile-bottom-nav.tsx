'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Banknote, UsersRound, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  href: string;
  icon: typeof Home;
  /** If true, this item triggers an action instead of navigation */
  isAction?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Home', href: '/', icon: Home },
  { label: 'Collect', href: '/collections/new', icon: Banknote },
  { label: 'Groups', href: '/groups', icon: UsersRound },
  { label: 'More', href: '#', icon: Menu, isAction: true },
];

interface MobileBottomNavProps {
  onMoreClick: () => void;
}

export function MobileBottomNav({ onMoreClick }: MobileBottomNavProps) {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Mobile navigation"
    >
      <div className="flex items-center justify-around">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = item.isAction
            ? false
            : pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));

          if (item.isAction) {
            return (
              <button
                key={item.label}
                type="button"
                onClick={onMoreClick}
                className={cn(
                  'flex min-h-[56px] min-w-[64px] flex-1 flex-col items-center justify-center gap-1 px-2 py-2 transition-colors',
                  'text-muted-foreground hover:text-foreground active:bg-accent'
                )}
                aria-label={item.label}
              >
                <Icon className="h-5 w-5" />
                <span className="text-xs font-medium">{item.label}</span>
              </button>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex min-h-[56px] min-w-[64px] flex-1 flex-col items-center justify-center gap-1 px-2 py-2 transition-colors',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground active:bg-accent'
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className={cn('h-5 w-5', isActive && 'fill-primary/20')} />
              <span className={cn('text-xs font-medium', isActive && 'font-semibold')}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
