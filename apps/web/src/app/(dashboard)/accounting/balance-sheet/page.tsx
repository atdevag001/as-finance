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
import { useBalanceSheet } from '@/hooks/useAccounting';
import { todayIST } from '@/lib/date-utils';

export default function BalanceSheetPage() {
  const { user } = useAuth();
  const role = user?.role ?? '';

  if (!hasPermission(role, 'accounting.read')) {
    return <AccessDenied />;
  }

  return <BalanceSheetContent />;
}

function BalanceSheetContent() {
  const today = todayIST();
  const [endDate, setEndDate] = useState(today);

  const { data, isLoading, error } = useBalanceSheet({ endDate });

  // Trust backend-computed totals so retained earnings (P&L impact) is included.
  const totalAssets = data?.totalAssetsPaise ?? 0;
  const totalLiabilities = data?.totalLiabilitiesPaise ?? 0;
  const totalEquityWithRetained = (data?.totalEquityPaise ?? 0) + (data?.retainedEarningsPaise ?? 0);
  const equityItems = data
    ? [...data.equity, { name: 'Retained Earnings', totalPaise: data.retainedEarningsPaise }]
    : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm"><Link href="/accounting"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-2xl font-bold">Balance Sheet</h1>
      </div>

      <div className="flex gap-2 items-end">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">As of</label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
        </div>
      </div>

      {isLoading && <div className="flex justify-center py-8"><LoadingSpinner size="lg" /></div>}
      {error && <ErrorMessage message={(error as Error).message} />}

      {data && (
        <>
          <div
            className={`rounded-md border px-3 py-2 text-sm ${
              data.isBalanced
                ? 'border-green-300 bg-green-50 text-green-800'
                : 'border-red-300 bg-red-50 text-red-800'
            }`}
          >
            {data.isBalanced
              ? 'Balanced: Assets = Liabilities + Equity + Retained Earnings'
              : 'Imbalanced: Assets do not equal Liabilities + Equity + Retained Earnings'}
            <span className="ml-2 text-xs">
              (A: <MoneyDisplay paise={data.totalAssetsPaise} /> vs L+E+RE: <MoneyDisplay paise={data.totalLiabilitiesAndEquityPaise} />)
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <SectionCard title="Assets" items={data.assets} total={totalAssets} />
            <SectionCard title="Liabilities" items={data.liabilities} total={totalLiabilities} />
            <SectionCard title="Equity" items={equityItems} total={totalEquityWithRetained} />
          </div>
        </>
      )}
    </div>
  );
}

function SectionCard({ title, items, total }: { title: string; items: { name: string; totalPaise: number }[]; total: number }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {items.map((item) => (
          <div key={item.name} className="flex justify-between text-sm">
            <span>{item.name}</span>
            <MoneyDisplay paise={item.totalPaise} />
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-muted-foreground">No entries.</p>}
        <div className="border-t pt-2 flex justify-between font-semibold">
          <span>Total {title}</span>
          <MoneyDisplay paise={total} />
        </div>
      </CardContent>
    </Card>
  );
}
