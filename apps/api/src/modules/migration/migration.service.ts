import * as crypto from 'crypto';
import * as ExcelJS from 'exceljs';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction } from '@as-finance/shared';
import { PrismaService } from '../../database/prisma.service';
import { EncryptionService } from '../crypto/encryption.service';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import { ExcelService } from '../excel/excel.service';
import { ImportColumnSchema } from '../excel/types';
import {
  CollectionRow,
  CommitResult,
  CustomerRow,
  DryRunResult,
  GroupMemberRow,
  GroupRow,
  LoanRow,
  MIGRATION_DRAFT_TTL_MS,
  MIGRATION_STATE_KEY,
  MIGRATION_STATE_META_KEY,
  MigrationDomain,
  MigrationState,
  RowError,
} from './migration.types';
import { ensureMigrationFixtures, MigrationFixtures } from './migration-bootstrap';

// AAD helpers — must match customer.service.ts exactly (workflow verified).
function customerAad(customerId: string, field: 'aadhaar' | 'pan'): string {
  return `customer:${customerId}:${field}`;
}

type DraftCustomer = CustomerRow & { newId: string };
type DraftGroup = GroupRow & { newId: string };
type DraftLoan = LoanRow & { newId: string };
type DraftCollection = CollectionRow & { newId: string };

type Draft = {
  id: string;
  createdById: string;
  createdByRole: string;
  expiresAt: number;
  fileHashes: Record<MigrationDomain, string>;
  totals: Record<MigrationDomain, number>;
  validCount: Record<MigrationDomain, number>;
  errors: RowError[];
  // Parsed + validated payloads ready for commit.
  customers: DraftCustomer[];
  groups: DraftGroup[];
  groupMembers: GroupMemberRow[];
  loans: DraftLoan[];
  collections: DraftCollection[];
};

/**
 * One-shot Data Migration ingester.
 *
 * Bakes in the 5 hard-stops surfaced by the workflow review:
 *  1. Aadhaar/PAN encrypted with AAD-bound pre-generated UUIDs
 *  2. loan_schedules materialised per migrated loan
 *  3. Shared zero-totals journal_entry covers FKs for collections/disbursements/penalties
 *  4. 10-min Prisma transaction with Serializable isolation
 *  5. Pending penalties baked into cached_outstanding_paise (no penalty rows written)
 *
 * State machine for `settings.migration_state`:
 *   available → (dry-run ok) → available
 *   available → (commit) → in-progress (inside tx) → completed (on success)
 *                                                 ↘ available (on rollback)
 *
 * Once completed, the run endpoint refuses further migrations until ops manually
 * resets the setting.
 */
@Injectable()
export class MigrationService {
  private readonly logger = new Logger(MigrationService.name);
  private readonly drafts = new Map<string, Draft>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly excel: ExcelService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly encryption: EncryptionService,
  ) {}

  /**
   * Generate an .xlsx template for a single migration domain.
   *
   * Format:
   *   • Sheet "Data": header row exactly matching the schema keys, followed by
   *     one example row showing valid values. Operators replace the example with
   *     real rows and re-upload. The header row is what parseToRows matches
   *     against, so the round-trip (download → fill → upload) works.
   *   • Sheet "Instructions": required-vs-optional table + enum cheat-sheet +
   *     per-column hints. Read-only context, ignored by parseToRows.
   *
   * No DB / no audit — pure file generation. Permission gating happens in
   * the controller.
   */
  async generateTemplate(domain: MigrationDomain): Promise<Buffer> {
    const cols = TEMPLATE_COLUMNS[domain];
    if (!cols) {
      throw new BadRequestException(`Unknown migration domain '${domain}'`);
    }
    const instructions = DOMAIN_INSTRUCTIONS[domain];

    const wb = new ExcelJS.Workbook();
    wb.creator = 'AS Finance — Data Migration';
    wb.created = new Date();

    // ── Sheet 1: Data (round-trip compatible) ─────────────────────────────
    const data = wb.addWorksheet('Data');
    data.addRow(cols.map((c) => c.key));
    const header = data.getRow(1);
    header.font = { bold: true };
    header.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };
    header.border = { bottom: { style: 'thin' } };

    // Example row — shows valid values; operators overwrite with real data.
    data.addRow(cols.map((c) => c.example));
    const example = data.getRow(2);
    example.font = { italic: true, color: { argb: 'FF666666' } };

    // Reasonable column widths.
    cols.forEach((c, i) => {
      const col = data.getColumn(i + 1);
      col.width = Math.min(36, Math.max(14, c.key.length + 4, String(c.example).length + 4));
    });

    // ── Sheet 2: Instructions (context) ───────────────────────────────────
    const info = wb.addWorksheet('Instructions');
    info.columns = [
      { header: 'Column', key: 'col', width: 30 },
      { header: 'Required', key: 'req', width: 12 },
      { header: 'Example', key: 'ex', width: 30 },
      { header: 'Notes / format', key: 'hint', width: 60 },
    ];
    info.getRow(1).font = { bold: true };
    info.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };
    for (const c of cols) {
      info.addRow({
        col: c.key,
        req: c.required ? 'YES' : 'optional',
        ex: c.example,
        hint: c.hint ?? '',
      });
    }

    // Trailing notes block — domain-level rules.
    info.addRow([]);
    const titleRow = info.addRow([instructions.description]);
    titleRow.font = { bold: true };
    info.mergeCells(`A${titleRow.number}`, `D${titleRow.number}`);
    for (const note of instructions.notes) {
      info.addRow([`• ${note}`]);
      info.mergeCells(`A${info.rowCount}`, `D${info.rowCount}`);
    }
    info.addRow([]);
    const footer = info.addRow(['Full spec: docs/MIGRATION_FILE_FORMAT.md (also served at /docs/MIGRATION_FILE_FORMAT.md)']);
    footer.font = { italic: true, size: 10 };
    info.mergeCells(`A${footer.number}`, `D${footer.number}`);

    const arr = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
    return Buffer.from(arr);
  }

  async getState(): Promise<{ state: MigrationState; completedAt?: string; completedBy?: string }> {
    const all = await this.settings.findAll();
    const stateRow = all.find((s) => s.key === MIGRATION_STATE_KEY);
    const metaRow = all.find((s) => s.key === MIGRATION_STATE_META_KEY);
    const state = ((stateRow?.value as string) ?? 'available') as MigrationState;
    if (state === 'completed' && metaRow) {
      const meta = metaRow.value as { completedAt?: string; completedBy?: string };
      return { state, completedAt: meta.completedAt, completedBy: meta.completedBy };
    }
    return { state };
  }

  async dryRun(
    files: Partial<Record<MigrationDomain, { buffer: Buffer; originalname: string }>>,
    actor: { id: string; role: string },
  ): Promise<DryRunResult> {
    this.evictExpiredDrafts();
    const state = (await this.getState()).state;
    if (state === 'completed') {
      throw new ForbiddenException('Migration already completed — module is permanently locked');
    }

    // Parse each file separately so per-domain errors stay scoped.
    const errors: RowError[] = [];
    const totals: Record<MigrationDomain, number> = {
      customers: 0,
      groups: 0,
      group_members: 0,
      loans: 0,
      collections: 0,
    };
    const validCount: Record<MigrationDomain, number> = { ...totals };
    const fileHashes: Record<MigrationDomain, string> = {
      customers: '',
      groups: '',
      group_members: '',
      loans: '',
      collections: '',
    };

    const customers = files['customers']
      ? await this.parseDomain<CustomerRow>('customers', files['customers'], errors)
      : [];
    fileHashes.customers = files['customers'] ? sha256(files['customers'].buffer) : '';
    totals.customers = customers.length;
    validCount.customers = customers.length;

    const groups = files['groups']
      ? await this.parseDomain<GroupRow>('groups', files['groups'], errors)
      : [];
    fileHashes.groups = files['groups'] ? sha256(files['groups'].buffer) : '';
    totals.groups = groups.length;
    validCount.groups = groups.length;

    const groupMembers = files['group_members']
      ? await this.parseDomain<GroupMemberRow>('group_members', files['group_members'], errors)
      : [];
    fileHashes.group_members = files['group_members'] ? sha256(files['group_members'].buffer) : '';
    totals.group_members = groupMembers.length;
    validCount.group_members = groupMembers.length;

    const loans = files['loans']
      ? await this.parseDomain<LoanRow>('loans', files['loans'], errors)
      : [];
    fileHashes.loans = files['loans'] ? sha256(files['loans'].buffer) : '';
    totals.loans = loans.length;
    validCount.loans = loans.length;

    const collections = files['collections']
      ? await this.parseDomain<CollectionRow>('collections', files['collections'], errors)
      : [];
    fileHashes.collections = files['collections'] ? sha256(files['collections'].buffer) : '';
    totals.collections = collections.length;
    validCount.collections = collections.length;

    // Pre-generate UUIDs so cross-references can resolve.
    const draftCustomers: DraftCustomer[] = customers.map((r) => ({ ...r, newId: crypto.randomUUID() }));
    const draftGroups: DraftGroup[] = groups.map((r) => ({ ...r, newId: crypto.randomUUID() }));
    const draftLoans: DraftLoan[] = loans.map((r) => ({ ...r, newId: crypto.randomUUID() }));
    const draftCollections: DraftCollection[] = collections.map((r) => ({ ...r, newId: crypto.randomUUID() }));

    // Build lookup map: legacy_customer_id → newId
    const customerByLegacy = new Map<string, DraftCustomer>();
    // ExcelService now annotates every valid row with __rowIndex (1-based, ignoring
    // blank rows). We pull it out for cross-reference errors so the operator can
    // open the file and find the bad cell. Falls back to 0 if the parser didn't
    // populate it (e.g. on a future refactor).
    const ri = (row: Record<string, unknown>): number => {
      const v = row['__rowIndex'];
      return typeof v === 'number' ? v : 0;
    };

    for (const c of draftCustomers) {
      if (customerByLegacy.has(c.legacy_customer_id)) {
        errors.push({
          domain: 'customers',
          rowIndex: ri(c as unknown as Record<string, unknown>),
          column: 'legacy_customer_id',
          message: `Duplicate legacy_customer_id: ${c.legacy_customer_id}`,
        });
      }
      customerByLegacy.set(c.legacy_customer_id, c);
    }

    const groupByLegacy = new Map<string, DraftGroup>();
    for (const g of draftGroups) {
      groupByLegacy.set(g.legacy_group_id, g);
      if (!customerByLegacy.has(g.leader_legacy_customer_id)) {
        errors.push({
          domain: 'groups',
          rowIndex: ri(g as unknown as Record<string, unknown>),
          column: 'leader_legacy_customer_id',
          message: `Group ${g.legacy_group_id}: leader ${g.leader_legacy_customer_id} not found in customers file`,
        });
      }
    }

    for (const m of groupMembers) {
      if (!groupByLegacy.has(m.legacy_group_id)) {
        errors.push({
          domain: 'group_members',
          rowIndex: ri(m as unknown as Record<string, unknown>),
          column: 'legacy_group_id',
          message: `Member references unknown group ${m.legacy_group_id}`,
        });
      }
      if (!customerByLegacy.has(m.member_legacy_customer_id)) {
        errors.push({
          domain: 'group_members',
          rowIndex: ri(m as unknown as Record<string, unknown>),
          column: 'member_legacy_customer_id',
          message: `Group ${m.legacy_group_id}: member ${m.member_legacy_customer_id} not found in customers file`,
        });
      }
    }

    const loanByLegacy = new Map<string, DraftLoan>();
    for (const l of draftLoans) {
      loanByLegacy.set(l.legacy_loan_id, l);
      if (!customerByLegacy.has(l.customer_legacy_customer_id)) {
        errors.push({
          domain: 'loans',
          rowIndex: ri(l as unknown as Record<string, unknown>),
          column: 'customer_legacy_customer_id',
          message: `Loan ${l.legacy_loan_id}: customer ${l.customer_legacy_customer_id} not found`,
        });
      }
      if (l.group_legacy_id && !groupByLegacy.has(l.group_legacy_id)) {
        errors.push({
          domain: 'loans',
          rowIndex: ri(l as unknown as Record<string, unknown>),
          column: 'group_legacy_id',
          message: `Loan ${l.legacy_loan_id}: group ${l.group_legacy_id} not found`,
        });
      }
    }

    const collectionIdSeen = new Set<string>();
    for (const c of draftCollections) {
      if (!loanByLegacy.has(c.loan_legacy_loan_id)) {
        errors.push({
          domain: 'collections',
          rowIndex: ri(c as unknown as Record<string, unknown>),
          column: 'loan_legacy_loan_id',
          message: `Collection ${c.legacy_collection_id}: loan ${c.loan_legacy_loan_id} not found`,
        });
      }
      // Duplicate legacy_collection_id would collide on the
      // mig:coll:<id> idempotency key inside the tx → unique constraint
      // violation, killing the whole batch. Catch it pre-commit.
      if (collectionIdSeen.has(c.legacy_collection_id)) {
        errors.push({
          domain: 'collections',
          rowIndex: ri(c as unknown as Record<string, unknown>),
          column: 'legacy_collection_id',
          message: `Duplicate legacy_collection_id: ${c.legacy_collection_id}`,
        });
      }
      collectionIdSeen.add(c.legacy_collection_id);
    }

    // Numeric sanity pass — every *_paise column must be a non-negative
    // integer within JS safe-int range. The parser admits JS Numbers which
    // can carry decimals (e.g. 123.45) or values > 2^53. Catch both pre-tx
    // so we don't blow up mid-commit with a generic BigInt('123.45') throw.
    const PAISE_FIELDS = {
      customers: ['monthly_income_paise'] as const,
      loans: [
        'principal_paise',
        'total_interest_paise',
        'total_payable_paise',
        'emi_paise',
        'cached_outstanding_paise',
      ] as const,
      collections: ['amount_paise'] as const,
    };
    const checkPaise = (
      domain: MigrationDomain,
      rows: ReadonlyArray<Record<string, unknown>>,
      fields: ReadonlyArray<string>,
    ): void => {
      for (const row of rows) {
        for (const f of fields) {
          const v = row[f];
          if (v === null || v === undefined || v === '') continue;
          const n = typeof v === 'number' ? v : Number(String(v));
          if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > Number.MAX_SAFE_INTEGER) {
            errors.push({
              domain,
              rowIndex: ri(row),
              column: f,
              message: `${f} must be a non-negative integer in paise (no decimals, max 9007199254740992); got "${String(v)}"`,
            });
          }
        }
      }
    };
    checkPaise('customers', draftCustomers as unknown as Record<string, unknown>[], PAISE_FIELDS.customers);
    checkPaise('loans', draftLoans as unknown as Record<string, unknown>[], PAISE_FIELDS.loans);
    checkPaise('collections', draftCollections as unknown as Record<string, unknown>[], PAISE_FIELDS.collections);

    // Tenure must be ≥ 1 — zero throws BigInt('0') division mid-tx and
    // negative produces an empty schedule. Catch in dry-run.
    for (const l of draftLoans) {
      const t = Number(l.tenure_months);
      if (!Number.isInteger(t) || t < 1) {
        errors.push({
          domain: 'loans',
          rowIndex: ri(l as unknown as Record<string, unknown>),
          column: 'tenure_months',
          message: `tenure_months must be an integer ≥ 1; got "${String(l.tenure_months)}"`,
        });
      }
      const paid = Number(l.installments_paid_count ?? 0);
      if (paid > t) {
        errors.push({
          domain: 'loans',
          rowIndex: ri(l as unknown as Record<string, unknown>),
          column: 'installments_paid_count',
          message: `installments_paid_count (${paid}) > tenure_months (${t})`,
        });
      }
    }

    // Pincode must be exactly 6 digits — silent truncation/padding hides
    // user typos.
    for (const c of draftCustomers) {
      const p = String(c.pincode).trim();
      if (!/^\d{6}$/.test(p)) {
        errors.push({
          domain: 'customers',
          rowIndex: ri(c as unknown as Record<string, unknown>),
          column: 'pincode',
          message: `pincode must be exactly 6 digits; got "${p}"`,
        });
      }
    }

    const draftId = crypto.randomUUID();
    this.drafts.set(draftId, {
      id: draftId,
      createdById: actor.id,
      createdByRole: actor.role,
      expiresAt: Date.now() + MIGRATION_DRAFT_TTL_MS,
      fileHashes,
      totals,
      validCount,
      errors,
      customers: draftCustomers,
      groups: draftGroups,
      groupMembers,
      loans: draftLoans,
      collections: draftCollections,
    });

    return { draftId, fileHashes, totals, validCount, errors };
  }

  async commit(draftId: string, actor: { id: string; role: string }): Promise<CommitResult> {
    this.evictExpiredDrafts();
    const draft = this.drafts.get(draftId);
    if (!draft) throw new NotFoundException('Migration draft not found or expired — re-upload and retry');
    if (draft.createdById !== actor.id) {
      throw new ForbiddenException('You can only commit drafts you created');
    }
    if (draft.errors.length > 0) {
      throw new BadRequestException(
        `Migration refuses to commit with ${draft.errors.length} unresolved errors. Fix the source files and re-upload.`,
      );
    }
    const state = (await this.getState()).state;
    if (state === 'completed') {
      throw new ForbiddenException('Migration already completed');
    }
    if (state === 'in-progress') {
      throw new ConflictException('Another migration is in progress');
    }

    const started = Date.now();
    const now = new Date();

    // MIGRATION_STARTED — write BEFORE the tx so a rollback leaves a trace.
    try {
      await this.audit.createAuditLog({
        action_type: AuditAction.MIGRATION_STARTED,
        actor_id: actor.id,
        actor_role: actor.role as 'super_admin',
        target_entity: 'data_migration',
        target_id: draft.id,
        after_state: {
          fileHashes: draft.fileHashes,
          rowCounts: draft.totals,
        },
        remarks: `Data Migration started: ${JSON.stringify(draft.totals)}`,
        ip_address: '0.0.0.0',
        request_id: draft.id,
      });
    } catch (err) {
      this.logger.error('Failed to write MIGRATION_STARTED audit log (non-blocking)', err);
    }

    // Run everything in one tx with a long timeout + Serializable isolation.
    let result: { auditId: string };
    try {
      result = await this.prisma.$transaction(
      async (tx) => {
        // Flip lock to in-progress
        await tx.settings.upsert({
          where: { key: MIGRATION_STATE_KEY },
          update: { value: 'in-progress', updated_by: actor.id },
          create: { key: MIGRATION_STATE_KEY, value: 'in-progress', updated_by: actor.id, description: 'Data Migration state' },
        });

        const fixtures = await ensureMigrationFixtures(tx, now);
        await this.writeCustomers(tx, draft, fixtures, now);
        await this.writeGroups(tx, draft, fixtures, now);
        await this.writeGroupMembers(tx, draft, fixtures, now);
        await this.writeLoans(tx, draft, fixtures, now);
        await this.writeCollections(tx, draft, fixtures, now);

        // Single audit log entry covering the whole batch.
        const auditRow = await tx.audit_logs.create({
          data: {
            action_type: AuditAction.MIGRATION_COMPLETED,
            actor_id: actor.id,
            actor_role: actor.role as 'super_admin',
            target_entity: 'data_migration',
            target_id: draft.id,
            after_state: {
              fileHashes: draft.fileHashes,
              rowCounts: draft.totals,
              migrationBotUserId: fixtures.migrationBotUserId,
              legacyProductVersionId: fixtures.legacyProductVersionId,
              sharedJournalEntryId: fixtures.sharedJournalEntryId,
            },
            remarks: `Data Migration committed: ${JSON.stringify(draft.totals)}`,
            ip_address: '0.0.0.0',
            request_id: draft.id,
          },
        });

        // Flip lock to completed.
        await tx.settings.upsert({
          where: { key: MIGRATION_STATE_KEY },
          update: { value: 'completed', updated_by: actor.id },
          create: { key: MIGRATION_STATE_KEY, value: 'completed', updated_by: actor.id, description: 'Data Migration state' },
        });
        await tx.settings.upsert({
          where: { key: MIGRATION_STATE_META_KEY },
          update: {
            value: { completedAt: now.toISOString(), completedBy: actor.id, auditId: auditRow.id },
            updated_by: actor.id,
          },
          create: {
            key: MIGRATION_STATE_META_KEY,
            value: { completedAt: now.toISOString(), completedBy: actor.id, auditId: auditRow.id },
            updated_by: actor.id,
            description: 'Data Migration completion metadata',
          },
        });

        return { auditId: auditRow.id };
      },
      {
        timeout: 10 * 60 * 1000, // 10 minutes
        maxWait: 30 * 1000,
        isolationLevel: 'Serializable',
      },
    );
    } catch (err) {
      // MIGRATION_FAILED — record the failure outside the rolled-back tx.
      try {
        await this.audit.createAuditLog({
          action_type: AuditAction.MIGRATION_FAILED,
          actor_id: actor.id,
          actor_role: actor.role as 'super_admin',
          target_entity: 'data_migration',
          target_id: draft.id,
          after_state: {
            fileHashes: draft.fileHashes,
            rowCounts: draft.totals,
            error: err instanceof Error ? err.message : String(err),
          },
          remarks: `Data Migration FAILED: ${err instanceof Error ? err.message : 'Unknown error'}`,
          ip_address: '0.0.0.0',
          request_id: draft.id,
        });
      } catch (auditErr) {
        this.logger.error('Failed to write MIGRATION_FAILED audit log', auditErr);
      }
      // Drop the draft so the operator must re-upload (sanity).
      this.drafts.delete(draftId);
      throw err;
    }

    // Drop the draft.
    this.drafts.delete(draftId);

    return {
      draftId,
      rowsCommitted: draft.totals,
      migrationAuditId: result.auditId,
      durationMs: Date.now() - started,
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Per-domain writers
  // ────────────────────────────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async writeCustomers(tx: any, draft: Draft, fix: MigrationFixtures, now: Date): Promise<void> {
    for (const c of draft.customers) {
      const status = normalizeEnum(c.status, ALLOWED_CUSTOMER_STATUS, 'active');
      const gender = String(c.gender).toLowerCase().trim();
      const aadhaarPlain = String(c.aadhaar).replace(/\D/g, '');
      const aadhaarLastFour = aadhaarPlain.slice(-4).padStart(4, '0');
      const aadhaarCt = this.encryption.encrypt(aadhaarPlain, customerAad(c.newId, 'aadhaar'));
      let panCt: string | null = null;
      let panLastFour: string | null = null;
      if (c.pan && String(c.pan).trim()) {
        const panPlain = String(c.pan).trim().toUpperCase();
        panCt = this.encryption.encrypt(panPlain, customerAad(c.newId, 'pan'));
        panLastFour = panPlain.slice(-4);
      }

      // Resolve assigned_officer
      let assignedOfficerId: string | null = null;
      if (c.assigned_officer_username && String(c.assigned_officer_username).trim()) {
        const officer = await tx.users.findUnique({
          where: { username: String(c.assigned_officer_username).trim() },
          select: { id: true },
        });
        assignedOfficerId = officer?.id ?? null;
      }

      await tx.customers.create({
        data: {
          id: c.newId,
          legacy_customer_id: String(c.legacy_customer_id),
          full_name: String(c.full_name).trim(),
          father_or_husband_name: c.father_or_husband_name ? String(c.father_or_husband_name).trim() : null,
          mobile: String(c.mobile).replace(/\D/g, '').slice(-15),
          alternate_mobile: c.alternate_mobile ? String(c.alternate_mobile).replace(/\D/g, '').slice(-15) : null,
          aadhaar_number_encrypted: aadhaarCt,
          aadhaar_last_four: aadhaarLastFour,
          pan_number_encrypted: panCt,
          pan_last_four: panLastFour,
          dob: c.dob ? new Date(String(c.dob)) : null,
          occupation: c.occupation ? String(c.occupation) : null,
          monthly_income_paise: c.monthly_income_paise ? BigInt(String(c.monthly_income_paise)) : null,
          address_line1: String(c.address_line1),
          address_line2: c.address_line2 ? String(c.address_line2) : null,
          city: String(c.city),
          district: String(c.district),
          state: String(c.state),
          pincode: String(c.pincode).trim(),
          status: status as 'active' | 'blacklisted' | 'inactive',
          gender,
          assigned_officer_id: assignedOfficerId,
          created_by: fix.migrationBotUserId,
          created_at: c.registered_at ? new Date(String(c.registered_at)) : now,
        },
      });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async writeGroups(tx: any, draft: Draft, fix: MigrationFixtures, now: Date): Promise<void> {
    const customerByLegacy = new Map(draft.customers.map((c) => [c.legacy_customer_id, c]));
    for (const g of draft.groups) {
      const leader = customerByLegacy.get(g.leader_legacy_customer_id);
      if (!leader) throw new Error(`Group ${g.legacy_group_id}: leader missing at commit time`);
      const groupStatus = normalizeEnum(g.status, ALLOWED_GROUP_STATUS, 'active');
      const meetingDay = normalizeEnum(g.meeting_day, ALLOWED_MEETING_DAYS, 'monday');
      await tx.groups.create({
        data: {
          id: g.newId,
          legacy_group_id: String(g.legacy_group_id),
          name: String(g.name),
          meeting_day: meetingDay as 'monday',
          branch_area: String(g.branch_area),
          leader_id: leader.newId,
          status: groupStatus as 'active' | 'inactive' | 'dissolved',
          created_by: fix.migrationBotUserId,
          created_at: now,
        },
      });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async writeGroupMembers(tx: any, draft: Draft, _fix: MigrationFixtures, _now: Date): Promise<void> {
    const customerByLegacy = new Map(draft.customers.map((c) => [c.legacy_customer_id, c]));
    const groupByLegacy = new Map(draft.groups.map((g) => [g.legacy_group_id, g]));

    // Auto-insert leader as a member for each group (matches the service-layer pattern).
    const leaderInsertedFor = new Set<string>();
    for (const g of draft.groups) {
      const leader = customerByLegacy.get(g.leader_legacy_customer_id);
      if (!leader) continue;
      await tx.group_members.create({
        data: {
          group_id: g.newId,
          customer_id: leader.newId,
          is_active: true,
        },
      });
      leaderInsertedFor.add(`${g.legacy_group_id}:${g.leader_legacy_customer_id}`);
    }

    // Dedup the file: same (group, customer) pair appearing twice in the
    // members sheet would hit the unique constraint mid-tx. We treat
    // dupes as a no-op rather than failing — re-uploading the same member
    // on a different `joined_at` is benign.
    const seenMembership = new Set(leaderInsertedFor);
    for (const m of draft.groupMembers) {
      const key = `${m.legacy_group_id}:${m.member_legacy_customer_id}`;
      if (seenMembership.has(key)) continue;
      seenMembership.add(key);
      const group = groupByLegacy.get(m.legacy_group_id);
      const customer = customerByLegacy.get(m.member_legacy_customer_id);
      if (!group || !customer) throw new Error(`group_members: bad reference`);
      await tx.group_members.create({
        data: {
          group_id: group.newId,
          customer_id: customer.newId,
          joined_at: m.joined_at ? new Date(String(m.joined_at)) : undefined,
          is_active: true,
        },
      });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async writeLoans(tx: any, draft: Draft, fix: MigrationFixtures, now: Date): Promise<void> {
    const customerByLegacy = new Map(draft.customers.map((c) => [c.legacy_customer_id, c]));
    const groupByLegacy = new Map(draft.groups.map((g) => [g.legacy_group_id, g]));

    // We need fresh loan numbers from the sequence — Prisma doesn't expose
    // nextval, so we use raw query.
    for (const l of draft.loans) {
      const customer = customerByLegacy.get(l.customer_legacy_customer_id);
      if (!customer) throw new Error(`Loan ${l.legacy_loan_id}: customer missing at commit`);
      const groupId = l.group_legacy_id ? groupByLegacy.get(l.group_legacy_id)?.newId : null;

      const seqRow = (await tx.$queryRawUnsafe(
        "SELECT nextval('loan_number_seq') AS nextval",
      )) as { nextval: bigint }[];
      const loanNumber = `LN-${String(seqRow[0]!.nextval).padStart(7, '0')}`;

      const principalPaise = BigInt(String(l.principal_paise));
      const tenureMonths = parseInt(String(l.tenure_months), 10);
      const installmentsPaidCount = l.installments_paid_count
        ? parseInt(String(l.installments_paid_count), 10)
        : 0;
      const totalInterestPaise = BigInt(String(l.total_interest_paise));
      const totalPayablePaise = BigInt(String(l.total_payable_paise));
      const emiPaise = BigInt(String(l.emi_paise));
      const cachedOutstanding = BigInt(String(l.cached_outstanding_paise));
      const disbursementDate = new Date(String(l.disbursement_date));
      const firstDueDate = new Date(String(l.first_due_date));
      const status = normalizeEnum(l.status, ALLOWED_LOAN_STATUS, null);
      if (!status) {
        throw new Error(
          `Loan ${l.legacy_loan_id}: status must be one of [${ALLOWED_LOAN_STATUS.join(', ')}], got '${String(l.status)}'`,
        );
      }
      const disbursementMode = normalizeEnum(
        (l as { disbursement_mode?: unknown }).disbursement_mode,
        ALLOWED_PAYMENT_MODE,
        'cash',
      );

      // 1. Create the loan
      await tx.loans.create({
        data: {
          id: l.newId,
          legacy_loan_id: String(l.legacy_loan_id),
          loan_number: loanNumber,
          customer_id: customer.newId,
          product_version_id: fix.legacyProductVersionId,
          group_id: groupId,
          principal_paise: principalPaise,
          tenure_months: tenureMonths,
          purpose: l.purpose ? String(l.purpose) : 'Legacy migration',
          status: status as 'active' | 'overdue' | 'closed' | 'foreclosed' | 'defaulted',
          total_interest_paise: totalInterestPaise,
          total_payable_paise: totalPayablePaise,
          cached_outstanding_paise: cachedOutstanding,
          disbursement_date: disbursementDate,
          first_due_date: firstDueDate,
          last_due_date: addMonthsClamped(firstDueDate, tenureMonths - 1),
          last_interest_accrued_to: now,
          created_by: fix.migrationBotUserId,
          approved_by: fix.migrationBotUserId,
        },
      });

      // 2. loan_status_history (one row with from=null, to=status)
      await tx.loan_status_history.create({
        data: {
          loan_id: l.newId,
          from_status: null,
          to_status: status as 'active',
          changed_by: fix.migrationBotUserId,
          reason: 'data_migration',
          metadata: { source: 'legacy_excel', legacy_loan_id: l.legacy_loan_id },
        },
      });

      // 3. Materialise loan_schedules — required for ledger recompute to work.
      // CRITICAL: sum of installments must EXACTLY equal principal+interest.
      // Otherwise loan.service.ts close-check (within 1 paise of zero) fails for
      // migrated closed loans, and reversal recompute drifts on active ones.
      // We distribute remainder to the LAST installment.
      if (tenureMonths <= 0) {
        throw new Error(`Loan ${l.legacy_loan_id}: tenure_months must be > 0`);
      }
      const tenureN = BigInt(tenureMonths);
      const basePrincipal = principalPaise / tenureN;
      const baseInterest = totalInterestPaise / tenureN;
      const principalRemainder = principalPaise - basePrincipal * tenureN;
      const interestRemainder = totalInterestPaise - baseInterest * tenureN;
      for (let i = 0; i < tenureMonths; i++) {
        const dueDate = addMonthsClamped(firstDueDate, i);
        const isLast = i === tenureMonths - 1;
        const principalThis = isLast ? basePrincipal + principalRemainder : basePrincipal;
        const interestThis = isLast ? baseInterest + interestRemainder : baseInterest;
        const totalThis = principalThis + interestThis;
        const isPaid = i < installmentsPaidCount;
        await tx.loan_schedules.create({
          data: {
            loan_id: l.newId,
            installment_number: i + 1,
            due_date: dueDate,
            principal_paise: principalThis,
            interest_paise: interestThis,
            total_paise: totalThis,
            principal_paid_paise: isPaid ? principalThis : 0n,
            interest_paid_paise: isPaid ? interestThis : 0n,
            penalty_paid_paise: 0n,
            status: isPaid ? 'paid' : 'pending',
          },
        });
      }
      // Suppress unused-var warning for emiPaise — kept for future use as
      // a sanity check (total_paise on schedules should sum to ~emi*tenure).
      void emiPaise;

      // 4. disbursements row (idempotent on idempotency_key)
      await tx.disbursements.create({
        data: {
          loan_id: l.newId,
          amount_paise: principalPaise,
          mode: disbursementMode as 'cash' | 'bank_transfer' | 'online',
          disbursed_by: fix.migrationBotUserId,
          disbursed_at: disbursementDate,
          journal_entry_id: fix.sharedJournalEntryId,
          idempotency_key: `mig:disb:${l.legacy_loan_id}`,
        },
      });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async writeCollections(tx: any, draft: Draft, fix: MigrationFixtures, _now: Date): Promise<void> {
    const loanByLegacy = new Map(draft.loans.map((l) => [l.legacy_loan_id, l]));
    for (const c of draft.collections) {
      const loan = loanByLegacy.get(c.loan_legacy_loan_id);
      if (!loan) throw new Error(`Collection ${c.legacy_collection_id}: loan missing at commit`);
      const paymentMode = normalizeEnum(c.payment_mode, ALLOWED_PAYMENT_MODE, null);
      if (!paymentMode) {
        throw new Error(
          `Collection ${c.legacy_collection_id}: payment_mode must be one of [${ALLOWED_PAYMENT_MODE.join(', ')}], got '${String(c.payment_mode)}'`,
        );
      }
      await tx.collections.create({
        data: {
          id: c.newId,
          legacy_collection_id: String(c.legacy_collection_id),
          loan_id: loan.newId,
          amount_paise: BigInt(String(c.amount_paise)),
          payment_date: new Date(String(c.payment_date)),
          payment_mode: paymentMode as 'cash' | 'bank_transfer' | 'online',
          status: 'posted',
          collected_by: fix.migrationBotUserId,
          journal_entry_id: fix.sharedJournalEntryId,
          idempotency_key: `mig:coll:${c.legacy_collection_id}`,
          receipt_id: null, // skip receipt generation — see plan
          is_reversal: false,
        },
      });
    }
  }

  // ────────────────────────────────────────────────────────────────────────────

  private async parseDomain<T extends Record<string, unknown>>(
    domain: MigrationDomain,
    file: { buffer: Buffer; originalname: string },
    errors: RowError[],
  ): Promise<T[]> {
    const schema = SCHEMAS[domain];
    const result = await this.excel.parseToRows<T>(file.buffer, schema, { filename: file.originalname });
    for (const e of result.errors) {
      errors.push({ domain, rowIndex: e.rowIndex, column: e.column, message: e.message });
    }
    return result.validRows;
  }

  private evictExpiredDrafts(): void {
    const now = Date.now();
    for (const [id, d] of this.drafts) {
      if (d.expiresAt <= now) this.drafts.delete(id);
    }
  }
}

function sha256(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

// Enum allowlists — Prisma rejects any value not in these sets. We normalize
// inputs at the boundary so the operator can put 'Active' / 'CASH' in their file
// without commit failing with a cryptic enum violation.
const ALLOWED_CUSTOMER_STATUS = ['active', 'blacklisted', 'inactive'] as const;
const ALLOWED_GROUP_STATUS = ['active', 'inactive', 'dissolved'] as const;
const ALLOWED_LOAN_STATUS = [
  'active',
  'overdue',
  'closed',
  'foreclosed',
  'defaulted',
] as const;
const ALLOWED_PAYMENT_MODE = ['cash', 'bank_transfer', 'online'] as const;
const ALLOWED_MEETING_DAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

function normalizeEnum<T extends string>(
  raw: unknown,
  allowed: readonly T[],
  fallback: T | null,
): T | null {
  if (raw === null || raw === undefined) return fallback;
  const v = String(raw).trim().toLowerCase().replace(/\s+/g, '_');
  return (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

/**
 * Add months without month-end overflow. setMonth() lets the day spill over
 * (Jan 31 + 1 month → Mar 3 because Feb has 28-29 days). For EMI schedules we
 * want Jan 31 + 1 → Feb 28/29. We do that by capping the day to the new month's
 * last day after the add.
 */
function addMonthsClamped(date: Date, months: number): Date {
  const d = new Date(date);
  const originalDay = d.getDate();
  d.setDate(1); // park on the 1st so setMonth never overflows
  d.setMonth(d.getMonth() + months);
  const lastDayOfNewMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(originalDay, lastDayOfNewMonth));
  return d;
}

// ────────────────────────────────────────────────────────────────────────────
// Per-domain column schemas (handed to ExcelService.parseToRows)
// ────────────────────────────────────────────────────────────────────────────

const SCHEMAS: Record<MigrationDomain, ImportColumnSchema[]> = {
  customers: [
    { key: 'legacy_customer_id', type: 'string', required: true },
    { key: 'full_name', type: 'string', required: true },
    { key: 'father_or_husband_name', type: 'string', required: false },
    { key: 'mobile', type: 'string', required: true },
    { key: 'alternate_mobile', type: 'string', required: false },
    { key: 'aadhaar', type: 'string', required: true },
    { key: 'pan', type: 'string', required: false },
    { key: 'dob', type: 'date', required: false },
    { key: 'gender', type: 'string', required: true },
    { key: 'occupation', type: 'string', required: false },
    { key: 'monthly_income_paise', type: 'number', required: false },
    { key: 'address_line1', type: 'string', required: true },
    { key: 'address_line2', type: 'string', required: false },
    { key: 'city', type: 'string', required: true },
    { key: 'district', type: 'string', required: true },
    { key: 'state', type: 'string', required: true },
    { key: 'pincode', type: 'string', required: true },
    { key: 'status', type: 'string', required: false },
    { key: 'assigned_officer_username', type: 'string', required: false },
    { key: 'registered_at', type: 'date', required: false },
  ],
  groups: [
    { key: 'legacy_group_id', type: 'string', required: true },
    { key: 'name', type: 'string', required: true },
    { key: 'leader_legacy_customer_id', type: 'string', required: true },
    { key: 'meeting_day', type: 'string', required: true },
    { key: 'branch_area', type: 'string', required: true },
    { key: 'status', type: 'string', required: false },
  ],
  group_members: [
    { key: 'legacy_group_id', type: 'string', required: true },
    { key: 'member_legacy_customer_id', type: 'string', required: true },
    { key: 'joined_at', type: 'date', required: false },
  ],
  loans: [
    { key: 'legacy_loan_id', type: 'string', required: true },
    { key: 'customer_legacy_customer_id', type: 'string', required: true },
    { key: 'group_legacy_id', type: 'string', required: false },
    { key: 'principal_paise', type: 'number', required: true },
    { key: 'total_interest_paise', type: 'number', required: true },
    { key: 'total_payable_paise', type: 'number', required: true },
    { key: 'tenure_months', type: 'number', required: true },
    { key: 'installments_paid_count', type: 'number', required: false },
    { key: 'emi_paise', type: 'number', required: true },
    { key: 'purpose', type: 'string', required: true },
    { key: 'status', type: 'string', required: true },
    { key: 'cached_outstanding_paise', type: 'number', required: true },
    { key: 'disbursement_date', type: 'date', required: true },
    { key: 'first_due_date', type: 'date', required: true },
    { key: 'disbursement_mode', type: 'string', required: false },
  ],
  collections: [
    { key: 'legacy_collection_id', type: 'string', required: true },
    { key: 'loan_legacy_loan_id', type: 'string', required: true },
    { key: 'amount_paise', type: 'number', required: true },
    { key: 'payment_date', type: 'date', required: true },
    { key: 'payment_mode', type: 'string', required: true },
  ],
};

// ────────────────────────────────────────────────────────────────────────────
// Template metadata — drives GET /migration/template/:domain.xlsx
// Each entry: one column = one (header, example, optional hint) tuple.
// Order here is the order the user sees in the downloaded template.
// ────────────────────────────────────────────────────────────────────────────

type TemplateColumn = {
  key: string;
  required: boolean;
  example: string;
  hint?: string;
};

export const TEMPLATE_COLUMNS: Record<MigrationDomain, TemplateColumn[]> = {
  customers: [
    { key: 'legacy_customer_id', required: true, example: 'CUST-007', hint: 'Your old-system customer id (unique within file)' },
    { key: 'full_name', required: true, example: 'Ravi Kumar' },
    { key: 'father_or_husband_name', required: false, example: 'Suresh Kumar' },
    { key: 'mobile', required: true, example: '9876543210', hint: '10 digits' },
    { key: 'alternate_mobile', required: false, example: '' },
    { key: 'aadhaar', required: true, example: '123412341234', hint: '12 digits — stored encrypted' },
    { key: 'pan', required: false, example: '', hint: '10-char PAN, uppercase' },
    { key: 'dob', required: false, example: '1990-04-15', hint: 'YYYY-MM-DD' },
    { key: 'gender', required: true, example: 'male', hint: 'male | female | other' },
    { key: 'occupation', required: false, example: 'shopkeeper' },
    { key: 'monthly_income_paise', required: false, example: '1500000', hint: '₹15,000 → 1500000' },
    { key: 'address_line1', required: true, example: '12 Gandhi Road' },
    { key: 'address_line2', required: false, example: '' },
    { key: 'city', required: true, example: 'Pune' },
    { key: 'district', required: true, example: 'Pune' },
    { key: 'state', required: true, example: 'Maharashtra' },
    { key: 'pincode', required: true, example: '411001', hint: 'exactly 6 digits' },
    { key: 'status', required: false, example: 'active', hint: 'active | blacklisted | inactive' },
    { key: 'assigned_officer_username', required: false, example: '', hint: 'must exist in users table' },
    { key: 'registered_at', required: false, example: '2024-03-12', hint: 'YYYY-MM-DD' },
  ],
  groups: [
    { key: 'legacy_group_id', required: true, example: 'GRP-001' },
    { key: 'name', required: true, example: 'Saraswati Group' },
    { key: 'leader_legacy_customer_id', required: true, example: 'CUST-007', hint: 'must reference customers file' },
    { key: 'meeting_day', required: true, example: 'monday', hint: 'monday..sunday (lowercase)' },
    { key: 'branch_area', required: true, example: 'Kothrud' },
    { key: 'status', required: false, example: 'active', hint: 'active | inactive | dissolved' },
  ],
  group_members: [
    { key: 'legacy_group_id', required: true, example: 'GRP-001' },
    { key: 'member_legacy_customer_id', required: true, example: 'CUST-008', hint: 'do NOT include the leader (auto-added)' },
    { key: 'joined_at', required: false, example: '2024-05-01', hint: 'YYYY-MM-DD' },
  ],
  loans: [
    { key: 'legacy_loan_id', required: true, example: 'LN-101' },
    { key: 'customer_legacy_customer_id', required: true, example: 'CUST-007' },
    { key: 'group_legacy_id', required: false, example: '', hint: 'only for group loans' },
    { key: 'principal_paise', required: true, example: '1000000', hint: '₹10,000 → 1000000' },
    { key: 'total_interest_paise', required: true, example: '120000' },
    { key: 'total_payable_paise', required: true, example: '1120000' },
    { key: 'tenure_months', required: true, example: '12', hint: 'integer ≥ 1' },
    { key: 'installments_paid_count', required: false, example: '3', hint: '≤ tenure_months' },
    { key: 'emi_paise', required: true, example: '93333' },
    { key: 'purpose', required: true, example: 'business expansion' },
    { key: 'status', required: true, example: 'active', hint: 'active | overdue | closed | foreclosed | defaulted' },
    { key: 'cached_outstanding_paise', required: true, example: '840000', hint: 'TRUSTED — current balance' },
    { key: 'disbursement_date', required: true, example: '2025-01-15' },
    { key: 'first_due_date', required: true, example: '2025-02-15' },
    { key: 'disbursement_mode', required: false, example: 'cash', hint: 'cash | bank_transfer | online' },
  ],
  collections: [
    { key: 'legacy_collection_id', required: true, example: 'COLL-5001', hint: 'unique within file' },
    { key: 'loan_legacy_loan_id', required: true, example: 'LN-101' },
    { key: 'amount_paise', required: true, example: '93333' },
    { key: 'payment_date', required: true, example: '2025-02-15' },
    { key: 'payment_mode', required: true, example: 'cash', hint: 'cash | bank_transfer | online' },
  ],
};

// ────────────────────────────────────────────────────────────────────────────
// Per-domain instruction sheet — what the operator sees on the second tab
// ────────────────────────────────────────────────────────────────────────────

const DOMAIN_INSTRUCTIONS: Record<MigrationDomain, { description: string; notes: string[] }> = {
  customers: {
    description: 'Customers — one row per person. Aadhaar/PAN are stored encrypted with per-record AAD.',
    notes: [
      'legacy_customer_id must be unique within this file (duplicates rejected at dry-run).',
      'pincode must be EXACTLY 6 digits — no padding, no truncation.',
      'gender must be one of: male, female, other.',
      'status defaults to "active" if omitted; allowed: active, blacklisted, inactive.',
      'monthly_income_paise: paise (₹ × 100), integer only, ≤ 9007199254740992.',
    ],
  },
  groups: {
    description: 'Groups — one row per group. The leader is automatically added as the first member.',
    notes: [
      'leader_legacy_customer_id must exist in customers.xlsx.',
      'meeting_day must be lowercase: monday..sunday.',
      'status defaults to "active"; allowed: active, inactive, dissolved.',
    ],
  },
  group_members: {
    description: 'Group members — do NOT include the leader (auto-inserted from groups.xlsx).',
    notes: [
      'Duplicate (legacy_group_id, member_legacy_customer_id) rows are silently deduped at commit.',
      'Differing joined_at on duplicate rows is discarded — only the first row is used.',
    ],
  },
  loans: {
    description: 'Loans — every loan gets a system-generated LN-NNNNNNN number AND a generated EMI schedule.',
    notes: [
      'All *_paise columns must be non-negative integers ≤ 9007199254740992 (no decimals).',
      'tenure_months must be an integer ≥ 1; installments_paid_count ≤ tenure_months.',
      'status (lowercase): active | overdue | closed | foreclosed | defaulted.',
      'cached_outstanding_paise is TRUSTED — it becomes the source of truth for the balance.',
      'EMI schedule is materialised at commit: first_due_date, +1mo (month-end clamped), … for tenure_months total.',
      'disbursement_mode optional; defaults to "cash". Allowed: cash, bank_transfer, online.',
    ],
  },
  collections: {
    description: 'Historical collections — does NOT post journal entries (uses a shared zero-totals JE).',
    notes: [
      'legacy_collection_id must be unique (duplicates collide on the mig:coll:<id> idempotency key).',
      'loan_legacy_loan_id must reference a row in loans.xlsx.',
      'payment_mode (lowercase): cash | bank_transfer | online.',
      'No receipts are generated for migrated collections. Look up by legacy_collection_id if needed later.',
    ],
  },
};
