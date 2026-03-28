'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { LoadingSpinner, ErrorMessage } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useState, useEffect } from 'react';

interface Setting { key: string; value: string; description?: string; }

export default function SettingsPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery<Setting[]>({
    queryKey: ['settings'],
    queryFn: () => apiClient.get('/settings'),
  });

  const [edits, setEdits] = useState<Record<string, string>>({});

  useEffect(() => {
    if (data) {
      const initial: Record<string, string> = {};
      data.forEach((s) => { initial[s.key] = s.value; });
      setEdits(initial);
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: (settings: { key: string; value: string }[]) => apiClient.patch('/settings', { settings }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings'] }); },
  });

  function handleSave() {
    if (!data) return;
    const changed = data
      .filter((s) => edits[s.key] !== undefined && edits[s.key] !== s.value)
      .map((s) => ({ key: s.key, value: edits[s.key] as string }));
    if (changed.length > 0) mutation.mutate(changed);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Settings</h1>
        <Button onClick={handleSave} disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving…' : 'Save Changes'}
        </Button>
      </div>

      {mutation.error && <ErrorMessage message={(mutation.error as Error).message} />}
      {isLoading && <div className="flex justify-center py-8"><LoadingSpinner size="lg" /></div>}
      {error && <ErrorMessage message={(error as Error).message} />}

      {data && (
        <Card>
          <CardHeader><CardTitle className="text-base">System Settings</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {data.map((s) => (
              <div key={s.key} className="space-y-1">
                <label className="text-sm font-medium">{s.key}</label>
                {s.description && <p className="text-xs text-muted-foreground">{s.description}</p>}
                <Input
                  value={edits[s.key] ?? s.value}
                  onChange={(e) => setEdits((prev) => ({ ...prev, [s.key]: e.target.value }))}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
