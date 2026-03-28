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
  openingBalancePaise: number;
  totalCollectionsPaise: number;
  totalDisbursementsPaise: number;
  totalExpensesPaise: number;
  closingBalancePaise: number;
  transactions: { id: string; type: string; description: string; amountPaise: number; time: string }[];
}

export default function CashbookPage() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const { data, isLoading, error } = useQuery<CashbookSummary>({
    queryKey: ['cashbook', date],
    queryFn: () => apiClient.get(`/cashbook?date=${date}`),
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
            <SummaryCard title="Opening" paise={data.openingBalancePaise} />
            <SummaryCard title="Collections" paise={data.totalCollectionsPaise} />
            <SummaryCard title="Disbursements" paise={data.totalDisbursementsPaise} />
            <SummaryCard title="Closing" paise={data.closingBalancePaise} />
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Time</th>
                  <th className="px-4 py-3 text-left font-medium">Type</th>
                  <th className="px-4 py-3 text-left font-medium">Description</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.transactions.map((tx) => (
                  <tr key={tx.id} className="border-b last:border-0">
                    <td className="px-4 py-3">{tx.time}</td>
                    <td className="px-4 py-3 capitalize">{tx.type.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3">{tx.description}</td>
                    <td className="px-4 py-3 text-right"><MoneyDisplay paise={tx.amountPaise} /></td>
                  </tr>
                ))}
                {data.transactions.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No transactions for this date.</td></tr>
                )}
              </tbody>
            </table>
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
