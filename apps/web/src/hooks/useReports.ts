'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface ReportData {
  type: string;
  label: string;
  columns: string[];
  rows: Record<string, unknown>[];
  summary?: Record<string, unknown>;
}

interface BackendReportResponse {
  reportType: string;
  generatedAt: string;
  filters?: Record<string, unknown>;
  summary?: Record<string, unknown>;
  data: unknown[] | Record<string, unknown>;
}

const REPORT_LABELS: Record<string, string> = {
  'daily-collection': 'Daily Collection',
  'receipt-register': 'Receipt Register',
  'cash-handover': 'Cash Handover',
  'loan-portfolio': 'Loan Portfolio',
  disbursement: 'Disbursement',
  overdue: 'Overdue',
  'repayment-schedule': 'Repayment Schedule',
  'emi-schedule': 'EMI Schedule',
  foreclosure: 'Foreclosure',
  customer: 'Customer',
  'group-summary': 'Group Summary',
  'group-collection': 'Group Collection',
  penalty: 'Penalty',
  expense: 'Expense',
  income: 'Income',
  'trial-balance': 'Trial Balance',
  'profit-loss': 'Profit & Loss',
  'balance-sheet': 'Balance Sheet',
  'audit-trail': 'Audit Trail',
  'dpd-aging': 'DPD Aging',
  'officer-performance': 'Officer Performance',
};

function transformBackendResponse(response: BackendReportResponse): ReportData {
  const type = response.reportType;
  const label = REPORT_LABELS[type] ?? type.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());

  // Handle different data structures
  let rows: Record<string, unknown>[] = [];

  if (Array.isArray(response.data)) {
    // Data is already an array of rows
    rows = response.data as Record<string, unknown>[];
  } else if (response.data && typeof response.data === 'object') {
    // Data is an object (e.g., overdue report grouped by bucket, or profit-loss with income/expenses)
    // Flatten it into rows for table display
    const dataObj = response.data as Record<string, unknown>;

    // Special handling for profit-loss which has income/expenses as objects
    if (type === 'profit-loss') {
      const income = dataObj['income'] as Record<string, string> | undefined;
      const expenses = dataObj['expenses'] as Record<string, string> | undefined;
      if (income) {
        Object.entries(income).forEach(([name, amount]) => {
          rows.push({ category: 'Income', name, amount_paise: Number(amount) });
        });
      }
      if (expenses) {
        Object.entries(expenses).forEach(([name, amount]) => {
          rows.push({ category: 'Expense', name, amount_paise: Number(amount) });
        });
      }
    } else {
      // For reports like overdue that group by bucket
      Object.entries(dataObj).forEach(([bucket, items]) => {
        if (Array.isArray(items)) {
          items.forEach((item) => {
            rows.push({ bucket, ...(item as Record<string, unknown>) });
          });
        }
      });
    }
  }

  // Convert string amounts to numbers for money display
  rows = rows.map((row) => {
    const converted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      if (typeof value === 'string' && /paise$/i.test(key) && /^\d+$/.test(value)) {
        converted[key] = Number(value);
      } else {
        converted[key] = value;
      }
    }
    return converted;
  });

  // Extract columns from first row
  const columns = rows.length > 0 && rows[0] ? Object.keys(rows[0]) : [];

  return {
    type,
    label,
    columns,
    rows,
    summary: response.summary,
  };
}

export function useReport(type: string, params: { startDate?: string; endDate?: string; status?: string } = {}) {
  const query = new URLSearchParams();
  if (params.startDate) query.set('startDate', params.startDate);
  if (params.endDate) query.set('endDate', params.endDate);
  if (params.status) query.set('status', params.status);
  const qs = query.toString();

  return useQuery<ReportData>({
    queryKey: ['reports', type, params.startDate, params.endDate, params.status],
    queryFn: async () => {
      const response = await apiClient.get<BackendReportResponse>(`/reports/${type}${qs ? `?${qs}` : ''}`);
      return transformBackendResponse(response);
    },
    enabled: !!type,
  });
}
