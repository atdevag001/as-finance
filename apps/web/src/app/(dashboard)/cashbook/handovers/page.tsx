'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { MoneyDisplay, LoadingSpinner, ErrorMessage, AccessDenied, PermissionGate, DateDisplay } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/providers/auth-provider';
import { hasPermission } from '@/lib/permissions';
import { useHandovers, useCreateHandover, useVerifyHandover } from '@/hooks/useCashbook';
import { useToast } from '@/providers/toast-provider';
import { useUsers } from '@/hooks/useUsers';

export default function HandoversPage() {
  const { user } = useAuth();
  const role = user?.role ?? '';

  if (!hasPermission(role, 'accounting.manage_cashbook')) {
    return <AccessDenied />;
  }

  return <HandoversContent />;
}

function HandoversContent() {
  const { showToast } = useToast();
  const { data: handovers, isLoading, error } = useHandovers();
  const { data: usersData } = useUsers({ page: 1 });
  const createHandover = useCreateHandover();
  const verifyHandover = useVerifyHandover();

  const [amountRupees, setAmountRupees] = useState('');
  const [receivingOfficerId, setReceivingOfficerId] = useState('');
  const [handoverDate, setHandoverDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [formError, setFormError] = useState('');

  const totalAmountPaise = Math.round(parseFloat(amountRupees || '0') * 100);

  // Filter users who can receive handovers (managers, accountants, admins)
  const receivingOfficers = usersData?.data?.filter(
    (u) => ['manager', 'accountant', 'super_admin', 'branch_manager'].includes(u.role) && u.is_active
  ) ?? [];

  async function handleInitiate() {
    setFormError('');
    if (totalAmountPaise <= 0) {
      setFormError('Amount must be greater than zero.');
      return;
    }
    if (!receivingOfficerId) {
      setFormError('Please select a receiving officer.');
      return;
    }
    if (!handoverDate) {
      setFormError('Please select a handover date.');
      return;
    }
    try {
      await createHandover.mutateAsync({ totalAmountPaise, receivingOfficerId, handoverDate });
      showToast({ message: 'Handover initiated.' });
      setAmountRupees('');
      setReceivingOfficerId('');
      setHandoverDate(new Date().toISOString().split('T')[0]);
    } catch (err) {
      setFormError((err as Error).message);
    }
  }

  async function handleVerify(id: string, verificationStatus: 'verified' | 'discrepancy') {
    try {
      await verifyHandover.mutateAsync({ id, verificationStatus });
      showToast({ message: verificationStatus === 'verified' ? 'Handover verified.' : 'Handover marked with discrepancy.' });
    } catch (err) {
      showToast({ message: (err as Error).message, variant: 'error' });
    }
  }

  const pendingHandovers = handovers?.filter((h) => h.verification_status === 'pending') ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm"><Link href="/cashbook"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-2xl font-bold">Cash Handovers</h1>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Initiate Handover</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {formError && (
            <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{formError}</div>
          )}
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
            <label className="text-sm font-medium">Receiving Officer</label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={receivingOfficerId}
              onChange={(e) => setReceivingOfficerId(e.target.value)}
            >
              <option value="">Select receiving officer...</option>
              {receivingOfficers.map((officer) => (
                <option key={officer.id} value={officer.id}>
                  {officer.full_name} ({officer.role})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Handover Date</label>
            <Input
              type="date"
              value={handoverDate}
              onChange={(e) => setHandoverDate(e.target.value)}
            />
          </div>
          <Button onClick={handleInitiate} disabled={createHandover.isPending} className="w-full min-h-[48px] sm:w-auto sm:min-h-[40px]">
            {createHandover.isPending ? 'Submitting…' : 'Initiate Handover'}
          </Button>
        </CardContent>
      </Card>

      <h2 className="text-lg font-semibold">Pending Handovers</h2>

      {isLoading && <div className="flex justify-center py-8"><LoadingSpinner size="lg" /></div>}
      {error && <ErrorMessage message={(error as Error).message} />}

      {handovers && pendingHandovers.length === 0 && (
        <p className="text-center text-muted-foreground py-4">No pending handovers.</p>
      )}

      {pendingHandovers.map((h) => (
        <Card key={h.id}>
          <CardContent className="flex flex-col gap-2 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1 text-sm">
              <div><span className="font-medium">{h.officer_name}</span> — <MoneyDisplay paise={h.total_amount_paise} /></div>
              <div className="text-muted-foreground">
                <DateDisplay date={h.handover_date} /> · Created <DateDisplay date={h.created_at} showTime />
              </div>
            </div>
            <PermissionGate permission="handover.verify">
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="min-h-[44px] w-full sm:w-auto sm:min-h-[36px]"
                  onClick={() => handleVerify(h.id, 'verified')}
                  disabled={verifyHandover.isPending}
                >
                  {verifyHandover.isPending ? 'Processing...' : 'Verify'}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="min-h-[44px] w-full sm:w-auto sm:min-h-[36px]"
                  onClick={() => handleVerify(h.id, 'discrepancy')}
                  disabled={verifyHandover.isPending}
                >
                  Discrepancy
                </Button>
              </div>
            </PermissionGate>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
