'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { MoneyDisplay, StatusBadge, LoadingSpinner, ErrorMessage, PaginationControls } from '@/components/shared';
import { Button } from '@/components/ui/button';

interface Handover {
  id: string;
  officerName: string;
  amountPaise: number;
  date: string;
  status: string;
  verifiedBy?: string;
}

interface PaginatedResult { data: Handover[]; total: number; page: number; pageSize: number; totalPages: number; }

export default function HandoversPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useQuery<PaginatedResult>({
    queryKey: ['handovers', page],
    queryFn: () => apiClient.get(`/cashbook/handovers?page=${page}&pageSize=20`),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild><Link href="/cashbook"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-2xl font-bold">Cash Handovers</h1>
      </div>

      {isLoading && <div className="flex justify-center py-8"><LoadingSpinner size="lg" /></div>}
      {error && <ErrorMessage message={(error as Error).message} />}

      {data && (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Officer</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                  <th className="px-4 py-3 text-left font-medium">Date</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((h) => (
                  <tr key={h.id} className="border-b last:border-0">
                    <td className="px-4 py-3">{h.officerName}</td>
                    <td className="px-4 py-3 text-right"><MoneyDisplay paise={h.amountPaise} /></td>
                    <td className="px-4 py-3">{h.date}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={h.status === 'verified' ? 'active' : h.status === 'pending' ? 'draft' : h.status} type="loan" label={h.status} />
                    </td>
                  </tr>
                ))}
                {data.data.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No handovers found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <PaginationControls page={page} totalPages={data.totalPages} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
