/**
 * Shared Excel types.
 *
 * Used by both the export path (ExcelService.exportToBuffer) and the import path
 * (ExcelService.parseToRows). Domains describe the columns they want; the service
 * does the I/O, type coercion, and PII masking.
 */

export type ColumnType = 'currency' | 'date' | 'number' | 'string';
export type PiiMask = 'aadhaar' | 'pan' | 'mobile';

export interface ExportColumn {
  /** Object key on each row. */
  key: string;
  /** Human-readable column header. */
  label: string;
  /** Type-aware formatting. Currency divides paise by 100 and uses ₹ format. */
  type?: ColumnType;
  /** When set, the value is masked unless the caller passes unmaskPii=true. */
  mask?: PiiMask;
}

export interface ExportOptions {
  /** Workbook title — also becomes the worksheet name (sanitized). */
  title: string;
  /** Optional filter chips printed above the table (e.g. "status: active"). */
  filters?: Record<string, string>;
  /** Optional summary printed above the table (e.g. totals). */
  summary?: Record<string, unknown>;
  /** When false, all `mask` columns reveal their full value. Default false (mask on). */
  unmaskPii?: boolean;
}

export interface ImportColumnSchema {
  /** Column name as expected in the header row. */
  key: string;
  /** Type to coerce to. */
  type: ColumnType;
  /** Required = cell cannot be empty. Default true. */
  required?: boolean;
  /** Optional custom validator: return null/undefined to accept, string to reject with that message. */
  validate?: (value: unknown, rowIndex: number) => string | null | undefined;
}

export interface ImportRowError {
  /** 1-indexed row in the source workbook (excluding header). */
  rowIndex: number;
  column: string;
  message: string;
}

export interface ImportResult<T = Record<string, unknown>> {
  /** Total non-empty rows seen (excluding header). */
  totalRows: number;
  /** Rows where every required column validated. */
  validRows: T[];
  /** Per-cell errors collected across all rows. */
  errors: ImportRowError[];
}

/** Strictly cap workbook size — refuse files larger than this. */
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

/** Strictly cap row count — refuse workbooks with more data rows than this. */
export const MAX_IMPORT_ROWS = 5000;
