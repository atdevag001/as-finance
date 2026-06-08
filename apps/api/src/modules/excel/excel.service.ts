import { BadRequestException, Injectable, PayloadTooLargeException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import {
  ExportColumn,
  ExportOptions,
  ImportColumnSchema,
  ImportResult,
  ImportRowError,
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ROWS,
  PiiMask,
} from './types';

/**
 * Generic Excel I/O — read and write .xlsx (and .csv on input).
 *
 * Replaces the Excel half of ReportExportService so other domains (Customers,
 * Loans, Holidays, etc.) can export and import without each rewriting the same
 * cell-type plumbing.
 *
 * Two main entry points:
 *  - exportToBuffer(columns, rows, opts) → Buffer (xlsx)
 *  - parseToRows(buffer, schema)        → { validRows, errors, totalRows }
 *
 * Both are pure: no DB, no S3, no logging. Domain controllers wrap these with
 * permission checks, repository queries, and audit-log writes.
 */
@Injectable()
export class ExcelService {
  // ────────────────────────────────────────────────────────────────────────────
  // EXPORT
  // ────────────────────────────────────────────────────────────────────────────

  async exportToBuffer(
    columns: ExportColumn[],
    rows: ReadonlyArray<Record<string, unknown>>,
    opts: ExportOptions,
  ): Promise<Buffer> {
    if (columns.length === 0) {
      throw new BadRequestException('Export needs at least one column');
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'AS Finance';
    workbook.created = new Date();

    const sheetName = sanitizeSheetName(opts.title || 'Export');
    const sheet = workbook.addWorksheet(sheetName);
    const unmask = opts.unmaskPii === true;

    // Title row
    sheet.mergeCells('A1', `${colLetter(columns.length)}1`);
    const titleCell = sheet.getCell('A1');
    titleCell.value = opts.title;
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { horizontal: 'center' };

    let currentRow = 2;

    if (opts.filters && Object.keys(opts.filters).length > 0) {
      const filterText = Object.entries(opts.filters)
        .map(([k, v]) => `${k}: ${v}`)
        .join(' | ');
      sheet.mergeCells(`A${currentRow}`, `${colLetter(columns.length)}${currentRow}`);
      const cell = sheet.getCell(`A${currentRow}`);
      cell.value = filterText;
      cell.font = { italic: true, size: 10 };
      currentRow++;
    }

    if (opts.summary && Object.keys(opts.summary).length > 0) {
      const summaryText = Object.entries(opts.summary)
        .filter(([, v]) => typeof v !== 'object')
        .map(([k, v]) => `${formatLabel(k)}: ${formatValue(v, k)}`)
        .join(' | ');
      sheet.mergeCells(`A${currentRow}`, `${colLetter(columns.length)}${currentRow}`);
      const cell = sheet.getCell(`A${currentRow}`);
      cell.value = summaryText;
      cell.font = { bold: true, size: 11 };
      currentRow++;
    }

    // Blank row before header
    currentRow++;

    // Header row
    const headerRow = sheet.getRow(currentRow);
    columns.forEach((col, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.value = col.label || formatLabel(col.key);
      cell.font = { bold: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' },
      };
      cell.border = { bottom: { style: 'thin' } };
    });
    currentRow++;

    // Data rows
    for (const row of rows) {
      const dataRow = sheet.getRow(currentRow);
      columns.forEach((col, idx) => {
        const cell = dataRow.getCell(idx + 1);
        const raw = row[col.key];

        if (col.mask && !unmask) {
          cell.value = maskValue(raw, col.mask);
          return;
        }

        const inferred =
          col.type ??
          (col.key.toLowerCase().includes('paise')
            ? 'currency'
            : col.key.toLowerCase().includes('date')
              ? 'date'
              : typeof raw === 'number'
                ? 'number'
                : 'string');

        if (inferred === 'currency') {
          const num = typeof raw === 'string' ? parseInt(raw, 10) : (raw as number);
          cell.value = Number.isFinite(num) ? num / 100 : '';
          cell.numFmt = '₹#,##0.00';
        } else if (inferred === 'date') {
          cell.value = raw ? new Date(raw as string) : '';
          cell.numFmt = 'yyyy-mm-dd';
        } else if (inferred === 'number') {
          cell.value = raw as number;
        } else {
          cell.value = raw === null || raw === undefined ? '' : String(raw);
        }
      });
      currentRow++;
    }

    // Auto-fit (capped 40)
    columns.forEach((col, idx) => {
      const column = sheet.getColumn(idx + 1);
      let maxLength = col.label.length;
      rows.forEach((row) => {
        const v = row[col.key];
        const len = v !== null && v !== undefined ? String(v).length : 0;
        if (len > maxLength) maxLength = len;
      });
      column.width = Math.min(Math.max(maxLength + 2, 10), 40);
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // IMPORT
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Parse a workbook buffer against an `ImportColumnSchema[]`. Returns the
   * validated rows and per-cell errors. Does NOT write anything to a DB —
   * the caller wraps this in their own transaction.
   *
   * Supports both .xlsx (via ExcelJS xlsx loader) and .csv (via ExcelJS csv loader).
   */
  async parseToRows<T extends Record<string, unknown>>(
    buffer: Buffer,
    schema: ImportColumnSchema[],
    opts: { filename?: string } = {},
  ): Promise<ImportResult<T>> {
    if (buffer.byteLength > MAX_IMPORT_FILE_BYTES) {
      throw new PayloadTooLargeException(
        `Import file is ${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB — limit is ${
          MAX_IMPORT_FILE_BYTES / 1024 / 1024
        } MB`,
      );
    }

    const workbook = new ExcelJS.Workbook();
    const filename = opts.filename ?? '';
    const isCsv = filename.toLowerCase().endsWith('.csv');

    if (isCsv) {
      // exceljs csv read works on streams; convert buffer to stream.
      const { Readable } = await import('stream');
      const stream = Readable.from(buffer);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (workbook.csv as any).read(stream);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await workbook.xlsx.load(buffer as any);
    }

    const sheet = workbook.worksheets[0];
    if (!sheet) {
      throw new BadRequestException('Workbook has no sheets');
    }

    // Find header row (first non-empty row).
    let headerRowNum = 1;
    while (headerRowNum <= sheet.rowCount && isRowEmpty(sheet.getRow(headerRowNum))) {
      headerRowNum++;
    }
    if (headerRowNum > sheet.rowCount) {
      throw new BadRequestException('Workbook is empty');
    }

    const headerRow = sheet.getRow(headerRowNum);
    const headerLabels: string[] = [];
    headerRow.eachCell({ includeEmpty: false }, (cell) => {
      headerLabels.push(String(cell.value ?? '').trim());
    });

    // Match headers to schema (case-insensitive, ignore whitespace differences).
    const colIndexByKey = new Map<string, number>();
    const missing: string[] = [];
    for (const col of schema) {
      const idx = headerLabels.findIndex((h) => normalize(h) === normalize(col.key));
      if (idx < 0) missing.push(col.key);
      else colIndexByKey.set(col.key, idx + 1); // ExcelJS columns are 1-indexed
    }
    if (missing.length > 0) {
      throw new BadRequestException(
        `Missing required columns: ${missing.join(', ')}. Found: ${headerLabels.join(', ')}`,
      );
    }

    // Count data rows.
    const dataStartRow = headerRowNum + 1;
    const dataRowCount = sheet.rowCount - headerRowNum;
    if (dataRowCount > MAX_IMPORT_ROWS) {
      throw new PayloadTooLargeException(
        `Workbook has ${dataRowCount} data rows — limit is ${MAX_IMPORT_ROWS}`,
      );
    }

    const validRows: T[] = [];
    const errors: ImportRowError[] = [];
    let seenDataRows = 0;

    for (let rowNum = dataStartRow; rowNum <= sheet.rowCount; rowNum++) {
      const row = sheet.getRow(rowNum);
      if (isRowEmpty(row)) continue;
      seenDataRows++;

      const parsed: Record<string, unknown> = {};
      const rowErrors: ImportRowError[] = [];

      for (const col of schema) {
        const colIdx = colIndexByKey.get(col.key);
        if (!colIdx) continue;
        const raw = row.getCell(colIdx).value;
        const required = col.required ?? true;

        if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) {
          if (required) {
            rowErrors.push({ rowIndex: seenDataRows, column: col.key, message: 'Required' });
          } else {
            parsed[col.key] = null;
          }
          continue;
        }

        try {
          parsed[col.key] = coerceCell(raw, col.type);
        } catch (err) {
          rowErrors.push({
            rowIndex: seenDataRows,
            column: col.key,
            message: err instanceof Error ? err.message : 'Invalid value',
          });
          continue;
        }

        if (col.validate) {
          const msg = col.validate(parsed[col.key], seenDataRows);
          if (msg) {
            rowErrors.push({ rowIndex: seenDataRows, column: col.key, message: msg });
          }
        }
      }

      if (rowErrors.length > 0) {
        errors.push(...rowErrors);
      } else {
        validRows.push(parsed as T);
      }
    }

    return { totalRows: seenDataRows, validRows, errors };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────────────────────

function colLetter(n: number): string {
  let result = '';
  let nn = n;
  while (nn > 0) {
    nn--;
    result = String.fromCharCode(65 + (nn % 26)) + result;
    nn = Math.floor(nn / 26);
  }
  return result || 'A';
}

function sanitizeSheetName(name: string): string {
  return (
    name
      .replace(/[*?:\\/[\]<>&"]/g, '')
      .replace(/^'+|'+$/g, '')
      .substring(0, 31)
      .trim() || 'Sheet1'
  );
}

function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]/g, ' ')
    .replace(/paise$/i, '')
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function formatValue(value: unknown, key: string): string {
  if (value === null || value === undefined) return '-';
  if (key.toLowerCase().includes('paise')) {
    const num = typeof value === 'string' ? parseInt(value, 10) : (value as number);
    return `₹${(num / 100).toFixed(2)}`;
  }
  return String(value);
}

function maskValue(value: unknown, mask: PiiMask): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (mask === 'aadhaar') {
    // Show last 4 digits only.
    const last4 = s.slice(-4);
    return last4.length === 4 ? `XXXX XXXX ${last4}` : 'XXXX XXXX XXXX';
  }
  if (mask === 'pan') {
    return s.length >= 10 ? `${s.slice(0, 2)}XXXX${s.slice(-3)}` : 'XXXXXXXXXX';
  }
  if (mask === 'mobile') {
    return s.length >= 4 ? `XXXXXX${s.slice(-4)}` : 'XXXXXXXXXX';
  }
  return s;
}

function isRowEmpty(row: ExcelJS.Row): boolean {
  let empty = true;
  row.eachCell({ includeEmpty: false }, (cell) => {
    const v = cell.value;
    if (v !== null && v !== undefined && String(v).trim() !== '') empty = false;
  });
  return empty;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function coerceCell(raw: unknown, type: ExportColumn['type']): unknown {
  if (type === 'date') {
    if (raw instanceof Date) return raw.toISOString().slice(0, 10);
    const str = String(raw).trim();
    // Accept YYYY-MM-DD or DD-MMM-YYYY or DD/MM/YYYY
    const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
    if (isoMatch) return str;
    const slashMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(str);
    if (slashMatch) {
      const [, d, m, y] = slashMatch;
      return `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
    }
    // Excel sometimes gives a number for dates: serialize via Date
    if (typeof raw === 'number') {
      // Excel epoch is 1899-12-30
      const ms = (raw - 25569) * 86400 * 1000;
      const d = new Date(ms);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
    throw new Error('Invalid date — use YYYY-MM-DD');
  }
  if (type === 'number') {
    const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
    if (!Number.isFinite(n)) throw new Error('Not a number');
    return n;
  }
  if (type === 'currency') {
    // Accept either paise (integer) or rupees with decimal — store as paise (int).
    const s = String(raw).trim().replace(/[₹,\s]/g, '');
    const n = Number(s);
    if (!Number.isFinite(n)) throw new Error('Not a number');
    // If there's a decimal, treat as rupees; otherwise treat as paise.
    return /[.]/.test(s) ? Math.round(n * 100) : Math.round(n);
  }
  // string
  return String(raw).trim();
}
