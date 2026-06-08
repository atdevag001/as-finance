import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';
import type { DomainImporter, ImportDomain } from '../types';

type SettingsRow = { key: string; value: string };

/** Keys we refuse to allow imports to touch — they're managed via dedicated UI. */
const PROTECTED_KEYS = new Set<string>(['holiday_calendar']);

/**
 * Settings importer — two columns: key, value.
 *
 * Keys must already exist (no creating new settings via Excel — that requires
 * a code change). Value is coerced to the type of the existing setting.
 */
@Injectable()
export class SettingsImporter implements DomainImporter<SettingsRow> {
  readonly domain: ImportDomain = 'settings';
  readonly displayLabel = 'Setting';
  readonly permission = 'settings.import' as const;

  readonly schema = [
    { key: 'key', type: 'string' as const, required: true },
    { key: 'value', type: 'string' as const, required: true },
  ];

  readonly templateColumns = [
    { key: 'key', label: 'Key', example: 'max_annual_rate_bps' },
    { key: 'value', label: 'Value', example: '36000' },
  ];

  constructor(
    @Inject(SettingsService) private readonly settings: SettingsService,
  ) {}

  async applyRow(row: SettingsRow, _tx: unknown, actorId: string): Promise<void> {
    if (PROTECTED_KEYS.has(row.key)) {
      throw new BadRequestException(
        `'${row.key}' cannot be imported here — use the dedicated Holiday Calendar`,
      );
    }
    // Load existing setting to know what type to coerce to.
    const all = await this.settings.findAll();
    const existing = all.find((s) => s.key === row.key);
    if (!existing) {
      throw new BadRequestException(
        `Unknown setting key '${row.key}'. Settings cannot be created via import.`,
      );
    }
    const coerced = coerceToExistingType(row.value, existing.value);
    await this.settings.updateByKey(row.key, coerced, actorId);
  }
}

function coerceToExistingType(raw: string, existingValue: unknown): unknown {
  const trimmed = String(raw).trim();
  if (typeof existingValue === 'number') {
    const n = Number(trimmed);
    if (!Number.isFinite(n)) throw new BadRequestException(`'${raw}' is not a number`);
    return n;
  }
  if (typeof existingValue === 'boolean') {
    if (/^(true|yes|1)$/i.test(trimmed)) return true;
    if (/^(false|no|0)$/i.test(trimmed)) return false;
    throw new BadRequestException(`'${raw}' is not a boolean`);
  }
  if (Array.isArray(existingValue)) {
    try {
      const parsed = JSON.parse(trimmed);
      if (!Array.isArray(parsed)) throw new Error('not an array');
      return parsed;
    } catch {
      throw new BadRequestException(`'${raw}' is not a valid JSON array`);
    }
  }
  if (existingValue !== null && typeof existingValue === 'object') {
    try {
      return JSON.parse(trimmed);
    } catch {
      throw new BadRequestException(`'${raw}' is not valid JSON`);
    }
  }
  return trimmed;
}
