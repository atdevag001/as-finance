'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';
import { MoneyDisplay, LoadingSpinner, ErrorMessage } from '@/components/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface DashboardKPIs {
  totalCustomers: number;
  activeLoans: number;
  overdueLoans: number;
  totalOutstandingPaise: number;
  todayCollectionsPaise: number;
  todayDisbursementsPaise: number;
  cashInHandPaise: number;
  pendingApprovals: number;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { data, isLoading, error } = useQuery<DashboardKPIs>({
    queryKey: ['dashboard'],
    queryFn: () => apiClient.get('/dashboard'),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back, {user?.fullName ?? 'User'}.</p>
      </div>

      {isLoading && <div className="flex justify-center py-8"><LoadingSpinner size="lg" /></div>}
      {error && <ErrorMessage message={(error as Error).message} />}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KPICard title="Total Customers" value={String(data.totalCustomers)} href="/customers" />
            <KPICard title="Active Loans" value={String(data.activeLoans)} href="/loans" />
            <KPICard title="Overdue Loans" value={String(data.overdueLoans)} variant="danger" href="/loans" />
            <KPICard title="Pending Approvals" value={String(data.pendingApprovals)} href="/loans" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Outstanding</CardTitle></CardHeader>
              <CardContent><MoneyDisplay paise={data.totalOutstandingPaise} className="text-xl font-semibold" /></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Today&apos;s Collections</CardTitle></CardHeader>
              <CardContent><MoneyDisplay paise={data.todayCollectionsPaise} className="text-xl font-semibold" /></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Cash in Hand</CardTitle></CardHeader>
              <CardContent><MoneyDisplay paise={data.cashInHandPaise} className="text-xl font-semibold" /></CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function KPICard({ title, value, variant, href }: { title: string; value: string; variant?: 'danger'; href: string }) {
  return (
    <Link href={href}>
      <Card className="transition-colors hover:bg-muted/30">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{title}</CardTitle></CardHeader>
        <CardContent>
          <span className={`text-2xl font-bold ${variant === 'danger' ? 'text-destructive' : ''}`}>{value}</span>
        </CardContent>
      </Card>
    </Link>
  );
}
