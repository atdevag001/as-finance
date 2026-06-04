import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SettingsService } from '../settings.service';
import type { SettingsRepository } from '../settings.repository';
import { ValidationError } from '../../../common/errors';

/**
 * Validates: Requirements 58.1, 58.2, 58.3, 58.4, 58.5, 58.6, 58.7, 58.8
 */

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
    service = new SettingsService(repo);
  });

  /**
   * Requirement 58.1: findAll() delegates to repository and returns all settings
   */
  describe('findAll', () => {
    it('should delegate to repository.findAll and return all settings', async () => {
      const settings = [
        { id: '1', key: 'holiday_calendar', value: [], description: 'Holidays', updated_by: 'u1', updated_at: new Date() },
        { id: '2', key: 'max_rate', value: 3600, description: 'Max rate', updated_by: 'u2', updated_at: new Date() },
      ];
      (repo.findAll as ReturnType<typeof vi.fn>).mockResolvedValue(settings);

      const result = await service.findAll();

      expect(result).toEqual(settings);
      expect(repo.findAll).toHaveBeenCalledOnce();
    });

    it('should return empty array when no settings exist', async () => {
      (repo.findAll as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
      expect(repo.findAll).toHaveBeenCalledOnce();
    });
  });

  /**
   * Requirement 58.2: updateByKey() delegates upsert with correct parameters
   */
  describe('updateByKey', () => {
    it('should upsert with key, value, actorId, and description', async () => {
      const expected = { id: '1', key: 'max_rate', value: 3600, description: 'Max rate bps', updated_by: 'u1', updated_at: new Date() };
      (repo.upsert as ReturnType<typeof vi.fn>).mockResolvedValue(expected);

      const result = await service.updateByKey('max_rate', 3600, 'u1', 'Max rate bps');

      expect(result).toEqual(expected);
      expect(repo.upsert).toHaveBeenCalledWith('max_rate', 3600, 'u1', 'Max rate bps');
    });

    it('should pass undefined description when not provided', async () => {
      const expected = { id: '2', key: 'penalty_grace', value: 7, description: undefined, updated_by: 'u2', updated_at: new Date() };
      (repo.upsert as ReturnType<typeof vi.fn>).mockResolvedValue(expected);

      const result = await service.updateByKey('penalty_grace', 7, 'u2');

      expect(result).toEqual(expected);
      expect(repo.upsert).toHaveBeenCalledWith('penalty_grace', 7, 'u2', undefined);
    });

    it('should handle object values', async () => {
      const objValue = { enabled: true, threshold: 500 };
      (repo.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({ id: '3', key: 'config', value: objValue, description: null, updated_by: 'u1', updated_at: new Date() });

      await service.updateByKey('config', objValue, 'u1', 'Config object');

      expect(repo.upsert).toHaveBeenCalledWith('config', objValue, 'u1', 'Config object');
    });

    it('should handle string values', async () => {
      (repo.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({ id: '4', key: 'company_name', value: 'AS Finance', description: null, updated_by: 'u1', updated_at: new Date() });

      await service.updateByKey('company_name', 'AS Finance', 'u1');

      expect(repo.upsert).toHaveBeenCalledWith('company_name', 'AS Finance', 'u1', undefined);
    });
  });

  /**
   * Requirement 58.3: getHolidays() returns empty array when no setting exists
   */
  describe('getHolidays', () => {
    it('should return empty array when no holiday_calendar setting exists', async () => {
      (repo.findByKey as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await service.getHolidays();

      expect(result).toEqual([]);
      expect(repo.findByKey).toHaveBeenCalledWith('holiday_calendar');
    });

    /**
     * Requirement 58.4: getHolidays() returns stored holiday date strings
     */
    it('should return stored holiday date strings', async () => {
      const holidays = ['2024-01-26', '2024-08-15', '2024-10-02'];
      (repo.findByKey as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: '1', key: 'holiday_calendar', value: holidays, description: null, updated_by: 'u1', updated_at: new Date(),
      });

      const result = await service.getHolidays();

      expect(result).toEqual(holidays);
      expect(repo.findByKey).toHaveBeenCalledWith('holiday_calendar');
    });

    it('should return empty array when stored value is empty array', async () => {
      (repo.findByKey as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: '1', key: 'holiday_calendar', value: [], description: null, updated_by: 'u1', updated_at: new Date(),
      });

      const result = await service.getHolidays();

      expect(result).toEqual([]);
    });
  });

  describe('setHolidays', () => {
    /**
     * Requirement 58.5: setHolidays() validates ISO date strings, rejects invalid
     */
    it('should reject invalid date strings with ValidationError', async () => {
      await expect(service.setHolidays(['not-a-date'], 'u1')).rejects.toThrow(ValidationError);
      await expect(service.setHolidays(['not-a-date'], 'u1')).rejects.toThrow('Invalid ISO date string: not-a-date');
    });

    it('should reject when any date in the array is invalid', async () => {
      await expect(
        service.setHolidays(['2024-01-26', 'garbage', '2024-08-15'], 'u1'),
      ).rejects.toThrow(ValidationError);
    });

    it('should reject empty string as invalid date', async () => {
      await expect(service.setHolidays([''], 'u1')).rejects.toThrow(ValidationError);
    });

    it('should accept valid ISO date strings (YYYY-MM-DD)', async () => {
      (repo.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const result = await service.setHolidays(['2024-12-25'], 'u1');

      expect(result).toEqual(['2024-12-25']);
    });

    it('should accept full ISO datetime strings', async () => {
      (repo.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const result = await service.setHolidays(['2024-12-25T00:00:00.000Z'], 'u1');

      expect(result).toEqual(['2024-12-25T00:00:00.000Z']);
    });

    /**
     * Requirement 58.6: setHolidays() deduplicates duplicate date entries
     */
    it('should deduplicate duplicate date entries', async () => {
      (repo.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const result = await service.setHolidays(
        ['2024-01-26', '2024-08-15', '2024-01-26', '2024-08-15', '2024-01-26'],
        'u1',
      );

      expect(result).toEqual(['2024-01-26', '2024-08-15']);
    });

    /**
     * Requirement 58.7: setHolidays() sorts output chronologically
     */
    it('should sort holidays chronologically', async () => {
      (repo.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const result = await service.setHolidays(
        ['2024-12-25', '2024-01-26', '2024-08-15', '2024-03-29'],
        'u1',
      );

      expect(result).toEqual(['2024-01-26', '2024-03-29', '2024-08-15', '2024-12-25']);
    });

    it('should deduplicate and sort together', async () => {
      (repo.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const result = await service.setHolidays(
        ['2024-08-15', '2024-01-26', '2024-08-15', '2024-03-29', '2024-01-26'],
        'u1',
      );

      expect(result).toEqual(['2024-01-26', '2024-03-29', '2024-08-15']);
    });

    /**
     * Requirement 58.8: setHolidays() persists via repository upsert with HOLIDAYS_KEY
     */
    it('should persist via repository upsert with holiday_calendar key', async () => {
      (repo.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await service.setHolidays(['2024-01-26', '2024-08-15'], 'actor-123');

      expect(repo.upsert).toHaveBeenCalledWith(
        'holiday_calendar',
        ['2024-01-26', '2024-08-15'],
        'actor-123',
        'Holiday calendar — JSON array of ISO date strings',
      );
    });

    it('should persist the deduplicated and sorted array, not the raw input', async () => {
      (repo.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await service.setHolidays(['2024-08-15', '2024-01-26', '2024-08-15'], 'u1');

      expect(repo.upsert).toHaveBeenCalledWith(
        'holiday_calendar',
        ['2024-01-26', '2024-08-15'],
        'u1',
        'Holiday calendar — JSON array of ISO date strings',
      );
    });

    it('should handle empty holidays array', async () => {
      (repo.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const result = await service.setHolidays([], 'u1');

      expect(result).toEqual([]);
      expect(repo.upsert).toHaveBeenCalledWith(
        'holiday_calendar',
        [],
        'u1',
        'Holiday calendar — JSON array of ISO date strings',
      );
    });

    it('should not call upsert when validation fails', async () => {
      await expect(service.setHolidays(['bad-date'], 'u1')).rejects.toThrow(ValidationError);

      expect(repo.upsert).not.toHaveBeenCalled();
    });
  });
});
