'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { hasPermission } from '@/lib/permissions';
import {
  getChangedSettings,
  classifySettingValue,
  parseSettingValue,
  stringifySettingValue,
  type SettingValueKind,
} from '@/lib/settings-utils';
import {
  useSettings,
  useUpdateSetting,
  useHolidays,
  useSetHolidays,
} from '@/hooks/useSettings';
import { todayIST } from '@/lib/date-utils';
import { useToast } from '@/providers/toast-provider';
import { ApiClientError } from '@/lib/api-client';
import {
  AccessDenied,
  LoadingSpinner,
  ErrorMessage,
  DateDisplay,
} from '@/components/shared';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
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

/**
 * Settings managed by a dedicated editor section (HolidaySection) — hide from
 * the generic scalar editor so a string round-trip can't corrupt them.
 */
const SPECIALIZED_SETTING_KEYS = new Set<string>(['holiday_calendar']);

function SettingsSection() {
  const { user } = useAuth();
  const role = user?.role ?? '';
  // Gate editing UX so MANAGER (read-only) doesn't waste a save on a 403.
  const canUpdate = hasPermission(role, 'settings.update');

  const { data: settings, isLoading, error } = useSettings();
  const updateSetting = useUpdateSetting();
  const { showToast } = useToast();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Track the original JSON type per key so we can coerce edited strings back
  // on save (otherwise numeric/boolean settings are silently stringified).
  const [kinds, setKinds] = useState<Record<string, SettingValueKind>>({});
  // Original values from server (stringified for the text input)
  const [originalValues, setOriginalValues] = useState<Record<string, string>>({});
  // Current edited values
  const [currentValues, setCurrentValues] = useState<Record<string, string>>({});

  // Hydrate state from the first server response only. Re-running on every
  // refetch would wipe unsaved edits when React Query revalidates in the
  // background.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!settings || hydratedRef.current) return;
    const vals: Record<string, string> = {};
    const ks: Record<string, SettingValueKind> = {};
    for (const s of settings) {
      const kind = classifySettingValue(s.value);
      ks[s.key] = kind;
      vals[s.key] = stringifySettingValue(s.value, kind);
    }
    setKinds(ks);
    setOriginalValues(vals);
    setCurrentValues(vals);
    hydratedRef.current = true;
  }, [settings]);

  const editableSettings = useMemo(
    () => (settings ?? []).filter((s) => !SPECIALIZED_SETTING_KEYS.has(s.key)),
    [settings],
  );

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
    setIsSaving(true);
    try {
      for (const [key, raw] of Object.entries(changedSettings)) {
        const kind = kinds[key] ?? 'string';
        const parsed = parseSettingValue(raw, kind);
        await updateSetting.mutateAsync({ key, value: parsed });
        // Commit each successful save immediately so a mid-loop failure
        // doesn't leave already-persisted keys flagged as dirty.
        setOriginalValues((prev) => ({ ...prev, [key]: raw }));
      }
      showToast({ message: 'Settings saved successfully', variant: 'success' });
    } catch (err) {
      if (err instanceof ApiClientError) {
        setServerError(err.body.message || 'Failed to save settings.');
      } else if (err instanceof Error) {
        setServerError(err.message);
      } else {
        setServerError('Unable to connect to server. Please check your connection.');
      }
    } finally {
      setIsSaving(false);
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

        {editableSettings.map((setting) => {
          const kind = kinds[setting.key] ?? 'string';
          return (
            <div key={setting.key} className="grid gap-1.5">
              <Label htmlFor={`setting-${setting.key}`}>
                {setting.key}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ({kind})
                </span>
                {setting.description && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {setting.description}
                  </span>
                )}
              </Label>
              <Input
                id={`setting-${setting.key}`}
                inputMode={kind === 'number' ? 'decimal' : undefined}
                value={currentValues[setting.key] ?? ''}
                onChange={(e) => handleChange(setting.key, e.target.value)}
                disabled={!canUpdate}
              />
            </div>
          );
        })}

        {canUpdate && (
          <div className="flex justify-end pt-2">
            <Button
              onClick={handleSave}
              disabled={!canUpdate || !isDirty || isSaving}
              className="w-full min-h-[48px] sm:w-auto"
            >
              {isSaving ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function HolidaySection() {
  const { user } = useAuth();
  const role = user?.role ?? '';
  const canUpdate = hasPermission(role, 'settings.update');

  const { data: holidays, isLoading, error } = useHolidays();
  const setHolidays = useSetHolidays();
  const { showToast } = useToast();

  const [newDate, setNewDate] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);
  // Removing a holiday rewrites the system-wide calendar; gate the destructive
  // PUT behind a confirm so a misclick can't silently nuke a schedule input.
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null);

  // Holidays are stored as IST YYYY-MM-DD; bucketing via new Date().getFullYear()
  // would mis-assign Jan/Dec boundary dates for users west of UTC.
  const currentYear = parseInt(todayIST().slice(0, 4), 10);
  const currentYearHolidays = useMemo(
    () =>
      (holidays ?? []).filter((dateStr) => {
        const year = parseInt(dateStr.slice(0, 4), 10);
        return year === currentYear;
      }).sort(),
    [holidays, currentYear],
  );

  async function handleAddHoliday(e: React.FormEvent) {
    e.preventDefault();
    if (!newDate) return;
    setServerError(null);

    // Pre-validate client-side: backend dedupes silently, and dates outside the
    // current year are hidden by the year filter — both feel like "nothing happened".
    if ((holidays ?? []).includes(newDate)) {
      setServerError(`${newDate} is already in the holiday calendar.`);
      return;
    }
    if (newDate < todayIST()) {
      setServerError('Cannot add a holiday in the past.');
      return;
    }
    const enteredYear = parseInt(newDate.slice(0, 4), 10);
    if (enteredYear !== currentYear) {
      showToast({
        message: `Added — note this holiday is in ${enteredYear} and won't appear in the ${currentYear} view.`,
        variant: 'success',
      });
    }

    try {
      const updatedHolidays = [...(holidays ?? []), newDate];
      await setHolidays.mutateAsync(updatedHolidays);
      setNewDate('');
      if (enteredYear === currentYear) {
        showToast({ message: 'Holiday added', variant: 'success' });
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        setServerError(err.body.message || 'Failed to add holiday.');
      } else {
        setServerError('Unable to connect to server.');
      }
    }
  }

  async function handleRemoveHoliday(dateStr: string) {
    setServerError(null);
    try {
      const updatedHolidays = (holidays ?? []).filter((d) => d !== dateStr);
      await setHolidays.mutateAsync(updatedHolidays);
      setPendingRemoval(null);
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
                  {canUpdate && <th className="px-4 py-2 text-left font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {currentYearHolidays.map((dateStr) => (
                  <tr key={dateStr} className="border-b">
                    <td className="px-4 py-2">
                      <DateDisplay date={dateStr} />
                    </td>
                    {canUpdate && (
                      <td className="px-4 py-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPendingRemoval(dateStr)}
                          disabled={setHolidays.isPending}
                          aria-label={`Remove holiday ${dateStr}`}
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

        <ConfirmDialog
          open={pendingRemoval !== null}
          onOpenChange={(open) => {
            if (!open) setPendingRemoval(null);
          }}
          title="Remove holiday?"
          description={
            pendingRemoval
              ? `Remove holiday ${pendingRemoval}? This affects all future loan schedules.`
              : ''
          }
          confirmLabel="Remove"
          variant="destructive"
          loading={setHolidays.isPending}
          onConfirm={() => {
            if (pendingRemoval) void handleRemoveHoliday(pendingRemoval);
          }}
        />

        {canUpdate && (
          <form onSubmit={handleAddHoliday} className="flex flex-col gap-3 pt-2 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="space-y-1.5 sm:w-auto">
              <Label htmlFor="holiday-date">Date</Label>
              <Input
                id="holiday-date"
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={setHolidays.isPending} className="w-full min-h-[48px] sm:w-auto sm:min-h-[44px]">
              <Plus className="mr-1 h-4 w-4" />
              {setHolidays.isPending ? 'Adding…' : 'Add Holiday'}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
