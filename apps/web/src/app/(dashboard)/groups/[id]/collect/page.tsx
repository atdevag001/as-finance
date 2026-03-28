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

interface GroupMember { id: string; customerName: string; loanId?: string; loanNumber?: string; duePaise?: number; }
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
      router.push(`/groups/${id}`);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payments = (group?.members ?? [])
      .filter((m) => m.loanId && amounts[m.id] && Number(amounts[m.id]) > 0)
      .map((m) => ({
        loanId: m.loanId,
        amountPaise: Number(amounts[m.id]),
        paymentMode: 'cash' as const,
      }));
    if (payments.length === 0) return;
    mutation.mutate({ payments, paymentDate: new Date().toISOString().slice(0, 10), idempotencyKey: crypto.randomUUID() });
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
          <CardContent className="space-y-3">
            {group.members.map((m) => (
              <div key={m.id} className="flex flex-col gap-2 border-b pb-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">{m.customerName}</p>
                  <p className="text-xs text-muted-foreground">{m.loanNumber ?? 'No active loan'}</p>
                  {m.duePaise != null && <p className="text-xs">Due: <MoneyDisplay paise={m.duePaise} /></p>}
                </div>
                {m.loanId && (
                  <Input
                    type="number"
                    inputMode="numeric"
                    placeholder="Amount (paise)"
                    className="w-40"
                    value={amounts[m.id] ?? ''}
                    onChange={(e) => setAmounts((prev) => ({ ...prev, [m.id]: e.target.value }))}
                  />
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="mt-4 flex justify-end">
          <Button type="submit" disabled={mutation.isPending} className="min-w-[180px]">
            {mutation.isPending ? 'Posting…' : 'Post Group Collection'}
          </Button>
        </div>
      </form>
    </div>
  );
}
