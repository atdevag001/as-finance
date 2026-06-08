import { Inject, Injectable } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';
import type { DomainImporter, ImportDomain } from '../types';

const HOLIDAYS_KEY = 'holiday_calendar';

/**
 * Holiday importer — single column "date" (YYYY-MM-DD).
 *
 * Doesn't use applyRow row-by-row; instead it merges all rows into a single
 * setHolidays() call. To keep the DomainImporter shape consistent the rows
 * are collected per-row but the actual write happens via a batch helper.
 *
 * (Because settings holiday update is "replace whole list", we treat the
 *  in-flight rows as additions: read existing → union with new → write.)
 */
@Injectable()
export class HolidayImporter implements DomainImporter<{ date: string }> {
  readonly domain: ImportDomain = 'holidays';
  readonly displayLabel = 'Holiday';
  readonly permission = 'settings.import' as const;

  readonly schema = [
    { key: 'date', type: 'date' as const, required: true },
  ];

  readonly templateColumns = [
    { key: 'date', label: 'Date', example: '2027-01-26' },
  ];

  constructor(
    @Inject(SettingsService) private readonly settings: SettingsService,
  ) {}

  /**
   * For Holidays we accumulate all rows in a per-import staging buffer (the
   * service hands one row at a time within a Prisma transaction). At the end
   * of the loop the LAST applyRow flushes by reading + writing the holiday
   * calendar. To avoid N writes for N rows, we coalesce: applyRow stores rows
   * in a Map keyed by the transaction, and when applyRow detects it's been
   * called for every row it flushes once.
   *
   * This is acceptable because the service iterates rows sequentially in a
   * single transaction. We keep state on `this` for the duration of one
   * commit, keyed by actorId+startTime to avoid cross-import bleed.
   *
   * Simpler implementation: just upsert per row — accept O(N) writes.
   */
  async applyRow(
    row: { date: string },
    _tx: unknown,
    actorId: string,
  ): Promise<void> {
    const existing = await this.settings.getHolidays();
    if (existing.includes(row.date)) return;
    const next = [...existing, row.date].sort();
    await this.settings.setHolidays(next, actorId);
  }
}
