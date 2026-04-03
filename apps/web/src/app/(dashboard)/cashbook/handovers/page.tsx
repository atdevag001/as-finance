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
  const createHandover = useCreateHandover();
  const verifyHandover = useVerifyHandover();

  const [amountRupees, setAmountRupees] = useState('');
  const [remarks, setRemarks] = useState('');
  const [formError, setFormError] = useState('');

  const amountPaise = Math.round(parseFloat(amountRupees || '0') * 100);

  async function handleInitiate() {
    setFormError('');
    if (amountPaise <= 0) {
      setFormError('Amount must be greater than zero.');
      return;
    }
    try {
      await createHandover.mutateAsync({ amountPaise, remarks: remarks.trim() });
      showToast({ message: 'Handover initiated.' });
      setAmountRupees('');
      setRemarks('');
    } catch (err) {
      setFormError((err as Error).message);
    }
  }

  async function handleVerify(id: string) {
    try {
      await verifyHandover.mutateAsync(id);
      showToast({ message: 'Handover verified.' });
    } catch (err) {
      showToast({ message: (err as Error).message, variant: 'error' });
    }
  }

  const pendingHandovers = handovers?.filter((h) => h.status === 'pending') ?? [];

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
            <label className="text-sm font-medium">Remarks</label>
            <Input placeholder="Optional remarks…" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>
          <Button onClick={handleInitiate} disabled={createHandover.isPending} className="w-full sm:w-auto">
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
              <div><span className="font-medium">{h.officer_name}</span> — <MoneyDisplay paise={h.amount_paise} /></div>
              <div className="text-muted-foreground">
                <DateDisplay date={h.created_at} showTime />
                {h.remarks && <> · {h.remarks}</>}
              </div>
            </div>
            <PermissionGate permission="handover.verify">
              <Button
                size="sm"
                onClick={() => handleVerify(h.id)}
                disabled={verifyHandover.isPending}
              >
                {verifyHandover.isPending ? 'Verifying…' : 'Verify'}
              </Button>
            </PermissionGate>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
