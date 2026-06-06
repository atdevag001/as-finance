/** Computes the changed keys between original and current settings */
export function getChangedSettings(
  original: Record<string, string>,
  current: Record<string, string>,
): Record<string, string> {
  const changed: Record<string, string> = {};
  for (const key of Object.keys(current)) {
    const value = current[key];
    if (value !== undefined && value !== original[key]) {
      changed[key] = value;
    }
  }
  return changed;
}

/**
 * Classify the original (server-side) type of a setting value so the edit form
 * can render the right input AND coerce the edited string back to the same type
 * on save. JSONB settings are read by other modules with strict type expectations
 * (e.g. SettingsService.getHolidays() casts to string[]), so saving a number as
 * `"36"` would silently break downstream consumers.
 */
export type SettingValueKind = 'string' | 'number' | 'boolean' | 'json';

export function classifySettingValue(value: unknown): SettingValueKind {
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'string') return 'string';
  // Arrays, objects, null → JSON. These need a JSON-aware editor; the basic
  // form should NOT round-trip them as plain strings.
  return 'json';
}

/**
 * Parse an edited string back to its original JSON type.
 * Throws if the string can't be parsed as the requested type.
 */
export function parseSettingValue(raw: string, kind: SettingValueKind): unknown {
  switch (kind) {
    case 'string':
      return raw;
    case 'number': {
      const trimmed = raw.trim();
      if (trimmed === '') throw new Error('Number setting cannot be empty');
      const n = Number(trimmed);
      if (!Number.isFinite(n)) throw new Error(`Invalid number: "${raw}"`);
      return n;
    }
    case 'boolean': {
      const v = raw.trim().toLowerCase();
      if (v === 'true') return true;
      if (v === 'false') return false;
      throw new Error(`Invalid boolean: "${raw}" (expected "true" or "false")`);
    }
    case 'json': {
      try {
        return JSON.parse(raw);
      } catch {
        throw new Error(`Invalid JSON: ${raw.slice(0, 40)}…`);
      }
    }
  }
}

/**
 * Stringify a typed setting value for display in a text input. Arrays/objects
 * become formatted JSON so the user sees structure rather than `[object Object]`.
 */
export function stringifySettingValue(value: unknown, kind: SettingValueKind): string {
  if (kind === 'json') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return '';
    }
  }
  return value == null ? '' : String(value);
}
