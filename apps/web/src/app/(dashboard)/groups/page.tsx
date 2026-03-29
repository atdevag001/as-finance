'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { StatusBadge, LoadingSpinner, ErrorMessage, PaginationControls } from '@/components/shared';
import { Button } from '@/components/ui/button';

interface Group { id: string; name: string; status: string; memberCount: number; meetingDay?: string; createdAt: string; }
interface PaginatedResult { data: Group[]; total: number; page: number; pageSize: number; totalPages: number; }

export default function GroupsPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useQuery<PaginatedResult>({
    queryKey: ['groups', page],
    queryFn: () => apiClient.get(`/groups?skip=${(page - 1) * 20}&take=20`),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Groups</h1>
        <Button asChild><Link href="#"><Plus className="mr-2 h-4 w-4" />New Group</Link></Button>
      </div>

      {isLoading && <div className="flex justify-center py-8"><LoadingSpinner size="lg" /></div>}
      {error && <ErrorMessage message={(error as Error).message} />}

      {data && (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-right font-medium">Members</th>
                  <th className="px-4 py-3 text-left font-medium hidden sm:table-cell">Meeting Day</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((g) => (
                  <tr key={g.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <Link href={`/groups/${g.id}`} className="font-medium text-primary hover:underline">{g.name}</Link>
                    </td>
                    <td className="px-4 py-3 text-right">{g.memberCount}</td>
                    <td className="px-4 py-3 hidden sm:table-cell capitalize">{g.meetingDay ?? '—'}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={g.status === 'active' ? 'active' : g.status === 'dissolved' ? 'closed' : 'draft'} type="loan" label={g.status} />
                    </td>
                  </tr>
                ))}
                {data.data.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No groups found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <PaginationControls page={page} totalPages={Math.ceil((data.total || 0) / 20)} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
