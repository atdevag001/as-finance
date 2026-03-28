'use client';

import { use } from 'react';
import Link from 'next/link';
import { ArrowLeft, Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { StatusBadge, MoneyDisplay, LoadingSpinner, ErrorMessage } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface GroupMember { id: string; customerName: string; loanNumber?: string; outstandingPaise?: number; status: string; }
interface GroupDetail {
  id: string; name: string; status: string; meetingDay?: string; meetingTime?: string;
  officerName?: string; members: GroupMember[];
}

export default function GroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: group, isLoading, error } = useQuery<GroupDetail>({
    queryKey: ['groups', id],
    queryFn: () => apiClient.get(`/groups/${id}`),
    enabled: !!id,
  });

  if (isLoading) return <div className="flex justify-center py-8"><LoadingSpinner size="lg" /></div>;
  if (error) return <ErrorMessage message={(error as Error).message} />;
  if (!group) return <ErrorMessage message="Group not found" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild><Link href="/groups"><ArrowLeft className="h-4 w-4" /></Link></Button>
          <div>
            <h1 className="text-2xl font-bold">{group.name}</h1>
            <StatusBadge status={group.status === 'active' ? 'active' : 'closed'} type="loan" label={group.status} />
          </div>
        </div>
        <Button asChild><Link href={`/groups/${id}/collect`}><Users className="mr-2 h-4 w-4" />Group Collection</Link></Button>
      </div>

      <div className="grid gap-2 text-sm sm:grid-cols-3">
        {group.meetingDay && <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Meeting Day</CardTitle></CardHeader><CardContent className="capitalize">{group.meetingDay}</CardContent></Card>}
        {group.meetingTime && <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Meeting Time</CardTitle></CardHeader><CardContent>{group.meetingTime}</CardContent></Card>}
        {group.officerName && <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Officer</CardTitle></CardHeader><CardContent>{group.officerName}</CardContent></Card>}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Members ({group.members.length})</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Customer</th>
                  <th className="px-3 py-2 text-left font-medium">Loan #</th>
                  <th className="px-3 py-2 text-right font-medium">Outstanding</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {group.members.map((m) => (
                  <tr key={m.id} className="border-b last:border-0">
                    <td className="px-3 py-2">{m.customerName}</td>
                    <td className="px-3 py-2">{m.loanNumber ?? '—'}</td>
                    <td className="px-3 py-2 text-right">{m.outstandingPaise != null ? <MoneyDisplay paise={m.outstandingPaise} /> : '—'}</td>
                    <td className="px-3 py-2"><StatusBadge status={m.status} type="loan" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
