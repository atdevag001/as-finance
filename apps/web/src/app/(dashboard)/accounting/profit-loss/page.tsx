'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { MoneyDisplay, LoadingSpinner, ErrorMessage } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface LineItem { accountName: string; amountPaise: number; }
interface ProfitAndLoss { income: LineItem[]; expenses: LineItem[]; totalIncomePaise: number; totalExpensesPaise: number; netProfitPaise: number; }

export default function ProfitLossPage() {
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));

  const { data, isLoading, error } = useQuery<ProfitAndLoss>({
    queryKey: ['profit-loss', startDate, endDate],
    queryFn: () => apiClient.get(`/accounting/profit-loss?startDate=${startDate}&endDate=${endDate}`),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild><Link href="/accounting"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-2xl font-bold">Profit & Loss</h1>
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
          <div className="rounded-lg border">
            <div className="border-b bg-muted/50 px-4 py-3 font-medium">Income</div>
            <div className="divide-y">
              {data.income.map((item) => (
                <div key={item.accountName} className="flex justify-between px-4 py-2 text-sm">
                  <span>{item.accountName}</span>
                  <MoneyDisplay paise={item.amountPaise} />
                </div>
              ))}
              <div className="flex justify-between px-4 py-3 font-semibold">
                <span>Total Income</span>
                <MoneyDisplay paise={data.totalIncomePaise} />
              </div>
            </div>
          </div>

          <div className="rounded-lg border">
            <div className="border-b bg-muted/50 px-4 py-3 font-medium">Expenses</div>
            <div className="divide-y">
              {data.expenses.map((item) => (
                <div key={item.accountName} className="flex justify-between px-4 py-2 text-sm">
                  <span>{item.accountName}</span>
                  <MoneyDisplay paise={item.amountPaise} />
                </div>
              ))}
              <div className="flex justify-between px-4 py-3 font-semibold">
                <span>Total Expenses</span>
                <MoneyDisplay paise={data.totalExpensesPaise} />
              </div>
            </div>
          </div>

          <div className="md:col-span-2 rounded-lg border bg-muted/30 p-4">
            <div className="flex justify-between text-lg font-semibold">
              <span>Net {data.netProfitPaise >= 0 ? 'Profit' : 'Loss'}</span>
              <MoneyDisplay paise={data.netProfitPaise} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
