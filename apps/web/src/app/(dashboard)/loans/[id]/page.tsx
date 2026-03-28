'use client';

import { use } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useLoan } from '@/hooks/useLoans';
import { StatusBadge, MoneyDisplay, LoadingSpinner, ErrorMessage } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function LoanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: loan, isLoading, error } = useLoan(id);

  if (isLoading) return <div className="flex justify-center py-8"><LoadingSpinner size="lg" /></div>;
  if (error) return <ErrorMessage message={(error as Error).message} />;
  if (!loan) return <ErrorMessage message="Loan not found" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild><Link href="/loans"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <div>
          <h1 className="text-2xl font-bold">{loan.loanNumber}</h1>
          <StatusBadge status={loan.status} type="loan" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-base">Principal</CardTitle></CardHeader>
          <CardContent><MoneyDisplay paise={loan.principalPaise} className="text-xl font-semibold" /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Outstanding</CardTitle></CardHeader>
          <CardContent>
            {loan.cachedOutstandingPaise != null
              ? <MoneyDisplay paise={loan.cachedOutstandingPaise} className="text-xl font-semibold" />
              : <span className="text-muted-foreground">—</span>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Tenure</CardTitle></CardHeader>
          <CardContent><span className="text-xl font-semibold">{loan.tenureMonths} months</span></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <Row label="Purpose" value={loan.purpose} />
          <Row label="DPD" value={String(loan.dpd)} />
          {loan.disbursementDate && <Row label="Disbursement Date" value={loan.disbursementDate} />}
          {loan.firstDueDate && <Row label="First Due Date" value={loan.firstDueDate} />}
          {loan.lastDueDate && <Row label="Last Due Date" value={loan.lastDueDate} />}
          {loan.totalInterestPaise != null && (
            <div className="flex justify-between"><span className="text-muted-foreground">Total Interest</span><MoneyDisplay paise={loan.totalInterestPaise} /></div>
          )}
          {loan.processingFeePaise != null && (
            <div className="flex justify-between"><span className="text-muted-foreground">Processing Fee</span><MoneyDisplay paise={loan.processingFeePaise} /></div>
          )}
        </CardContent>
      </Card>

      {loan.schedule && loan.schedule.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Repayment Schedule</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">#</th>
                    <th className="px-3 py-2 text-left font-medium">Due Date</th>
                    <th className="px-3 py-2 text-right font-medium">Principal</th>
                    <th className="px-3 py-2 text-right font-medium">Interest</th>
                    <th className="px-3 py-2 text-right font-medium">Total</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loan.schedule.map((inst) => (
                    <tr key={inst.id} className="border-b last:border-0">
                      <td className="px-3 py-2">{inst.installmentNumber}</td>
                      <td className="px-3 py-2">{inst.dueDate}</td>
                      <td className="px-3 py-2 text-right"><MoneyDisplay paise={inst.principalPaise} /></td>
                      <td className="px-3 py-2 text-right"><MoneyDisplay paise={inst.interestPaise} /></td>
                      <td className="px-3 py-2 text-right"><MoneyDisplay paise={inst.totalPaise} /></td>
                      <td className="px-3 py-2"><StatusBadge status={inst.status} type="installment" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value ?? '—'}</span>
    </div>
  );
}
