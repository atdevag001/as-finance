'use client';

import Link from 'next/link';
import { Banknote, Search, Users } from 'lucide-react';
import { useDashboard } from '@/hooks/useDashboard';
import { useAuth } from '@/providers/auth-provider';
import { AccessDenied, MoneyDisplay, LoadingSpinner, ErrorMessage } from '@/components/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { hasPermission } from '@/lib/permissions';

export default function DashboardPage() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const role = user?.role ?? '';

  if (isAuthLoading) {
    return (
      <div className="flex justify-center py-8">
        <LoadingSpinner size="lg" />
      </div>
    );
  }
  if (!hasPermission(role, 'dashboard.read')) {
    return <AccessDenied />;
  }

  return <DashboardPageContent />;
}

function DashboardPageContent() {
  const { user } = useAuth();
  const { data, isLoading, error } = useDashboard();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back, {user?.fullName ?? 'User'}.</p>
      </div>

      {/* Quick Actions - Mobile optimized */}
      <div className="grid grid-cols-3 gap-3 lg:hidden">
        <Button asChild variant="outline" className="flex h-auto flex-col gap-2 py-4">
          <Link href="/collections/new">
            <Banknote className="h-6 w-6 text-primary" />
            <span className="text-xs font-medium">Post Collection</span>
          </Link>
        </Button>
        <Button asChild variant="outline" className="flex h-auto flex-col gap-2 py-4">
          <Link href="/customers">
            <Search className="h-6 w-6 text-primary" />
            <span className="text-xs font-medium">Find Customer</span>
          </Link>
        </Button>
        <Button asChild variant="outline" className="flex h-auto flex-col gap-2 py-4">
          <Link href="/groups">
            <Users className="h-6 w-6 text-primary" />
            <span className="text-xs font-medium">Groups</span>
          </Link>
        </Button>
      </div>

      {isLoading && (
        <div className="flex justify-center py-8">
          <LoadingSpinner size="lg" />
        </div>
      )}
      {error && <ErrorMessage message={(error as Error).message} />}

      {data && (
        <>
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <KPICard title="Total Customers" value={String(data.totalCustomers)} href="/customers" />
            <KPICard title="Active Loans" value={String(data.activeLoans)} href="/loans" />
            <KPICard
              title="Overdue Loans"
              value={String(data.overdueLoans)}
              variant={data.overdueLoans > 0 ? 'danger' : undefined}
              href="/loans?status=overdue"
            />
            <KPICard title="Pending Approvals" value={String(data.pendingApprovals)} href="/loans?status=submitted" />
          </div>

          <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
            <Link href="/loans">
              <Card className="transition-colors hover:bg-muted/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">Total Outstanding</CardTitle>
                </CardHeader>
                <CardContent>
                  <MoneyDisplay paise={data.totalOutstandingPaise} className="text-xl font-semibold" />
                </CardContent>
              </Card>
            </Link>
            <Link href="/collections">
              <Card className="transition-colors hover:bg-muted/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">Today&apos;s Collections</CardTitle>
                </CardHeader>
                <CardContent>
                  <MoneyDisplay paise={data.todayCollectionsPaise} className="text-xl font-semibold" />
                </CardContent>
              </Card>
            </Link>
            <Link href="/loans">
              <Card className="transition-colors hover:bg-muted/30 col-span-2 lg:col-span-1">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">Today&apos;s Disbursements</CardTitle>
                </CardHeader>
                <CardContent>
                  <MoneyDisplay paise={data.todayDisbursementsPaise} className="text-xl font-semibold" />
                </CardContent>
              </Card>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function KPICard({ title, value, variant, href }: { title: string; value: string; variant?: 'danger'; href: string }) {
  return (
    <Link href={href}>
      <Card className={`min-h-[100px] transition-colors hover:bg-muted/30 active:bg-accent ${variant === 'danger' ? 'border-destructive' : ''}`}>
        <CardHeader className="pb-2 px-3 pt-3 lg:px-6 lg:pt-6">
          <CardTitle className="text-xs lg:text-sm text-muted-foreground">{title}</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 lg:px-6 lg:pb-6">
          <span className={`text-2xl lg:text-3xl font-bold ${variant === 'danger' ? 'text-destructive' : ''}`}>{value}</span>
        </CardContent>
      </Card>
    </Link>
  );
}
