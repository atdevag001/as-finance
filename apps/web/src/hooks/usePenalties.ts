'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface Penalty {
  id: string;
  loan_id: string;
  installment_id?: string;
  installment_number?: number;
  amount_paise: number;
  period: string;
  status: string;
  posted_date: string;
  waived_at?: string;
  waived_by?: string;
  waive_reason?: string;
  created_at: string;
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
    mutationFn: ({ id, reason, approver }: { id: string; reason: string; approver?: string }) =>
      apiClient.post(`/penalties/${id}/waive`, { reason, approver }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['penalties'] });
      qc.invalidateQueries({ queryKey: ['loans'] });
    },
  });
}
