import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SettingsService } from '../settings.service';
import { SettingsRepository } from '../settings.repository';

function createMockRepo() {
  return {
    findAll: vi.fn(),
    findByKey: vi.fn(),
    upsert: vi.fn(),
  } as unknown as SettingsRepository;
}

describe('SettingsService', () => {
  let service: SettingsService;
  let repo: ReturnType<typeof createMockRepo>;

  beforeEach(() => {
    repo = createMockRepo();
    service = new SettingsService(repo as SettingsRepository);
  });

  describe('findAll', () => {
    it('should return all settings from repository', async () => {
      const settings = [
        { id: '1', key: 'holiday_calendar', value: [], description: null, updated_by: null, updated_at: new Date() },
      ];
      (repo.findAll as ReturnType<typeof vi.fn>).mockResolvedValue(settings);

      const result = await service.findAll();
      expect(result).toEqual(settings);
      expect(repo.findAll).toHaveBeenCalledOnce();
    });
  });

  describe('updateByKey', () => {
    it('should upsert the setting via repository', async () => {
      const expected = { id: '1', key: 'max_rate', value: 3600, description: 'Max rate bps', updated_by: 'u1', updated_at: new Date() };
      (repo.upsert as ReturnType<typeof vi.fn>).mockResolvedValue(expected);

      const result = await service.updateByKey('max_rate', 3600, 'u1', 'Max rate bps');
      expect(result).toEqual(expected);
      expect(repo.upsert).toHaveBeenCalledWith('max_rate', 3600, 'u1', 'Max rate bps');
    });
  });

  describe('getHolidays', () => {
    it('should return empty array when no holiday setting exists', async () => {
      (repo.findByKey as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await service.getHolidays();
      expect(result).toEqual([]);
    });

    it('should return holidays from the stored setting', async () => {
      const holidays = ['2024-01-26', '2024-08-15'];
      (repo.findByKey as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: '1', key: 'holiday_calendar', value: holidays, description: null, updated_by: null, updated_at: new Date(),
      });

      const result = await service.getHolidays();
      expect(result).toEqual(holidays);
    });
  });

  describe('setHolidays', () => {
    it('should validate, deduplicate, sort, and persist holidays', async () => {
      const input = ['2024-08-15', '2024-01-26', '2024-08-15'];
      const expected = ['2024-01-26', '2024-08-15'];
      (repo.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const result = await service.setHolidays(input, 'u1');
      expect(result).toEqual(expected);
      expect(repo.upsert).toHaveBeenCalledWith(
        'holiday_calendar',
        expected,
        'u1',
        'Holiday calendar — JSON array of ISO date strings',
      );
    });

    it('should reject invalid date strings', async () => {
      await expect(service.setHolidays(['not-a-date'], 'u1')).rejects.toThrow('Invalid ISO date string');
    });

    it('should accept valid ISO date strings', async () => {
      (repo.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});
      const result = await service.setHolidays(['2024-12-25'], 'u1');
      expect(result).toEqual(['2024-12-25']);
    });
  });
});
