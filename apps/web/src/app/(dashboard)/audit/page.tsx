'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { LoadingSpinner, ErrorMessage, PaginationControls } from '@/components/shared';
import { Input } from '@/components/ui/input';

interface AuditLog {
  id: string;
  action_type: string;
  actor_id: string;
  actor_role: string;
  target_entity: string;
  target_id: string;
  created_at: string;
  remarks?: string;
}

interface PaginatedResult { data: AuditLog[]; total: number; }

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [entity, setEntity] = useState('');
  const [startDate, setStartDate] = useState('');

  const query = new URLSearchParams({ skip: String((page - 1) * 20), take: '20' });
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
                    <td className="px-4 py-3 whitespace-nowrap">{new Date(log.created_at).toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 capitalize">{log.action_type.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span>{log.actor_id.slice(0, 8)}</span>
                      <span className="ml-1 text-xs text-muted-foreground">({log.actor_role.replace(/_/g, ' ')})</span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="capitalize">{log.target_entity.replace(/_/g, ' ')}</span>
                      <span className="ml-1 text-xs text-muted-foreground">{log.target_id.slice(0, 8)}</span>
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
          <PaginationControls page={page} totalPages={Math.ceil((data.total || 0) / 20)} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
