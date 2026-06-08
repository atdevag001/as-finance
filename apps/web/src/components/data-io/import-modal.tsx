'use client';

import { useEffect, useRef, useState } from 'react';
import { Upload, Download, AlertTriangle, CheckCircle2, X } from 'lucide-react';
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

const MAX_FILE_BYTES = 5 * 1024 * 1024;

type DryRunResponse = {
  importId: string;
  domain: string;
  fileHash: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  errors: { rowIndex: number; column: string; message: string }[];
  preview: Record<string, unknown>[];
  duplicateFileWarning?: { lastImportedAt: string; lastImportedById: string };
};

type CommitResponse = {
  importId: string;
  rowsAccepted: number;
  rowsSkipped: number;
  committedAt: string;
};

interface ImportModalProps {
  /** Permission key required to import (e.g. 'settings.import'). */
  permission: string;
  /** Server-side domain slug — must match the @Param('domain'). */
  domain: 'holidays' | 'settings' | 'loan-products';
  /** Friendly title shown in the modal heading. */
  title: string;
  /** When true, hide the trigger button (caller renders their own). Default false. */
  hideTrigger?: boolean;
  /** Whether to abort on any invalid row. Default false (commit valid rows only). */
  strict?: boolean;
  /** Called after a successful commit. */
  onCommitted?: (resp: CommitResponse) => void;
  /** Optional trigger label override. */
  triggerLabel?: string;
}

export function ImportModal({
  permission,
  domain,
  title,
  hideTrigger,
  strict,
  onCommitted,
  triggerLabel = 'Import from Excel',
}: ImportModalProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [dryRun, setDryRun] = useState<DryRunResponse | null>(null);
  const [busy, setBusy] = useState<'uploading' | 'committing' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const role = user?.role ?? '';
  const allowed = (PERMISSIONS as Record<string, readonly string[]>)[permission] ?? [];
  if (!allowed.includes(role)) return null;

  useEffect(() => {
    if (!open) {
      setDryRun(null);
      setBusy(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [open]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      showToast({
        message: `File too large — max ${MAX_FILE_BYTES / 1024 / 1024} MB`,
        variant: 'error',
      });
      return;
    }
    setBusy('uploading');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const resp = await apiClient.postFormData<DryRunResponse>(
        `/imports/${domain}/dry-run`,
        fd,
      );
      setDryRun(resp);
    } catch (err) {
      const code = err instanceof ApiClientError ? err.statusCode : 0;
      const detail =
        err instanceof ApiClientError
          ? (err.body as { message?: string } | undefined)?.message ?? err.message
          : err instanceof Error
            ? err.message
            : 'Unknown error';
      showToast({
        message: code === 413 ? `File too large: ${detail}` : `Upload failed: ${detail}`,
        variant: 'error',
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleCommit(): Promise<void> {
    if (!dryRun) return;
    setBusy('committing');
    try {
      const resp = await apiClient.post<CommitResponse>(`/imports/${domain}/commit`, {
        importId: dryRun.importId,
        strict: strict ?? false,
      });
      showToast({
        message: `${resp.rowsAccepted} row(s) imported${resp.rowsSkipped > 0 ? `, ${resp.rowsSkipped} skipped` : ''}`,
        variant: 'success',
      });
      onCommitted?.(resp);
      setOpen(false);
    } catch (err) {
      showToast({
        message: `Commit failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        variant: 'error',
      });
    } finally {
      setBusy(null);
    }
  }

  async function downloadTemplate(): Promise<void> {
    try {
      const blob = await apiClient.getBlob(`/imports/${domain}/template.xlsx`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${domain}-template.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      showToast({
        message: `Template download failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        variant: 'error',
      });
    }
  }

  return (
    <>
      {!hideTrigger && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          className="gap-1.5"
        >
          <Upload className="h-4 w-4" aria-hidden="true" />
          {triggerLabel}
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              Upload a .xlsx or .csv file. Max 5 MB, 5000 rows. We&apos;ll preview before committing.
            </DialogDescription>
          </DialogHeader>

          {!dryRun ? (
            // ─── State A: Upload ────────────────────────────────────────────
            <div className="space-y-3 py-2">
              <div className="rounded-md border border-dashed p-6 text-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.csv"
                  onChange={handleFileChange}
                  disabled={busy !== null}
                  className="hidden"
                  id={`import-file-${domain}`}
                />
                <label
                  htmlFor={`import-file-${domain}`}
                  className={cn(
                    'cursor-pointer text-sm font-medium text-primary hover:underline',
                    busy && 'pointer-events-none opacity-50',
                  )}
                >
                  {busy === 'uploading' ? 'Uploading…' : 'Choose .xlsx or .csv file'}
                </label>
                <p className="mt-2 text-xs text-muted-foreground">
                  Or drag and drop — max 5 MB
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={downloadTemplate}
                className="gap-1.5 text-xs"
              >
                <Download className="h-3 w-3" aria-hidden="true" />
                Download blank template
              </Button>
            </div>
          ) : (
            // ─── State B: Preview ───────────────────────────────────────────
            <div className="space-y-3 py-2">
              {dryRun.duplicateFileWarning && (
                <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-medium">You imported a file with the same content recently</p>
                    <p className="text-xs">
                      Last imported at{' '}
                      {new Date(dryRun.duplicateFileWarning.lastImportedAt).toLocaleString()}.
                      Continue only if this is intentional.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex gap-4 text-sm">
                <span className="flex items-center gap-1.5 text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" /> {dryRun.validRows} valid
                </span>
                {dryRun.invalidRows > 0 && (
                  <span className="flex items-center gap-1.5 text-destructive">
                    <X className="h-4 w-4" /> {dryRun.invalidRows} invalid
                  </span>
                )}
                <span className="text-muted-foreground">of {dryRun.totalRows} total</span>
              </div>

              {dryRun.errors.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded-md border bg-muted/30 p-2 text-xs">
                  <p className="mb-1 font-medium text-destructive">Errors:</p>
                  <ul className="space-y-1">
                    {dryRun.errors.slice(0, 50).map((e, i) => (
                      <li key={i} className="font-mono">
                        Row {e.rowIndex}, <span className="font-semibold">{e.column}</span>: {e.message}
                      </li>
                    ))}
                    {dryRun.errors.length > 50 && (
                      <li className="italic text-muted-foreground">
                        … and {dryRun.errors.length - 50} more
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {dryRun.validRows > 0 && dryRun.preview.length > 0 && (
                <details className="rounded-md border">
                  <summary className="cursor-pointer px-3 py-2 text-sm font-medium hover:bg-accent">
                    Preview first {Math.min(dryRun.preview.length, 5)} valid row(s)
                  </summary>
                  <div className="max-h-40 overflow-auto p-2 text-xs">
                    <pre className="font-mono">{JSON.stringify(dryRun.preview.slice(0, 5), null, 2)}</pre>
                  </div>
                </details>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            {dryRun && (
              <>
                <Button variant="outline" onClick={() => setDryRun(null)} disabled={busy !== null}>
                  Upload different file
                </Button>
                <Button
                  onClick={handleCommit}
                  disabled={busy !== null || dryRun.validRows === 0}
                >
                  {busy === 'committing'
                    ? 'Importing…'
                    : `Import ${dryRun.validRows} valid row${dryRun.validRows === 1 ? '' : 's'}`}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
