'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { hasPermission } from '@/lib/permissions';
import { useUsers } from '@/hooks/useUsers';
import {
  AccessDenied,
  LoadingSpinner,
  ErrorMessage,
  PaginationControls,
  StatusBadge,
  PermissionGate,
} from '@/components/shared';
import { Button } from '@/components/ui/button';

export default function UsersPage() {
  const { user } = useAuth();
  const role = user?.role ?? '';
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useUsers({ page });

  if (!hasPermission(role, 'user.read')) {
    return <AccessDenied />;
  }

  const users = data?.data ?? [];
  const total = data?.total ?? 0;
  const pageSize = 20;
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">User Management</h1>
        <PermissionGate permission="user.create">
          <Button asChild>
            <Link href="/users/new">
              <Plus className="mr-2 h-4 w-4" />
              New User
            </Link>
          </Button>
        </PermissionGate>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      )}

      {error && <ErrorMessage message={(error as Error).message || 'Failed to load users.'} />}

      {!isLoading && !error && (
        <>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">Full Name</th>
                  <th className="px-4 py-3 text-left font-medium">Username</th>
                  <th className="hidden px-4 py-3 text-left font-medium sm:table-cell">Role</th>
                  <th className="hidden px-4 py-3 text-left font-medium md:table-cell">Mobile</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                      No users found.
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id} className="border-b">
                      <td className="px-4 py-3">{u.full_name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{u.username}</td>
                      <td className="hidden px-4 py-3 capitalize sm:table-cell">
                        {u.role.replace(/_/g, ' ')}
                      </td>
                      <td className="hidden px-4 py-3 md:table-cell">{u.mobile}</td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          status={u.is_active ? 'active' : 'inactive'}
                          type="customer"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <PermissionGate permission="user.update">
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/users/${u.id}/edit`}>Edit</Link>
                          </Button>
                        </PermissionGate>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <PaginationControls page={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
