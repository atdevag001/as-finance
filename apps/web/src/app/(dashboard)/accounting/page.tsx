'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MoneyDisplay, LoadingSpinner, ErrorMessage, AccessDenied } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/providers/auth-provider';
import { hasPermission } from '@/lib/permissions';
import { useChartOfAccounts, useDaybook } from '@/hooks/useAccounting';
import { todayIST } from '@/lib/date-utils';

export default function AccountingPage() {
  const { user } = useAuth();
  const role = user?.role ?? '';

  if (!hasPermission(role, 'accounting.read')) {
    return <AccessDenied />;
  }

  return <AccountingContent />;
}

function AccountingContent() {
  const [tab, setTab] = useState<'coa' | 'daybook'>('coa');
  const today = todayIST();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);

  const coa = useChartOfAccounts();
  const daybook = useDaybook({ startDate, endDate });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Accounting</h1>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm" className="min-h-[44px] flex-1 sm:flex-none"><Link href="/accounting/trial-balance">Trial Balance</Link></Button>
          <Button asChild variant="outline" size="sm" className="min-h-[44px] flex-1 sm:flex-none"><Link href="/accounting/profit-loss">P&amp;L</Link></Button>
          <Button asChild variant="outline" size="sm" className="min-h-[44px] flex-1 sm:flex-none"><Link href="/accounting/balance-sheet">Balance Sheet</Link></Button>
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant={tab === 'coa' ? 'default' : 'outline'} size="sm" onClick={() => setTab('coa')}>Chart of Accounts</Button>
        <Button variant={tab === 'daybook' ? 'default' : 'outline'} size="sm" onClick={() => setTab('daybook')}>Daybook</Button>
      </div>

      {tab === 'coa' && (
        <>
          {coa.isLoading && <div className="flex justify-center py-8"><LoadingSpinner size="lg" /></div>}
          {coa.error && <ErrorMessage message={(coa.error as Error).message} />}
          {coa.data && (
            <>
              {/* Mobile Card View */}
              <div className="space-y-3 lg:hidden">
                {coa.data.map((a) => (
                  <div key={a.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{a.name}</p>
                        <p className="text-sm text-muted-foreground capitalize">{a.category.replace(/_/g, ' ')}</p>
                      </div>
                      <span className="font-mono text-sm text-muted-foreground">{a.code}</span>
                    </div>
                  </div>
                ))}
                {coa.data.length === 0 && (
                  <div className="py-8 text-center text-muted-foreground">No accounts found.</div>
                )}
              </div>

              {/* Desktop Table */}
              <div className="hidden lg:block overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Code</th>
                      <th className="px-4 py-3 text-left font-medium">Name</th>
                      <th className="px-4 py-3 text-left font-medium">Category</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coa.data.map((a) => (
                      <tr key={a.id} className="border-b last:border-0">
                        <td className="px-4 py-3 font-mono">{a.code}</td>
                        <td className="px-4 py-3">{a.name}</td>
                        <td className="px-4 py-3 capitalize">{a.category.replace(/_/g, ' ')}</td>
                      </tr>
                    ))}
                    {coa.data.length === 0 && (
                      <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">No accounts found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {tab === 'daybook' && (
        <>
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
          {daybook.isLoading && <div className="flex justify-center py-8"><LoadingSpinner size="lg" /></div>}
          {daybook.error && <ErrorMessage message={(daybook.error as Error).message} />}
          {daybook.data && (
            <div className="space-y-3">
              {daybook.data.map((je) => (
                <Card key={je.id}>
                  <CardHeader className="py-3">
                    <div className="flex justify-between text-sm">
                      <CardTitle className="text-sm font-medium">{je.description}</CardTitle>
                      <span className="text-muted-foreground">{je.date}</span>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <table className="w-full text-sm">
                      <tbody>
                        {je.lines.map((l, i) => (
                          <tr key={i} className="border-b last:border-0">
                            <td className="py-1">{l.accountName}</td>
                            <td className="py-1 text-right">{l.debitPaise > 0 ? <MoneyDisplay paise={l.debitPaise} /> : ''}</td>
                            <td className="py-1 text-right">{l.creditPaise > 0 ? <MoneyDisplay paise={l.creditPaise} /> : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              ))}
              {daybook.data.length === 0 && <p className="text-center text-muted-foreground py-8">No entries for this period.</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
