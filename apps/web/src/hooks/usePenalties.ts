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

export interface CalculatePenaltyInput {
  loanId: string;
  installmentId: string;
  /** Period identifier matching backend regex /^[A-Za-z0-9_-]+$/, e.g. "2026-01" or "2026-W05". */
  penaltyPeriod: string;
  /** Optional ISO 8601 reference date; backend defaults to "now" when omitted. */
  referenceDate?: string;
}

/** Manually post a penalty for an overdue installment (SUPER_ADMIN / MANAGER). */
export function useCalculatePenalty() {
  const qc = useQueryClient();
  return useMutation<Penalty, Error, CalculatePenaltyInput>({
    mutationFn: (input) => apiClient.post<Penalty>('/penalties/calculate', input),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['penalties', vars.loanId] });
      qc.invalidateQueries({ queryKey: ['loans', vars.loanId] });
      // Penalty posts a journal entry and changes outstanding balance.
      qc.invalidateQueries({ queryKey: ['accounting'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
