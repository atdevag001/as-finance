'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { MoneyDisplay, LoadingSpinner, ErrorMessage } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface TrialBalanceRow { accountCode: string; accountName: string; debitBalancePaise: number; creditBalancePaise: number; }
interface TrialBalance { rows: TrialBalanceRow[]; totalDebitPaise: number; totalCreditPaise: number; }

export default function TrialBalancePage() {
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10));
  const { data, isLoading, error } = useQuery<TrialBalance>({
    queryKey: ['trial-balance', asOfDate],
    queryFn: () => apiClient.get(`/accounting/trial-balance?asOfDate=${asOfDate}`),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild><Link href="/accounting"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-2xl font-bold">Trial Balance</h1>
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
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Code</th>
                <th className="px-4 py-3 text-left font-medium">Account</th>
                <th className="px-4 py-3 text-right font-medium">Debit</th>
                <th className="px-4 py-3 text-right font-medium">Credit</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.accountCode} className="border-b last:border-0">
                  <td className="px-4 py-3 font-mono">{r.accountCode}</td>
                  <td className="px-4 py-3">{r.accountName}</td>
                  <td className="px-4 py-3 text-right">{r.debitBalancePaise > 0 ? <MoneyDisplay paise={r.debitBalancePaise} /> : ''}</td>
                  <td className="px-4 py-3 text-right">{r.creditBalancePaise > 0 ? <MoneyDisplay paise={r.creditBalancePaise} /> : ''}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t bg-muted/30 font-semibold">
              <tr>
                <td colSpan={2} className="px-4 py-3">Total</td>
                <td className="px-4 py-3 text-right"><MoneyDisplay paise={data.totalDebitPaise} /></td>
                <td className="px-4 py-3 text-right"><MoneyDisplay paise={data.totalCreditPaise} /></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
