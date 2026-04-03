'use client';

import { useRouter } from 'next/navigation';
import { ShieldX } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Full-page "Access Denied" component displayed when a user navigates to a
 * route they lack permission for. This is a UX convenience — the API enforces
 * authorization server-side.
 */
export function AccessDenied() {
  const router = useRouter();

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <ShieldX className="h-16 w-16 text-destructive" aria-hidden="true" />
      <h1 className="text-2xl font-semibold">Access Denied</h1>
      <p className="max-w-md text-muted-foreground">
        You do not have permission to view this page. Contact your administrator
        if you believe this is an error.
      </p>
      <Button variant="outline" onClick={() => router.back()}>
        Go back
      </Button>
    </div>
  );
}
