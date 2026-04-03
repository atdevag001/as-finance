'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { MoneyDisplay, LoadingSpinner, ErrorMessage, AccessDenied } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/providers/auth-provider';
import { hasPermission } from '@/lib/permissions';
import { useDailySummary } from '@/hooks/useCashbook';
import { todayIST } from '@/lib/date-utils';

export default function CashbookPage() {
  const { user } = useAuth();
  const role = user?.role ?? '';

  if (!hasPermission(role, 'accounting.manage_cashbook')) {
    return <AccessDenied />;
  }

  return <CashbookContent />;
}

function CashbookContent() {
  const [date, setDate] = useState(todayIST);

  const { data, isLoading, error } = useDailySummary(date);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Cashbook</h1>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm"><Link href="/cashbook/expenses/new">Record Expense</Link></Button>
          <Button asChild variant="outline" size="sm"><Link href="/cashbook/handovers">Handovers</Link></Button>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Date</label>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
      </div>

      {isLoading && <div className="flex justify-center py-8"><LoadingSpinner size="lg" /></div>}
      {error && <ErrorMessage message={(error as Error).message} />}

      {data && (
        <>
          {data.hasDiscrepancy && (
            <div role="alert" className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive font-medium">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>Discrepancy detected — closing balance does not match expected value.</span>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard title="Opening Balance" paise={Number(data.openingBalancePaise)} />
            <SummaryCard title="Cash Inflows" paise={Number(data.cashInflowsPaise)} />
            <SummaryCard title="Cash Outflows" paise={Number(data.cashOutflowsPaise)} />
            <SummaryCard title="Closing Balance" paise={Number(data.closingBalancePaise)} />
          </div>

          <div className="rounded-lg border p-4 text-sm text-muted-foreground">
            {data.transactionCount} transaction(s) on {data.date}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({ title, paise }: { title: string; paise: number }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{title}</CardTitle></CardHeader>
      <CardContent><MoneyDisplay paise={paise} className="text-lg font-semibold" /></CardContent>
    </Card>
  );
}
