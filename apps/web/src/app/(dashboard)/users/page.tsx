'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { StatusBadge, LoadingSpinner, ErrorMessage, PaginationControls } from '@/components/shared';
import { Button } from '@/components/ui/button';

interface User { id: string; username: string; fullName: string; role: string; mobile: string; isActive: boolean; lastLoginAt?: string; }
interface PaginatedResult { data: User[]; total: number; page: number; pageSize: number; totalPages: number; }

export default function UsersPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useQuery<PaginatedResult>({
    queryKey: ['users', page],
    queryFn: () => apiClient.get(`/users?page=${page}&pageSize=20`),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Users</h1>
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
                  <th className="px-4 py-3 text-left font-medium hidden sm:table-cell">Username</th>
                  <th className="px-4 py-3 text-left font-medium">Role</th>
                  <th className="px-4 py-3 text-left font-medium hidden md:table-cell">Mobile</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((u) => (
                  <tr key={u.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{u.fullName}</td>
                    <td className="px-4 py-3 hidden sm:table-cell">{u.username}</td>
                    <td className="px-4 py-3 capitalize">{u.role.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3 hidden md:table-cell">{u.mobile}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={u.isActive ? 'active' : 'inactive'} type="customer" />
                    </td>
                  </tr>
                ))}
                {data.data.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No users found.</td></tr>
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
