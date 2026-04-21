'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { AccessDenied, ConfirmDialog } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/providers/auth-provider';
import { hasPermission } from '@/lib/permissions';
import { useCreateExpense } from '@/hooks/useCashbook';
import { useToast } from '@/providers/toast-provider';
import { todayIST } from '@/lib/date-utils';

const EXPENSE_CATEGORIES = [
  'office_supplies', 'travel', 'salary', 'rent', 'utilities', 'maintenance', 'other',
] as const;

const PAYMENT_MODES = ['cash', 'bank_transfer', 'online'] as const;

export default function NewExpensePage() {
  const { user } = useAuth();
  const role = user?.role ?? '';

  if (!hasPermission(role, 'accounting.create_expense')) {
    return <AccessDenied />;
  }

  return <ExpenseForm />;
}

function ExpenseForm() {
  const router = useRouter();
  const { showToast } = useToast();
  const createExpense = useCreateExpense();

  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [amountRupees, setAmountRupees] = useState('');
  const [date, setDate] = useState(todayIST);
  const [description, setDescription] = useState('');
  const [paymentMode, setPaymentMode] = useState<string>(PAYMENT_MODES[0]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [formError, setFormError] = useState('');

  const amountPaise = Math.round(parseFloat(amountRupees || '0') * 100);
  const isValid = amountPaise > 0 && description.trim().length > 0 && date.length > 0;

  function handleSubmitClick() {
    setFormError('');
    if (!isValid) {
      setFormError('Please fill all required fields with valid values.');
      return;
    }
    setShowConfirm(true);
  }

  async function handleConfirm() {
    try {
      await createExpense.mutateAsync({
        category,
        amountPaise,
        date,
        description: description.trim(),
      });
      showToast({ message: 'Expense recorded successfully.' });
      router.push('/cashbook');
    } catch (err) {
      setFormError((err as Error).message);
      setShowConfirm(false);
    }
  }

  return (
    <div className="space-y-4 max-w-lg">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm"><Link href="/cashbook"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-2xl font-bold">Record Expense</h1>
      </div>

      {formError && (
        <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{formError}</div>
      )}

      <div className="space-y-3">
        <div className="space-y-1">
          <label className="text-sm font-medium">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="flex min-h-[44px] w-full rounded-md border border-input bg-background px-3 py-2 text-base md:min-h-[40px] md:text-sm"
          >
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Amount (₹)</label>
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={amountRupees}
            onChange={(e) => setAmountRupees(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Date</label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Description</label>
          <Input
            placeholder="Describe the expense…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Payment Mode</label>
          <select
            value={paymentMode}
            onChange={(e) => setPaymentMode(e.target.value)}
            className="flex min-h-[44px] w-full rounded-md border border-input bg-background px-3 py-2 text-base md:min-h-[40px] md:text-sm"
          >
            {PAYMENT_MODES.map((m) => (
              <option key={m} value={m}>{m.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}</option>
            ))}
          </select>
        </div>

        <Button onClick={handleSubmitClick} disabled={createExpense.isPending} className="w-full min-h-[48px]">
          {createExpense.isPending ? 'Recording…' : 'Record Expense'}
        </Button>
      </div>

      <ConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title="Confirm Expense"
        description={`Record ₹${(amountPaise / 100).toFixed(2)} expense for "${category.replace(/_/g, ' ')}"?`}
        confirmLabel="Record"
        loading={createExpense.isPending}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
