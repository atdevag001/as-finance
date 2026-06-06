'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface Penalty {
  id: string;
  loan_id: string;
  installment_id?: string;
  amount_paise: number;
  penalty_period: string;
  calculation_details?: Record<string, unknown>;
  is_paid: boolean;
  is_waived: boolean;
  waived_by?: string;
  waiver_approved_by?: string;
  waived_reason?: string;
  journal_entry_id?: string;
  created_at: string;
}

/** Derive display status from is_paid/is_waived booleans */
export function getPenaltyStatus(penalty: Penalty): 'paid' | 'waived' | 'pending' {
  if (penalty.is_paid) return 'paid';
  if (penalty.is_waived) return 'waived';
  return 'pending';
}

export function usePenalties(params: { loanId: string }) {
  const { loanId } = params;
  return useQuery<Penalty[]>({
    queryKey: ['penalties', loanId],
    queryFn: () => apiClient.get<Penalty[]>(`/penalties/loan/${loanId}`),
    enabled: !!loanId,
  });
}

export function useWaivePenalty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason, approverId }: { id: string; reason: string; approverId: string }) =>
      apiClient.post(`/penalties/${id}/waive`, { reason, approverId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['penalties'] });
      qc.invalidateQueries({ queryKey: ['loans'] });
      // Waiver posts a journal entry; refresh accounting reports.
      qc.invalidateQueries({ queryKey: ['accounting'] });
      // Waiver reduces Total Outstanding KPI shown on the dashboard.
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
