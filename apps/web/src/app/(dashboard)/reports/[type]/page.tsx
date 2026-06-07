'use client';

import { useState, type ReactNode } from 'react';
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
import { apiClient, ApiClientError } from '@/lib/api-client';
import { todayIST } from '@/lib/date-utils';
import { useToast } from '@/providers/toast-provider';

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
  // Accounting
  'trial-balance': 'Trial Balance',
  'profit-loss': 'Profit & Loss',
  'balance-sheet': 'Balance Sheet',
  // Audit & Activity (must stay in sync with apps/api/src/modules/report/report.service.ts REPORT_TYPES)
  'audit-trail': 'Audit Trail',
  'dpd-aging': 'DPD Aging',
  'officer-performance': 'Officer Performance',
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
  const { showToast } = useToast();
  const [startDate, setStartDate] = useState(() => todayIST());
  const [endDate, setEndDate] = useState(() => todayIST());
  const [status, setStatus] = useState('all');
  const [exporting, setExporting] = useState(false);

  // Inverted ranges still hit the API (backend just returns empty), but we flag the UI so users don't read "no data" as a real result.
  const isDateRangeInvalid = Boolean(startDate) && Boolean(endDate) && endDate < startDate;
  const queryParams = type === 'emi-schedule'
    ? { startDate, endDate, scheduleStatus: status }
    : { startDate, endDate };
  const { data, isLoading, error } = useReport(type, queryParams);

  const label = REPORT_LABELS[type] ?? type.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());

  async function handleExport(format: 'pdf' | 'excel') {
    setExporting(true);
    try {
      // Backend expects 'xlsx' not 'excel'
      const exportFormat = format === 'excel' ? 'xlsx' : format;
      const params: Record<string, string> = { startDate, endDate, format: exportFormat };
      if (type === 'emi-schedule') params['scheduleStatus'] = status;
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
      showToast({ message: `${format.toUpperCase()} export downloaded`, variant: 'success' });
    } catch (err) {
      // Surface backend code-specific messages so RBAC/throttle/validation failures are visible.
      const message =
        err instanceof ApiClientError
          ? err.body.code
            ? `${err.body.message} (${err.body.code})`
            : err.body.message
          : err instanceof Error
            ? err.message
            : 'Export failed';
      showToast({ message, variant: 'error' });
    } finally {
      setExporting(false);
    }
  }

  function renderCellValue(val: unknown): string {
    if (val === null || val === undefined) return '—';
    if (typeof val === 'object') {
      const obj = val as Record<string, unknown>;
      // Prefer common display fields before falling back to a JSON dump.
      const display = obj['full_name'] ?? obj['name'] ?? obj['label'] ?? obj['code'] ?? obj['id'];
      if (display !== undefined && display !== null) return String(display);
      try {
        return JSON.stringify(val);
      } catch {
        return String(val);
      }
    }
    return String(val);
  }

  function formatSummaryKey(key: string): string {
    return key.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, (l) => l.toUpperCase());
  }

  function renderSummaryValue(key: string, value: unknown): ReactNode {
    if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>;
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'number' && /paise$/i.test(key)) return <MoneyDisplay paise={value} />;
    if (typeof value === 'string' && /paise$/i.test(key) && /^\d+$/.test(value)) {
      return <MoneyDisplay paise={value} />;
    }
    if (typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length === 0) return <span className="text-muted-foreground">—</span>;
      return (
        <ul className="space-y-0.5 text-xs">
          {entries.map(([k, v]) => (
            <li key={k} className="flex justify-between gap-2">
              <span className="text-muted-foreground">{formatSummaryKey(k)}:</span>
              <span>{renderSummaryValue(k, v)}</span>
            </li>
          ))}
        </ul>
      );
    }
    return String(value);
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
          <Input type="date" value={startDate} max={endDate || undefined} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">End Date</label>
          <Input type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
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
          <Button variant="outline" size="sm" onClick={() => handleExport('pdf')} disabled={exporting || isDateRangeInvalid}>
            <Download className="h-4 w-4 mr-1" />{exporting ? 'Exporting…' : 'PDF'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('excel')} disabled={exporting || isDateRangeInvalid}>
            <Download className="h-4 w-4 mr-1" />{exporting ? 'Exporting…' : 'Excel'}
          </Button>
        </PermissionGate>
      </div>

      {isDateRangeInvalid && <ErrorMessage message="End date must be on or after start date." />}
      {isLoading && <div className="flex justify-center py-8"><LoadingSpinner size="lg" /></div>}
      {error && <ErrorMessage message={(error as Error).message} />}

      {data && data.summary && Object.keys(data.summary).length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Object.entries(data.summary).map(([key, value]) => (
            <div key={key} className="rounded-lg border bg-card p-3 shadow-sm">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {formatSummaryKey(key)}
              </div>
              <div className="mt-1 text-sm font-semibold">{renderSummaryValue(key, value)}</div>
            </div>
          ))}
        </div>
      )}

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
                        {isMoney ? <MoneyDisplay paise={val as number} /> : renderCellValue(val)}
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
