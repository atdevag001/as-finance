'use client';

import Link from 'next/link';
import { FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

const REPORT_TYPES = [
  { type: 'collection-summary', title: 'Collection Summary', description: 'Daily/weekly/monthly collection totals by officer' },
  { type: 'outstanding', title: 'Outstanding Report', description: 'Loan-wise outstanding balances and overdue status' },
  { type: 'disbursement', title: 'Disbursement Report', description: 'Disbursements by date range and product' },
  { type: 'overdue', title: 'Overdue Report', description: 'Overdue loans by DPD bucket with aging analysis' },
  { type: 'demand', title: 'Demand Report', description: 'Expected collections for upcoming period' },
  { type: 'portfolio', title: 'Portfolio Report', description: 'Portfolio quality, PAR analysis, and risk distribution' },
];

export default function ReportsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Reports</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORT_TYPES.map((r) => (
          <Link key={r.type} href={`/reports/${r.type}`}>
            <Card className="h-full transition-colors hover:bg-muted/30">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-base">{r.title}</CardTitle>
                </div>
                <CardDescription>{r.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
