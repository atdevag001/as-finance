'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { MoneyDisplay, LoadingSpinner, ErrorMessage, AccessDenied } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/providers/auth-provider';
import { hasPermission } from '@/lib/permissions';
import { useTrialBalance } from '@/hooks/useAccounting';
import { todayIST } from '@/lib/date-utils';

export default function TrialBalancePage() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const role = user?.role ?? '';

  if (isAuthLoading) {
    return (
      <div className="flex justify-center py-8">
        <LoadingSpinner size="lg" />
      </div>
    );
  }
  if (!hasPermission(role, 'accounting.read')) {
    return <AccessDenied />;
  }

  return <TrialBalanceContent />;
}

function TrialBalanceContent() {
  const today = todayIST();
  // Trial balance is point-in-time; only a single "as of" date drives the query.
  const [asOfDate, setAsOfDate] = useState(today);

  const { data, isLoading, error } = useTrialBalance({ asOfDate });

  // Prefer backend-computed totals so the displayed numbers match the authoritative isBalanced check.
  const rows = data?.rows ?? [];
  const totalDebit = data?.totalDebitPaise ?? 0;
  const totalCredit = data?.totalCreditPaise ?? 0;
  const isBalanced = data?.isBalanced ?? true;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm"><Link href="/accounting"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-2xl font-bold">Trial Balance</h1>
      </div>

      <div className="flex flex-wrap gap-2 items-end">
        <div className="space-y-1 flex-1 min-w-[140px] max-w-[180px]">
          <label className="text-xs text-muted-foreground">As of</label>
          <Input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
        </div>
      </div>

      {isLoading && <div className="flex justify-center py-8"><LoadingSpinner size="lg" /></div>}
      {error && <ErrorMessage message={(error as Error).message} />}

      {data && (
        <>
          {!isBalanced && (
            <div
              role="alert"
              data-testid="trial-balance-unbalanced"
              className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
            >
              <AlertTriangle className="h-5 w-5 flex-shrink-0" />
              <div>
                <p className="font-semibold">Trial balance is out of balance</p>
                <p className="text-xs">
                  Total debits (<MoneyDisplay paise={totalDebit} />) do not equal total credits (<MoneyDisplay paise={totalCredit} />). This indicates a data integrity issue — please contact an administrator.
                </p>
              </div>
            </div>
          )}

          {/* Mobile Card View */}
          <div className="space-y-3 lg:hidden">
            {rows.map((row) => (
              <div key={row.accountCode} className="rounded-lg border p-3">
                <p className="font-medium">{row.accountName}</p>
                <div className="mt-2 flex justify-between text-sm">
                  <span className="text-muted-foreground">Debit: <MoneyDisplay paise={row.debitPaise} /></span>
                  <span className="text-muted-foreground">Credit: <MoneyDisplay paise={row.creditPaise} /></span>
                </div>
              </div>
            ))}
            {rows.length === 0 && (
              <div className="py-8 text-center text-muted-foreground">No data for this period.</div>
            )}
            {rows.length > 0 && (
              <div className="rounded-lg border bg-muted/50 p-3">
                <p className="font-semibold">Total</p>
                <div className="mt-2 flex justify-between text-sm font-semibold">
                  <span>Debit: <MoneyDisplay paise={totalDebit} /></span>
                  <span>Credit: <MoneyDisplay paise={totalCredit} /></span>
                </div>
              </div>
            )}
          </div>

          {/* Desktop Table */}
          <div className="hidden lg:block overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Account</th>
                  <th className="px-4 py-3 text-right font-medium">Debit</th>
                  <th className="px-4 py-3 text-right font-medium">Credit</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.accountCode} className="border-b last:border-0">
                    <td className="px-4 py-3">{row.accountName}</td>
                    <td className="px-4 py-3 text-right"><MoneyDisplay paise={row.debitPaise} /></td>
                    <td className="px-4 py-3 text-right"><MoneyDisplay paise={row.creditPaise} /></td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">No data for this period.</td></tr>
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot className="border-t bg-muted/50 font-semibold">
                  <tr>
                    <td className="px-4 py-3">Total</td>
                    <td className="px-4 py-3 text-right"><MoneyDisplay paise={totalDebit} /></td>
                    <td className="px-4 py-3 text-right"><MoneyDisplay paise={totalCredit} /></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}
    </div>
  );
}
