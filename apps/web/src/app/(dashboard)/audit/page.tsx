'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { LoadingSpinner, ErrorMessage, PaginationControls } from '@/components/shared';
import { Input } from '@/components/ui/input';

interface AuditLog {
  id: string;
  actionType: string;
  actorName: string;
  actorRole: string;
  targetEntity: string;
  targetId: string;
  timestamp: string;
  remarks?: string;
}

interface PaginatedResult { data: AuditLog[]; total: number; page: number; pageSize: number; totalPages: number; }

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [entity, setEntity] = useState('');
  const [startDate, setStartDate] = useState('');

  const query = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (entity) query.set('targetEntity', entity);
  if (startDate) query.set('startDate', startDate);

  const { data, isLoading, error } = useQuery<PaginatedResult>({
    queryKey: ['audit-logs', page, entity, startDate],
    queryFn: () => apiClient.get(`/audit-logs?${query.toString()}`),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Audit Log</h1>

      <div className="flex flex-wrap gap-2">
        <Input placeholder="Filter by entity…" value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }} className="w-48" />
        <Input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1); }} className="w-40" />
      </div>

      {isLoading && <div className="flex justify-center py-8"><LoadingSpinner size="lg" /></div>}
      {error && <ErrorMessage message={(error as Error).message} />}

      {data && (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Timestamp</th>
                  <th className="px-4 py-3 text-left font-medium">Action</th>
                  <th className="px-4 py-3 text-left font-medium hidden sm:table-cell">Actor</th>
                  <th className="px-4 py-3 text-left font-medium hidden md:table-cell">Entity</th>
                  <th className="px-4 py-3 text-left font-medium hidden lg:table-cell">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((log) => (
                  <tr key={log.id} className="border-b last:border-0">
                    <td className="px-4 py-3 whitespace-nowrap">{new Date(log.timestamp).toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 capitalize">{log.actionType.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span>{log.actorName}</span>
                      <span className="ml-1 text-xs text-muted-foreground">({log.actorRole.replace(/_/g, ' ')})</span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="capitalize">{log.targetEntity.replace(/_/g, ' ')}</span>
                      <span className="ml-1 text-xs text-muted-foreground">{log.targetId.slice(0, 8)}</span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">{log.remarks ?? '—'}</td>
                  </tr>
                ))}
                {data.data.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No audit logs found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <PaginationControls page={page} totalPages={data.totalPages} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
