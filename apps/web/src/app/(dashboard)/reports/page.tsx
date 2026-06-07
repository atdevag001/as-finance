'use client';

import Link from 'next/link';
import {
  FileText,
  TrendingUp,
  Wallet,
  AlertCircle,
  CalendarCheck,
  PieChart,
  Users,
  Receipt,
  Calculator,
  DollarSign,
  BookOpen,
  Scale,
  UsersRound,
  Ban,
  Activity,
  User,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AccessDenied, LoadingSpinner } from '@/components/shared';
import { useAuth } from '@/providers/auth-provider';
import { hasPermission } from '@/lib/permissions';

const REPORT_TYPES = [
  // Collections & Payments
  { type: 'daily-collection', label: 'Daily Collection', description: 'Daily collection totals by officer', icon: Wallet, category: 'Collections' },
  { type: 'receipt-register', label: 'Receipt Register', description: 'List of all payment receipts', icon: Receipt, category: 'Collections' },
  { type: 'cash-handover', label: 'Cash Handover', description: 'Cash handover and bank deposit records', icon: DollarSign, category: 'Collections' },

  // Loans
  { type: 'loan-portfolio', label: 'Loan Portfolio', description: 'Portfolio composition and loan summary', icon: PieChart, category: 'Loans' },
  { type: 'disbursement', label: 'Disbursement', description: 'Disbursement activity and amounts', icon: FileText, category: 'Loans' },
  { type: 'overdue', label: 'Overdue', description: 'Overdue loans and aging analysis', icon: AlertCircle, category: 'Loans' },
  { type: 'repayment-schedule', label: 'Repayment Schedule', description: 'Installment schedule for loans', icon: CalendarCheck, category: 'Loans' },
  { type: 'emi-schedule', label: 'EMI Schedule', description: 'EMIs by due date range with status', icon: CalendarCheck, category: 'Loans' },
  { type: 'foreclosure', label: 'Foreclosure', description: 'Foreclosure and early settlement records', icon: Ban, category: 'Loans' },

  // Customers & Groups
  { type: 'customer', label: 'Customer', description: 'Customer profile and loan history', icon: Users, category: 'Customers' },
  { type: 'group-summary', label: 'Group Summary', description: 'Group-wise loan and collection summary', icon: UsersRound, category: 'Groups' },
  { type: 'group-collection', label: 'Group Collection', description: 'Group collection status and details', icon: UsersRound, category: 'Groups' },

  // Penalties & Income
  { type: 'penalty', label: 'Penalty', description: 'Penalty charges and waivers', icon: AlertCircle, category: 'Income' },
  { type: 'expense', label: 'Expense', description: 'Expense breakdown and categories', icon: TrendingUp, category: 'Income' },
  { type: 'income', label: 'Income', description: 'Income sources and revenue', icon: DollarSign, category: 'Income' },

  // Accounting
  { type: 'trial-balance', label: 'Trial Balance', description: 'Debits and credits balance', icon: Scale, category: 'Accounting' },
  { type: 'profit-loss', label: 'Profit & Loss', description: 'Income statement and profitability', icon: Calculator, category: 'Accounting' },
  { type: 'balance-sheet', label: 'Balance Sheet', description: 'Assets, liabilities and equity', icon: BookOpen, category: 'Accounting' },

  // Audit & Activity
  { type: 'audit-trail', label: 'Audit Trail', description: 'System activity and change log', icon: Activity, category: 'Audit' },
  { type: 'dpd-aging', label: 'DPD Aging', description: 'Days past due aging analysis', icon: AlertCircle, category: 'Loans' },
  { type: 'officer-performance', label: 'Officer Performance', description: 'Field officer collection performance', icon: User, category: 'Audit' },
] as const;

const CATEGORIES = ['Collections', 'Loans', 'Customers', 'Groups', 'Income', 'Accounting', 'Audit'] as const;

export default function ReportsPage() {
  const { user, isLoading } = useAuth();
  const role = user?.role ?? '';

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!hasPermission(role, 'report.read')) {
    return <AccessDenied />;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Reports</h1>

      {CATEGORIES.map((category) => {
        const categoryReports = REPORT_TYPES.filter((r) => r.category === category);
        if (categoryReports.length === 0) return null;

        return (
          <div key={category} className="space-y-3">
            <h2 className="text-lg font-semibold text-muted-foreground">{category}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {categoryReports.map(({ type, label, description, icon: Icon }) => (
                <Link key={type} href={`/reports/${type}`}>
                  <Card className="transition-colors hover:bg-muted/50 active:bg-accent cursor-pointer h-full min-h-[88px]">
                    <CardHeader className="flex flex-row items-center gap-3 pb-1 pt-3 px-4">
                      <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                      <CardTitle className="text-sm">{label}</CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-3">
                      <p className="text-xs text-muted-foreground line-clamp-2">{description}</p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
