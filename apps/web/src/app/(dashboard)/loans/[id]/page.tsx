'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Clock, AlertTriangle } from 'lucide-react';
import { useLoan, useLoanAction } from '@/hooks/useLoans';
import { useCollections, type Collection } from '@/hooks/useCollections';
import { useReceipts } from '@/hooks/useReceipts';
import { usePenalties, useWaivePenalty, type Penalty } from '@/hooks/usePenalties';
import { useUsers } from '@/hooks/useUsers';
import { useGenerateForeclosureQuote, useExecuteForeclosure, usePendingForeclosure, type ForeclosureQuote } from '@/hooks/useForeclosures';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// Status history type
interface StatusTransition {
  id: string;
  from_status: string | null;
  to_status: string;
  changed_by: string;
  changed_by_name?: string;
  reason?: string;
  created_at: string;
}

export default function LoanDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { data: loan, isLoading, error } = useLoan(id);
  const { data: collectionsData } = useCollections({ loanId: id });
  const { data: receiptsData } = useReceipts({ loanId: id });
  const { data: penaltiesData } = usePenalties({ loanId: id });
  const loanAction = useLoanAction();
  const waivePenalty = useWaivePenalty();
  const generateQuote = useGenerateForeclosureQuote();
  const executeForeclosure = useExecuteForeclosure();
  const { data: pendingForeclosure } = usePendingForeclosure(id, !!loan && ['active', 'overdue'].includes(loan.status));
  const { data: usersData } = useUsers();
  const { showToast } = useToast();

  // Status history query
  const { data: statusHistory } = useQuery<StatusTransition[]>({
    queryKey: ['loans', id, 'status-history'],
    queryFn: () => apiClient.get(`/loans/${id}/status-history`),
    enabled: !!id && !!loan,
  });

  // Dialog state
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [disburseOpen, setDisburseOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  // Disbursement mode state
  const [disburseMode, setDisburseMode] = useState<string>('cash');
  const [disburseReference, setDisburseReference] = useState('');

  // Foreclosure state
  const [foreclosureOpen, setForeclosureOpen] = useState(false);
  const [foreclosureQuote, setForeclosureQuote] = useState<ForeclosureQuote | null>(null);
  const [foreclosureConfirmOpen, setForeclosureConfirmOpen] = useState(false);
  const [quoteExpired, setQuoteExpired] = useState(false);

  // Penalty waiver state
  const [waivePenaltyOpen, setWaivePenaltyOpen] = useState(false);
  const [selectedPenalty, setSelectedPenalty] = useState<Penalty | null>(null);
  const [waiveReason, setWaiveReason] = useState('');
  const [waiveApproverId, setWaiveApproverId] = useState('');

  // Reversal state
  const [reversalCollection, setReversalCollection] = useState<Collection | null>(null);

  // Close loan state
  const [closeOpen, setCloseOpen] = useState(false);

  const isActionInProgress = loanAction.isPending || waivePenalty.isPending ||
    generateQuote.isPending || executeForeclosure.isPending;

  // Check quote expiry
  useEffect(() => {
    if (foreclosureQuote) {
      const checkExpiry = () => {
        const expired = new Date(foreclosureQuote.quoteExpiresAt) <= new Date();
        setQuoteExpired(expired);
      };
      checkExpiry();
      const interval = setInterval(checkExpiry, 1000);
      return () => clearInterval(interval);
    }
  }, [foreclosureQuote]);

  async function handleSubmitForReview() {
    setActionError(null);
    try {
      await loanAction.mutateAsync({ id, action: 'submit' });
      showToast({ message: 'Loan submitted for review' });
    } catch (err) {
      setActionError((err as Error).message || 'Failed to submit loan');
    }
  }

  async function handleStartReview() {
    setActionError(null);
    try {
      await loanAction.mutateAsync({ id, action: 'review' });
      showToast({ message: 'Review started' });
    } catch (err) {
      setActionError((err as Error).message || 'Failed to start review');
    }
  }

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
        body: {
          idempotencyKey,
          mode: disburseMode,
          referenceNumber: disburseMode === 'bank_transfer' ? disburseReference : undefined,
        },
      });
      setDisburseOpen(false);
      setDisburseMode('cash');
      setDisburseReference('');
      showToast({ message: 'Loan disbursed successfully' });
    } catch (err) {
      setActionError((err as Error).message || 'Failed to disburse loan');
    }
  }

  async function handleGenerateForeclosureQuote() {
    setActionError(null);
    try {
      // Use existing pending foreclosure if available (maker-checker: different user can execute)
      if (pendingForeclosure) {
        setForeclosureQuote(pendingForeclosure);
        setQuoteExpired(false);
        setForeclosureOpen(true);
        return;
      }
      // Otherwise, generate a new quote
      const quote = await generateQuote.mutateAsync({ loanId: id });
      setForeclosureQuote(quote);
      setQuoteExpired(false);
      setForeclosureOpen(true);
    } catch (err) {
      setActionError((err as Error).message || 'Failed to generate foreclosure quote');
    }
  }

  async function handleExecuteForeclosure() {
    if (!foreclosureQuote || quoteExpired) return;
    setActionError(null);
    try {
      const idempotencyKey = crypto.randomUUID();
      await executeForeclosure.mutateAsync({ foreclosureId: foreclosureQuote.foreclosureId, idempotencyKey });
      setForeclosureConfirmOpen(false);
      setForeclosureOpen(false);
      setForeclosureQuote(null);
      showToast({ message: 'Foreclosure completed. Loan is now closed.' });
    } catch (err) {
      setActionError((err as Error).message || 'Failed to execute foreclosure');
    }
  }

  async function handleWaivePenalty() {
    if (!selectedPenalty || waiveReason.length < 10 || !waiveApproverId) return;
    setActionError(null);
    try {
      await waivePenalty.mutateAsync({ id: selectedPenalty.id, reason: waiveReason, approverId: waiveApproverId });
      setWaivePenaltyOpen(false);
      setSelectedPenalty(null);
      setWaiveReason('');
      setWaiveApproverId('');
      showToast({ message: 'Penalty waived successfully' });
    } catch (err) {
      setActionError((err as Error).message || 'Failed to waive penalty');
    }
  }

  async function handleCloseLoan() {
    setActionError(null);
    try {
      await loanAction.mutateAsync({ id, action: 'close' });
      setCloseOpen(false);
      showToast({ message: 'Loan closed successfully' });
    } catch (err) {
      setActionError((err as Error).message || 'Failed to close loan');
    }
  }

  if (isLoading) return <div className="flex justify-center py-8"><LoadingSpinner size="lg" /></div>;
  if (error) return <ErrorMessage message={(error as Error).message} />;
  if (!loan) return <ErrorMessage message="Loan not found" />;

  const canSubmit = loan.status === 'draft';
  const canReview = loan.status === 'submitted';
  const canApproveReject = loan.status === 'under_review';
  const canDisburse = loan.status === 'approved';
  const canForeclose = loan.status === 'active' || loan.status === 'overdue';

  const penalties = penaltiesData ?? [];
  const pendingPenalties = penalties.filter(p => p.status === 'pending');

  // Loan can be closed only if: active/overdue, zero outstanding, and no pending penalties
  const canClose = (loan.status === 'active' || loan.status === 'overdue') &&
    loan.cached_outstanding_paise != null && Number(loan.cached_outstanding_paise) === 0 &&
    pendingPenalties.length === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px]" asChild>
          <Link href="/loans"><ArrowLeft className="h-5 w-5" /></Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold truncate">{loan.loan_number}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={loan.status} type="loan" />
            {loan.dpd > 0 && (
              <span className="text-sm text-muted-foreground">DPD: {loan.dpd}</span>
            )}
            {loan.overdue_bucket && (
              <span className="text-xs px-2 py-0.5 rounded bg-orange-100 text-orange-700">{loan.overdue_bucket}</span>
            )}
          </div>
        </div>
      </div>

      {/* Action error */}
      {actionError && <ErrorMessage message={actionError} />}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        {canSubmit && (
          <PermissionGate permission="loan.submit">
            <Button
              onClick={handleSubmitForReview}
              disabled={isActionInProgress}
              className="min-h-[44px] flex-1 sm:flex-none"
            >
              Submit for Review
            </Button>
          </PermissionGate>
        )}
        {canReview && (
          <PermissionGate permission="loan.approve">
            <Button
              onClick={handleStartReview}
              disabled={isActionInProgress}
              className="min-h-[44px] flex-1 sm:flex-none"
            >
              Start Review
            </Button>
          </PermissionGate>
        )}
        {canApproveReject && (
          <PermissionGate permission="loan.approve">
            <Button
              onClick={() => setApproveOpen(true)}
              disabled={isActionInProgress}
              className="min-h-[44px] flex-1 sm:flex-none"
            >
              Approve
            </Button>
            <Button
              variant="destructive"
              onClick={() => setRejectOpen(true)}
              disabled={isActionInProgress}
              className="min-h-[44px] flex-1 sm:flex-none"
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
              className="min-h-[44px] flex-1 sm:flex-none"
            >
              Disburse
            </Button>
          </PermissionGate>
        )}
        {canForeclose && (
          <PermissionGate permission="foreclosure.quote">
            <Button
              variant="outline"
              onClick={handleGenerateForeclosureQuote}
              disabled={isActionInProgress}
              className="min-h-[44px] flex-1 sm:flex-none"
            >
              {generateQuote.isPending ? 'Generating…' : 'Foreclosure'}
            </Button>
          </PermissionGate>
        )}
        {canClose && (
          <PermissionGate permission="loan.close">
            <Button
              onClick={() => setCloseOpen(true)}
              disabled={isActionInProgress}
              className="min-h-[44px] flex-1 sm:flex-none bg-green-600 hover:bg-green-700 text-white"
            >
              Close Loan
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
            {/* Mobile Card View */}
            <div className="space-y-3 lg:hidden">
              {loan.schedules.map((inst) => (
                <div key={inst.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">Installment #{inst.installment_number}</p>
                      <p className="text-sm text-muted-foreground">
                        <DateDisplay date={inst.due_date} />
                      </p>
                    </div>
                    <div className="text-right">
                      <MoneyDisplay paise={Number(inst.total_paise)} className="font-semibold" />
                      <StatusBadge status={inst.status} type="installment" className="mt-1" />
                    </div>
                  </div>
                  <div className="mt-2 flex justify-between text-sm text-muted-foreground">
                    <span>P: <MoneyDisplay paise={Number(inst.principal_paise)} /></span>
                    <span>I: <MoneyDisplay paise={Number(inst.interest_paise)} /></span>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table */}
            <div className="hidden lg:block overflow-x-auto">
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
            <>
              {/* Mobile Card View */}
              <div className="space-y-3 lg:hidden">
                {collectionsData.data.map((col) => (
                  <div key={col.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm text-muted-foreground">
                          <DateDisplay date={col.payment_date} />
                        </p>
                        <p className="text-sm capitalize">{col.payment_mode.replace(/_/g, ' ')}</p>
                      </div>
                      <div className="text-right">
                        <MoneyDisplay paise={Number(col.amount_paise)} className="font-semibold" />
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <StatusBadge status={col.status} type="collection" />
                      {col.status === 'posted' && (
                        <PermissionGate permission="collection.reverse">
                          <Button
                            variant="outline"
                            size="sm"
                            className="min-h-[36px]"
                            disabled={isActionInProgress}
                            onClick={() => setReversalCollection(col)}
                          >
                            Reverse
                          </Button>
                        </PermissionGate>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table */}
              <div className="hidden lg:block overflow-x-auto">
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
            </>
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

      {/* Penalties Section */}
      {penalties.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              Penalties
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Date</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                    <th className="px-3 py-2 text-left font-medium hidden sm:table-cell">Period</th>
                    <th className="px-3 py-2 text-left font-medium hidden md:table-cell">Installment</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-3 py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {penalties.map((penalty) => (
                    <tr key={penalty.id} className="border-b last:border-0">
                      <td className="px-3 py-2"><DateDisplay date={penalty.posted_date} /></td>
                      <td className="px-3 py-2 text-right"><MoneyDisplay paise={Number(penalty.amount_paise)} /></td>
                      <td className="px-3 py-2 hidden sm:table-cell">{penalty.period}</td>
                      <td className="px-3 py-2 hidden md:table-cell">
                        {penalty.installment_number ? `#${penalty.installment_number}` : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={penalty.status} type="penalty" />
                      </td>
                      <td className="px-3 py-2 text-right">
                        {penalty.status === 'pending' && (
                          <PermissionGate permission="penalty.waive">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={isActionInProgress}
                              onClick={() => {
                                setSelectedPenalty(penalty);
                                setWaivePenaltyOpen(true);
                              }}
                            >
                              Waive
                            </Button>
                          </PermissionGate>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Status History Timeline */}
      {statusHistory && statusHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Status History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {statusHistory.map((transition, idx) => (
                <div key={transition.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-2 h-2 rounded-full bg-primary mt-2" />
                    {idx < statusHistory.length - 1 && (
                      <div className="w-0.5 flex-1 bg-border mt-1" />
                    )}
                  </div>
                  <div className="flex-1 pb-4">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      {transition.from_status && (
                        <>
                          <StatusBadge status={transition.from_status} type="loan" />
                          <span className="text-muted-foreground">→</span>
                        </>
                      )}
                      <StatusBadge status={transition.to_status} type="loan" />
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      <DateDisplay date={transition.created_at} showTime />
                      {transition.changed_by_name && ` by ${transition.changed_by_name}`}
                    </div>
                    {transition.reason && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Reason: {transition.reason}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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

      {/* Disburse Dialog with Mode Selection */}
      <ConfirmDialog
        open={disburseOpen}
        onOpenChange={(open) => {
          setDisburseOpen(open);
          if (!open) {
            setDisburseMode('cash');
            setDisburseReference('');
          }
        }}
        title="Disburse Loan"
        description={`Disbursing loan ${loan.loan_number}. Principal: ₹${(Number(loan.principal_paise) / 100).toLocaleString('en-IN')}`}
        confirmLabel="Disburse"
        loading={isActionInProgress}
        onConfirm={handleDisburse}
      >
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="disburse-mode">Payment Mode</Label>
            <Select value={disburseMode} onValueChange={setDisburseMode}>
              <SelectTrigger id="disburse-mode">
                <SelectValue placeholder="Select mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {disburseMode === 'bank_transfer' && (
            <div className="space-y-2">
              <Label htmlFor="disburse-reference">Reference Number</Label>
              <Input
                id="disburse-reference"
                placeholder="Enter bank transfer reference…"
                value={disburseReference}
                onChange={(e) => setDisburseReference(e.target.value)}
                disabled={isActionInProgress}
              />
            </div>
          )}
        </div>
      </ConfirmDialog>

      {/* Foreclosure Quote Dialog */}
      <ConfirmDialog
        open={foreclosureOpen}
        onOpenChange={setForeclosureOpen}
        title="Foreclosure Quote"
        description={quoteExpired ? 'Quote expired. Please generate a new quote.' : 'Review the settlement breakdown below.'}
        confirmLabel={quoteExpired ? 'Close' : 'Approve & Execute'}
        loading={executeForeclosure.isPending}
        onConfirm={() => {
          if (quoteExpired) {
            setForeclosureOpen(false);
            setForeclosureQuote(null);
          } else {
            setForeclosureConfirmOpen(true);
          }
        }}
      >
        {foreclosureQuote && (
          <div className="space-y-3 py-2">
            <div className="grid gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Outstanding Principal</span>
                <MoneyDisplay paise={foreclosureQuote.outstandingPrincipalPaise} />
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Accrued Interest</span>
                <MoneyDisplay paise={foreclosureQuote.accruedInterestPaise} />
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pending Penalties</span>
                <MoneyDisplay paise={foreclosureQuote.pendingPenaltiesPaise} />
              </div>
              {foreclosureQuote.rebatePaise > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Rebate</span>
                  <span>-<MoneyDisplay paise={foreclosureQuote.rebatePaise} /></span>
                </div>
              )}
              <div className="flex justify-between font-semibold border-t pt-2 mt-2">
                <span>Settlement Amount</span>
                <MoneyDisplay paise={foreclosureQuote.settlementAmountPaise} />
              </div>
            </div>
            <div className={`text-xs ${quoteExpired ? 'text-destructive' : 'text-muted-foreground'}`}>
              {quoteExpired ? (
                'Quote has expired'
              ) : (
                `Expires: ${new Date(foreclosureQuote.quoteExpiresAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`
              )}
            </div>
          </div>
        )}
      </ConfirmDialog>

      {/* Foreclosure Confirm Dialog */}
      <ConfirmDialog
        open={foreclosureConfirmOpen}
        onOpenChange={setForeclosureConfirmOpen}
        title="Confirm Foreclosure"
        description={`This will close the loan with a final settlement of ₹${foreclosureQuote ? (foreclosureQuote.settlementAmountPaise / 100).toLocaleString('en-IN') : '0'}. This action cannot be undone.`}
        confirmLabel="Execute Foreclosure"
        variant="destructive"
        loading={executeForeclosure.isPending}
        onConfirm={handleExecuteForeclosure}
      />

      {/* Waive Penalty Dialog */}
      <ConfirmDialog
        open={waivePenaltyOpen}
        onOpenChange={(open) => {
          setWaivePenaltyOpen(open);
          if (!open) {
            setSelectedPenalty(null);
            setWaiveReason('');
            setWaiveApproverId('');
          }
        }}
        title="Waive Penalty"
        description={selectedPenalty ? `Waive penalty of ₹${(selectedPenalty.amount_paise / 100).toLocaleString('en-IN')} for ${selectedPenalty.period}` : ''}
        confirmLabel="Waive Penalty"
        loading={waivePenalty.isPending}
        onConfirm={handleWaivePenalty}
      >
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="waive-reason">Reason (min 10 characters)</Label>
            <Input
              id="waive-reason"
              placeholder="Enter reason for waiving penalty…"
              value={waiveReason}
              onChange={(e) => setWaiveReason(e.target.value)}
              disabled={waivePenalty.isPending}
            />
            {waiveReason.length > 0 && waiveReason.length < 10 && (
              <p className="text-xs text-destructive">{10 - waiveReason.length} more characters required</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="waive-approver">Approver</Label>
            <Select value={waiveApproverId} onValueChange={setWaiveApproverId} disabled={waivePenalty.isPending}>
              <SelectTrigger id="waive-approver">
                <SelectValue placeholder="Select approver…" />
              </SelectTrigger>
              <SelectContent>
                {usersData?.data?.filter(u => u.is_active).map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.full_name} ({user.role.replace(/_/g, ' ')})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!waiveApproverId && (
              <p className="text-xs text-muted-foreground">Required: Select user authorizing this waiver</p>
            )}
          </div>
        </div>
      </ConfirmDialog>

      {/* Close Loan Dialog */}
      <ConfirmDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        title="Close Loan"
        description={`This loan has zero outstanding balance. Closing it will mark it as fully settled. This action cannot be undone.`}
        confirmLabel="Close Loan"
        loading={isActionInProgress}
        onConfirm={handleCloseLoan}
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
