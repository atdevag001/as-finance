'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, Search, X } from 'lucide-react';
import { useCollections, type Collection } from '@/hooks/useCollections';
import { todayIST } from '@/lib/date-utils';
import {
  StatusBadge,
  MoneyDisplay,
  LoadingSpinner,
  ErrorMessage,
  PaginationControls,
  DateDisplay,
  PermissionGate,
  ReversalDialog,
} from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function CollectionsPage() {
  const [page, setPage] = useState(1);
  const today = todayIST();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [loanNumber, setLoanNumber] = useState('');
  const [appliedFilters, setAppliedFilters] = useState({
    startDate: today,
    endDate: today,
    loanNumber: '',
  });

  const { data, isLoading, error } = useCollections({
    page,
    startDate: appliedFilters.startDate || undefined,
    endDate: appliedFilters.endDate || undefined,
    loanNumber: appliedFilters.loanNumber || undefined,
  });
  const [reversalCollection, setReversalCollection] = useState<Collection | null>(null);

  function applyFilters() {
    setPage(1);
    setAppliedFilters({ startDate, endDate, loanNumber });
  }

  function clearFilters() {
    setStartDate('');
    setEndDate('');
    setLoanNumber('');
    setPage(1);
    setAppliedFilters({ startDate: '', endDate: '', loanNumber: '' });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Collections</h1>
        <Button asChild>
          <Link href="/collections/new"><Plus className="mr-2 h-4 w-4" />Post Collection</Link>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-end">
        <div className="flex-1 grid gap-3 sm:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor="start-date" className="text-xs">Start Date</Label>
            <Input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="end-date" className="text-xs">End Date</Label>
            <Input
              id="end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="loan-filter" className="text-xs">Loan Number</Label>
            <Input
              id="loan-filter"
              placeholder="Search by loan number…"
              value={loanNumber}
              onChange={(e) => setLoanNumber(e.target.value)}
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={applyFilters} size="sm">
            <Search className="mr-1 h-4 w-4" />Apply
          </Button>
          <Button onClick={clearFilters} variant="outline" size="sm">
            <X className="mr-1 h-4 w-4" />Clear
          </Button>
        </div>
      </div>

      {isLoading && <div className="flex justify-center py-8"><LoadingSpinner size="lg" /></div>}
      {error && <ErrorMessage message={(error as Error).message} />}

      {data && (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Date</th>
                  <th className="px-4 py-3 text-left font-medium">Loan #</th>
                  <th className="px-4 py-3 text-left font-medium hidden sm:table-cell">Customer</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                  <th className="px-4 py-3 text-left font-medium hidden md:table-cell">Mode</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((c) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3"><DateDisplay date={c.payment_date} /></td>
                    <td className="px-4 py-3 font-medium">{c.loan?.loan_number ?? c.loan_id.slice(0, 8)}</td>
                    <td className="px-4 py-3 hidden sm:table-cell">{c.loan?.customer?.full_name ?? '—'}</td>
                    <td className="px-4 py-3 text-right"><MoneyDisplay paise={Number(c.amount_paise)} /></td>
                    <td className="px-4 py-3 hidden md:table-cell capitalize">{c.payment_mode.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3"><StatusBadge status={c.status} type="collection" /></td>
                    <td className="px-4 py-3 text-right">
                      {c.status === 'posted' && (
                        <PermissionGate permission="collection.reverse">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setReversalCollection(c)}
                          >
                            Reverse
                          </Button>
                        </PermissionGate>
                      )}
                    </td>
                  </tr>
                ))}
                {data.data.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No collections found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <PaginationControls page={page} totalPages={Math.ceil((data.total || 0) / 20)} onPageChange={setPage} />
        </>
      )}

      <ReversalDialog
        open={!!reversalCollection}
        onOpenChange={(open) => { if (!open) setReversalCollection(null); }}
        collection={reversalCollection}
      />
    </div>
  );
}
