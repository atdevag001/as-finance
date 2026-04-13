'use client';

import Link from 'next/link';
import { FileText, TrendingUp, Wallet, AlertCircle, CalendarCheck, PieChart } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AccessDenied } from '@/components/shared';
import { useAuth } from '@/providers/auth-provider';
import { hasPermission } from '@/lib/permissions';

const REPORT_TYPES = [
  { type: 'collection-summary', label: 'Collection Summary', description: 'Daily and periodic collection totals', icon: Wallet },
  { type: 'outstanding', label: 'Outstanding', description: 'Current outstanding balances across loans', icon: TrendingUp },
  { type: 'disbursement', label: 'Disbursement', description: 'Disbursement activity and amounts', icon: FileText },
  { type: 'overdue', label: 'Overdue', description: 'Overdue loans and aging analysis', icon: AlertCircle },
  { type: 'demand', label: 'Demand', description: 'Upcoming demand and due amounts', icon: CalendarCheck },
  { type: 'portfolio', label: 'Portfolio', description: 'Portfolio composition and health', icon: PieChart },
] as const;

export default function ReportsPage() {
  const { user } = useAuth();
  const role = user?.role ?? '';

  if (!hasPermission(role, 'report.read')) {
    return <AccessDenied />;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Reports</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORT_TYPES.map(({ type, label, description, icon: Icon }) => (
          <Link key={type} href={`/reports/${type}`}>
            <Card className="transition-colors hover:bg-muted/50 active:bg-accent cursor-pointer h-full min-h-[100px]">
              <CardHeader className="flex flex-row items-center gap-3 pb-2">
                <Icon className="h-6 w-6 text-muted-foreground" />
                <CardTitle className="text-base">{label}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
