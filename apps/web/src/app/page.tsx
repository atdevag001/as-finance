'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { LoadingSpinner } from '@/components/shared/loading-spinner';

/**
 * Root page — redirects authenticated users to the dashboard,
 * unauthenticated users to login.
 */
export default function HomePage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        router.replace('/customers');
      } else {
        router.replace('/login');
      }
    }
  }, [isAuthenticated, isLoading, router]);

  return (
    <main className="flex min-h-screen items-center justify-center">
      <LoadingSpinner size="lg" />
    </main>
  );
}
