'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ErrorMessage } from '@/components/shared';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      console.error('[DashboardError]', error);
    }
  }, [error]);

  return (
    <div className="space-y-4 p-4">
      <ErrorMessage
        message={error.message || 'Something went wrong loading this page.'}
      />
      {error.digest && (
        <p className="font-mono text-xs text-muted-foreground">
          Reference: {error.digest}
        </p>
      )}
      <div className="flex gap-2">
        <Button onClick={reset} variant="default" size="sm">
          Try again
        </Button>
        <Button
          onClick={() => (window.location.href = '/')}
          variant="outline"
          size="sm"
        >
          Dashboard
        </Button>
      </div>
    </div>
  );
}
