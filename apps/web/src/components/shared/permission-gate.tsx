'use client';

import { type ReactNode } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { hasPermission } from '@/lib/permissions';

export interface PermissionGateProps {
  /** Permission key to check, e.g. 'loan.approve' */
  permission: string;
  /** Content rendered when the user has the required permission */
  children: ReactNode;
  /** Optional fallback rendered when the user lacks the permission (default: null) */
  fallback?: ReactNode;
}

/**
 * Conditionally renders children based on the current user's role and a
 * required permission key. This is a UX convenience — the API enforces
 * authorization server-side.
 */
export function PermissionGate({ permission, children, fallback = null }: PermissionGateProps) {
  const { user, isLoading } = useAuth();
  const role = user?.role ?? '';

  // While auth is still resolving, render nothing — falling through to the
  // fallback briefly flashes a "no access" UI on every page load. The
  // sibling content above this gate is usually a spinner/skeleton already.
  if (isLoading) {
    return null;
  }

  if (!hasPermission(role, permission)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
