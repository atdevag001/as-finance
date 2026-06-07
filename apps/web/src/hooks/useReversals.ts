'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface CreateReversalInput {
  collectionId: string;
  reason: string;
  idempotencyKey: string;
}

export function useCreateReversal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateReversalInput) =>
      apiClient.post('/reversals', {
        collectionId: data.collectionId,
        reason: data.reason,
        idempotencyKey: data.idempotencyKey,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['collections'] });
      qc.invalidateQueries({ queryKey: ['loans'] });
      // Loan detail page reads ['loan', id] separately from ['loans']; reversal mutates cached_outstanding_paise/dpd/overdue_bucket.
      qc.invalidateQueries({ queryKey: ['loan'] });
      qc.invalidateQueries({ queryKey: ['receipts'] });
      qc.invalidateQueries({ queryKey: ['penalties'] });
      qc.invalidateQueries({ queryKey: ['status-history'] });
      // Reversal writes a 'collection_reversed' audit row that must surface immediately on the loan detail audit panel.
      qc.invalidateQueries({ queryKey: ['audit-logs'] });
      qc.invalidateQueries({ queryKey: ['accounting'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
