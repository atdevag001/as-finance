'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { useGroups } from '@/hooks/useGroups';
import {
  StatusBadge,
  LoadingSpinner,
  ErrorMessage,
  PaginationControls,
  PermissionGate,
  MobileCardList,
  AccessDenied,
  type MobileCardItem,
} from '@/components/shared';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/providers/auth-provider';
import { hasPermission } from '@/lib/permissions';

export default function GroupsPage() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const role = user?.role ?? '';

  if (isAuthLoading) {
    return (
      <div className="flex justify-center py-8">
        <LoadingSpinner size="lg" />
      </div>
    );
  }
  if (!hasPermission(role, 'group.read')) {
    return <AccessDenied />;
  }

  return <GroupsPageContent />;
}

function GroupsPageContent() {
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useGroups({ page });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Groups</h1>
        <PermissionGate permission="group.create">
          <Button asChild>
            <Link href="/groups/new">
              <Plus className="mr-2 h-4 w-4" />New Group
            </Link>
          </Button>
        </PermissionGate>
      </div>

      {isLoading && (
        <div className="flex justify-center py-8">
          <LoadingSpinner size="lg" />
        </div>
      )}

      {error && <ErrorMessage message={(error as Error).message} />}

      {data && (
        <>
          {/* Mobile Card List */}
          <div className="lg:hidden">
            <MobileCardList
              items={data.data.map((g): MobileCardItem => ({
                id: g.id,
                title: g.name,
                subtitle: `Leader: ${g.leader_name}`,
                rightValue: `${g.member_count} members`,
                badge: <StatusBadge status={g.status} type="group" />,
                secondaryInfo: g.meeting_day ? `Meets: ${g.meeting_day}` : undefined,
                href: `/groups/${g.id}`,
              }))}
              emptyMessage="No groups found."
            />
          </div>

          {/* Desktop Table */}
          <div className="hidden lg:block overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-left font-medium">Leader</th>
                  <th className="px-4 py-3 text-right font-medium">Members</th>
                  <th className="px-4 py-3 text-left font-medium">Meeting Day</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((g) => (
                  <tr key={g.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <Link
                        href={`/groups/${g.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {g.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{g.leader_name}</td>
                    <td className="px-4 py-3 text-right">{g.member_count}</td>
                    <td className="px-4 py-3 capitalize">{g.meeting_day}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={g.status} type="group" />
                    </td>
                  </tr>
                ))}
                {data.data.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      No groups found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <PaginationControls
            page={page}
            totalPages={Math.ceil((data.total || 0) / 20)}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
