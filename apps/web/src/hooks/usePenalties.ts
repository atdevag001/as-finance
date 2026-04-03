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

interface PaginatedResult<T> {
  data: T[];
  total: number;
}

export function usePenalties(params: { loanId: string }) {
  const { loanId } = params;
  return useQuery<PaginatedResult<Penalty>>({
    queryKey: ['penalties', loanId],
    queryFn: () => apiClient.get(`/penalties?loanId=${loanId}`),
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
