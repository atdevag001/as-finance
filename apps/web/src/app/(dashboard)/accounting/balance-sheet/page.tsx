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

  const totalAssets = data?.assets.reduce((sum, a) => sum + a.totalPaise, 0) ?? 0;
  const totalLiabilities = data?.liabilities.reduce((sum, l) => sum + l.totalPaise, 0) ?? 0;
  const totalEquity = data?.equity.reduce((sum, e) => sum + e.totalPaise, 0) ?? 0;

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
        <div className="grid gap-4 md:grid-cols-3">
          <SectionCard title="Assets" items={data.assets} total={totalAssets} />
          <SectionCard title="Liabilities" items={data.liabilities} total={totalLiabilities} />
          <SectionCard title="Equity" items={data.equity} total={totalEquity} />
        </div>
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
