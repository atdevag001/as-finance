'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { MoneyDisplay } from './money-display';
import { DateDisplay } from './date-display';
import { useCreateReversal } from '@/hooks/useReversals';
import { useToast } from '@/providers/toast-provider';

export interface ReversalCollection {
  id: string;
  amount_paise: number;
  payment_date: string;
  loan_number?: string;
  loan?: { loan_number: string };
}

interface ReversalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collection: ReversalCollection | null;
}

const MIN_REASON_LENGTH = 10;

export function ReversalDialog({ open, onOpenChange, collection }: ReversalDialogProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const createReversal = useCreateReversal();
  const { showToast } = useToast();
  // Same key reused across retries so backend idempotency cache catches duplicate clicks.
  const idempotencyKeyRef = useRef<string | null>(null);

  const isProcessing = createReversal.isPending;
  const isReasonValid = reason.trim().length >= MIN_REASON_LENGTH;
  const loanNumber = collection?.loan?.loan_number ?? collection?.loan_number ?? '—';

  useEffect(() => {
    if (open && collection && idempotencyKeyRef.current === null) {
      idempotencyKeyRef.current = crypto.randomUUID();
    }
  }, [open, collection]);

  function handleClose(nextOpen: boolean) {
    if (isProcessing) return;
    if (!nextOpen) {
      setReason('');
      setError(null);
      idempotencyKeyRef.current = null;
    }
    onOpenChange(nextOpen);
  }

  async function handleConfirm() {
    if (!collection || !isReasonValid) return;
    setError(null);
    if (idempotencyKeyRef.current === null) {
      idempotencyKeyRef.current = crypto.randomUUID();
    }
    try {
      await createReversal.mutateAsync({
        collectionId: collection.id,
        reason: reason.trim(),
        idempotencyKey: idempotencyKeyRef.current,
      });
      showToast({ message: 'Collection reversed successfully' });
      setReason('');
      setError(null);
      idempotencyKeyRef.current = null;
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message || 'Failed to reverse collection');
    }
  }

  if (!collection) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reverse Collection</DialogTitle>
          <DialogDescription>
            This will create compensating entries to reverse the collection. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {/* Collection details for verification */}
        <div className="rounded-md border bg-muted/30 p-3 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Loan Number</span>
            <span className="font-medium">{loanNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Amount</span>
            <MoneyDisplay paise={Number(collection.amount_paise)} className="font-medium" />
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Date</span>
            <DateDisplay date={collection.payment_date} />
          </div>
        </div>

        {/* Reason field */}
        <div className="space-y-2">
          <Label htmlFor="reversal-reason">
            Reason <span className="text-muted-foreground">(min {MIN_REASON_LENGTH} characters)</span>
          </Label>
          <textarea
            id="reversal-reason"
            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="Enter reason for reversal (minimum 10 characters)…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={isProcessing}
          />
          {reason.length > 0 && !isReasonValid && (
            <p className="text-xs text-destructive">
              Reason must be at least {MIN_REASON_LENGTH} characters ({reason.trim().length}/{MIN_REASON_LENGTH})
            </p>
          )}
        </div>

        {/* Error message */}
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={isProcessing}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isProcessing || !isReasonValid}
          >
            {isProcessing ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Reversing…
              </span>
            ) : (
              'Reverse'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
