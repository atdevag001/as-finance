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
interface BalanceSheet {
  assets: LineItem[]; liabilities: LineItem[]; equity: LineItem[];
  totalAssetsPaise: number; totalLiabilitiesPaise: number; totalEquityPaise: number;
}

export default function BalanceSheetPage() {
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10));
  const { data, isLoading, error } = useQuery<BalanceSheet>({
    queryKey: ['balance-sheet', asOfDate],
    queryFn: () => apiClient.get(`/accounting/balance-sheet?asOfDate=${asOfDate}`),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild><Link href="/accounting"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-2xl font-bold">Balance Sheet</h1>
      </div>

      <div className="flex items-end gap-2">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">As of Date</label>
          <Input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} className="w-40" />
        </div>
      </div>

      {isLoading && <div className="flex justify-center py-8"><LoadingSpinner size="lg" /></div>}
      {error && <ErrorMessage message={(error as Error).message} />}

      {data && (
        <div className="grid gap-4 md:grid-cols-2">
          <Section title="Assets" items={data.assets} totalPaise={data.totalAssetsPaise} />
          <div className="space-y-4">
            <Section title="Liabilities" items={data.liabilities} totalPaise={data.totalLiabilitiesPaise} />
            <Section title="Equity" items={data.equity} totalPaise={data.totalEquityPaise} />
            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="flex justify-between font-semibold">
                <span>Liabilities + Equity</span>
                <MoneyDisplay paise={data.totalLiabilitiesPaise + data.totalEquityPaise} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, items, totalPaise }: { title: string; items: { accountName: string; amountPaise: number }[]; totalPaise: number }) {
  return (
    <div className="rounded-lg border">
      <div className="border-b bg-muted/50 px-4 py-3 font-medium">{title}</div>
      <div className="divide-y">
        {items.map((item) => (
          <div key={item.accountName} className="flex justify-between px-4 py-2 text-sm">
            <span>{item.accountName}</span>
            <MoneyDisplay paise={item.amountPaise} />
          </div>
        ))}
        <div className="flex justify-between px-4 py-3 font-semibold">
          <span>Total {title}</span>
          <MoneyDisplay paise={totalPaise} />
        </div>
      </div>
    </div>
  );
}
