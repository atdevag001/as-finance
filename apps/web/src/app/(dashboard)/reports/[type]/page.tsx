'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { MoneyDisplay, LoadingSpinner, ErrorMessage } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ReportData {
  title: string;
  generatedAt: string;
  columns: string[];
  rows: Record<string, unknown>[];
  summaryPaise?: number;
}

export default function ReportViewerPage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = use(params);
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));

  const { data, isLoading, error } = useQuery<ReportData>({
    queryKey: ['reports', type, startDate, endDate],
    queryFn: () => apiClient.get(`/reports/${type}?startDate=${startDate}&endDate=${endDate}`),
  });

  const title = type.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild><Link href="/reports"><ArrowLeft className="h-4 w-4" /></Link></Button>
          <h1 className="text-2xl font-bold">{data?.title ?? title}</h1>
        </div>
        {data && (
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Download className="mr-2 h-4 w-4" />Export
          </Button>
        )}
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
        <>
          {data.summaryPaise != null && (
            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="flex justify-between font-semibold">
                <span>Total</span>
                <MoneyDisplay paise={data.summaryPaise} />
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  {data.columns.map((col) => (
                    <th key={col} className="px-4 py-3 text-left font-medium">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, i) => (
                  <tr key={i} className="border-b last:border-0">
                    {data.columns.map((col) => (
                      <td key={col} className="px-4 py-3">{String(row[col] ?? '—')}</td>
                    ))}
                  </tr>
                ))}
                {data.rows.length === 0 && (
                  <tr><td colSpan={data.columns.length} className="px-4 py-8 text-center text-muted-foreground">No data for this period.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
