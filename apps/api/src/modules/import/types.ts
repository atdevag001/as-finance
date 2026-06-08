import type { ImportColumnSchema, ImportRowError } from '../excel/types';
import type { PrismaService } from '../../database/prisma.service';

export type ImportDomain = 'holidays' | 'settings' | 'loan-products';

/**
 * A domain implements this interface to participate in the import flow.
 *
 * The ImportService handles all the generic plumbing (file parsing, dry-run
 * preview, idempotency, audit logging). The domain only describes its schema
 * and how to apply one validated row inside a transaction.
 */
export interface DomainImporter<Row extends Record<string, unknown> = Record<string, unknown>> {
  readonly domain: ImportDomain;
  readonly displayLabel: string;

  /** Permission key required to perform an import for this domain. */
  readonly permission: `${string}.import`;

  /** Columns the user-provided workbook must contain. */
  readonly schema: ImportColumnSchema[];

  /** Headers used when generating the empty template workbook. */
  readonly templateColumns: { key: string; label: string; example?: string }[];

  /**
   * Apply one validated row inside the caller's Prisma transaction.
   * Throws to abort the entire commit (transactional semantics).
   */
  applyRow(row: Row, tx: PrismaService, actorId: string): Promise<void>;
}

export interface ImportDraft {
  importId: string;
  domain: ImportDomain;
  fileHash: string;
  fileSize: number;
  filename: string;
  totalRows: number;
  validRows: Record<string, unknown>[];
  errors: ImportRowError[];
  /** Set when a recent commit had the same file hash. */
  duplicateFileWarning?: { lastImportedAt: string; lastImportedById: string };
  /** When this draft expires from the in-memory cache. */
  expiresAt: number;
  /** Who uploaded the file. */
  createdById: string;
  createdByRole: string;
}

export interface DryRunResponse {
  importId: string;
  domain: ImportDomain;
  fileHash: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  errors: ImportRowError[];
  /** First N rows of validRows for the UI preview. */
  preview: Record<string, unknown>[];
  duplicateFileWarning?: { lastImportedAt: string; lastImportedById: string };
}

export interface CommitResponse {
  importId: string;
  domain: ImportDomain;
  rowsAccepted: number;
  rowsSkipped: number;
  errors: ImportRowError[];
  committedAt: string;
}

/** Drafts older than this are evicted from the in-memory cache. */
export const DRAFT_TTL_MS = 15 * 60 * 1000; // 15 minutes

/** How many preview rows to send back on dry-run. */
export const PREVIEW_ROW_COUNT = 50;
