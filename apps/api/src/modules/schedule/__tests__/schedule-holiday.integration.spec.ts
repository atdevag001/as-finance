import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateSchedule,
  generateDueDates,
  adjustForHolidays,
  type ScheduleParams,
} from '../schedule.service';
import { SettingsService } from '../../settings/settings.service';
import { InterestType, Frequency } from '@as-finance/shared';

/**
 * Integration test: Settings + Schedule holiday adjustment.
 *
 * Verifies that when the schedule generator uses holidays from the
 * SettingsService, due dates falling on configured holidays are shifted
 * to the next business day.
 *
 * Validates: Requirements 58.9
 */

// ── Mock Settings Repository ─────────────────────────────────────────────────

function createMockSettingsRepo() {
  return {
    findAll: vi.fn(),
    findByKey: vi.fn(),
    upsert: vi.fn().mockResolvedValue({}),
  };
}

// ── Helper: build ScheduleParams with holidays from SettingsService ──────────

async function buildParamsWithSettingsHolidays(
  settingsService: SettingsService,
  overrides: Partial<ScheduleParams> = {},
): Promise<ScheduleParams> {
  const holidayStrings = await settingsService.getHolidays();
  const holidays = holidayStrings.map((h) => new Date(h));

  return {
    principalPaise: 1_200_000,
    annualRateBps: 1200,
    tenureMonths: 12,
    interestType: InterestType.FLAT,
    frequency: Frequency.MONTHLY,
    startDate: new Date('2024-01-01'),
    holidays,
    ...overrides,
  };
}

/** Format a Date as "YYYY-MM-DD" for comparison. */
function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Settings + Schedule Holiday Integration', () => {
  let settingsService: SettingsService;
  let mockRepo: ReturnType<typeof createMockSettingsRepo>;

  beforeEach(() => {
    mockRepo = createMockSettingsRepo();
    settingsService = new SettingsService(mockRepo as never);
  });

  describe('Req 58.9 — Due date on holiday shifted to next business day', () => {
    it('should shift a due date falling on a single holiday to the next day', async () => {
      // Configure a holiday on 2024-02-01 (which is the first due date for monthly starting 2024-01-01)
      mockRepo.findByKey.mockResolvedValue({
        id: '1',
        key: 'holiday_calendar',
        value: ['2024-02-01'],
        description: null,
        updated_by: 'u1',
        updated_at: new Date(),
      });

      const params = await buildParamsWithSettingsHolidays(settingsService);
      const schedule = generateSchedule(params);

      // First due date should be shifted from 2024-02-01 to 2024-02-02
      expect(toDateKey(schedule[0].dueDate)).toBe('2024-02-02');
      // Other due dates should remain unchanged
      expect(toDateKey(schedule[1].dueDate)).toBe('2024-03-01');
    });

    it('should shift through consecutive holidays to the first non-holiday day', async () => {
      // Configure consecutive holidays: 2024-03-01, 2024-03-02, 2024-03-03
      mockRepo.findByKey.mockResolvedValue({
        id: '1',
        key: 'holiday_calendar',
        value: ['2024-03-01', '2024-03-02', '2024-03-03'],
        description: null,
        updated_by: 'u1',
        updated_at: new Date(),
      });

      const params = await buildParamsWithSettingsHolidays(settingsService);
      const schedule = generateSchedule(params);

      // Second installment (March) should skip all 3 consecutive holidays
      // 2024-03-01 → holiday, 2024-03-02 → holiday, 2024-03-03 → holiday → lands on 2024-03-04
      expect(toDateKey(schedule[1].dueDate)).toBe('2024-03-04');
      // First installment (Feb) should be unaffected
      expect(toDateKey(schedule[0].dueDate)).toBe('2024-02-01');
    });

    it('should shift the first due date when it falls on a holiday', async () => {
      // Holiday on the very first due date
      mockRepo.findByKey.mockResolvedValue({
        id: '1',
        key: 'holiday_calendar',
        value: ['2024-02-01'],
        description: null,
        updated_by: 'u1',
        updated_at: new Date(),
      });

      const params = await buildParamsWithSettingsHolidays(settingsService, {
        tenureMonths: 3,
      });
      const schedule = generateSchedule(params);

      expect(schedule).toHaveLength(3);
      // First due date shifted
      expect(toDateKey(schedule[0].dueDate)).toBe('2024-02-02');
      // Remaining unaffected
      expect(toDateKey(schedule[1].dueDate)).toBe('2024-03-01');
      expect(toDateKey(schedule[2].dueDate)).toBe('2024-04-01');
    });

    it('should shift the last due date when it falls on a holiday', async () => {
      // 3-month tenure: last due date is 2024-04-01
      mockRepo.findByKey.mockResolvedValue({
        id: '1',
        key: 'holiday_calendar',
        value: ['2024-04-01'],
        description: null,
        updated_by: 'u1',
        updated_at: new Date(),
      });

      const params = await buildParamsWithSettingsHolidays(settingsService, {
        tenureMonths: 3,
      });
      const schedule = generateSchedule(params);

      expect(schedule).toHaveLength(3);
      // First two unaffected
      expect(toDateKey(schedule[0].dueDate)).toBe('2024-02-01');
      expect(toDateKey(schedule[1].dueDate)).toBe('2024-03-01');
      // Last due date shifted
      expect(toDateKey(schedule[2].dueDate)).toBe('2024-04-02');
    });

    it('should handle multiple holidays affecting different due dates', async () => {
      // Holidays on Feb 1 and Apr 1
      mockRepo.findByKey.mockResolvedValue({
        id: '1',
        key: 'holiday_calendar',
        value: ['2024-02-01', '2024-04-01'],
        description: null,
        updated_by: 'u1',
        updated_at: new Date(),
      });

      const params = await buildParamsWithSettingsHolidays(settingsService, {
        tenureMonths: 4,
      });
      const schedule = generateSchedule(params);

      expect(schedule).toHaveLength(4);
      expect(toDateKey(schedule[0].dueDate)).toBe('2024-02-02'); // shifted
      expect(toDateKey(schedule[1].dueDate)).toBe('2024-03-01'); // unaffected
      expect(toDateKey(schedule[2].dueDate)).toBe('2024-04-02'); // shifted
      expect(toDateKey(schedule[3].dueDate)).toBe('2024-05-01'); // unaffected
    });

    it('should not shift due dates when no holidays are configured', async () => {
      // No holiday_calendar setting
      mockRepo.findByKey.mockResolvedValue(null);

      const params = await buildParamsWithSettingsHolidays(settingsService, {
        tenureMonths: 3,
      });
      const schedule = generateSchedule(params);

      expect(schedule).toHaveLength(3);
      expect(toDateKey(schedule[0].dueDate)).toBe('2024-02-01');
      expect(toDateKey(schedule[1].dueDate)).toBe('2024-03-01');
      expect(toDateKey(schedule[2].dueDate)).toBe('2024-04-01');
    });

    it('should not shift due dates when holidays do not overlap with any due date', async () => {
      // Holidays on dates that are not due dates
      mockRepo.findByKey.mockResolvedValue({
        id: '1',
        key: 'holiday_calendar',
        value: ['2024-01-26', '2024-08-15', '2024-10-02'],
        description: null,
        updated_by: 'u1',
        updated_at: new Date(),
      });

      const params = await buildParamsWithSettingsHolidays(settingsService, {
        tenureMonths: 3,
      });
      const schedule = generateSchedule(params);

      expect(toDateKey(schedule[0].dueDate)).toBe('2024-02-01');
      expect(toDateKey(schedule[1].dueDate)).toBe('2024-03-01');
      expect(toDateKey(schedule[2].dueDate)).toBe('2024-04-01');
    });

    it('should work with weekly frequency and holidays', async () => {
      // Weekly schedule starting 2024-01-01, first due date is 2024-01-08
      mockRepo.findByKey.mockResolvedValue({
        id: '1',
        key: 'holiday_calendar',
        value: ['2024-01-08'],
        description: null,
        updated_by: 'u1',
        updated_at: new Date(),
      });

      const params = await buildParamsWithSettingsHolidays(settingsService, {
        tenureMonths: 1,
        frequency: Frequency.WEEKLY,
      });
      const schedule = generateSchedule(params);

      // Weekly for 1 month: ceil(1 × 52/12) = ceil(4.333) = 5 installments
      expect(schedule).toHaveLength(5);
      // First due date shifted from 2024-01-08 to 2024-01-09
      expect(toDateKey(schedule[0].dueDate)).toBe('2024-01-09');
      // Others unaffected
      expect(toDateKey(schedule[1].dueDate)).toBe('2024-01-15');
    });

    it('should work with daily frequency and holidays', async () => {
      // Daily schedule starting 2024-01-01, first due date is 2024-01-02
      mockRepo.findByKey.mockResolvedValue({
        id: '1',
        key: 'holiday_calendar',
        value: ['2024-01-02', '2024-01-03'],
        description: null,
        updated_by: 'u1',
        updated_at: new Date(),
      });

      const params = await buildParamsWithSettingsHolidays(settingsService, {
        tenureMonths: 1,
        frequency: Frequency.DAILY,
      });
      const schedule = generateSchedule(params);

      // Daily for 1 month: ceil(1 × 365.25/12) = ceil(30.4375) = 31 installments
      expect(schedule).toHaveLength(31);
      // First due date: 2024-01-02 → holiday, 2024-01-03 → holiday → 2024-01-04
      expect(toDateKey(schedule[0].dueDate)).toBe('2024-01-04');
      // Second due date: 2024-01-03 → holiday → 2024-01-04, but collides with
      // schedule[0] → monotonicity rule pushes it to 2024-01-05.
      expect(toDateKey(schedule[1].dueDate)).toBe('2024-01-05');
      // Third due date: 2024-01-04 not a holiday, but ≤ schedule[1]=2024-01-05
      // → pushed forward by monotonicity to 2024-01-06.
      expect(toDateKey(schedule[2].dueDate)).toBe('2024-01-06');
    });

    it('should work with reducing balance interest type and holidays', async () => {
      mockRepo.findByKey.mockResolvedValue({
        id: '1',
        key: 'holiday_calendar',
        value: ['2024-02-01'],
        description: null,
        updated_by: 'u1',
        updated_at: new Date(),
      });

      const params = await buildParamsWithSettingsHolidays(settingsService, {
        interestType: InterestType.REDUCING_BALANCE,
        tenureMonths: 3,
      });
      const schedule = generateSchedule(params);

      expect(schedule).toHaveLength(3);
      // First due date shifted regardless of interest type
      expect(toDateKey(schedule[0].dueDate)).toBe('2024-02-02');
      expect(toDateKey(schedule[1].dueDate)).toBe('2024-03-01');
      expect(toDateKey(schedule[2].dueDate)).toBe('2024-04-01');
    });

    it('should integrate setHolidays → getHolidays → generateSchedule end-to-end', async () => {
      // Simulate the full flow: set holidays via settings, then use them for schedule generation
      await settingsService.setHolidays(['2024-03-01', '2024-02-01'], 'admin-1');

      // Verify setHolidays persisted (sorted + deduped)
      expect(mockRepo.upsert).toHaveBeenCalledWith(
        'holiday_calendar',
        ['2024-02-01', '2024-03-01'],
        'admin-1',
        'Holiday calendar — JSON array of ISO date strings',
      );

      // Now simulate getHolidays returning the stored value
      mockRepo.findByKey.mockResolvedValue({
        id: '1',
        key: 'holiday_calendar',
        value: ['2024-02-01', '2024-03-01'],
        description: null,
        updated_by: 'admin-1',
        updated_at: new Date(),
      });

      const params = await buildParamsWithSettingsHolidays(settingsService, {
        tenureMonths: 4,
      });
      const schedule = generateSchedule(params);

      expect(schedule).toHaveLength(4);
      expect(toDateKey(schedule[0].dueDate)).toBe('2024-02-02'); // shifted from Feb 1
      expect(toDateKey(schedule[1].dueDate)).toBe('2024-03-02'); // shifted from Mar 1
      expect(toDateKey(schedule[2].dueDate)).toBe('2024-04-01'); // unaffected
      expect(toDateKey(schedule[3].dueDate)).toBe('2024-05-01'); // unaffected
    });
  });
});
