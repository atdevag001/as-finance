'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { useCollections } from '@/hooks/useCollections';
import { StatusBadge, MoneyDisplay, LoadingSpinner, ErrorMessage, PaginationControls } from '@/components/shared';
import { Button } from '@/components/ui/button';

export default function CollectionsPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useCollections({ page });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Collections</h1>
        <Button asChild>
          <Link href="/collections/new"><Plus className="mr-2 h-4 w-4" />Post Collection</Link>
        </Button>
      </div>

      {isLoading && <div className="flex justify-center py-8"><LoadingSpinner size="lg" /></div>}
      {error && <ErrorMessage message={(error as Error).message} />}

      {data && (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Loan #</th>
                  <th className="px-4 py-3 text-left font-medium hidden sm:table-cell">Customer</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                  <th className="px-4 py-3 text-left font-medium hidden md:table-cell">Mode</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium hidden md:table-cell">Date</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((c) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{c.loan?.loan_number ?? c.loan_id.slice(0, 8)}</td>
                    <td className="px-4 py-3 hidden sm:table-cell">{c.loan?.customer?.full_name ?? '—'}</td>
                    <td className="px-4 py-3 text-right"><MoneyDisplay paise={Number(c.amount_paise)} /></td>
                    <td className="px-4 py-3 hidden md:table-cell capitalize">{c.payment_mode.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3"><StatusBadge status={c.status} type="collection" /></td>
                    <td className="px-4 py-3 hidden md:table-cell">{String(c.payment_date).slice(0, 10)}</td>
                  </tr>
                ))}
                {data.data.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No collections found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <PaginationControls page={page} totalPages={Math.ceil((data.total || 0) / 20)} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
