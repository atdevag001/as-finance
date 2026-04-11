'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { MoneyDisplay, LoadingSpinner, ErrorMessage, AccessDenied } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/providers/auth-provider';
import { hasPermission } from '@/lib/permissions';
import { useProfitLoss } from '@/hooks/useAccounting';
import { todayIST } from '@/lib/date-utils';

export default function ProfitLossPage() {
  const { user } = useAuth();
  const role = user?.role ?? '';

  if (!hasPermission(role, 'accounting.read')) {
    return <AccessDenied />;
  }

  return <ProfitLossContent />;
}

function ProfitLossContent() {
  const today = todayIST();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);

  const { data, isLoading, error } = useProfitLoss({ startDate, endDate });

  const totalIncome = data?.income.reduce((sum, i) => sum + i.totalPaise, 0) ?? 0;
  const totalExpenses = data?.expenses.reduce((sum, e) => sum + e.totalPaise, 0) ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm"><Link href="/accounting"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-2xl font-bold">Profit &amp; Loss</h1>
      </div>

      <div className="flex gap-2 items-end">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">From</label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">To</label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
        </div>
      </div>

      {isLoading && <div className="flex justify-center py-8"><LoadingSpinner size="lg" /></div>}
      {error && <ErrorMessage message={(error as Error).message} />}

      {data && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-green-700">Income</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {data.income.map((item, idx) => (
                <div key={item.category ?? idx} className="flex justify-between text-sm">
                  <span className="capitalize">{(item.category ?? 'Other').replace(/_/g, ' ')}</span>
                  <MoneyDisplay paise={item.totalPaise} />
                </div>
              ))}
              {data.income.length === 0 && <p className="text-sm text-muted-foreground">No income entries.</p>}
              <div className="border-t pt-2 flex justify-between font-semibold">
                <span>Total Income</span>
                <MoneyDisplay paise={totalIncome} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-red-700">Expenses</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {data.expenses.map((item, idx) => (
                <div key={item.category ?? idx} className="flex justify-between text-sm">
                  <span className="capitalize">{(item.category ?? 'Other').replace(/_/g, ' ')}</span>
                  <MoneyDisplay paise={item.totalPaise} />
                </div>
              ))}
              {data.expenses.length === 0 && <p className="text-sm text-muted-foreground">No expense entries.</p>}
              <div className="border-t pt-2 flex justify-between font-semibold">
                <span>Total Expenses</span>
                <MoneyDisplay paise={totalExpenses} />
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardContent className="pt-6">
              <div className="flex justify-between text-lg font-bold">
                <span>Net Profit</span>
                <MoneyDisplay paise={data.netProfitPaise} />
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
