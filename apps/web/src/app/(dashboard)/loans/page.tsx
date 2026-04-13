'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { useLoans } from '@/hooks/useLoans';
import { StatusBadge, MoneyDisplay, LoadingSpinner, ErrorMessage, PaginationControls, PermissionGate, MobileCardList, type MobileCardItem } from '@/components/shared';
import { Button } from '@/components/ui/button';

const STATUS_FILTERS = [
  { label: 'All', value: '' },
  { label: 'Draft', value: 'draft' },
  { label: 'Submitted', value: 'submitted' },
  { label: 'Under Review', value: 'under_review' },
  { label: 'Approved', value: 'approved' },
  { label: 'Active', value: 'active' },
  { label: 'Overdue', value: 'overdue' },
  { label: 'Closed', value: 'closed' },
] as const;

export default function LoansPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const { data, isLoading, error } = useLoans({ page, status: status || undefined });

  const handleStatusChange = (newStatus: string) => {
    setStatus(newStatus);
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Loans</h1>
        <PermissionGate permission="loan.create">
          <Button asChild>
            <Link href="/loans/new">
              <Plus className="mr-2 h-4 w-4" />New Loan
            </Link>
          </Button>
        </PermissionGate>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter by status">
        {STATUS_FILTERS.map((f) => (
          <Button
            key={f.value}
            variant={status === f.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleStatusChange(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {isLoading && (
        <div className="flex justify-center py-8">
          <LoadingSpinner size="lg" />
        </div>
      )}

      {error && <ErrorMessage message={(error as Error).message} />}

      {data && (
        <>
          {/* Mobile Card List */}
          <div className="lg:hidden">
            <MobileCardList
              items={data.data.map((l): MobileCardItem => ({
                id: l.id,
                title: l.loan_number,
                subtitle: l.customer?.full_name ?? '—',
                rightValue: <MoneyDisplay paise={l.principal_paise} />,
                badge: <StatusBadge status={l.status} type="loan" />,
                secondaryInfo: l.cached_outstanding_paise != null ? (
                  <>Due: <MoneyDisplay paise={l.cached_outstanding_paise} /></>
                ) : undefined,
                href: `/loans/${l.id}`,
              }))}
              emptyMessage="No loans found."
            />
          </div>

          {/* Desktop Table */}
          <div className="hidden lg:block overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Loan #</th>
                  <th className="px-4 py-3 text-left font-medium">Customer</th>
                  <th className="px-4 py-3 text-right font-medium">Principal (INR)</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Outstanding (INR)</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((l) => (
                  <tr key={l.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <Link href={`/loans/${l.id}`} className="font-medium text-primary hover:underline">
                        {l.loan_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{l.customer?.full_name ?? '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <MoneyDisplay paise={l.principal_paise} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={l.status} type="loan" />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {l.cached_outstanding_paise != null ? <MoneyDisplay paise={l.cached_outstanding_paise} /> : '—'}
                    </td>
                  </tr>
                ))}
                {data.data.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      No loans found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <PaginationControls
            page={page}
            totalPages={Math.ceil((data.total || 0) / 20)}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
