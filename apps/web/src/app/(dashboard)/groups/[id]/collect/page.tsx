'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { MoneyDisplay, LoadingSpinner, ErrorMessage } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface GroupMember { id: string; customer_name: string; loan_id?: string; loan_number?: string; outstanding_paise?: number; }
interface GroupDetail { id: string; name: string; members: GroupMember[]; }

export default function GroupCollectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const qc = useQueryClient();
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  const { data: group, isLoading, error } = useQuery<GroupDetail>({
    queryKey: ['groups', id],
    queryFn: () => apiClient.get(`/groups/${id}`),
    enabled: !!id,
  });

  const mutation = useMutation({
    mutationFn: (body: unknown) => apiClient.post(`/groups/${id}/collections`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] });
      qc.invalidateQueries({ queryKey: ['collections'] });
      qc.invalidateQueries({ queryKey: ['loans'] });
      router.push(`/groups/${id}`);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const memberBreakdown = (group?.members ?? [])
      .filter((m) => m.loan_id && amounts[m.id] && Number(amounts[m.id]) > 0)
      .map((m) => ({
        loanId: m.loan_id!,
        amountPaise: Math.round(Number(amounts[m.id]) * 100),
      }));
    if (memberBreakdown.length === 0) return;
    const totalAmountPaise = memberBreakdown.reduce((sum, item) => sum + item.amountPaise, 0);
    mutation.mutate({
      totalAmountPaise,
      collectionDate: new Date().toISOString().slice(0, 10),
      paymentMode: 'cash',
      memberBreakdown,
      idempotencyKey: crypto.randomUUID(),
    });
  }

  if (isLoading) return <div className="flex justify-center py-8"><LoadingSpinner size="lg" /></div>;
  if (error) return <ErrorMessage message={(error as Error).message} />;
  if (!group) return <ErrorMessage message="Group not found" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild><Link href={`/groups/${id}`}><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-2xl font-bold">Collect — {group.name}</h1>
      </div>

      {mutation.error && <ErrorMessage message={(mutation.error as Error).message} />}

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader><CardTitle className="text-base">Member Payments</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {group.members.map((m) => (
              <div key={m.id} className="rounded-lg border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground">{m.customer_name}</p>
                    <p className="text-sm text-muted-foreground">{m.loan_number ?? 'No active loan'}</p>
                    {m.outstanding_paise != null && (
                      <p className="mt-1 text-sm font-medium text-primary">
                        Due: <MoneyDisplay paise={m.outstanding_paise} />
                      </p>
                    )}
                  </div>
                  {m.loan_id && (
                    <div className="shrink-0">
                      <Input
                        type="number"
                        inputMode="decimal"
                        placeholder="₹ Amount"
                        className="w-32 text-right font-medium"
                        value={amounts[m.id] ?? ''}
                        onChange={(e) => setAmounts((prev) => ({ ...prev, [m.id]: e.target.value }))}
                      />
                      {m.outstanding_paise != null && (
                        <button
                          type="button"
                          className="mt-1 text-xs text-primary hover:underline"
                          onClick={() => setAmounts((prev) => ({ ...prev, [m.id]: String((m.outstanding_paise ?? 0) / 100) }))}
                        >
                          Fill due amount
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Running Total - Sticky on mobile */}
        <div className="sticky bottom-20 mt-4 rounded-lg border bg-background p-4 shadow-lg lg:static lg:bottom-auto lg:shadow-none">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Collection</p>
              <p className="text-2xl font-bold">
                <MoneyDisplay
                  paise={Math.round(Object.values(amounts).reduce((sum, val) => sum + (Number(val) || 0), 0) * 100)}
                />
              </p>
            </div>
            <Button type="submit" disabled={mutation.isPending} className="min-h-[48px] min-w-[140px] text-base">
              {mutation.isPending ? 'Posting…' : 'Post Collection'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
