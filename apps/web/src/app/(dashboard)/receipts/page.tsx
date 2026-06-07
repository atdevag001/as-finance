'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Eye } from 'lucide-react';
import {
  LoadingSpinner,
  ErrorMessage,
  PaginationControls,
  AccessDenied,
  DateDisplay,
  MoneyDisplay,
  StatusBadge,
} from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/providers/auth-provider';
import { hasPermission } from '@/lib/permissions';
import { useReceipts } from '@/hooks/useReceipts';

export default function ReceiptsPage() {
  const { user } = useAuth();
  const role = user?.role ?? '';

  if (!hasPermission(role, 'receipt.read')) {
    return <AccessDenied />;
  }

  return <ReceiptsContent />;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ReceiptsContent() {
  const [page, setPage] = useState(1);
  const [loanIdFilter, setLoanIdFilter] = useState('');
  const [debouncedLoanId, setDebouncedLoanId] = useState('');

  // Debounce + UUID validation avoids hammering the API with 500s on partial input.
  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedLoanId(UUID_REGEX.test(loanIdFilter.trim()) ? loanIdFilter.trim() : '');
    }, 300);
    return () => clearTimeout(handle);
  }, [loanIdFilter]);

  const trimmed = loanIdFilter.trim();
  const isInvalidUuid = trimmed.length > 0 && !UUID_REGEX.test(trimmed);

  const { data, isLoading, error } = useReceipts({
    page,
    loanId: debouncedLoanId || undefined,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Receipts</h1>

      <div className="flex flex-wrap gap-2">
        <div className="flex flex-col">
          <Input
            placeholder="Search by Loan ID (UUID)..."
            value={loanIdFilter}
            onChange={(e) => {
              setLoanIdFilter(e.target.value);
              setPage(1);
            }}
            className="w-72"
            aria-invalid={isInvalidUuid}
          />
          {isInvalidUuid && (
            <span className="mt-1 text-xs text-muted-foreground">
              Enter a full UUID to search.
            </span>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="flex justify-center py-8">
          <LoadingSpinner size="lg" />
        </div>
      )}
      {error && <ErrorMessage message={(error as Error).message} />}

      {data && (
        <>
          {/* Mobile Card View */}
          <div className="space-y-3 lg:hidden">
            {data.data.map((r) => (
              <div key={r.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/receipts/${r.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {r.receipt_number}
                    </Link>
                    <p className="text-sm text-muted-foreground">{r.customer_name}</p>
                  </div>
                  <StatusBadge
                    status={r.is_reversal ? 'reversal' : r.status}
                    type="collection"
                  />
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <MoneyDisplay paise={Number(r.amount_paise)} className="font-semibold" />
                  <span className="text-xs text-muted-foreground capitalize">
                    {r.payment_mode.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm text-muted-foreground">
                  <span>{r.loan_number}</span>
                  <DateDisplay date={r.payment_date} />
                </div>
                <div className="mt-3 flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 min-h-[40px]" asChild>
                    <Link href={`/receipts/${r.id}`}>
                      <Eye className="mr-1 h-3 w-3" />
                      View
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
            {data.data.length === 0 && (
              <div className="py-8 text-center text-muted-foreground">
                No receipts found.
              </div>
            )}
          </div>

          {/* Desktop Table */}
          <div className="hidden lg:block overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Receipt #</th>
                  <th className="px-4 py-3 text-left font-medium">Date</th>
                  <th className="px-4 py-3 text-left font-medium">Customer</th>
                  <th className="px-4 py-3 text-left font-medium">Loan #</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                  <th className="px-4 py-3 text-left font-medium">Mode</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <Link
                        href={`/receipts/${r.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {r.receipt_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <DateDisplay date={r.payment_date} />
                    </td>
                    <td className="px-4 py-3">{r.customer_name}</td>
                    <td className="px-4 py-3">{r.loan_number}</td>
                    <td className="px-4 py-3 text-right">
                      <MoneyDisplay paise={Number(r.amount_paise)} />
                    </td>
                    <td className="px-4 py-3 capitalize">
                      {r.payment_mode.replace(/_/g, ' ')}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        status={r.is_reversal ? 'reversal' : r.status}
                        type="collection"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/receipts/${r.id}`}>
                            <Eye className="mr-1 h-3 w-3" />
                            View
                          </Link>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {data.data.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                      No receipts found.
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
