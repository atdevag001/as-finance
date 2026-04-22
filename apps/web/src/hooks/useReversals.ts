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
      apiClient.post(
        '/reversals',
        {
          collectionId: data.collectionId,
          reason: data.reason,
        },
        { headers: { 'X-Idempotency-Key': data.idempotencyKey } }
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['collections'] });
      qc.invalidateQueries({ queryKey: ['loans'] });
      qc.invalidateQueries({ queryKey: ['receipts'] });
    },
  });
}
