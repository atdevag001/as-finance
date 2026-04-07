'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/providers/auth-provider';
import { useDashboard } from '@/hooks/useDashboard';
import { MoneyDisplay, LoadingSpinner, ErrorMessage } from '@/components/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SidebarNav } from '@/components/sidebar-nav';
import { Button } from '@/components/ui/button';
import { Menu, X, LogOut } from 'lucide-react';
import { useState } from 'react';

/**
 * Root page — shows dashboard KPIs for authenticated users,
 * redirects unauthenticated users to login.
 */
export default function HomePage() {
  const { user, isAuthenticated, isLoading: authLoading, logout } = useAuth();
  const { data, isLoading: dataLoading, error } = useDashboard();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, authLoading, router]);

  if (authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <LoadingSpinner size="lg" />
      </main>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  async function handleLogout() {
    await logout();
    router.replace('/login');
  }

  return (
    <div className="flex min-h-screen">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-background transition-transform lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-14 items-center justify-between border-b px-4">
          <span className="text-sm font-semibold">AS Finance LMS</span>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <SidebarNav />
        </div>

        {/* User info + logout */}
        <div className="border-t p-4">
          <div className="mb-2 text-xs text-muted-foreground">
            <p className="truncate font-medium text-foreground">{user?.fullName}</p>
            <p className="capitalize">{user?.role?.replace(/_/g, ' ')}</p>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col">
        {/* Top bar (mobile) */}
        <header className="flex h-14 items-center gap-4 border-b px-4 lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <span className="text-sm font-semibold">AS Finance LMS</span>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold">Dashboard</h1>
              <p className="text-muted-foreground">Welcome back, {user?.fullName ?? 'User'}.</p>
            </div>

            {dataLoading && (
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
                  <Link href="/collections">
                    <Card className="transition-colors hover:bg-muted/30 col-span-2 lg:col-span-1">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-muted-foreground">Cash in Hand</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <MoneyDisplay paise={data.cashInHandPaise} className="text-xl font-semibold" />
                      </CardContent>
                    </Card>
                  </Link>
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function KPICard({ title, value, variant, href }: { title: string; value: string; variant?: 'danger'; href: string }) {
  return (
    <Link href={href}>
      <Card className={`transition-colors hover:bg-muted/30 ${variant === 'danger' ? 'border-destructive' : ''}`}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <span className={`text-2xl font-bold ${variant === 'danger' ? 'text-destructive' : ''}`}>{value}</span>
        </CardContent>
      </Card>
    </Link>
  );
}
