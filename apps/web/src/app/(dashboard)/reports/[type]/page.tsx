'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Download } from 'lucide-react';
import { MoneyDisplay, LoadingSpinner, ErrorMessage, AccessDenied, PermissionGate } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/providers/auth-provider';
import { hasPermission } from '@/lib/permissions';
import { useReport } from '@/hooks/useReports';
import { apiClient } from '@/lib/api-client';
import { todayIST } from '@/lib/date-utils';

const REPORT_LABELS: Record<string, string> = {
  // Collections
  'daily-collection': 'Daily Collection',
  'receipt-register': 'Receipt Register',
  'cash-handover': 'Cash Handover',
  // Loans
  'loan-portfolio': 'Loan Portfolio',
  disbursement: 'Disbursement',
  overdue: 'Overdue',
  'repayment-schedule': 'Repayment Schedule',
  'emi-schedule': 'EMI Schedule',
  foreclosure: 'Foreclosure',
  // Customers & Groups
  customer: 'Customer',
  'group-summary': 'Group Summary',
  'group-collection': 'Group Collection',
  // Income
  penalty: 'Penalty',
  expense: 'Expense',
  income: 'Income',
  'interest-accrual': 'Interest Accrual',
  // Accounting
  'trial-balance': 'Trial Balance',
  'profit-loss': 'Profit & Loss',
  'balance-sheet': 'Balance Sheet',
  // Audit
  'audit-trail': 'Audit Trail',
  'user-activity': 'User Activity',
};

const MONEY_COLUMN_PATTERNS = /paise|amount|balance|total|outstanding|principal|interest|penalty|inflow|outflow/i;

export default function ReportDetailPage() {
  const { user } = useAuth();
  const role = user?.role ?? '';

  if (!hasPermission(role, 'report.read')) {
    return <AccessDenied />;
  }

  return <ReportDetailContent />;
}

function ReportDetailContent() {
  const params = useParams();
  const type = params['type'] as string;
  const today = todayIST();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [status, setStatus] = useState('all');
  const [exporting, setExporting] = useState(false);

  const queryParams = type === 'emi-schedule'
    ? { startDate, endDate, status }
    : { startDate, endDate };
  const { data, isLoading, error } = useReport(type, queryParams);

  const label = REPORT_LABELS[type] ?? type.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());

  async function handleExport(format: 'pdf' | 'excel') {
    setExporting(true);
    try {
      // Backend expects 'xlsx' not 'excel'
      const exportFormat = format === 'excel' ? 'xlsx' : format;
      const params: Record<string, string> = { startDate, endDate, format: exportFormat };
      if (type === 'emi-schedule') params['status'] = status;
      const qs = new URLSearchParams(params).toString();
      const blob = await apiClient.getBlob(`/reports/${type}/export?${qs}`);
      const ext = format === 'pdf' ? 'pdf' : 'xlsx';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type}-report.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Export errors are non-critical; user can retry
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm"><Link href="/reports"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-2xl font-bold">{label} Report</h1>
      </div>

      <div className="flex flex-wrap gap-2 items-end">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Start Date</label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">End Date</label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
        </div>
        {type === 'emi-schedule' && (
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="unpaid">Unpaid</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        <PermissionGate permission="report.export">
          <Button variant="outline" size="sm" onClick={() => handleExport('pdf')} disabled={exporting}>
            <Download className="h-4 w-4 mr-1" />{exporting ? 'Exporting…' : 'PDF'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('excel')} disabled={exporting}>
            <Download className="h-4 w-4 mr-1" />{exporting ? 'Exporting…' : 'Excel'}
          </Button>
        </PermissionGate>
      </div>

      {isLoading && <div className="flex justify-center py-8"><LoadingSpinner size="lg" /></div>}
      {error && <ErrorMessage message={(error as Error).message} />}

      {data && data.rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                {data.columns.map((col) => (
                  <th key={col} className="px-4 py-3 text-left font-medium whitespace-nowrap">
                    {col.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, idx) => (
                <tr key={idx} className="border-b last:border-0">
                  {data.columns.map((col) => {
                    const val = row[col];
                    const isMoney = MONEY_COLUMN_PATTERNS.test(col) && typeof val === 'number';
                    return (
                      <td key={col} className={`px-4 py-3 ${isMoney ? 'text-right' : ''}`}>
                        {isMoney ? <MoneyDisplay paise={val as number} /> : String(val ?? '—')}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.rows.length === 0 && (
        <p className="text-center text-muted-foreground py-8">No data for this period.</p>
      )}
    </div>
  );
}
