'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface ForeclosureQuote {
  id: string;
  loan_id: string;
  outstanding_principal_paise: number;
  accrued_interest_paise: number;
  pending_penalties_paise: number;
  rebate_paise: number;
  settlement_amount_paise: number;
  expires_at: string;
  status: string;
}

export function useGenerateForeclosureQuote() {
  return useMutation<ForeclosureQuote, Error, { loanId: string }>({
    mutationFn: ({ loanId }) =>
      apiClient.post<ForeclosureQuote>('/foreclosures/quote', { loanId }),
  });
}

export function useExecuteForeclosure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, idempotencyKey }: { id: string; idempotencyKey: string }) =>
      apiClient.post(`/foreclosures/${id}/execute`, { idempotencyKey }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loans'] });
      qc.invalidateQueries({ queryKey: ['collections'] });
    },
  });
}
