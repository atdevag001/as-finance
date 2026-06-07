import { Injectable } from '@nestjs/common';
import { SettingsRepository } from './settings.repository';
import { ValidationError } from '../../common/errors';

const HOLIDAYS_KEY = 'holiday_calendar';

@Injectable()
export class SettingsService {
  constructor(private readonly settingsRepo: SettingsRepository) {}

  async findAll() {
    return this.settingsRepo.findAll();
  }

  async updateByKey(key: string, value: unknown, actorId: string, description?: string) {
    return this.settingsRepo.upsert(key, value, actorId, description);
  }

  async getHolidays(): Promise<string[]> {
    const setting = await this.settingsRepo.findByKey(HOLIDAYS_KEY);
    if (!setting) {
      return [];
    }
    return setting.value as string[];
  }

  async setHolidays(holidays: string[], actorId: string): Promise<string[]> {
    // Strict YYYY-MM-DD: schedule.toDateKey formats lookups as YYYY-MM-DD, so any other format would silently never match.
    const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
    for (const h of holidays) {
      if (!ISO_DATE_RE.test(h)) {
        throw new ValidationError(`Invalid ISO date string: ${h}`);
      }
      // Round-trip check rejects rollover values like 2024-02-30 / 2024-04-31 which Date.parse silently accepts.
      const d = new Date(`${h}T00:00:00Z`);
      if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== h) {
        throw new ValidationError(`Invalid ISO date string: ${h}`);
      }
    }

    // Deduplicate and sort
    const unique = [...new Set(holidays)].sort();

    await this.settingsRepo.upsert(HOLIDAYS_KEY, unique, actorId, 'Holiday calendar — JSON array of ISO date strings');
    return unique;
  }
}
