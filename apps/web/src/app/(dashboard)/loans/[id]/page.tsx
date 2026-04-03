'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useLoan, useLoanAction } from '@/hooks/useLoans';
import { useCollections, type Collection } from '@/hooks/useCollections';
import { useReceipts } from '@/hooks/useReceipts';
import { useToast } from '@/providers/toast-provider';
import {
  StatusBadge,
  MoneyDisplay,
  LoadingSpinner,
  ErrorMessage,
  DateDisplay,
  PermissionGate,
  ConfirmDialog,
  ReversalDialog,
} from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoanDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { data: loan, isLoading, error } = useLoan(id);
  const { data: collectionsData } = useCollections({ loanId: id });
  const { data: receiptsData } = useReceipts({ loanId: id });
  const loanAction = useLoanAction();
  const { showToast } = useToast();

  // Dialog state
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [disburseOpen, setDisburseOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  // Reversal state (to be wired to reversal dialog in task 8.4)
  const [reversalCollection, setReversalCollection] = useState<Collection | null>(null);

  const isActionInProgress = loanAction.isPending;

  async function handleApprove() {
    setActionError(null);
    try {
      await loanAction.mutateAsync({ id, action: 'approve' });
      setApproveOpen(false);
      showToast({ message: 'Loan approved successfully' });
    } catch (err) {
      setActionError((err as Error).message || 'Failed to approve loan');
    }
  }

  async function handleReject() {
    setActionError(null);
    try {
      await loanAction.mutateAsync({ id, action: 'reject', body: { reason: rejectReason } });
      setRejectOpen(false);
      setRejectReason('');
      showToast({ message: 'Loan rejected' });
    } catch (err) {
      setActionError((err as Error).message || 'Failed to reject loan');
    }
  }

  async function handleDisburse() {
    setActionError(null);
    try {
      const idempotencyKey = crypto.randomUUID();
      await loanAction.mutateAsync({
        id,
        action: 'disburse',
        body: { idempotencyKey },
      });
      setDisburseOpen(false);
      showToast({ message: 'Loan disbursed successfully' });
    } catch (err) {
      setActionError((err as Error).message || 'Failed to disburse loan');
    }
  }

  if (isLoading) return <div className="flex justify-center py-8"><LoadingSpinner size="lg" /></div>;
  if (error) return <ErrorMessage message={(error as Error).message} />;
  if (!loan) return <ErrorMessage message="Loan not found" />;

  const canApproveReject = loan.status === 'submitted' || loan.status === 'under_review';
  const canDisburse = loan.status === 'approved';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/loans"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{loan.loan_number}</h1>
          <StatusBadge status={loan.status} type="loan" />
        </div>
      </div>

      {/* Action error */}
      {actionError && <ErrorMessage message={actionError} />}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        {canApproveReject && (
          <PermissionGate permission="loan.approve">
            <Button
              onClick={() => setApproveOpen(true)}
              disabled={isActionInProgress}
            >
              Approve
            </Button>
            <Button
              variant="destructive"
              onClick={() => setRejectOpen(true)}
              disabled={isActionInProgress}
            >
              Reject
            </Button>
          </PermissionGate>
        )}
        {canDisburse && (
          <PermissionGate permission="loan.disburse">
            <Button
              onClick={() => setDisburseOpen(true)}
              disabled={isActionInProgress}
            >
              Disburse
            </Button>
          </PermissionGate>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-base">Principal</CardTitle></CardHeader>
          <CardContent><MoneyDisplay paise={Number(loan.principal_paise)} className="text-xl font-semibold" /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Outstanding</CardTitle></CardHeader>
          <CardContent>
            {loan.cached_outstanding_paise != null
              ? <MoneyDisplay paise={Number(loan.cached_outstanding_paise)} className="text-xl font-semibold" />
              : <span className="text-muted-foreground">—</span>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Tenure</CardTitle></CardHeader>
          <CardContent><span className="text-xl font-semibold">{loan.tenure_months} months</span></CardContent>
        </Card>
      </div>

      {/* Details card */}
      <Card>
        <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <Row label="Purpose" value={loan.purpose} />
          <Row label="DPD" value={String(loan.dpd)} />
          {loan.disbursement_date && <Row label="Disbursement Date" value={String(loan.disbursement_date).slice(0, 10)} />}
          {loan.first_due_date && <Row label="First Due Date" value={String(loan.first_due_date).slice(0, 10)} />}
          {loan.last_due_date && <Row label="Last Due Date" value={String(loan.last_due_date).slice(0, 10)} />}
          {loan.total_interest_paise != null && (
            <div className="flex justify-between"><span className="text-muted-foreground">Total Interest</span><MoneyDisplay paise={Number(loan.total_interest_paise)} /></div>
          )}
          {loan.processing_fee_paise != null && (
            <div className="flex justify-between"><span className="text-muted-foreground">Processing Fee</span><MoneyDisplay paise={Number(loan.processing_fee_paise)} /></div>
          )}
        </CardContent>
      </Card>

      {/* Repayment Schedule */}
      {loan.schedules && loan.schedules.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Repayment Schedule</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">#</th>
                    <th className="px-3 py-2 text-left font-medium">Due Date</th>
                    <th className="px-3 py-2 text-right font-medium">Principal</th>
                    <th className="px-3 py-2 text-right font-medium">Interest</th>
                    <th className="px-3 py-2 text-right font-medium">Total</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loan.schedules.map((inst) => (
                    <tr key={inst.id} className="border-b last:border-0">
                      <td className="px-3 py-2">{inst.installment_number}</td>
                      <td className="px-3 py-2"><DateDisplay date={inst.due_date} /></td>
                      <td className="px-3 py-2 text-right"><MoneyDisplay paise={Number(inst.principal_paise)} /></td>
                      <td className="px-3 py-2 text-right"><MoneyDisplay paise={Number(inst.interest_paise)} /></td>
                      <td className="px-3 py-2 text-right"><MoneyDisplay paise={Number(inst.total_paise)} /></td>
                      <td className="px-3 py-2"><StatusBadge status={inst.status} type="installment" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Collection History */}
      <Card>
        <CardHeader><CardTitle className="text-base">Collection History</CardTitle></CardHeader>
        <CardContent>
          {collectionsData && collectionsData.data.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Date</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                    <th className="px-3 py-2 text-left font-medium">Mode</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-3 py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {collectionsData.data.map((col) => (
                    <tr key={col.id} className="border-b last:border-0">
                      <td className="px-3 py-2"><DateDisplay date={col.payment_date} /></td>
                      <td className="px-3 py-2 text-right"><MoneyDisplay paise={Number(col.amount_paise)} /></td>
                      <td className="px-3 py-2 capitalize">{col.payment_mode.replace(/_/g, ' ')}</td>
                      <td className="px-3 py-2"><StatusBadge status={col.status} type="collection" /></td>
                      <td className="px-3 py-2 text-right">
                        {col.status === 'posted' && (
                          <PermissionGate permission="collection.reverse">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={isActionInProgress}
                              onClick={() => setReversalCollection(col)}
                            >
                              Reverse
                            </Button>
                          </PermissionGate>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No collections recorded yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Receipts */}
      <Card>
        <CardHeader><CardTitle className="text-base">Receipts</CardTitle></CardHeader>
        <CardContent>
          {receiptsData && receiptsData.data.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Receipt #</th>
                    <th className="px-3 py-2 text-left font-medium">Date</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                    <th className="px-3 py-2 text-left font-medium">Mode</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {receiptsData.data.map((receipt) => (
                    <tr key={receipt.id} className="border-b last:border-0">
                      <td className="px-3 py-2">
                        <Link href={`/receipts/${receipt.id}`} className="text-primary hover:underline">
                          {receipt.receipt_number}
                        </Link>
                      </td>
                      <td className="px-3 py-2"><DateDisplay date={receipt.payment_date} /></td>
                      <td className="px-3 py-2 text-right"><MoneyDisplay paise={Number(receipt.amount_paise)} /></td>
                      <td className="px-3 py-2 capitalize">{receipt.payment_mode.replace(/_/g, ' ')}</td>
                      <td className="px-3 py-2">
                        <StatusBadge
                          status={receipt.status}
                          type="collection"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No receipts yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Approve Dialog */}
      <ConfirmDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        title="Approve Loan"
        description={`Are you sure you want to approve loan ${loan.loan_number}?`}
        confirmLabel="Approve"
        loading={isActionInProgress}
        onConfirm={handleApprove}
      />

      {/* Reject Dialog */}
      <ConfirmDialog
        open={rejectOpen}
        onOpenChange={(open) => {
          setRejectOpen(open);
          if (!open) setRejectReason('');
        }}
        title="Reject Loan"
        description={`Provide a reason for rejecting loan ${loan.loan_number}.`}
        confirmLabel="Reject"
        variant="destructive"
        loading={isActionInProgress}
        onConfirm={handleReject}
      >
        <div className="space-y-2 py-2">
          <Label htmlFor="reject-reason">Reason</Label>
          <Input
            id="reject-reason"
            placeholder="Enter rejection reason…"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            disabled={isActionInProgress}
          />
        </div>
      </ConfirmDialog>

      {/* Disburse Dialog */}
      <ConfirmDialog
        open={disburseOpen}
        onOpenChange={setDisburseOpen}
        title="Disburse Loan"
        description={`Are you sure you want to disburse loan ${loan.loan_number}? Principal: ₹${(Number(loan.principal_paise) / 100).toLocaleString('en-IN')}`}
        confirmLabel="Disburse"
        loading={isActionInProgress}
        onConfirm={handleDisburse}
      />

      {/* Reversal dialog */}
      <ReversalDialog
        open={!!reversalCollection}
        onOpenChange={(open) => { if (!open) setReversalCollection(null); }}
        collection={reversalCollection}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value ?? '—'}</span>
    </div>
  );
}
