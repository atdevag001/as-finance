'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface ForeclosureQuote {
  foreclosureId: string;
  loanId: string;
  loanNumber: string;
  outstandingPrincipalPaise: number;
  accruedInterestPaise: number;
  pendingPenaltiesPaise: number;
  rebatePaise: number;
  settlementAmountPaise: number;
  quoteExpiresAt: string;
  status: string;
  // Legacy snake_case aliases for backward compatibility
  id?: string;
  settlement_amount_paise?: number;
  expires_at?: string;
}

// Database format (snake_case) for pending foreclosure from API
interface PendingForeclosureRaw {
  id: string;
  loan_id: string;
  outstanding_principal_paise: number;
  accrued_interest_paise: number;
  pending_penalties_paise: number;
  rebate_paise: number;
  settlement_amount_paise: number;
  quote_expires_at: string;
  status: string;
  requested_by: string;
}

function transformPendingForeclosure(raw: PendingForeclosureRaw): ForeclosureQuote {
  return {
    foreclosureId: raw.id,
    loanId: raw.loan_id,
    loanNumber: '',
    outstandingPrincipalPaise: Number(raw.outstanding_principal_paise),
    accruedInterestPaise: Number(raw.accrued_interest_paise),
    pendingPenaltiesPaise: Number(raw.pending_penalties_paise),
    rebatePaise: Number(raw.rebate_paise),
    settlementAmountPaise: Number(raw.settlement_amount_paise),
    quoteExpiresAt: raw.quote_expires_at,
    status: raw.status,
  };
}

export function usePendingForeclosure(loanId: string, enabled = true) {
  return useQuery<ForeclosureQuote | null>({
    queryKey: ['foreclosures', 'pending', loanId],
    queryFn: async () => {
      const raw = await apiClient.get<PendingForeclosureRaw | null>(`/foreclosures/loan/${loanId}/pending`);
      return raw ? transformPendingForeclosure(raw) : null;
    },
    enabled,
    staleTime: 30_000, // Consider fresh for 30 seconds
  });
}

export function useGenerateForeclosureQuote() {
  return useMutation<ForeclosureQuote, Error, { loanId: string }>({
    mutationFn: ({ loanId }) =>
      apiClient.post<ForeclosureQuote>('/foreclosures/quote', { loanId }),
  });
}

export interface ExecuteForeclosureInput {
  foreclosureId: string;
  paymentMode: string;
  idempotencyKey: string;
  rebatePaise?: number;
  rebateReason?: string;
  rebateAuthorizedBy?: string;
}

export function useExecuteForeclosure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ExecuteForeclosureInput) =>
      apiClient.post('/foreclosures', input),
    onSuccess: () => {
      // Foreclosure marks penalties paid, writes receipt + status-history; invalidate those caches too.
      qc.invalidateQueries({ queryKey: ['loans'] });
      qc.invalidateQueries({ queryKey: ['loan'] });
      qc.invalidateQueries({ queryKey: ['collections'] });
      qc.invalidateQueries({ queryKey: ['foreclosures'] });
      qc.invalidateQueries({ queryKey: ['penalties'] });
      qc.invalidateQueries({ queryKey: ['receipts'] });
      qc.invalidateQueries({ queryKey: ['status-history'] });
      // Foreclosure settlement posts journal entries; refresh accounting reports.
      qc.invalidateQueries({ queryKey: ['accounting'] });
    },
  });
}
