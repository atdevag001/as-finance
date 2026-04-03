'use client';

import Link from 'next/link';
import { ArrowLeft, Printer } from 'lucide-react';
import { useReceiptDetail } from '@/hooks/useReceipts';
import {
  MoneyDisplay,
  LoadingSpinner,
  ErrorMessage,
  DateDisplay,
  StatusBadge,
} from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function ReceiptViewPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { data: receipt, isLoading, error } = useReceiptDetail(id);

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode === 404) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-lg font-medium text-muted-foreground">Receipt not found</p>
          <Button variant="link" asChild className="mt-2">
            <Link href="/collections">Back to Collections</Link>
          </Button>
        </div>
      );
    }
    return <ErrorMessage message={(error as Error).message} />;
  }

  if (!receipt) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-lg font-medium text-muted-foreground">Receipt not found</p>
        <Button variant="link" asChild className="mt-2">
          <Link href="/collections">Back to Collections</Link>
        </Button>
      </div>
    );
  }

  const isReversed = receipt.status === 'reversed';

  return (
    <>
      {/* Print styles */}
      <style jsx global>{`
        @media print {
          /* Hide non-receipt elements */
          nav, header, aside, footer,
          .no-print,
          [data-sidebar],
          [data-topbar] {
            display: none !important;
          }

          body {
            margin: 0;
            padding: 0;
            font-size: 11px;
            line-height: 1.4;
            color: #000 !important;
            background: #fff !important;
          }

          /* Receipt container */
          .receipt-container {
            width: 100%;
            max-width: 80mm;
            margin: 0 auto;
            padding: 4mm;
            border: none !important;
            box-shadow: none !important;
          }

          /* A4 layout */
          @page {
            size: auto;
            margin: 10mm;
          }

          /* Thermal 58mm */
          @page thermal-58 {
            size: 58mm auto;
            margin: 2mm;
          }

          /* Thermal 80mm */
          @page thermal-80 {
            size: 80mm auto;
            margin: 3mm;
          }

          /* Reversed watermark */
          .reversed-watermark {
            position: fixed !important;
            display: block !important;
          }
        }
      `}</style>

      <div className="space-y-4">
        {/* Header - hidden in print */}
        <div className="flex items-center justify-between no-print">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/collections"><ArrowLeft className="h-4 w-4" /></Link>
            </Button>
            <h1 className="text-2xl font-bold">Receipt</h1>
          </div>
          <Button onClick={() => window.print()} className="gap-2">
            <Printer className="h-4 w-4" />
            Print
          </Button>
        </div>

        {/* Receipt card */}
        <Card className="receipt-container relative overflow-hidden">
          {/* REVERSED watermark */}
          {isReversed && (
            <div className="reversed-watermark pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <span className="rotate-[-30deg] text-6xl font-extrabold uppercase tracking-widest text-red-500/30 select-none">
                REVERSED
              </span>
            </div>
          )}

          <CardHeader className="text-center border-b pb-4">
            <CardTitle className="text-lg">Payment Receipt</CardTitle>
            <p className="text-sm text-muted-foreground">{receipt.receipt_number}</p>
            {isReversed && (
              <StatusBadge status="reversed" type="collection" className="mx-auto mt-1" />
            )}
          </CardHeader>

          <CardContent className="space-y-4 pt-4">
            {/* Receipt details */}
            <div className="space-y-2 text-sm">
              <ReceiptRow label="Date">
                <DateDisplay date={receipt.payment_date} />
              </ReceiptRow>
              <ReceiptRow label="Customer">{receipt.customer_name}</ReceiptRow>
              <ReceiptRow label="Loan Number">{receipt.loan_number}</ReceiptRow>
              <ReceiptRow label="Payment Mode">
                <span className="capitalize">{receipt.payment_mode.replace(/_/g, ' ')}</span>
              </ReceiptRow>
            </div>

            {/* Amount */}
            <div className="rounded-md border bg-muted/30 p-3 text-center">
              <p className="text-xs text-muted-foreground">Amount Paid</p>
              <MoneyDisplay paise={Number(receipt.amount_paise)} className="text-2xl font-bold" colorNegative={false} />
            </div>

            {/* Allocation breakdown */}
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Allocation Breakdown</p>
              <div className="rounded-md border divide-y text-sm">
                <div className="flex justify-between px-3 py-2">
                  <span>Penalty</span>
                  <MoneyDisplay paise={Number(receipt.penalty_paise)} />
                </div>
                <div className="flex justify-between px-3 py-2">
                  <span>Interest</span>
                  <MoneyDisplay paise={Number(receipt.interest_paise)} />
                </div>
                <div className="flex justify-between px-3 py-2">
                  <span>Principal</span>
                  <MoneyDisplay paise={Number(receipt.principal_paise)} />
                </div>
              </div>
            </div>

            {/* Outstanding after payment */}
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Outstanding After Payment</span>
                <MoneyDisplay paise={Number(receipt.outstanding_after_paise)} className="font-semibold" />
              </div>
            </div>

            {/* Collected by */}
            <div className="border-t pt-3 text-sm">
              <ReceiptRow label="Collected By">{receipt.officer_name}</ReceiptRow>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function ReceiptRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{children}</span>
    </div>
  );
}
