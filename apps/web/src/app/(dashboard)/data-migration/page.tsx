'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Upload, Database } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/providers/toast-provider';
import { hasPermission } from '@/lib/permissions';
import { apiClient, ApiClientError } from '@/lib/api-client';
import { AccessDenied } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type MigrationState = {
  state: 'available' | 'in-progress' | 'completed';
  completedAt?: string;
  completedBy?: string;
};

type DryRunResult = {
  draftId: string;
  fileHashes: Record<string, string>;
  totals: Record<string, number>;
  validCount: Record<string, number>;
  errors: { domain: string; rowIndex: number; column: string; message: string }[];
};

type CommitResult = {
  draftId: string;
  rowsCommitted: Record<string, number>;
  migrationAuditId: string;
  durationMs: number;
};

type DomainKey = 'customers' | 'groups' | 'group_members' | 'loans' | 'collections';
const DOMAINS: { key: DomainKey; label: string; required: boolean }[] = [
  { key: 'customers', label: 'customers.xlsx', required: true },
  { key: 'groups', label: 'groups.xlsx', required: false },
  { key: 'group_members', label: 'group_members.xlsx', required: false },
  { key: 'loans', label: 'loans.xlsx', required: false },
  { key: 'collections', label: 'collections.xlsx', required: false },
];

export default function DataMigrationPage() {
  const { user, isLoading } = useAuth();
  const role = user?.role ?? '';
  const { showToast } = useToast();
  const [state, setState] = useState<MigrationState | null>(null);
  const [files, setFiles] = useState<Partial<Record<DomainKey, File>>>({});
  const [dryRun, setDryRun] = useState<DryRunResult | null>(null);
  const [busy, setBusy] = useState<'dry-run' | 'commit' | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const s = await apiClient.get<MigrationState>('/migration/state');
        setState(s);
      } catch (err) {
        if (!(err instanceof ApiClientError) || err.statusCode !== 403) {
          // 403 just means we can't read it — show empty
          // eslint-disable-next-line no-console
          console.error(err);
        }
      }
    })();
  }, []);

  if (isLoading) return <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>;
  if (!hasPermission(role, 'migration.run')) return <AccessDenied />;

  async function handleDryRun() {
    if (!files.customers) {
      showToast({ message: 'customers.xlsx is required', variant: 'error' });
      return;
    }
    setBusy('dry-run');
    try {
      const fd = new FormData();
      for (const d of DOMAINS) {
        const f = files[d.key];
        if (f) fd.append(d.key, f);
      }
      const result = await apiClient.postFormData<DryRunResult>('/migration/dry-run', fd);
      setDryRun(result);
      showToast({
        message: `Validated: ${Object.values(result.totals).reduce((a, b) => a + b, 0)} total rows, ${result.errors.length} errors`,
        variant: result.errors.length === 0 ? 'success' : 'warning',
      });
    } catch (err) {
      showToast({
        message: `Dry-run failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        variant: 'error',
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleCommit() {
    if (!dryRun) return;
    if (dryRun.errors.length > 0) {
      showToast({ message: 'Fix all errors before committing', variant: 'error' });
      return;
    }
    if (!confirm('This commit is ONE-SHOT. After it completes the Migration module locks forever (until ops manually resets). Continue?')) {
      return;
    }
    setBusy('commit');
    try {
      const result = await apiClient.post<CommitResult>('/migration/commit', { draftId: dryRun.draftId });
      showToast({
        message: `Migration committed in ${(result.durationMs / 1000).toFixed(1)}s — ${Object.entries(result.rowsCommitted).map(([k, v]) => `${v} ${k}`).join(', ')}`,
        variant: 'success',
      });
      setDryRun(null);
      setFiles({});
      const s = await apiClient.get<MigrationState>('/migration/state');
      setState(s);
    } catch (err) {
      showToast({
        message: `Commit failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        variant: 'error',
      });
    } finally {
      setBusy(null);
    }
  }

  const locked = state?.state === 'completed';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Database className="h-5 w-5 text-primary" aria-hidden="true" />
        <h1 className="text-2xl font-bold">Data Migration</h1>
      </div>
      <p className="max-w-3xl text-sm text-muted-foreground">
        One-shot import of existing customer + loan + collection + group data from your legacy system.
        Read <a className="underline" href="https://github.com/atdevag001/as-finance/blob/main/docs/MIGRATION_FILE_FORMAT.md" target="_blank" rel="noreferrer">MIGRATION_FILE_FORMAT.md</a> before using.
      </p>

      {locked ? (
        <Card className="border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950">
          <CardHeader className="flex flex-row items-start gap-3 space-y-0">
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" aria-hidden="true" />
            <div>
              <CardTitle className="text-base">Migration locked — already completed</CardTitle>
              <p className="mt-2 text-sm text-muted-foreground">
                Completed{state?.completedAt ? ` at ${new Date(state.completedAt).toLocaleString()}` : ''}
                {state?.completedBy ? ` by user ${state.completedBy}` : ''}.
                <br />
                To run another migration, ops must manually reset <code className="font-mono">settings.migration_state</code>.
              </p>
            </div>
          </CardHeader>
        </Card>
      ) : (
        <Card className="border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950">
          <CardHeader className="flex flex-row items-start gap-3 space-y-0">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" aria-hidden="true" />
            <div>
              <CardTitle className="text-base">One-shot operation</CardTitle>
              <p className="mt-2 text-sm">
                After a successful commit, this module locks forever. Use the dry-run to validate before committing.
              </p>
            </div>
          </CardHeader>
        </Card>
      )}

      {!locked && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Step 1 — Upload files</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {DOMAINS.map((d) => (
                <div key={d.key} className="flex items-center gap-3">
                  <label className="w-44 text-sm font-medium">
                    {d.label}
                    {d.required && <span className="ml-1 text-destructive">*</span>}
                  </label>
                  <input
                    type="file"
                    accept=".xlsx,.csv"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      setFiles((prev) => ({ ...prev, [d.key]: f }));
                    }}
                    className="text-sm"
                  />
                  {files[d.key] && (
                    <span className="text-xs text-muted-foreground">
                      {files[d.key]!.name} ({(files[d.key]!.size / 1024).toFixed(1)} KB)
                    </span>
                  )}
                </div>
              ))}
              <Button onClick={handleDryRun} disabled={busy !== null || !files.customers}>
                <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
                {busy === 'dry-run' ? 'Validating…' : 'Dry-run (validate)'}
              </Button>
            </CardContent>
          </Card>

          {dryRun && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Step 2 — Preview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  {DOMAINS.map((d) => (
                    <div key={d.key} className="rounded-md border bg-muted/30 p-3">
                      <p className="text-xs uppercase text-muted-foreground">{d.key}</p>
                      <p className="text-2xl font-bold">{dryRun.totals[d.key] ?? 0}</p>
                      <p className="text-xs text-muted-foreground">
                        {(dryRun.validCount[d.key] ?? 0) === (dryRun.totals[d.key] ?? 0)
                          ? 'all valid'
                          : `${dryRun.validCount[d.key] ?? 0} valid`}
                      </p>
                    </div>
                  ))}
                </div>

                {dryRun.errors.length > 0 ? (
                  <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm">
                    <p className="font-semibold text-destructive">
                      {dryRun.errors.length} error(s) — fix and re-upload before committing
                    </p>
                    <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto font-mono text-xs">
                      {dryRun.errors.slice(0, 50).map((e, i) => (
                        <li key={i}>
                          <span className="font-semibold">{e.domain}</span>{' '}
                          {e.rowIndex > 0 ? `row ${e.rowIndex}` : ''}{' '}
                          <span className="font-semibold">{e.column}</span>: {e.message}
                        </li>
                      ))}
                      {dryRun.errors.length > 50 && (
                        <li className="italic">… and {dryRun.errors.length - 50} more</li>
                      )}
                    </ul>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    All references resolve — ready to commit
                  </div>
                )}

                <Button
                  onClick={handleCommit}
                  disabled={busy !== null || dryRun.errors.length > 0}
                  className={cn(dryRun.errors.length === 0 && 'bg-destructive hover:bg-destructive/90')}
                >
                  {busy === 'commit' ? 'Committing…' : 'Commit migration (one-shot)'}
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
