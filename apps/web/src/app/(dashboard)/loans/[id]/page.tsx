'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useLoan } from '@/hooks/useLoans';
import { StatusBadge, MoneyDisplay, LoadingSpinner, ErrorMessage } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function LoanDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { data: loan, isLoading, error } = useLoan(id);

  if (isLoading) return <div className="flex justify-center py-8"><LoadingSpinner size="lg" /></div>;
  if (error) return <ErrorMessage message={(error as Error).message} />;
  if (!loan) return <ErrorMessage message="Loan not found" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild><Link href="/loans"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <div>
          <h1 className="text-2xl font-bold">{loan.loan_number}</h1>
          <StatusBadge status={loan.status} type="loan" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-base">Principal</CardTitle></CardHeader>
          <CardContent><MoneyDisplay paise={Number(loan.principal_paise)} className="text-xl font-semibold" /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Outstanding</CardTitle></CardHeader>
          <CardContent>
            {loan.cached_outstanding_paise != null
              ? <MoneyDisplay paise={Number(loan.cached_outstanding_paise)} className="text-xl font-semibold" />
              : <span className="text-muted-foreground">—</span>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Tenure</CardTitle></CardHeader>
          <CardContent><span className="text-xl font-semibold">{loan.tenure_months} months</span></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <Row label="Purpose" value={loan.purpose} />
          <Row label="DPD" value={String(loan.dpd)} />
          {loan.disbursement_date && <Row label="Disbursement Date" value={String(loan.disbursement_date).slice(0, 10)} />}
          {loan.first_due_date && <Row label="First Due Date" value={String(loan.first_due_date).slice(0, 10)} />}
          {loan.last_due_date && <Row label="Last Due Date" value={String(loan.last_due_date).slice(0, 10)} />}
          {loan.total_interest_paise != null && (
            <div className="flex justify-between"><span className="text-muted-foreground">Total Interest</span><MoneyDisplay paise={Number(loan.total_interest_paise)} /></div>
          )}
          {loan.processing_fee_paise != null && (
            <div className="flex justify-between"><span className="text-muted-foreground">Processing Fee</span><MoneyDisplay paise={Number(loan.processing_fee_paise)} /></div>
          )}
        </CardContent>
      </Card>

      {loan.schedules && loan.schedules.length > 0 && (
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
                  {loan.schedules.map((inst) => (
                    <tr key={inst.id} className="border-b last:border-0">
                      <td className="px-3 py-2">{inst.installment_number}</td>
                      <td className="px-3 py-2">{String(inst.due_date).slice(0, 10)}</td>
                      <td className="px-3 py-2 text-right"><MoneyDisplay paise={Number(inst.principal_paise)} /></td>
                      <td className="px-3 py-2 text-right"><MoneyDisplay paise={Number(inst.interest_paise)} /></td>
                      <td className="px-3 py-2 text-right"><MoneyDisplay paise={Number(inst.total_paise)} /></td>
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
