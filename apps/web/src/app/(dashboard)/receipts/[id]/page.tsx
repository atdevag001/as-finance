'use client';

import { use, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, Printer } from 'lucide-react';
import { useReceipt } from '@/hooks/useCollections';
import { MoneyDisplay, StatusBadge, LoadingSpinner, ErrorMessage } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function ReceiptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: receipt, isLoading, error } = useReceipt(id);
  const printRef = useRef<HTMLDivElement>(null);

  function handlePrint() {
    window.print();
  }

  if (isLoading) return <div className="flex justify-center py-8"><LoadingSpinner size="lg" /></div>;
  if (error) return <ErrorMessage message={(error as Error).message} />;
  if (!receipt) return <ErrorMessage message="Receipt not found" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild><Link href="/collections"><ArrowLeft className="h-4 w-4" /></Link></Button>
          <h1 className="text-2xl font-bold">Receipt {receipt.receiptNumber}</h1>
        </div>
        <Button onClick={handlePrint} variant="outline">
          <Printer className="mr-2 h-4 w-4" />Print
        </Button>
      </div>

      <div ref={printRef}>
        <Card>
          <CardHeader className="text-center">
            <CardTitle>AS Finance</CardTitle>
            <p className="text-sm text-muted-foreground">Payment Receipt</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <Row label="Receipt #" value={receipt.receiptNumber} />
              <Row label="Date" value={receipt.paymentDate} />
              <Row label="Customer" value={receipt.customerName} />
              <Row label="Loan #" value={receipt.loanNumber} />
              <Row label="Officer" value={receipt.officerName} />
              <Row label="Mode" value={receipt.paymentMode.replace(/_/g, ' ')} />
              <Row label="Status"><StatusBadge status={receipt.status} type="collection" /></Row>
            </div>

            <div className="border-t pt-4 space-y-2 text-sm">
              <div className="flex justify-between"><span>Principal</span><MoneyDisplay paise={receipt.principalPaise} /></div>
              <div className="flex justify-between"><span>Interest</span><MoneyDisplay paise={receipt.interestPaise} /></div>
              <div className="flex justify-between"><span>Penalty</span><MoneyDisplay paise={receipt.penaltyPaise} /></div>
              <div className="flex justify-between border-t pt-2 font-semibold">
                <span>Total Paid</span><MoneyDisplay paise={receipt.amountPaise} />
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Outstanding After</span><MoneyDisplay paise={receipt.outstandingAfterPaise} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      {children ?? <span>{value ?? '—'}</span>}
    </div>
  );
}
