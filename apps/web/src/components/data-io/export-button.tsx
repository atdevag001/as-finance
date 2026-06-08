'use client';

import { useState } from 'react';
import { Download, ShieldAlert } from 'lucide-react';
import { PERMISSIONS } from '@as-finance/shared';
import { apiClient, ApiClientError } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/providers/toast-provider';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface ExportButtonProps {
  /** Permission key used to gate visibility (e.g. 'customer.export'). */
  permission: string;
  /** Endpoint path relative to API base (e.g. '/exports/customers.xlsx'). */
  endpoint: string;
  /** Default filename if the server doesn't provide Content-Disposition. */
  filename: string;
  /** Filters serialized to the export query string. */
  query?: Record<string, string | undefined>;
  /** When true, shows the PII unmask popover (admin only). */
  supportsUnmaskPii?: boolean;
  /** Label override. */
  label?: string;
  /** Button size + variant overrides. */
  size?: 'default' | 'sm';
  variant?: 'default' | 'outline' | 'secondary' | 'ghost';
  className?: string;
}

/**
 * "Export to Excel" button — visible only to users with the required permission.
 *
 * On click, downloads the file via apiClient.getBlob(). Translates the standard
 * error codes (429 throttle, 403 forbidden) into toast messages.
 *
 * If supportsUnmaskPii is true AND the user has export.unmask_pii permission,
 * an extra dialog opens first asking whether to include unmasked Aadhaar/PAN —
 * a decision that gets audit-logged on the server.
 */
export function ExportButton({
  permission,
  endpoint,
  filename,
  query,
  supportsUnmaskPii,
  label = 'Excel',
  size = 'sm',
  variant = 'outline',
  className,
}: ExportButtonProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [piiOpen, setPiiOpen] = useState(false);

  const role = user?.role ?? '';
  const allowed = (PERMISSIONS as Record<string, readonly string[]>)[permission] ?? [];
  if (!allowed.includes(role)) return null;

  const piiPermissionAllowed = (
    (PERMISSIONS as Record<string, readonly string[]>)['export.unmask_pii'] ?? []
  ).includes(role);

  async function doDownload(unmaskPii: boolean): Promise<void> {
    setBusy(true);
    try {
      const params = new URLSearchParams();
      if (query) {
        for (const [k, v] of Object.entries(query)) {
          if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
        }
      }
      if (unmaskPii) params.set('unmaskPii', 'true');

      const qs = params.toString();
      const url = `${endpoint}${qs ? `?${qs}` : ''}`;
      const blob = await apiClient.getBlob(url);
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
      showToast({ message: `Exported: ${filename}`, variant: 'success' });
    } catch (err) {
      const code = err instanceof ApiClientError ? err.statusCode : 0;
      if (code === 429) {
        showToast({
          message: 'Too many exports — limit is 5/minute. Try again in a moment.',
          variant: 'warning',
        });
      } else if (code === 403) {
        showToast({ message: 'You do not have permission for this export.', variant: 'error' });
      } else {
        showToast({
          message: `Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
          variant: 'error',
        });
      }
    } finally {
      setBusy(false);
    }
  }

  function handleClick() {
    if (supportsUnmaskPii && piiPermissionAllowed) {
      setPiiOpen(true);
      return;
    }
    void doDownload(false);
  }

  return (
    <>
      <Button
        type="button"
        size={size}
        variant={variant}
        onClick={handleClick}
        disabled={busy}
        className={cn('gap-1.5', className)}
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        {busy ? 'Exporting…' : label}
      </Button>

      {supportsUnmaskPii && piiPermissionAllowed && (
        <Dialog open={piiOpen} onOpenChange={setPiiOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-amber-600" /> Include full Aadhaar?
              </DialogTitle>
              <DialogDescription>
                Aadhaar and mobile numbers are MASKED by default. As a Super Admin you can
                include full numbers — your choice is recorded in the Audit Log.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => { setPiiOpen(false); void doDownload(false); }}>
                Export with mask
              </Button>
              <Button onClick={() => { setPiiOpen(false); void doDownload(true); }}>
                Include full numbers (logged)
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
