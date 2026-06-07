'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  LoadingSpinner,
  ErrorMessage,
  PaginationControls,
  AccessDenied,
  DateDisplay,
  StatusBadge,
  PermissionGate,
} from '@/components/shared';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/providers/auth-provider';
import { hasPermission } from '@/lib/permissions';
import {
  useNotifications,
  useRetryNotification,
  NOTIFICATIONS_PAGE_SIZE,
} from '@/hooks/useNotifications';
import { useToast } from '@/providers/toast-provider';

// Mirrors OutboxStatus enum so ops can surface mid-batch 'processing' rows.
const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'sent', label: 'Sent' },
  { value: 'failed', label: 'Failed' },
  { value: 'dead_letter', label: 'Dead Letter' },
];

export default function NotificationsPage() {
  const { user } = useAuth();
  const role = user?.role ?? '';

  if (!hasPermission(role, 'notification.read')) {
    return <AccessDenied />;
  }

  return <NotificationsContent />;
}

function NotificationsContent() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('all');
  const { showToast } = useToast();
  const retry = useRetryNotification();
  const qc = useQueryClient();

  const { data, isLoading, error, isFetching } = useNotifications({
    page,
    status: status === 'all' ? undefined : status,
  });

  function handleRefresh() {
    qc.invalidateQueries({ queryKey: ['notifications'] });
  }

  async function handleRetry(id: string) {
    try {
      await retry.mutateAsync(id);
      showToast({ message: 'Notification queued for retry' });
    } catch (err) {
      showToast({ message: (err as Error).message || 'Failed to retry', variant: 'error' });
    }
  }

  function handleStatusChange(value: string) {
    setStatus(value);
    setPage(1);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Notifications</h1>

      <div className="flex flex-wrap gap-2">
        <Select value={status} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          onClick={handleRefresh}
          disabled={isFetching}
          aria-label="Refresh notifications"
        >
          <RefreshCw className={`mr-1 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {isLoading && (
        <div className="flex justify-center py-8">
          <LoadingSpinner size="lg" />
        </div>
      )}
      {error && <ErrorMessage message={(error as Error).message} />}

      {data && (
        <>
          {/* Mobile Card View */}
          <div className="space-y-3 lg:hidden">
            {data.data.map((n) => (
              <div key={n.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium capitalize">
                      {n.event_type.replace(/_/g, ' ')}
                    </p>
                    <p className="text-sm text-muted-foreground">{n.recipient_mobile}</p>
                  </div>
                  <StatusBadge status={n.status} type="notification" />
                </div>
                <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                  {n.message_body}
                </p>
                <div className="mt-2 flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">
                    <DateDisplay date={n.created_at} showTime />
                  </div>
                  {(n.status === 'failed' || n.status === 'dead_letter') && (
                    <PermissionGate permission="notification.retry">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRetry(n.id)}
                        disabled={retry.isPending}
                        className="min-h-[36px]"
                      >
                        <RefreshCw className="mr-1 h-3 w-3" />
                        Retry
                      </Button>
                    </PermissionGate>
                  )}
                </div>
              </div>
            ))}
            {data.data.length === 0 && (
              <div className="py-8 text-center text-muted-foreground">
                No notifications found.
              </div>
            )}
          </div>

          {/* Desktop Table */}
          <div className="hidden lg:block overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Created</th>
                  <th className="px-4 py-3 text-left font-medium">Event</th>
                  <th className="px-4 py-3 text-left font-medium">Recipient</th>
                  <th className="px-4 py-3 text-left font-medium">Message</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Retries</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((n) => (
                  <tr key={n.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <DateDisplay date={n.created_at} showTime />
                    </td>
                    <td className="px-4 py-3 capitalize">
                      {n.event_type.replace(/_/g, ' ')}
                    </td>
                    <td className="px-4 py-3">{n.recipient_mobile}</td>
                    <td className="px-4 py-3 max-w-xs truncate" title={n.message_body}>
                      {n.message_body}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={n.status} type="notification" />
                    </td>
                    <td className="px-4 py-3">
                      {n.retry_count} / {n.max_retries}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {(n.status === 'failed' || n.status === 'dead_letter') && (
                        <PermissionGate permission="notification.retry">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRetry(n.id)}
                            disabled={retry.isPending}
                          >
                            <RefreshCw className="mr-1 h-3 w-3" />
                            Retry
                          </Button>
                        </PermissionGate>
                      )}
                    </td>
                  </tr>
                ))}
                {data.data.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      No notifications found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <PaginationControls
            page={page}
            totalPages={Math.ceil((data.total || 0) / NOTIFICATIONS_PAGE_SIZE)}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
