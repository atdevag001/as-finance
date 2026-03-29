'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { MoneyDisplay, LoadingSpinner, ErrorMessage } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface CashbookSummary {
  date: string;
  openingBalancePaise: string;
  cashInflowsPaise: string;
  cashOutflowsPaise: string;
  closingBalancePaise: string;
  hasDiscrepancy: boolean;
  transactionCount: number;
}

export default function CashbookPage() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const { data, isLoading, error } = useQuery<CashbookSummary>({
    queryKey: ['cashbook', date],
    queryFn: () => apiClient.get(`/cashbook/daily-summary?date=${date}`),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Cashbook</h1>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm"><Link href="/cashbook/expenses/new">Record Expense</Link></Button>
          <Button asChild variant="outline" size="sm"><Link href="/cashbook/handovers">Handovers</Link></Button>
        </div>
      </div>

      <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />

      {isLoading && <div className="flex justify-center py-8"><LoadingSpinner size="lg" /></div>}
      {error && <ErrorMessage message={(error as Error).message} />}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard title="Opening" paise={Number(data.openingBalancePaise)} />
            <SummaryCard title="Inflows" paise={Number(data.cashInflowsPaise)} />
            <SummaryCard title="Outflows" paise={Number(data.cashOutflowsPaise)} />
            <SummaryCard title="Closing" paise={Number(data.closingBalancePaise)} />
          </div>

          <div className="rounded-lg border p-4 text-sm text-muted-foreground">
            {data.transactionCount} transaction(s) on {data.date}
            {data.hasDiscrepancy && (
              <span className="ml-2 text-destructive font-medium">⚠ Discrepancy detected</span>
            )}
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
