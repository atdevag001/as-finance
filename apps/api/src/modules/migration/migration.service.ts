import * as crypto from 'crypto';
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
    for (const c of draftCustomers) {
      if (customerByLegacy.has(c.legacy_customer_id)) {
        errors.push({
          domain: 'customers',
          rowIndex: 0,
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
          rowIndex: 0,
          column: 'leader_legacy_customer_id',
          message: `Group ${g.legacy_group_id}: leader ${g.leader_legacy_customer_id} not found in customers file`,
        });
      }
    }

    for (const m of groupMembers) {
      if (!groupByLegacy.has(m.legacy_group_id)) {
        errors.push({
          domain: 'group_members',
          rowIndex: 0,
          column: 'legacy_group_id',
          message: `Member references unknown group ${m.legacy_group_id}`,
        });
      }
      if (!customerByLegacy.has(m.member_legacy_customer_id)) {
        errors.push({
          domain: 'group_members',
          rowIndex: 0,
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
          rowIndex: 0,
          column: 'customer_legacy_customer_id',
          message: `Loan ${l.legacy_loan_id}: customer ${l.customer_legacy_customer_id} not found`,
        });
      }
      if (l.group_legacy_id && !groupByLegacy.has(l.group_legacy_id)) {
        errors.push({
          domain: 'loans',
          rowIndex: 0,
          column: 'group_legacy_id',
          message: `Loan ${l.legacy_loan_id}: group ${l.group_legacy_id} not found`,
        });
      }
    }

    for (const c of draftCollections) {
      if (!loanByLegacy.has(c.loan_legacy_loan_id)) {
        errors.push({
          domain: 'collections',
          rowIndex: 0,
          column: 'loan_legacy_loan_id',
          message: `Collection ${c.legacy_collection_id}: loan ${c.loan_legacy_loan_id} not found`,
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

    // Run everything in one tx with a long timeout + Serializable isolation.
    const result = await this.prisma.$transaction(
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
          gender: String(c.gender).toLowerCase(),
          occupation: c.occupation ? String(c.occupation) : null,
          monthly_income_paise: c.monthly_income_paise ? BigInt(String(c.monthly_income_paise)) : null,
          address_line1: String(c.address_line1),
          address_line2: c.address_line2 ? String(c.address_line2) : null,
          city: String(c.city),
          district: String(c.district),
          state: String(c.state),
          pincode: String(c.pincode).slice(0, 6).padStart(6, '0'),
          status: (c.status ?? 'active') as 'active' | 'blacklisted' | 'inactive',
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
      await tx.groups.create({
        data: {
          id: g.newId,
          legacy_group_id: String(g.legacy_group_id),
          name: String(g.name),
          meeting_day: String(g.meeting_day).toLowerCase() as 'monday',
          branch_area: String(g.branch_area),
          leader_id: leader.newId,
          status: (g.status ?? 'active') as 'active' | 'inactive' | 'dissolved',
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

    for (const m of draft.groupMembers) {
      const key = `${m.legacy_group_id}:${m.member_legacy_customer_id}`;
      if (leaderInsertedFor.has(key)) continue; // already added as leader
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
      const status = String(l.status).toLowerCase();

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
          last_due_date: addMonths(firstDueDate, tenureMonths - 1),
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
      // For each of tenureMonths installments: due_date = firstDueDate + (i*30 days)
      // approximately. For paid installments (first `installmentsPaidCount`),
      // mark fully paid. For the rest, mark pending with the proportional balance.
      const installmentTotalPaise = emiPaise;
      const installmentPrincipal = principalPaise / BigInt(tenureMonths);
      const installmentInterest = totalInterestPaise / BigInt(tenureMonths);
      for (let i = 0; i < tenureMonths; i++) {
        const dueDate = addMonths(firstDueDate, i);
        const isPaid = i < installmentsPaidCount;
        await tx.loan_schedules.create({
          data: {
            loan_id: l.newId,
            installment_number: i + 1,
            due_date: dueDate,
            principal_paise: installmentPrincipal,
            interest_paise: installmentInterest,
            total_paise: installmentTotalPaise,
            principal_paid_paise: isPaid ? installmentPrincipal : 0n,
            interest_paid_paise: isPaid ? installmentInterest : 0n,
            penalty_paid_paise: 0n,
            status: isPaid ? 'paid' : 'pending',
          },
        });
      }

      // 4. disbursements row (idempotent on idempotency_key)
      await tx.disbursements.create({
        data: {
          loan_id: l.newId,
          amount_paise: principalPaise,
          mode: 'cash', // legacy unknown — default to cash
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
      await tx.collections.create({
        data: {
          id: c.newId,
          legacy_collection_id: String(c.legacy_collection_id),
          loan_id: loan.newId,
          amount_paise: BigInt(String(c.amount_paise)),
          payment_date: new Date(String(c.payment_date)),
          payment_mode: String(c.payment_mode).toLowerCase() as 'cash',
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

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
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
  ],
  collections: [
    { key: 'legacy_collection_id', type: 'string', required: true },
    { key: 'loan_legacy_loan_id', type: 'string', required: true },
    { key: 'amount_paise', type: 'number', required: true },
    { key: 'payment_date', type: 'date', required: true },
    { key: 'payment_mode', type: 'string', required: true },
  ],
};
