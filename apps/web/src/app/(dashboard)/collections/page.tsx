'use client';

import { useState } from 'react';
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
  MobileCardList,
  AccessDenied,
  type MobileCardItem,
} from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/providers/auth-provider';
import { hasPermission } from '@/lib/permissions';

export default function CollectionsPage() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const role = user?.role ?? '';

  if (isAuthLoading) {
    return (
      <div className="flex justify-center py-8">
        <LoadingSpinner size="lg" />
      </div>
    );
  }
  if (!hasPermission(role, 'collection.read')) {
    return <AccessDenied />;
  }

  return <CollectionsPageContent />;
}

function CollectionsPageContent() {
  const [page, setPage] = useState(1);
  const [startDate, setStartDate] = useState(() => todayIST());
  const [endDate, setEndDate] = useState(() => todayIST());
  const [loanNumber, setLoanNumber] = useState('');
  const [aadhaar, setAadhaar] = useState('');
  const [appliedFilters, setAppliedFilters] = useState(() => {
    const today = todayIST();
    return {
      startDate: today,
      endDate: today,
      loanNumber: '',
      aadhaarLastFour: '',
    };
  });

  const { data, isLoading, error } = useCollections({
    page,
    startDate: appliedFilters.startDate || undefined,
    endDate: appliedFilters.endDate || undefined,
    loanNumber: appliedFilters.loanNumber || undefined,
    aadhaarLastFour: appliedFilters.aadhaarLastFour || undefined,
  });
  const [reversalCollection, setReversalCollection] = useState<Collection | null>(null);

  // Surface filter validation issues inline rather than silently dropping input.
  const aadhaarError = aadhaar.length > 0 && aadhaar.length < 4 ? 'Enter 4 digits to filter' : '';
  const dateRangeError =
    startDate && endDate && startDate > endDate ? 'Start date must be on or before end date' : '';
  const applyDisabled = !!aadhaarError || !!dateRangeError;

  function applyFilters() {
    if (applyDisabled) return;
    setPage(1);
    setAppliedFilters({
      startDate,
      endDate,
      loanNumber,
      aadhaarLastFour: aadhaar.length === 4 ? aadhaar : '',
    });
  }

  function clearFilters() {
    setStartDate('');
    setEndDate('');
    setLoanNumber('');
    setAadhaar('');
    setPage(1);
    setAppliedFilters({ startDate: '', endDate: '', loanNumber: '', aadhaarLastFour: '' });
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
        <div className="flex-1 grid gap-3 sm:grid-cols-5">
          <div className="space-y-1">
            <Label htmlFor="start-date" className="text-xs">Start Date</Label>
            <Input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              aria-invalid={!!dateRangeError}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="end-date" className="text-xs">End Date</Label>
            <Input
              id="end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              aria-invalid={!!dateRangeError}
            />
            {dateRangeError && (
              <p className="text-xs text-destructive">{dateRangeError}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="loan-filter" className="text-xs">Loan Number</Label>
            <Input
              id="loan-filter"
              placeholder="Loan number…"
              value={loanNumber}
              onChange={(e) => setLoanNumber(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="aadhaar-filter" className="text-xs">Aadhaar Last 4</Label>
            <Input
              id="aadhaar-filter"
              placeholder="Last 4 digits"
              value={aadhaar}
              onChange={(e) => setAadhaar(e.target.value.replace(/\D/g, '').slice(0, 4))}
              maxLength={4}
              aria-invalid={!!aadhaarError}
            />
            {aadhaarError && (
              <p className="text-xs text-destructive">{aadhaarError}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={applyFilters} size="sm" disabled={applyDisabled}>
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
          {/* Mobile Card List */}
          <div className="lg:hidden">
            <MobileCardList
              items={data.data.map((c): MobileCardItem => ({
                id: c.id,
                title: c.loan?.loan_number ?? c.loan_id.slice(0, 8),
                subtitle: c.loan?.customer?.full_name ?? '—',
                rightValue: <MoneyDisplay paise={Number(c.amount_paise)} />,
                badge: <StatusBadge status={c.status} type="collection" />,
                secondaryInfo: <DateDisplay date={c.payment_date} />,
                action: c.status === 'posted' ? (
                  <PermissionGate permission="collection.reverse">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setReversalCollection(c)}
                    >
                      Reverse
                    </Button>
                  </PermissionGate>
                ) : undefined,
              }))}
              emptyMessage="No collections found."
            />
          </div>

          {/* Desktop Table */}
          <div className="hidden lg:block overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Date</th>
                  <th className="px-4 py-3 text-left font-medium">Loan #</th>
                  <th className="px-4 py-3 text-left font-medium">Customer</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                  <th className="px-4 py-3 text-left font-medium">Mode</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((c) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3"><DateDisplay date={c.payment_date} /></td>
                    <td className="px-4 py-3 font-medium">{c.loan?.loan_number ?? c.loan_id.slice(0, 8)}</td>
                    <td className="px-4 py-3">{c.loan?.customer?.full_name ?? '—'}</td>
                    <td className="px-4 py-3 text-right"><MoneyDisplay paise={Number(c.amount_paise)} /></td>
                    <td className="px-4 py-3 capitalize">{c.payment_mode.replace(/_/g, ' ')}</td>
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
