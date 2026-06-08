'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Users,
  FileText,
  Banknote,
  Receipt,
  BookOpen,
  BarChart3,
  Settings,
  Shield,
  UserCog,
  UsersRound,
  Wallet,
  Bell,
  Package,
  HelpCircle,
  Database,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { PERMISSIONS } from '@as-finance/shared/constants';

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Permission key — item is visible if user's role is in the allowed list */
  permission: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Customers', href: '/customers', icon: Users, permission: 'customer.read' },
  { label: 'Loans', href: '/loans', icon: FileText, permission: 'loan.read' },
  { label: 'Loan Products', href: '/loan-products', icon: Package, permission: 'loan_product.read' },
  { label: 'Collections', href: '/collections', icon: Banknote, permission: 'collection.read' },
  { label: 'Receipts', href: '/receipts', icon: Receipt, permission: 'receipt.read' },
  { label: 'Groups', href: '/groups', icon: UsersRound, permission: 'group.read' },
  { label: 'Accounting', href: '/accounting', icon: BookOpen, permission: 'accounting.read' },
  { label: 'Cashbook', href: '/cashbook', icon: Wallet, permission: 'accounting.manage_cashbook' },
  { label: 'Reports', href: '/reports', icon: BarChart3, permission: 'report.read' },
  { label: 'Notifications', href: '/notifications', icon: Bell, permission: 'notification.read' },
  { label: 'Users', href: '/users', icon: UserCog, permission: 'user.read' },
  { label: 'Audit Logs', href: '/audit', icon: Shield, permission: 'audit.read' },
  { label: 'Settings', href: '/settings', icon: Settings, permission: 'settings.read' },
  { label: 'Data Migration', href: '/data-migration', icon: Database, permission: 'migration.run' },
  { label: 'Help', href: '/help', icon: HelpCircle, permission: 'help.read' },
];

function hasPermission(role: string, permission: string): boolean {
  const allowed = PERMISSIONS[permission];
  if (!allowed) return false;
  return (allowed as readonly string[]).includes(role);
}

export function SidebarNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const role = user?.role ?? '';

  const visibleItems = NAV_ITEMS.filter((item) => hasPermission(role, item.permission));

  return (
    <nav className="flex flex-col gap-1 px-2 py-4" aria-label="Main navigation">
      {visibleItems.map((item) => {
        const isActive = pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition-colors min-h-[44px]',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground active:bg-accent/80',
            )}
            aria-current={isActive ? 'page' : undefined}
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
