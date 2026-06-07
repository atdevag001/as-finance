'use client';

import { useState } from 'react';
import { LoadingSpinner, ErrorMessage, PaginationControls, AccessDenied, DateDisplay } from '@/components/shared';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/providers/auth-provider';
import { hasPermission } from '@/lib/permissions';
import { useAuditLogs } from '@/hooks/useAuditLogs';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { AuditAction } from '@as-finance/shared/enums';

// Matches the `target_entity` strings the backend writes (see audit-emitting services).
const TARGET_ENTITIES = [
  'customer',
  'loan',
  'collection',
  'penalty',
  'foreclosure',
  'expense',
  'cash_handover',
  'user',
  'setting',
] as const;

// A Select cannot use '' as an item value, so we represent "no filter" with this sentinel.
const ALL = '__all__';

export default function AuditPage() {
  const { user } = useAuth();
  const role = user?.role ?? '';

  if (!hasPermission(role, 'audit.read')) {
    return <AccessDenied />;
  }

  return <AuditContent />;
}

function AuditContent() {
  const [page, setPage] = useState(1);
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Debounce date inputs so partial values (e.g. "2024-01-0") don't each fire a request.
  const debouncedStartDate = useDebouncedValue(startDate, 300);
  const debouncedEndDate = useDebouncedValue(endDate, 300);

  const { data, isLoading, error } = useAuditLogs({
    page,
    entity: entity || undefined,
    action: action || undefined,
    startDate: debouncedStartDate || undefined,
    endDate: debouncedEndDate || undefined,
  });

  function handleSelectChange(setter: (v: string) => void) {
    return (value: string) => {
      setter(value === ALL ? '' : value);
      setPage(1);
    };
  }

  function handleDateChange(setter: (v: string) => void) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setter(e.target.value);
      setPage(1);
    };
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Audit Log</h1>

      <div className="flex flex-wrap gap-2">
        <Select value={entity || ALL} onValueChange={handleSelectChange(setEntity)}>
          <SelectTrigger className="w-48" aria-label="Filter by entity">
            <SelectValue placeholder="All entities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All entities</SelectItem>
            {TARGET_ENTITIES.map((e) => (
              <SelectItem key={e} value={e} className="capitalize">
                {e.replace(/_/g, ' ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={action || ALL} onValueChange={handleSelectChange(setAction)}>
          <SelectTrigger className="w-56" aria-label="Filter by action">
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All actions</SelectItem>
            {Object.values(AuditAction).map((a) => (
              <SelectItem key={a} value={a} className="capitalize">
                {a.replace(/_/g, ' ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="date" value={startDate} onChange={handleDateChange(setStartDate)} className="w-40" aria-label="Start date" />
        <Input type="date" value={endDate} onChange={handleDateChange(setEndDate)} className="w-40" aria-label="End date" />
      </div>

      {isLoading && <div className="flex justify-center py-8"><LoadingSpinner size="lg" /></div>}
      {error && <ErrorMessage message={(error as Error).message} />}

      {data && (
        <>
          {/* Mobile Card View */}
          <div className="space-y-3 lg:hidden">
            {data.data.map((log) => (
              <div key={log.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium capitalize">{log.action_type.replace(/_/g, ' ')}</p>
                    <p className="text-sm text-muted-foreground capitalize">
                      {log.target_entity.replace(/_/g, ' ')}
                    </p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground shrink-0">
                    <DateDisplay date={log.created_at} showTime />
                  </div>
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  <span className="capitalize">{log.actor_role.replace(/_/g, ' ')}</span>
                  {log.remarks && <p className="mt-1 truncate">{log.remarks}</p>}
                </div>
              </div>
            ))}
            {data.data.length === 0 && (
              <div className="py-8 text-center text-muted-foreground">No audit logs found.</div>
            )}
          </div>

          {/* Desktop Table */}
          <div className="hidden lg:block overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Timestamp</th>
                  <th className="px-4 py-3 text-left font-medium">Action</th>
                  <th className="px-4 py-3 text-left font-medium">Actor</th>
                  <th className="px-4 py-3 text-left font-medium">Entity</th>
                  <th className="px-4 py-3 text-left font-medium">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((log) => (
                  <tr key={log.id} className="border-b last:border-0">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <DateDisplay date={log.created_at} showTime />
                    </td>
                    <td className="px-4 py-3 capitalize">{log.action_type.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3">
                      <span>{log.actor?.full_name ?? log.actor_id}</span>
                      <span className="ml-1 text-xs text-muted-foreground">({log.actor_role.replace(/_/g, ' ')})</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="capitalize">{log.target_entity.replace(/_/g, ' ')}</span>
                      <span className="ml-1 font-mono text-xs text-muted-foreground">{log.target_id}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{log.remarks ?? '—'}</td>
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
