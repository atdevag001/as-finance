'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { hasPermission } from '@/lib/permissions';
import {
  useSettings,
  useUpdateSettings,
  useHolidays,
  useCreateHoliday,
  useDeleteHoliday,
} from '@/hooks/useSettings';
import { useToast } from '@/providers/toast-provider';
import { ApiClientError } from '@/lib/api-client';
import {
  AccessDenied,
  LoadingSpinner,
  ErrorMessage,
  PermissionGate,
  DateDisplay,
} from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Trash2, Plus } from 'lucide-react';

export default function SettingsPage() {
  const { user } = useAuth();
  const role = user?.role ?? '';

  if (!hasPermission(role, 'settings.read')) {
    return <AccessDenied />;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <SettingsSection />
      <HolidaySection />
    </div>
  );
}

/** Computes the changed keys between original and current settings */
export function getChangedSettings(
  original: Record<string, string>,
  current: Record<string, string>,
): Record<string, string> {
  const changed: Record<string, string> = {};
  for (const key of Object.keys(current)) {
    if (current[key] !== original[key]) {
      changed[key] = current[key];
    }
  }
  return changed;
}

function SettingsSection() {
  const { data: settings, isLoading, error } = useSettings();
  const updateSettings = useUpdateSettings();
  const { showToast } = useToast();
  const [serverError, setServerError] = useState<string | null>(null);

  // Original values from server
  const [originalValues, setOriginalValues] = useState<Record<string, string>>({});
  // Current edited values
  const [currentValues, setCurrentValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (settings) {
      const vals: Record<string, string> = {};
      for (const s of settings) {
        vals[s.key] = s.value;
      }
      setOriginalValues(vals);
      setCurrentValues(vals);
    }
  }, [settings]);

  const changedSettings = useMemo(
    () => getChangedSettings(originalValues, currentValues),
    [originalValues, currentValues],
  );
  const isDirty = Object.keys(changedSettings).length > 0;

  const handleChange = useCallback((key: string, value: string) => {
    setCurrentValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  async function handleSave() {
    if (!isDirty) return;
    setServerError(null);
    try {
      await updateSettings.mutateAsync(changedSettings);
      setOriginalValues({ ...currentValues });
      showToast({ message: 'Settings saved successfully', variant: 'success' });
    } catch (err) {
      if (err instanceof ApiClientError) {
        setServerError(err.body.message || 'Failed to save settings.');
      } else {
        setServerError('Unable to connect to server. Please check your connection.');
      }
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return <ErrorMessage message={(error as Error).message || 'Failed to load settings.'} />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">System Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {serverError && <ErrorMessage message={serverError} />}

        {settings?.map((setting) => (
          <div key={setting.key} className="grid gap-1.5">
            <Label htmlFor={`setting-${setting.key}`}>
              {setting.key}
              {setting.description && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {setting.description}
                </span>
              )}
            </Label>
            <Input
              id={`setting-${setting.key}`}
              value={currentValues[setting.key] ?? ''}
              onChange={(e) => handleChange(setting.key, e.target.value)}
            />
          </div>
        ))}

        <div className="flex justify-end pt-2">
          <Button
            onClick={handleSave}
            disabled={!isDirty || updateSettings.isPending}
          >
            {updateSettings.isPending ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function HolidaySection() {
  const { user } = useAuth();
  const role = user?.role ?? '';
  const canUpdate = hasPermission(role, 'settings.update');

  const { data: holidays, isLoading, error } = useHolidays();
  const createHoliday = useCreateHoliday();
  const deleteHoliday = useDeleteHoliday();
  const { showToast } = useToast();

  const [newDate, setNewDate] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);

  const currentYear = new Date().getFullYear();
  const currentYearHolidays = useMemo(
    () =>
      (holidays ?? []).filter((h) => {
        const year = new Date(h.date).getFullYear();
        return year === currentYear;
      }),
    [holidays, currentYear],
  );

  async function handleAddHoliday(e: React.FormEvent) {
    e.preventDefault();
    if (!newDate || !newDescription.trim()) return;
    setServerError(null);
    try {
      await createHoliday.mutateAsync({ date: newDate, description: newDescription.trim() });
      setNewDate('');
      setNewDescription('');
      showToast({ message: 'Holiday added', variant: 'success' });
    } catch (err) {
      if (err instanceof ApiClientError) {
        setServerError(err.body.message || 'Failed to add holiday.');
      } else {
        setServerError('Unable to connect to server.');
      }
    }
  }

  async function handleRemoveHoliday(id: string) {
    try {
      await deleteHoliday.mutateAsync(id);
      showToast({ message: 'Holiday removed', variant: 'success' });
    } catch (err) {
      if (err instanceof ApiClientError) {
        setServerError(err.body.message || 'Failed to remove holiday.');
      } else {
        setServerError('Unable to connect to server.');
      }
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return <ErrorMessage message={(error as Error).message || 'Failed to load holidays.'} />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Holiday Calendar — {currentYear}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {serverError && <ErrorMessage message={serverError} />}

        {currentYearHolidays.length === 0 ? (
          <p className="text-sm text-muted-foreground">No holidays configured for {currentYear}.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-2 text-left font-medium">Date</th>
                  <th className="px-4 py-2 text-left font-medium">Description</th>
                  {canUpdate && <th className="px-4 py-2 text-left font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {currentYearHolidays.map((h) => (
                  <tr key={h.id} className="border-b">
                    <td className="px-4 py-2">
                      <DateDisplay date={h.date} />
                    </td>
                    <td className="px-4 py-2">{h.description}</td>
                    {canUpdate && (
                      <td className="px-4 py-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveHoliday(h.id)}
                          disabled={deleteHoliday.isPending}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {canUpdate && (
          <form onSubmit={handleAddHoliday} className="flex flex-wrap items-end gap-3 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="holiday-date">Date</Label>
              <Input
                id="holiday-date"
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                required
              />
            </div>
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="holiday-desc">Description</Label>
              <Input
                id="holiday-desc"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="e.g. Republic Day"
                required
              />
            </div>
            <Button type="submit" disabled={createHoliday.isPending}>
              <Plus className="mr-1 h-4 w-4" />
              {createHoliday.isPending ? 'Adding…' : 'Add Holiday'}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
