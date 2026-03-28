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
    // Validate each entry is a valid ISO date string
    for (const h of holidays) {
      const parsed = Date.parse(h);
      if (isNaN(parsed)) {
        throw new ValidationError(`Invalid ISO date string: ${h}`);
      }
    }

    // Deduplicate and sort
    const unique = [...new Set(holidays)].sort();

    await this.settingsRepo.upsert(HOLIDAYS_KEY, unique, actorId, 'Holiday calendar — JSON array of ISO date strings');
    return unique;
  }
}
