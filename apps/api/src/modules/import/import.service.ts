import * as crypto from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction } from '@as-finance/shared';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ExcelService } from '../excel/excel.service';
import { ImportColumnSchema } from '../excel/types';
import {
  CommitResponse,
  DomainImporter,
  DryRunResponse,
  ImportDomain,
  ImportDraft,
  DRAFT_TTL_MS,
  PREVIEW_ROW_COUNT,
} from './types';

/**
 * Orchestrates the upload → dry-run → commit flow shared by every importable domain.
 *
 * State model (V1): in-memory Map keyed by importId. Drafts TTL out at 15 min.
 * Audit log records every commit (action_type=data_imported) so the historical
 * record survives restart even though pending drafts do not.
 *
 * V1.1 will replace the Map with a dedicated `data_imports` table for cross-restart
 * dedup. The public API of this service won't change.
 */
@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);
  private readonly drafts = new Map<string, ImportDraft>();
  private readonly importers = new Map<ImportDomain, DomainImporter>();

  constructor(
    private readonly excel: ExcelService,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  registerImporter(importer: DomainImporter): void {
    this.importers.set(importer.domain, importer);
  }

  getImporter(domain: ImportDomain): DomainImporter {
    const i = this.importers.get(domain);
    if (!i) throw new NotFoundException(`Unknown import domain: ${domain}`);
    return i;
  }

  /** Returns the list of registered importer domains — used by templates endpoint. */
  listDomains(): ImportDomain[] {
    return Array.from(this.importers.keys());
  }

  /**
   * Generate a blank template workbook for the given domain.
   */
  async generateTemplate(domain: ImportDomain): Promise<Buffer> {
    const importer = this.getImporter(domain);
    const columns = importer.templateColumns.map((c) => ({ key: c.key, label: c.label }));
    const exampleRow: Record<string, unknown> = {};
    importer.templateColumns.forEach((c) => {
      if (c.example !== undefined) exampleRow[c.key] = c.example;
    });
    const rows = exampleRow && Object.keys(exampleRow).length > 0 ? [exampleRow] : [];
    return this.excel.exportToBuffer(columns, rows, {
      title: `${importer.displayLabel} Import Template`,
      filters: { note: 'Fill rows below the header. Delete the example row.' },
    });
  }

  /**
   * Step 1: parse + validate a file. NO database writes. Returns a preview the
   * client can show before committing.
   */
  async dryRun(
    domain: ImportDomain,
    file: { buffer: Buffer; originalname: string; size: number },
    actor: { id: string; role: string },
  ): Promise<DryRunResponse> {
    const importer = this.getImporter(domain);
    this.evictExpired();

    const fileHash = crypto.createHash('sha256').update(file.buffer).digest('hex');

    // Check the audit log for a recent commit of the same file by anyone.
    const duplicateFileWarning = await this.findRecentDuplicate(domain, fileHash);

    const parsed = await this.excel.parseToRows(file.buffer, importer.schema as ImportColumnSchema[], {
      filename: file.originalname,
    });

    const importId = crypto.randomUUID();
    const draft: ImportDraft = {
      importId,
      domain,
      fileHash,
      fileSize: file.size,
      filename: file.originalname,
      totalRows: parsed.totalRows,
      validRows: parsed.validRows,
      errors: parsed.errors,
      duplicateFileWarning,
      expiresAt: Date.now() + DRAFT_TTL_MS,
      createdById: actor.id,
      createdByRole: actor.role,
    };
    this.drafts.set(importId, draft);

    return {
      importId,
      domain,
      fileHash,
      totalRows: parsed.totalRows,
      validRows: parsed.validRows.length,
      invalidRows: parsed.errors.length > 0 ? parsed.totalRows - parsed.validRows.length : 0,
      errors: parsed.errors,
      preview: parsed.validRows.slice(0, PREVIEW_ROW_COUNT),
      duplicateFileWarning,
    };
  }

  /**
   * Step 2: apply a validated draft. Transactional — one bad row in strict mode
   * rolls back everything. Audit log captures the commit.
   */
  async commit(
    domain: ImportDomain,
    importId: string,
    actor: { id: string; role: string },
    opts: { strict?: boolean } = {},
  ): Promise<CommitResponse> {
    const importer = this.getImporter(domain);
    this.evictExpired();
    const draft = this.drafts.get(importId);
    if (!draft) {
      throw new NotFoundException(
        'Import draft not found or expired. Re-upload the file and try again.',
      );
    }
    if (draft.domain !== domain) {
      throw new BadRequestException('Draft domain does not match commit domain');
    }
    if (draft.createdById !== actor.id) {
      throw new ForbiddenException('You can only commit drafts you created');
    }
    if (opts.strict && draft.errors.length > 0) {
      throw new BadRequestException(
        `Strict mode: file has ${draft.errors.length} invalid rows — fix and re-upload`,
      );
    }

    let rowsAccepted = 0;
    let rowsSkipped = 0;
    const applyErrors: typeof draft.errors = [];

    await this.prisma.$transaction(async (tx) => {
      for (let i = 0; i < draft.validRows.length; i++) {
        const row = draft.validRows[i]!;
        try {
          await importer.applyRow(row as Record<string, unknown>, tx as unknown as PrismaService, actor.id);
          rowsAccepted++;
        } catch (err) {
          rowsSkipped++;
          applyErrors.push({
            rowIndex: i + 1,
            column: '*',
            message: err instanceof Error ? err.message : 'Apply failed',
          });
          if (opts.strict) throw err;
        }
      }
    });

    // Drop the draft after commit.
    this.drafts.delete(importId);

    // Audit log — captures who, what, when, how many.
    try {
      await this.audit.createAuditLog({
        action_type: AuditAction.DATA_IMPORTED,
        actor_id: actor.id,
        actor_role: actor.role,
        target_entity: 'data_import',
        target_id: importId,
        after_state: {
          domain,
          fileHash: draft.fileHash,
          filename: draft.filename,
          fileSize: draft.fileSize,
          totalRows: draft.totalRows,
          rowsAccepted,
          rowsSkipped,
          validationErrors: draft.errors.length,
          applyErrors: applyErrors.length,
        },
        remarks: `Imported ${rowsAccepted} ${importer.displayLabel.toLowerCase()} row(s) from ${draft.filename}`,
      });
    } catch (err) {
      this.logger.error('Failed to write data_imported audit log', err);
    }

    return {
      importId,
      domain,
      rowsAccepted,
      rowsSkipped,
      errors: [...draft.errors, ...applyErrors],
      committedAt: new Date().toISOString(),
    };
  }

  /** Look at recent (last 24h) DATA_IMPORTED audit entries for this file hash. */
  private async findRecentDuplicate(
    domain: ImportDomain,
    fileHash: string,
  ): Promise<{ lastImportedAt: string; lastImportedById: string } | undefined> {
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recent = await this.prisma.audit_logs.findFirst({
        where: {
          action_type: AuditAction.DATA_IMPORTED,
          created_at: { gte: since },
          target_entity: 'data_import',
        },
        orderBy: { created_at: 'desc' },
        take: 50,
      });
      if (!recent) return undefined;
      // Inspect after_state for matching fileHash + domain.
      const state = (recent.after_state ?? {}) as { fileHash?: string; domain?: string };
      if (state.fileHash === fileHash && state.domain === domain) {
        return {
          lastImportedAt: recent.created_at.toISOString(),
          lastImportedById: recent.actor_id,
        };
      }
      // Walk a few more recent entries in case there were unrelated imports between.
      const more = await this.prisma.audit_logs.findMany({
        where: {
          action_type: AuditAction.DATA_IMPORTED,
          created_at: { gte: since },
          target_entity: 'data_import',
        },
        orderBy: { created_at: 'desc' },
        take: 100,
      });
      const match = more.find((r: { after_state: unknown }) => {
        const s = (r.after_state ?? {}) as { fileHash?: string; domain?: string };
        return s.fileHash === fileHash && s.domain === domain;
      });
      if (match) {
        return {
          lastImportedAt: match.created_at.toISOString(),
          lastImportedById: match.actor_id,
        };
      }
      return undefined;
    } catch (err) {
      this.logger.warn('Duplicate-file check failed (non-blocking)', err);
      return undefined;
    }
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [id, draft] of this.drafts) {
      if (draft.expiresAt <= now) this.drafts.delete(id);
    }
  }
}
