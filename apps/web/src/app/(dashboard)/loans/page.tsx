'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { useLoans } from '@/hooks/useLoans';
import { StatusBadge, MoneyDisplay, LoadingSpinner, ErrorMessage, PaginationControls } from '@/components/shared';
import { Button } from '@/components/ui/button';

const STATUSES = ['', 'draft', 'submitted', 'under_review', 'approved', 'active', 'overdue', 'closed'];

export default function LoansPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const { data, isLoading, error } = useLoans({ page, status: status || undefined });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Loans</h1>
        <Button asChild>
          <Link href="/loans/new"><Plus className="mr-2 h-4 w-4" />New Loan</Link>
        </Button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {STATUSES.map((s) => (
          <Button key={s} variant={status === s ? 'default' : 'outline'} size="sm"
            onClick={() => { setStatus(s); setPage(1); }}>
            {s || 'All'}
          </Button>
        ))}
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
                  <th className="px-4 py-3 text-right font-medium">Principal</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium hidden md:table-cell">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((l) => (
                  <tr key={l.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <Link href={`/loans/${l.id}`} className="font-medium text-primary hover:underline">{l.loanNumber}</Link>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">{l.customerName ?? '—'}</td>
                    <td className="px-4 py-3 text-right"><MoneyDisplay paise={l.principalPaise} /></td>
                    <td className="px-4 py-3"><StatusBadge status={l.status} type="loan" /></td>
                    <td className="px-4 py-3 text-right hidden md:table-cell">
                      {l.cachedOutstandingPaise != null ? <MoneyDisplay paise={l.cachedOutstandingPaise} /> : '—'}
                    </td>
                  </tr>
                ))}
                {data.data.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No loans found.</td></tr>
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
