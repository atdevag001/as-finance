'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { MoneyDisplay, LoadingSpinner, ErrorMessage, AccessDenied } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/providers/auth-provider';
import { hasPermission } from '@/lib/permissions';
import { useTrialBalance } from '@/hooks/useAccounting';
import { todayIST } from '@/lib/date-utils';

export default function TrialBalancePage() {
  const { user } = useAuth();
  const role = user?.role ?? '';

  if (!hasPermission(role, 'accounting.read')) {
    return <AccessDenied />;
  }

  return <TrialBalanceContent />;
}

function TrialBalanceContent() {
  const today = todayIST();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);

  const { data, isLoading, error } = useTrialBalance({ startDate, endDate });

  const totalDebit = data?.reduce((sum, r) => sum + r.debitPaise, 0) ?? 0;
  const totalCredit = data?.reduce((sum, r) => sum + r.creditPaise, 0) ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm"><Link href="/accounting"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-2xl font-bold">Trial Balance</h1>
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
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Account</th>
                <th className="px-4 py-3 text-right font-medium">Debit</th>
                <th className="px-4 py-3 text-right font-medium">Credit</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.accountCode} className="border-b last:border-0">
                  <td className="px-4 py-3">{row.accountName}</td>
                  <td className="px-4 py-3 text-right"><MoneyDisplay paise={row.debitPaise} /></td>
                  <td className="px-4 py-3 text-right"><MoneyDisplay paise={row.creditPaise} /></td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">No data for this period.</td></tr>
              )}
            </tbody>
            {data.length > 0 && (
              <tfoot className="border-t bg-muted/50 font-semibold">
                <tr>
                  <td className="px-4 py-3">Total</td>
                  <td className="px-4 py-3 text-right"><MoneyDisplay paise={totalDebit} /></td>
                  <td className="px-4 py-3 text-right"><MoneyDisplay paise={totalCredit} /></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
